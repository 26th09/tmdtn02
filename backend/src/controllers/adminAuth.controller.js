import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { sendAdminOtpEmail } from '../lib/mailer.js'
import {
  genOtp,
  hashToken,
  signPurposeToken,
  verifyPurposeToken,
  isPasswordExpired,
  passwordExpiresAt,
  daysUntilExpiry,
  validateAdminPassword,
} from '../lib/adminSecurity.js'

const MAX_ATTEMPTS = 5 // BR-70
const LOCK_MINUTES = 15
const OTP_TTL_MIN = 5
const OTP_MAX_ATTEMPTS = 5

function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, username: admin.username, role: admin.role, aud: 'admin' },
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h' }, // phiên quản trị ngắn hơn Customer
  )
}

async function logAttempt(username, adminId, req, success, reason) {
  try {
    await prisma.adminLoginAttempt.create({ data: { username, adminId, ip: req.ip, success, reason } })
  } catch {
    // không để lỗi ghi log ảnh hưởng luồng đăng nhập
  }
}

// Sinh OTP 2FA, lưu băm + hạn vào Admin và gửi email. Trả về challenge token (bước 2).
async function issueOtpChallenge(admin) {
  const otp = genOtp()
  await prisma.admin.update({
    where: { id: admin.id },
    data: { otpHash: hashToken(otp), otpExpiresAt: new Date(Date.now() + OTP_TTL_MIN * 60000), otpAttempts: 0 },
  })
  // Gửi về email admin; nếu chưa cấu hình SMTP, mailer sẽ log OTP ra console (dev).
  await sendAdminOtpEmail(admin.email || `${admin.username}@local`, { otp }).catch((e) =>
    console.error('Gửi OTP admin thất bại:', e),
  )
  return signPurposeToken('otp', admin.id, `${OTP_TTL_MIN}m`)
}

// Sau khi vượt OTP: nếu mật khẩu hết hạn hoặc buộc đổi -> yêu cầu đổi mật khẩu; ngược lại cấp phiên.
function finishLogin(res, admin) {
  if (admin.mustChangePassword || isPasswordExpired(admin)) {
    return res.json({
      requirePasswordChange: true,
      reason: admin.mustChangePassword ? 'FIRST_LOGIN' : 'EXPIRED',
      changeToken: signPurposeToken('pwchange', admin.id, '15m'),
    })
  }
  const token = signAdminToken(admin)
  return res.json({ token, admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } })
}

// UC-24 (bước 1) – Xác thực tài khoản/mật khẩu. Thành công -> gửi OTP, chưa cấp phiên (2FA bắt buộc).
export async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ message: 'Vui lòng nhập tài khoản và mật khẩu' })

    const admin = await prisma.admin.findUnique({ where: { username } })
    if (!admin) {
      await logAttempt(username, null, req, false, 'not_found')
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' })
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      await logAttempt(username, admin.id, req, false, 'locked')
      const mins = Math.ceil((admin.lockedUntil - new Date()) / 60000)
      return res.status(423).json({ message: `Tài khoản tạm khóa. Vui lòng thử lại sau ${mins} phút.`, code: 'LOCKED' })
    }

    const valid = await bcrypt.compare(password, admin.password)
    if (!valid) {
      const attempts = admin.failedLoginAttempts + 1
      const data = { failedLoginAttempts: attempts }
      let locked = false
      if (attempts >= MAX_ATTEMPTS) {
        data.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000)
        data.failedLoginAttempts = 0
        locked = true
      }
      await prisma.admin.update({ where: { id: admin.id }, data })
      await logAttempt(username, admin.id, req, false, 'wrong_password')
      if (locked) return res.status(423).json({ message: `Sai quá ${MAX_ATTEMPTS} lần. Tài khoản tạm khóa ${LOCK_MINUTES} phút.`, code: 'LOCKED' })
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' })
    }
    if (!admin.active) {
      await logAttempt(username, admin.id, req, false, 'inactive')
      return res.status(403).json({ message: 'Tài khoản không có quyền truy cập khu vực quản trị' })
    }
    // Tài khoản mới chưa kích hoạt: phải dùng liên kết kích hoạt trong email, không đăng nhập thường.
    if (!admin.activated) {
      await logAttempt(username, admin.id, req, false, 'not_activated')
      return res.status(403).json({
        message: 'Tài khoản chưa kích hoạt. Vui lòng mở liên kết kích hoạt đã gửi tới email của bạn.',
        code: 'NOT_ACTIVATED',
      })
    }

    // Mật khẩu đúng: reset bộ đếm, phát OTP 2FA (BR bảo mật admin).
    await prisma.admin.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
    await logAttempt(username, admin.id, req, true, '2fa_pending')
    const challenge = await issueOtpChallenge(admin)
    res.json({ otpRequired: true, challenge, sentTo: maskEmail(admin.email) })
  } catch (err) {
    next(err)
  }
}

// UC-24 (bước 2) – Xác thực OTP 2FA. Thành công -> cấp phiên (hoặc yêu cầu đổi mật khẩu).
export async function adminVerifyOtp(req, res, next) {
  try {
    const { challenge, otp } = req.body
    const payload = verifyPurposeToken(challenge, 'otp')
    if (!payload) return res.status(401).json({ message: 'Phiên xác thực hết hạn, vui lòng đăng nhập lại', code: 'CHALLENGE_EXPIRED' })

    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } })
    if (!admin || !admin.otpHash || !admin.otpExpiresAt) {
      return res.status(401).json({ message: 'Chưa yêu cầu OTP hoặc đã dùng. Vui lòng đăng nhập lại.' })
    }
    if (admin.otpExpiresAt < new Date()) {
      return res.status(410).json({ message: 'Mã OTP đã hết hạn. Vui lòng đăng nhập lại.', code: 'OTP_EXPIRED' })
    }
    if (admin.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await prisma.admin.update({ where: { id: admin.id }, data: { otpHash: null, otpExpiresAt: null } })
      return res.status(429).json({ message: 'Nhập sai OTP quá nhiều lần. Vui lòng đăng nhập lại.' })
    }
    if (!otp || hashToken(String(otp)) !== admin.otpHash) {
      await prisma.admin.update({ where: { id: admin.id }, data: { otpAttempts: { increment: 1 } } })
      return res.status(401).json({ message: 'Mã OTP không đúng' })
    }

    // Đúng OTP: vô hiệu OTP đã dùng.
    await prisma.admin.update({ where: { id: admin.id }, data: { otpHash: null, otpExpiresAt: null, otpAttempts: 0 } })
    await logAttempt(admin.username, admin.id, req, true, '2fa_ok')
    return finishLogin(res, admin)
  } catch (err) {
    next(err)
  }
}

// Lấy ngữ cảnh kích hoạt (prefill username) từ token trong email — không tiêu thụ token.
export async function adminActivationContext(req, res, next) {
  try {
    const token = String(req.params.token || '')
    const admin = await prisma.admin.findFirst({ where: { activationTokenHash: hashToken(token) } })
    if (!admin || !admin.activationExpiresAt || admin.activationExpiresAt < new Date()) {
      return res.status(404).json({ message: 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn' })
    }
    res.json({ username: admin.username, email: maskEmail(admin.email) })
  } catch (err) {
    next(err)
  }
}

// Kích hoạt lần đầu: nhập lại tài khoản + mật khẩu tạm -> phát OTP (sau đó buộc đổi mật khẩu).
export async function adminActivate(req, res, next) {
  try {
    const { token, username, password } = req.body
    if (!token || !username || !password) return res.status(400).json({ message: 'Thiếu thông tin kích hoạt' })

    const admin = await prisma.admin.findFirst({ where: { activationTokenHash: hashToken(token) } })
    if (!admin || !admin.activationExpiresAt || admin.activationExpiresAt < new Date()) {
      return res.status(404).json({ message: 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn' })
    }
    if (admin.activated) return res.status(409).json({ message: 'Tài khoản đã được kích hoạt. Vui lòng đăng nhập bình thường.' })
    if (username !== admin.username || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu tạm không đúng' })
    }
    if (!admin.active) return res.status(403).json({ message: 'Tài khoản không có quyền truy cập khu vực quản trị' })

    const challenge = await issueOtpChallenge(admin)
    res.json({ otpRequired: true, challenge, sentTo: maskEmail(admin.email) })
  } catch (err) {
    next(err)
  }
}

// Đổi mật khẩu (lần đầu / khi hết hạn) bằng changeToken nhận sau khi vượt OTP.
export async function adminChangePassword(req, res, next) {
  try {
    const { changeToken, newPassword } = req.body
    const payload = verifyPurposeToken(changeToken, 'pwchange')
    if (!payload) return res.status(401).json({ message: 'Phiên đổi mật khẩu hết hạn, vui lòng đăng nhập lại' })

    const issue = validateAdminPassword(newPassword)
    if (issue) return res.status(400).json({ message: issue })

    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } })
    if (!admin) return res.status(404).json({ message: 'Không tìm thấy tài khoản' })
    // Không cho đặt lại trùng mật khẩu cũ.
    if (await bcrypt.compare(newPassword, admin.password)) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại' })
    }

    const updated = await prisma.admin.update({
      where: { id: admin.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        activated: true,
        expiryReminderStage: 0,
        activationTokenHash: null,
        activationExpiresAt: null,
      },
    })
    const token = signAdminToken(updated)
    res.json({ token, admin: { id: updated.id, username: updated.username, name: updated.name, role: updated.role } })
  } catch (err) {
    next(err)
  }
}

// Thông tin quản trị viên hiện tại + trạng thái hạn mật khẩu (khôi phục phiên khi tải lại /admin).
export async function adminMe(req, res, next) {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.sub },
      select: { id: true, username: true, name: true, role: true, active: true, email: true, passwordChangedAt: true },
    })
    if (!admin || !admin.active) return res.status(401).json({ message: 'Phiên quản trị không hợp lệ' })
    res.json({
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, email: admin.email },
      password: { expiresAt: passwordExpiresAt(admin.passwordChangedAt), daysLeft: daysUntilExpiry(admin) },
    })
  } catch (err) {
    next(err)
  }
}

function maskEmail(email) {
  if (!email) return null
  const [u, d] = String(email).split('@')
  if (!d) return email
  const head = u.length <= 2 ? u[0] || '' : u.slice(0, 2)
  return `${head}***@${d}`
}

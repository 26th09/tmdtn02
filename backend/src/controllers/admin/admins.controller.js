import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { genToken, hashToken, daysUntilExpiry } from '../../lib/adminSecurity.js'
import { sendAdminCredentialsEmail } from '../../lib/mailer.js'

const ACTIVATION_TTL_HOURS = 48

// Mật khẩu tạm dễ gõ nhưng đủ mạnh (có chữ + số, >= 8 ký tự) để qua kiểm tra.
function genTempPassword() {
  return 'St' + crypto.randomBytes(3).toString('hex') + crypto.randomInt(100, 999)
}

const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Danh sách quản trị viên (chỉ SUPER_ADMIN).
export async function listAdmins(req, res, next) {
  try {
    const rows = await prisma.admin.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, username: true, email: true, name: true, role: true, active: true,
        activated: true, mustChangePassword: true, passwordChangedAt: true, createdAt: true,
      },
    })
    const items = rows.map((a) => ({ ...a, passwordDaysLeft: daysUntilExpiry(a) }))
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

// Tạo tài khoản admin mới (chỉ SUPER_ADMIN). Gửi mail tài khoản + mật khẩu tạm + link kích hoạt.
export async function createAdmin(req, res, next) {
  try {
    const username = str(req.body.username)
    const email = str(req.body.email)
    const name = str(req.body.name)
    const role = req.body.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'MANAGER'
    if (!username) return res.status(400).json({ message: 'Thiếu tên đăng nhập' })
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email không hợp lệ (cần để gửi thông tin đăng nhập)' })
    if (await prisma.admin.findUnique({ where: { username } })) return res.status(409).json({ message: 'Tên đăng nhập đã tồn tại' })
    if (await prisma.admin.findUnique({ where: { email } })) return res.status(409).json({ message: 'Email đã được dùng cho tài khoản khác' })

    const tempPassword = genTempPassword()
    const rawToken = genToken()
    const admin = await prisma.admin.create({
      data: {
        username, email, name, role,
        password: await bcrypt.hash(tempPassword, 10),
        active: true,
        activated: false, // phải kích hoạt lần đầu qua link
        mustChangePassword: true, // buộc đặt mật khẩu mới khi kích hoạt
        activationTokenHash: hashToken(rawToken),
        activationExpiresAt: new Date(Date.now() + ACTIVATION_TTL_HOURS * 3600000),
      },
    })

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
    const activationUrl = `${clientUrl}/admin/activate?token=${rawToken}`
    await sendAdminCredentialsEmail(email, { username, name, tempPassword, activationUrl }).catch((e) =>
      console.error('Gửi email tài khoản admin thất bại:', e),
    )
    await logAdminAction(req.admin.sub, 'admin.create', { entityType: 'Admin', entityId: admin.id, detail: { username, role } })

    res.status(201).json({ item: { id: admin.id, username, email, name, role, active: true, activated: false } })
  } catch (err) {
    next(err)
  }
}

// Gửi lại email kích hoạt (sinh token mới). Chỉ với tài khoản chưa kích hoạt.
export async function resendActivation(req, res, next) {
  try {
    const id = Number(req.params.id)
    const admin = await prisma.admin.findUnique({ where: { id } })
    if (!admin) return res.status(404).json({ message: 'Không tìm thấy tài khoản' })
    if (admin.activated) return res.status(409).json({ message: 'Tài khoản đã kích hoạt' })
    if (!admin.email) return res.status(422).json({ message: 'Tài khoản chưa có email' })

    const tempPassword = genTempPassword()
    const rawToken = genToken()
    await prisma.admin.update({
      where: { id },
      data: {
        password: await bcrypt.hash(tempPassword, 10),
        activationTokenHash: hashToken(rawToken),
        activationExpiresAt: new Date(Date.now() + ACTIVATION_TTL_HOURS * 3600000),
      },
    })
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
    const activationUrl = `${clientUrl}/admin/activate?token=${rawToken}`
    await sendAdminCredentialsEmail(admin.email, { username: admin.username, name: admin.name, tempPassword, activationUrl }).catch((e) =>
      console.error('Gửi lại email kích hoạt thất bại:', e),
    )
    await logAdminAction(req.admin.sub, 'admin.resend_activation', { entityType: 'Admin', entityId: id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// Khóa/mở khóa tài khoản admin. Không cho tự khóa chính mình.
export async function setAdminActive(req, res, next) {
  try {
    const id = Number(req.params.id)
    const active = Boolean(req.body.active)
    if (id === req.admin.sub) return res.status(400).json({ message: 'Không thể tự khóa tài khoản của chính bạn' })
    const admin = await prisma.admin.findUnique({ where: { id } })
    if (!admin) return res.status(404).json({ message: 'Không tìm thấy tài khoản' })

    // Không để mất SUPER_ADMIN đang hoạt động cuối cùng.
    if (!active && admin.role === 'SUPER_ADMIN') {
      const others = await prisma.admin.count({ where: { role: 'SUPER_ADMIN', active: true, id: { not: id } } })
      if (others === 0) return res.status(400).json({ message: 'Không thể khóa SUPER_ADMIN đang hoạt động cuối cùng' })
    }
    await prisma.admin.update({ where: { id }, data: { active } })
    await logAdminAction(req.admin.sub, active ? 'admin.enable' : 'admin.disable', { entityType: 'Admin', entityId: id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

import crypto from 'crypto'
import jwt from 'jsonwebtoken'

// Hạn mật khẩu quản trị: đổi định kỳ mỗi 30 ngày (BR bảo mật admin).
export const PASSWORD_MAX_AGE_DAYS = 30
// Mốc nhắc trước khi hết hạn (ngày) — khớp stage 1/2/3.
export const REMINDER_DAYS = [7, 3, 1]

const secret = () => process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET

export function genToken() {
  return crypto.randomBytes(32).toString('hex')
}
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}
export function genOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

// Token mục đích ngắn hạn (challenge OTP / đổi mật khẩu / kích hoạt) — JWT có trường `purpose`.
export function signPurposeToken(purpose, adminId, expiresIn = '10m') {
  return jwt.sign({ sub: adminId, purpose, aud: 'admin' }, secret(), { expiresIn })
}
export function verifyPurposeToken(token, purpose) {
  try {
    const payload = jwt.verify(String(token), secret())
    if (payload.purpose !== purpose || payload.aud !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

export function passwordExpiresAt(passwordChangedAt) {
  const base = passwordChangedAt ? new Date(passwordChangedAt) : new Date()
  return new Date(base.getTime() + PASSWORD_MAX_AGE_DAYS * 86400000)
}
export function isPasswordExpired(admin) {
  return passwordExpiresAt(admin.passwordChangedAt).getTime() <= Date.now()
}
// Số ngày còn lại tới hạn (làm tròn lên).
export function daysUntilExpiry(admin) {
  const ms = passwordExpiresAt(admin.passwordChangedAt).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

// Kiểm tra độ mạnh mật khẩu admin tối thiểu.
export function validateAdminPassword(pw) {
  const s = String(pw || '')
  if (s.length < 8) return 'Mật khẩu phải từ 8 ký tự trở lên'
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Mật khẩu phải gồm cả chữ và số'
  return null
}

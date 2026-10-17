import jwt from 'jsonwebtoken'

// UC-24 (BR-67) – Xác thực quản trị viên hoàn toàn tách biệt với authenticate() của Customer:
// dùng secret riêng (ADMIN_JWT_SECRET) nên token của bên này không thể dùng lẫn cho bên kia.
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Thiếu hoặc sai định dạng token quản trị' })
  }
  const token = header.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET)
    if (payload.aud !== 'admin') {
      return res.status(403).json({ message: 'Token không hợp lệ cho khu vực quản trị' }) // BR-68
    }
    // Chặn token mục đích ngắn hạn (challenge OTP / đổi mật khẩu) dùng làm token phiên -> giữ 2FA bắt buộc.
    if (payload.purpose) {
      return res.status(401).json({ message: 'Token chưa hoàn tất xác thực 2 yếu tố' })
    }
    req.admin = payload
    next()
  } catch {
    return res.status(401).json({ message: 'Token quản trị không hợp lệ hoặc đã hết hạn' })
  }
}

// BR-68 (RBAC): chỉ vai trò được liệt kê mới được thực hiện thao tác.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' })
    }
    next()
  }
}

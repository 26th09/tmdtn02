import { Router } from 'express'
import {
  adminLogin,
  adminVerifyOtp,
  adminActivationContext,
  adminActivate,
  adminChangePassword,
  adminMe,
} from '../controllers/adminAuth.controller.js'
import { requireAdmin } from '../middleware/adminAuth.middleware.js'

const router = Router()

// UC-24 – Đăng nhập quản trị (2FA bắt buộc), tách biệt khỏi /api/auth (Customer).
router.post('/login', adminLogin) // bước 1: tài khoản + mật khẩu -> gửi OTP
router.post('/verify-otp', adminVerifyOtp) // bước 2: xác thực OTP -> cấp phiên / yêu cầu đổi MK
router.post('/change-password', adminChangePassword) // đổi mật khẩu (lần đầu / hết hạn)
router.get('/activate/:token', adminActivationContext) // ngữ cảnh kích hoạt lần đầu
router.post('/activate', adminActivate) // kích hoạt lần đầu -> gửi OTP
router.get('/me', requireAdmin, adminMe)
// Đăng xuất: JWT không trạng thái, phía client chỉ cần xóa token.

export default router

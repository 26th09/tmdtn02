import { Router } from 'express'
import { listAdmins, createAdmin, resendActivation, setAdminActive } from '../../controllers/admin/admins.controller.js'
import { requireAdmin, requireRole } from '../../middleware/adminAuth.middleware.js'

const router = Router()

// Quản lý tài khoản admin: chỉ SUPER_ADMIN (không có đăng ký công khai — tạo từ trong hệ thống).
router.use(requireAdmin, requireRole('SUPER_ADMIN'))

router.get('/', listAdmins)
router.post('/', createAdmin)
router.post('/:id/resend-activation', resendActivation)
router.patch('/:id/active', setAdminActive)

export default router

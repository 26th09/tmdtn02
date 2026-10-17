import { Router } from 'express'
import { getCustomer, listCustomers, setCustomerLock } from '../../controllers/admin/users.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()

// UC-19 «include» UC-24: mọi route bên dưới yêu cầu đã đăng nhập quản trị (BR-96).
router.use(requireAdmin)

// Khách hàng: MANAGER và SUPER_ADMIN đều được quản lý.
router.get('/customers', listCustomers)
router.get('/customers/:id', getCustomer)
router.patch('/customers/:id/lock', setCustomerLock)

// Tài khoản quản trị quản lý riêng tại /api/admin/admins theo luồng bảo mật (email + kích hoạt + 2FA),
// không còn tạo admin bằng mật khẩu trực tiếp ở đây.

export default router

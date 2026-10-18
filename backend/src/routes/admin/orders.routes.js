import { Router } from 'express'
import { bulkUpdateOrderStatus, getOrder, listOrders, processRefund, setOrderPayment, updateOrderStatus } from '../../controllers/admin/orders.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()

// UC-18 «include» UC-24: mọi route bên dưới yêu cầu đã đăng nhập quản trị (BR-89).
router.use(requireAdmin)

router.get('/', listOrders)
// Nhập Excel: cập nhật trạng thái hàng loạt — đặt trước /:code để không bị nuốt thành mã đơn.
router.post('/bulk-status', bulkUpdateOrderStatus)
router.get('/:code', getOrder)
router.patch('/:code/status', updateOrderStatus)
router.patch('/:code/payment', setOrderPayment)
router.post('/:code/refunds/:refundId/process', processRefund)

export default router

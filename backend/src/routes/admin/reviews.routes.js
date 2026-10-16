import { Router } from 'express'
import { approveReview, listReviews, rejectReview, replyReview } from '../../controllers/admin/reviews.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()

// UC-21 «include» UC-24: mọi route bên dưới yêu cầu đã đăng nhập quản trị (BR-107).
router.use(requireAdmin)

router.get('/', listReviews)
router.patch('/:id/approve', approveReview)
router.patch('/:id/reject', rejectReview)
router.post('/:id/reply', replyReview)

export default router

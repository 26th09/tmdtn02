import { Router } from 'express'
import { listSubscribers, setSubscriberStatus, deleteSubscriber } from '../../controllers/admin/newsletter.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()
router.use(requireAdmin)

router.get('/', listSubscribers)
router.patch('/:id/status', setSubscriberStatus)
router.delete('/:id', deleteSubscriber)

export default router

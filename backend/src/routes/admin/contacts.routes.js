import { Router } from 'express'
import { listContacts, getContact, setContactStatus, replyContact, listSentReplies } from '../../controllers/admin/contacts.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'
import { uploadAttachments } from '../../lib/uploads.js'

const router = Router()
router.use(requireAdmin)

router.get('/', listContacts)
router.get('/sent', listSentReplies) // đặt trước /:id
router.get('/:id', getContact)
router.patch('/:id/status', setContactStatus)
router.post('/:id/reply', uploadAttachments.array('files', 5), replyContact)

export default router

import { Router } from 'express'
import { submitContact } from '../controllers/contact.controller.js'

const router = Router()
// Công khai: khách hàng / đối tác gửi liên hệ.
router.post('/', submitContact)
export default router

import { Router } from 'express'
import { subscribeNewsletter } from '../controllers/newsletter.controller.js'

const router = Router()
// Công khai: đăng ký nhận email khuyến mãi (ô ở footer trang khách).
router.post('/subscribe', subscribeNewsletter)
export default router

import { Router } from 'express'
import {
  createPayment,
  getPaymentStatus,
  paymentConfig,
  vnpayReturn,
  stripePreAuth,
  stripeConfirm,
} from '../controllers/payments.controller.js'
import { optionalAuth } from '../middleware/auth.middleware.js'

const router = Router()

// UC-11 – công khai (hỗ trợ guest); VNPAY return là callback từ cổng.
router.get('/config', paymentConfig)
router.get('/vnpay-return', vnpayReturn)
router.get('/status/:code', getPaymentStatus)
router.post('/create', optionalAuth, createPayment)
// Luồng 1 — Stripe pre-authorization (giữ thẻ bảo lãnh).
router.post('/stripe/pre-auth', optionalAuth, stripePreAuth)
router.post('/stripe/confirm', optionalAuth, stripeConfirm)

export default router

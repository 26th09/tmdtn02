import Stripe from 'stripe'

// Luồng 1 — "Trả sau 0đ": thu thẻ bằng Stripe PRE-AUTHORIZATION (capture_method='manual').
// Hệ thống giữ (đóng băng) một khoản trên thẻ để chống bùng, KHÔNG trừ tiền; khi khách đi/nhận
// phòng thì HDV/điều hành thu tiền (hoặc capture khoản phạt no-show). Thiếu cấu hình -> tắt nhẹ nhàng.
const SECRET = process.env.STRIPE_SECRET_KEY || ''
const PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY || ''

const stripe = SECRET ? new Stripe(SECRET) : null

export function isStripeConfigured() {
  return Boolean(SECRET && PUBLISHABLE)
}

export function stripePublishableKey() {
  return PUBLISHABLE
}

// VND là tiền tệ "zero-decimal" của Stripe: amount truyền nguyên số đồng (không nhân 100).
// Số tiền giữ mặc định do controller quyết (1 đêm / 1 vé); có thể ép qua STRIPE_HOLD_AMOUNT.
export function holdAmountOverride() {
  const v = Number(process.env.STRIPE_HOLD_AMOUNT)
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

// Tạo PaymentIntent giữ tiền (manual capture). Trả clientSecret để frontend xác nhận thẻ.
export async function createPreAuthIntent({ amount, metadata }) {
  if (!stripe) throw new Error('Stripe chưa được cấu hình')
  return stripe.paymentIntents.create({
    amount,
    currency: 'vnd',
    capture_method: 'manual', // giữ tiền, chưa trừ
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: metadata || {},
  })
}

export async function retrieveIntent(id) {
  if (!stripe) throw new Error('Stripe chưa được cấu hình')
  return stripe.paymentIntents.retrieve(id)
}

// Trừ thật khoản đã giữ (khi khách không tới - no-show, hoặc thu phần phạt).
export async function capturePreAuth(id, amountToCapture) {
  if (!stripe) throw new Error('Stripe chưa được cấu hình')
  return stripe.paymentIntents.capture(id, amountToCapture ? { amount_to_capture: amountToCapture } : undefined)
}

// Nhả khoản đã giữ (khách thanh toán bình thường/hoàn tất) -> không trừ đồng nào.
export async function cancelPreAuth(id) {
  if (!stripe) throw new Error('Stripe chưa được cấu hình')
  return stripe.paymentIntents.cancel(id)
}

export function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) throw new Error('Stripe webhook chưa được cấu hình')
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

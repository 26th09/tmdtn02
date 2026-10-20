import { prisma } from '../lib/prisma.js'
import { sendPromoSubscribeEmail } from '../lib/mailer.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Công khai: khách đăng ký nhận email khuyến mãi từ ô ở footer trang khách.
// Lưu vào bảng NewsletterSubscriber (quản lý trong mục CSKH) + gửi email chào mừng.
export async function subscribeNewsletter(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Email không hợp lệ' })

    const source = req.body?.source ? String(req.body.source).trim().slice(0, 50) : 'footer'
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } })

    // Đã đăng ký và đang nhận -> không tạo trùng, báo thân thiện (không gửi lại mail).
    if (existing && existing.status === 'SUBSCRIBED') {
      return res.json({ message: 'Email này đã đăng ký nhận ưu đãi rồi. Cảm ơn bạn!' })
    }

    // Mới hoàn toàn, hoặc từng hủy nay đăng ký lại.
    if (existing) {
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { status: 'SUBSCRIBED', unsubscribedAt: null, source },
      })
    } else {
      await prisma.newsletterSubscriber.create({ data: { email, source } })
    }

    // Gửi email chào mừng. Không chặn luồng nếu SMTP lỗi: bản ghi đã lưu, chỉ ghi log để xử lý sau.
    let emailSent = true
    try {
      await sendPromoSubscribeEmail(email)
    } catch (e) {
      emailSent = false
      console.error('Gửi email chào mừng đăng ký nhận ưu đãi thất bại:', e)
    }

    res.status(201).json({
      message: emailSent
        ? 'Đăng ký thành công! Vui lòng kiểm tra email xác nhận.'
        : 'Đăng ký thành công! (Email xác nhận sẽ được gửi sau)',
    })
  } catch (err) {
    next(err)
  }
}

import { prisma } from '../lib/prisma.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Khách hàng / đối tác gửi liên hệ (công khai, không cần đăng nhập).
export async function submitContact(req, res, next) {
  try {
    const { type, name, email, phone, subject, body, bookingCode } = req.body
    if (!name || !email || !body) return res.status(400).json({ message: 'Vui lòng nhập họ tên, email và nội dung' })
    if (!EMAIL_RE.test(String(email))) return res.status(400).json({ message: 'Email không hợp lệ' })
    if (String(body).length > 5000) return res.status(400).json({ message: 'Nội dung quá dài (tối đa 5000 ký tự)' })

    // Luồng hỗ trợ đơn: kiểm tra mã đơn tồn tại (nếu khách nhập).
    let linkedCode = null
    if (bookingCode && String(bookingCode).trim()) {
      const code = String(bookingCode).trim()
      const booking = await prisma.booking.findUnique({ where: { code }, select: { code: true } })
      if (!booking) return res.status(404).json({ message: 'Không tìm thấy mã đơn này. Vui lòng kiểm tra lại.' })
      linkedCode = booking.code
    }

    await prisma.contactMessage.create({
      data: {
        type: type === 'PARTNER' ? 'PARTNER' : 'CUSTOMER',
        name: String(name).trim(),
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : null,
        subject: subject ? String(subject).trim() : null,
        body: String(body).trim(),
        bookingCode: linkedCode,
      },
    })
    res.status(201).json({ message: 'Đã gửi liên hệ. Bộ phận CSKH sẽ phản hồi qua email sớm nhất.' })
  } catch (err) {
    next(err)
  }
}

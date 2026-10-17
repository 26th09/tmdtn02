import { prisma } from '../lib/prisma.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Khách hàng / đối tác gửi liên hệ (công khai, không cần đăng nhập).
export async function submitContact(req, res, next) {
  try {
    const { type, name, email, phone, subject, body } = req.body
    if (!name || !email || !body) return res.status(400).json({ message: 'Vui lòng nhập họ tên, email và nội dung' })
    if (!EMAIL_RE.test(String(email))) return res.status(400).json({ message: 'Email không hợp lệ' })
    if (String(body).length > 5000) return res.status(400).json({ message: 'Nội dung quá dài (tối đa 5000 ký tự)' })

    await prisma.contactMessage.create({
      data: {
        type: type === 'PARTNER' ? 'PARTNER' : 'CUSTOMER',
        name: String(name).trim(),
        email: String(email).trim(),
        phone: phone ? String(phone).trim() : null,
        subject: subject ? String(subject).trim() : null,
        body: String(body).trim(),
      },
    })
    res.status(201).json({ message: 'Đã gửi liên hệ. Bộ phận CSKH sẽ phản hồi qua email sớm nhất.' })
  } catch (err) {
    next(err)
  }
}

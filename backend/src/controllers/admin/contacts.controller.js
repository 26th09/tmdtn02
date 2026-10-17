import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { sendContactReplyEmail } from '../../lib/mailer.js'
import { publicUploadUrl, uploadDiskPath } from '../../lib/uploads.js'

// Danh sách tin nhắn liên hệ (lọc theo trạng thái) + số lượng chưa đọc để hiện badge.
export async function listContacts(req, res, next) {
  try {
    const { status, type } = req.query
    const where = {}
    if (['UNREAD', 'READ', 'REPLIED', 'ARCHIVED'].includes(status)) where.status = status
    if (status === 'INBOX') where.status = { in: ['UNREAD', 'READ'] } // hộp thư chính (chưa/đã đọc, chưa trả lời)
    if (['CUSTOMER', 'PARTNER'].includes(type)) where.type = type

    const [items, unread, total, replied] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: { _count: { select: { replies: true } } },
      }),
      prisma.contactMessage.count({ where: { status: 'UNREAD' } }),
      prisma.contactMessage.count(),
      prisma.contactMessage.count({ where: { status: 'REPLIED' } }),
    ])
    res.json({ items, counts: { unread, total, replied } })
  } catch (err) {
    next(err)
  }
}

// Chi tiết một tin nhắn + lịch sử trả lời; tự đánh dấu ĐÃ ĐỌC nếu đang chưa đọc.
export async function getContact(req, res, next) {
  try {
    const id = Number(req.params.id)
    const msg = await prisma.contactMessage.findUnique({
      where: { id },
      include: { replies: { orderBy: { sentAt: 'asc' } } },
    })
    if (!msg) return res.status(404).json({ message: 'Không tìm thấy tin nhắn' })
    if (msg.status === 'UNREAD') {
      await prisma.contactMessage.update({ where: { id }, data: { status: 'READ', readAt: new Date() } })
      msg.status = 'READ'
      msg.readAt = new Date()
    }
    res.json({ item: msg })
  } catch (err) {
    next(err)
  }
}

// Đổi trạng thái (đánh dấu chưa đọc / đã đọc / lưu trữ).
export async function setContactStatus(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['UNREAD', 'READ', 'ARCHIVED'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    const existing = await prisma.contactMessage.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy tin nhắn' })
    const data = { status }
    if (status === 'READ' && !existing.readAt) data.readAt = new Date()
    const item = await prisma.contactMessage.update({ where: { id }, data })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

// Trả lời khách qua email (có thể kèm ảnh/PDF/CSV). Lưu lịch sử để theo dõi; đánh dấu ĐÃ TRẢ LỜI.
export async function replyContact(req, res, next) {
  try {
    const id = Number(req.params.id)
    const body = String(req.body?.body || '').trim()
    const files = req.files || []
    if (!body) return res.status(400).json({ message: 'Vui lòng nhập nội dung trả lời' })

    const msg = await prisma.contactMessage.findUnique({ where: { id } })
    if (!msg) return res.status(404).json({ message: 'Không tìm thấy tin nhắn' })

    // Đính kèm cho email (theo path) + để lưu trữ (url + tên gốc + loại).
    const mailAttachments = files.map((f) => ({ filename: f.originalname, path: uploadDiskPath(f.filename) }))
    const storedAttachments = files.map((f) => ({ url: publicUploadUrl(f.filename), name: f.originalname, type: f.mimetype }))

    try {
      await sendContactReplyEmail(msg.email, {
        name: msg.name,
        subject: msg.subject,
        body,
        originalBody: msg.body,
        attachments: mailAttachments,
      })
    } catch (e) {
      console.error('Gửi email trả lời liên hệ thất bại:', e)
      return res.status(502).json({ message: 'Không gửi được email. Vui lòng kiểm tra cấu hình SMTP và thử lại.' })
    }

    const reply = await prisma.contactReply.create({
      data: {
        messageId: id,
        adminId: req.admin.sub,
        body,
        attachments: storedAttachments.length ? storedAttachments : undefined,
        toEmail: msg.email,
      },
    })
    await prisma.contactMessage.update({ where: { id }, data: { status: 'REPLIED', repliedAt: new Date() } })
    await logAdminAction(req.admin.sub, 'contact.reply', { entityType: 'ContactMessage', entityId: id, detail: { to: msg.email, files: files.length } })
    res.status(201).json({ reply })
  } catch (err) {
    next(err)
  }
}

// Phần "Đã gửi": lịch sử các email trả lời đã gửi (để theo dõi liên lạc qua mail).
export async function listSentReplies(req, res, next) {
  try {
    const rows = await prisma.contactReply.findMany({
      orderBy: { sentAt: 'desc' },
      take: 300,
      include: { message: { select: { id: true, name: true, email: true, subject: true, type: true } } },
    })
    res.json({ items: rows })
  } catch (err) {
    next(err)
  }
}

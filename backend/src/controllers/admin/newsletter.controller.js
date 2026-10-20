import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'

// Danh sách người đăng ký nhận ưu đãi (lọc theo trạng thái) + số lượng để hiện badge.
export async function listSubscribers(req, res, next) {
  try {
    const { status } = req.query
    const where = {}
    if (['SUBSCRIBED', 'UNSUBSCRIBED'].includes(status)) where.status = status

    const [items, subscribed, total] = await Promise.all([
      prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.newsletterSubscriber.count({ where: { status: 'SUBSCRIBED' } }),
      prisma.newsletterSubscriber.count(),
    ])
    res.json({ items, counts: { subscribed, total } })
  } catch (err) {
    next(err)
  }
}

// Đổi trạng thái nhận ưu đãi (hủy / khôi phục).
export async function setSubscriberStatus(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['SUBSCRIBED', 'UNSUBSCRIBED'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy người đăng ký' })

    const item = await prisma.newsletterSubscriber.update({
      where: { id },
      data: { status, unsubscribedAt: status === 'UNSUBSCRIBED' ? new Date() : null },
    })
    await logAdminAction(req.admin.sub, 'newsletter.status', { entityType: 'NewsletterSubscriber', entityId: id, detail: { email: existing.email, status } })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

// Xóa hẳn một người đăng ký khỏi danh sách.
export async function deleteSubscriber(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy người đăng ký' })
    await prisma.newsletterSubscriber.delete({ where: { id } })
    await logAdminAction(req.admin.sub, 'newsletter.delete', { entityType: 'NewsletterSubscriber', entityId: id, detail: { email: existing.email } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

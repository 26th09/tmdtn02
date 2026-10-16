import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { recomputeTourRating, recomputePropertyRating } from '../../lib/review.js'
import { sendReviewReplyEmail } from '../../lib/mailer.js'

// Chuẩn hóa một bản ghi đánh giá cho giao diện quản trị:
// gộp tên sản phẩm (homestay/tour) + người đánh giá + đơn hàng liên kết + email liên hệ.
function toAdminReview(r) {
  const b = r.booking
  return {
    id: r.id,
    productId: r.productId,
    bookingId: r.bookingId,
    authorName: r.authorName,
    rating: r.rating,
    comment: r.comment,
    approved: r.approved,
    rejected: r.rejected,
    replyText: r.replyText,
    repliedAt: r.repliedAt,
    createdAt: r.createdAt,
    product: r.tour ? { name: r.tour.title, slug: r.tour.slug } : r.property,
    // Người đánh giá & đơn mua liên kết (để tham chiếu + phản hồi qua email).
    reviewer: {
      name: b?.user?.name || b?.guestName || r.authorName,
      email: b?.user?.email || b?.guestEmail || null,
      isGuest: b ? !b.userId : null, // guest (qua token 1 lần) hay khách đã đăng nhập
    },
    booking: b
      ? { code: b.code, type: b.type, guestName: b.guestName, guestEmail: b.guestEmail }
      : null,
  }
}

// UC-21 – Danh sách đánh giá kèm bộ lọc trạng thái.
// Mặc định không còn hàng chờ kiểm duyệt (đánh giá mới đăng trực tiếp); bộ lọc vẫn giữ để
// xem lại các đánh giá bị ẩn (REJECTED) hoặc toàn bộ.
export async function listReviews(req, res, next) {
  try {
    const { status } = req.query
    const where = {}
    if (status === 'PENDING') {
      where.approved = false
      where.rejected = false
    } else if (status === 'APPROVED') {
      where.approved = true
    } else if (status === 'REJECTED') {
      where.rejected = true
    }

    const rows = await prisma.review.findMany({
      where,
      include: {
        property: { select: { name: true, slug: true } },
        tour: { select: { title: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        booking: {
          select: {
            code: true,
            type: true,
            userId: true,
            guestName: true,
            guestEmail: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const items = rows.map((r) => ({ ...toAdminReview(r), images: r.images }))
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

// UC-21 (3) – Hiện lại một đánh giá đã bị ẩn (hoặc duyệt thủ công nếu còn ở trạng thái chờ cũ).
export async function approveReview(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.review.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy đánh giá' })

    const item = await prisma.review.update({ where: { id }, data: { approved: true, rejected: false } })
    await recomputeTourRating(existing.tourId)
    await recomputePropertyRating(existing.propertyId)
    await logAdminAction(req.admin.sub, 'review.approve', {
      entityType: 'Review',
      entityId: id,
      detail: { propertyId: existing.propertyId, tourId: existing.tourId },
    })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

// UC-21 (3/3a) – Ẩn đánh giá vi phạm (gỡ khỏi trang công khai và khỏi điểm trung bình).
export async function rejectReview(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.review.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy đánh giá' })

    const wasApproved = existing.approved
    const item = await prisma.review.update({ where: { id }, data: { approved: false, rejected: true } })
    await recomputeTourRating(existing.tourId)
    await recomputePropertyRating(existing.propertyId)
    await logAdminAction(req.admin.sub, wasApproved ? 'review.hide' : 'review.reject', {
      entityType: 'Review',
      entityId: id,
      detail: { propertyId: existing.propertyId, tourId: existing.tourId },
    })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

// Phản hồi khách hàng cho một đánh giá: gửi email trực tiếp + lưu nội dung phản hồi.
export async function replyReview(req, res, next) {
  try {
    const id = Number(req.params.id)
    const message = String(req.body?.message || '').trim()
    if (!message) return res.status(400).json({ message: 'Vui lòng nhập nội dung phản hồi' })
    if (message.length > 2000) return res.status(400).json({ message: 'Nội dung phản hồi quá dài (tối đa 2000 ký tự)' })

    const review = await prisma.review.findUnique({
      where: { id },
      include: {
        property: { select: { name: true } },
        tour: { select: { title: true } },
        booking: { select: { code: true, guestEmail: true, user: { select: { email: true } } } },
      },
    })
    if (!review) return res.status(404).json({ message: 'Không tìm thấy đánh giá' })

    const to = review.booking?.user?.email || review.booking?.guestEmail
    if (!to) return res.status(422).json({ message: 'Đánh giá này không có email khách hàng để gửi phản hồi' })

    const productName = review.tour?.title || review.property?.name || ''
    try {
      await sendReviewReplyEmail(to, {
        authorName: review.authorName,
        productName,
        code: review.booking?.code || null,
        rating: review.rating,
        comment: review.comment,
        reply: message,
      })
    } catch (e) {
      console.error('Gửi email phản hồi đánh giá thất bại:', e)
      return res.status(502).json({ message: 'Không gửi được email phản hồi. Vui lòng kiểm tra cấu hình SMTP và thử lại.' })
    }

    const item = await prisma.review.update({
      where: { id },
      data: { replyText: message, repliedAt: new Date() },
    })
    await logAdminAction(req.admin.sub, 'review.reply', {
      entityType: 'Review',
      entityId: id,
      detail: { to, bookingCode: review.booking?.code },
    })
    res.json({ item: { id: item.id, replyText: item.replyText, repliedAt: item.repliedAt }, sentTo: to })
  } catch (err) {
    next(err)
  }
}

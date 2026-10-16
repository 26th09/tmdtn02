import { prisma } from '../lib/prisma.js'
import { maybeCompleteBooking } from '../lib/booking.js'
import { hashReviewToken } from '../lib/review-token.js'
import { recomputeRatingFor } from '../lib/review.js'
import { publicUploadUrl } from '../lib/uploads.js'

function validateRatingComment(rating, comment) {
  const r = Number(rating)
  if (!Number.isInteger(r) || r < 1 || r > 5) return 'Vui lòng chọn số sao từ 1 đến 5'
  if (comment && String(comment).length > 2000) return 'Nhận xét quá dài'
  return null
}

// UC-15 – Khách/khách vãng lai tải ảnh đính kèm đánh giá (tối đa 6). Trả về danh sách URL công khai.
export async function uploadReviewImages(req, res, next) {
  try {
    const files = req.files || []
    if (!files.length) return res.status(400).json({ message: 'Chưa chọn ảnh' })
    res.status(201).json({ images: files.map((f) => publicUploadUrl(f.filename)) })
  } catch (err) {
    next(err)
  }
}

// Lấy tối đa 6 URL ảnh hợp lệ từ payload (chỉ nhận URL /uploads của chính hệ thống — chống chèn URL ngoài).
function pickImageUrls(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter((u) => typeof u === 'string' && u.includes('/uploads/'))
    .slice(0, 6)
    .map((url, i) => ({ url, sortOrder: i }))
}

// UC-15 (1a) – Guest: lấy thông tin đơn qua token để hiển thị form đánh giá (không tiêu thụ token).
export async function getReviewContext(req, res, next) {
  try {
    const token = String(req.params.token || '')
    const row = await prisma.reviewToken.findUnique({
      where: { tokenHash: hashReviewToken(token) },
      include: {
        booking: {
          include: {
            property: { select: { name: true, slug: true, thumbnail: true } },
            tour: { select: { title: true, slug: true, thumbnail: true } },
          },
        },
      },
    })
    if (!row) {
      return res.status(404).json({ message: 'Liên kết đánh giá không hợp lệ' }) // 4b
    }
    if (row.usedAt || row.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Liên kết đánh giá đã hết hạn hoặc đã được sử dụng' }) // 4b
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: row.bookingId } })
    if (existing) {
      return res.status(409).json({ message: 'Đơn này đã được đánh giá trước đó' }) // 4a
    }
    const b = row.booking
    res.json({
      productName: b.tour?.title ?? b.property?.name ?? '',
      productSlug: b.tour?.slug ?? b.property?.slug ?? '',
      thumbnail: b.tour?.thumbnail ?? b.property?.thumbnail ?? null,
      bookingCode: b.code,
    })
  } catch (err) {
    next(err)
  }
}

// UC-15 – Guest gửi đánh giá qua token dùng một lần (BR-62).
export async function createGuestReview(req, res, next) {
  try {
    const { token, rating, comment, images } = req.body
    const issue = validateRatingComment(rating, comment)
    if (issue) return res.status(400).json({ message: issue })
    if (!token) return res.status(400).json({ message: 'Thiếu mã đánh giá' })

    const row = await prisma.reviewToken.findUnique({
      where: { tokenHash: hashReviewToken(String(token)) },
      include: { booking: true },
    })
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Liên kết đánh giá đã hết hạn hoặc đã được sử dụng' }) // 4b
    }

    // BR-61: chỉ đánh giá đơn "hoàn tất" và chưa đánh giá — kiểm tra lại (đề phòng trạng thái đổi).
    const booking = await maybeCompleteBooking(row.booking)
    if (booking.status !== 'COMPLETED') {
      return res.status(409).json({ message: 'Đơn chưa hoàn tất, chưa thể đánh giá' }) // 4a
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } })
    if (existing) {
      return res.status(409).json({ message: 'Đơn này đã được đánh giá trước đó' }) // 4a
    }

    // Chính sách mới: không cần phê duyệt — đánh giá (kể cả của guest qua token 1 lần)
    // được đẩy trực tiếp lên hệ thống (approved: true). Quản trị vẫn có thể ẩn nếu vi phạm.
    const imgs = pickImageUrls(images)
    await prisma.$transaction([
      prisma.review.create({
        data: {
          productType: booking.type,
          propertyId: booking.tourId ? null : booking.propertyId,
          tourId: booking.tourId ?? null,
          bookingId: booking.id,
          authorName: booking.guestName,
          rating: Number(rating),
          comment: comment || null,
          approved: true,
          images: imgs.length ? { create: imgs } : undefined,
        },
      }),
      prisma.reviewToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }), // BR-62: vô hiệu sau khi dùng
    ])
    // Cập nhật điểm trung bình / số lượt ngay vì đánh giá đã hiển thị công khai.
    await recomputeRatingFor({ tourId: booking.tourId, propertyId: booking.tourId ? null : booking.propertyId })

    res.status(201).json({ message: 'Cảm ơn bạn đã gửi đánh giá! Đánh giá đã được đăng.' })
  } catch (err) {
    next(err)
  }
}

// UC-15 – Customer gửi đánh giá cho đơn của chính mình (từ "Đơn của tôi").
export async function createMyReview(req, res, next) {
  try {
    const { code, rating, comment, images } = req.body
    const issue = validateRatingComment(rating, comment)
    if (issue) return res.status(400).json({ message: issue })

    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking || booking.userId !== req.user.sub) {
      return res.status(404).json({ message: 'Không tìm thấy đơn' }) // BR-49: chống IDOR
    }

    const completed = await maybeCompleteBooking(booking)
    if (completed.status !== 'COMPLETED') {
      return res.status(409).json({ message: 'Đơn chưa hoàn tất, chưa thể đánh giá' }) // 4a
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: completed.id } })
    if (existing) {
      return res.status(409).json({ message: 'Đơn này đã được đánh giá trước đó' }) // 4a
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { name: true, email: true } })
    const imgs = pickImageUrls(images)
    await prisma.review.create({
      data: {
        productType: completed.type,
        propertyId: completed.tourId ? null : completed.propertyId,
        tourId: completed.tourId ?? null,
        bookingId: completed.id,
        authorName: user?.name || completed.guestName,
        rating: Number(rating),
        comment: comment || null,
        approved: true, // không cần phê duyệt — đăng trực tiếp
        images: imgs.length ? { create: imgs } : undefined,
      },
    })
    await recomputeRatingFor({ tourId: completed.tourId, propertyId: completed.tourId ? null : completed.propertyId })

    res.status(201).json({ message: 'Cảm ơn bạn đã gửi đánh giá! Đánh giá đã được đăng.' })
  } catch (err) {
    next(err)
  }
}

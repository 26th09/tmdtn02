import { prisma } from './prisma.js'

// BR-105: chỉ đánh giá đã duyệt (approved=true) mới tính vào điểm trung bình & số lượt.
// Tour/Property lưu điểm denormalized (avgRating/reviewCount) nên phải tính lại mỗi khi
// một đánh giá được tạo / duyệt / ẩn.
export async function recomputeTourRating(tourId) {
  if (!tourId) return
  const approved = await prisma.review.findMany({ where: { tourId, approved: true }, select: { rating: true } })
  const count = approved.length
  const avg = count ? approved.reduce((s, r) => s + r.rating, 0) / count : 0
  await prisma.tour.update({ where: { id: tourId }, data: { reviewCount: count, avgRating: Math.round(avg * 10) / 10 } })
}

export async function recomputePropertyRating(propertyId) {
  if (!propertyId) return
  const approved = await prisma.review.findMany({ where: { propertyId, approved: true }, select: { rating: true } })
  const count = approved.length
  const avg = count ? approved.reduce((s, r) => s + r.rating, 0) / count : 0
  await prisma.property.update({ where: { id: propertyId }, data: { reviewCount: count, avgRating: Math.round(avg * 10) / 10 } })
}

// Tiện ích: tính lại điểm cho đúng loại sản phẩm của một đánh giá.
export async function recomputeRatingFor({ tourId, propertyId }) {
  await recomputeTourRating(tourId)
  await recomputePropertyRating(propertyId)
}

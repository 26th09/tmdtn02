// Ràng buộc công bố (BR-73/BR-79): một sản phẩm chỉ được chuyển sang VISIBLE khi
// ĐỦ các trường thông tin bắt buộc VÀ có tối thiểu 5 ảnh. Chưa đủ thì giữ ở trạng thái
// nháp/chờ công bố (DRAFT). Trả về danh sách mục còn thiếu để hiển thị cho quản trị.

const MIN_IMAGES = 5
const has = (v) => v != null && String(v).trim() !== ''

// Chỗ nghỉ (homestay): cần đủ thông tin + ≥1 loại phòng + ≥5 ảnh.
export async function missingForPropertyPublish(prisma, property) {
  const m = []
  if (!has(property.name)) m.push('Tên chỗ nghỉ')
  if (!has(property.shortDescription)) m.push('Mô tả ngắn')
  if (!has(property.description)) m.push('Mô tả chi tiết')
  if (!property.provinceId) m.push('Tỉnh/Thành')
  if (!has(property.address)) m.push('Địa chỉ')
  if (!(property.basePrice > 0)) m.push('Giá tham khảo')
  if (!has(property.checkInTime)) m.push('Giờ nhận phòng')
  if (!has(property.checkOutTime)) m.push('Giờ trả phòng')
  if (!has(property.thumbnail)) m.push('Ảnh đại diện (thumbnail)')
  if (!property.cancellationPolicyId) m.push('Chính sách hủy')

  const [imageCount, roomTypeCount] = await Promise.all([
    prisma.propertyImage.count({ where: { propertyId: property.id } }),
    prisma.roomType.count({ where: { propertyId: property.id } }),
  ])
  if (roomTypeCount < 1) m.push('Ít nhất 1 loại phòng')
  if (imageCount < MIN_IMAGES) m.push(`Tối thiểu ${MIN_IMAGES} ảnh (hiện có ${imageCount})`)
  return m
}

// Tour: cần đủ thông tin + ≥1 chuyến khởi hành + ≥5 ảnh.
export async function missingForTourPublish(prisma, tour) {
  const m = []
  if (!has(tour.title)) m.push('Tên tour')
  if (!has(tour.shortDescription)) m.push('Mô tả ngắn')
  if (!has(tour.description)) m.push('Mô tả chi tiết')
  if (!tour.regionId) m.push('Vùng miền')
  if (!has(tour.destination)) m.push('Điểm đến')
  if (!has(tour.departurePoint)) m.push('Điểm khởi hành')
  if (!(tour.durationDays >= 1)) m.push('Số ngày')
  if (!(tour.basePrice > 0)) m.push('Giá tham khảo')
  if (!has(tour.thumbnail)) m.push('Ảnh đại diện (thumbnail)')
  if (!tour.cancellationPolicyId) m.push('Chính sách hủy')

  const [imageCount, departureCount] = await Promise.all([
    prisma.tourImage.count({ where: { tourId: tour.id } }),
    prisma.tourDeparture.count({ where: { tourId: tour.id } }),
  ])
  if (departureCount < 1) m.push('Ít nhất 1 chuyến khởi hành')
  if (imageCount < MIN_IMAGES) m.push(`Tối thiểu ${MIN_IMAGES} ảnh (hiện có ${imageCount})`)
  return m
}

export { MIN_IMAGES }

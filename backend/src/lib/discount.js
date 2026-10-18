import { prisma } from './prisma.js'
import { productInGroup } from './serviceGroup.js'

// UC-12 – Kiểm tra và tính chiết khấu cho một mã giảm giá.
// BR-45: còn hiệu lực (thời gian, lượt dùng) + điều kiện đơn (giá trị tối thiểu, phạm vi, đối tượng).
// Trả về { ok, message, discount, discountCode } — discount = số tiền được giảm (đã chặn không vượt subtotal).
export async function validateDiscount({ code, type, productId, propertyId, tourId, subtotal, userId }) {
  if (!code || !String(code).trim()) {
    return { ok: false, message: 'Vui lòng nhập mã giảm giá' }
  }

  const row = await prisma.discountCode.findUnique({ where: { code: String(code).trim().toUpperCase() } })

  // 2a: không tồn tại / sai định dạng / hết hiệu lực theo thời gian / bị tắt.
  const now = new Date()
  if (
    !row ||
    !row.active ||
    (row.startAt && row.startAt > now) ||
    (row.endAt && row.endAt < now)
  ) {
    return { ok: false, message: 'Mã không hợp lệ hoặc đã hết hạn', code: 'INVALID' }
  }

  // 2b: hết lượt sử dụng.
  if (row.maxUses != null && row.usedCount >= row.maxUses) {
    return { ok: false, message: 'Mã đã hết lượt sử dụng', code: 'DEPLETED' }
  }

  // 3a: phạm vi sản phẩm không khớp.
  if (row.scope !== 'ALL' && row.scope !== type) {
    return { ok: false, message: `Mã chỉ áp dụng cho ${row.scope === 'HOMESTAY' ? 'homestay' : 'tour'}`, code: 'SCOPE' }
  }
  if (row.productId && row.productId !== productId) {
    return { ok: false, message: 'Mã không áp dụng cho sản phẩm này', code: 'SCOPE' }
  }
  if (row.tourId && row.tourId !== tourId) {
    return { ok: false, message: 'Mã không áp dụng cho tour này', code: 'SCOPE' }
  }
  if (row.propertyId && row.propertyId !== propertyId) {
    return { ok: false, message: 'Mã không áp dụng cho chỗ nghỉ này', code: 'SCOPE' }
  }
  // Mã nhắm theo nhóm dịch vụ: sản phẩm phải thuộc nhóm đó (gồm nhóm con).
  if (row.serviceGroupId) {
    const inGroup = await productInGroup({ groupId: row.serviceGroupId, tourId, propertyId })
    if (!inGroup) {
      return { ok: false, message: 'Mã chỉ áp dụng cho nhóm dịch vụ nhất định, không gồm sản phẩm này', code: 'SCOPE' }
    }
  }

  // 3a: đối tượng áp dụng (chỉ thành viên đã đăng nhập).
  if (row.audience === 'CUSTOMER' && !userId) {
    return { ok: false, message: 'Mã chỉ áp dụng cho thành viên đã đăng nhập', code: 'AUDIENCE' }
  }

  // 3a: giá trị đơn tối thiểu.
  if (subtotal < row.minOrderValue) {
    return {
      ok: false,
      message: `Đơn cần tối thiểu ${row.minOrderValue.toLocaleString('vi-VN')}₫ để áp dụng mã này`,
      code: 'MIN_ORDER',
    }
  }

  // BR-46: tính chiết khấu nhất quán, không vượt quá tổng tiền.
  const raw = row.type === 'PERCENT' ? Math.round((subtotal * row.value) / 100) : row.value
  const discount = Math.min(raw, subtotal)

  return { ok: true, discount, discountCode: row }
}

// BR-47: chỉ trừ lượt khi đơn thanh toán cọc thành công (gọi từ markDeposited).
export async function consumeDiscountIfAny(booking) {
  if (!booking.discountCode || booking.discountConsumed) return
  await prisma.$transaction([
    prisma.discountCode.updateMany({
      where: { code: booking.discountCode },
      data: { usedCount: { increment: 1 } },
    }),
    prisma.booking.update({ where: { id: booking.id }, data: { discountConsumed: true } }),
  ])
}

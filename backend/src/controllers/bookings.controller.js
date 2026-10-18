import { prisma } from '../lib/prisma.js'
import { sendBookingEmail } from '../lib/mailer.js'
import {
  HOLD_MINUTES,
  generateOrderCode,
  generatePin,
  getDepositRate,
  hashPin,
  nightsBetween,
  parseUtcDate,
  releaseExpiredHomestayHolds,
  releaseExpiredTourHolds,
} from '../lib/booking.js'
import { validateDiscount } from '../lib/discount.js'
import { getSystemConfig } from '../lib/config.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Cấu hình công khai cho luồng đặt (tỷ lệ cọc, hạn giữ chỗ, % VAT để tách thuế hiển thị).
export async function bookingConfig(req, res) {
  const cfg = await getSystemConfig()
  res.json({ depositRate: await getDepositRate(), holdMinutes: HOLD_MINUTES, vatPercent: cfg.vatPercent })
}

function publicBooking(b, productName, productSlug) {
  return {
    code: b.code,
    type: b.type,
    status: b.status,
    productName,
    productSlug,
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    note: b.note,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    nights: b.nights,
    guests: b.guests,
    children: b.children,
    totalPrice: b.totalPrice,
    discountCode: b.discountCode,
    discountAmount: b.discountAmount,
    depositAmount: b.depositAmount,
    remainingAmount: b.remainingAmount,
    heldUntil: b.heldUntil,
    createdAt: b.createdAt,
  }
}

// UC-12 (extend UC-09/10) – Xác thực lại mã giảm giá ở server (không tin client),
// trả về { discountCode, discountAmount } để áp vào tổng tiền/cọc.
async function resolveDiscount({ discountCode, type, productId, propertyId, tourId, subtotal, userId }) {
  if (!discountCode) return { discountCode: null, discountAmount: 0 }
  const result = await validateDiscount({ code: discountCode, type, productId, propertyId, tourId, subtotal, userId })
  if (!result.ok) {
    const err = new Error(result.message)
    err.status = 400
    err.code = result.code
    throw err
  }
  return { discountCode: result.discountCode.code, discountAmount: result.discount }
}

// UC-09 – Đặt homestay: giữ chỗ tạm + tạo đơn "chờ cọc". Hỗ trợ guest checkout.
export async function createHomestayBooking(req, res, next) {
  try {
    const { slug, checkIn, checkOut, guests, roomTypeId, guestName, guestEmail, guestPhone, acceptedTerms, discountCode, note } = req.body

    // BR-28 / 5a: bắt buộc đồng ý điều khoản.
    if (!acceptedTerms) {
      return res.status(400).json({ message: 'Vui lòng đồng ý điều khoản và chính sách trước khi đặt' })
    }
    if (!guestName || !guestEmail || !guestPhone) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và số điện thoại' })
    }
    if (!EMAIL_RE.test(guestEmail)) {
      return res.status(400).json({ message: 'Email không hợp lệ' })
    }
    const numGuests = Number(guests) || 0
    if (numGuests < 1) {
      return res.status(400).json({ message: 'Số khách phải ≥ 1' })
    }
    const nights = nightsBetween(checkIn, checkOut)
    if (!nights || nights.length === 0) {
      return res.status(400).json({ message: 'Khoảng ngày không hợp lệ' })
    }

    const property = await prisma.property.findUnique({ where: { slug }, include: { roomTypes: true } })
    if (!property || property.status !== 'VISIBLE') {
      return res.status(404).json({ message: 'Chỗ nghỉ không còn khả dụng' }) // 1a
    }
    const roomType = roomTypeId ? property.roomTypes.find((r) => r.id === Number(roomTypeId)) : property.roomTypes[0]
    if (!roomType) return res.status(404).json({ message: 'Không tìm thấy loại phòng' })

    // BR-25: giải phóng chỗ giữ tạm đã quá hạn trước khi kiểm tra.
    await releaseExpiredHomestayHolds(property.id)

    // BR-24 / 1a: kiểm tra còn trống theo thời gian thực cho từng đêm (theo loại phòng).
    const rows = await prisma.roomInventory.findMany({
      where: { roomTypeId: roomType.id, date: { gte: nights[0], lte: nights[nights.length - 1] } },
    })
    const byTime = new Map(rows.map((r) => [new Date(r.date).getTime(), r]))
    for (const d of nights) {
      const row = byTime.get(d.getTime())
      if (!row || row.isBlocked || row.totalRooms - row.bookedRooms - row.heldRooms < 1) {
        return res.status(409).json({ message: 'Không còn phòng trống trong khoảng ngày đã chọn', code: 'SOLD_OUT' })
      }
    }

    // Tính tiền (BR-26): dùng giá riêng theo ngày do UC-16 thiết lập nếu có, ngược lại giá loại phòng.
    const totalPrice = nights.reduce((sum, d) => {
      const row = byTime.get(d.getTime())
      return sum + (row?.priceOverride ?? roomType.basePricePerNight)
    }, 0)
    const userId = req.user?.sub ?? null

    // UC-12/BR-46: xác thực lại mã giảm giá, cọc tính trên tổng SAU giảm.
    let discount
    try {
      discount = await resolveDiscount({ discountCode, type: 'HOMESTAY', propertyId: property.id, subtotal: totalPrice, userId })
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message, code: err.code })
    }
    const payableTotal = totalPrice - discount.discountAmount
    const depositRate = property.depositRate != null ? property.depositRate / 100 : await getDepositRate() // BR-113
    const depositAmount = Math.round(payableTotal * depositRate)
    const remainingAmount = payableTotal - depositAmount

    // Mã đơn + PIN (BR-29: PIN chỉ cho guest).
    const code = generateOrderCode()
    const pin = userId ? null : generatePin()

    // Giữ chỗ (tăng bookedRooms cho từng đêm của loại phòng) + tạo đơn trong một transaction.
    const [, created] = await prisma.$transaction([
      prisma.roomInventory.updateMany({
        where: { roomTypeId: roomType.id, date: { in: nights } },
        data: { bookedRooms: { increment: 1 } },
      }),
      prisma.booking.create({
        data: {
          code,
          pinHash: pin ? hashPin(pin) : null,
          type: 'HOMESTAY',
          status: 'PENDING_DEPOSIT',
          propertyId: property.id,
          roomTypeId: roomType.id,
          userId,
          guestName,
          guestEmail,
          guestPhone,
          note: note?.trim() || null,
          checkIn: parseUtcDate(checkIn),
          checkOut: parseUtcDate(checkOut),
          nights: nights.length,
          guests: numGuests,
          totalPrice: payableTotal,
          discountCode: discount.discountCode,
          discountAmount: discount.discountAmount,
          depositAmount,
          remainingAmount,
          heldUntil: new Date(Date.now() + HOLD_MINUTES * 60000),
        },
      }),
    ])

    // Gửi email xác nhận (nền, không chặn response).
    sendBookingEmail(guestEmail, {
      code,
      pin,
      productName: property.name,
      totalPrice: payableTotal,
      depositAmount,
      remainingAmount,
    }).catch((e) => console.error('Gửi email đặt chỗ thất bại:', e))

    res.status(201).json({ booking: publicBooking(created, property.name, property.slug), pin })
  } catch (err) {
    next(err)
  }
}

// UC-10 – Đặt tour: giữ chỗ theo số ghế của một chuyến khởi hành + tạo đơn "chờ cọc".
export async function createTourBooking(req, res, next) {
  try {
    const { slug, date, guests, children, guestName, guestEmail, guestPhone, acceptedTerms, discountCode, note } = req.body

    if (!acceptedTerms) {
      return res.status(400).json({ message: 'Vui lòng đồng ý điều khoản và chính sách trước khi đặt' }) // 5a
    }
    if (!guestName || !guestEmail || !guestPhone) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và số điện thoại' })
    }
    if (!EMAIL_RE.test(guestEmail)) {
      return res.status(400).json({ message: 'Email không hợp lệ' })
    }
    const adults = Number(guests) || 0
    const numChildren = Number(children) || 0
    if (adults < 1) {
      return res.status(400).json({ message: 'Cần ít nhất 1 người lớn' })
    }
    if (numChildren < 0) {
      return res.status(400).json({ message: 'Số trẻ em không hợp lệ' })
    }
    const day = parseUtcDate(date)
    if (!day) {
      return res.status(400).json({ message: 'Ngày khởi hành không hợp lệ' })
    }

    const tour = await prisma.tour.findUnique({ where: { slug } })
    if (!tour || tour.status !== 'VISIBLE') {
      return res.status(404).json({ message: 'Tour không còn khả dụng' })
    }

    await releaseExpiredTourHolds(tour.id) // BR-32

    // BR-30: chỉ đặt theo chuyến khởi hành đã mở.
    const nextDay = new Date(day.getTime() + 86400000)
    const departure = await prisma.tourDeparture.findFirst({
      where: { tourId: tour.id, departureDate: { gte: day, lt: nextDay } },
      include: { prices: true },
    })
    // BR-79: chuyến đã đóng/hủy coi như không có chuyến khởi hành ngày đó.
    if (!departure || departure.status === 'CLOSED' || departure.status === 'CANCELLED') {
      return res.status(404).json({ message: 'Không có chuyến khởi hành vào ngày đã chọn' })
    }

    // BR-31 / 1a: kiểm tra đủ chỗ (trừ cả chỗ đang giữ tạm).
    const totalGuests = adults + numChildren
    const seatsLeft = departure.totalSlots - departure.bookedSlots - departure.heldSlots
    if (seatsLeft < totalGuests) {
      return res.status(409).json({
        message: 'Không đủ chỗ cho chuyến này. Vui lòng giảm số khách hoặc chọn ngày khác.',
        code: 'SOLD_OUT',
        seatsLeft,
      })
    }

    // BR-33/BR-83: tổng tiền theo loại khách, dùng bảng giá theo chuyến (TourPrice); fallback basePrice.
    const priceOf = (t) => departure.prices.find((p) => p.paxType === t)?.price ?? tour.basePrice
    const totalPrice = priceOf('ADULT') * adults + priceOf('CHILD') * numChildren
    const userId = req.user?.sub ?? null

    // UC-12/BR-46: xác thực lại mã giảm giá, cọc tính trên tổng SAU giảm.
    let discount
    try {
      discount = await resolveDiscount({ discountCode, type: 'TOUR', tourId: tour.id, subtotal: totalPrice, userId })
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message, code: err.code })
    }
    const payableTotal = totalPrice - discount.discountAmount
    const depositRate = tour.depositRate != null ? tour.depositRate / 100 : await getDepositRate() // BR-113
    const depositAmount = Math.round(payableTotal * depositRate)
    const remainingAmount = payableTotal - depositAmount

    const code = generateOrderCode()
    const pin = userId ? null : generatePin()

    const [, created] = await prisma.$transaction([
      prisma.tourDeparture.update({
        where: { id: departure.id },
        data: { bookedSlots: { increment: totalGuests } },
      }),
      prisma.booking.create({
        data: {
          code,
          pinHash: pin ? hashPin(pin) : null,
          type: 'TOUR',
          status: 'PENDING_DEPOSIT',
          tourId: tour.id,
          tourDepartureId: departure.id,
          userId,
          guestName,
          guestEmail,
          guestPhone,
          note: note?.trim() || null,
          checkIn: day, // ngày khởi hành
          nights: null,
          guests: adults,
          children: numChildren,
          totalPrice: payableTotal,
          discountCode: discount.discountCode,
          discountAmount: discount.discountAmount,
          depositAmount,
          remainingAmount,
          heldUntil: new Date(Date.now() + HOLD_MINUTES * 60000),
        },
      }),
    ])

    sendBookingEmail(guestEmail, {
      code,
      pin,
      productName: tour.title,
      totalPrice: payableTotal,
      depositAmount,
      remainingAmount,
    }).catch((e) => console.error('Gửi email đặt tour thất bại:', e))

    res.status(201).json({ booking: publicBooking(created, tour.title, tour.slug), pin })
  } catch (err) {
    next(err)
  }
}

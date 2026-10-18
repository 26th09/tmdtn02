import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { nightsBetween } from '../../lib/booking.js'
import { sendOrderStatusEmail, sendRefundProcessedEmail, sendTourVoucherEmail } from '../../lib/mailer.js'
import { paymentState, outstanding, payableTotal, fullPaymentDeadline, codDeadline } from '../../lib/payment.js'
import { consumeDiscountIfAny } from '../../lib/discount.js'

// BR-85: vòng đời đơn — mọi chuyển trạng thái không có trong danh sách đều bị từ chối.
const TRANSITIONS = {
  PENDING_DEPOSIT: ['DEPOSITED', 'CANCELLED'],
  DEPOSITED: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

function summary(b) {
  return {
    code: b.code,
    type: b.type,
    status: b.status,
    productName: b.tour?.title ?? b.property?.name ?? "",
    productSlug: b.tour?.slug ?? b.property?.slug ?? "",
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    guests: b.guests,
    children: b.children,
    totalPrice: b.totalPrice,
    depositAmount: b.depositAmount,
    remainingAmount: b.remainingAmount,
    discountAmount: b.discountAmount,
    paymentMethod: b.paymentMethod,
    // Tài chính: tiền đã nhận + trạng thái thanh toán + còn thiếu + đủ thông tin liên hệ.
    paidAmount: b.paidAmount,
    payable: payableTotal(b),
    paymentState: paymentState(b), // UNPAID | PARTIAL | PAID
    outstanding: outstanding(b),
    contactComplete: Boolean(b.guestName && b.guestEmail && b.guestPhone),
    refundRatio: b.refundRequests?.[0]?.ratio ?? null,
    refundAmount: b.refundRequests?.[0]?.amount ?? null,
    createdAt: b.createdAt,
  }
}

// UC-18 – Danh sách đơn (mọi trạng thái) kèm bộ lọc theo trạng thái/loại/thời gian/tìm kiếm.
export async function listOrders(req, res, next) {
  try {
    const { status, type, from, to, search, minTotal, maxTotal } = req.query
    const where = {}
    if (status) where.status = String(status)
    if (type === 'HOMESTAY' || type === 'TOUR') where.type = type
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(String(from))
      if (to) where.createdAt.lte = new Date(new Date(String(to)).getTime() + 86400000)
    }
    // Khoảng giá theo tổng tiền đơn (BR: lọc theo giá).
    const min = minTotal != null && minTotal !== '' ? Number(minTotal) : null
    const max = maxTotal != null && maxTotal !== '' ? Number(maxTotal) : null
    if ((min != null && !Number.isNaN(min)) || (max != null && !Number.isNaN(max))) {
      where.totalPrice = {}
      if (min != null && !Number.isNaN(min)) where.totalPrice.gte = min
      if (max != null && !Number.isNaN(max)) where.totalPrice.lte = max
    }
    if (search) {
      const s = String(search).trim()
      where.OR = [
        { code: { contains: s } },
        { guestEmail: { contains: s } },
        { guestName: { contains: s } },
      ]
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        property: { select: { name: true, slug: true } },
        tour: { select: { title: true, slug: true } },
        refundRequests: { orderBy: { createdAt: 'desc' }, take: 1, select: { ratio: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    res.json({ items: bookings.map(summary) })
  } catch (err) {
    next(err)
  }
}

// Ghi nhận/điều chỉnh số tiền đã THU (thu tay / thanh toán 1 phần). mark: FULL|DEPOSIT|NONE hoặc paidAmount cụ thể.
export async function setOrderPayment(req, res, next) {
  try {
    const code = req.params.code
    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })
    if (booking.status === 'CANCELLED') return res.status(400).json({ message: 'Đơn đã hủy, không ghi nhận thanh toán' })

    const payable = payableTotal(booking)
    let target
    if (req.body.mark === 'FULL') target = payable
    else if (req.body.mark === 'DEPOSIT') target = booking.depositAmount
    else if (req.body.mark === 'NONE') target = 0
    else target = Number(req.body.paidAmount)
    if (target == null || Number.isNaN(target)) return res.status(400).json({ message: 'Số tiền không hợp lệ' })
    target = Math.max(0, Math.min(Math.round(target), payable))

    const delta = target - (booking.paidAmount || 0)
    const ops = [
      prisma.booking.update({
        where: { id: booking.id },
        data: { paidAmount: target, ...(target > 0 && !booking.depositPaidAt ? { depositPaidAt: new Date() } : {}) },
      }),
    ]
    if (delta !== 0) {
      ops.push(
        prisma.payment.create({
          data: { bookingId: booking.id, method: booking.paymentMethod || 'CASH', amount: delta, status: 'SUCCESS' },
        }),
      )
    }
    await prisma.$transaction(ops)
    if (target > 0) await consumeDiscountIfAny(booking) // trừ lượt mã giảm giá khi thực nhận tiền
    await logAdminAction(req.admin.sub, 'order.payment', { entityType: 'Booking', entityId: booking.id, detail: { paidAmount: target } })

    const updatedB = { ...booking, paidAmount: target }
    res.json({ ok: true, paidAmount: target, paymentState: paymentState(updatedB), outstanding: outstanding(updatedB) })
  } catch (err) {
    next(err)
  }
}

// UC-18 – Chi tiết đơn: sản phẩm, khách, lịch sử thanh toán, yêu cầu hoàn tiền.
export async function getOrder(req, res, next) {
  try {
    const code = String(req.params.code || '').trim().toUpperCase()
    const booking = await prisma.booking.findUnique({
      where: { code },
      include: {
        property: { select: { name: true, slug: true } },
        tour: { select: { title: true, slug: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        refundRequests: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })

    res.json({
      order: {
        ...summary(booking),
        nights: booking.nights,
        note: booking.note,
        discountCode: booking.discountCode,
        discountAmount: booking.discountAmount,
        transactionId: booking.transactionId,
        depositPaidAt: booking.depositPaidAt,
        cancelledAt: booking.cancelledAt,
        allowedTransitions: TRANSITIONS[booking.status] || [],
        fullPaymentDeadline: await fullPaymentDeadline(booking),
        codDeadline: booking.paymentMethod === 'COD' ? await codDeadline(booking) : null,
      },
      payments: booking.payments,
      refundRequests: booking.refundRequests,
    })
  } catch (err) {
    next(err)
  }
}

// Giải phóng tồn kho/số chỗ khi admin chuyển đơn sang "đã hủy" trực tiếp (không qua UC-14).
async function releaseInventoryOps(booking) {
  const ops = []
  if (booking.type === 'HOMESTAY' && booking.checkIn && booking.checkOut) {
    const nights = nightsBetween(booking.checkIn.toISOString(), booking.checkOut.toISOString())
    if (nights?.length && booking.roomTypeId) {
      ops.push(
        prisma.roomInventory.updateMany({
          where: { roomTypeId: booking.roomTypeId, date: { in: nights }, bookedRooms: { gt: 0 } },
          data: { bookedRooms: { decrement: 1 } },
        }),
      )
    }
  } else if (booking.type === 'TOUR') {
    const departure = booking.tourDepartureId
      ? await prisma.tourDeparture.findUnique({ where: { id: booking.tourDepartureId } })
      : null
    if (departure) {
      const seats = (booking.guests || 0) + (booking.children || 0)
      ops.push(
        prisma.tourDeparture.update({
          where: { id: departure.id },
          data: { bookedSlots: { decrement: Math.min(seats, departure.bookedSlots) } },
        }),
      )
    }
  }
  return ops
}

// Áp dụng chuyển trạng thái cho MỘT đơn theo đúng vòng đời (BR-85). Trả { updated } hoặc ném lỗi có .statusCode.
// Dùng chung cho đổi trạng thái đơn lẻ và nhập Excel hàng loạt.
async function changeBookingStatus(booking, status, adminSub) {
  const allowed = TRANSITIONS[booking.status] || []
  if (!allowed.includes(status)) {
    const err = new Error(`Không thể chuyển đơn từ "${booking.status}" sang "${status}" (trái vòng đời đơn — BR-85)`)
    err.statusCode = 409
    throw err
  }

  const ops = []
  if (status === 'CANCELLED') {
    ops.push(...(await releaseInventoryOps(booking)))
  }
  const bookingUpdateIndex = ops.length
  ops.push(
    prisma.booking.update({
      where: { id: booking.id },
      data: { status, ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) },
    }),
  )

  const results = await prisma.$transaction(ops)
  const updated = results[bookingUpdateIndex]

  await logAdminAction(adminSub, 'order.status', {
    entityType: 'Booking',
    entityId: booking.id,
    detail: { from: booking.status, to: status },
  })

  // Đơn "Trả sau khi đi tour" khi được XÁC NHẬN -> gửi voucher/vé điện tử kèm số tiền cần chuẩn bị.
  const deferred = booking.paymentMethod === 'PAY_ON_DEPARTURE' || booking.paymentMethod === 'COD'
  if (status === 'CONFIRMED' && deferred) {
    sendTourVoucherEmail(booking.guestEmail, {
      code: booking.code,
      productName: booking.tour?.title ?? booking.property?.name ?? '',
      payable: Math.max(0, booking.totalPrice - (booking.discountAmount || 0)),
    }).catch((e) => console.error('Gửi voucher xác nhận thất bại:', e))
  } else {
    // BR-90: thông báo cho người dùng khi trạng thái đơn thay đổi (gửi nền, không chặn response).
    sendOrderStatusEmail(booking.guestEmail, { code: booking.code, productName: booking.tour?.title ?? booking.property?.name ?? '', status }).catch(
      (e) => console.error('Gửi email cập nhật đơn thất bại:', e),
    )
  }

  return updated
}

// UC-18 (3/3a) – Chuyển trạng thái đơn theo đúng vòng đời (BR-85).
// Ngoại lệ 3a: chuyển trạng thái không hợp lệ (vd "đã hủy" -> "hoàn tất") -> từ chối.
export async function updateOrderStatus(req, res, next) {
  try {
    const code = String(req.params.code || '').trim().toUpperCase()
    const { status } = req.body
    const booking = await prisma.booking.findUnique({ where: { code }, include: { property: true, tour: true } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })

    let updated
    try {
      updated = await changeBookingStatus(booking, status, req.admin.sub)
    } catch (e) {
      if (e.statusCode) return res.status(e.statusCode).json({ message: e.message }) // 3a
      throw e
    }

    res.json({ order: { ...summary({ ...booking, ...updated, property: booking.property, tour: booking.tour }), allowedTransitions: TRANSITIONS[updated.status] || [] } })
  } catch (err) {
    next(err)
  }
}

// Nhập Excel: cập nhật trạng thái hàng loạt. Body: { rows: [{ code, status }] }.
// Xử lý từng dòng độc lập, báo cáo dòng thành công/lỗi (không dừng ở dòng lỗi đầu tiên).
const VALID_STATUSES = ['PENDING_DEPOSIT', 'DEPOSITED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']
export async function bulkUpdateOrderStatus(req, res, next) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
    if (!rows.length) return res.status(400).json({ message: 'Không có dòng dữ liệu nào để nhập' })
    if (rows.length > 1000) return res.status(400).json({ message: 'Tối đa 1000 dòng mỗi lần nhập' })

    const results = []
    let updatedCount = 0
    for (const row of rows) {
      const code = String(row?.code || '').trim().toUpperCase()
      const status = String(row?.status || '').trim().toUpperCase()
      if (!code) { results.push({ code: row?.code ?? '', ok: false, message: 'Thiếu mã đơn' }); continue }
      if (!VALID_STATUSES.includes(status)) { results.push({ code, ok: false, message: `Trạng thái không hợp lệ: "${row?.status}"` }); continue }
      const booking = await prisma.booking.findUnique({ where: { code }, include: { property: true, tour: true } })
      if (!booking) { results.push({ code, ok: false, message: 'Không tìm thấy đơn' }); continue }
      if (booking.status === status) { results.push({ code, ok: true, message: 'Không đổi (đã ở trạng thái này)', skipped: true }); continue }
      try {
        await changeBookingStatus(booking, status, req.admin.sub)
        updatedCount++
        results.push({ code, ok: true, message: `${booking.status} → ${status}` })
      } catch (e) {
        results.push({ code, ok: false, message: e.message || 'Lỗi cập nhật' })
      }
    }
    res.json({ updatedCount, total: rows.length, results })
  } catch (err) {
    next(err)
  }
}

// UC-18 (4/4a) – Xác nhận thực hiện hoàn tiền cho một yêu cầu đang chờ (từ UC-14).
// BR-86: không tính lại mức hoàn, chỉ đối chiếu & xác nhận. BR-87: chỉ sandbox/ghi nhận thủ công.
export async function processRefund(req, res, next) {
  try {
    const code = String(req.params.code || '').trim().toUpperCase()
    const refundId = Number(req.params.refundId)
    const { amount, referenceCode } = req.body || {}

    const booking = await prisma.booking.findUnique({ where: { code }, include: { property: true, tour: true } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })

    const refund = await prisma.refundRequest.findFirst({ where: { id: refundId, bookingId: booking.id } })
    if (!refund) return res.status(404).json({ message: 'Không tìm thấy yêu cầu hoàn tiền' })
    if (refund.status !== 'PENDING') {
      return res.status(409).json({ message: 'Yêu cầu hoàn tiền này đã được xử lý trước đó' })
    }

    // 4a: số tiền đối soát không khớp mức đã ghi nhận -> tạm dừng, yêu cầu đối soát.
    if (amount !== undefined && amount !== null && Number(amount) !== refund.amount) {
      return res.status(409).json({
        message: `Số tiền hoàn (${Number(amount).toLocaleString('vi-VN')}đ) không khớp mức đã ghi nhận (${refund.amount.toLocaleString('vi-VN')}đ). Vui lòng đối soát trước khi xác nhận.`,
      })
    }

    const updated = await prisma.refundRequest.update({
      where: { id: refund.id },
      data: { status: 'PROCESSED' },
    })

    await logAdminAction(req.admin.sub, 'order.refund.process', {
      entityType: 'RefundRequest',
      entityId: refund.id,
      detail: { bookingCode: booking.code, amount: refund.amount, referenceCode: referenceCode || null },
    })

    sendRefundProcessedEmail(booking.guestEmail, {
      code: booking.code,
      productName: booking.tour?.title ?? booking.property?.name ?? '',
      amount: refund.amount,
      referenceCode: referenceCode || null,
    }).catch((e) => console.error('Gửi email hoàn tiền thất bại:', e))

    res.json({ refund: updated })
  } catch (err) {
    next(err)
  }
}

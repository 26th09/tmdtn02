import { prisma } from './prisma.js'
import { getSystemConfig } from './config.js'
import { nightsBetween } from './booking.js'
import { computeRefund } from './cancellation.js'
import { payableTotal, fullPaymentDeadline, codDeadline } from './payment.js'
import { sendCancellationEmail } from './mailer.js'

// Trả lại tồn kho/số chỗ khi hủy (nếu còn ý nghĩa — ngày trong tương lai).
async function restoreInventoryOps(b) {
  const ops = []
  if (b.type === 'HOMESTAY' && b.checkIn && b.checkOut && b.roomTypeId) {
    const nights = nightsBetween(b.checkIn.toISOString(), b.checkOut.toISOString())
    if (nights?.length) {
      ops.push(
        prisma.roomInventory.updateMany({
          where: { roomTypeId: b.roomTypeId, date: { in: nights }, bookedRooms: { gt: 0 } },
          data: { bookedRooms: { decrement: 1 } },
        }),
      )
    }
  } else if (b.type === 'TOUR' && b.tourDepartureId) {
    const dep = await prisma.tourDeparture.findUnique({ where: { id: b.tourDepartureId } })
    if (dep) {
      const seats = (b.guests || 0) + (b.children || 0)
      ops.push(
        prisma.tourDeparture.update({
          where: { id: dep.id },
          data: { bookedSlots: { decrement: Math.min(seats, dep.bookedSlots) } },
        }),
      )
    }
  }
  return ops
}

async function cancelForNonPayment(b, reason) {
  const refund = await computeRefund(b)
  // Chỉ hoàn phần tiền ĐÃ NHẬN thực tế (COD chưa thu -> không hoàn).
  const refundable = Math.min(refund.refundAmount || 0, b.paidAmount || 0)
  const ops = await restoreInventoryOps(b)
  ops.push(prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } }))
  if (refundable > 0) {
    ops.push(prisma.refundRequest.create({ data: { bookingId: b.id, amount: refundable, ratio: refund.ratio || 0, status: 'PENDING' } }))
  }
  await prisma.$transaction(ops)
  const productName = b.tour?.title ?? b.property?.name ?? ''
  sendCancellationEmail(b.guestEmail, { code: b.code, productName, refundAmount: refundable, ratio: refund.ratio || 0 }).catch((e) =>
    console.error('Gửi email hủy đơn tự động thất bại:', e),
  )
  console.log(`[Payment sweep] Hủy đơn ${b.code} (${reason})`)
}

// Chính sách bắt buộc: tự hủy đơn quá hạn thanh toán + trả lại tồn kho + gửi mail cho khách.
export async function sweepPaymentDeadlines() {
  const cfg = await getSystemConfig()
  const now = new Date()
  const candidates = await prisma.booking.findMany({
    where: { status: { in: ['DEPOSITED', 'CONFIRMED'] } },
    include: { tour: { select: { title: true } }, property: { select: { name: true } } },
  })
  let cancelled = 0
  for (const b of candidates) {
    const payable = payableTotal(b)
    const paid = b.paidAmount || 0
    // 1) Thu tay nhưng chưa nhận được tiền và đã quá hạn COD.
    if (b.paymentMethod === 'COD' && paid <= 0) {
      const due = await codDeadline(b, cfg)
      if (due && due < now) {
        await cancelForNonPayment(b, 'thu tay quá hạn chưa thanh toán')
        cancelled++
        continue
      }
    }
    // 2) Chưa thanh toán ĐỦ trước giờ đi/checkin.
    if (paid < payable) {
      const due = await fullPaymentDeadline(b, cfg)
      if (due && due < now) {
        await cancelForNonPayment(b, 'chưa thanh toán đủ trước giờ đi/checkin')
        cancelled++
      }
    }
  }
  if (cancelled) console.log(`[Payment sweep] Đã tự hủy ${cancelled} đơn do quá hạn thanh toán.`)
  return cancelled
}

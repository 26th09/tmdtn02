import { prisma } from '../lib/prisma.js'
import { sendBookingEmail } from '../lib/mailer.js'
import { getDepositRate } from '../lib/booking.js'
import { consumeDiscountIfAny } from '../lib/discount.js'
import { buildPaymentUrl, isVnpayConfigured, verifyReturn } from '../lib/vnpay.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000'
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

// BR-43: tối thiểu 2 phương thức (COD + cổng online sandbox).
export async function paymentConfig(req, res) {
  res.json({ vnpayEnabled: isVnpayConfigured(), codEnabled: true, depositRate: await getDepositRate() })
}

// Thông tin thanh toán tối thiểu của một đơn (dùng cho trang kết quả).
export async function getPaymentStatus(req, res, next) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { code: req.params.code },
      include: { property: { select: { name: true } }, tour: { select: { title: true } } },
    })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })
    res.json({
      code: booking.code,
      status: booking.status,
      paymentMethod: booking.paymentMethod,
      totalPrice: booking.totalPrice,
      depositAmount: booking.depositAmount,
      remainingAmount: booking.remainingAmount,
      productName: booking.tour?.title ?? booking.property?.name ?? "",
    })
  } catch (err) {
    next(err)
  }
}

// Ghi nhận đặt cọc thành công cho một đơn (dùng chung COD & VNPAY). BR-41.
// moneyReceived=false với COD (thu tay): giữ chỗ nhưng TIỀN CHƯA NHẬN (paidAmount giữ nguyên,
// Payment ở trạng thái PENDING) — admin xác nhận đã thu sau. VNPAY thì tiền vào ngay.
async function markDeposited(booking, method, transactionId, moneyReceived = true) {
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'DEPOSITED',
        paymentMethod: method,
        transactionId,
        depositPaidAt: moneyReceived ? new Date() : null,
        ...(moneyReceived ? { paidAmount: { increment: booking.depositAmount } } : {}),
      },
    }),
    prisma.payment.create({
      data: {
        bookingId: booking.id,
        method,
        amount: booking.depositAmount,
        status: moneyReceived ? 'SUCCESS' : 'PENDING',
        transactionId,
      },
    }),
  ])
  // BR-47: chỉ trừ lượt mã giảm giá khi tiền thực nhận (VNPAY ngay; COD khi admin xác nhận).
  if (moneyReceived) await consumeDiscountIfAny(booking)
  sendBookingEmail(booking.guestEmail, {
    code: booking.code,
    pin: null,
    productName: '(đơn ' + booking.code + ')',
    totalPrice: booking.totalPrice,
    depositAmount: booking.depositAmount,
    remainingAmount: booking.remainingAmount,
  }).catch((e) => console.error('Gửi email xác nhận cọc thất bại:', e))
}

// UC-11 – Tạo yêu cầu thanh toán cọc. method = COD | VNPAY.
export async function createPayment(req, res, next) {
  try {
    const { code, method } = req.body
    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })

    // BR-42: chống thanh toán lặp.
    if (booking.status === 'DEPOSITED' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      return res.json({ status: 'already_paid', booking: { code: booking.code, status: booking.status } })
    }
    if (booking.status === 'CANCELLED') {
      return res.status(409).json({ message: 'Đơn đã bị hủy' })
    }
    // 2a/BR-25: hết hạn giữ chỗ.
    if (booking.heldUntil && booking.heldUntil < new Date()) {
      return res.status(410).json({ message: 'Hết thời gian giữ chỗ. Vui lòng đặt lại.', code: 'HOLD_EXPIRED' })
    }

    if (method === 'COD') {
      // Thu tay: giữ chỗ nhưng tiền CHƯA nhận — admin xác nhận khi thực thu.
      await markDeposited(booking, 'COD', null, false)
      return res.json({ status: 'success', method: 'COD', booking: { code: booking.code, status: 'DEPOSITED' } })
    }

    if (method === 'VNPAY') {
      if (!isVnpayConfigured()) {
        return res.status(400).json({ message: 'Cổng VNPAY chưa được cấu hình trên máy chủ' })
      }
      const txnRef = `${booking.id}T${Date.now().toString().slice(-8)}`
      const redirectUrl = buildPaymentUrl({
        amount: booking.depositAmount,
        orderId: txnRef,
        orderInfo: `Dat coc don ${booking.code}`,
        ipAddr: req.ip,
        returnUrl: `${BACKEND_URL}/api/payments/vnpay-return`,
      })
      return res.json({ status: 'redirect', redirectUrl })
    }

    return res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' })
  } catch (err) {
    next(err)
  }
}

// UC-11 – VNPAY chuyển hướng trở lại kèm kết quả + chữ ký. BR-40/41.
export async function vnpayReturn(req, res, next) {
  try {
    const result = verifyReturn(req.query)
    const bookingId = Number(String(result.txnRef || '').split('T')[0])
    const booking = Number.isInteger(bookingId)
      ? await prisma.booking.findUnique({ where: { id: bookingId } })
      : null
    const redirect = (status, code = '') =>
      res.redirect(`${CLIENT_URL}/payment-result?code=${encodeURIComponent(code)}&status=${status}`)

    // BR-40: chữ ký không hợp lệ -> nghi ngờ giả mạo, ghi vết, từ chối.
    if (!result.valid) {
      if (booking) {
        await prisma.payment.create({
          data: { bookingId: booking.id, method: 'VNPAY', amount: booking.depositAmount, status: 'FAILED', transactionId: result.transactionId },
        })
      }
      return redirect('invalid', booking?.code || '')
    }
    if (!booking) return redirect('failed')

    // BR-42: đã cọc rồi -> không tạo trùng, coi như thành công.
    if (booking.status === 'DEPOSITED' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      return redirect('success', booking.code)
    }

    if (result.success) {
      await markDeposited(booking, 'VNPAY', result.transactionId)
      return redirect('success', booking.code)
    }

    // Giao dịch thất bại/hủy (5a/6b).
    await prisma.payment.create({
      data: { bookingId: booking.id, method: 'VNPAY', amount: booking.depositAmount, status: 'FAILED', transactionId: result.transactionId },
    })
    return redirect('failed', booking.code)
  } catch (err) {
    next(err)
  }
}

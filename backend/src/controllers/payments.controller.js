import { prisma } from '../lib/prisma.js'
import { sendBookingEmail, sendPayOnDepartureRequestEmail } from '../lib/mailer.js'
import { getDepositRate } from '../lib/booking.js'
import { getSystemConfig } from '../lib/config.js'
import { consumeDiscountIfAny } from '../lib/discount.js'
import { payableTotal } from '../lib/payment.js'
import { maybeIssueInvoice } from '../lib/invoice.js'
import { buildPaymentUrl, isVnpayConfigured, verifyReturn } from '../lib/vnpay.js'
import {
  isStripeConfigured,
  stripePublishableKey,
  holdAmountOverride,
  createPreAuthIntent,
  retrieveIntent,
} from '../lib/stripe.js'

// "Trả sau khi đi tour" — thay cho COD. Giữ 'COD' làm bí danh tương thích dữ liệu cũ.
const isDeferred = (m) => m === 'PAY_ON_DEPARTURE' || m === 'COD'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000'
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

// Cấu hình thanh toán công khai: VNPAY + Stripe (Trả sau) + "Trả sau khi đi tour".
export async function paymentConfig(req, res) {
  const cfg = await getSystemConfig()
  res.json({
    vnpayEnabled: isVnpayConfigured() && cfg.vnpayEnabled !== false,
    stripeEnabled: isStripeConfigured(),
    stripePublishableKey: isStripeConfigured() ? stripePublishableKey() : null,
    codEnabled: cfg.payOnDepartureEnabled !== false, // tương thích cũ
    payOnDepartureEnabled: cfg.payOnDepartureEnabled !== false,
    payOnDepartureMinHours: cfg.payOnDepartureMinHours || 48,
    depositRate: await getDepositRate(),
  })
}

// Thông tin thanh toán của một đơn (dùng cho trang kết quả). Trả thêm trạng thái TIỀN để UI gắn nhãn đúng.
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
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      totalPrice: booking.totalPrice,
      depositAmount: booking.depositAmount,
      remainingAmount: booking.remainingAmount,
      paidAmount: booking.paidAmount,
      cardAuthAmount: booking.cardAuthAmount,
      productName: booking.tour?.title ?? booking.property?.name ?? '',
    })
  } catch (err) {
    next(err)
  }
}

// Mùa cao điểm? (Luồng 3) — tour/homestay bật isPeakSeason thì buộc đặt cọc, ẩn "Trả sau".
async function isPeakBooking(booking) {
  if (booking.tourId) {
    const t = await prisma.tour.findUnique({ where: { id: booking.tourId }, select: { isPeakSeason: true } })
    return Boolean(t?.isPeakSeason)
  }
  if (booking.propertyId) {
    const p = await prisma.property.findUnique({ where: { id: booking.propertyId }, select: { isPeakSeason: true } })
    return Boolean(p?.isPeakSeason)
  }
  return false
}

// ---- Các hàm chuyển trạng thái, mỗi luồng một cách rõ ràng (thay cho markDeposited gộp cũ) ----

// Luồng 2 — VNPAY trả đủ 100%: đơn ĐÃ XÁC NHẬN, tiền ĐÃ THANH TOÁN.
async function markFullyPaid(booking, method, transactionId) {
  const payable = payableTotal(booking)
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: method,
        transactionId,
        depositPaidAt: new Date(),
        paidAmount: payable,
      },
    }),
    prisma.payment.create({
      data: { bookingId: booking.id, method, kind: 'CHARGE', amount: payable, status: 'SUCCESS', transactionId },
    }),
  ])
  await consumeDiscountIfAny(booking)
  // Đã thu đủ 100% -> thử phát hành hóa đơn (nếu đơn có yêu cầu xuất hóa đơn).
  maybeIssueInvoice(booking.id).catch((e) => console.error('Phát hành hóa đơn (trả đủ) thất bại:', e))
  sendBookingEmail(booking.guestEmail, {
    code: booking.code, pin: null, productName: '(đơn ' + booking.code + ')',
    totalPrice: booking.totalPrice, depositAmount: booking.depositAmount, remainingAmount: 0,
  }).catch((e) => console.error('Gửi email xác nhận thanh toán thất bại:', e))
}

// Luồng 3 — VNPAY đặt cọc X%: đơn ĐÃ CỌC một phần.
async function markDepositPaid(booking, method, transactionId) {
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'DEPOSITED',
        paymentStatus: 'PARTIALLY_PAID',
        paymentMethod: method,
        transactionId,
        depositPaidAt: new Date(),
        paidAmount: { increment: booking.depositAmount },
      },
    }),
    prisma.payment.create({
      data: { bookingId: booking.id, method, kind: 'CHARGE', amount: booking.depositAmount, status: 'SUCCESS', transactionId },
    }),
  ])
  await consumeDiscountIfAny(booking)
  // Mới đặt cọc một phần: maybeIssueInvoice sẽ tự bỏ qua (chỉ phát hành khi thu đủ), gọi cho nhất quán.
  maybeIssueInvoice(booking.id).catch((e) => console.error('Kiểm tra phát hành hóa đơn (cọc) thất bại:', e))
  sendBookingEmail(booking.guestEmail, {
    code: booking.code, pin: null, productName: '(đơn ' + booking.code + ')',
    totalPrice: booking.totalPrice, depositAmount: booking.depositAmount, remainingAmount: booking.remainingAmount,
  }).catch((e) => console.error('Gửi email xác nhận cọc thất bại:', e))
}

// Luồng 1 — Trả sau 0đ, ĐÃ GIỮ THẺ bảo lãnh (Stripe pre-auth): đơn ĐÃ XÁC NHẬN, tiền CHƯA trừ.
async function markAuthorizedPayOnDeparture(booking, intentId, authAmount) {
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'AUTHORIZED',
        paymentMethod: 'STRIPE',
        stripePaymentIntentId: intentId,
        cardAuthAmount: authAmount,
        cardAuthStatus: 'REQUIRES_CAPTURE',
      },
    }),
    prisma.payment.create({
      data: { bookingId: booking.id, method: 'STRIPE', kind: 'AUTH', amount: authAmount, status: 'AUTHORIZED', transactionId: intentId },
    }),
  ])
  await consumeDiscountIfAny(booking) // đã có thẻ bảo lãnh -> coi như giữ chỗ chắc chắn
  sendPayOnDepartureRequestEmail(booking.guestEmail, {
    code: booking.code, productName: '(đơn ' + booking.code + ')', payable: payableTotal(booking),
  }).catch((e) => console.error('Gửi email tiếp nhận trả-sau (giữ thẻ) thất bại:', e))
}

// Luồng 1 (dự phòng) — Trả sau nhưng CHƯA bật Stripe: đơn XÁC NHẬN nhưng CHƯA THANH TOÁN, không giữ thẻ.
// KHÔNG còn báo "đã cọc" sai như trước. Không trừ lượt mã giảm giá vì chưa có bảo đảm nào.
async function markUnpaidConfirmed(booking) {
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: 'CONFIRMED', paymentStatus: 'UNPAID', paymentMethod: 'PAY_ON_DEPARTURE' },
  })
  sendPayOnDepartureRequestEmail(booking.guestEmail, {
    code: booking.code, productName: '(đơn ' + booking.code + ')', payable: payableTotal(booking),
  }).catch((e) => console.error('Gửi email tiếp nhận trả-sau thất bại:', e))
}

// Chặn thanh toán lặp / đơn không hợp lệ. Trả null nếu OK, hoặc {status, body} để controller res.
function guardBooking(booking) {
  if (booking.status === 'DEPOSITED' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
    return { already: true }
  }
  if (booking.status === 'CANCELLED') return { http: 409, body: { message: 'Đơn đã bị hủy' } }
  if (booking.heldUntil && booking.heldUntil < new Date()) {
    return { http: 410, body: { message: 'Hết thời gian giữ chỗ. Vui lòng đặt lại.', code: 'HOLD_EXPIRED' } }
  }
  return null
}

// mã vnp_TxnRef mã hóa cả loại thanh toán: B<id>-<F|D>-<ts>
function buildTxnRef(bookingId, payType) {
  return `B${bookingId}-${payType === 'FULL' ? 'F' : 'D'}-${Date.now().toString().slice(-8)}`
}
function parseTxnRef(ref) {
  const m = /^B(\d+)-([FD])-/.exec(String(ref || ''))
  if (!m) return { bookingId: NaN, payType: 'DEPOSIT' }
  return { bookingId: Number(m[1]), payType: m[2] === 'F' ? 'FULL' : 'DEPOSIT' }
}

// UC-11 – Tạo yêu cầu thanh toán. method = VNPAY | PAY_ON_DEPARTURE. payType (VNPAY) = FULL | DEPOSIT.
export async function createPayment(req, res, next) {
  try {
    const { code, method } = req.body
    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })

    const guard = guardBooking(booking)
    if (guard?.already) return res.json({ status: 'already_paid', booking: { code: booking.code, status: booking.status } })
    if (guard) return res.status(guard.http).json(guard.body)

    const peak = await isPeakBooking(booking)

    // ---- Luồng 1: Trả sau 0đ ----
    if (isDeferred(method)) {
      const cfg = await getSystemConfig()
      if (peak) {
        return res.status(400).json({ message: 'Đang mùa cao điểm — vui lòng đặt cọc giữ chỗ, không áp dụng "Trả sau".', code: 'PEAK_SEASON' })
      }
      if (cfg.payOnDepartureEnabled === false) {
        return res.status(400).json({ message: 'Phương thức "Trả sau khi đi tour" hiện đang tắt. Vui lòng thanh toán qua VNPAY.' })
      }
      if (booking.checkIn) {
        const hoursLeft = (new Date(booking.checkIn).getTime() - Date.now()) / 3600000
        if (hoursLeft < (cfg.payOnDepartureMinHours || 48)) {
          return res.status(400).json({
            message: `Chỉ áp dụng "Trả sau khi đi tour" khi còn ít nhất ${cfg.payOnDepartureMinHours} giờ tới ngày đi. Vui lòng thanh toán qua VNPAY.`,
            code: 'TOO_LATE',
          })
        }
      }
      // Có Stripe -> bắt buộc giữ thẻ bảo lãnh trước (frontend mở bước nhập thẻ).
      if (isStripeConfigured()) {
        return res.json({ status: 'need_card' })
      }
      // Không có Stripe -> xác nhận đơn nhưng ghi rõ CHƯA THANH TOÁN (không còn báo "đã cọc" sai).
      await markUnpaidConfirmed(booking)
      return res.json({ status: 'success', method: 'PAY_ON_DEPARTURE', paymentStatus: 'UNPAID', booking: { code: booking.code, status: 'CONFIRMED' } })
    }

    // ---- Luồng 2 & 3: VNPAY ----
    if (method === 'VNPAY') {
      if (!isVnpayConfigured()) return res.status(400).json({ message: 'Cổng VNPAY chưa được cấu hình trên máy chủ' })
      if ((await getSystemConfig()).vnpayEnabled === false) return res.status(400).json({ message: 'Phương thức VNPAY hiện đang tắt.' })

      // Mùa cao điểm -> buộc DEPOSIT; ngược lại theo lựa chọn (mặc định FULL = trả thẳng 100%).
      const payType = peak ? 'DEPOSIT' : req.body.payType === 'DEPOSIT' ? 'DEPOSIT' : 'FULL'
      const amount = payType === 'FULL' ? payableTotal(booking) : booking.depositAmount
      const txnRef = buildTxnRef(booking.id, payType)
      const redirectUrl = buildPaymentUrl({
        amount,
        orderId: txnRef,
        orderInfo: `${payType === 'FULL' ? 'Thanh toan' : 'Dat coc'} don ${booking.code}`,
        ipAddr: req.ip,
        returnUrl: `${BACKEND_URL}/api/payments/vnpay-return`,
      })
      return res.json({ status: 'redirect', redirectUrl, payType, amount })
    }

    return res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' })
  } catch (err) {
    next(err)
  }
}

// ---- Luồng 1: Stripe pre-authorization ----

// Tạo PaymentIntent giữ thẻ, trả clientSecret cho frontend xác nhận thẻ.
export async function stripePreAuth(req, res, next) {
  try {
    if (!isStripeConfigured()) return res.status(400).json({ message: 'Stripe chưa được cấu hình trên máy chủ' })
    const { code } = req.body
    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })
    const guard = guardBooking(booking)
    if (guard?.already) return res.json({ status: 'already_paid', booking: { code: booking.code, status: booking.status } })
    if (guard) return res.status(guard.http).json(guard.body)
    if (await isPeakBooking(booking)) return res.status(400).json({ message: 'Đang mùa cao điểm — vui lòng đặt cọc, không áp dụng "Trả sau".', code: 'PEAK_SEASON' })

    // Số tiền giữ: ép qua env, mặc định = tiền cọc (đã tính sẵn) làm mức bảo lãnh chống bùng.
    const amount = holdAmountOverride() || booking.depositAmount || Math.round(payableTotal(booking) * 0.3)
    const intent = await createPreAuthIntent({ amount, metadata: { bookingCode: booking.code } })
    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripePaymentIntentId: intent.id, cardAuthAmount: amount, cardAuthStatus: 'PENDING' },
    })
    res.json({ clientSecret: intent.client_secret, publishableKey: stripePublishableKey(), amount })
  } catch (err) {
    next(err)
  }
}

// Xác nhận sau khi frontend liên kết thẻ thành công: kiểm tra intent đã ở trạng thái giữ tiền.
export async function stripeConfirm(req, res, next) {
  try {
    if (!isStripeConfigured()) return res.status(400).json({ message: 'Stripe chưa được cấu hình' })
    const { code, paymentIntentId } = req.body
    const booking = await prisma.booking.findUnique({ where: { code } })
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy đơn' })
    const guard = guardBooking(booking)
    if (guard?.already) return res.json({ status: 'already_paid', booking: { code: booking.code, status: booking.status } })
    if (guard) return res.status(guard.http).json(guard.body)

    const intent = await retrieveIntent(paymentIntentId)
    if (!intent || intent.metadata?.bookingCode !== booking.code) {
      return res.status(400).json({ message: 'Giao dịch không khớp với đơn' })
    }
    // 'requires_capture' = thẻ đã được giữ tiền thành công (manual capture).
    if (intent.status !== 'requires_capture') {
      return res.status(400).json({ message: 'Chưa giữ được thẻ. Vui lòng thử lại.', code: 'AUTH_FAILED', stripeStatus: intent.status })
    }
    await markAuthorizedPayOnDeparture(booking, intent.id, intent.amount)
    res.json({ status: 'success', method: 'STRIPE', paymentStatus: 'AUTHORIZED', booking: { code: booking.code, status: 'CONFIRMED' } })
  } catch (err) {
    next(err)
  }
}

// UC-11 – VNPAY chuyển hướng trở lại kèm kết quả + chữ ký. BR-40/41.
export async function vnpayReturn(req, res, next) {
  try {
    const result = verifyReturn(req.query)
    const { bookingId, payType } = parseTxnRef(result.txnRef)
    const booking = Number.isInteger(bookingId) ? await prisma.booking.findUnique({ where: { id: bookingId } }) : null
    const redirect = (status, code = '') =>
      res.redirect(`${CLIENT_URL}/payment-result?code=${encodeURIComponent(code)}&status=${status}`)

    if (!result.valid) {
      if (booking) {
        await prisma.payment.create({
          data: { bookingId: booking.id, method: 'VNPAY', kind: 'CHARGE', amount: booking.depositAmount, status: 'FAILED', transactionId: result.transactionId },
        })
      }
      return redirect('invalid', booking?.code || '')
    }
    if (!booking) return redirect('failed')

    if (booking.status === 'DEPOSITED' || booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') {
      return redirect('success', booking.code)
    }

    if (result.success) {
      if (payType === 'FULL') await markFullyPaid(booking, 'VNPAY', result.transactionId)
      else await markDepositPaid(booking, 'VNPAY', result.transactionId)
      return redirect('success', booking.code)
    }

    await prisma.payment.create({
      data: { bookingId: booking.id, method: 'VNPAY', kind: 'CHARGE', amount: booking.depositAmount, status: 'FAILED', transactionId: result.transactionId },
    })
    return redirect('failed', booking.code)
  } catch (err) {
    next(err)
  }
}

import { prisma } from './prisma.js'
import { payableTotal } from './payment.js'
import { issueInvoice } from './einvoice.js'
import { sendInvoiceIssuedEmail, sendInvoiceCanceledEmail } from './mailer.js'

export const MAX_INVOICE_RETRY = 3

// Tên sản phẩm hiển thị trên hóa đơn (homestay -> property.name, tour -> tour.title).
function productNameOf(b) {
  return b.tour?.title || b.property?.name || `Đơn ${b.code}`
}

// Đơn đã thu đủ tiền chưa? (hóa đơn GTGT chỉ phát hành khi đã thanh toán đủ).
function isFullyPaid(b) {
  const payable = payableTotal(b)
  return payable > 0 && (b.paidAmount || 0) >= payable
}

// Lưu/đổi yêu cầu xuất hóa đơn cho một đơn (gọi khi đặt hoặc khi khách bổ sung).
// invoiceInfo: { taxCode?, companyName?, companyAddress?, invoiceEmail }. Trả về bản ghi OrderInvoice.
export async function requestInvoice(bookingId, invoiceInfo) {
  const data = {
    taxCode: invoiceInfo.taxCode?.trim() || null,
    companyName: invoiceInfo.companyName?.trim() || null,
    companyAddress: invoiceInfo.companyAddress?.trim() || null,
    invoiceEmail: invoiceInfo.invoiceEmail.trim(),
  }
  return prisma.orderInvoice.upsert({
    where: { bookingId },
    create: { bookingId, status: 'PENDING', ...data },
    // Chỉ cho sửa thông tin khi chưa phát hành (PENDING/FAILED). ISSUED/CANCELED giữ nguyên.
    update: data,
  })
}

// Trigger phát hành hóa đơn cho một đơn NẾU: có yêu cầu đang chờ (PENDING/FAILED) và đơn đã thu đủ.
// Luôn an toàn khi gọi lặp (idempotent theo trạng thái). Trả về OrderInvoice mới nhất hoặc null.
export async function maybeIssueInvoice(bookingId) {
  const invoice = await prisma.orderInvoice.findUnique({ where: { bookingId } })
  if (!invoice) return null
  // Chỉ phát hành khi đang chờ / lỗi / kẹt xử lý (ISSUED, CANCELED giữ nguyên).
  if (!['PENDING', 'FAILED', 'PROCESSING'].includes(invoice.status)) return invoice
  if (invoice.status === 'FAILED' && invoice.retryCount >= MAX_INVOICE_RETRY) return invoice

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: { select: { name: true } }, tour: { select: { title: true } } },
  })
  if (!booking) return invoice
  if (booking.status === 'CANCELLED') return invoice
  if (!isFullyPaid(booking)) return invoice // chưa thu đủ -> giữ PENDING

  // Đánh dấu đang xử lý rồi gọi phát hành (mô phỏng).
  await prisma.orderInvoice.update({ where: { bookingId }, data: { status: 'PROCESSING' } })

  try {
    const result = await issueInvoice(
      { ...booking, productName: productNameOf(booking) },
      { taxCode: invoice.taxCode, companyName: invoice.companyName, companyAddress: invoice.companyAddress, invoiceEmail: invoice.invoiceEmail },
    )
    const updated = await prisma.orderInvoice.update({
      where: { bookingId },
      data: {
        status: 'ISSUED',
        invoiceNumber: result.invoiceNumber,
        invoiceSerial: result.invoiceSerial,
        reservationCode: result.reservationCode,
        pdfUrl: result.pdfUrl,
        xmlUrl: result.xmlUrl,
        issuedAt: result.issuedAt,
        errorLog: null,
      },
    })
    sendInvoiceIssuedEmail(invoice.invoiceEmail, {
      code: booking.code,
      companyName: invoice.companyName,
      taxCode: invoice.taxCode,
      invoiceNumber: result.invoiceNumber,
      invoiceSerial: result.invoiceSerial,
      reservationCode: result.reservationCode,
      pdfUrl: result.pdfUrl,
    }).catch((e) => console.error('Gửi email hóa đơn thất bại:', e))
    return updated
  } catch (err) {
    const updated = await prisma.orderInvoice.update({
      where: { bookingId },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        errorLog: String(err?.message || err).slice(0, 2000),
      },
    })
    console.error(`[Hóa đơn] Phát hành đơn ${booking.code} thất bại (lần ${updated.retryCount}):`, err?.message || err)
    return updated
  }
}

// Hủy hóa đơn (khi hoàn tiền hoặc admin hủy): chuyển CANCELED + gửi biên bản hủy mô phỏng.
export async function cancelInvoice(bookingId, reason) {
  const invoice = await prisma.orderInvoice.findUnique({
    where: { bookingId },
    include: { booking: { select: { code: true, guestEmail: true } } },
  })
  if (!invoice || invoice.status === 'CANCELED') return invoice || null
  const updated = await prisma.orderInvoice.update({
    where: { bookingId },
    data: { status: 'CANCELED', errorLog: reason ? `Hủy: ${reason}`.slice(0, 2000) : invoice.errorLog },
  })
  sendInvoiceCanceledEmail(invoice.invoiceEmail || invoice.booking.guestEmail, {
    code: invoice.booking.code,
    invoiceNumber: invoice.invoiceNumber,
    reason,
  }).catch((e) => console.error('Gửi email hủy hóa đơn thất bại:', e))
  return updated
}

// Tác vụ nền: thử phát hành lại các hóa đơn còn chờ/đang lỗi (đơn đã thu đủ, retry < tối đa).
export async function sweepPendingInvoices() {
  const candidates = await prisma.orderInvoice.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'FAILED', retryCount: { lt: MAX_INVOICE_RETRY } },
        { status: 'PROCESSING' }, // kẹt PROCESSING (vd server restart giữa chừng) -> thử lại
      ],
    },
    select: { bookingId: true },
    take: 200,
  })
  let issued = 0
  for (const c of candidates) {
    try {
      const inv = await maybeIssueInvoice(c.bookingId)
      if (inv?.status === 'ISSUED') issued++
    } catch (e) {
      console.error('[Hóa đơn sweep] lỗi đơn', c.bookingId, e?.message || e)
    }
  }
  return { checked: candidates.length, issued }
}

import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { maybeIssueInvoice, cancelInvoice, MAX_INVOICE_RETRY } from '../../lib/invoice.js'

const VALID_STATUS = ['PENDING', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELED']

function invoiceDto(inv) {
  return {
    id: inv.id,
    bookingCode: inv.booking?.code ?? null,
    bookingStatus: inv.booking?.status ?? null,
    productName: inv.booking?.tour?.title ?? inv.booking?.property?.name ?? '',
    guestName: inv.booking?.guestName ?? null,
    paidAmount: inv.booking?.paidAmount ?? 0,
    totalPrice: inv.booking?.totalPrice ?? 0,
    taxCode: inv.taxCode,
    companyName: inv.companyName,
    companyAddress: inv.companyAddress,
    invoiceEmail: inv.invoiceEmail,
    status: inv.status,
    invoiceNumber: inv.invoiceNumber,
    invoiceSerial: inv.invoiceSerial,
    reservationCode: inv.reservationCode,
    pdfUrl: inv.pdfUrl,
    xmlUrl: inv.xmlUrl,
    errorLog: inv.errorLog,
    retryCount: inv.retryCount,
    maxRetry: MAX_INVOICE_RETRY,
    issuedAt: inv.issuedAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  }
}

const bookingInclude = {
  booking: {
    select: {
      code: true,
      status: true,
      guestName: true,
      guestEmail: true,
      paidAmount: true,
      totalPrice: true,
      property: { select: { name: true } },
      tour: { select: { title: true } },
    },
  },
}

// GET /api/admin/invoices?status=... — danh sách hóa đơn, lọc theo trạng thái + tìm theo mã đơn/MST.
export async function listInvoices(req, res, next) {
  try {
    const { status, search } = req.query
    const where = {}
    if (status && VALID_STATUS.includes(String(status))) where.status = String(status)
    if (search) {
      const s = String(search).trim()
      where.OR = [
        { invoiceNumber: { contains: s } },
        { taxCode: { contains: s } },
        { companyName: { contains: s } },
        { booking: { code: { contains: s } } },
      ]
    }
    const items = await prisma.orderInvoice.findMany({
      where,
      include: bookingInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    // Thống kê nhanh theo trạng thái (cho thẻ tổng quan ở UI).
    const grouped = await prisma.orderInvoice.groupBy({ by: ['status'], _count: { _all: true } })
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]))
    res.json({ items: items.map(invoiceDto), counts })
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/invoices/:id/retry — phát hành lại thủ công một hóa đơn đang PENDING/FAILED.
export async function retryInvoice(req, res, next) {
  try {
    const id = Number(req.params.id)
    const invoice = await prisma.orderInvoice.findUnique({ where: { id } })
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' })
    if (invoice.status === 'ISSUED') return res.status(409).json({ message: 'Hóa đơn đã phát hành, không cần thử lại' })
    if (invoice.status === 'CANCELED') return res.status(409).json({ message: 'Hóa đơn đã hủy, không thể phát hành lại' })

    const result = await maybeIssueInvoice(invoice.bookingId)
    await logAdminAction(req.admin.sub, 'invoice.retry', { entityType: 'OrderInvoice', entityId: id, detail: { status: result?.status } })

    if (result?.status === 'ISSUED') {
      return res.json({ ok: true, invoice: result ? await detailById(id) : null })
    }
    if (result?.status === 'PENDING') {
      return res.status(409).json({ message: 'Đơn chưa thu đủ tiền — hóa đơn sẽ tự phát hành khi thanh toán đủ.' })
    }
    // Vẫn FAILED (hoặc đạt ngưỡng retry)
    return res.status(502).json({ message: result?.errorLog || 'Phát hành hóa đơn thất bại, vui lòng thử lại sau.', invoice: await detailById(id) })
  } catch (err) {
    next(err)
  }
}

// POST /api/admin/invoices/:id/cancel — hủy/điều chỉnh hóa đơn (vd hoàn tiền) + biên bản hủy mô phỏng.
export async function cancelInvoiceAdmin(req, res, next) {
  try {
    const id = Number(req.params.id)
    const invoice = await prisma.orderInvoice.findUnique({ where: { id } })
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' })
    if (invoice.status === 'CANCELED') return res.status(409).json({ message: 'Hóa đơn đã ở trạng thái hủy' })

    const reason = String(req.body?.reason || '').trim() || 'Hủy theo yêu cầu quản trị'
    await cancelInvoice(invoice.bookingId, reason)
    await logAdminAction(req.admin.sub, 'invoice.cancel', { entityType: 'OrderInvoice', entityId: id, detail: { reason } })
    res.json({ ok: true, invoice: await detailById(id) })
  } catch (err) {
    next(err)
  }
}

async function detailById(id) {
  const inv = await prisma.orderInvoice.findUnique({ where: { id }, include: bookingInclude })
  return inv ? invoiceDto(inv) : null
}

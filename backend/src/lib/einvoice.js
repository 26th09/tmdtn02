import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from './prisma.js'
import { UPLOAD_DIR, publicUploadUrl } from './uploads.js'
import { getSystemConfig } from './config.js'
import { payableTotal, splitTax } from './payment.js'

// Hóa đơn điện tử MÔ PHỎNG (không nối nhà cung cấp IVAN thật — chưa có hợp đồng/credentials).
// Cùng mẫu "configured-or-dev" như lib/vnpay.js, lib/stripe.js, lib/mailer.js: ở đây luôn chạy
// ở chế độ mô phỏng, tự sinh số hóa đơn + file HTML để demo đầy đủ luồng nghiệp vụ.

// Thông tin người bán (StayTour). Có thể ghi đè bằng biến môi trường khi triển khai.
const SELLER = {
  name: process.env.INVOICE_SELLER_NAME || 'CÔNG TY TNHH DU LỊCH STAYTOUR',
  taxCode: process.env.INVOICE_SELLER_TAXCODE || '0101234567',
  address: process.env.INVOICE_SELLER_ADDRESS || 'Đại học Phenikaa, P. Yên Nghĩa, Hà Nội',
  phone: process.env.INVOICE_SELLER_PHONE || '0784369189',
  email: process.env.INVOICE_SELLER_EMAIL || 'hoadon@staytour.example',
}

// Vài mã số thuế mẫu để nút "Kiểm tra" ở checkout trả về tên/địa chỉ đẹp khi demo.
const SAMPLE_TAXCODES = {
  '0101234567': { companyName: 'CÔNG TY TNHH DU LỊCH STAYTOUR', companyAddress: 'Đại học Phenikaa, P. Yên Nghĩa, Hà Nội' },
  '0312345678': { companyName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ FPT', companyAddress: 'Số 10 Phạm Văn Bạch, Cầu Giấy, Hà Nội' },
  '0100686209': { companyName: 'TẬP ĐOÀN VINGROUP - CÔNG TY CỔ PHẦN', companyAddress: 'Số 7 Bằng Lăng 1, Vinhomes Riverside, Long Biên, Hà Nội' },
  '0309532909': { companyName: 'CÔNG TY CỔ PHẦN VNG', companyAddress: 'Z06 Đường số 13, KCX Tân Thuận, Quận 7, TP.HCM' },
}

const isValidTaxCode = (mst) => /^\d{10}(\d{3})?$/.test(String(mst || '').trim())

// Tra cứu MST (mô phỏng): trả tên + địa chỉ công ty. MST mẫu -> dữ liệu thật; còn lại sinh tên giả.
export async function lookupTaxCode(mst) {
  const code = String(mst || '').trim()
  if (!isValidTaxCode(code)) {
    return { ok: false, message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số' }
  }
  const sample = SAMPLE_TAXCODES[code]
  if (sample) return { ok: true, taxCode: code, ...sample }
  // MST hợp lệ nhưng không có trong danh sách mẫu -> sinh thông tin giả ổn định theo MST.
  return {
    ok: true,
    taxCode: code,
    companyName: `CÔNG TY TNHH MST ${code}`,
    companyAddress: 'Việt Nam',
  }
}

const pad = (n, len) => String(n).padStart(len, '0')

// Ký hiệu hóa đơn theo năm: C + 2 số cuối năm + "TBA" (mẫu mô phỏng), vd 2026 -> "C26TBA".
function invoiceSerialForYear(year) {
  return `C${pad(year % 100, 2)}TBA`
}

// Số hóa đơn tăng dần toàn hệ thống (mô phỏng). Lấy số lớn nhất đã phát hành + 1.
async function nextInvoiceNumber() {
  const last = await prisma.orderInvoice.findFirst({
    where: { invoiceNumber: { not: null } },
    orderBy: { id: 'desc' },
    select: { invoiceNumber: true },
  })
  const n = last?.invoiceNumber ? parseInt(last.invoiceNumber, 10) || 0 : 0
  return pad(n + 1, 8)
}

const fmtMoney = (n) => (n || 0).toLocaleString('vi-VN') + '₫'
const fmtDate = (d) => new Date(d).toLocaleString('vi-VN')

// Dựng nội dung HTML hóa đơn (file tĩnh phục vụ làm pdfUrl mô phỏng). productName có thể undefined.
function renderInvoiceHtml({ booking, info, invoiceNumber, invoiceSerial, reservationCode, issuedAt, vatPercent }) {
  const gross = booking.paidAmount > 0 ? booking.paidAmount : payableTotal(booking)
  const { tax, afterTax } = splitTax(gross, vatPercent)
  const productName = booking.productName || `Đơn ${booking.code}`
  const qty = booking.type === 'TOUR' ? (booking.guests || 0) + (booking.children || 0) : booking.nights || 1
  const buyer = info.companyName
    ? `${info.companyName}${info.taxCode ? ` — MST: ${info.taxCode}` : ''}<br/>${info.companyAddress || ''}`
    : `${booking.guestName} (khách lẻ)`
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Hóa đơn ${invoiceSerial} ${invoiceNumber} — StayTour</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;max-width:760px;margin:24px auto;padding:0 20px;line-height:1.55}
  h1{text-align:center;color:#b45309;font-size:22px;margin:4px 0}
  .sub{text-align:center;color:#64748b;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border:1px solid #cbd5e1;padding:8px 10px;font-size:14px}
  th{background:#fef3c7;text-align:left}
  .r{text-align:right}.muted{color:#64748b;font-size:13px}
  .box{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .box>div{flex:1;min-width:240px}
  .tot td{font-weight:700;background:#f8fafc}
  .seal{margin-top:28px;text-align:center;color:#16a34a;font-weight:700}
</style></head><body>
<h1>HÓA ĐƠN GIÁ TRỊ GIA TĂNG (ĐIỆN TỬ)</h1>
<p class="sub">Ký hiệu: <strong>${invoiceSerial}</strong> &nbsp;•&nbsp; Số: <strong>${invoiceNumber}</strong> &nbsp;•&nbsp; Ngày phát hành: ${fmtDate(issuedAt)}</p>
<div class="box">
  <div>
    <p class="muted">ĐƠN VỊ BÁN HÀNG</p>
    <p><strong>${SELLER.name}</strong><br/>MST: ${SELLER.taxCode}<br/>${SELLER.address}<br/>ĐT: ${SELLER.phone} · ${SELLER.email}</p>
  </div>
  <div>
    <p class="muted">NGƯỜI MUA HÀNG</p>
    <p>${buyer}<br/>Email nhận HĐ: ${info.invoiceEmail}</p>
  </div>
</div>
<table>
  <thead><tr><th>STT</th><th>Nội dung dịch vụ</th><th>SL</th><th class="r">Thành tiền (đã gồm VAT)</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>${productName} — mã đơn ${booking.code}</td><td>${qty}</td><td class="r">${fmtMoney(gross)}</td></tr>
  </tbody>
  <tfoot>
    <tr><td colspan="3" class="r">Tiền hàng (chưa VAT)</td><td class="r">${fmtMoney(afterTax)}</td></tr>
    <tr><td colspan="3" class="r">Thuế GTGT (${vatPercent || 0}%)</td><td class="r">${fmtMoney(tax)}</td></tr>
    <tr class="tot"><td colspan="3" class="r">TỔNG THANH TOÁN</td><td class="r">${fmtMoney(gross)}</td></tr>
  </tfoot>
</table>
<p class="muted">Mã tra cứu hóa đơn: <strong>${reservationCode}</strong> — tra tại cổng hóa đơn điện tử của nhà cung cấp.</p>
<p class="seal">✔ HÓA ĐƠN ĐÃ ĐƯỢC CẤP (mô phỏng demo — không có giá trị pháp lý)</p>
</body></html>`
}

// Cho phép ép lỗi phát hành để kiểm thử cơ chế retry (đặt EINVOICE_FORCE_FAIL=1).
function shouldForceFail() {
  return process.env.EINVOICE_FORCE_FAIL === '1'
}

// Phát hành hóa đơn (mô phỏng): sinh số + ký hiệu + mã tra cứu, ghi file HTML vào uploads,
// trả về { status:'ISSUED', invoiceNumber, invoiceSerial, reservationCode, pdfUrl, issuedAt }.
// Ném lỗi nếu mô phỏng thất bại (để controller/sweep ghi FAILED + retry).
// `booking` cần: id, code, type, guests, children, nights, paidAmount, totalPrice, discountAmount, guestName, productName.
export async function issueInvoice(booking, info) {
  if (shouldForceFail()) {
    throw new Error('Mô phỏng lỗi phát hành hóa đơn (EINVOICE_FORCE_FAIL)')
  }

  const issuedAt = new Date()
  const invoiceSerial = invoiceSerialForYear(issuedAt.getFullYear())
  const invoiceNumber = await nextInvoiceNumber()
  const reservationCode = crypto.randomBytes(5).toString('hex').toUpperCase() // 10 ký tự

  const cfg = await getSystemConfig()
  const html = renderInvoiceHtml({
    booking,
    info,
    invoiceNumber,
    invoiceSerial,
    reservationCode,
    issuedAt,
    vatPercent: cfg.vatPercent || 0,
  })

  const filename = `hoadon_${booking.code}_${invoiceNumber}.html`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), html, 'utf-8')
  const pdfUrl = publicUploadUrl(filename)

  return { status: 'ISSUED', invoiceNumber, invoiceSerial, reservationCode, pdfUrl, xmlUrl: null, issuedAt }
}

export { SELLER }

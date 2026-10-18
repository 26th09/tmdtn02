import { getSystemConfig } from './config.js'

// Số tiền phải trả của đơn (đã trừ giảm giá).
export function payableTotal(b) {
  return Math.max(0, (b.totalPrice || 0) - (b.discountAmount || 0))
}
// Trạng thái thanh toán suy ra từ tiền ĐÃ NHẬN thực tế.
export function paymentState(b) {
  const payable = payableTotal(b)
  if (payable > 0 && (b.paidAmount || 0) >= payable) return 'PAID'
  if ((b.paidAmount || 0) > 0) return 'PARTIAL'
  return 'UNPAID'
}
// Số tiền còn thiếu.
export function outstanding(b) {
  return Math.max(0, payableTotal(b) - (b.paidAmount || 0))
}

// Hạn thanh toán ĐỦ: trước giờ đi/checkin X giờ (cấu hình). checkIn dùng chung cho tour & homestay.
export async function fullPaymentDeadline(b, cfg) {
  const c = cfg || (await getSystemConfig())
  if (!b.checkIn) return null
  return new Date(new Date(b.checkIn).getTime() - (c.fullPaymentHoursBeforeStart || 1) * 3600000)
}
// Hạn thu tay (COD): trong X ngày kể từ khi đặt.
export async function codDeadline(b, cfg) {
  const c = cfg || (await getSystemConfig())
  return new Date(new Date(b.createdAt).getTime() + (c.codDueDays || 7) * 86400000)
}

// Tách thuế GTGT từ một khoản tiền đã GỒM thuế: tax = gross*vat/(100+vat).
export function splitTax(gross, vatPercent) {
  const v = Number(vatPercent) || 0
  const tax = v > 0 ? Math.round((gross * v) / (100 + v)) : 0
  return { gross, tax, afterTax: gross - tax, vatPercent: v }
}

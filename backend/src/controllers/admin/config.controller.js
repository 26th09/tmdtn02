import { prisma } from '../../lib/prisma.js'
import { getSystemConfig, invalidateSystemConfigCache } from '../../lib/config.js'
import { logAdminAction } from '../../lib/auditLog.js'

// UC-23 – Xem cấu hình hệ thống hiện tại (BR-113/114).
export async function getConfig(req, res, next) {
  try {
    const config = await getSystemConfig()
    res.json({ config })
  } catch (err) {
    next(err)
  }
}

// 3a: tỷ lệ ngoài khoảng cho phép, hoặc các mốc thời gian mâu thuẫn.
const has = (v) => v != null && v !== ''
// Chỉ kiểm tra các trường ĐƯỢC GỬI (cho phép lưu từng phần từ nhiều trang cấu hình).
function validatePayload(body) {
  if (has(body.depositRatePercent)) {
    const deposit = Number(body.depositRatePercent)
    if (!Number.isInteger(deposit) || deposit < 1 || deposit > 100) return 'Tỷ lệ đặt cọc phải là số nguyên từ 1 đến 100'
  }
  if (has(body.cancelFreeHours)) {
    const freeHours = Number(body.cancelFreeHours)
    if (!Number.isInteger(freeHours) || freeHours < 0) return 'Số giờ miễn phí hủy không hợp lệ'
  }
  if (has(body.cancelTier1Days) && has(body.cancelTier2Days)) {
    const t1 = Number(body.cancelTier1Days)
    const t2 = Number(body.cancelTier2Days)
    if (t2 >= t1) return 'Mốc ngày (mức 2) phải nhỏ hơn mốc ngày (mức 1)'
  }
  if (has(body.cancelTier1Ratio) && has(body.cancelTier2Ratio)) {
    if (Number(body.cancelTier2Ratio) > Number(body.cancelTier1Ratio)) return 'Tỷ lệ hoàn (mức 2) không được lớn hơn mức 1'
  }
  if (body.sellerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.sellerEmail))) {
    return 'Email người bán không hợp lệ'
  }
  return null
}
const numField = (b, k) => (has(b[k]) ? { [k]: Number(b[k]) } : {})
const strField = (b, k) => (b[k] !== undefined ? { [k]: b[k] || null } : {})
const boolField = (b, k) => (b[k] != null ? { [k]: Boolean(b[k]) } : {})

// UC-23 (3) – Cập nhật cấu hình hệ thống.
// BR-115: không hồi tố — chỉ ảnh hưởng đơn/giao dịch phát sinh SAU thời điểm cập nhật, vì mọi nơi
// dùng cấu hình (tỷ lệ cọc lúc tạo đơn, tỷ lệ hoàn lúc hủy) đều đọc giá trị SỐNG tại thời điểm thao tác
// rồi lưu snapshot ngay trên Booking/RefundRequest — không có logic tính lại cho các đơn đã tồn tại.
export async function updateConfig(req, res, next) {
  try {
    const issue = validatePayload(req.body)
    if (issue) return res.status(400).json({ message: issue }) // 3a

    const b = req.body
    const data = {
      ...numField(b, 'depositRatePercent'),
      ...numField(b, 'cancelFreeHours'),
      ...numField(b, 'cancelTier1Days'), ...numField(b, 'cancelTier1Ratio'),
      ...numField(b, 'cancelTier2Days'), ...numField(b, 'cancelTier2Ratio'),
      ...numField(b, 'cancelTier3Days'), ...numField(b, 'cancelTier3Ratio'),
      ...boolField(b, 'vnpayEnabled'), ...boolField(b, 'payOnDepartureEnabled'),
      ...numField(b, 'vatPercent'), ...numField(b, 'fullPaymentHoursBeforeStart'),
      ...numField(b, 'codDueDays'), ...numField(b, 'payOnDepartureMinHours'),
      ...strField(b, 'sellerName'), ...strField(b, 'sellerAddress'),
      ...strField(b, 'sellerPhone'), ...strField(b, 'sellerEmail'), ...strField(b, 'siteNotice'),
    }

    const config = await prisma.systemConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
    invalidateSystemConfigCache()

    await logAdminAction(req.admin.sub, 'config.update', { entityType: 'SystemConfig', entityId: 1, detail: data })

    res.json({ config })
  } catch (err) {
    next(err)
  }
}

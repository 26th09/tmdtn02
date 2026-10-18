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
function validatePayload(body) {
  const deposit = Number(body.depositRatePercent)
  if (!Number.isInteger(deposit) || deposit < 1 || deposit > 100) {
    return 'Tỷ lệ đặt cọc phải là số nguyên từ 1 đến 100'
  }

  const freeHours = Number(body.cancelFreeHours)
  if (!Number.isInteger(freeHours) || freeHours < 0) return 'Số giờ miễn phí hủy không hợp lệ'

  const tier1Days = Number(body.cancelTier1Days)
  const tier2Days = Number(body.cancelTier2Days)
  if (!Number.isInteger(tier1Days) || tier1Days < 0) return 'Mốc ngày (mức 1) không hợp lệ'
  if (!Number.isInteger(tier2Days) || tier2Days < 0) return 'Mốc ngày (mức 2) không hợp lệ'
  if (tier2Days >= tier1Days) return 'Mốc ngày (mức 2) phải nhỏ hơn mốc ngày (mức 1) — các mốc thời gian mâu thuẫn' // 3a

  const tier1Ratio = Number(body.cancelTier1Ratio)
  const tier2Ratio = Number(body.cancelTier2Ratio)
  if (!Number.isInteger(tier1Ratio) || tier1Ratio < 0 || tier1Ratio > 100) return 'Tỷ lệ hoàn (mức 1) phải từ 0 đến 100'
  if (!Number.isInteger(tier2Ratio) || tier2Ratio < 0 || tier2Ratio > 100) return 'Tỷ lệ hoàn (mức 2) phải từ 0 đến 100'
  if (tier2Ratio > tier1Ratio) return 'Tỷ lệ hoàn (mức 2) không được lớn hơn tỷ lệ hoàn (mức 1)'

  if (body.sellerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.sellerEmail))) {
    return 'Email người bán không hợp lệ'
  }
  return null
}

// UC-23 (3) – Cập nhật cấu hình hệ thống.
// BR-115: không hồi tố — chỉ ảnh hưởng đơn/giao dịch phát sinh SAU thời điểm cập nhật, vì mọi nơi
// dùng cấu hình (tỷ lệ cọc lúc tạo đơn, tỷ lệ hoàn lúc hủy) đều đọc giá trị SỐNG tại thời điểm thao tác
// rồi lưu snapshot ngay trên Booking/RefundRequest — không có logic tính lại cho các đơn đã tồn tại.
export async function updateConfig(req, res, next) {
  try {
    const issue = validatePayload(req.body)
    if (issue) return res.status(400).json({ message: issue }) // 3a

    const data = {
      depositRatePercent: Number(req.body.depositRatePercent),
      cancelFreeHours: Number(req.body.cancelFreeHours),
      cancelTier1Days: Number(req.body.cancelTier1Days),
      cancelTier1Ratio: Number(req.body.cancelTier1Ratio),
      cancelTier2Days: Number(req.body.cancelTier2Days),
      cancelTier2Ratio: Number(req.body.cancelTier2Ratio),
      sellerName: req.body.sellerName || null,
      sellerAddress: req.body.sellerAddress || null,
      sellerPhone: req.body.sellerPhone || null,
      sellerEmail: req.body.sellerEmail || null,
      siteNotice: req.body.siteNotice || null,
      // Tài chính (chỉ cập nhật khi được gửi).
      ...(req.body.vatPercent != null && req.body.vatPercent !== '' ? { vatPercent: Number(req.body.vatPercent) } : {}),
      ...(req.body.fullPaymentHoursBeforeStart != null && req.body.fullPaymentHoursBeforeStart !== '' ? { fullPaymentHoursBeforeStart: Number(req.body.fullPaymentHoursBeforeStart) } : {}),
      ...(req.body.codDueDays != null && req.body.codDueDays !== '' ? { codDueDays: Number(req.body.codDueDays) } : {}),
      ...(req.body.payOnDepartureMinHours != null && req.body.payOnDepartureMinHours !== '' ? { payOnDepartureMinHours: Number(req.body.payOnDepartureMinHours) } : {}),
    }

    const config = await prisma.systemConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
    invalidateSystemConfigCache()

    await logAdminAction(req.admin.sub, 'config.update', { entityType: 'SystemConfig', entityId: 1, detail: data })

    res.json({ config })
  } catch (err) {
    next(err)
  }
}

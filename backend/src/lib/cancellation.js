// UC-14 – Chính sách hủy theo mốc thời gian (BR-55/56).
// UC-23/BR-114: các mốc thời gian và tỷ lệ hoàn tiền do quản trị viên cấu hình (SystemConfig),
// mặc định khớp nội dung đã công bố ở UC-04/UC-09/10: miễn phí hủy trong 24h đầu; hủy trước >=7 ngày
// so với ngày nhận/khởi hành hoàn 100%; hủy trước >=3 ngày (nhưng <7) hoàn 50%; dưới 3 ngày không hoàn.
import { getSystemConfig } from './config.js'
import { prisma } from './prisma.js'

const CANCELLABLE_STATUSES = ['PENDING_DEPOSIT', 'DEPOSITED', 'CONFIRMED']

// UC-23/BR-114: lấy chính sách hủy áp dụng cho đơn (tour hoặc homestay có gắn CancellationPolicy),
// nếu không có thì dùng cấu hình mặc định (SystemConfig). Trả về { freeHours, tiers: [{days, rate}] } desc.
async function resolvePolicy(booking) {
  let policyId = null
  if (booking.tourId) {
    policyId = (await prisma.tour.findUnique({ where: { id: booking.tourId }, select: { cancellationPolicyId: true } }))?.cancellationPolicyId
  } else if (booking.propertyId) {
    policyId = (await prisma.property.findUnique({ where: { id: booking.propertyId }, select: { cancellationPolicyId: true } }))?.cancellationPolicyId
  }
  if (policyId) {
    const policy = await prisma.cancellationPolicy.findUnique({
      where: { id: policyId },
      include: { milestones: { orderBy: { daysBefore: 'desc' } } },
    })
    if (policy) {
      if (!policy.isRefundable) return { freeHours: 0, tiers: [] }
      return { freeHours: policy.freeHours, tiers: policy.milestones.map((m) => ({ days: m.daysBefore, rate: m.refundRate })) }
    }
  }
  const cfg = await getSystemConfig()
  return {
    freeHours: cfg.cancelFreeHours,
    tiers: [
      { days: cfg.cancelTier1Days, rate: cfg.cancelTier1Ratio },
      { days: cfg.cancelTier2Days, rate: cfg.cancelTier2Ratio },
      { days: cfg.cancelTier3Days, rate: cfg.cancelTier3Ratio },
    ].sort((a, b) => b.days - a.days),
  }
}

// UC-14 – Tính mức hoàn tiền dự kiến cho một đơn tại thời điểm hiện tại.
// Trả về { eligible, reason, amountPaid, refundAmount, ratio } — không thay đổi dữ liệu (chỉ xem trước).
export async function computeRefund(booking, now = new Date()) {
  // BR-54: chỉ đơn ở trạng thái cho phép hủy.
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    const reason =
      booking.status === 'CANCELLED'
        ? 'Đơn đã được hủy trước đó'
        : booking.status === 'COMPLETED'
          ? 'Đơn đã hoàn tất, không thể hủy'
          : 'Đơn không đủ điều kiện hủy'
    return { eligible: false, reason, amountPaid: 0, refundAmount: 0, ratio: 0 }
  }

  // Chưa phát sinh khoản đã trả (đơn còn "chờ cọc") -> hủy không có hoàn tiền (tương tự 3a COD chưa trả).
  const amountPaid = booking.status === 'PENDING_DEPOSIT' ? 0 : booking.depositAmount
  if (amountPaid <= 0) {
    return { eligible: true, reason: null, amountPaid: 0, refundAmount: 0, ratio: 0 }
  }

  const policy = await resolvePolicy(booking)

  // Miễn phí hủy trong X giờ đầu sau khi đặt, bất kể còn bao lâu tới ngày nhận/khởi hành.
  const hoursSinceBooked = (now - new Date(booking.createdAt)) / 3600000
  if (policy.freeHours > 0 && hoursSinceBooked <= policy.freeHours) {
    return { eligible: true, reason: null, amountPaid, refundAmount: amountPaid, ratio: 100 }
  }

  // Theo khoảng cách tới ngày nhận phòng/khởi hành: lấy mốc lớn nhất mà daysUntil vẫn thỏa mãn.
  const eventDate = booking.checkIn ? new Date(booking.checkIn) : null
  const daysUntil = eventDate ? (eventDate - now) / 86400000 : 0

  let ratio = 0
  for (const tier of policy.tiers) {
    if (daysUntil >= tier.days) {
      ratio = tier.rate
      break
    }
  }

  const refundAmount = Math.round((amountPaid * ratio) / 100)
  return { eligible: true, reason: null, amountPaid, refundAmount, ratio }
}

import { prisma } from '../../lib/prisma.js'
import { getSystemConfig } from '../../lib/config.js'
import { splitTax } from '../../lib/payment.js'

const DAY_MS = 86400000

function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date()
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 29 * DAY_MS)
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10)
}

// UC-22 – Báo cáo & thống kê tổng hợp (chỉ đọc — BR-108). Trả về cả 4 loại báo cáo cùng lúc
// cho một khoảng thời gian, để trang quản trị hiển thị dạng dashboard duy nhất.
export async function getReports(req, res, next) {
  try {
    const { from, to } = parseRange(req.query)

    // ----- Doanh thu (BR-109): tiền đã thanh toán thành công trừ đi các khoản đã hoàn tiền -----
    const payments = await prisma.payment.findMany({
      where: { status: 'SUCCESS', createdAt: { gte: from, lte: to } },
      select: { amount: true, createdAt: true },
    })
    const refunds = await prisma.refundRequest.findMany({
      where: { status: 'PROCESSED', createdAt: { gte: from, lte: to } },
      select: { amount: true, createdAt: true },
    })
    const byDayMap = new Map()
    for (const p of payments) byDayMap.set(dayKey(p.createdAt), (byDayMap.get(dayKey(p.createdAt)) || 0) + p.amount)
    for (const r of refunds) byDayMap.set(dayKey(r.createdAt), (byDayMap.get(dayKey(r.createdAt)) || 0) - r.amount)
    const grossRevenue = payments.reduce((s, p) => s + p.amount, 0)
    const refundedAmount = refunds.reduce((s, r) => s + r.amount, 0)
    const revenueByDay = [...byDayMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, amount]) => ({ date, amount }))

    // ----- Đơn theo trạng thái -----
    const bookingsInRange = await prisma.booking.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { status: true, type: true, productId: true, tourId: true, guests: true, children: true },
    })
    const statusMap = new Map()
    for (const b of bookingsInRange) statusMap.set(b.status, (statusMap.get(b.status) || 0) + 1)
    const ordersByStatus = [...statusMap.entries()].map(([status, count]) => ({ status, count }))

    // ----- Tour bán chạy (BR-110): số chỗ đã đặt theo tour, trừ đơn đã hủy -----
    const tourBookings = bookingsInRange.filter((b) => b.type === 'TOUR' && b.status !== 'CANCELLED' && b.tourId)
    const tourMap = new Map()
    for (const b of tourBookings) {
      const cur = tourMap.get(b.tourId) || { productId: b.tourId, bookingsCount: 0, seats: 0 }
      cur.bookingsCount += 1
      cur.seats += (b.guests || 0) + (b.children || 0)
      tourMap.set(b.tourId, cur)
    }
    const topTourIds = [...tourMap.values()].sort((a, b) => b.seats - a.seats).slice(0, 10)
    const tourRows = await prisma.tour.findMany({
      where: { id: { in: topTourIds.map((t) => t.productId) } },
      select: { id: true, title: true, slug: true },
    })
    const tourById = new Map(tourRows.map((p) => [p.id, p]))
    const topTours = topTourIds.map((t) => ({ ...t, name: tourById.get(t.productId)?.title, slug: tourById.get(t.productId)?.slug }))

    // ----- Công suất phòng (BR-110): tổng bookedRooms/totalRooms trong kỳ theo từng chỗ nghỉ -----
    // RoomInventory -> RoomType -> Property. Gộp theo propertyId qua roomType.
    const invRows = await prisma.roomInventory.findMany({
      where: { date: { gte: from, lte: to } },
      select: { totalRooms: true, bookedRooms: true, roomType: { select: { propertyId: true, property: { select: { name: true, slug: true } } } } },
    })
    const occMap = new Map()
    for (const r of invRows) {
      const pid = r.roomType.propertyId
      const cur = occMap.get(pid) || { productId: pid, name: r.roomType.property?.name, slug: r.roomType.property?.slug, totalRoomNights: 0, bookedRoomNights: 0 }
      cur.totalRoomNights += r.totalRooms
      cur.bookedRoomNights += r.bookedRooms
      occMap.set(pid, cur)
    }
    const homestayOccupancy = [...occMap.values()]
      .map((o) => ({ ...o, rate: o.totalRoomNights > 0 ? Math.round((o.bookedRoomNights / o.totalRoomNights) * 1000) / 10 : 0 }))
      .sort((a, b) => b.rate - a.rate)

    // ----- Doanh thu theo NHÓM DỊCH VỤ (gồm cả nhóm con qua cộng dồn lên cha) -----
    const paidForGroups = await prisma.payment.findMany({
      where: { status: 'SUCCESS', createdAt: { gte: from, lte: to } },
      select: { amount: true, booking: { select: { tourId: true, propertyId: true } } },
    })
    const tourRev = new Map()
    const propRev = new Map()
    for (const p of paidForGroups) {
      if (p.booking?.tourId) tourRev.set(p.booking.tourId, (tourRev.get(p.booking.tourId) || 0) + p.amount)
      else if (p.booking?.propertyId) propRev.set(p.booking.propertyId, (propRev.get(p.booking.propertyId) || 0) + p.amount)
    }
    const [sgt, sgp, flatGroups] = await Promise.all([
      prisma.serviceGroupTour.findMany({ select: { groupId: true, tourId: true } }),
      prisma.serviceGroupProperty.findMany({ select: { groupId: true, propertyId: true } }),
      prisma.serviceGroup.findMany({ select: { id: true, name: true, parentId: true } }),
    ])
    const parentOf = new Map(flatGroups.map((g) => [g.id, g.parentId]))
    const nameOf = new Map(flatGroups.map((g) => [g.id, g.name]))
    const direct = new Map()
    for (const m of sgt) direct.set(m.groupId, (direct.get(m.groupId) || 0) + (tourRev.get(m.tourId) || 0))
    for (const m of sgp) direct.set(m.groupId, (direct.get(m.groupId) || 0) + (propRev.get(m.propertyId) || 0))
    const groupTotal = new Map()
    for (const [gid, rev] of direct) {
      let cur = gid
      const seen = new Set()
      while (cur != null && !seen.has(cur)) {
        seen.add(cur)
        groupTotal.set(cur, (groupTotal.get(cur) || 0) + rev)
        cur = parentOf.get(cur)
      }
    }
    const revenueByGroup = [...groupTotal.entries()]
      .map(([id, amount]) => ({ id, name: nameOf.get(id), amount }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)

    // Tách thuế GTGT trên doanh thu thuần (giá đã gồm VAT).
    const cfg = await getSystemConfig()
    const net = grossRevenue - refundedAmount
    const { tax, afterTax, vatPercent } = splitTax(net, cfg.vatPercent)

    // 2a: không có dữ liệu trong kỳ — frontend tự hiển thị thông báo khi mọi mảng đều rỗng.
    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue: { gross: grossRevenue, refunded: refundedAmount, net, vatPercent, tax, afterTax, byDay: revenueByDay },
      ordersByStatus,
      topTours,
      homestayOccupancy,
      revenueByGroup,
    })
  } catch (err) {
    next(err)
  }
}

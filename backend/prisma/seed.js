import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Ảnh minh hoạ (Unsplash) — chỉ dùng cho dữ liệu demo.
const img = (id, w = 1000) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`

// Kho ảnh dùng chung (các ID Unsplash ổn định) để tạo thư viện nhiều ảnh cho
// từng homestay/phòng/tour. Dùng lại trong nhiều mục để chắc chắn ảnh hiển thị.
const PHOTO_POOL = [
  'photo-1618773928121-c32242e63f39', 'photo-1582719478250-c89cae4dc85b',
  'photo-1566073771259-6a8506099945', 'photo-1501785888041-af3ef285b470',
  'photo-1464822759023-fed622ff2c3b', 'photo-1528127269322-539801943592',
  'photo-1507525428034-b723cf961d3e', 'photo-1519046904884-53103b34b206',
  'photo-1589820296156-2454bb8a6ad1', 'photo-1559592413-7cec4d0cae2b',
  'photo-1535139262971-c51845709a48',
]

// Tạo mảng ảnh (cover + nhiều ảnh phụ) cho quan hệ images: { create: [...] }.
function gallery(coverId, startIndex, count) {
  const out = [{ url: img(coverId), isCover: true, sortOrder: 0 }]
  let added = 1
  let k = startIndex
  let guard = 0
  while (added < count && guard < 100) {
    guard++
    const id = PHOTO_POOL[((k % PHOTO_POOL.length) + PHOTO_POOL.length) % PHOTO_POOL.length]
    k++
    if (id === coverId || out.some((o) => o.url === img(id))) continue
    out.push({ url: img(id), isCover: false, sortOrder: added })
    added++
  }
  return out
}

function addDays(n) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

// Sinh đơn hàng + đánh giá THẬT cho homestay & tour, rồi tính lại điểm trung bình/số lượt.
// Mục tiêu: báo cáo (biểu đồ xếp hạng, danh sách đánh giá) và trang Quản lý đơn phản ánh đúng dữ liệu.
async function seedBookingsAndReviews(props, tours) {
  // Vài tài khoản thành viên để có cả đánh giá của "Thành viên" lẫn "Khách vãng lai".
  const memberSeed = [
    { email: 'an.nguyen@example.com', name: 'Nguyễn Văn An', phone: '0901000001' },
    { email: 'binh.tran@example.com', name: 'Trần Thị Bình', phone: '0901000002' },
    { email: 'cuong.le@example.com', name: 'Lê Hoàng Cường', phone: '0901000003' },
  ]
  const members = []
  for (const m of memberSeed) {
    const u = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name, phone: m.phone, emailVerified: true },
      create: { email: m.email, name: m.name, phone: m.phone, emailVerified: true, password: await bcrypt.hash('User@123456', 10) },
    })
    members.push(u)
  }

  const guests = [
    ['Phạm Thu Hà', 'ha.pham@example.com', '0902000001'],
    ['Đỗ Minh Quân', 'quan.do@example.com', '0902000002'],
    ['Vũ Ngọc Mai', 'mai.vu@example.com', '0902000003'],
    ['Hoàng Anh Tú', 'tu.hoang@example.com', '0902000004'],
    ['Bùi Thanh Tâm', 'tam.bui@example.com', '0902000005'],
    ['Ngô Gia Bảo', 'bao.ngo@example.com', '0902000006'],
  ]
  const comments = [
    'Chuyến đi tuyệt vời, hướng dẫn viên nhiệt tình!',
    'Cảnh đẹp, lịch trình hợp lý, chắc chắn sẽ quay lại.',
    'Dịch vụ tốt, ăn uống ngon, rất đáng tiền.',
    'Phòng sạch sẽ, nhân viên thân thiện.',
    'Khá hài lòng, chỉ tiếc thời tiết chưa thật đẹp.',
    'Trải nghiệm đáng nhớ, cảm ơn StayTour!',
    'Mọi thứ ổn, sẽ giới thiệu cho bạn bè.',
  ]
  const ratingPatterns = [5, 4, 5, 5, 4, 3, 5, 4, 5, 3, 4, 5]
  const pick = (arr, k) => arr[((k % arr.length) + arr.length) % arr.length]

  let seq = 0
  const code = (p) => `${p}${(Date.now() % 100000).toString().padStart(5, '0')}${(++seq).toString().padStart(4, '0')}`
  let gi = 0 // luân phiên khách / comment

  async function makeBooking({ type, status, tourId, tourDepartureId, propertyId, roomTypeId, basePrice, days, pastOffset, rating }) {
    const member = gi % 3 === 0 ? pick(members, gi) : null
    const g = pick(guests, gi)
    const name = member ? member.name : g[0]
    const email = member ? member.email : g[1]
    const phone = member ? member.phone : g[2]
    const adults = 2
    const children = gi % 4 === 0 ? 1 : 0
    const nights = type === 'HOMESTAY' ? Math.max(1, days || 2) : null
    const checkIn = addDays(-pastOffset)
    const checkOut = type === 'HOMESTAY' ? addDays(-pastOffset + (nights || 2)) : null
    const total = type === 'HOMESTAY'
      ? basePrice * (nights || 2)
      : basePrice * adults + Math.round(basePrice * 0.7) * children
    const deposit = Math.round(total * 0.3)
    const paid = status !== 'PENDING_DEPOSIT' && status !== 'CANCELLED'
    const b = await prisma.booking.create({
      data: {
        code: code(type === 'TOUR' ? 'TR' : 'HS'),
        type, status,
        tourId: tourId ?? null, tourDepartureId: tourDepartureId ?? null,
        propertyId: propertyId ?? null, roomTypeId: roomTypeId ?? null,
        userId: member?.id ?? null,
        guestName: name, guestEmail: email, guestPhone: phone,
        checkIn, checkOut, nights,
        guests: adults, children,
        totalPrice: total, depositAmount: deposit, remainingAmount: total - deposit,
        paymentMethod: paid ? (gi % 2 === 0 ? 'VNPAY' : 'COD') : null,
        depositPaidAt: paid ? checkIn : null,
        cancelledAt: status === 'CANCELLED' ? checkIn : null,
        createdAt: addDays(pastOffset > 0 ? -pastOffset - 5 : -2),
      },
    })
    if (rating != null && status === 'COMPLETED') {
      await prisma.review.create({
        data: {
          productType: type, tourId: tourId ?? null, propertyId: propertyId ?? null,
          bookingId: b.id, authorName: name, rating, comment: pick(comments, gi), approved: true, createdAt: checkIn,
        },
      })
    }
    gi++
    return b
  }

  // Tour: đơn hoàn tất + đánh giá (số lượng & điểm khác nhau để xếp hạng có ý nghĩa) + vài đơn chưa hoàn tất.
  for (const [i, t] of tours.entries()) {
    const n = 3 + (i % 5)
    for (let k = 0; k < n; k++) {
      await makeBooking({
        type: 'TOUR', status: 'COMPLETED', tourId: t.id, tourDepartureId: pick(t.departures, k)?.id,
        basePrice: t.basePrice, days: t.days, pastOffset: 12 + ((i + k) % 50), rating: pick(ratingPatterns, i + k),
      })
    }
    if (i % 2 === 0) await makeBooking({ type: 'TOUR', status: 'CONFIRMED', tourId: t.id, tourDepartureId: t.departures[0]?.id, basePrice: t.basePrice, days: t.days, pastOffset: -10 })
    if (i % 3 === 0) await makeBooking({ type: 'TOUR', status: 'PENDING_DEPOSIT', tourId: t.id, tourDepartureId: t.departures[1]?.id, basePrice: t.basePrice, days: t.days, pastOffset: -24 })
    if (i % 5 === 0) await makeBooking({ type: 'TOUR', status: 'CANCELLED', tourId: t.id, tourDepartureId: t.departures[0]?.id, basePrice: t.basePrice, days: t.days, pastOffset: 8 })
  }

  // Homestay: đơn hoàn tất + đánh giá + vài đơn đang xử lý.
  for (const [i, p] of props.entries()) {
    const n = 2 + (i % 4)
    for (let k = 0; k < n; k++) {
      const rt = pick(p.roomTypes, k)
      await makeBooking({
        type: 'HOMESTAY', status: 'COMPLETED', propertyId: p.id, roomTypeId: rt?.id,
        basePrice: rt?.price || p.basePrice, days: 2, pastOffset: 15 + ((i + k) % 45), rating: pick(ratingPatterns, i + k + 2),
      })
    }
    if (i % 2 === 0) {
      const rt = p.roomTypes[0]
      await makeBooking({ type: 'HOMESTAY', status: 'DEPOSITED', propertyId: p.id, roomTypeId: rt?.id, basePrice: rt?.price || p.basePrice, days: 3, pastOffset: -12 })
    }
  }

  // Tính lại điểm trung bình / số lượt từ đánh giá thật (để biểu đồ & chi tiết khớp danh sách).
  for (const t of tours) {
    const rs = await prisma.review.findMany({ where: { tourId: t.id, approved: true }, select: { rating: true } })
    const count = rs.length
    const avg = count ? rs.reduce((s, r) => s + r.rating, 0) / count : 0
    await prisma.tour.update({ where: { id: t.id }, data: { reviewCount: count, avgRating: Math.round(avg * 10) / 10 } })
  }
  for (const p of props) {
    const rs = await prisma.review.findMany({ where: { propertyId: p.id, approved: true }, select: { rating: true } })
    const count = rs.length
    const avg = count ? rs.reduce((s, r) => s + r.rating, 0) / count : 0
    await prisma.property.update({ where: { id: p.id }, data: { reviewCount: count, avgRating: Math.round(avg * 10) / 10 } })
  }
}

async function main() {
  // ---- Dọn dữ liệu cũ (theo thứ tự khoá ngoại an toàn). Giữ bảng User. ----
  await prisma.payment.deleteMany().catch(() => {})
  await prisma.booking.deleteMany().catch(() => {})
  await prisma.review.deleteMany().catch(() => {})
  await prisma.roomInventory.deleteMany().catch(() => {})
  await prisma.roomType.deleteMany().catch(() => {})
  await prisma.property.deleteMany().catch(() => {})
  await prisma.tourPrice.deleteMany().catch(() => {})
  await prisma.tourDeparture.deleteMany().catch(() => {})
  await prisma.travelGuideTour.deleteMany().catch(() => {})
  await prisma.travelGuide.deleteMany().catch(() => {})
  await prisma.tour.deleteMany().catch(() => {})
  await prisma.discountCode.deleteMany().catch(() => {})
  await prisma.promotion.deleteMany().catch(() => {})
  await prisma.area.deleteMany().catch(() => {})
  await prisma.infoArticle.deleteMany().catch(() => {})
  await prisma.category.deleteMany().catch(() => {})

  // ---- Chính sách hủy dùng chung ----
  const policy = await prisma.cancellationPolicy.create({
    data: {
      name: 'Linh hoạt tiêu chuẩn',
      isRefundable: true,
      freeHours: 24,
      milestones: {
        create: [
          { daysBefore: 7, refundRate: 100 },
          { daysBefore: 3, refundRate: 50 },
        ],
      },
    },
  })

  // ---- HOMESTAY (Property + RoomType + RoomInventory) ----
  const homestays = [
    {
      propertyCode: 'HS001', name: 'Pine Hill Homestay', slug: 'pine-hill-homestay',
      address: 'Đà Lạt, Lâm Đồng', basePrice: 850000, thumb: 'photo-1618773928121-c32242e63f39',
      desc: 'Homestay ấm cúng giữa rừng thông Đà Lạt, view đồi lãng mạn.',
      rooms: [
        { name: 'Phòng tiêu chuẩn', bed: '1 giường đôi', occ: 2, total: 6, price: 850000, desc: 'Gọn gàng, ban công nhỏ nhìn ra vườn.' },
        { name: 'Phòng Deluxe', bed: '1 giường lớn', occ: 2, total: 4, price: 1250000, desc: 'Rộng rãi, cửa kính lớn view đồi thông.' },
        { name: 'Phòng Family', bed: '2 giường đôi', occ: 4, total: 2, price: 1800000, desc: 'Phù hợp gia đình 4 người.' },
      ],
    },
    {
      propertyCode: 'HS002', name: 'Biển Ngọc Villa', slug: 'bien-ngoc-villa',
      address: 'Mỹ Khê, Đà Nẵng', basePrice: 1600000, thumb: 'photo-1582719478250-c89cae4dc85b',
      desc: 'Villa sát biển Mỹ Khê, hồ bơi riêng, đầy đủ tiện nghi.',
      rooms: [
        { name: 'Phòng hướng biển', bed: '1 giường lớn', occ: 2, total: 5, price: 1600000, desc: 'Ban công nhìn thẳng ra biển.' },
        { name: 'Suite gia đình', bed: '2 giường lớn', occ: 4, total: 3, price: 2600000, desc: 'Không gian rộng, bếp mini.' },
      ],
    },
    {
      propertyCode: 'HS003', name: 'Sông Trăng Riverside', slug: 'song-trang-riverside',
      address: 'Hội An, Quảng Nam', basePrice: 1100000, thumb: 'photo-1566073771259-6a8506099945',
      desc: 'Nhà vườn bên sông Hoài, đạp xe 5 phút tới phố cổ.',
      rooms: [
        { name: 'Phòng vườn', bed: '1 giường đôi', occ: 2, total: 6, price: 1100000, desc: 'Yên tĩnh, nhìn ra vườn.' },
        { name: 'Phòng view sông', bed: '1 giường lớn', occ: 2, total: 3, price: 1600000, desc: 'Ban công nhìn ra sông Hoài.' },
      ],
    },
    {
      propertyCode: 'HS004', name: 'Nhà Của Rừng', slug: 'nha-cua-rung-sapa',
      address: 'Sa Pa, Lào Cai', basePrice: 700000, thumb: 'photo-1501785888041-af3ef285b470',
      desc: 'Bungalow gỗ giữa thung lũng ruộng bậc thang Sa Pa.',
      rooms: [
        { name: 'Giường tầng (Dorm)', bed: 'Giường tầng', occ: 1, total: 10, price: 350000, desc: 'Tiết kiệm cho khách đi phượt.' },
        { name: 'Cabin gỗ', bed: '1 giường đôi', occ: 2, total: 4, price: 1200000, desc: 'Riêng tư, lò sưởi ấm áp.' },
      ],
    },
    {
      propertyCode: 'HS005', name: 'Mộc Châu Mộc Homestay', slug: 'moc-chau-moc-homestay',
      address: 'Mộc Châu, Sơn La', basePrice: 650000, thumb: 'photo-1535139262971-c51845709a48',
      desc: 'Nhà sàn giữa đồi chè Mộc Châu, săn mây và ngắm hoa mận.',
      rooms: [
        { name: 'Phòng cộng đồng', bed: '4 giường đơn', occ: 4, total: 4, price: 650000, desc: 'Ấm cúng cho nhóm bạn.' },
        { name: 'Nhà sàn riêng', bed: '1 giường lớn', occ: 2, total: 3, price: 1150000, desc: 'View đồi chè, bếp lửa.' },
      ],
    },
    {
      propertyCode: 'HS006', name: 'Tam Cốc Garden Retreat', slug: 'tam-coc-garden-retreat',
      address: 'Ninh Bình', basePrice: 1250000, thumb: 'photo-1566073771259-6a8506099945',
      desc: 'Khu nghỉ sinh thái giữa núi đá Tam Cốc – Tràng An.',
      rooms: [
        { name: 'Bungalow vườn', bed: '1 giường đôi', occ: 2, total: 5, price: 1250000, desc: 'Yên bình giữa vườn xanh.' },
        { name: 'Villa núi đá', bed: '2 giường lớn', occ: 4, total: 2, price: 2200000, desc: 'Hồ bơi riêng, view núi đá.' },
      ],
    },
    {
      propertyCode: 'HS007', name: 'Sao Biển Phú Quốc', slug: 'sao-bien-phu-quoc',
      address: 'Phú Quốc, Kiên Giang', basePrice: 1400000, thumb: 'photo-1582719478250-c89cae4dc85b',
      desc: 'Homestay sát Bãi Sao, cát trắng nước trong, hoàng hôn tuyệt đẹp.',
      rooms: [
        { name: 'Phòng vườn nhiệt đới', bed: '1 giường đôi', occ: 2, total: 6, price: 1400000, desc: 'Gần biển, nhiều cây xanh.' },
        { name: 'Bungalow hướng biển', bed: '1 giường lớn', occ: 2, total: 4, price: 2300000, desc: 'Ngắm hoàng hôn ngay hiên.' },
      ],
    },
    {
      propertyCode: 'HS008', name: 'Phố Cổ Hà Nội Boutique', slug: 'pho-co-ha-noi-boutique',
      address: 'Hoàn Kiếm, Hà Nội', basePrice: 900000, thumb: 'photo-1559592413-7cec4d0cae2b',
      desc: 'Căn hộ ấm cúng giữa phố cổ, đi bộ ra Hồ Gươm 5 phút.',
      rooms: [
        { name: 'Phòng Studio', bed: '1 giường đôi', occ: 2, total: 5, price: 900000, desc: 'Gọn gàng, trung tâm phố cổ.' },
        { name: 'Căn hộ 1 phòng ngủ', bed: '1 giường lớn', occ: 3, total: 3, price: 1500000, desc: 'Bếp riêng, ban công nhìn phố.' },
      ],
    },
    {
      propertyCode: 'HS009', name: 'Cát Bà Sunrise Bungalow', slug: 'cat-ba-sunrise-bungalow',
      address: 'Cát Bà, Hải Phòng', basePrice: 800000, thumb: 'photo-1507525428034-b723cf961d3e',
      desc: 'Bungalow nhìn ra vịnh Lan Hạ, chèo kayak và tắm biển.',
      rooms: [
        { name: 'Phòng tiêu chuẩn', bed: '1 giường đôi', occ: 2, total: 8, price: 800000, desc: 'Tiện nghi, gần bến tàu.' },
        { name: 'Bungalow view vịnh', bed: '1 giường lớn', occ: 2, total: 4, price: 1600000, desc: 'Nhìn thẳng ra vịnh Lan Hạ.' },
      ],
    },
    {
      propertyCode: 'HS010', name: 'An Nhiên Farmstay Bảo Lộc', slug: 'an-nhien-farmstay-bao-loc',
      address: 'Bảo Lộc, Lâm Đồng', basePrice: 950000, thumb: 'photo-1618773928121-c32242e63f39',
      desc: 'Farmstay giữa đồi chè và thác nước, trải nghiệm hái trà.',
      rooms: [
        { name: 'Lều glamping', bed: '1 giường đôi', occ: 2, total: 5, price: 950000, desc: 'Cắm trại tiện nghi giữa đồi chè.' },
        { name: 'Nhà gỗ view thác', bed: '2 giường đôi', occ: 4, total: 2, price: 1900000, desc: 'Gia đình, nghe tiếng thác.' },
      ],
    },
    {
      propertyCode: 'HS011', name: 'Biển Xanh Vũng Tàu', slug: 'bien-xanh-vung-tau',
      address: 'Bãi Sau, Vũng Tàu', basePrice: 1050000, thumb: 'photo-1507525428034-b723cf961d3e',
      desc: 'Căn hộ view biển Bãi Sau, hồ bơi vô cực, gần phố hải sản.',
      rooms: [
        { name: 'Phòng hướng biển', bed: '1 giường lớn', occ: 2, total: 6, price: 1050000, desc: 'Ban công nhìn ra biển, đón bình minh.' },
        { name: 'Căn hộ 2 phòng ngủ', bed: '2 giường lớn', occ: 4, total: 3, price: 1950000, desc: 'Rộng rãi cho nhóm/gia đình.' },
      ],
    },
    {
      propertyCode: 'HS012', name: 'Tuyền Lâm Lake House', slug: 'tuyen-lam-lake-house',
      address: 'Hồ Tuyền Lâm, Đà Lạt', basePrice: 1300000, thumb: 'photo-1589820296156-2454bb8a6ad1',
      desc: 'Nhà gỗ bên hồ Tuyền Lâm, sương mù lãng mạn, chèo SUP buổi sáng.',
      rooms: [
        { name: 'Cabin ven hồ', bed: '1 giường đôi', occ: 2, total: 5, price: 1300000, desc: 'View hồ, lò sưởi.' },
        { name: 'Villa gỗ 2 phòng', bed: '2 giường đôi', occ: 4, total: 2, price: 2400000, desc: 'Bếp riêng, hiên ngắm hồ.' },
      ],
    },
    {
      propertyCode: 'HS013', name: 'Hạ Long Bay Bungalow', slug: 'ha-long-bay-bungalow',
      address: 'Hạ Long, Quảng Ninh', basePrice: 1500000, thumb: 'photo-1582719478250-c89cae4dc85b',
      desc: 'Bungalow nhìn ra vịnh Hạ Long, gần cảng tàu tham quan.',
      rooms: [
        { name: 'Phòng view vịnh', bed: '1 giường lớn', occ: 2, total: 6, price: 1500000, desc: 'Nhìn thẳng ra vịnh di sản.' },
        { name: 'Suite gia đình', bed: '2 giường lớn', occ: 4, total: 2, price: 2700000, desc: 'Phòng khách riêng, bồn tắm.' },
      ],
    },
    {
      propertyCode: 'HS014', name: 'Nhà Vườn Cà Phê Buôn Ma Thuột', slug: 'nha-vuon-ca-phe-buon-ma-thuot',
      address: 'Buôn Ma Thuột, Đắk Lắk', basePrice: 600000, thumb: 'photo-1501785888041-af3ef285b470',
      desc: 'Homestay giữa vườn cà phê, trải nghiệm rang xay và cưỡi voi.',
      rooms: [
        { name: 'Phòng nhà dài Ê-đê', bed: '2 giường đơn', occ: 2, total: 5, price: 600000, desc: 'Đậm bản sắc Tây Nguyên.' },
        { name: 'Bungalow vườn', bed: '1 giường đôi', occ: 2, total: 3, price: 1000000, desc: 'Yên tĩnh giữa vườn cà phê.' },
      ],
    },
    {
      propertyCode: 'HS015', name: 'Mây Núi Cấm An Giang', slug: 'may-nui-cam-an-giang',
      address: 'Núi Cấm, An Giang', basePrice: 550000, thumb: 'photo-1535139262971-c51845709a48',
      desc: 'Homestay trên Núi Cấm, săn mây miền Tây, ngắm đồng lúa Bảy Núi.',
      rooms: [
        { name: 'Phòng tập thể', bed: '4 giường đơn', occ: 4, total: 4, price: 550000, desc: 'Phù hợp nhóm bạn trẻ.' },
        { name: 'Phòng đôi view núi', bed: '1 giường đôi', occ: 2, total: 3, price: 900000, desc: 'Ban công ngắm bình minh trên mây.' },
      ],
    },
  ]

  const createdProps = [] // thu thập để sinh đơn + đánh giá thật
  for (const [hi, h] of homestays.entries()) {
    const prop = await prisma.property.create({
      data: {
        propertyCode: h.propertyCode, name: h.name, slug: h.slug, propertyType: 'HOMESTAY',
        shortDescription: h.desc, description: h.desc, address: h.address,
        checkInTime: '14:00', checkOutTime: '12:00', basePrice: h.basePrice, depositRate: 30,
        cancellationPolicyId: policy.id, avgRating: 0, reviewCount: 0, // tính lại từ đánh giá thật bên dưới
        status: 'VISIBLE', thumbnail: img(h.thumb), isFeatured: true,
        // Thư viện 5 ảnh cho trang chi tiết.
        images: { create: gallery(h.thumb, hi + 1, 5) },
      },
    })
    const roomTypes = []
    for (const [ri, r] of h.rooms.entries()) {
      const rt = await prisma.roomType.create({
        data: {
          propertyId: prop.id, name: r.name, bedType: r.bed, maxOccupancy: r.occ,
          totalRooms: r.total, breakfastIncluded: true, basePricePerNight: r.price, description: r.desc,
          roomSize: 28,
          // 3 ảnh cho mỗi loại phòng.
          images: { create: gallery(h.thumb, hi + ri + 2, 3) },
        },
      })
      roomTypes.push({ id: rt.id, price: r.price })
      // Mở lịch tồn phòng 120 ngày tới.
      const rows = []
      for (let i = 1; i <= 120; i++) {
        rows.push({ roomTypeId: rt.id, date: addDays(i), totalRooms: r.total, bookedRooms: 0, heldRooms: 0 })
      }
      await prisma.roomInventory.createMany({ data: rows })
    }
    createdProps.push({ id: prop.id, name: prop.name, basePrice: h.basePrice, roomTypes })
  }

  // ---- TOUR (Tour + TourDeparture + TourPrice) ----
  const tours = [
    {
      tourCode: 'TR001', title: 'Săn mây Tà Xùa 3N2Đ', slug: 'san-may-ta-xua-3n2d',
      days: 3, nights: 2, basePrice: 2500000, dest: 'Tà Xùa, Sơn La', from: 'Hà Nội',
      thumb: 'photo-1464822759023-fed622ff2c3b', desc: 'Chinh phục sống lưng khủng long, săn biển mây tuyệt đẹp.',
    },
    {
      tourCode: 'TR002', title: 'Khám phá Hà Giang 4N3Đ', slug: 'kham-pha-ha-giang-4n3d',
      days: 4, nights: 3, basePrice: 3900000, dest: 'Hà Giang', from: 'Hà Nội',
      thumb: 'photo-1528127269322-539801943592', desc: 'Cao nguyên đá Đồng Văn, đèo Mã Pí Lèng, sông Nho Quế.',
    },
    {
      tourCode: 'TR003', title: 'Lý Sơn – Đảo tiên 2N1Đ', slug: 'ly-son-dao-tien-2n1d',
      days: 2, nights: 1, basePrice: 1800000, dest: 'Lý Sơn, Quảng Ngãi', from: 'Đà Nẵng',
      thumb: 'photo-1507525428034-b723cf961d3e', desc: 'Đảo núi lửa, bãi biển trong xanh, hải sản tươi ngon.',
    },
    {
      tourCode: 'TR004', title: 'Kỳ Co – Eo Gió 1 ngày', slug: 'ky-co-eo-gio-1-ngay',
      days: 1, nights: 0, basePrice: 650000, dest: 'Quy Nhơn, Bình Định', from: 'Quy Nhơn',
      thumb: 'photo-1519046904884-53103b34b206', desc: 'Biển Kỳ Co ngọc bích, cano vượt sóng, lặn ngắm san hô.',
    },
    {
      tourCode: 'TR005', title: 'Phú Quốc – Thiên đường biển đảo 3N2Đ', slug: 'phu-quoc-thien-duong-bien-dao-3n2d',
      days: 3, nights: 2, basePrice: 3200000, dest: 'Phú Quốc, Kiên Giang', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1582719478250-c89cae4dc85b', desc: 'Cáp treo Hòn Thơm, câu cá, lặn ngắm san hô và hoàng hôn Bãi Sao.',
    },
    {
      tourCode: 'TR006', title: 'Tràng An – Bái Đính – Hang Múa 1 ngày', slug: 'trang-an-bai-dinh-hang-mua-1-ngay',
      days: 1, nights: 0, basePrice: 850000, dest: 'Ninh Bình', from: 'Hà Nội',
      thumb: 'photo-1566073771259-6a8506099945', desc: 'Du thuyền Tràng An, chùa Bái Đính và leo Hang Múa ngắm toàn cảnh.',
    },
    {
      tourCode: 'TR007', title: 'Mộc Châu mùa hoa 2N1Đ', slug: 'moc-chau-mua-hoa-2n1d',
      days: 2, nights: 1, basePrice: 1650000, dest: 'Mộc Châu, Sơn La', from: 'Hà Nội',
      thumb: 'photo-1535139262971-c51845709a48', desc: 'Đồi chè trái tim, thác Dải Yếm, rừng thông bản Áng, vườn hoa.',
    },
    {
      tourCode: 'TR008', title: 'Huế – Hành trình di sản 2N1Đ', slug: 'hue-hanh-trinh-di-san-2n1d',
      days: 2, nights: 1, basePrice: 1950000, dest: 'Huế, Thừa Thiên Huế', from: 'Đà Nẵng',
      thumb: 'photo-1535139262971-c51845709a48', desc: 'Đại Nội, lăng tẩm, chùa Thiên Mụ và thuyền rồng sông Hương.',
    },
    {
      tourCode: 'TR009', title: 'Nha Trang – Tour 4 đảo 3N2Đ', slug: 'nha-trang-tour-4-dao-3n2d',
      days: 3, nights: 2, basePrice: 2800000, dest: 'Nha Trang, Khánh Hòa', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1507525428034-b723cf961d3e', desc: 'Khám phá 4 đảo, lặn biển, tắm bùn khoáng và VinWonders.',
    },
    {
      tourCode: 'TR010', title: 'Miền Tây – Chợ nổi Cái Răng 2N1Đ', slug: 'mien-tay-cho-noi-cai-rang-2n1d',
      days: 2, nights: 1, basePrice: 1500000, dest: 'Cần Thơ', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1528127269322-539801943592', desc: 'Chợ nổi Cái Răng, vườn trái cây, lò hủ tiếu và đờn ca tài tử.',
    },
    {
      tourCode: 'TR011', title: 'Đà Lạt – Thành phố ngàn hoa 3N2Đ', slug: 'da-lat-thanh-pho-ngan-hoa-3n2d',
      days: 3, nights: 2, basePrice: 2400000, dest: 'Đà Lạt, Lâm Đồng', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1589820296156-2454bb8a6ad1', desc: 'Đồi chè Cầu Đất, Langbiang, thác Datanla và chợ đêm Đà Lạt.',
    },
    {
      tourCode: 'TR012', title: 'Sa Pa – Chinh phục Fansipan 2N1Đ', slug: 'sa-pa-chinh-phuc-fansipan-2n1d',
      days: 2, nights: 1, basePrice: 2100000, dest: 'Sa Pa, Lào Cai', from: 'Hà Nội',
      thumb: 'photo-1501785888041-af3ef285b470', desc: 'Cáp treo Fansipan, bản Cát Cát, ruộng bậc thang và chợ vùng cao.',
    },
    {
      tourCode: 'TR013', title: 'Côn Đảo – Hành trình tâm linh 3N2Đ', slug: 'con-dao-hanh-trinh-tam-linh-3n2d',
      days: 3, nights: 2, basePrice: 4200000, dest: 'Côn Đảo, Bà Rịa – Vũng Tàu', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1507525428034-b723cf961d3e', desc: 'Viếng nghĩa trang Hàng Dương, lặn ngắm san hô và bãi Đầm Trầu.',
    },
    {
      tourCode: 'TR014', title: 'Quy Nhơn – Phú Yên biển xanh 3N2Đ', slug: 'quy-nhon-phu-yen-bien-xanh-3n2d',
      days: 3, nights: 2, basePrice: 2950000, dest: 'Quy Nhơn – Phú Yên', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1519046904884-53103b34b206', desc: 'Kỳ Co, Eo Gió, Gành Đá Đĩa và đầm Ô Loan thơ mộng.',
    },
    {
      tourCode: 'TR015', title: 'Hạ Long – Du thuyền vịnh Lan Hạ 2N1Đ', slug: 'ha-long-du-thuyen-lan-ha-2n1d',
      days: 2, nights: 1, basePrice: 3600000, dest: 'Hạ Long – Lan Hạ', from: 'Hà Nội',
      thumb: 'photo-1582719478250-c89cae4dc85b', desc: 'Ngủ đêm trên du thuyền, chèo kayak hang Luồn, tắm biển đảo Ti Tốp.',
    },
    {
      tourCode: 'TR016', title: 'Mù Cang Chải – Mùa vàng ruộng bậc thang 2N1Đ', slug: 'mu-cang-chai-mua-vang-2n1d',
      days: 2, nights: 1, basePrice: 1750000, dest: 'Mù Cang Chải, Yên Bái', from: 'Hà Nội',
      thumb: 'photo-1528127269322-539801943592', desc: 'Đồi Mâm Xôi, đèo Khau Phạ và mùa lúa chín vàng rực Tây Bắc.',
    },
    {
      tourCode: 'TR017', title: 'Cao Bằng – Thác Bản Giốc & hang Pác Bó 3N2Đ', slug: 'cao-bang-ban-gioc-pac-bo-3n2d',
      days: 3, nights: 2, basePrice: 3100000, dest: 'Cao Bằng', from: 'Hà Nội',
      thumb: 'photo-1464822759023-fed622ff2c3b', desc: 'Thác Bản Giốc hùng vĩ, động Ngườm Ngao, suối Lê Nin – hang Pác Bó.',
    },
    {
      tourCode: 'TR018', title: 'Đà Nẵng – Bà Nà Hills – Hội An 3N2Đ', slug: 'da-nang-ba-na-hoi-an-3n2d',
      days: 3, nights: 2, basePrice: 2650000, dest: 'Đà Nẵng – Hội An', from: 'Hà Nội',
      thumb: 'photo-1559592413-7cec4d0cae2b', desc: 'Cầu Vàng Bà Nà, bán đảo Sơn Trà, phố cổ Hội An lung linh đèn lồng.',
    },
    {
      tourCode: 'TR019', title: 'Tây Nguyên – Pleiku & Buôn Ma Thuột 3N2Đ', slug: 'tay-nguyen-pleiku-bmt-3n2d',
      days: 3, nights: 2, basePrice: 2550000, dest: 'Gia Lai – Đắk Lắk', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1501785888041-af3ef285b470', desc: 'Biển Hồ Pleiku, thác Dray Nur, vườn cà phê và văn hóa cồng chiêng.',
    },
    {
      tourCode: 'TR020', title: 'Măng Đen – Đà Lạt thu nhỏ 2N1Đ', slug: 'mang-den-2n1d',
      days: 2, nights: 1, basePrice: 1600000, dest: 'Măng Đen, Kon Tum', from: 'Đà Nẵng',
      thumb: 'photo-1618773928121-c32242e63f39', desc: 'Rừng thông Măng Đen, thác Pa Sỹ, hồ Đắk Ke và chùa Khánh Lâm.',
    },
    {
      tourCode: 'TR021', title: 'Đảo Nam Du – Thiên đường hoang sơ 3N2Đ', slug: 'dao-nam-du-3n2d',
      days: 3, nights: 2, basePrice: 2900000, dest: 'Nam Du, Kiên Giang', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1507525428034-b723cf961d3e', desc: 'Lặn ngắm san hô, câu cá, bãi Mến hoang sơ và hải sản tươi rói.',
    },
    {
      tourCode: 'TR022', title: 'Hà Nội – City Tour & Foodtour 1 ngày', slug: 'ha-noi-city-foodtour-1-ngay',
      days: 1, nights: 0, basePrice: 750000, dest: 'Hà Nội', from: 'Hà Nội',
      thumb: 'photo-1559592413-7cec4d0cae2b', desc: 'Văn Miếu, Hồ Gươm, phố cổ và thưởng thức đặc sản ẩm thực Hà thành.',
    },
    {
      tourCode: 'TR023', title: 'Ninh Bình – Tam Chúc – Chùa Hương 2N1Đ', slug: 'ninh-binh-tam-chuc-chua-huong-2n1d',
      days: 2, nights: 1, basePrice: 1450000, dest: 'Ninh Bình – Hà Nam', from: 'Hà Nội',
      thumb: 'photo-1566073771259-6a8506099945', desc: 'Chùa Tam Chúc lớn nhất thế giới, Tràng An và hành hương chùa Hương.',
    },
    {
      tourCode: 'TR024', title: 'Phong Nha – Kẻ Bàng khám phá hang động 2N1Đ', slug: 'phong-nha-ke-bang-2n1d',
      days: 2, nights: 1, basePrice: 2350000, dest: 'Quảng Bình', from: 'Đà Nẵng',
      thumb: 'photo-1535139262971-c51845709a48', desc: 'Động Phong Nha, động Thiên Đường và sông Chày – Hang Tối mạo hiểm.',
    },
    {
      tourCode: 'TR025', title: 'Đảo Bình Ba – Đảo tôm hùm 2N1Đ', slug: 'dao-binh-ba-2n1d',
      days: 2, nights: 1, basePrice: 1850000, dest: 'Bình Ba, Khánh Hòa', from: 'TP. Hồ Chí Minh',
      thumb: 'photo-1519046904884-53103b34b206', desc: 'Lặn biển ngắm san hô, bãi Chướng – bãi Nồm và thưởng thức tôm hùm.',
    },
  ]

  const createdTours = [] // thu thập để sinh đơn + đánh giá thật
  for (const [ti, t] of tours.entries()) {
    const tour = await prisma.tour.create({
      data: {
        tourCode: t.tourCode, title: t.title, slug: t.slug, shortDescription: t.desc, description: t.desc,
        durationDays: t.days, durationNights: t.nights, departurePoint: t.from, destination: t.dest,
        minPax: 1, maxPax: 25, basePrice: t.basePrice, depositRate: 30, cancellationPolicyId: policy.id,
        avgRating: 0, reviewCount: 0, // tính lại từ đánh giá thật bên dưới
        status: 'VISIBLE', thumbnail: img(t.thumb), isFeatured: true,
        // Thư viện 5 ảnh cho trang chi tiết tour.
        images: { create: gallery(t.thumb, ti + 2, 5) },
      },
    })
    // 3 chuyến khởi hành sắp tới.
    const departures = []
    for (const offset of [10, 24, 40]) {
      const dep = await prisma.tourDeparture.create({
        data: {
          tourId: tour.id, departureDate: addDays(offset), returnDate: addDays(offset + t.days - 1),
          totalSlots: 20, bookedSlots: 0, heldSlots: 0, status: 'OPEN',
        },
      })
      departures.push({ id: dep.id })
      await prisma.tourPrice.createMany({
        data: [
          { departureId: dep.id, paxType: 'ADULT', price: t.basePrice, description: 'Người lớn' },
          { departureId: dep.id, paxType: 'CHILD', price: Math.round(t.basePrice * 0.7), description: 'Trẻ em 5–11 tuổi' },
        ],
      })
    }
    createdTours.push({ id: tour.id, title: tour.title, basePrice: t.basePrice, days: t.days, departures })
  }

  // ---- Đơn hàng + đánh giá THẬT (để báo cáo phản ánh đúng dữ liệu) ----
  await seedBookingsAndReviews(createdProps, createdTours)

  // ---- Khu vực du lịch phổ biến (trang chủ) ----
  await prisma.area.createMany({
    data: [
      { name: 'Đà Lạt', slug: 'da-lat', image: img('photo-1589820296156-2454bb8a6ad1'), order: 1 },
      { name: 'Đà Nẵng', slug: 'da-nang', image: img('photo-1559592413-7cec4d0cae2b'), order: 2 },
      { name: 'Hội An', slug: 'hoi-an', image: img('photo-1535139262971-c51845709a48'), order: 3 },
      { name: 'Sa Pa', slug: 'sa-pa', image: img('photo-1528127269322-539801943592'), order: 4 },
    ],
  })

  // ---- Khuyến mại (banner trang chủ) ----
  await prisma.promotion.createMany({
    data: [
      { title: 'Giảm 20% đặt homestay dịp lễ', description: 'Áp dụng cho đơn đặt trước 7 ngày.', image: img('photo-1501785888041-af3ef285b470'), active: true },
      { title: 'Tour Tây Bắc mùa săn mây', description: 'Ưu đãi nhóm từ 4 khách trở lên.', image: img('photo-1464822759023-fed622ff2c3b'), active: true },
    ],
  })

  // ---- Mã giảm giá ----
  await prisma.discountCode.createMany({
    data: [
      { code: 'STAYTOUR10', type: 'PERCENT', value: 10, minOrderValue: 500000, scope: 'ALL', active: true },
      { code: 'HE2026', type: 'FIXED', value: 150000, minOrderValue: 1000000, scope: 'HOMESTAY', active: true },
    ],
  })

  // ---- Bài thông tin & chính sách (footer) ----
  await prisma.infoArticle.createMany({
    data: [
      { slug: 'gioi-thieu', title: 'Thông tin người bán', category: 'ABOUT', excerpt: 'Về StayTour', content: 'StayTour là nền tảng đặt homestay và tour du lịch nội địa.', order: 1 },
      { slug: 'dieu-kien-giao-dich', title: 'Điều kiện giao dịch chung', category: 'POLICY', excerpt: 'Điều khoản', content: 'Các điều kiện và điều khoản giao dịch chung khi sử dụng StayTour.', order: 2 },
      { slug: 'chinh-sach-doi-tra-huy', title: 'Chính sách đổi – trả – hủy', category: 'POLICY', excerpt: 'Hủy & hoàn tiền', content: 'Chính sách hủy đặt chỗ và hoàn tiền theo từng mốc thời gian.', order: 3 },
      { slug: 'bao-mat-du-lieu', title: 'Bảo vệ dữ liệu cá nhân', category: 'POLICY', excerpt: 'Bảo mật', content: 'Cam kết bảo vệ dữ liệu cá nhân của khách hàng.', order: 4 },
    ],
  })

  // ---- Cẩm nang du lịch ----
  await prisma.travelGuide.create({
    data: {
      title: 'Kinh nghiệm du lịch Đà Lạt 3 ngày 2 đêm', slug: 'kinh-nghiem-du-lich-da-lat-3n2d',
      authorName: 'Ban biên tập StayTour', coverImage: img('photo-1589820296156-2454bb8a6ad1'),
      excerpt: 'Gợi ý lịch trình Đà Lạt tiết kiệm cho nhóm bạn.',
      content: 'Ngày 1: khám phá trung tâm, chợ đêm Đà Lạt.\nNgày 2: đồi chè Cầu Đất, săn mây.\nNgày 3: vườn hoa, mua đặc sản về làm quà.',
      locationName: 'Đà Lạt, Lâm Đồng', status: 'VISIBLE', publishedAt: new Date(),
    },
  })

  // ---- Tài khoản quản trị mặc định (chỉ tạo nếu chưa có) ----
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456'
  const existingAdmin = await prisma.admin.findUnique({ where: { username: adminUsername } })
  if (!existingAdmin) {
    await prisma.admin.create({
      data: { username: adminUsername, password: await bcrypt.hash(adminPassword, 10), name: 'Quản trị viên', role: 'SUPER_ADMIN' },
    })
    console.log(`Đã tạo tài khoản admin mặc định: ${adminUsername} / ${adminPassword} (đổi mật khẩu sau khi đăng nhập).`)
  }

  const counts = {
    properties: await prisma.property.count(),
    roomTypes: await prisma.roomType.count(),
    tours: await prisma.tour.count(),
    departures: await prisma.tourDeparture.count(),
    areas: await prisma.area.count(),
    promotions: await prisma.promotion.count(),
    discountCodes: await prisma.discountCode.count(),
    infoArticles: await prisma.infoArticle.count(),
    travelGuides: await prisma.travelGuide.count(),
    admins: await prisma.admin.count(),
    bookings: await prisma.booking.count(),
    reviews: await prisma.review.count(),
  }
  console.log('Seed hoàn tất:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

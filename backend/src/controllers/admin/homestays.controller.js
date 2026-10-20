import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { publicUploadUrl } from '../../lib/uploads.js'
import { nightsBetween } from '../../lib/booking.js'
import { missingForPropertyPublish } from '../../lib/publish.js'
import { propertyIdsInGroup } from '../../lib/serviceGroup.js'

const ACTIVE_STATUSES = ['PENDING_DEPOSIT', 'DEPOSITED', 'CONFIRMED']

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
const num = (v, def = null) => (v != null && v !== '' ? Number(v) : def)
const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)

// UC-16 – Danh sách chỗ nghỉ (mọi trạng thái) cho khu vực quản trị.
export async function listHomestays(req, res, next) {
  try {
    const { status, search, group } = req.query
    const where = {}
    if (['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) where.status = status
    if (search) where.name = { contains: String(search) }
    if (group) {
      const ids = await propertyIdsInGroup(Number(group))
      where.id = { in: ids.length ? ids : [-1] } // không có -> rỗng
    }
    const items = await prisma.property.findMany({
      where,
      select: {
        id: true, name: true, slug: true, propertyCode: true, propertyType: true, status: true,
        address: true, basePrice: true, thumbnail: true, starRating: true,
        province: { select: { name: true } }, area: { select: { name: true } },
        _count: { select: { roomTypes: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

// UC-16 – Chi tiết chỗ nghỉ (đầy đủ để chỉnh sửa).
export async function getHomestay(req, res, next) {
  try {
    const id = Number(req.params.id)
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        province: true, area: true, cancellationPolicy: true,
        amenities: { include: { amenity: true } },
        policies: { orderBy: { sortOrder: 'asc' } },
        roomTypes: { include: { _count: { select: { inventory: true } } } },
      },
    })
    if (!property) return res.status(404).json({ message: 'Không tìm thấy chỗ nghỉ' })
    res.json({ property })
  } catch (err) {
    next(err)
  }
}

// Danh mục + tiện nghi + chính sách cho form.
export async function homestayMeta(req, res, next) {
  try {
    const cats = await prisma.category.findMany({ where: { type: 'HOMESTAY' }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
    res.json({
      provinces: cats.filter((c) => c.kind === 'province'),
      areas: cats.filter((c) => c.kind === 'area'),
      amenities: await prisma.amenity.findMany({ orderBy: { name: 'asc' } }),
      policies: await prisma.cancellationPolicy.findMany({ orderBy: { id: 'asc' } }),
    })
  } catch (err) {
    next(err)
  }
}

// Tạo mới tỉnh/thành hoặc khu vực ngay từ form (khi danh sách có sẵn chưa có).
export async function createHomestayCategory(req, res, next) {
  try {
    const name = str(req.body.name)
    const kind = req.body.kind === 'area' ? 'area' : 'province'
    if (!name) return res.status(400).json({ message: 'Thiếu tên' })
    // slug duy nhất trong toàn bảng Category; nối kind + hậu tố nếu trùng.
    let base = slugify(name) || kind
    let slug = `${kind}-${base}`
    let n = 1
    while (await prisma.category.findUnique({ where: { slug } })) slug = `${kind}-${base}-${++n}`
    const maxOrder = await prisma.category.aggregate({ where: { type: 'HOMESTAY', kind }, _max: { order: true } })
    const category = await prisma.category.create({
      data: { name, slug, type: 'HOMESTAY', kind, order: (maxOrder._max.order ?? 0) + 1 },
    })
    await logAdminAction(req.admin.sub, 'category.create', { entityType: 'Category', entityId: category.id, detail: { name, kind } })
    res.status(201).json({ category })
  } catch (err) {
    next(err)
  }
}

function scalarData(body) {
  return {
    name: str(body.name),
    propertyType: ['HOMESTAY', 'HOTEL', 'VILLA', 'APARTMENT', 'RESORT'].includes(body.propertyType) ? body.propertyType : 'HOMESTAY',
    starRating: num(body.starRating),
    shortDescription: str(body.shortDescription),
    description: str(body.description),
    provinceId: num(body.provinceId),
    areaId: num(body.areaId),
    address: str(body.address),
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    checkInTime: str(body.checkInTime),
    checkOutTime: str(body.checkOutTime),
    basePrice: Number(body.basePrice),
    depositRate: num(body.depositRate),
    isPeakSeason: Boolean(body.isPeakSeason),
    cancellationPolicyId: num(body.cancellationPolicyId),
    contactPhone: str(body.contactPhone),
    contactEmail: str(body.contactEmail),
    metaTitle: str(body.metaTitle) || str(body.name),
    metaDescription: str(body.metaDescription) || str(body.shortDescription),
  }
}

function validate(body) {
  if (!str(body.name)) return 'Thiếu tên chỗ nghỉ' // 5a
  if (body.basePrice == null || Number.isNaN(Number(body.basePrice)) || Number(body.basePrice) < 0) return 'Giá tham khảo không hợp lệ'
  if (body.depositRate != null && body.depositRate !== '' && (Number(body.depositRate) < 1 || Number(body.depositRate) > 100)) return 'Tỷ lệ cọc phải từ 1 đến 100'
  return null
}

async function replaceAmenitiesAndPolicies(tx, propertyId, body) {
  if (Array.isArray(body.amenityIds)) {
    await tx.propertyAmenity.deleteMany({ where: { propertyId } })
    for (const aid of body.amenityIds) {
      if (Number.isInteger(Number(aid))) await tx.propertyAmenity.create({ data: { propertyId, amenityId: Number(aid) } }).catch(() => {})
    }
  }
  if (Array.isArray(body.policies)) {
    await tx.propertyPolicy.deleteMany({ where: { propertyId } })
    for (let i = 0; i < body.policies.length; i++) {
      const p = body.policies[i]
      if (str(p.content)) {
        await tx.propertyPolicy.create({
          data: { propertyId, type: ['HOUSE_RULE', 'NOTE', 'FAQ'].includes(p.type) ? p.type : 'HOUSE_RULE', title: str(p.title), content: str(p.content), sortOrder: i },
        })
      }
    }
  }
}

// UC-16 – Tạo chỗ nghỉ mới (mặc định DRAFT — BR-73).
export async function createHomestay(req, res, next) {
  try {
    const issue = validate(req.body)
    if (issue) return res.status(400).json({ message: issue })

    let slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.name)
    if (!slug) return res.status(400).json({ message: 'Không tạo được đường dẫn (slug) hợp lệ' })
    if (await prisma.property.findUnique({ where: { slug } })) return res.status(409).json({ message: 'Đường dẫn (slug) đã tồn tại' })
    const propertyCode = str(req.body.propertyCode) || 'PROP-' + Date.now().toString(36).toUpperCase()
    if (await prisma.property.findUnique({ where: { propertyCode } })) return res.status(409).json({ message: 'Mã chỗ nghỉ đã tồn tại' })

    const property = await prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: { ...scalarData(req.body), slug, propertyCode, status: 'DRAFT', thumbnail: str(req.body.thumbnail), createdById: req.admin.sub },
      })
      await replaceAmenitiesAndPolicies(tx, created.id, req.body)
      // Tạo sẵn 1 loại phòng mặc định để có thể thiết lập tồn kho ngay.
      await tx.roomType.create({ data: { propertyId: created.id, name: 'Phòng tiêu chuẩn', maxOccupancy: 2, totalRooms: 1, basePricePerNight: created.basePrice } })
      return created
    })
    await logAdminAction(req.admin.sub, 'property.create', { entityType: 'Property', entityId: property.id, detail: { name: property.name } })
    res.status(201).json({ property })
  } catch (err) {
    next(err)
  }
}

export async function updateHomestay(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.property.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy chỗ nghỉ' })
    const issue = validate({ ...existing, ...req.body })
    if (issue) return res.status(400).json({ message: issue })

    const data = scalarData({ ...existing, ...req.body })
    if (req.body.thumbnail !== undefined) data.thumbnail = str(req.body.thumbnail)
    if (req.body.slug) {
      const slug = slugify(req.body.slug)
      if (slug !== existing.slug) {
        if (await prisma.property.findFirst({ where: { slug, id: { not: id } } })) return res.status(409).json({ message: 'Đường dẫn (slug) đã tồn tại' })
        data.slug = slug
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data })
      await replaceAmenitiesAndPolicies(tx, id, req.body)
    })
    // Trả về property ĐẦY ĐỦ (kèm quan hệ) đúng shape getHomestay để frontend fill() không lỗi.
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        province: true, area: true, cancellationPolicy: true,
        amenities: { include: { amenity: true } },
        policies: { orderBy: { sortOrder: 'asc' } },
        roomTypes: { include: { _count: { select: { inventory: true } } } },
      },
    })
    await logAdminAction(req.admin.sub, 'property.update', { entityType: 'Property', entityId: id, detail: { name: property.name } })
    res.json({ property })
  } catch (err) {
    next(err)
  }
}

// UC-16 (2a) – Đổi trạng thái hiển thị. BR-75: cảnh báo nếu còn đơn tương lai khi ẩn.
export async function setVisibility(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    const existing = await prisma.property.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy chỗ nghỉ' })

    // BR-73: chỉ cho công bố (VISIBLE) khi đủ trường bắt buộc + tối thiểu 5 ảnh.
    // Chưa đủ -> giữ nguyên trạng thái nháp/chờ công bố và báo các mục còn thiếu.
    if (status === 'VISIBLE') {
      const missing = await missingForPropertyPublish(prisma, existing)
      if (missing.length) {
        return res.status(422).json({
          message: 'Chưa đủ điều kiện để công bố. Vui lòng bổ sung: ' + missing.join(', ') + '.',
          missing,
        })
      }
    }

    let warning = null
    if (status !== 'VISIBLE') {
      const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
      const futureBookings = await prisma.booking.findMany({
        where: { propertyId: id, type: 'HOMESTAY', status: { in: ACTIVE_STATUSES }, checkOut: { gte: today } },
        select: { code: true, checkIn: true, checkOut: true },
      })
      if (futureBookings.length) warning = { message: `Chỗ nghỉ vẫn còn ${futureBookings.length} đơn hợp lệ trong tương lai. Các đơn không bị ảnh hưởng, nhưng sẽ không còn hiển thị để đặt mới.`, bookings: futureBookings }
    }
    const property = await prisma.property.update({ where: { id }, data: { status } })
    await logAdminAction(req.admin.sub, status === 'VISIBLE' ? 'property.show' : 'property.hide', { entityType: 'Property', entityId: id })
    res.json({ property, warning })
  } catch (err) {
    next(err)
  }
}

// ---------- Ảnh ----------
export async function addImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { filename, caption } = req.body
    const property = await prisma.property.findUnique({ where: { id } })
    if (!property) return res.status(404).json({ message: 'Không tìm thấy chỗ nghỉ' })
    if (!filename) return res.status(400).json({ message: 'Thiếu tên tệp ảnh' })
    const url = publicUploadUrl(filename)
    const count = await prisma.propertyImage.count({ where: { propertyId: id } })
    const image = await prisma.propertyImage.create({ data: { propertyId: id, url, caption: str(caption), isCover: count === 0, sortOrder: count } })
    if (!property.thumbnail) await prisma.property.update({ where: { id }, data: { thumbnail: url } })
    await logAdminAction(req.admin.sub, 'property.image.add', { entityType: 'Property', entityId: id, detail: { url } })
    res.status(201).json({ image })
  } catch (err) {
    next(err)
  }
}

export async function removeImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const imageId = Number(req.params.imageId)
    await prisma.propertyImage.deleteMany({ where: { id: imageId, propertyId: id } })
    await logAdminAction(req.admin.sub, 'property.image.remove', { entityType: 'Property', entityId: id, detail: { imageId } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// ---------- Loại phòng ----------
export async function createRoomType(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!(await prisma.property.findUnique({ where: { id } }))) return res.status(404).json({ message: 'Không tìm thấy chỗ nghỉ' })
    if (!str(req.body.name)) return res.status(400).json({ message: 'Thiếu tên loại phòng' })
    const rt = await prisma.roomType.create({
      data: {
        propertyId: id,
        name: str(req.body.name),
        roomSize: num(req.body.roomSize),
        bedType: str(req.body.bedType),
        maxOccupancy: num(req.body.maxOccupancy, 2),
        totalRooms: num(req.body.totalRooms, 1),
        breakfastIncluded: Boolean(req.body.breakfastIncluded),
        smokingAllowed: Boolean(req.body.smokingAllowed),
        basePricePerNight: num(req.body.basePricePerNight, 0),
        description: str(req.body.description),
      },
    })
    await logAdminAction(req.admin.sub, 'roomtype.create', { entityType: 'RoomType', entityId: rt.id, detail: { propertyId: id, name: rt.name } })
    res.status(201).json({ roomType: rt })
  } catch (err) {
    next(err)
  }
}

export async function updateRoomType(req, res, next) {
  try {
    const id = Number(req.params.id)
    const rtId = Number(req.params.rtId)
    const rt = await prisma.roomType.findFirst({ where: { id: rtId, propertyId: id } })
    if (!rt) return res.status(404).json({ message: 'Không tìm thấy loại phòng' })
    const data = {}
    for (const k of ['name', 'bedType', 'description']) if (req.body[k] !== undefined) data[k] = str(req.body[k])
    for (const k of ['roomSize', 'maxOccupancy', 'totalRooms', 'basePricePerNight']) if (req.body[k] !== undefined) data[k] = num(req.body[k])
    for (const k of ['breakfastIncluded', 'smokingAllowed']) if (req.body[k] !== undefined) data[k] = Boolean(req.body[k])
    const updated = await prisma.roomType.update({ where: { id: rtId }, data })
    await logAdminAction(req.admin.sub, 'roomtype.update', { entityType: 'RoomType', entityId: rtId, detail: data })
    res.json({ roomType: updated })
  } catch (err) {
    next(err)
  }
}

export async function deleteRoomType(req, res, next) {
  try {
    const id = Number(req.params.id)
    const rtId = Number(req.params.rtId)
    const rt = await prisma.roomType.findFirst({ where: { id: rtId, propertyId: id } })
    if (!rt) return res.status(404).json({ message: 'Không tìm thấy loại phòng' })
    // BR: chặn xóa nếu còn đơn hợp lệ trên loại phòng này.
    const active = await prisma.booking.count({ where: { roomTypeId: rtId, status: { in: ACTIVE_STATUSES } } })
    if (active > 0) return res.status(409).json({ message: `Không thể xóa: còn ${active} đơn hợp lệ trên loại phòng này.` })
    await prisma.roomType.delete({ where: { id: rtId } })
    await logAdminAction(req.admin.sub, 'roomtype.delete', { entityType: 'RoomType', entityId: rtId })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// ---------- Lịch tồn phòng theo loại phòng (BR-74) ----------
export async function getInventory(req, res, next) {
  try {
    const rtId = Number(req.params.rtId)
    const { from, to } = req.query
    const rt = await prisma.roomType.findFirst({ where: { id: rtId, propertyId: Number(req.params.id) } })
    if (!rt) return res.status(404).json({ message: 'Không tìm thấy loại phòng' })
    const days = nightsBetween(from, to)
    if (!days || !days.length) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ' })
    const rows = await prisma.roomInventory.findMany({ where: { roomTypeId: rtId, date: { gte: days[0], lte: days[days.length - 1] } } })
    const byTime = new Map(rows.map((r) => [new Date(r.date).getTime(), r]))
    const calendar = days.map((d) => {
      const row = byTime.get(d.getTime())
      return { date: d, totalRooms: row?.totalRooms ?? 0, bookedRooms: row?.bookedRooms ?? 0, heldRooms: row?.heldRooms ?? 0, priceOverride: row?.priceOverride ?? null, isBlocked: row?.isBlocked ?? false, saved: Boolean(row) }
    })
    res.json({ basePrice: rt.basePricePerNight, calendar })
  } catch (err) {
    next(err)
  }
}

// UC-16 (4a) – Thiết lập tồn kho cho khoảng ngày (mở/chặn + giá riêng). BR-75/2a-1: chặn nếu mất hiệu lực đơn đang giữ.
export async function setInventory(req, res, next) {
  try {
    const id = Number(req.params.id)
    const rtId = Number(req.params.rtId)
    const { from, to, totalRooms, priceOverride, isBlocked } = req.body
    const rt = await prisma.roomType.findFirst({ where: { id: rtId, propertyId: id } })
    if (!rt) return res.status(404).json({ message: 'Không tìm thấy loại phòng' })
    const days = nightsBetween(from, to)
    if (!days || !days.length) return res.status(400).json({ message: 'Khoảng ngày không hợp lệ' })
    const rooms = Number(totalRooms)
    if (!Number.isInteger(rooms) || rooms < 0) return res.status(400).json({ message: 'Số phòng không hợp lệ' }) // 5a

    // BR-75/2a-1: từ chối nếu số phòng mới < số đã đặt trong bất kỳ ngày nào.
    const existingRows = await prisma.roomInventory.findMany({ where: { roomTypeId: rtId, date: { in: days } } })
    const conflictDates = existingRows.filter((r) => r.bookedRooms > rooms).map((r) => new Date(r.date))
    if (conflictDates.length) {
      const minD = new Date(Math.min(...conflictDates.map((d) => d.getTime())))
      const maxD = new Date(Math.max(...conflictDates.map((d) => d.getTime())) + 86400000)
      const bookings = await prisma.booking.findMany({
        where: { propertyId: id, roomTypeId: rtId, type: 'HOMESTAY', status: { in: ACTIVE_STATUSES }, checkOut: { gt: minD }, checkIn: { lt: maxD } },
        select: { code: true, checkIn: true, checkOut: true, status: true },
      })
      return res.status(409).json({ message: 'Không thể áp dụng: một số ngày đang có đơn hợp lệ vượt quá số phòng mới. Vui lòng xử lý các đơn liên quan trước (UC-18).', conflictDates, bookings })
    }

    const price = priceOverride === '' || priceOverride == null ? null : Number(priceOverride)
    const blocked = Boolean(isBlocked)
    await prisma.$transaction(
      days.map((d) =>
        prisma.roomInventory.upsert({
          where: { roomTypeId_date: { roomTypeId: rtId, date: d } },
          create: { roomTypeId: rtId, date: d, totalRooms: rooms, priceOverride: price, isBlocked: blocked },
          update: { totalRooms: rooms, priceOverride: price, isBlocked: blocked },
        }),
      ),
    )
    await logAdminAction(req.admin.sub, 'inventory.set', { entityType: 'RoomType', entityId: rtId, detail: { from, to, totalRooms: rooms, priceOverride: price, isBlocked: blocked } })
    res.json({ ok: true, days: days.length })
  } catch (err) {
    next(err)
  }
}

import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { publicUploadUrl } from '../../lib/uploads.js'
import { parseUtcDate } from '../../lib/booking.js'
import { missingForTourPublish } from '../../lib/publish.js'

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

// UC-17 – Danh sách tour (mọi trạng thái) cho khu vực quản trị.
export async function listTours(req, res, next) {
  try {
    const { status, search } = req.query
    const where = {}
    if (['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) where.status = status
    if (search) where.title = { contains: String(search) }

    const items = await prisma.tour.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        tourCode: true,
        status: true,
        destination: true,
        departurePoint: true,
        basePrice: true,
        durationDays: true,
        durationNights: true,
        thumbnail: true,
        region: { select: { name: true } },
        theme: { select: { name: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

// UC-17 – Chi tiết tour (đầy đủ để chỉnh sửa).
export async function getTour(req, res, next) {
  try {
    const id = Number(req.params.id)
    const tour = await prisma.tour.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        region: true,
        theme: true,
        cancellationPolicy: true,
        itinerary: { orderBy: { dayNumber: 'asc' } },
        inclusions: { orderBy: { sortOrder: 'asc' } },
        notes: { orderBy: { sortOrder: 'asc' } },
        departures: { orderBy: { departureDate: 'asc' }, include: { prices: true } },
      },
    })
    if (!tour) return res.status(404).json({ message: 'Không tìm thấy tour' })
    res.json({ tour })
  } catch (err) {
    next(err)
  }
}

function validatePayload(body) {
  if (!str(body.title)) return 'Thiếu tên tour' // 5a
  if (body.basePrice == null || Number.isNaN(Number(body.basePrice)) || Number(body.basePrice) < 0) {
    return 'Giá tham khảo không hợp lệ'
  }
  if (body.durationDays != null && body.durationDays !== '' && (!Number.isInteger(Number(body.durationDays)) || Number(body.durationDays) < 1)) {
    return 'Thời lượng (số ngày) không hợp lệ'
  }
  if (body.depositRate != null && body.depositRate !== '' && (Number(body.depositRate) < 1 || Number(body.depositRate) > 100)) {
    return 'Tỷ lệ cọc phải từ 1 đến 100'
  }
  return null
}

function scalarData(body) {
  return {
    title: str(body.title),
    shortDescription: str(body.shortDescription),
    description: str(body.description),
    highlights: str(body.highlights),
    regionId: num(body.regionId),
    themeId: num(body.themeId),
    durationDays: num(body.durationDays, 1),
    durationNights: num(body.durationNights, Math.max(0, (num(body.durationDays, 1) || 1) - 1)),
    departurePoint: str(body.departurePoint),
    destination: str(body.destination),
    meetingPoint: str(body.meetingPoint),
    minPax: num(body.minPax, 1),
    maxPax: num(body.maxPax, 30),
    guideLanguage: str(body.guideLanguage),
    basePrice: Number(body.basePrice),
    depositRate: num(body.depositRate),
    cancellationPolicyId: num(body.cancellationPolicyId),
    metaTitle: str(body.metaTitle) || str(body.title),
    metaDescription: str(body.metaDescription) || str(body.shortDescription),
  }
}

// Thay toàn bộ lịch trình / bao gồm / ghi chú (nếu payload có gửi).
async function replaceSubEntities(tx, tourId, body) {
  if (Array.isArray(body.itinerary)) {
    await tx.tourItinerary.deleteMany({ where: { tourId } })
    for (let i = 0; i < body.itinerary.length; i++) {
      const it = body.itinerary[i]
      await tx.tourItinerary.create({
        data: {
          tourId,
          dayNumber: it.dayNumber ?? i + 1,
          title: str(it.title),
          description: str(it.description),
          meals: str(it.meals),
          accommodation: str(it.accommodation),
        },
      })
    }
  }
  if (Array.isArray(body.included) || Array.isArray(body.excluded)) {
    await tx.tourInclusion.deleteMany({ where: { tourId } })
    const mk = async (arr, type) => {
      for (let i = 0; i < (arr || []).length; i++) {
        const text = str(typeof arr[i] === 'string' ? arr[i] : arr[i]?.itemText)
        if (text) await tx.tourInclusion.create({ data: { tourId, type, itemText: text, sortOrder: i } })
      }
    }
    await mk(body.included, 'INCLUDED')
    await mk(body.excluded, 'EXCLUDED')
  }
  if (Array.isArray(body.notes)) {
    await tx.tourNote.deleteMany({ where: { tourId } })
    for (let i = 0; i < body.notes.length; i++) {
      const n = body.notes[i]
      if (str(n.content)) {
        await tx.tourNote.create({
          data: { tourId, type: ['TERM', 'FAQ', 'REDEMPTION'].includes(n.type) ? n.type : 'TERM', title: str(n.title), content: str(n.content), sortOrder: i },
        })
      }
    }
  }
}

// UC-17 – Tạo tour mới (mặc định DRAFT/ẩn — BR-79).
export async function createTour(req, res, next) {
  try {
    const issue = validatePayload(req.body)
    if (issue) return res.status(400).json({ message: issue })

    let slug = req.body.slug ? slugify(req.body.slug) : slugify(req.body.title)
    if (!slug) return res.status(400).json({ message: 'Không tạo được đường dẫn (slug) hợp lệ từ tên' })
    const dup = await prisma.tour.findUnique({ where: { slug } })
    if (dup) return res.status(409).json({ message: 'Đường dẫn (slug) đã tồn tại, vui lòng đổi tên hoặc slug khác' })

    const tourCode = str(req.body.tourCode) || 'TOUR-' + Date.now().toString(36).toUpperCase()
    const dupCode = await prisma.tour.findUnique({ where: { tourCode } })
    if (dupCode) return res.status(409).json({ message: 'Mã tour đã tồn tại' })

    const tour = await prisma.$transaction(async (tx) => {
      const created = await tx.tour.create({
        data: {
          ...scalarData(req.body),
          slug,
          tourCode,
          status: 'DRAFT',
          thumbnail: str(req.body.thumbnail),
          isFeatured: Boolean(req.body.isFeatured),
          createdById: req.admin.sub,
        },
      })
      await replaceSubEntities(tx, created.id, req.body)
      return created
    })

    await logAdminAction(req.admin.sub, 'tour.create', { entityType: 'Tour', entityId: tour.id, detail: { title: tour.title, slug: tour.slug } })
    res.status(201).json({ tour })
  } catch (err) {
    next(err)
  }
}

// UC-17 – Cập nhật thông tin tour.
export async function updateTour(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.tour.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy tour' })

    const issue = validatePayload({ ...existing, ...req.body })
    if (issue) return res.status(400).json({ message: issue })

    const data = scalarData({ ...existing, ...req.body })
    if (req.body.thumbnail !== undefined) data.thumbnail = str(req.body.thumbnail)
    if (req.body.isFeatured !== undefined) data.isFeatured = Boolean(req.body.isFeatured)
    if (req.body.tourCode && str(req.body.tourCode) !== existing.tourCode) {
      const dupCode = await prisma.tour.findFirst({ where: { tourCode: str(req.body.tourCode), id: { not: id } } })
      if (dupCode) return res.status(409).json({ message: 'Mã tour đã tồn tại' })
      data.tourCode = str(req.body.tourCode)
    }
    if (req.body.slug) {
      const slug = slugify(req.body.slug)
      if (slug !== existing.slug) {
        const dup = await prisma.tour.findFirst({ where: { slug, id: { not: id } } })
        if (dup) return res.status(409).json({ message: 'Đường dẫn (slug) đã tồn tại' })
        data.slug = slug
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.tour.update({ where: { id }, data })
      await replaceSubEntities(tx, id, req.body)
    })
    // Trả về tour ĐẦY ĐỦ (kèm quan hệ) đúng shape getTour để frontend fillForm() không lỗi.
    const tour = await prisma.tour.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        region: true,
        theme: true,
        cancellationPolicy: true,
        itinerary: { orderBy: { dayNumber: 'asc' } },
        inclusions: { orderBy: { sortOrder: 'asc' } },
        notes: { orderBy: { sortOrder: 'asc' } },
        departures: { orderBy: { departureDate: 'asc' }, include: { prices: true } },
      },
    })

    await logAdminAction(req.admin.sub, 'tour.update', { entityType: 'Tour', entityId: id, detail: { title: tour.title } })
    res.json({ tour })
  } catch (err) {
    next(err)
  }
}

// UC-17 (2a) – Đổi trạng thái hiển thị (DRAFT/VISIBLE/HIDDEN). BR-81: cảnh báo nếu còn đơn tương lai khi ẩn.
export async function setTourVisibility(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    }
    const existing = await prisma.tour.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy tour' })

    // BR-79: chỉ cho công bố (VISIBLE) khi đủ trường bắt buộc + tối thiểu 5 ảnh.
    if (status === 'VISIBLE') {
      const missing = await missingForTourPublish(prisma, existing)
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
        where: { tourId: id, type: 'TOUR', status: { in: ACTIVE_STATUSES }, checkIn: { gte: today } },
        select: { code: true, checkIn: true },
      })
      if (futureBookings.length) {
        warning = {
          message: `Tour vẫn còn ${futureBookings.length} đơn hợp lệ trên các chuyến sắp tới. Các đơn này không bị ảnh hưởng, nhưng tour sẽ không còn hiển thị để đặt mới.`,
          bookings: futureBookings,
        }
      }
    }

    const tour = await prisma.tour.update({ where: { id }, data: { status } })
    await logAdminAction(req.admin.sub, status === 'VISIBLE' ? 'tour.show' : 'tour.hide', { entityType: 'Tour', entityId: id })
    res.json({ tour, warning })
  } catch (err) {
    next(err)
  }
}

// ---------- Ảnh (TourImage) ----------
export async function addImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { filename, caption } = req.body
    const tour = await prisma.tour.findUnique({ where: { id } })
    if (!tour) return res.status(404).json({ message: 'Không tìm thấy tour' })
    if (!filename) return res.status(400).json({ message: 'Thiếu tên tệp ảnh' })

    const url = publicUploadUrl(filename)
    const count = await prisma.tourImage.count({ where: { tourId: id } })
    const image = await prisma.tourImage.create({
      data: { tourId: id, url, caption: str(caption), isCover: count === 0, sortOrder: count },
    })
    if (!tour.thumbnail) await prisma.tour.update({ where: { id }, data: { thumbnail: url } })
    await logAdminAction(req.admin.sub, 'tour.image.add', { entityType: 'Tour', entityId: id, detail: { url } })
    res.status(201).json({ image })
  } catch (err) {
    next(err)
  }
}

export async function removeImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    const imageId = Number(req.params.imageId)
    await prisma.tourImage.deleteMany({ where: { id: imageId, tourId: id } })
    await logAdminAction(req.admin.sub, 'tour.image.remove', { entityType: 'Tour', entityId: id, detail: { imageId } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// ---------- Chuyến khởi hành (TourDeparture + TourPrice) ----------

// UC-17 – Thêm chuyến khởi hành mới + giá theo loại khách (BR-80/33).
export async function createDeparture(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { date, totalSlots, priceAdult, priceChild, priceInfant, guideName } = req.body
    const tour = await prisma.tour.findUnique({ where: { id } })
    if (!tour) return res.status(404).json({ message: 'Không tìm thấy tour' })

    const day = parseUtcDate(date)
    if (!day) return res.status(400).json({ message: 'Ngày khởi hành không hợp lệ' })
    const slots = Number(totalSlots)
    if (!Number.isInteger(slots) || slots <= 0) {
      return res.status(400).json({ message: 'Số chỗ tối đa phải lớn hơn 0' }) // 5a
    }
    const adult = num(priceAdult, tour.basePrice)
    if (adult == null || adult < 0) return res.status(400).json({ message: 'Giá người lớn không hợp lệ' })

    const returnDate = new Date(day.getTime() + (tour.durationNights || 0) * 86400000)
    const departure = await prisma.tourDeparture.create({
      data: {
        tourId: id,
        departureDate: day,
        returnDate,
        totalSlots: slots,
        guideName: str(guideName),
        prices: {
          create: [
            { paxType: 'ADULT', price: adult, description: 'Người lớn' },
            ...(num(priceChild) != null ? [{ paxType: 'CHILD', price: num(priceChild), description: 'Trẻ em' }] : []),
            ...(num(priceInfant) != null ? [{ paxType: 'INFANT', price: num(priceInfant), description: 'Em bé' }] : []),
          ],
        },
      },
      include: { prices: true },
    })

    await logAdminAction(req.admin.sub, 'departure.create', { entityType: 'TourDeparture', entityId: departure.id, detail: { tourId: id, date, totalSlots: slots } })
    res.status(201).json({ departure })
  } catch (err) {
    next(err)
  }
}

// UC-17 – Cập nhật số chỗ / giá của một chuyến. BR-81/4a-2: không giảm dưới số đã bán.
export async function updateDeparture(req, res, next) {
  try {
    const id = Number(req.params.id)
    const depId = Number(req.params.depId)
    const departure = await prisma.tourDeparture.findFirst({ where: { id: depId, tourId: id }, include: { prices: true } })
    if (!departure) return res.status(404).json({ message: 'Không tìm thấy chuyến khởi hành' })

    const data = {}
    if (req.body.totalSlots !== undefined) {
      const slots = Number(req.body.totalSlots)
      if (!Number.isInteger(slots) || slots <= 0) {
        return res.status(400).json({ message: 'Số chỗ tối đa phải lớn hơn 0' }) // 5a
      }
      if (slots < departure.bookedSlots) {
        return res.status(409).json({
          message: `Không thể giảm số chỗ xuống ${slots} vì đã bán ${departure.bookedSlots} chỗ cho chuyến này.`, // 4a-2
          bookedSlots: departure.bookedSlots,
        })
      }
      data.totalSlots = slots
    }
    if (req.body.guideName !== undefined) data.guideName = str(req.body.guideName)

    // Cập nhật/tạo giá theo loại khách nếu gửi.
    const upsertPrice = async (paxType, value, desc) => {
      if (value === undefined) return
      const price = num(value)
      const existing = departure.prices.find((p) => p.paxType === paxType)
      if (price == null) {
        if (existing && paxType !== 'ADULT') await prisma.tourPrice.delete({ where: { id: existing.id } })
        return
      }
      if (existing) await prisma.tourPrice.update({ where: { id: existing.id }, data: { price } })
      else await prisma.tourPrice.create({ data: { departureId: depId, paxType, price, description: desc } })
    }
    await upsertPrice('ADULT', req.body.priceAdult, 'Người lớn')
    await upsertPrice('CHILD', req.body.priceChild, 'Trẻ em')
    await upsertPrice('INFANT', req.body.priceInfant, 'Em bé')

    const updated = await prisma.tourDeparture.update({ where: { id: depId }, data, include: { prices: true } })
    await logAdminAction(req.admin.sub, 'departure.update', { entityType: 'TourDeparture', entityId: depId, detail: data })
    res.json({ departure: updated })
  } catch (err) {
    next(err)
  }
}

// UC-17 (4a) – Đóng/hủy chuyến. BR-81/4a-1: chặn nếu còn đơn hợp lệ trên chuyến đó.
export async function closeDeparture(req, res, next) {
  try {
    const id = Number(req.params.id)
    const depId = Number(req.params.depId)
    const departure = await prisma.tourDeparture.findFirst({ where: { id: depId, tourId: id } })
    if (!departure) return res.status(404).json({ message: 'Không tìm thấy chuyến khởi hành' })
    if (departure.status === 'CLOSED' || departure.status === 'CANCELLED') {
      return res.status(409).json({ message: 'Chuyến này đã được đóng trước đó' })
    }

    if (departure.bookedSlots > 0) {
      const bookings = await prisma.booking.findMany({
        where: { tourDepartureId: depId, type: 'TOUR', status: { in: ACTIVE_STATUSES } },
        select: { code: true, guests: true, children: true, status: true },
      })
      return res.status(409).json({
        message: 'Không thể đóng chuyến vì đang có đơn hợp lệ. Vui lòng xử lý các đơn liên quan trước (UC-18).', // 4a-1
        bookings,
      })
    }

    const updated = await prisma.tourDeparture.update({ where: { id: depId }, data: { status: 'CLOSED' } })
    await logAdminAction(req.admin.sub, 'departure.close', { entityType: 'TourDeparture', entityId: depId })
    res.json({ departure: updated })
  } catch (err) {
    next(err)
  }
}

// Danh mục region/theme cho form tour (BF-02).
export async function tourCategories(req, res, next) {
  try {
    const cats = await prisma.category.findMany({ where: { type: 'TOUR' }, orderBy: [{ order: 'asc' }, { name: 'asc' }] })
    res.json({
      regions: cats.filter((c) => c.kind === 'region'),
      themes: cats.filter((c) => c.kind === 'theme'),
      durations: cats.filter((c) => c.kind === 'duration'),
      policies: await prisma.cancellationPolicy.findMany({ orderBy: { id: 'asc' } }),
    })
  } catch (err) {
    next(err)
  }
}

// Tạo mới vùng miền (region) hoặc chủ đề (theme) tour ngay từ form.
export async function createTourCategory(req, res, next) {
  try {
    const name = req.body.name != null ? String(req.body.name).trim() : ''
    const kind = req.body.kind === 'theme' ? 'theme' : 'region'
    if (!name) return res.status(400).json({ message: 'Thiếu tên' })
    let base = slugify(name) || kind
    let slug = `${kind}-${base}`
    let n = 1
    while (await prisma.category.findUnique({ where: { slug } })) slug = `${kind}-${base}-${++n}`
    const maxOrder = await prisma.category.aggregate({ where: { type: 'TOUR', kind }, _max: { order: true } })
    const category = await prisma.category.create({
      data: { name, slug, type: 'TOUR', kind, order: (maxOrder._max.order ?? 0) + 1 },
    })
    await logAdminAction(req.admin.sub, 'category.create', { entityType: 'Category', entityId: category.id, detail: { name, kind } })
    res.status(201).json({ category })
  } catch (err) {
    next(err)
  }
}

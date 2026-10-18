import { prisma } from '../lib/prisma.js'
import { allGroupsFlat, buildTree as buildGroupTree, tourIdsInGroup, propertyIdsInGroup } from '../lib/serviceGroup.js'

// Cây nhóm dịch vụ (công khai) để trang khách hàng lọc theo nhóm.
export async function getServiceGroups(req, res, next) {
  try {
    res.json({ tree: buildGroupTree(await allGroupsFlat()) })
  } catch (err) {
    next(err)
  }
}

// Homestay nay ở bảng Property — chọn trường rồi ánh xạ về "thẻ" chung.
const propertyCardSelect = {
  id: true,
  name: true,
  slug: true,
  address: true,
  basePrice: true,
  avgRating: true,
  thumbnail: true,
  isFeatured: true,
  provinceId: true,
  areaId: true,
}

export function propertyToCard(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: 'HOMESTAY',
    location: p.address || null,
    price: p.basePrice,
    rating: p.avgRating,
    thumbnail: p.thumbnail,
    isFeatured: p.isFeatured,
    categoryId: p.areaId ?? p.provinceId ?? null,
    amenities: null,
    durationDays: null,
  }
}

// Tour nay ở bảng riêng — chọn trường tương ứng rồi ánh xạ về cùng "thẻ" như homestay.
const tourCardSelect = {
  id: true,
  title: true,
  slug: true,
  destination: true,
  departurePoint: true,
  basePrice: true,
  avgRating: true,
  thumbnail: true,
  isFeatured: true,
  durationDays: true,
  regionId: true,
  themeId: true,
}

export function tourToCard(t) {
  return {
    id: t.id,
    name: t.title,
    slug: t.slug,
    type: 'TOUR',
    location: t.destination || t.departurePoint || null,
    price: t.basePrice,
    rating: t.avgRating,
    thumbnail: t.thumbnail,
    isFeatured: t.isFeatured,
    categoryId: t.themeId ?? t.regionId ?? null,
    amenities: null,
    durationDays: t.durationDays,
  }
}

// UC-01 – Dữ liệu trang chủ: nổi bật, khu vực phổ biến, khuyến mại.
// BR-01: chỉ hiển thị sản phẩm trạng thái VISIBLE. Khuyến mại: chỉ active.
export async function getHome(req, res, next) {
  try {
    const [featuredHomestay, featuredTours, areas, promotions] = await Promise.all([
      prisma.property.findMany({
        where: { status: 'VISIBLE', isFeatured: true },
        select: propertyCardSelect,
        orderBy: { avgRating: 'desc' },
        take: 8,
      }),
      prisma.tour.findMany({
        where: { status: 'VISIBLE', isFeatured: true },
        select: tourCardSelect,
        orderBy: { avgRating: 'desc' },
        take: 8,
      }),
      prisma.area.findMany({ orderBy: { order: 'asc' } }),
      prisma.promotion.findMany({
        where: {
          active: true,
          // Còn hiệu lực theo thời gian (nếu có đặt mốc).
          AND: [
            { OR: [{ startAt: null }, { startAt: { lte: new Date() } }] },
            { OR: [{ endAt: null }, { endAt: { gte: new Date() } }] },
          ],
        },
        include: { serviceGroup: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ endAt: 'asc' }, { createdAt: 'desc' }],
      }),
    ])

    // Gộp homestay + tour nổi bật, sắp theo đánh giá, lấy tối đa 8.
    const featured = [...featuredHomestay.map(propertyToCard), ...featuredTours.map(tourToCard)]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 8)

    // Khuyến mãi động: với mỗi CTKM gắn nhóm, đính kèm vài tour/homestay đang giảm (để tham chiếu).
    const promotionsFull = await Promise.all(
      promotions.map(async (p) => {
        let products = []
        if (p.serviceGroupId) {
          const [tIds, pIds] = await Promise.all([tourIdsInGroup(p.serviceGroupId), propertyIdsInGroup(p.serviceGroupId)])
          const [tRows, pRows] = await Promise.all([
            tIds.length ? prisma.tour.findMany({ where: { id: { in: tIds }, status: 'VISIBLE' }, select: tourCardSelect, take: 6 }) : [],
            pIds.length ? prisma.property.findMany({ where: { id: { in: pIds }, status: 'VISIBLE' }, select: propertyCardSelect, take: 6 }) : [],
          ])
          products = [...tRows.map(tourToCard), ...pRows.map(propertyToCard)].slice(0, 8)
        }
        return { ...p, products }
      }),
    )

    res.json({
      featured,
      areas,
      promotions: promotionsFull,
    })
  } catch (err) {
    next(err)
  }
}

// Dựng cây danh mục nhiều cấp từ danh sách phẳng. BR-02.
function buildTree(categories) {
  const byId = new Map()
  categories.forEach((c) => byId.set(c.id, { ...c, children: [] }))

  const roots = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

// UC-01 – Cây danh mục (lọc theo loại nếu có ?type=HOMESTAY|TOUR).
export async function getCategories(req, res, next) {
  try {
    const { type } = req.query
    const where = {}
    if (type === 'HOMESTAY' || type === 'TOUR') where.type = type

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })

    res.json({ categories: buildTree(categories) })
  } catch (err) {
    next(err)
  }
}

// Thu thập id của một danh mục và toàn bộ danh mục con (đệ quy).
async function collectCategoryIds(rootId) {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } })
  const childrenOf = new Map()
  for (const c of all) {
    if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, [])
    childrenOf.get(c.parentId).push(c.id)
  }
  const result = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()
    result.push(id)
    for (const child of childrenOf.get(id) || []) stack.push(child)
  }
  return result
}

// UC-01/UC-02 – Danh sách sản phẩm theo danh mục / loại / khu vực.
// BR-01: chỉ trả về sản phẩm VISIBLE. Danh mục cha bao gồm cả sản phẩm ở danh mục con.
export async function getProducts(req, res, next) {
  try {
    const { categoryId, categorySlug, type, location } = req.query
    const where = { status: 'VISIBLE' }

    if (type === 'HOMESTAY' || type === 'TOUR') where.type = type
    if (location) where.location = { contains: String(location) }

    let category = null
    let catIds = null
    if (categoryId || categorySlug) {
      category = await prisma.category.findUnique({
        where: categoryId ? { id: Number(categoryId) } : { slug: String(categorySlug) },
      })
      if (!category) {
        return res.status(404).json({ message: 'Không tìm thấy danh mục' })
      }
      catIds = await collectCategoryIds(category.id)
    }

    // Tour ở bảng riêng: lọc theo region/theme thay vì categoryId.
    if (type === 'TOUR' || category?.type === 'TOUR') {
      const tourWhere = { status: 'VISIBLE' }
      if (location) tourWhere.OR = [{ destination: { contains: String(location) } }, { departurePoint: { contains: String(location) } }]
      if (catIds) tourWhere.OR = [{ regionId: { in: catIds } }, { themeId: { in: catIds } }]
      const tours = await prisma.tour.findMany({ where: tourWhere, select: tourCardSelect, orderBy: { createdAt: 'desc' } })
      const items = tours.map(tourToCard)
      return res.json({ category, count: items.length, items })
    }

    // Homestay ở bảng Property: lọc theo province/area thay vì categoryId.
    const propWhere = { status: 'VISIBLE' }
    if (location) propWhere.address = { contains: String(location) }
    if (catIds) propWhere.OR = [{ provinceId: { in: catIds } }, { areaId: { in: catIds } }]
    const props = await prisma.property.findMany({ where: propWhere, select: propertyCardSelect, orderBy: { createdAt: 'desc' } })
    const items = props.map(propertyToCard)

    res.json({ category, count: items.length, items })
  } catch (err) {
    next(err)
  }
}

// Số đêm giữa hai ngày (YYYY-MM-DD). Trả null nếu không hợp lệ.
function diffNights(from, to) {
  const a = new Date(from)
  const b = new Date(to)
  if (isNaN(a) || isNaN(b)) return null
  const nights = Math.round((b - a) / 86400000)
  return nights
}

const DAY_MS = 86400000

// UTC midnight của hôm nay (khớp cột @db.Date của Prisma).
function startOfToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

// Chuỗi 'YYYY-MM-DD' -> Date tại UTC midnight (new Date('YYYY-MM-DD') đã là UTC).
function parseUtcDate(str) {
  const d = new Date(str)
  return isNaN(d) ? null : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// Liệt kê các đêm (UTC midnight) trong khoảng [from, to).
function nightsBetween(from, to) {
  const a = parseUtcDate(from)
  const b = parseUtcDate(to)
  if (!a || !b) return null
  const dates = []
  for (let t = a.getTime(); t < b.getTime(); t += DAY_MS) dates.push(new Date(t))
  return dates
}

// UC-02 – Tìm kiếm & lọc sản phẩm.
// BR-04: chỉ VISIBLE. BR-05: homestay tính giá theo số đêm. BR-06/2a: kiểm tra hợp lệ tiêu chí.
export async function searchProducts(req, res, next) {
  try {
    const {
      type,
      destination,
      guests,
      from,
      to,
      depart,
      minPrice,
      maxPrice,
      location,
      amenities,
      minRating,
      duration,
      group,
      sort,
    } = req.query

    // ----- Kiểm tra hợp lệ (BR-06 / ngoại lệ 2a) -----
    if (guests !== undefined && guests !== '') {
      const g = Number(guests)
      if (!Number.isInteger(g) || g < 1) {
        return res.status(400).json({ message: 'Số khách phải là số nguyên ≥ 1' })
      }
    }

    let nights = null
    if (type === 'HOMESTAY' && from && to) {
      nights = diffNights(from, to)
      if (nights === null) {
        return res.status(400).json({ message: 'Ngày nhận/trả phòng không hợp lệ' })
      }
      if (nights <= 0) {
        return res.status(400).json({ message: 'Ngày trả phòng phải sau ngày nhận phòng' })
      }
    }

    // ----- Tập cơ sở cho facets (BR-04: VISIBLE), gộp homestay (Product) + tour (Tour) -----
    let base = []
    if (type !== 'TOUR') {
      const w = { status: 'VISIBLE' }
      if (destination) w.address = { contains: String(destination) }
      const props = await prisma.property.findMany({ where: w, select: { ...propertyCardSelect, amenities: { select: { amenity: { select: { name: true } } } } } })
      base.push(...props.map((p) => ({ ...propertyToCard(p), amenityList: p.amenities.map((a) => a.amenity.name) })))
    }
    if (type !== 'HOMESTAY') {
      const w = { status: 'VISIBLE' }
      if (destination) w.OR = [{ destination: { contains: String(destination) } }, { departurePoint: { contains: String(destination) } }]
      const tours = await prisma.tour.findMany({ where: w, select: tourCardSelect })
      base.push(...tours.map((t) => ({ ...tourToCard(t), amenityList: [] })))
    }

    // ----- Lọc theo nhóm dịch vụ (gồm nhóm con) -----
    if (group) {
      const gid = Number(group)
      const [tIds, pIds] = await Promise.all([tourIdsInGroup(gid), propertyIdsInGroup(gid)])
      const tSet = new Set(tIds)
      const pSet = new Set(pIds)
      base = base.filter((p) => (p.type === 'TOUR' ? tSet.has(p.id) : pSet.has(p.id)))
    }

    // ----- Facets (tùy chọn bộ lọc dựa trên dữ liệu thực) -----
    const allAmenities = await prisma.amenity.findMany({ select: { name: true }, orderBy: { name: 'asc' } })
    const groupTree = buildGroupTree(await allGroupsFlat())
    const facets = {
      locations: [...new Set(base.map((p) => p.location).filter(Boolean))].sort(),
      amenities: allAmenities.map((a) => a.name),
      durations: [...new Set(base.map((p) => p.durationDays).filter((d) => d != null))].sort(
        (a, b) => a - b,
      ),
      priceMin: base.length ? Math.min(...base.map((p) => p.price)) : 0,
      priceMax: base.length ? Math.max(...base.map((p) => p.price)) : 0,
      groups: groupTree,
    }

    // ----- Áp dụng bộ lọc thứ cấp -----
    const wantedAmenities = amenities
      ? String(amenities).split(',').map((s) => s.trim()).filter(Boolean)
      : []
    const wantedDurations = duration
      ? String(duration).split(',').map((s) => Number(s)).filter((n) => !isNaN(n))
      : []

    let items = base.filter((p) => {
      if (minPrice && p.price < Number(minPrice)) return false
      if (maxPrice && p.price > Number(maxPrice)) return false
      if (location && !(p.location || '').includes(String(location))) return false
      if (minRating && p.rating < Number(minRating)) return false
      if (wantedDurations.length && !wantedDurations.includes(p.durationDays)) return false
      if (wantedAmenities.length) {
        const have = p.amenityList || []
        if (!wantedAmenities.every((a) => have.includes(a))) return false
      }
      return true
    })

    // ----- Sắp xếp -----
    const sorters = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      rating_desc: (a, b) => b.rating - a.rating,
    }
    if (sorters[sort]) items = [...items].sort(sorters[sort])

    // ----- BR-05: giá theo số đêm cho homestay -----
    const result = items.map(({ amenityList, ...p }) => {
      if (nights && p.type === 'HOMESTAY') {
        return { ...p, nights, totalPrice: p.price * nights }
      }
      return p
    })

    res.json({
      criteria: { type: type || null, destination: destination || null, guests: guests || null, from: from || null, to: to || null, depart: depart || null },
      nights,
      facets,
      count: result.length,
      items: result,
    })
  } catch (err) {
    next(err)
  }
}

import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { allGroupsFlat, buildTree, guideIdsInGroup } from '../../lib/serviceGroup.js'

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)
const num = (v) => (v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null)

function scalarData(body) {
  return {
    title: str(body.title),
    authorName: str(body.authorName),
    coverImage: str(body.coverImage),
    excerpt: str(body.excerpt),
    content: str(body.content) ?? '',
    locationName: str(body.locationName),
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
  }
}

async function replaceRelatedTours(tx, guideId, tourIds) {
  if (!Array.isArray(tourIds)) return
  await tx.travelGuideTour.deleteMany({ where: { guideId } })
  const ids = [...new Set(tourIds.map((x) => Number(x)).filter(Number.isInteger))]
  for (const tourId of ids) {
    await tx.travelGuideTour.create({ data: { guideId, tourId } }).catch(() => {})
  }
}

// Gán bài viết vào các nhóm dịch vụ (dùng chung cây với tour/homestay).
async function replaceGuideGroups(tx, guideId, groupIds) {
  if (!Array.isArray(groupIds)) return
  await tx.serviceGroupGuide.deleteMany({ where: { guideId } })
  const ids = [...new Set(groupIds.map((x) => Number(x)).filter(Number.isInteger))]
  for (const groupId of ids) {
    await tx.serviceGroupGuide.create({ data: { guideId, groupId } }).catch(() => {})
  }
}

// Danh sách cẩm nang (mọi trạng thái) cho quản trị.
export async function listGuides(req, res, next) {
  try {
    const { status, search, group } = req.query
    const where = {}
    if (['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) where.status = status
    if (search) where.title = { contains: String(search) }
    if (group) {
      const ids = await guideIdsInGroup(Number(group))
      where.id = { in: ids.length ? ids : [-1] }
    }
    const items = await prisma.travelGuide.findMany({
      where,
      select: {
        id: true, title: true, slug: true, authorName: true, coverImage: true,
        locationName: true, publishedAt: true, status: true, updatedAt: true,
        _count: { select: { relatedTours: true, serviceGroups: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

export async function getGuide(req, res, next) {
  try {
    const id = Number(req.params.id)
    const guide = await prisma.travelGuide.findUnique({
      where: { id },
      include: {
        relatedTours: { include: { tour: { select: { id: true, title: true, slug: true } } } },
        serviceGroups: { select: { groupId: true } },
      },
    })
    if (!guide) return res.status(404).json({ message: 'Không tìm thấy bài cẩm nang' })
    res.json({ guide: { ...guide, groupIds: guide.serviceGroups.map((g) => g.groupId) } })
  } catch (err) {
    next(err)
  }
}

// Danh sách tour (để chọn "tour liên quan") cho form.
export async function guideMeta(req, res, next) {
  try {
    const tours = await prisma.tour.findMany({
      select: { id: true, title: true, slug: true },
      orderBy: { title: 'asc' },
    })
    const flat = await allGroupsFlat()
    res.json({ tours, groups: { tree: buildTree(flat), flat } })
  } catch (err) {
    next(err)
  }
}

export async function createGuide(req, res, next) {
  try {
    const data = scalarData(req.body)
    if (!data.title) return res.status(400).json({ message: 'Thiếu tiêu đề' })
    let base = req.body.slug ? slugify(req.body.slug) : slugify(data.title)
    if (!base) return res.status(400).json({ message: 'Không tạo được đường dẫn (slug) hợp lệ' })
    let slug = base
    let n = 1
    while (await prisma.travelGuide.findUnique({ where: { slug } })) slug = `${base}-${++n}`

    const guide = await prisma.$transaction(async (tx) => {
      const created = await tx.travelGuide.create({
        data: { ...data, slug, status: 'DRAFT', createdById: req.admin.sub },
      })
      await replaceRelatedTours(tx, created.id, req.body.tourIds)
      await replaceGuideGroups(tx, created.id, req.body.groupIds)
      return created
    })
    await logAdminAction(req.admin.sub, 'guide.create', { entityType: 'TravelGuide', entityId: guide.id, detail: { title: guide.title } })
    const full = await prisma.travelGuide.findUnique({ where: { id: guide.id }, include: { relatedTours: { include: { tour: { select: { id: true, title: true, slug: true } } } }, serviceGroups: { select: { groupId: true } } } })
    res.status(201).json({ guide: { ...full, groupIds: full.serviceGroups.map((g) => g.groupId) } })
  } catch (err) {
    next(err)
  }
}

export async function updateGuide(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.travelGuide.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy bài cẩm nang' })
    const data = scalarData({ ...existing, ...req.body })
    if (!data.title) return res.status(400).json({ message: 'Thiếu tiêu đề' })
    if (req.body.slug) {
      const slug = slugify(req.body.slug)
      if (slug && slug !== existing.slug) {
        if (await prisma.travelGuide.findFirst({ where: { slug, id: { not: id } } })) return res.status(409).json({ message: 'Đường dẫn (slug) đã tồn tại' })
        data.slug = slug
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.travelGuide.update({ where: { id }, data })
      await replaceRelatedTours(tx, id, req.body.tourIds)
      await replaceGuideGroups(tx, id, req.body.groupIds)
    })
    await logAdminAction(req.admin.sub, 'guide.update', { entityType: 'TravelGuide', entityId: id, detail: { title: data.title } })
    const full = await prisma.travelGuide.findUnique({ where: { id }, include: { relatedTours: { include: { tour: { select: { id: true, title: true, slug: true } } } }, serviceGroups: { select: { groupId: true } } } })
    res.json({ guide: { ...full, groupIds: full.serviceGroups.map((g) => g.groupId) } })
  } catch (err) {
    next(err)
  }
}

// Đổi trạng thái hiển thị (DRAFT/VISIBLE/HIDDEN). Khi chuyển sang VISIBLE lần đầu, set ngày đăng nếu chưa có.
export async function setGuideVisibility(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['DRAFT', 'VISIBLE', 'HIDDEN'].includes(status)) return res.status(400).json({ message: 'Trạng thái không hợp lệ' })
    const existing = await prisma.travelGuide.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy bài cẩm nang' })
    const data = { status }
    if (status === 'VISIBLE' && !existing.publishedAt) data.publishedAt = new Date()
    const guide = await prisma.travelGuide.update({ where: { id }, data })
    await logAdminAction(req.admin.sub, status === 'VISIBLE' ? 'guide.show' : 'guide.hide', { entityType: 'TravelGuide', entityId: id })
    res.json({ guide })
  } catch (err) {
    next(err)
  }
}

export async function deleteGuide(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.travelGuide.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy bài cẩm nang' })
    await prisma.travelGuide.delete({ where: { id } })
    await logAdminAction(req.admin.sub, 'guide.delete', { entityType: 'TravelGuide', entityId: id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

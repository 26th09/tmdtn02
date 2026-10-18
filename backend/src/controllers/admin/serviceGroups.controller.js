import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'
import { allGroupsFlat, buildTree, descendantIds, slugifyGroup } from '../../lib/serviceGroup.js'

const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null)

async function uniqueSlug(base, excludeId) {
  let slug = slugifyGroup(base) || 'nhom'
  let i = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.serviceGroup.findUnique({ where: { slug } })
    if (!existing || existing.id === excludeId) return slug
    slug = `${slugifyGroup(base)}-${++i}`
  }
}

// Cây nhóm dịch vụ kèm số lượng tour/homestay/bài viết mỗi nhóm.
export async function listGroups(req, res, next) {
  try {
    const flat = await prisma.serviceGroup.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { tours: true, properties: true, guides: true } } },
    })
    res.json({ tree: buildTree(flat), flat })
  } catch (err) {
    next(err)
  }
}

export async function createGroup(req, res, next) {
  try {
    const name = str(req.body.name)
    if (!name) return res.status(400).json({ message: 'Thiếu tên nhóm' })
    const parentId = req.body.parentId ? Number(req.body.parentId) : null
    if (parentId && !(await prisma.serviceGroup.findUnique({ where: { id: parentId } }))) {
      return res.status(400).json({ message: 'Nhóm cha không tồn tại' })
    }
    const group = await prisma.serviceGroup.create({
      data: { name, slug: await uniqueSlug(name), description: str(req.body.description), order: Number(req.body.order) || 0, parentId },
    })
    await logAdminAction(req.admin.sub, 'serviceGroup.create', { entityType: 'ServiceGroup', entityId: group.id, detail: { name } })
    res.status(201).json({ group })
  } catch (err) {
    next(err)
  }
}

export async function updateGroup(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.serviceGroup.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy nhóm' })

    const data = {}
    if (req.body.name !== undefined) {
      const name = str(req.body.name)
      if (!name) return res.status(400).json({ message: 'Tên nhóm không được trống' })
      data.name = name
      data.slug = await uniqueSlug(name, id)
    }
    if (req.body.description !== undefined) data.description = str(req.body.description)
    if (req.body.order !== undefined) data.order = Number(req.body.order) || 0
    if (req.body.parentId !== undefined) {
      const parentId = req.body.parentId ? Number(req.body.parentId) : null
      if (parentId) {
        if (parentId === id) return res.status(400).json({ message: 'Nhóm không thể là cha của chính nó' })
        // Chống vòng lặp: cha mới không được nằm trong nhánh con của nhóm này.
        const subtree = await descendantIds(id)
        if (subtree.includes(parentId)) return res.status(400).json({ message: 'Không thể chuyển vào nhóm con của chính nó' })
      }
      data.parentId = parentId
    }
    const group = await prisma.serviceGroup.update({ where: { id }, data })
    await logAdminAction(req.admin.sub, 'serviceGroup.update', { entityType: 'ServiceGroup', entityId: id })
    res.json({ group })
  } catch (err) {
    next(err)
  }
}

// Xóa nhóm: nhóm con trở thành nhóm gốc (parentId = null), các gắn kết tự xóa (cascade).
export async function deleteGroup(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!(await prisma.serviceGroup.findUnique({ where: { id } }))) return res.status(404).json({ message: 'Không tìm thấy nhóm' })
    await prisma.serviceGroup.delete({ where: { id } })
    await logAdminAction(req.admin.sub, 'serviceGroup.delete', { entityType: 'ServiceGroup', entityId: id })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// Chi tiết nhóm: thành viên hiện có (tour/homestay/bài viết) + danh sách để thêm.
export async function getGroupMembers(req, res, next) {
  try {
    const id = Number(req.params.id)
    const group = await prisma.serviceGroup.findUnique({ where: { id } })
    if (!group) return res.status(404).json({ message: 'Không tìm thấy nhóm' })

    const [tours, properties, guides, allTours, allProps, allGuides] = await Promise.all([
      prisma.serviceGroupTour.findMany({ where: { groupId: id }, include: { tour: { select: { id: true, title: true } } } }),
      prisma.serviceGroupProperty.findMany({ where: { groupId: id }, include: { property: { select: { id: true, name: true } } } }),
      prisma.serviceGroupGuide.findMany({ where: { groupId: id }, include: { guide: { select: { id: true, title: true } } } }),
      prisma.tour.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
      prisma.property.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.travelGuide.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    ])
    res.json({
      group,
      members: {
        tours: tours.map((t) => t.tour),
        properties: properties.map((p) => p.property),
        guides: guides.map((g) => g.guide),
      },
      options: { tours: allTours, properties: allProps, guides: allGuides },
    })
  } catch (err) {
    next(err)
  }
}

// Gắn một mục vào nhóm (kind: tour|property|guide).
export async function addItem(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { kind, itemId } = req.body
    const iid = Number(itemId)
    if (!iid) return res.status(400).json({ message: 'Thiếu mục cần thêm' })
    if (!(await prisma.serviceGroup.findUnique({ where: { id } }))) return res.status(404).json({ message: 'Không tìm thấy nhóm' })

    if (kind === 'tour') await prisma.serviceGroupTour.upsert({ where: { groupId_tourId: { groupId: id, tourId: iid } }, update: {}, create: { groupId: id, tourId: iid } })
    else if (kind === 'property') await prisma.serviceGroupProperty.upsert({ where: { groupId_propertyId: { groupId: id, propertyId: iid } }, update: {}, create: { groupId: id, propertyId: iid } })
    else if (kind === 'guide') await prisma.serviceGroupGuide.upsert({ where: { groupId_guideId: { groupId: id, guideId: iid } }, update: {}, create: { groupId: id, guideId: iid } })
    else return res.status(400).json({ message: 'Loại mục không hợp lệ' })

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// Gỡ một mục khỏi nhóm.
export async function removeItem(req, res, next) {
  try {
    const id = Number(req.params.id)
    const kind = req.params.kind
    const iid = Number(req.params.itemId)
    if (kind === 'tour') await prisma.serviceGroupTour.deleteMany({ where: { groupId: id, tourId: iid } })
    else if (kind === 'property') await prisma.serviceGroupProperty.deleteMany({ where: { groupId: id, propertyId: iid } })
    else if (kind === 'guide') await prisma.serviceGroupGuide.deleteMany({ where: { groupId: id, guideId: iid } })
    else return res.status(400).json({ message: 'Loại mục không hợp lệ' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

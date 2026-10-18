import { prisma } from './prisma.js'

export function slugifyGroup(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function allGroupsFlat() {
  return prisma.serviceGroup.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] })
}

// Dựng cây lồng nhau từ danh sách phẳng (gắn thêm children []).
export function buildTree(flat) {
  const byId = new Map(flat.map((g) => [g.id, { ...g, children: [] }]))
  const roots = []
  for (const g of byId.values()) {
    if (g.parentId && byId.has(g.parentId)) byId.get(g.parentId).children.push(g)
    else roots.push(g)
  }
  return roots
}

// Trả về [groupId, ...toàn bộ nhóm con cháu] để lọc gồm cả nhóm con.
export async function descendantIds(groupId, flat) {
  const groups = flat || (await allGroupsFlat())
  const byParent = new Map()
  for (const g of groups) {
    const arr = byParent.get(g.parentId) || []
    arr.push(g.id)
    byParent.set(g.parentId, arr)
  }
  const out = []
  const stack = [Number(groupId)]
  while (stack.length) {
    const id = stack.pop()
    out.push(id)
    for (const c of byParent.get(id) || []) stack.push(c)
  }
  return out
}

// id các tour / chỗ nghỉ thuộc một nhóm (gồm nhóm con). Dùng cho lọc & khuyến mãi theo nhóm.
export async function tourIdsInGroup(groupId) {
  const ids = await descendantIds(groupId)
  const rows = await prisma.serviceGroupTour.findMany({ where: { groupId: { in: ids } }, select: { tourId: true } })
  return [...new Set(rows.map((r) => r.tourId))]
}
export async function propertyIdsInGroup(groupId) {
  const ids = await descendantIds(groupId)
  const rows = await prisma.serviceGroupProperty.findMany({ where: { groupId: { in: ids } }, select: { propertyId: true } })
  return [...new Set(rows.map((r) => r.propertyId))]
}

// Kiểm tra một sản phẩm (tour/property) có thuộc nhóm (gồm nhóm con) không.
export async function productInGroup({ groupId, tourId, propertyId }) {
  const ids = await descendantIds(groupId)
  if (tourId) return (await prisma.serviceGroupTour.count({ where: { groupId: { in: ids }, tourId } })) > 0
  if (propertyId) return (await prisma.serviceGroupProperty.count({ where: { groupId: { in: ids }, propertyId } })) > 0
  return false
}

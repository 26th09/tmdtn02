import { prisma } from '../../lib/prisma.js'
import { logAdminAction } from '../../lib/auditLog.js'

// UC-20 – Danh sách mã khuyến mại kèm trạng thái và số lượt đã dùng.
export async function listDiscounts(req, res, next) {
  try {
    const { status, search } = req.query
    const where = {}
    if (status === 'ACTIVE') where.active = true
    if (status === 'INACTIVE') where.active = false
    if (search) where.code = { contains: String(search).trim().toUpperCase() }

    const items = await prisma.discountCode.findMany({
      where,
      include: { product: { select: { name: true, slug: true } }, serviceGroup: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

export async function getDiscount(req, res, next) {
  try {
    const id = Number(req.params.id)
    const item = await prisma.discountCode.findUnique({
      where: { id },
      include: { product: { select: { name: true, slug: true } } },
    })
    if (!item) return res.status(404).json({ message: 'Không tìm thấy mã khuyến mại' })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

// BR-99: mã duy nhất; kiểm tra thời gian/giá trị hợp lý (4a).
function validatePayload(body) {
  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return 'Thiếu mã khuyến mại'
  if (body.type !== 'PERCENT' && body.type !== 'FIXED') return 'Loại chiết khấu không hợp lệ'

  const value = Number(body.value)
  if (!Number.isFinite(value) || value <= 0) return 'Giá trị chiết khấu phải lớn hơn 0' // 4a: chiết khấu âm
  if (body.type === 'PERCENT' && value > 100) return 'Chiết khấu theo phần trăm không được vượt quá 100%'

  const minOrderValue = body.minOrderValue !== undefined ? Number(body.minOrderValue) : 0
  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) return 'Giá trị đơn tối thiểu không hợp lệ'

  if (body.scope !== undefined && !['ALL', 'HOMESTAY', 'TOUR'].includes(body.scope)) {
    return 'Phạm vi sản phẩm không hợp lệ'
  }
  if (body.audience !== undefined && !['ALL', 'CUSTOMER'].includes(body.audience)) {
    return 'Đối tượng áp dụng không hợp lệ'
  }

  if (body.startAt && body.endAt && new Date(body.startAt) > new Date(body.endAt)) {
    return 'Thời gian hiệu lực không hợp lệ: ngày bắt đầu phải trước ngày kết thúc' // 4a: thời gian sai
  }
  if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '') {
    const maxUses = Number(body.maxUses)
    if (!Number.isInteger(maxUses) || maxUses <= 0) return 'Số lượt sử dụng phải là số nguyên dương'
  }
  return null
}

function toData(body) {
  return {
    code: String(body.code).trim().toUpperCase(),
    type: body.type,
    value: Number(body.value),
    minOrderValue: body.minOrderValue !== undefined ? Number(body.minOrderValue) : 0,
    scope: body.scope || 'ALL',
    productId: body.productId != null && body.productId !== '' ? Number(body.productId) : null,
    serviceGroupId: body.serviceGroupId != null && body.serviceGroupId !== '' ? Number(body.serviceGroupId) : null,
    audience: body.audience || 'ALL',
    startAt: body.startAt ? new Date(body.startAt) : null,
    endAt: body.endAt ? new Date(body.endAt) : null,
    maxUses: body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '' ? Number(body.maxUses) : null,
  }
}

// UC-20 – Tạo mã khuyến mại mới (BR-97/98).
export async function createDiscount(req, res, next) {
  try {
    const issue = validatePayload(req.body)
    if (issue) return res.status(400).json({ message: issue }) // 4a

    const data = toData(req.body)
    const dup = await prisma.discountCode.findUnique({ where: { code: data.code } })
    if (dup) return res.status(409).json({ message: 'Mã khuyến mại đã tồn tại' }) // BR-99/4a

    const item = await prisma.discountCode.create({ data })
    await logAdminAction(req.admin.sub, 'discount.create', {
      entityType: 'DiscountCode',
      entityId: item.id,
      detail: { code: item.code },
    })
    res.status(201).json({ item })
  } catch (err) {
    next(err)
  }
}

// UC-20 – Cập nhật mã khuyến mại.
// BR-100: chỉ ảnh hưởng các lần áp mã SAU — các đơn đã áp mã trước đó đã lưu discountCode/discountAmount
// snapshot ngay trên Booking (từ UC-12) nên không cần và không bị chỉnh sửa ở đây (không hồi tố tự nhiên).
export async function updateDiscount(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.discountCode.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy mã khuyến mại' })

    const merged = { ...existing, ...req.body }
    const issue = validatePayload(merged)
    if (issue) return res.status(400).json({ message: issue }) // 4a

    const data = toData(merged)
    if (data.code !== existing.code) {
      const dup = await prisma.discountCode.findUnique({ where: { code: data.code } })
      if (dup) return res.status(409).json({ message: 'Mã khuyến mại đã tồn tại' }) // BR-99/4a
    }

    const item = await prisma.discountCode.update({ where: { id }, data })
    await logAdminAction(req.admin.sub, 'discount.update', { entityType: 'DiscountCode', entityId: id, detail: data })
    res.json({ item }) // 2a-1: hiệu lực chỉ cho lần áp mã mới, không đổi các đơn cũ
  } catch (err) {
    next(err)
  }
}

// UC-20 (2a) – Bật/tắt mã (giữ lại để không mất dữ liệu thống kê đã áp dụng — BR-100).
export async function setDiscountActive(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { active } = req.body
    if (typeof active !== 'boolean') return res.status(400).json({ message: 'Thiếu trạng thái hợp lệ' })

    const existing = await prisma.discountCode.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy mã khuyến mại' })

    const item = await prisma.discountCode.update({ where: { id }, data: { active } })
    await logAdminAction(req.admin.sub, active ? 'discount.enable' : 'discount.disable', {
      entityType: 'DiscountCode',
      entityId: id,
      detail: { code: existing.code },
    })
    res.json({ item })
  } catch (err) {
    next(err)
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminApiError, adminApi, type AdminPromotion, type ServiceGroup } from '../../lib/adminApi'

const field =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
const label = 'mb-1 block text-sm font-medium text-slate-300'

const emptyForm = {
  title: '', description: '', image: '', active: true,
  startAt: '', endAt: '', discountCode: '', discountPercent: '', serviceGroupId: '', ctaLink: '',
}
// ISO -> giá trị cho <input type="datetime-local"> (giờ địa phương).
function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Quản lý chương trình khuyến mại (banner hiển thị ở trang chủ).
export function AdminPromotionsPage() {
  const [items, setItems] = useState<AdminPromotion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [groups, setGroups] = useState<ServiceGroup[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminApi.listServiceGroups().then((r) => setGroups(r.flat)).catch(() => setGroups([]))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listPromotions()
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách chương trình khuyến mại'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: AdminPromotion) {
    setEditingId(p.id)
    setForm({
      title: p.title, description: p.description ?? '', image: p.image ?? '', active: p.active,
      startAt: toLocalInput(p.startAt), endAt: toLocalInput(p.endAt),
      discountCode: p.discountCode ?? '', discountPercent: p.discountPercent != null ? String(p.discountPercent) : '',
      serviceGroupId: p.serviceGroupId != null ? String(p.serviceGroupId) : '', ctaLink: p.ctaLink ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { url } = await adminApi.uploadPromotionImage(file)
      setForm((f) => ({ ...f, image: url }))
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tải ảnh thất bại')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Vui lòng nhập tiêu đề chương trình')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        image: form.image.trim() || undefined,
        active: form.active,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
        discountCode: form.discountCode.trim() || null,
        discountPercent: form.discountPercent === '' ? null : Number(form.discountPercent),
        serviceGroupId: form.serviceGroupId === '' ? null : Number(form.serviceGroupId),
        ctaLink: form.ctaLink.trim() || null,
      }
      if (editingId) await adminApi.updatePromotion(editingId, payload)
      else await adminApi.createPromotion(payload)
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Lưu chương trình thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(p: AdminPromotion) {
    try {
      await adminApi.setPromotionActive(p.id, !p.active)
      load()
    } catch {
      setError('Không thể đổi trạng thái')
    }
  }

  async function remove(p: AdminPromotion) {
    if (!confirm(`Xóa chương trình "${p.title}"?`)) return
    try {
      await adminApi.deletePromotion(p.id)
      load()
    } catch {
      setError('Không thể xóa chương trình')
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Chương trình khuyến mại</h2>
          <p className="mt-1 text-sm text-slate-400">Banner ưu đãi hiển thị ở mục “Khuyến mại đang chạy” trên trang chủ.</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          + Thêm chương trình
        </button>
      </div>

      {error && !showForm && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <p className="py-16 text-center text-slate-400">Đang tải...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center text-slate-400">
          Chưa có chương trình khuyến mại nào. Bấm “Thêm chương trình” để tạo mới.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="relative aspect-[16/9] bg-slate-800">
                {p.image && <img src={p.image} alt={p.title} className="h-full w-full object-cover" />}
                <span
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    p.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {p.active ? 'Đang hiển thị' : 'Đang ẩn'}
                </span>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-white">{p.title}</h3>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{p.description}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    {p.active ? 'Ẩn' : 'Hiển thị'}
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tạo/sửa */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
          <div className="mt-10 w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              {editingId ? 'Sửa chương trình' : 'Thêm chương trình'}
            </h3>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className={label}>Tiêu đề *</label>
                <input
                  className={field}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="VD: Giảm 20% đặt homestay dịp lễ"
                />
              </div>
              <div>
                <label className={label}>Mô tả</label>
                <textarea
                  className={`${field} min-h-20`}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="VD: Áp dụng cho đơn đặt trước 7 ngày."
                />
              </div>
              <div>
                <label className={label}>Ảnh banner</label>
                {form.image && (
                  <img src={form.image} alt="" className="mb-2 aspect-[16/9] w-full rounded-lg object-cover" />
                )}
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {uploading ? 'Đang tải...' : form.image ? 'Đổi ảnh' : 'Tải ảnh lên'}
                  </button>
                  {form.image && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, image: '' }))}
                      className="text-sm text-slate-400 hover:text-slate-200"
                    >
                      Bỏ ảnh
                    </button>
                  )}
                </div>
              </div>
              {/* Khuyến mãi động: thời gian đếm lùi + tham chiếu sản phẩm đang giảm */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Bắt đầu</label>
                  <input type="datetime-local" className={field} value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Kết thúc (đếm lùi)</label>
                  <input type="datetime-local" className={field} value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
                </div>
                <div>
                  <label className={label}>Mã giảm giá (hiển thị)</label>
                  <input className={`${field} uppercase`} value={form.discountCode} onChange={(e) => setForm((f) => ({ ...f, discountCode: e.target.value.toUpperCase() }))} placeholder="VD: STAYTOUR10" />
                </div>
                <div>
                  <label className={label}>% giảm (nhãn)</label>
                  <input type="number" min={0} max={100} className={field} value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} placeholder="VD: 20" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Nhóm dịch vụ đang giảm (tham chiếu tour/homestay)</label>
                  <select className={field} value={form.serviceGroupId} onChange={(e) => setForm((f) => ({ ...f, serviceGroupId: e.target.value }))}>
                    <option value="">— Không gắn nhóm —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Trang chủ sẽ hiển thị các tour/homestay trong nhóm này kèm đồng hồ đếm lùi.</p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Hiển thị trên trang chủ
              </label>

              {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submitting ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi, type AdminDiscount, type ServiceGroup } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

const emptyForm = {
  code: '',
  type: 'PERCENT' as 'PERCENT' | 'FIXED',
  value: '',
  minOrderValue: '0',
  scope: 'ALL' as 'ALL' | 'HOMESTAY' | 'TOUR',
  serviceGroupId: '' as string,
  audience: 'ALL' as 'ALL' | 'CUSTOMER',
  startAt: '',
  endAt: '',
  maxUses: '',
}

function toDateInput(s: string | null) {
  return s ? s.slice(0, 10) : ''
}

// UC-20 – Quản lý mã khuyến mại: tạo/sửa/bật-tắt (BR-97→102).
export function AdminDiscountsPage() {
  const [items, setItems] = useState<AdminDiscount[]>([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [groups, setGroups] = useState<ServiceGroup[]>([])

  useEffect(() => {
    adminApi.listServiceGroups().then((r) => setGroups(r.flat)).catch(() => setGroups([]))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listDiscounts({ status: status || undefined, search: search || undefined })
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách mã khuyến mại'))
      .finally(() => setLoading(false))
  }, [status, search])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowForm(true)
  }

  function openEdit(d: AdminDiscount) {
    setEditingId(d.id)
    setForm({
      code: d.code,
      type: d.type,
      value: String(d.value),
      minOrderValue: String(d.minOrderValue),
      scope: d.scope,
      serviceGroupId: d.serviceGroupId != null ? String(d.serviceGroupId) : '',
      audience: d.audience,
      startAt: toDateInput(d.startAt),
      endAt: toDateInput(d.endAt),
      maxUses: d.maxUses != null ? String(d.maxUses) : '',
    })
    setError(null)
    setShowForm(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const payload = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      minOrderValue: Number(form.minOrderValue || 0),
      scope: form.scope,
      serviceGroupId: form.serviceGroupId === '' ? null : Number(form.serviceGroupId),
      audience: form.audience,
      startAt: form.startAt || null,
      endAt: form.endAt || null,
      maxUses: form.maxUses === '' ? null : Number(form.maxUses),
    }
    try {
      if (editingId) {
        await adminApi.updateDiscount(editingId, payload)
      } else {
        await adminApi.createDiscount(payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Lưu mã khuyến mại thất bại') // 4a
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(d: AdminDiscount) {
    setError(null)
    try {
      await adminApi.setDiscountActive(d.id, !d.active)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Cập nhật thất bại')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Quản lý mã khuyến mại</h1>
        <button onClick={openCreate} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + Tạo mã mới
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo mã..." className={`${field} w-56`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang bật</option>
          <option value="INACTIVE">Đã tắt</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="mb-3 font-semibold text-slate-200">{editingId ? `Sửa mã #${editingId}` : 'Tạo mã mới'}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Mã
              <input className={field} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Loại chiết khấu
              <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FIXED' })}>
                <option value="PERCENT">Phần trăm (%)</option>
                <option value="FIXED">Số tiền cố định</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Giá trị {form.type === 'PERCENT' ? '(%, 1-100)' : '(VNĐ)'}
              <input className={field} type="number" min={0} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Đơn tối thiểu (VNĐ)
              <input className={field} type="number" min={0} value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Phạm vi sản phẩm
              <select className={field} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'ALL' | 'HOMESTAY' | 'TOUR' })}>
                <option value="ALL">Tất cả</option>
                <option value="HOMESTAY">Chỉ Homestay</option>
                <option value="TOUR">Chỉ Tour</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Nhóm dịch vụ (tùy chọn)
              <select className={field} value={form.serviceGroupId} onChange={(e) => setForm({ ...form, serviceGroupId: e.target.value })}>
                <option value="">— Không giới hạn nhóm —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Đối tượng
              <select className={field} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as 'ALL' | 'CUSTOMER' })}>
                <option value="ALL">Tất cả</option>
                <option value="CUSTOMER">Chỉ thành viên đăng nhập</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Ngày bắt đầu
              <input className={field} type="date" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Ngày kết thúc
              <input className={field} type="date" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tổng số lượt (để trống = không giới hạn)
              <input className={field} type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="Không giới hạn" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={submitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {submitting ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Tạo mã'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              Hủy
            </button>
          </div>
        </form>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Chưa có mã khuyến mại nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3">Chiết khấu</th>
                <th className="px-4 py-3">Điều kiện</th>
                <th className="px-4 py-3">Hiệu lực</th>
                <th className="px-4 py-3">Lượt dùng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-mono text-slate-200">{d.code}</td>
                  <td className="px-4 py-3 text-slate-300">{d.type === 'PERCENT' ? `${d.value}%` : `${d.value.toLocaleString('vi-VN')}₫`}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    Tối thiểu {d.minOrderValue.toLocaleString('vi-VN')}₫
                    <br />
                    {d.scope === 'ALL' ? 'Mọi sản phẩm' : d.scope === 'HOMESTAY' ? 'Chỉ Homestay' : 'Chỉ Tour'}
                    {d.audience === 'CUSTOMER' ? ' · Chỉ thành viên' : ''}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {d.startAt ? new Date(d.startAt).toLocaleDateString('vi-VN') : '-'} → {d.endAt ? new Date(d.endAt).toLocaleDateString('vi-VN') : '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {d.usedCount}/{d.maxUses ?? '∞'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${d.active ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {d.active ? 'Đang bật' : 'Đã tắt'}
                    </span>
                  </td>
                  <td className="space-x-2 px-4 py-3">
                    <button onClick={() => openEdit(d)} className="text-emerald-400 hover:underline">
                      Sửa
                    </button>
                    <button onClick={() => toggleActive(d)} className="text-slate-400 hover:underline">
                      {d.active ? 'Tắt' : 'Bật'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

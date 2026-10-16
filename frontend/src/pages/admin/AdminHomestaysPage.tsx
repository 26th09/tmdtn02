import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminProduct } from '../../lib/adminApi'

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Nháp (chờ công bố)', VISIBLE: 'Đang hiển thị', HIDDEN: 'Đã ẩn' }
const STATUS_COLOR: Record<string, string> = { DRAFT: 'bg-amber-900 text-amber-300', VISIBLE: 'bg-emerald-900 text-emerald-300', HIDDEN: 'bg-slate-800 text-slate-400' }

// UC-16 – Danh sách chỗ nghỉ trong khu vực quản trị (mọi trạng thái).
export function AdminHomestaysPage() {
  const [items, setItems] = useState<AdminProduct[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listHomestays({ status: status || undefined, search: search || undefined })
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách'))
      .finally(() => setLoading(false))
  }, [status, search])

  useEffect(() => {
    load()
  }, [load])

  async function toggleVisibility(p: AdminProduct) {
    const next = p.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE'
    setError(null)
    setWarning(null)
    try {
      const r = await adminApi.setHomestayVisibility(p.id, next)
      setWarning(r.warning?.message ?? null) // BR-75
      load()
    } catch (err) {
      // BR-73: công bố khi chưa đủ điều kiện -> hiển thị rõ các mục còn thiếu, giữ nguyên nháp.
      setError(err instanceof AdminApiError ? err.message : 'Cập nhật trạng thái thất bại')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Quản lý Chỗ nghỉ</h1>
        <Link to="/admin/homestays/new" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">+ Thêm mới</Link>
      </div>

      <div className="mb-4 flex gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên..." className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="VISIBLE">Đang hiển thị</option>
          <option value="HIDDEN">Đã ẩn</option>
        </select>
      </div>

      {warning && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">⚠️ {warning}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Chưa có chỗ nghỉ nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Chỗ nghỉ</th>
                <th className="px-4 py-3">Khu vực</th>
                <th className="px-4 py-3">Loại phòng</th>
                <th className="px-4 py-3">Giá từ</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="flex items-center gap-3 px-4 py-3">
                    {p.thumbnail && <img src={p.thumbnail} alt="" className="h-10 w-14 rounded object-cover" />}
                    <div>
                      <span className="text-slate-200">{p.name}</span>
                      <div className="text-xs text-slate-500">{p.propertyCode} · {p.propertyType}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{p.province?.name || '-'}<div className="text-xs text-slate-500">{p.area?.name || ''}</div></td>
                  <td className="px-4 py-3 text-slate-400">{p._count?.roomTypes ?? 0}</td>
                  <td className="px-4 py-3 text-slate-400">{p.basePrice.toLocaleString('vi-VN')}₫</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                  <td className="space-x-2 px-4 py-3">
                    <Link to={`/admin/homestays/${p.id}/edit`} className="text-emerald-400 hover:underline">Sửa</Link>
                    <Link to={`/admin/homestays/${p.id}/calendar`} className="text-blue-400 hover:underline">Lịch phòng</Link>
                    <button onClick={() => toggleVisibility(p)} className="text-slate-400 hover:underline">{p.status === 'VISIBLE' ? 'Gỡ hiển thị' : 'Hiển thị'}</button>
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

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminGuideListItem, type ServiceGroup } from '../../lib/adminApi'

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Nháp', VISIBLE: 'Hiển thị', HIDDEN: 'Ẩn' }
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-700 text-slate-300',
  VISIBLE: 'bg-emerald-900/60 text-emerald-300',
  HIDDEN: 'bg-amber-900/50 text-amber-300',
}

export function AdminGuidesPage() {
  const [items, setItems] = useState<AdminGuideListItem[]>([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [groups, setGroups] = useState<ServiceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.listServiceGroups().then((r) => setGroups(r.flat)).catch(() => setGroups([]))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    adminApi.listGuides({ status: status || undefined, search: search || undefined, group: group ? Number(group) : undefined })
      .then((d) => setItems(d.items))
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Không tải được danh sách'))
      .finally(() => setLoading(false))
  }, [status, search, group])

  useEffect(() => { load() }, [load])

  async function toggle(g: AdminGuideListItem) {
    const next = g.status === 'VISIBLE' ? 'HIDDEN' : 'VISIBLE'
    try {
      await adminApi.setGuideVisibility(g.id, next)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đổi trạng thái thất bại')
    }
  }

  async function remove(g: AdminGuideListItem) {
    if (!window.confirm(`Xóa bài "${g.title}"? Hành động không thể hoàn tác.`)) return
    try {
      await adminApi.deleteGuide(g.id)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Xóa thất bại')
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cẩm nang du lịch</h1>
        <Link to="/admin/guides/new" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">+ Thêm bài viết</Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tiêu đề..."
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none">
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="VISIBLE">Hiển thị</option>
          <option value="HIDDEN">Ẩn</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none">
          <option value="">Tất cả nhóm</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">⚠️ {error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Chưa có bài cẩm nang nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-2">Tiêu đề</th>
                <th className="px-4 py-2">Tác giả</th>
                <th className="px-4 py-2">Địa điểm</th>
                <th className="px-4 py-2">Tour</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((g) => (
                <tr key={g.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {g.coverImage && <img src={g.coverImage} alt="" className="h-8 w-12 rounded object-cover" />}
                      <span className="font-medium text-slate-200">{g.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">{g.authorName || '-'}</td>
                  <td className="px-4 py-2">{g.locationName || '-'}</td>
                  <td className="px-4 py-2">{g._count?.relatedTours ?? 0}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[g.status]}`}>{STATUS_LABEL[g.status]}</span></td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-3">
                      <Link to={`/admin/guides/${g.id}/edit`} className="text-emerald-400 hover:underline">Sửa</Link>
                      <button onClick={() => toggle(g)} className="text-slate-300 hover:underline">{g.status === 'VISIBLE' ? 'Ẩn' : 'Hiện'}</button>
                      <button onClick={() => remove(g)} className="text-red-400 hover:underline">Xóa</button>
                    </div>
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

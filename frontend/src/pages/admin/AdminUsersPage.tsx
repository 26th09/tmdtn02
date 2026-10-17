import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminCustomer } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

// UC-19 – Quản lý khách hàng. (Tài khoản quản trị quản lý riêng tại /admin/admins theo luồng bảo mật.)
export function AdminUsersPage() {
  const { admin } = useAdminAuth()
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Quản lý người dùng</h1>
      {admin?.role === 'SUPER_ADMIN' && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-400">
          Quản lý tài khoản quản trị (thêm admin, gửi email kích hoạt, khóa/mở) tại{' '}
          <Link to="/admin/admins" className="text-emerald-400 hover:underline">Tài khoản quản trị</Link>.
        </div>
      )}
      <CustomersTab />
    </div>
  )
}

// ---------- Tab khách hàng (BR-95) ----------
function CustomersTab() {
  const [items, setItems] = useState<AdminCustomer[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listCustomers({ status: status || undefined, search: search || undefined })
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách khách hàng'))
      .finally(() => setLoading(false))
  }, [status, search])

  useEffect(() => {
    load()
  }, [load])

  async function toggleLock(u: AdminCustomer) {
    setError(null)
    setWarning(null)
    try {
      const r = await adminApi.setCustomerLock(u.id, !u.disabled)
      setWarning(r.warning?.message ?? null) // 3a-1
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Cập nhật thất bại')
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo email, tên..." className={`${field} w-64`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="DISABLED">Đã khóa</option>
        </select>
      </div>

      {warning && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">⚠️ {warning}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Không có tài khoản nào khớp bộ lọc.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">SĐT</th>
                <th className="px-4 py-3">Số đơn</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-200">{u.email}</td>
                  <td className="px-4 py-3 text-slate-400">{u.name || '-'}</td>
                  <td className="px-4 py-3 text-slate-400">{u.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-400">{u._count.bookings}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${u.disabled ? 'bg-red-950 text-red-300' : 'bg-emerald-900 text-emerald-300'}`}>
                      {u.disabled ? 'Đã khóa' : 'Đang hoạt động'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleLock(u)} className="text-slate-300 hover:underline">
                      {u.disabled ? 'Mở khóa' : 'Khóa'}
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


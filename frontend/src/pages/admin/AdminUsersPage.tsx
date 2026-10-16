import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi, type AdminAccount, type AdminCustomer } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

// UC-19 – Quản lý người dùng & phân quyền: 2 tab (Khách hàng / Quản trị viên).
export function AdminUsersPage() {
  const { admin } = useAdminAuth()
  const [tab, setTab] = useState<'customers' | 'admins'>('customers')

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Quản lý người dùng</h1>
      <div className="mb-6 flex gap-2 border-b border-slate-800">
        <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
          Khách hàng
        </TabButton>
        {admin?.role === 'SUPER_ADMIN' && (
          <TabButton active={tab === 'admins'} onClick={() => setTab('admins')}>
            Quản trị viên
          </TabButton>
        )}
      </div>
      {tab === 'customers' ? <CustomersTab /> : <AdminsTab />}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
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

// ---------- Tab quản trị viên (BR-91/92/93/94, chỉ SUPER_ADMIN) ----------
function AdminsTab() {
  const [items, setItems] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'MANAGER' as 'SUPER_ADMIN' | 'MANAGER' })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listAdmins()
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách quản trị viên'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await adminApi.createAdmin(form)
      setForm({ username: '', password: '', name: '', role: 'MANAGER' })
      setShowCreate(false)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tạo tài khoản thất bại') // 5a
    } finally {
      setSubmitting(false)
    }
  }

  async function changeRole(a: AdminAccount, role: 'SUPER_ADMIN' | 'MANAGER') {
    setError(null)
    try {
      await adminApi.updateAdminRole(a.id, role)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đổi vai trò thất bại') // 4a
    }
  }

  async function toggleActive(a: AdminAccount) {
    setError(null)
    try {
      await adminApi.setAdminActive(a.id, !a.active)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Cập nhật thất bại') // 4a
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {showCreate ? 'Đóng' : '+ Tạo tài khoản quản trị'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createAdmin} className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tài khoản
              <input className={field} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Mật khẩu (≥8 ký tự)
              <input className={field} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tên hiển thị
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Vai trò
              <select className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'SUPER_ADMIN' | 'MANAGER' })}>
                <option value="MANAGER">Quản lý (MANAGER)</option>
                <option value="SUPER_ADMIN">Toàn quyền (SUPER_ADMIN)</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 text-slate-200">{a.username}</td>
                  <td className="px-4 py-3 text-slate-400">{a.name || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={a.role}
                      onChange={(e) => changeRole(a, e.target.value as 'SUPER_ADMIN' | 'MANAGER')}
                      className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                    >
                      <option value="MANAGER">Quản lý</option>
                      <option value="SUPER_ADMIN">Toàn quyền</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${a.active ? 'bg-emerald-900 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
                      {a.active ? 'Đang hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(a)} className="text-slate-300 hover:underline">
                      {a.active ? 'Khóa' : 'Mở khóa'}
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

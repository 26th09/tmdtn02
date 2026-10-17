import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi, type AdminAccount } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Toàn quyền', MANAGER: 'Quản lý' }

// Quản lý tài khoản quản trị (chỉ SUPER_ADMIN). Không có đăng ký công khai: tạo từ đây, hệ thống
// gửi email tài khoản + mật khẩu tạm + link kích hoạt; admin mới kích hoạt lần đầu và đặt mật khẩu.
export function AdminAccountsPage() {
  const [items, setItems] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('MANAGER')
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listAdmins()
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách tài khoản'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => load(), [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    setCreating(true)
    try {
      await adminApi.createAdmin({ username: username.trim(), email: email.trim(), name: name.trim() || undefined, role })
      setMsg(`✓ Đã tạo tài khoản "${username}" và gửi email kích hoạt tới ${email}.`)
      setUsername('')
      setEmail('')
      setName('')
      setRole('MANAGER')
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tạo tài khoản thất bại')
    } finally {
      setCreating(false)
    }
  }

  async function resend(a: AdminAccount) {
    setError(null)
    setMsg(null)
    setBusyId(a.id)
    try {
      await adminApi.resendAdminActivation(a.id)
      setMsg(`✓ Đã gửi lại email kích hoạt cho "${a.username}".`)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Gửi lại thất bại')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(a: AdminAccount) {
    setError(null)
    setMsg(null)
    setBusyId(a.id)
    try {
      await adminApi.setAdminActive(a.id, !a.active)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Thao tác thất bại')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Quản lý tài khoản quản trị</h1>

      {/* Tạo tài khoản mới */}
      <form onSubmit={create} className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Thêm quản trị viên</h2>
        <p className="mb-3 text-xs text-slate-500">
          Không thể tự đăng ký. Hệ thống sẽ gửi email kèm mật khẩu tạm + liên kết kích hoạt; admin mới kích hoạt lần đầu,
          xác thực OTP và đặt mật khẩu mới.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className={field} placeholder="Tên đăng nhập *" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className={field} type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={field} placeholder="Họ tên" value={name} onChange={(e) => setName(e.target.value)} />
          <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="MANAGER">Quản lý</option>
            <option value="SUPER_ADMIN">Toàn quyền</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creating || !username.trim() || !email.trim()}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {creating ? 'Đang tạo...' : '+ Tạo & gửi email kích hoạt'}
        </button>
      </form>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}
      {msg && <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{msg}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Hạn mật khẩu</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className="px-4 py-3">
                    <span className="text-slate-200">{a.username}</span>
                    {a.name && <div className="text-xs text-slate-500">{a.name}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{a.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{ROLE_LABEL[a.role]}</td>
                  <td className="px-4 py-3">
                    {!a.active ? (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">Đã khóa</span>
                    ) : !a.activated ? (
                      <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-300">Chờ kích hoạt</span>
                    ) : (
                      <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">Hoạt động</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {a.activated ? (
                      <span className={a.passwordDaysLeft <= 7 ? 'text-amber-400' : ''}>
                        còn {a.passwordDaysLeft} ngày
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="space-x-3 px-4 py-3">
                    {!a.activated && (
                      <button disabled={busyId === a.id} onClick={() => resend(a)} className="text-emerald-400 hover:underline disabled:opacity-50">
                        Gửi lại email
                      </button>
                    )}
                    <button disabled={busyId === a.id} onClick={() => toggleActive(a)} className="text-slate-400 hover:underline disabled:opacity-50">
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

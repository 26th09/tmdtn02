import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi, type AdminAuditLogEntry, type AdminLoginAttemptEntry, type AdminSystemConfig } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

// UC-23 – Cấu hình hệ thống & nhật ký: 2 tab (Cấu hình / Nhật ký), cả 2 chỉ SUPER_ADMIN sửa/xem đầy đủ (BR-117).
export function AdminConfigPage() {
  const { admin } = useAdminAuth()
  const [tab, setTab] = useState<'config' | 'logs'>('config')
  const isSuperAdmin = admin?.role === 'SUPER_ADMIN'

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Cấu hình hệ thống & nhật ký</h1>
      <div className="mb-6 flex gap-2 border-b border-slate-800">
        <TabButton active={tab === 'config'} onClick={() => setTab('config')}>
          Cấu hình
        </TabButton>
        {isSuperAdmin && (
          <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
            Nhật ký hệ thống
          </TabButton>
        )}
      </div>
      {tab === 'config' ? <ConfigTab isSuperAdmin={isSuperAdmin} /> : <LogsTab />}
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

// ---------- Tab cấu hình (BR-113/114/115) ----------
function ConfigTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [config, setConfig] = useState<AdminSystemConfig | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .getSystemConfig()
      .then((r) => {
        setConfig(r.config)
        setForm({
          depositRatePercent: String(r.config.depositRatePercent),
          cancelFreeHours: String(r.config.cancelFreeHours),
          cancelTier1Days: String(r.config.cancelTier1Days),
          cancelTier1Ratio: String(r.config.cancelTier1Ratio),
          cancelTier2Days: String(r.config.cancelTier2Days),
          cancelTier2Ratio: String(r.config.cancelTier2Ratio),
          vatPercent: String(r.config.vatPercent ?? 8),
          fullPaymentHoursBeforeStart: String(r.config.fullPaymentHoursBeforeStart ?? 1),
          codDueDays: String(r.config.codDueDays ?? 7),
          sellerName: r.config.sellerName || '',
          sellerAddress: r.config.sellerAddress || '',
          sellerPhone: r.config.sellerPhone || '',
          sellerEmail: r.config.sellerEmail || '',
          siteNotice: r.config.siteNotice || '',
        })
      })
      .catch(() => setError('Không tải được cấu hình'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      await adminApi.updateSystemConfig({
        depositRatePercent: Number(form.depositRatePercent),
        cancelFreeHours: Number(form.cancelFreeHours),
        cancelTier1Days: Number(form.cancelTier1Days),
        cancelTier1Ratio: Number(form.cancelTier1Ratio),
        cancelTier2Days: Number(form.cancelTier2Days),
        cancelTier2Ratio: Number(form.cancelTier2Ratio),
        vatPercent: Number(form.vatPercent),
        fullPaymentHoursBeforeStart: Number(form.fullPaymentHoursBeforeStart),
        codDueDays: Number(form.codDueDays),
        sellerName: form.sellerName || undefined,
        sellerAddress: form.sellerAddress || undefined,
        sellerPhone: form.sellerPhone || undefined,
        sellerEmail: form.sellerEmail || undefined,
        siteNotice: form.siteNotice || undefined,
      })
      setInfo('Đã lưu cấu hình. Thay đổi áp dụng cho các đơn/giao dịch phát sinh từ bây giờ trở đi.')
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Lưu cấu hình thất bại') // 3a
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-500">Đang tải...</p>
  if (!config) return <p className="text-red-400">{error || 'Không tìm thấy cấu hình'}</p>

  return (
    <form onSubmit={submit} className="space-y-6">
      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2 text-sm text-amber-300">
          Bạn chỉ có quyền xem cấu hình hiện tại. Chỉ SUPER_ADMIN mới được thay đổi (BR-117).
        </div>
      )}
      {info && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{info}</div>}
      {error && <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Tỷ lệ đặt cọc (BR-113)</h2>
        <label className="flex w-48 flex-col gap-1 text-xs text-slate-400">
          Tỷ lệ cọc (%)
          <input
            className={field}
            type="number"
            min={1}
            max={100}
            disabled={!isSuperAdmin}
            value={form.depositRatePercent || ''}
            onChange={(e) => setForm({ ...form, depositRatePercent: e.target.value })}
          />
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Chính sách hủy & hoàn tiền (BR-114)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Miễn phí hủy trong (giờ)
            <input className={field} type="number" min={0} disabled={!isSuperAdmin} value={form.cancelFreeHours || ''} onChange={(e) => setForm({ ...form, cancelFreeHours: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Mốc mức 1 (ngày trước ngày nhận/khởi hành)
            <input className={field} type="number" min={0} disabled={!isSuperAdmin} value={form.cancelTier1Days || ''} onChange={(e) => setForm({ ...form, cancelTier1Days: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Tỷ lệ hoàn mức 1 (%)
            <input className={field} type="number" min={0} max={100} disabled={!isSuperAdmin} value={form.cancelTier1Ratio || ''} onChange={(e) => setForm({ ...form, cancelTier1Ratio: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Mốc mức 2 (ngày)
            <input className={field} type="number" min={0} disabled={!isSuperAdmin} value={form.cancelTier2Days || ''} onChange={(e) => setForm({ ...form, cancelTier2Days: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Tỷ lệ hoàn mức 2 (%)
            <input className={field} type="number" min={0} max={100} disabled={!isSuperAdmin} value={form.cancelTier2Ratio || ''} onChange={(e) => setForm({ ...form, cancelTier2Ratio: e.target.value })} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Dưới mốc mức 2: không hoàn tiền. Thay đổi chỉ áp dụng cho các đơn/giao dịch phát sinh sau khi lưu (BR-115), không hồi tố các đơn đã tạo.
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Tài chính</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Thuế GTGT / VAT (%)
            <input className={field} type="number" min={0} max={100} disabled={!isSuperAdmin} value={form.vatPercent || ''} onChange={(e) => setForm({ ...form, vatPercent: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Hạn trả đủ trước giờ đi/checkin (giờ)
            <input className={field} type="number" min={0} disabled={!isSuperAdmin} value={form.fullPaymentHoursBeforeStart || ''} onChange={(e) => setForm({ ...form, fullPaymentHoursBeforeStart: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Hạn thu tay (ngày)
            <input className={field} type="number" min={1} disabled={!isSuperAdmin} value={form.codDueDays || ''} onChange={(e) => setForm({ ...form, codDueDays: e.target.value })} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          VAT dùng để tách doanh thu "sau thuế" và "thuế" trong báo cáo. Đơn chưa trả đủ trước giờ đi/checkin, hoặc thu tay quá hạn, sẽ bị tự hủy và hoàn tồn kho (chính sách bắt buộc). Mức hoàn tiền áp theo các mốc hủy ở trên.
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Thông tin người bán</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Tên đơn vị
            <input className={field} disabled={!isSuperAdmin} value={form.sellerName || ''} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Email liên hệ
            <input className={field} disabled={!isSuperAdmin} value={form.sellerEmail || ''} onChange={(e) => setForm({ ...form, sellerEmail: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Điện thoại
            <input className={field} disabled={!isSuperAdmin} value={form.sellerPhone || ''} onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Địa chỉ
            <input className={field} disabled={!isSuperAdmin} value={form.sellerAddress || ''} onChange={(e) => setForm({ ...form, sellerAddress: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Thiết lập chung</h2>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Thông báo chung (tùy chọn)
          <textarea
            className={`${field} h-20`}
            disabled={!isSuperAdmin}
            value={form.siteNotice || ''}
            onChange={(e) => setForm({ ...form, siteNotice: e.target.value })}
          />
        </label>
      </section>

      {isSuperAdmin && (
        <button type="submit" disabled={submitting} className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {submitting ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      )}
    </form>
  )
}

// ---------- Tab nhật ký hệ thống (BR-116: chỉ đọc) ----------
function LogsTab() {
  const [actionFilter, setActionFilter] = useState('')
  const [items, setItems] = useState<AdminAuditLogEntry[]>([])
  const [loginAttempts, setLoginAttempts] = useState<AdminLoginAttemptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'actions' | 'logins'>('actions')

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listAuditLogs({ action: actionFilter || undefined })
      .then((r) => {
        setItems(r.items)
        setLoginAttempts(r.loginAttempts)
      })
      .catch(() => setError('Không tải được nhật ký'))
      .finally(() => setLoading(false))
  }, [actionFilter])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Lọc theo loại sự kiện (tiền tố, vd "order.", "config.")
          <input className={`${field} w-72`} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="order." />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setView('actions')}
            className={`rounded-lg px-3 py-2 text-sm ${view === 'actions' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300'}`}
          >
            Thao tác quản trị
          </button>
          <button
            onClick={() => setView('logins')}
            className={`rounded-lg px-3 py-2 text-sm ${view === 'logins' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300'}`}
          >
            Đăng nhập
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : view === 'actions' ? (
        items.length === 0 ? (
          <p className="text-slate-500">Không có sự kiện nào khớp bộ lọc.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-950 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2">Thời gian</th>
                  <th className="px-4 py-2">Quản trị viên</th>
                  <th className="px-4 py-2">Hành động</th>
                  <th className="px-4 py-2">Đối tượng</th>
                  <th className="px-4 py-2">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-t border-slate-800 text-slate-300">
                    <td className="px-4 py-2 text-xs">{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2">{l.adminUsername}</td>
                    <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                    <td className="px-4 py-2 text-xs">
                      {l.entityType}#{l.entityId}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-xs text-slate-500">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : loginAttempts.length === 0 ? (
        <p className="text-slate-500">Không có sự kiện đăng nhập nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr>
                <th className="px-4 py-2">Thời gian</th>
                <th className="px-4 py-2">Tài khoản</th>
                <th className="px-4 py-2">Kết quả</th>
                <th className="px-4 py-2">Lý do</th>
                <th className="px-4 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {loginAttempts.map((a) => (
                <tr key={a.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-4 py-2 text-xs">{new Date(a.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-2">{a.username}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${a.success ? 'bg-emerald-900 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
                      {a.success ? 'Thành công' : 'Thất bại'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{a.reason || '-'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

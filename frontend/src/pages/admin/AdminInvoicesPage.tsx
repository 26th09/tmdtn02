import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminInvoice, type AdminInvoiceStatus } from '../../lib/adminApi'

const STATUS_LABEL: Record<AdminInvoiceStatus, string> = {
  PENDING: 'Chờ phát hành',
  PROCESSING: 'Đang xử lý',
  ISSUED: 'Đã phát hành',
  FAILED: 'Lỗi',
  CANCELED: 'Đã hủy',
}
const STATUS_COLOR: Record<AdminInvoiceStatus, string> = {
  PENDING: 'bg-amber-900 text-amber-300',
  PROCESSING: 'bg-blue-900 text-blue-300',
  ISSUED: 'bg-emerald-900 text-emerald-300',
  FAILED: 'bg-red-900 text-red-300',
  CANCELED: 'bg-slate-800 text-slate-400',
}
const STATUS_ORDER: AdminInvoiceStatus[] = ['PENDING', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELED']

const fmtVnd = (n: number) => (n || 0).toLocaleString('vi-VN') + '₫'
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '—')

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

// Quản lý hóa đơn điện tử (mô phỏng IVAN): liệt kê, lọc, phát hành lại, hủy.
export function AdminInvoicesPage() {
  const [items, setItems] = useState<AdminInvoice[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<'' | AdminInvoiceStatus>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listInvoices({ status: status || undefined, search: search || undefined })
      .then((r) => {
        setItems(r.items)
        setCounts(r.counts)
      })
      .catch(() => setError('Không tải được danh sách hóa đơn'))
      .finally(() => setLoading(false))
  }, [status, search])

  useEffect(() => {
    load()
  }, [load])

  async function onRetry(inv: AdminInvoice) {
    setBusyId(inv.id)
    setMsg(null)
    try {
      await adminApi.retryInvoice(inv.id)
      setMsg({ id: inv.id, text: 'Đã phát hành hóa đơn.', ok: true })
      load()
    } catch (err) {
      setMsg({ id: inv.id, text: err instanceof AdminApiError ? err.message : 'Phát hành lại thất bại', ok: false })
    } finally {
      setBusyId(null)
    }
  }

  async function onCancel(inv: AdminInvoice) {
    const reason = window.prompt('Lý do hủy hóa đơn (vd: hoàn tiền, xuất sai thông tin):', 'Hủy theo yêu cầu quản trị')
    if (reason === null) return
    setBusyId(inv.id)
    setMsg(null)
    try {
      await adminApi.cancelInvoice(inv.id, reason.trim() || undefined)
      setMsg({ id: inv.id, text: 'Đã hủy hóa đơn + gửi biên bản hủy.', ok: true })
      load()
    } catch (err) {
      setMsg({ id: inv.id, text: err instanceof AdminApiError ? err.message : 'Hủy hóa đơn thất bại', ok: false })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Thẻ tổng quan theo trạng thái */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? '' : s)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              status === s ? 'border-emerald-500 bg-slate-800' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
            }`}
          >
            <p className="text-2xl font-bold text-white">{counts[s] ?? 0}</p>
            <p className="text-xs text-slate-400">{STATUS_LABEL[s]}</p>
          </button>
        ))}
      </div>

      {/* Bộ lọc */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${field} flex-1 min-w-48`}
          placeholder="Tìm theo số hóa đơn / MST / tên công ty / mã đơn"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value as '' | AdminInvoiceStatus)}>
          <option value="">Tất cả trạng thái</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
          Lọc
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-slate-500">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-slate-500">Chưa có hóa đơn nào.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Hóa đơn / Đơn</th>
                <th className="px-4 py-3">Bên mua</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Phát hành</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((inv) => (
                <tr key={inv.id} className="bg-slate-950 align-top hover:bg-slate-900/60">
                  <td className="px-4 py-3">
                    {inv.status === 'ISSUED' && inv.invoiceNumber ? (
                      <p className="font-mono font-semibold text-white">{inv.invoiceSerial} · {inv.invoiceNumber}</p>
                    ) : (
                      <p className="text-slate-500">— chưa có số —</p>
                    )}
                    {inv.bookingCode && (
                      <Link to={`/admin/orders/${inv.bookingCode}`} className="font-mono text-xs text-emerald-400 hover:underline">
                        {inv.bookingCode}
                      </Link>
                    )}
                    <p className="text-xs text-slate-500">{inv.productName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-200">{inv.companyName || inv.guestName || '(khách lẻ)'}</p>
                    {inv.taxCode && <p className="text-xs text-slate-500">MST: {inv.taxCode}</p>}
                    <p className="text-xs text-slate-500">{inv.invoiceEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{fmtVnd(inv.paidAmount || inv.totalPrice)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[inv.status]}`}>
                      {STATUS_LABEL[inv.status]}
                    </span>
                    {inv.status === 'FAILED' && (
                      <p className="mt-1 text-xs text-red-400">
                        Thử {inv.retryCount}/{inv.maxRetry}
                        {inv.errorLog ? ` · ${inv.errorLog.slice(0, 60)}` : ''}
                      </p>
                    )}
                    {msg?.id === inv.id && (
                      <p className={`mt-1 text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmtDateTime(inv.issuedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1.5">
                      {inv.status === 'ISSUED' && inv.pdfUrl && (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                        >
                          Xem hóa đơn
                        </a>
                      )}
                      {(inv.status === 'PENDING' || inv.status === 'FAILED' || inv.status === 'PROCESSING') && (
                        <button
                          onClick={() => onRetry(inv)}
                          disabled={busyId === inv.id}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {busyId === inv.id ? 'Đang xử lý…' : 'Phát hành lại'}
                        </button>
                      )}
                      {inv.status !== 'CANCELED' && (
                        <button
                          onClick={() => onCancel(inv)}
                          disabled={busyId === inv.id}
                          className="rounded-lg border border-red-800 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                        >
                          Hủy hóa đơn
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-600">
        Hóa đơn điện tử ở chế độ <strong>mô phỏng</strong> (chưa nối nhà cung cấp IVAN thật). Hóa đơn tự phát hành khi đơn đã thu đủ tiền; lỗi sẽ tự thử lại tối đa 3 lần.
      </p>
    </div>
  )
}

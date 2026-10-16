import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminOrder } from '../../lib/adminApi'
import { exportToExcel, readExcel } from '../../lib/excel'

const STATUS_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Chờ cọc',
  DEPOSITED: 'Đã cọc',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING_DEPOSIT: 'bg-amber-900 text-amber-300',
  DEPOSITED: 'bg-blue-900 text-blue-300',
  CONFIRMED: 'bg-indigo-900 text-indigo-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  CANCELLED: 'bg-slate-800 text-slate-400',
}
// Nhãn tiếng Việt -> mã trạng thái (để nhập lại từ file đã xuất).
const LABEL_TO_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([k, v]) => [v.toLowerCase(), k]),
)

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold'

type ImportResult = { updatedCount: number; total: number; results: { code: string; ok: boolean; message: string; skipped?: boolean }[] }

// UC-18 – Danh sách đơn kèm bộ lọc (trạng thái/loại/khoảng ngày/khoảng giá/tìm kiếm) + xuất/nhập Excel.
export function AdminOrdersPage() {
  const [items, setItems] = useState<AdminOrder[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [minTotal, setMinTotal] = useState('')
  const [maxTotal, setMaxTotal] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listOrders({
        status: status || undefined, type: type || undefined, search: search || undefined,
        from: from || undefined, to: to || undefined, minTotal: minTotal || undefined, maxTotal: maxTotal || undefined,
      })
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách đơn'))
      .finally(() => setLoading(false))
  }, [status, type, search, from, to, minTotal, maxTotal])

  useEffect(() => { load() }, [load])

  function resetFilters() {
    setSearch(''); setStatus(''); setType(''); setFrom(''); setTo(''); setMinTotal(''); setMaxTotal('')
  }

  // Xuất danh sách đơn (đang lọc) ra Excel.
  function onExport() {
    const rows = items.map((o) => ({
      'Mã đơn': o.code,
      'Loại': o.type === 'HOMESTAY' ? 'Homestay' : 'Tour',
      'Sản phẩm': o.productName,
      'Khách': o.guestName,
      'Email': o.guestEmail,
      'SĐT': o.guestPhone,
      'Ngày nhận': o.checkIn ? new Date(o.checkIn).toLocaleDateString('vi-VN') : '',
      'Ngày trả': o.checkOut ? new Date(o.checkOut).toLocaleDateString('vi-VN') : '',
      'Số khách': o.guests,
      'Trẻ em': o.children,
      'Tổng tiền': o.totalPrice,
      'Đặt cọc': o.depositAmount,
      'Còn lại': o.remainingAmount,
      'Thanh toán': o.paymentMethod ?? '',
      'Trạng thái': STATUS_LABEL[o.status] ?? o.status,
      'Ngày tạo': new Date(o.createdAt).toLocaleString('vi-VN'),
    }))
    const stamp = new Date().toISOString().slice(0, 10)
    exportToExcel(rows, `don-hang-${stamp}.xlsx`, 'Đơn hàng')
  }

  // Nhập Excel: đọc cột "Mã đơn" + "Trạng thái" -> cập nhật trạng thái hàng loạt.
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setError(null); setImportResult(null)
    try {
      const raw = await readExcel(file)
      const rows = raw
        .map((r) => {
          const codeKey = Object.keys(r).find((k) => /mã\s*đơn|code/i.test(k))
          const statusKey = Object.keys(r).find((k) => /trạng\s*thái|status/i.test(k))
          const code = codeKey ? String(r[codeKey] ?? '').trim() : ''
          const rawStatus = statusKey ? String(r[statusKey] ?? '').trim() : ''
          const st = LABEL_TO_STATUS[rawStatus.toLowerCase()] ?? rawStatus.toUpperCase()
          return { code, status: st }
        })
        .filter((r) => r.code)
      if (!rows.length) {
        setError('File không có cột "Mã đơn" và "Trạng thái" hợp lệ.')
        return
      }
      const res = await adminApi.bulkUpdateOrderStatus(rows)
      setImportResult(res)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Nhập Excel thất bại. Kiểm tra định dạng file.')
    } finally {
      setImporting(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Quản lý đơn</h1>
        <div className="flex gap-2">
          <button onClick={onExport} disabled={items.length === 0} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40`}>
            ⬇ Xuất Excel
          </button>
          <label className={`${btn} cursor-pointer border border-slate-600 text-slate-200 hover:bg-slate-800 ${importing ? 'opacity-50' : ''}`}>
            {importing ? 'Đang nhập...' : '⬆ Nhập Excel'}
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImportFile} disabled={importing} />
          </label>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-end gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo mã đơn, tên, email..." className={`${field} w-64`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
          <option value="">Tất cả loại</option>
          <option value="HOMESTAY">Homestay</option>
          <option value="TOUR">Tour</option>
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400">Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1 block`} /></label>
        <label className="text-xs text-slate-400">Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1 block`} /></label>
        <label className="text-xs text-slate-400">Giá từ (₫)<input type="number" min={0} value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="0" className={`${field} mt-1 block w-32`} /></label>
        <label className="text-xs text-slate-400">Giá đến (₫)<input type="number" min={0} value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="Không giới hạn" className={`${field} mt-1 block w-40`} /></label>
        <button onClick={resetFilters} className={`${btn} border border-slate-700 text-slate-300 hover:bg-slate-800`}>Xóa lọc</button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div>}

      {importResult && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-200">
              Kết quả nhập: cập nhật <span className="text-emerald-400">{importResult.updatedCount}</span>/{importResult.total} dòng
            </span>
            <button onClick={() => setImportResult(null)} className="text-slate-400 hover:text-slate-200">✕ Đóng</button>
          </div>
          <div className="max-h-48 overflow-auto rounded border border-slate-800">
            <table className="w-full text-xs">
              <tbody>
                {importResult.results.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="px-3 py-1 font-mono text-slate-300">{r.code}</td>
                    <td className={`px-3 py-1 ${r.ok ? (r.skipped ? 'text-slate-400' : 'text-emerald-400') : 'text-red-400'}`}>
                      {r.ok ? (r.skipped ? '○ ' : '✓ ') : '✕ '}{r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Không có đơn nào khớp bộ lọc.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">{items.length} đơn</p>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-950 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3">Mã đơn</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Khách</th>
                  <th className="px-4 py-3">Ngày</th>
                  <th className="px-4 py-3">Tổng tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.code} className="border-t border-slate-800">
                    <td className="px-4 py-3 font-mono text-slate-200">{o.code}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {o.productName} <span className="text-xs text-slate-500">({o.type === 'HOMESTAY' ? 'Homestay' : 'Tour'})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {o.guestName}
                      <div className="text-xs text-slate-600">{o.guestEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{o.checkIn ? new Date(o.checkIn).toLocaleDateString('vi-VN') : '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{o.totalPrice.toLocaleString('vi-VN')}₫</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/orders/${o.code}`} className="text-emerald-400 hover:underline">Chi tiết</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

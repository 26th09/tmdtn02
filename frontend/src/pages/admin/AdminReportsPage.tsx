import { useCallback, useEffect, useState } from 'react'
import { adminApi, type AdminReports } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

const STATUS_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Chờ cọc',
  DEPOSITED: 'Đã cọc',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmt(n: number) {
  return n.toLocaleString('vi-VN') + '₫'
}

// UC-22 – Báo cáo & thống kê (chỉ đọc — BR-108). Dashboard 4 báo cáo trong 1 khoảng thời gian.
export function AdminReportsPage() {
  const [from, setFrom] = useState(toDateInput(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(toDateInput(new Date()))
  const [data, setData] = useState<AdminReports | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    adminApi
      .getReports({ from, to })
      .then(setData)
      .catch(() => setError('Không tải được báo cáo'))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const hasData =
    data && (data.revenue.byDay.length > 0 || data.ordersByStatus.length > 0 || data.topTours.length > 0 || data.homestayOccupancy.length > 0)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Báo cáo & thống kê</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Từ ngày
          <input className={field} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Đến ngày
          <input className={field} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : !data || !hasData ? (
        <p className="text-slate-500">Không có dữ liệu trong khoảng thời gian này.</p> // 2a
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 font-semibold text-slate-200">Doanh thu</h2>
            <div className="mb-4 flex gap-6 text-sm">
              <div>
                <div className="text-slate-500">Tổng thu</div>
                <div className="text-lg font-bold text-emerald-400">{fmt(data.revenue.gross)}</div>
              </div>
              <div>
                <div className="text-slate-500">Đã hoàn</div>
                <div className="text-lg font-bold text-red-400">{fmt(data.revenue.refunded)}</div>
              </div>
              <div>
                <div className="text-slate-500">Thực thu</div>
                <div className="text-lg font-bold text-white">{fmt(data.revenue.net)}</div>
              </div>
            </div>
            {data.revenue.byDay.length > 0 && (
              <div className="space-y-1">
                {data.revenue.byDay.map((d) => {
                  const max = Math.max(...data.revenue.byDay.map((x) => Math.abs(x.amount)), 1)
                  const pct = Math.max(2, Math.round((Math.abs(d.amount) / max) * 100))
                  return (
                    <div key={d.date} className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-24 shrink-0">{new Date(d.date).toLocaleDateString('vi-VN')}</span>
                      <div className="h-3 flex-1 rounded bg-slate-900">
                        <div className={`h-3 rounded ${d.amount >= 0 ? 'bg-emerald-600' : 'bg-red-600'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right">{fmt(d.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 font-semibold text-slate-200">Đơn theo trạng thái</h2>
            {data.ordersByStatus.length === 0 ? (
              <p className="text-sm text-slate-500">Không có đơn trong kỳ.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {data.ordersByStatus.map((s) => (
                  <div key={s.status} className="rounded-lg border border-slate-800 px-4 py-2 text-center">
                    <div className="text-2xl font-bold text-white">{s.count}</div>
                    <div className="text-xs text-slate-400">{STATUS_LABEL[s.status] || s.status}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 font-semibold text-slate-200">Doanh thu theo nhóm dịch vụ</h2>
            {!data.revenueByGroup || data.revenueByGroup.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có doanh thu theo nhóm trong kỳ (cần gắn tour/homestay vào nhóm).</p>
            ) : (
              <div className="space-y-2">
                {data.revenueByGroup.map((g) => {
                  const max = Math.max(...data.revenueByGroup!.map((x) => x.amount), 1)
                  return (
                    <div key={g.id} className="flex items-center gap-3 text-sm">
                      <span className="w-44 shrink-0 truncate text-slate-300">{g.name}</span>
                      <div className="h-3 flex-1 rounded bg-slate-900">
                        <div className="h-3 rounded bg-emerald-600" style={{ width: `${Math.max(2, (g.amount / max) * 100)}%` }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-emerald-400">{fmt(g.amount)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 font-semibold text-slate-200">Tour bán chạy</h2>
            {data.topTours.length === 0 ? (
              <p className="text-sm text-slate-500">Không có đơn tour trong kỳ.</p>
            ) : (
              <table className="block w-full overflow-x-auto text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-4">Tour</th>
                    <th className="py-1 pr-4">Số đơn</th>
                    <th className="py-1 pr-4">Tổng chỗ đã bán</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topTours.map((t) => (
                    <tr key={t.productId} className="border-t border-slate-800 text-slate-300">
                      <td className="py-1 pr-4">{t.name || `#${t.productId}`}</td>
                      <td className="py-1 pr-4">{t.bookingsCount}</td>
                      <td className="py-1 pr-4">{t.seats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 font-semibold text-slate-200">Công suất phòng homestay</h2>
            {data.homestayOccupancy.length === 0 ? (
              <p className="text-sm text-slate-500">Không có dữ liệu lịch phòng trong kỳ.</p>
            ) : (
              <div className="space-y-2">
                {data.homestayOccupancy.map((h) => (
                  <div key={h.productId} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-300">{h.name || `#${h.productId}`}</span>
                    <div className="h-3 flex-1 rounded bg-slate-900">
                      <div className="h-3 rounded bg-blue-600" style={{ width: `${Math.max(2, h.rate)}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-slate-400">{h.rate}%</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

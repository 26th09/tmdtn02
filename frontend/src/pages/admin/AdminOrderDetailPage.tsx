import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminOrderDetail, type AdminPayment, type AdminRefundRequest } from '../../lib/adminApi'

const STATUS_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Chờ cọc',
  DEPOSITED: 'Đã cọc',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

const fmt = (n: number) => n.toLocaleString('vi-VN') + '₫'
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '-')

// UC-18 – Chi tiết đơn: chuyển trạng thái theo vòng đời (BR-85) + xử lý hoàn tiền đang chờ (BR-86/87).
export function AdminOrderDetailPage() {
  const { code } = useParams<{ code: string }>()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [refunds, setRefunds] = useState<AdminRefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refRefund, setRefRefund] = useState<{ id: number; amount: string; referenceCode: string } | null>(null)

  const load = useCallback(() => {
    if (!code) return
    setLoading(true)
    adminApi
      .getOrder(code)
      .then((r) => {
        setOrder(r.order)
        setPayments(r.payments)
        setRefunds(r.refundRequests)
      })
      .catch(() => setError('Không tải được đơn'))
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    load()
  }, [load])

  async function transition(status: string) {
    if (!code) return
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await adminApi.updateOrderStatus(code, status)
      setInfo(`Đã chuyển đơn sang trạng thái "${STATUS_LABEL[status]}"`)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Chuyển trạng thái thất bại') // 3a
    } finally {
      setBusy(false)
    }
  }

  async function confirmProcessRefund(refund: AdminRefundRequest) {
    if (!code || !refRefund) return
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await adminApi.processRefund(code, refund.id, {
        amount: refRefund.amount ? Number(refRefund.amount) : undefined,
        referenceCode: refRefund.referenceCode || undefined,
      })
      setInfo('Đã xác nhận hoàn tiền')
      setRefRefund(null)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Xử lý hoàn tiền thất bại') // 4a
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-slate-500">Đang tải...</p>
  if (!order) return <p className="text-red-400">{error || 'Không tìm thấy đơn'}</p>

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500">
        <Link to="/admin/orders" className="hover:text-emerald-400">
          Quản lý đơn
        </Link>{' '}
        / {order.code}
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-white">
        Đơn {order.code}{' '}
        <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-sm text-slate-400">{STATUS_LABEL[order.status]}</span>
      </h1>

      {info && <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{info}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="mb-3 font-semibold text-slate-200">Sản phẩm & khách</h2>
          <dl className="space-y-1 text-sm">
            <Row label="Sản phẩm" value={`${order.productName} (${order.type === 'HOMESTAY' ? 'Homestay' : 'Tour'})`} />
            <Row label="Họ tên" value={order.guestName} />
            <Row label="Email" value={order.guestEmail} />
            <Row label="Điện thoại" value={order.guestPhone} />
            {order.type === 'HOMESTAY' ? (
              <>
                <Row label="Nhận / trả phòng" value={`${fmtDate(order.checkIn)} → ${fmtDate(order.checkOut)}`} />
                {order.nights != null && <Row label="Số đêm" value={`${order.nights} đêm`} />}
              </>
            ) : (
              <Row label="Ngày khởi hành" value={fmtDate(order.checkIn)} />
            )}
            <Row label="Số khách" value={`${order.guests} người lớn${order.children ? ` · ${order.children} trẻ em` : ''}`} />
            <Row label="Đặt lúc" value={fmtDate(order.createdAt)} />
          </dl>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="mb-3 font-semibold text-slate-200">Thanh toán</h2>
          <dl className="space-y-1 text-sm">
            <Row label="Tổng tiền" value={fmt(order.totalPrice)} />
            <Row label="Đặt cọc" value={fmt(order.depositAmount)} />
            <Row label="Còn lại" value={fmt(order.remainingAmount)} />
            <Row label="Phương thức" value={order.paymentMethod || '-'} />
            <Row label="Mã giao dịch" value={order.transactionId || '-'} />
            <Row label="Cọc lúc" value={fmtDate(order.depositPaidAt)} />
            {order.discountCode && <Row label="Mã giảm giá" value={`${order.discountCode} (-${fmt(order.discountAmount)})`} />}
            {order.cancelledAt && <Row label="Hủy lúc" value={fmtDate(order.cancelledAt)} />}
          </dl>
        </div>
      </div>

      {/* Yêu cầu của khách hàng (từ trường ghi chú khi đặt) */}
      <div className="mb-6 rounded-xl border border-amber-700/40 bg-amber-950/20 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-200">📝 Yêu cầu của khách hàng</h2>
        {order.note ? (
          <ul className="space-y-1.5 text-sm text-slate-200">
            {order.note.split('|').map((part) => part.trim()).filter(Boolean).map((part, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>{part}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Khách hàng không để lại yêu cầu đặc biệt.</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Chuyển trạng thái đơn</h2>
        {order.allowedTransitions.length === 0 ? (
          <p className="text-sm text-slate-500">Đơn đã ở trạng thái cuối vòng đời, không thể chuyển tiếp.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {order.allowedTransitions.map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => transition(s)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  s === 'CANCELLED' ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                → {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="mb-3 font-semibold text-slate-200">Lịch sử thanh toán</h2>
          <table className="block w-full overflow-x-auto text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1 pr-4">Thời gian</th>
                <th className="py-1 pr-4">Phương thức</th>
                <th className="py-1 pr-4">Số tiền</th>
                <th className="py-1 pr-4">Trạng thái</th>
                <th className="py-1 pr-4">Mã GD</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-800 text-slate-300">
                  <td className="py-1 pr-4">{fmtDate(p.createdAt)}</td>
                  <td className="py-1 pr-4">{p.method}</td>
                  <td className="py-1 pr-4">{fmt(p.amount)}</td>
                  <td className="py-1 pr-4">{p.status}</td>
                  <td className="py-1 pr-4 font-mono text-xs">{p.transactionId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {refunds.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="mb-3 font-semibold text-slate-200">Yêu cầu hoàn tiền</h2>
          <div className="space-y-3">
            {refunds.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-800 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-300">
                    Mức hoàn <strong>{fmt(r.amount)}</strong> ({r.ratio}%) — tạo lúc {fmtDate(r.createdAt)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      r.status === 'PROCESSED' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'
                    }`}
                  >
                    {r.status === 'PROCESSED' ? 'Đã xử lý' : 'Đang chờ'}
                  </span>
                </div>

                {r.status === 'PENDING' && (
                  <div className="mt-3">
                    {refRefund?.id === r.id ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                          Số tiền đối soát
                          <input
                            className="w-36 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                            type="number"
                            value={refRefund.amount}
                            onChange={(e) => setRefRefund({ ...refRefund, amount: e.target.value })}
                            placeholder={String(r.amount)}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                          Mã tham chiếu (sandbox/thủ công)
                          <input
                            className="w-48 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                            value={refRefund.referenceCode}
                            onChange={(e) => setRefRefund({ ...refRefund, referenceCode: e.target.value })}
                            placeholder="REF-..."
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={() => confirmProcessRefund(r)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Xác nhận đã hoàn
                        </button>
                        <button onClick={() => setRefRefund(null)} className="text-sm text-slate-400 hover:underline">
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRefRefund({ id: r.id, amount: String(r.amount), referenceCode: '' })}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                      >
                        Xử lý hoàn tiền
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{value}</dd>
    </div>
  )
}

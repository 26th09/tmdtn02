import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api, formatPrice, type OrderDetail } from '../lib/api'
import { ReviewForm } from './ReviewForm'

// Nhãn trạng thái đơn theo đúng vòng đời (chờ cọc → đã cọc → đã xác nhận → hoàn tất → đã hủy).
export const STATUS_LABEL: Record<string, string> = {
  PENDING_DEPOSIT: 'Chờ đặt cọc',
  DEPOSITED: 'Đã đặt cọc',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

export const STATUS_COLOR: Record<string, string> = {
  PENDING_DEPOSIT: 'bg-amber-100 text-amber-700',
  DEPOSITED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-forest-100 text-forest-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

// Các bước vòng đời để vẽ thanh tiến trình (không tính trạng thái đã hủy).
const STATUS_STEPS = ['PENDING_DEPOSIT', 'DEPOSITED', 'CONFIRMED', 'COMPLETED'] as const

const PAYMENT_LABEL: Record<string, string> = {
  VNPAY: 'VNPAY (thẻ/ QR)',
  COD: 'Thanh toán trực tiếp',
  CASH: 'Tiền mặt',
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '-')
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN') : '-')

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

interface Props {
  order: OrderDetail
  // Guest cần mã PIN hoặc email để xác thực khi hủy. Bỏ trống nếu là Customer đã đăng nhập.
  guestAuth?: { pin?: string; email?: string }
  onChanged?: (order: OrderDetail) => void
}

// Chi tiết đơn: sản phẩm, ngày, tiền, trạng thái, chính sách hủy, thao tác khả dụng.
// Hủy đơn: xem trước mức hoàn tiền rồi xác nhận hoặc hủy thao tác.
export function OrderDetailCard({ order, guestAuth, onChanged }: Props) {
  const isTour = order.type === 'TOUR'
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewDone, setReviewDone] = useState<string | null>(null)

  const cancelled = order.status === 'CANCELLED'
  const currentStep = STATUS_STEPS.indexOf(order.status as (typeof STATUS_STEPS)[number])

  async function confirmCancel() {
    setSubmitting(true)
    setError(null)
    try {
      const r = await api.cancelOrder(order.code, guestAuth)
      onChanged?.(r.order)
      setConfirming(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hủy đơn thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitReview(rating: number, comment: string, images: string[]) {
    const r = await api.submitMyReview({ code: order.code, rating, comment: comment || undefined, images })
    setReviewDone(r.message)
    setReviewing(false)
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-sm">
      {/* ── Header với ảnh sản phẩm ── */}
      <div className="relative h-40 overflow-hidden bg-cream-100 sm:h-48">
        {order.thumbnail && <img src={order.thumbnail} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-900/85 via-forest-900/30 to-transparent" />
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <span className="rounded-full bg-cream-50/90 px-3 py-1 text-xs font-medium text-forest-700 backdrop-blur">
            {isTour ? '✈ Tour' : '⌂ Homestay'}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <div className="absolute bottom-0 left-0 p-5">
          <p className="font-mono text-xs text-cream-200">{order.code}</p>
          <Link
            to={`${isTour ? '/tour/' : '/product/'}${order.productSlug}`}
            className="font-display text-2xl font-semibold text-cream-50 hover:underline"
          >
            {order.productName}
          </Link>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* ── Thanh tiến trình trạng thái ── */}
        {cancelled ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>✕</span>
            Đơn đã hủy{order.cancelledAt ? ` lúc ${fmtDateTime(order.cancelledAt)}` : ''}.
          </div>
        ) : (
          <div className="flex items-center">
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep
              return (
                <div key={step} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition ${
                        done ? 'bg-forest-600 text-cream-50' : 'bg-cream-200 text-forest-400'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span className={`mt-1.5 text-center text-[11px] ${done ? 'font-medium text-forest-700' : 'text-forest-400'}`}>
                      {STATUS_LABEL[step]}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`mx-1 mb-5 h-0.5 flex-1 ${i < currentStep ? 'bg-forest-600' : 'bg-cream-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Thông tin đặt chỗ & người đặt ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoBlock title={isTour ? 'Thông tin chuyến đi' : 'Thông tin lưu trú'}>
            {isTour ? (
              <Row label="Ngày khởi hành" value={fmtDate(order.checkIn)} />
            ) : (
              <>
                <Row label="Nhận phòng" value={fmtDate(order.checkIn)} />
                <Row label="Trả phòng" value={fmtDate(order.checkOut)} />
                <Row label="Số đêm" value={`${order.nights ?? '-'} đêm`} />
              </>
            )}
            <Row label="Số khách" value={`${order.guests} người lớn${order.children ? ` · ${order.children} trẻ em` : ''}`} />
            <Row label="Ngày đặt" value={fmtDate(order.createdAt)} />
          </InfoBlock>

          <InfoBlock title="Người đặt">
            <Row label="Họ tên" value={order.guestName} />
            <Row label="Email" value={order.guestEmail} />
            <Row label="Điện thoại" value={order.guestPhone} />
          </InfoBlock>
        </div>

        {/* ── Tóm tắt thanh toán ── */}
        <div className="rounded-2xl border border-cream-200 bg-cream-50 p-5">
          <h3 className="mb-3 font-display text-lg font-semibold text-forest-900">Chi tiết thanh toán</h3>
          <div className="space-y-2 text-sm">
            {!!order.discountAmount && (
              <Row label={`Mã giảm giá (${order.discountCode})`} value={`-${formatPrice(order.discountAmount)}`} accent />
            )}
            <Row label="Tổng tiền" value={formatPrice(order.totalPrice)} />
            {order.paymentMethod && (
              <Row label="Phương thức" value={PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod} />
            )}
            {order.depositPaidAt && <Row label="Đã cọc lúc" value={fmtDateTime(order.depositPaidAt)} />}
            <div className="my-2 border-t border-cream-300" />
            <Row label="Đặt cọc" value={formatPrice(order.depositAmount)} strong />
            <Row label="Còn lại (trả sau)" value={formatPrice(order.remainingAmount)} />
          </div>
        </div>

        {/* ── Hóa đơn điện tử ── */}
        {order.invoice && <InvoiceBlock invoice={order.invoice} />}

        {/* ── Chính sách hủy ── */}
        {order.cancellationPolicy && (
          <div className="rounded-2xl border border-cream-200 p-5">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-forest-900">
              <span className="text-clay-500">🛈</span> Chính sách hủy
            </h3>
            <p className="text-sm leading-relaxed text-forest-500">{order.cancellationPolicy}</p>
          </div>
        )}

        {/* Thao tác khả dụng theo trạng thái: hủy đơn (kèm xem trước hoàn tiền) / đánh giá. */}
        {(order.actions.canCancel || order.actions.canReview) && (
          <div className="border-t border-cream-200 pt-5">
            {error && <p className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <div className="flex flex-wrap gap-3">
              {order.actions.canCancel && !confirming && (
                <button
                  onClick={() => setConfirming(true)}
                  className="rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  Hủy đơn
                </button>
              )}

              {order.actions.canReview && !reviewDone && !guestAuth && !reviewing && (
                <button
                  onClick={() => setReviewing(true)}
                  className="rounded-full bg-gold-400 px-5 py-2 text-sm font-semibold text-forest-900 transition hover:bg-gold-500"
                >
                  ★ Viết đánh giá
                </button>
              )}
            </div>

            {order.actions.canCancel && confirming && (
              <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">Xác nhận hủy đơn?</p>
                <div className="mt-2 text-sm text-amber-900">
                  {order.cancelPreview.amountPaid === 0 ? (
                    <p>Chưa phát sinh khoản thanh toán — hủy sẽ không có hoàn tiền.</p>
                  ) : (
                    <p>
                      Mức hoàn tiền dự kiến: <strong>{formatPrice(order.cancelPreview.refundAmount)}</strong> ({order.cancelPreview.ratio}% khoản đã cọc){' '}
                      theo chính sách hủy hiện hành.
                    </p>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={confirmCancel}
                    disabled={submitting}
                    className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {submitting ? 'Đang hủy...' : 'Xác nhận hủy'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={submitting}
                    className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-white"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}

            {order.actions.canReview && reviewDone && (
              <p className="mt-3 rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-700">{reviewDone}</p>
            )}

            {order.actions.canReview && !reviewDone && guestAuth && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Kiểm tra email <span className="font-medium">{order.guestEmail}</span> để nhận liên kết đánh giá đơn này.
              </p>
            )}

            {order.actions.canReview && !reviewDone && !guestAuth && reviewing && (
              <div className="mt-3 rounded-2xl border border-cream-200 bg-cream-50 p-4">
                <ReviewForm onSubmit={submitReview} />
                <button onClick={() => setReviewing(false)} className="mt-2 text-sm text-forest-400 hover:text-forest-600">
                  Hủy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Khối hóa đơn điện tử: trạng thái + nút "Tải hóa đơn" khi đã phát hành.
function InvoiceBlock({ invoice }: { invoice: NonNullable<OrderDetail['invoice']> }) {
  const label: Record<string, { text: string; cls: string }> = {
    PENDING: { text: 'Chờ phát hành (sau khi thanh toán đủ)', cls: 'bg-amber-100 text-amber-700' },
    PROCESSING: { text: 'Đang phát hành…', cls: 'bg-blue-100 text-blue-700' },
    ISSUED: { text: 'Đã phát hành', cls: 'bg-emerald-100 text-emerald-700' },
    FAILED: { text: 'Phát hành lỗi — hệ thống sẽ thử lại', cls: 'bg-red-100 text-red-700' },
    CANCELED: { text: 'Đã hủy hóa đơn', cls: 'bg-slate-100 text-slate-600' },
  }
  const st = label[invoice.status] ?? { text: invoice.status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <div className="rounded-2xl border border-cream-200 p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-forest-900">
          <span className="text-clay-500">🧾</span> Hóa đơn điện tử
        </h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.text}</span>
      </div>
      <div className="space-y-2 text-sm">
        {invoice.companyName && <Row label="Bên mua" value={invoice.companyName} />}
        {invoice.taxCode && <Row label="Mã số thuế" value={invoice.taxCode} />}
        {invoice.status === 'ISSUED' && invoice.invoiceSerial && (
          <Row label="Ký hiệu / Số" value={`${invoice.invoiceSerial} · ${invoice.invoiceNumber}`} />
        )}
        {invoice.status === 'ISSUED' && invoice.reservationCode && (
          <Row label="Mã tra cứu" value={invoice.reservationCode} />
        )}
      </div>
      {invoice.status === 'ISSUED' && invoice.pdfUrl && (
        <a
          href={invoice.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-forest-700 px-5 py-2 text-sm font-semibold text-cream-50 transition hover:bg-forest-800"
        >
          ⬇ Tải hóa đơn
        </a>
      )}
    </div>
  )
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-cream-200 p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-forest-400">{title}</h3>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  )
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-forest-400">{label}</span>
      <span
        className={`text-right ${
          strong ? 'font-bold text-forest-700' : accent ? 'font-medium text-clay-600' : 'text-forest-800'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

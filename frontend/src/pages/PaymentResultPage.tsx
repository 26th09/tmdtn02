import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loading } from '../components/StateBlocks'
import { STATUS_LABEL } from '../components/OrderDetailCard'
import { api, formatPrice } from '../lib/api'

const PAYMENT_LABEL: Record<string, string> = {
  VNPAY: 'VNPAY',
  STRIPE: 'Thẻ (giữ bảo lãnh)',
  PAY_ON_DEPARTURE: 'Trả sau khi đi/nhận phòng',
  COD: 'Thanh toán khi nhận',
  CASH: 'Tiền mặt',
}

// Nhãn/nội dung màn thành công theo TRẠNG THÁI TIỀN (tách khỏi trạng thái đơn), đúng cho cả 3 luồng.
function successView(info: { paymentStatus: string; depositAmount: number; remainingAmount: number; totalPrice: number; cardAuthAmount: number | null } | null) {
  const ps = info?.paymentStatus
  if (ps === 'PAID') {
    return {
      title: 'Thanh toán thành công',
      desc: 'Đơn của bạn đã được xác nhận và thanh toán đủ. Cảm ơn bạn đã đặt chỗ cùng StayTour!',
      highlightLabel: 'Đã thanh toán',
      highlightValue: info!.totalPrice,
      showRemaining: false,
    }
  }
  if (ps === 'PARTIALLY_PAID') {
    return {
      title: 'Đặt cọc thành công',
      desc: 'Đơn của bạn đã được xác nhận. Cảm ơn bạn đã đặt cọc giữ chỗ!',
      highlightLabel: 'Đã đặt cọc',
      highlightValue: info!.depositAmount,
      showRemaining: true,
    }
  }
  if (ps === 'AUTHORIZED') {
    return {
      title: 'Đặt chỗ thành công',
      desc: 'Đã giữ thẻ bảo lãnh để giữ chỗ — thẻ của bạn CHƯA bị trừ tiền. Bạn thanh toán khi đi/nhận phòng.',
      highlightLabel: 'Đã giữ thẻ bảo lãnh',
      highlightValue: info?.cardAuthAmount ?? 0,
      showRemaining: false,
      payLater: true,
    }
  }
  // UNPAID (trả sau, chưa giữ thẻ) — KHÔNG hiển thị "đã cọc".
  return {
    title: 'Đặt chỗ thành công',
    desc: 'Đơn của bạn đã được xác nhận. Vui lòng thanh toán khi đi/nhận phòng.',
    highlightLabel: 'Thanh toán khi đi/nhận phòng',
    highlightValue: info ? info.totalPrice : 0,
    showRemaining: false,
    payLater: true,
  }
}

// Trang kết quả sau khi VNPAY chuyển hướng về (?code=&status=success|failed|invalid).
export function PaymentResultPage() {
  const [params] = useSearchParams()
  const code = params.get('code') || ''
  const statusParam = params.get('status') || 'failed'
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.getPaymentStatus>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!code) {
      setLoading(false)
      return
    }
    api
      .getPaymentStatus(code)
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoading(false))
  }, [code])

  if (loading) return <Loading label="Đang kiểm tra kết quả thanh toán..." />

  const ok = statusParam === 'success'
  const invalid = statusParam === 'invalid'
  const sv = ok ? successView(info) : null

  const title = ok ? sv!.title : invalid ? 'Chữ ký không hợp lệ' : 'Thanh toán không thành công'
  const desc = ok
    ? sv!.desc
    : invalid
      ? 'Kết quả trả về không xác thực được (nghi ngờ giả mạo). Giao dịch đã bị từ chối.'
      : 'Giao dịch bị hủy hoặc thất bại. Bạn có thể thử lại trong thời hạn giữ chỗ.'

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      {/* Hero trạng thái */}
      <div className="text-center">
        <div
          className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl ${
            ok ? 'bg-forest-100 text-forest-700' : 'bg-red-100 text-red-600'
          }`}
        >
          {ok ? '✓' : '✕'}
        </div>
        <h1 className="mt-5 font-display text-4xl font-semibold text-forest-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-forest-400">{desc}</p>
      </div>

      {/* Thẻ tóm tắt đơn */}
      {info && (
        <div className="mt-8 overflow-hidden rounded-3xl border border-cream-200 bg-white">
          <div className="flex items-center justify-between bg-forest-50 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-forest-400">Mã đơn</p>
              <p className="font-mono text-lg font-bold text-forest-700">{info.code}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                ok ? 'bg-forest-100 text-forest-700' : 'bg-red-100 text-red-600'
              }`}
            >
              {STATUS_LABEL[info.status] ?? info.status}
            </span>
          </div>

          <div className="p-5">
            <p className="font-display text-lg font-semibold text-forest-900">{info.productName}</p>

            <div className="mt-4 space-y-2 border-t border-cream-100 pt-4 text-sm">
              {info.paymentMethod && (
                <Row label="Phương thức" value={PAYMENT_LABEL[info.paymentMethod] ?? info.paymentMethod} />
              )}
              <Row label="Tổng tiền" value={formatPrice(info.totalPrice)} />
              {ok && sv!.showRemaining && <Row label="Còn lại (trả sau)" value={formatPrice(info.remainingAmount)} />}
              {ok && sv!.payLater && <Row label="Phải trả khi đi/nhận phòng" value={formatPrice(info.totalPrice)} />}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-forest-700 px-5 py-4 text-cream-50">
              <span className="text-sm">{ok ? sv!.highlightLabel : 'Số tiền cọc'}</span>
              <span className="font-display text-2xl font-bold">{formatPrice(ok ? sv!.highlightValue : info.depositAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Điều hướng */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {ok ? (
          <>
            <Link to="/orders" className="flex-1 rounded-full bg-forest-700 px-5 py-3 text-center text-sm font-semibold text-cream-50 hover:bg-forest-800">
              Xem đơn của tôi
            </Link>
            <Link to="/" className="flex-1 rounded-full border border-forest-300 px-5 py-3 text-center text-sm font-semibold text-forest-700 hover:bg-forest-50">
              Về trang chủ
            </Link>
          </>
        ) : (
          <>
            {code && (
              <Link to={`/orders/${code}`} className="flex-1 rounded-full bg-forest-700 px-5 py-3 text-center text-sm font-semibold text-cream-50 hover:bg-forest-800">
                Thử đặt cọc lại
              </Link>
            )}
            <Link to="/" className="flex-1 rounded-full border border-forest-300 px-5 py-3 text-center text-sm font-semibold text-forest-700 hover:bg-forest-50">
              Về trang chủ
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-forest-400">{label}</span>
      <span className="font-medium text-forest-800">{value}</span>
    </div>
  )
}

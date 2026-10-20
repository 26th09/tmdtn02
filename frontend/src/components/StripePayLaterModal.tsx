import { useEffect, useMemo, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { ApiError, api, formatPrice } from '../lib/api'

// Luồng 1 — "Trả sau 0đ": liên kết thẻ qua Stripe và GIỮ (pre-authorize) một khoản bảo lãnh,
// KHÔNG trừ tiền. Khi thẻ được giữ thành công -> xác nhận đơn (trạng thái AUTHORIZED).

// Form nhập thẻ (bên trong <Elements>). clientSecret của PaymentIntent manual-capture.
function CardForm({ code, amount, onSuccess, onCancel }: { code: string; amount: number; onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    try {
      // Với PaymentIntent capture_method='manual', xác nhận thành công -> status 'requires_capture'
      // (đã giữ tiền). redirect:'if_required' để không rời trang khi thẻ không cần 3DS.
      const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })
      if (stripeErr) {
        setError(stripeErr.message || 'Không liên kết được thẻ. Vui lòng kiểm tra lại.')
        return
      }
      if (paymentIntent && (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded')) {
        await api.confirmStripePreAuth(code, paymentIntent.id)
        onSuccess()
        return
      }
      setError('Chưa giữ được thẻ. Vui lòng thử lại.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xác nhận thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 text-sm text-forest-600">
        Hệ thống sẽ <strong>tạm giữ {formatPrice(amount)}</strong> trên thẻ để bảo lãnh giữ chỗ —
        <strong> không trừ tiền</strong>. Khoản này tự nhả sau chuyến đi; chỉ bị trừ nếu bạn hủy không báo trước (phí no-show).
      </div>
      <PaymentElement />
      {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-full border border-cream-300 px-5 py-3 text-sm font-semibold text-forest-700 hover:bg-cream-50 disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 rounded-full bg-forest-700 px-5 py-3 text-sm font-semibold text-cream-50 hover:bg-forest-800 disabled:opacity-50"
        >
          {submitting ? 'Đang giữ thẻ...' : 'Liên kết & giữ thẻ'}
        </button>
      </div>
      <p className="text-center text-xs text-forest-400">🔒 Stripe test mode — dùng thẻ 4242 4242 4242 4242, ngày hết hạn tương lai, CVC bất kỳ.</p>
    </form>
  )
}

export function StripePayLaterModal({ code, onSuccess, onClose }: { code: string; onSuccess: () => void; onClose: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [pubKey, setPubKey] = useState<string | null>(null)
  const [amount, setAmount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .createStripePreAuth(code)
      .then((r) => {
        if (!active) return
        setClientSecret(r.clientSecret)
        setPubKey(r.publishableKey)
        setAmount(r.amount)
      })
      .catch((err) => active && setError(err instanceof ApiError ? err.message : 'Không khởi tạo được thanh toán thẻ.'))
    return () => {
      active = false
    }
  }, [code])

  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => (pubKey ? loadStripe(pubKey) : null), [pubKey])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest-900/50 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 font-display text-xl font-semibold text-forest-900">Trả sau — giữ thẻ bảo lãnh</h3>
        <p className="mb-4 text-sm text-forest-400">Liên kết thẻ để giữ chỗ. Thẻ của bạn sẽ không bị trừ tiền.</p>
        {error ? (
          <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : !clientSecret || !stripePromise ? (
          <p className="py-8 text-center text-forest-400">Đang tải cổng thanh toán...</p>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <CardForm code={code} amount={amount} onSuccess={onSuccess} onCancel={onClose} />
          </Elements>
        )}
      </div>
    </div>
  )
}

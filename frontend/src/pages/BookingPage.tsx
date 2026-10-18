import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ErrorState, Loading } from '../components/StateBlocks'
import { ApiError, api, formatPrice, splitVat, type BookingResult, type DetailResponse } from '../lib/api'
import { useAuth } from '../lib/auth'

function nightsCount(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86400000))
}

// UC-09/UC-10 – Đặt homestay/tour (hỗ trợ guest checkout). Đến từ nút "Đặt ngay" ở UC-03.
export function BookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  // Homestay: from/to; Tour: date (ngày khởi hành) + children.
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const date = params.get('date') || ''
  const guests = Number(params.get('guests')) || 2
  const children = Number(params.get('children')) || 0
  const roomTypeId = Number(params.get('roomTypeId')) || 0
  const { user } = useAuth()

  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [depositRate, setDepositRate] = useState(0.3)
  const [vatPercent, setVatPercent] = useState(8)
  const [vnpayEnabled, setVnpayEnabled] = useState(false)
  const [payOnDepMinHours, setPayOnDepMinHours] = useState(48)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  // Bước thanh toán cọc (UC-11)
  const [paying, setPaying] = useState<'VNPAY' | 'PAY_ON_DEPARTURE' | null>(null)
  const [paid, setPaid] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [requests, setRequests] = useState<string[]>([]) // yêu cầu đặc biệt chọn nhanh
  const [arrivalTime, setArrivalTime] = useState('') // giờ nhận phòng dự kiến (homestay)
  const [pickup, setPickup] = useState('') // điểm đón (tour) — bắt buộc khi chọn "Trả sau khi đi tour"
  const [bookingFor, setBookingFor] = useState<'self' | 'other'>('self') // đặt cho ai
  const [terms, setTerms] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BookingResult | null>(null)

  // UC-12 (extend UC-09/10) – Mã giảm giá.
  const [discountInput, setDiscountInput] = useState('')
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null)
  const [discountMsg, setDiscountMsg] = useState<string | null>(null)
  const [applyingDiscount, setApplyingDiscount] = useState(false)

  useEffect(() => {
    if (!slug) return
    Promise.all([api.getBookingConfig(), api.getPaymentConfig()])
      .then(async ([cfg, pay]) => {
        setDepositRate(cfg.depositRate)
        setVatPercent(cfg.vatPercent ?? 8)
        setVnpayEnabled(pay.vnpayEnabled)
        setPayOnDepMinHours(pay.payOnDepartureMinHours ?? 48)
        // Homestay (Property) hay Tour (bảng riêng)? Thử homestay trước, 404 -> tour.
        try {
          const pd = await api.getPropertyDetail(slug)
          const rt = roomTypeId ? pd.property.roomTypes.find((r) => r.id === roomTypeId) : pd.property.roomTypes[0]
          const policyText = pd.property.cancellationPolicy
            ? [
                pd.property.cancellationPolicy.freeHours > 0 ? `Miễn phí hủy trong ${pd.property.cancellationPolicy.freeHours} giờ đầu.` : '',
                ...pd.property.cancellationPolicy.milestones.map((m) => `Hủy trước ≥ ${m.daysBefore} ngày: hoàn ${m.refundRate}%.`),
                'Hủy sát ngày hơn: không hoàn tiền.',
              ].filter(Boolean).join(' ')
            : ''
          if (pd.property.depositRate != null) setDepositRate(pd.property.depositRate / 100)
          setDetail({
            product: {
              id: pd.property.id,
              name: pd.property.name,
              slug: pd.property.slug,
              type: 'HOMESTAY',
              location: pd.property.address,
              price: rt?.basePricePerNight ?? pd.property.basePrice,
              priceChild: null,
              rating: pd.property.avgRating,
              thumbnail: pd.property.thumbnail,
              isFeatured: false,
              categoryId: null,
              description: pd.property.description,
              cancellationPolicy: policyText,
              itinerary: null,
              images: [],
              category: null,
              departures: [],
            } as unknown as DetailResponse['product'],
            reviews: [],
            similar: [],
          })
        } catch {
          // Tour: dựng product-shape tương thích từ chuyến khớp `date` + giá theo loại khách.
          const td = await api.getTourDetail(slug)
          const dep = td.tour.departures.find((x) => x.departureDate.slice(0, 10) === date) ?? td.tour.departures[0]
          const priceOf = (t: 'ADULT' | 'CHILD') => dep?.prices.find((p) => p.paxType === t)?.price ?? td.tour.basePrice
          const policyText = td.tour.cancellationPolicy
            ? [
                td.tour.cancellationPolicy.freeHours > 0 ? `Miễn phí hủy trong ${td.tour.cancellationPolicy.freeHours} giờ đầu.` : '',
                ...td.tour.cancellationPolicy.milestones.map((m) => `Hủy trước ≥ ${m.daysBefore} ngày: hoàn ${m.refundRate}%.`),
                'Hủy sát ngày hơn: không hoàn tiền.',
              ]
                .filter(Boolean)
                .join(' ')
            : ''
          if (td.tour.depositRate != null) setDepositRate(td.tour.depositRate / 100)
          setDetail({
            product: {
              id: td.tour.id,
              name: td.tour.title,
              slug: td.tour.slug,
              type: 'TOUR',
              location: td.tour.destination,
              price: priceOf('ADULT'),
              priceChild: priceOf('CHILD'),
              rating: td.tour.avgRating,
              thumbnail: td.tour.thumbnail,
              isFeatured: false,
              categoryId: null,
              description: td.tour.description,
              cancellationPolicy: policyText,
              itinerary: null,
              images: [],
              category: null,
              departures: [],
            } as unknown as DetailResponse['product'],
            reviews: [],
            similar: [],
          })
        }
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [slug, date, roomTypeId])

  useEffect(() => {
    if (user) {
      setName(user.name ?? '')
      setEmail(user.email ?? '')
      setPhone(user.phone ?? '')
    }
  }, [user])

  const product = detail?.product
  const isTour = product?.type === 'TOUR'
  const nights = useMemo(() => nightsCount(from, to), [from, to])

  const priceChild = product?.priceChild ?? product?.price ?? 0
  const total = product
    ? isTour
      ? product.price * guests + priceChild * children
      : product.price * nights
    : 0
  // BR-46: cọc tính trên tổng SAU khi trừ mã giảm giá (nếu có).
  const payableTotal = applied ? Math.max(0, total - applied.discount) : total
  const deposit = Math.round(payableTotal * depositRate)
  const remaining = payableTotal - deposit

  // 1a: gỡ mã đã áp dụng -> khôi phục tổng tiền/cọc ban đầu.
  function removeDiscount() {
    setApplied(null)
    setDiscountMsg(null)
    setDiscountInput('')
  }

  // Nhập mã & bấm "Áp dụng" (1b: nhập mã khác sẽ tự thay thế mã cũ — BR-44 chỉ 1 mã/đơn).
  async function applyDiscountCode() {
    if (!discountInput.trim() || !product || !slug) return
    setApplyingDiscount(true)
    setDiscountMsg(null)
    try {
      const r = await api.applyDiscount({ code: discountInput.trim(), type: product.type, subtotal: total, slug })
      if (r.applied && r.code && r.discount != null) {
        setApplied({ code: r.code, discount: r.discount })
        setDiscountMsg(null)
      } else {
        setApplied(null)
        setDiscountMsg(r.message || 'Mã không hợp lệ hoặc đã hết hạn') // 2a/2b/3a
      }
    } catch (err) {
      setApplied(null)
      setDiscountMsg(err instanceof ApiError ? err.message : 'Không áp dụng được mã. Vui lòng thử lại.')
    } finally {
      setApplyingDiscount(false)
    }
  }

  // Gộp yêu cầu chọn nhanh + giờ đến + ghi chú tự do + "đặt cho người khác" thành một chuỗi note.
  function composedNote() {
    const parts: string[] = []
    if (bookingFor === 'other') parts.push('Đặt cho người khác')
    if (requests.length) parts.push(`Yêu cầu: ${requests.join(', ')}`)
    if (isTour && pickup.trim()) parts.push(`Điểm đón: ${pickup.trim()}`)
    if (arrivalTime) parts.push(`Giờ nhận phòng dự kiến: ${arrivalTime}`)
    if (note.trim()) parts.push(note.trim())
    return parts.join(' | ')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!terms) {
      setError('Vui lòng đồng ý điều khoản và chính sách trước khi đặt') // 5a
      return
    }
    if (!name || !email || !phone) {
      setError('Vui lòng nhập đầy đủ họ tên, email và số điện thoại')
      return
    }
    setSubmitting(true)
    try {
      const contact = {
        guestName: name,
        guestEmail: email,
        guestPhone: phone,
        acceptedTerms: terms,
        discountCode: applied?.code,
        note: composedNote() || undefined,
      }
      const r = isTour
        ? await api.createTourBooking({ slug: slug!, date, guests, children, ...contact })
        : await api.createHomestayBooking({ slug: slug!, checkIn: from, checkOut: to, guests, roomTypeId: roomTypeId || undefined, ...contact })
      setResult(r)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đặt chỗ thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  async function pay(method: 'VNPAY' | 'PAY_ON_DEPARTURE') {
    if (!result) return
    setPayError(null)
    setPaying(method)
    try {
      const r = await api.createPayment(result.booking.code, method)
      if (r.status === 'redirect' && r.redirectUrl) {
        window.location.href = r.redirectUrl // sang trang cổng VNPAY (BR-38)
        return
      }
      if (r.status === 'success' || r.status === 'already_paid') {
        setPaid(true)
      } else {
        setPayError('Không thể tạo thanh toán. Vui lòng thử lại.')
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Thanh toán thất bại. Vui lòng thử lại.')
    } finally {
      setPaying(null)
    }
  }

  if (status === 'loading') return <Loading />
  if (status === 'error' || !product) return <ErrorState onRetry={() => location.reload()} />

  // Sau khi tạo đơn: bước thanh toán đặt cọc (UC-11), rồi màn hình hoàn tất.
  if (result) {
    const b = result.booking
    const steps = ['Chọn dịch vụ', 'Thông tin', 'Đặt cọc', 'Hoàn tất']
    const currentStep = paid ? 3 : 2
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        {/* Thanh tiến trình */}
        <div className="mb-8 flex items-center">
          {steps.map((s, i) => {
            const done = i <= currentStep
            return (
              <div key={s} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition ${
                      done ? 'bg-forest-600 text-cream-50' : 'bg-cream-200 text-forest-400'
                    }`}
                  >
                    {i < currentStep || paid ? '✓' : i + 1}
                  </span>
                  <span className={`mt-1.5 text-center text-[11px] ${done ? 'font-medium text-forest-700' : 'text-forest-400'}`}>{s}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`mx-1 mb-5 h-0.5 flex-1 ${i < currentStep ? 'bg-forest-600' : 'bg-cream-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="text-center">
          <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl ${paid ? 'bg-forest-100' : 'bg-clay-400/15'}`}>
            {paid ? '✅' : '🧾'}
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold text-forest-900">
            {paid ? 'Đặt cọc thành công' : 'Xác nhận & đặt cọc'}
          </h1>
          <p className="mt-1 text-forest-400">
            {paid ? 'Đơn của bạn đã được xác nhận. Cảm ơn bạn đã đặt chỗ!' : 'Đơn đang chờ đặt cọc để hoàn tất.'}
          </p>
        </div>

        {/* Thẻ tóm tắt đơn */}
        <div className="mt-7 overflow-hidden rounded-3xl border border-cream-200 bg-white">
          <div className="flex items-center justify-between bg-forest-50 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-forest-400">Mã đơn</p>
              <p className="font-mono text-lg font-bold text-forest-700">{b.code}</p>
            </div>
            <span className="rounded-full bg-clay-500/15 px-3 py-1 text-xs font-medium text-clay-600">
              {paid ? 'Đã đặt cọc' : 'Chờ đặt cọc'}
            </span>
          </div>

          <div className="p-5">
            {result.pin && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-800">Mã PIN tra cứu</span>
                  <span className="font-mono text-lg font-bold text-amber-900">{result.pin}</span>
                </div>
                <p className="mt-1 text-xs text-amber-600">
                  Lưu lại mã đơn &amp; PIN để tra cứu/hủy đơn sau này (chỉ hiển thị một lần).
                </p>
              </div>
            )}

            <p className="font-display text-lg font-semibold text-forest-900">{b.productName}</p>
            {detail?.product.location && (
              <p className="mt-0.5 text-sm text-forest-400">📍 {detail.product.location}</p>
            )}

            {/* Thông tin lưu trú/chuyến đi & người đặt */}
            <div className="mt-4 grid gap-4 border-t border-cream-100 pt-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-forest-400">
                  {isTour ? 'Chuyến đi' : 'Lưu trú'}
                </p>
                <div className="space-y-1.5 text-sm">
                  {isTour ? (
                    <Row label="Ngày khởi hành" value={fmtDate(b.checkIn)} />
                  ) : (
                    <>
                      <Row label="Nhận phòng" value={fmtDate(b.checkIn)} />
                      <Row label="Trả phòng" value={fmtDate(b.checkOut)} />
                      <Row label="Số đêm" value={`${b.nights ?? '-'} đêm`} />
                    </>
                  )}
                  <Row label="Số khách" value={`${b.guests} người lớn${b.children ? ` · ${b.children} trẻ em` : ''}`} />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-forest-400">Người đặt</p>
                <div className="space-y-1.5 text-sm">
                  <Row label="Họ tên" value={b.guestName} />
                  <Row label="Email" value={b.guestEmail} />
                  <Row label="Điện thoại" value={b.guestPhone} />
                </div>
              </div>
            </div>

            {/* Chi tiết thanh toán */}
            <div className="mt-4 space-y-2 border-t border-cream-100 pt-4 text-sm">
              {!!b.discountAmount && (
                <Row label={`Mã giảm giá (${b.discountCode})`} value={`-${formatPrice(b.discountAmount)}`} />
              )}
              <Row label="Tổng tiền" value={formatPrice(b.totalPrice)} />
              <Row label={`Tỷ lệ đặt cọc (${Math.round(depositRate * 100)}%)`} value={formatPrice(b.depositAmount)} />
              <Row label="Còn lại (trả sau)" value={formatPrice(b.remainingAmount)} />
            </div>

            {/* Số tiền cọc nổi bật */}
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-forest-700 px-5 py-4 text-cream-50">
              <span className="text-sm">{paid ? 'Đã đặt cọc' : 'Số tiền cần đặt cọc'}</span>
              <span className="font-display text-2xl font-bold">{formatPrice(b.depositAmount)}</span>
            </div>

            {/* Thời hạn giữ chỗ */}
            {!paid && b.heldUntil && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                ⏳ Vui lòng đặt cọc trước <span className="font-semibold">{fmtDateTime(b.heldUntil)}</span> để giữ chỗ.
              </div>
            )}

            {/* Chính sách hủy */}
            {detail?.product.cancellationPolicy && (
              <details className="mt-3 rounded-xl border border-cream-200 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-forest-700">🛈 Chính sách hủy &amp; hoàn tiền</summary>
                <p className="mt-2 leading-relaxed text-forest-400">{detail.product.cancellationPolicy}</p>
              </details>
            )}
          </div>
        </div>

        {!paid ? (
          <div className="mt-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-forest-900">Chọn phương thức thanh toán</h2>
            {payError && <div className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{payError}</div>}
            <div className="space-y-3">
              {vnpayEnabled && (
                <button
                  onClick={() => pay('VNPAY')}
                  disabled={paying !== null}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-forest-600 bg-forest-700 px-5 py-4 text-left text-cream-50 transition hover:bg-forest-800 disabled:opacity-50"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-50 text-lg font-bold text-forest-700">₫</span>
                  <span className="flex-1">
                    <span className="block font-semibold">
                      {paying === 'VNPAY' ? 'Đang chuyển tới VNPAY...' : 'Thanh toán qua VNPAY'}
                    </span>
                    <span className="block text-xs text-cream-200">Thẻ ATM / QR / thẻ quốc tế — xác nhận tức thì</span>
                  </span>
                  <span className="font-semibold">{formatPrice(b.depositAmount)}</span>
                </button>
              )}
              {(() => {
                const startStr = isTour ? date : from
                const hoursLeft = startStr ? (new Date(startStr).getTime() - Date.now()) / 3600000 : Infinity
                const allowed = hoursLeft >= payOnDepMinHours
                if (!allowed) {
                  return (
                    <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-5 py-3 text-xs text-forest-400">
                      ⏳ "Trả sau khi đi tour" chỉ áp dụng khi còn ít nhất {payOnDepMinHours} giờ tới ngày đi/nhận phòng. Hiện quá sát ngày — vui lòng thanh toán qua VNPAY.
                    </div>
                  )
                }
                return (
                  <>
                    <button
                      onClick={() => pay('PAY_ON_DEPARTURE')}
                      disabled={paying !== null}
                      className="flex w-full items-center gap-4 rounded-2xl border-2 border-cream-300 bg-white px-5 py-4 text-left transition hover:border-forest-300 disabled:opacity-50"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-forest-100 text-lg">🧳</span>
                      <span className="flex-1">
                        <span className="block font-semibold text-forest-900">
                          {paying === 'PAY_ON_DEPARTURE' ? 'Đang giữ chỗ...' : isTour ? 'Trả sau khi đi tour' : 'Trả khi nhận phòng'}
                        </span>
                        <span className="block text-xs text-forest-400">
                          Không cần trả tiền ngay — thanh toán trực tiếp cho hướng dẫn viên/chủ nhà vào ngày đi. Điều hành sẽ gọi xác nhận.
                        </span>
                      </span>
                      <span className="font-semibold text-forest-700">0₫ ngay</span>
                    </button>
                    <p className="rounded-xl bg-clay-50 px-3 py-2 text-xs text-clay-600">
                      ⚠ Lưu ý: Hủy không báo trước 24h có thể khiến số điện thoại của bạn bị hạn chế đặt chỗ trên hệ thống. Vui lòng giữ liên lạc để điều hành xác nhận.
                    </p>
                  </>
                )
              })()}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-forest-400">
              🔒 Cổng VNPAY chạy ở môi trường sandbox — không dùng thẻ thật.
              {!vnpayEnabled && ' Hiện chỉ bật "Trả sau" (chưa cấu hình VNPAY).'}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/orders" className="flex-1 rounded-full bg-forest-700 px-5 py-3 text-center text-sm font-semibold text-cream-50 hover:bg-forest-800">
              Xem đơn của tôi
            </Link>
            <Link to="/" className="flex-1 rounded-full border border-forest-300 px-5 py-3 text-center text-sm font-semibold text-forest-700 hover:bg-forest-50">
              Về trang chủ
            </Link>
          </div>
        )}
      </div>
    )
  }

  // Thiếu thông tin ngày (không đến từ luồng UC-03).
  const missingInfo = isTour ? !date : nights <= 0
  if (missingInfo) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-forest-900">Thiếu thông tin đặt chỗ</h1>
        <p className="mt-2 text-forest-400">
          Vui lòng chọn {isTour ? 'ngày khởi hành' : 'khoảng ngày'} ở trang chi tiết trước khi đặt.
        </p>
        <Link to={isTour ? `/tour/${slug}` : `/product/${slug}`} className="mt-6 inline-block rounded-full bg-forest-700 px-5 py-2 text-sm font-medium text-cream-50 hover:bg-forest-800">
          ← Về trang {isTour ? 'tour' : 'sản phẩm'}
        </Link>
      </div>
    )
  }

  const field =
    'w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2.5 text-sm text-forest-900 placeholder:text-forest-300 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100'
  const lbl = 'mb-1.5 block text-sm font-medium text-forest-700'
  const quickRequests = isTour
    ? ['Suất ăn chay', 'Đón/tiễn sân bay', 'Ghép nhóm', 'Hỗ trợ người cao tuổi']
    : ['Phòng không hút thuốc', 'Nhận phòng sớm', 'Trả phòng muộn', 'Thêm giường phụ', 'Phòng yên tĩnh / tầng cao', 'Trang trí dịp đặc biệt']

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-3 text-sm text-forest-400">
        <Link to={isTour ? `/tour/${slug}` : `/product/${slug}`} className="hover:text-forest-700">
          {product.name}
        </Link>{' '}
        / <span className="text-forest-700">Đặt chỗ</span>
      </nav>
      <h1 className="mb-6 font-display text-4xl font-semibold text-forest-900">Xác nhận đặt {isTour ? 'tour' : 'homestay'}</h1>

      <div className="gap-8 lg:flex lg:items-start">
        <form onSubmit={submit} className="flex-1 space-y-5">
          {!user && (
            <div className="rounded-2xl border border-cream-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-100 text-lg">👤</span>
                <div className="text-sm">
                  <p className="font-display text-base font-semibold text-forest-900">Đặt chỗ với tư cách khách</p>
                  <p className="mt-0.5 text-forest-500">
                    Bạn không cần tài khoản. Sau khi đặt, chúng tôi sẽ cấp <span className="font-medium text-forest-700">mã đơn &amp; mã PIN</span> để tra cứu hoặc hủy đơn.
                  </p>
                  <p className="mt-2 text-forest-400">
                    Đã có tài khoản?{' '}
                    <Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} className="font-medium text-clay-600 hover:underline">
                      Đăng nhập
                    </Link>{' '}
                    để lưu đơn &amp; tự điền thông tin.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-cream-200 bg-white p-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-forest-900">Thông tin người đặt</h2>
            <div className="space-y-4">
              <div>
                <label className={lbl}>Họ và tên <span className="text-clay-500">*</span></label>
                <input className={field} placeholder="Nguyễn Văn A" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={lbl}>Email <span className="text-clay-500">*</span></label>
                  <input className={field} type="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Số điện thoại <span className="text-clay-500">*</span></label>
                  <input className={field} placeholder="0901234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <span className={lbl}>Bạn đặt {isTour ? 'chỗ' : 'phòng'} cho ai?</span>
                <div className="flex flex-wrap gap-2">
                  {([['self', 'Tôi là khách chính'], ['other', 'Đặt cho người khác']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBookingFor(v)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        bookingFor === v ? 'bg-forest-700 text-cream-50' : 'bg-cream-100 text-forest-600 hover:bg-cream-200'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Yêu cầu đặc biệt (tham khảo Booking/Traveloka) */}
          <div className="rounded-3xl border border-cream-200 bg-white p-6">
            <h2 className="font-display text-lg font-semibold text-forest-900">Yêu cầu đặc biệt</h2>
            <p className="mt-1 text-sm text-forest-400">
              Chúng tôi sẽ cố gắng đáp ứng — tuỳ tình trạng thực tế, không đảm bảo 100%.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {quickRequests.map((r) => {
                const on = requests.includes(r)
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                      on ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-cream-300 text-forest-600 hover:border-forest-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-forest-700"
                      checked={on}
                      onChange={() => setRequests((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))}
                    />
                    {r}
                  </label>
                )
              })}
            </div>

            {isTour && (
              <div className="mt-4">
                <label className={lbl}>Điểm đón <span className="font-normal text-forest-300">(cần thiết nếu chọn "Trả sau khi đi tour")</span></label>
                <input className={field} placeholder="VD: 123 Nguyễn Huệ, Q1 / sảnh khách sạn ABC" value={pickup} onChange={(e) => setPickup(e.target.value)} />
              </div>
            )}

            {!isTour && (
              <div className="mt-4">
                <label className={lbl}>Giờ nhận phòng dự kiến <span className="font-normal text-forest-300">(không bắt buộc)</span></label>
                <select className={field} value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)}>
                  <option value="">Chưa xác định</option>
                  <option>Trước 12:00</option>
                  <option>12:00 – 14:00</option>
                  <option>14:00 – 16:00</option>
                  <option>16:00 – 18:00</option>
                  <option>Sau 18:00</option>
                </select>
              </div>
            )}

            <div className="mt-4">
              <label className={lbl}>Ghi chú thêm <span className="font-normal text-forest-300">(không bắt buộc)</span></label>
              <textarea
                className={`${field} min-h-24`}
                placeholder="VD: thêm giường phụ, đón sân bay, dị ứng thực phẩm..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-cream-200 bg-white p-6 text-sm text-forest-500">
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-forest-900">
              <span className="text-clay-500">🛈</span> Chính sách hủy
            </h2>
            <p className="leading-relaxed">{product.cancellationPolicy}</p>
          </div>

          {/* Áp dụng mã giảm giá */}
          <div className="rounded-3xl border border-cream-200 bg-white p-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-forest-900">Mã giảm giá</h2>
            {applied ? (
              <div className="flex items-center justify-between rounded-xl bg-forest-50 px-4 py-3 text-sm">
                <span className="font-medium text-forest-700">
                  ✓ Đã áp dụng <span className="font-mono">{applied.code}</span> · giảm {formatPrice(applied.discount)}
                </span>
                <button type="button" onClick={removeDiscount} className="text-clay-600 underline hover:text-clay-700">
                  Gỡ mã
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className={`${field} flex-1 uppercase`}
                  placeholder="NHẬP MÃ GIẢM GIÁ"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  onClick={applyDiscountCode}
                  disabled={applyingDiscount || !discountInput.trim()}
                  className="shrink-0 rounded-xl border border-forest-300 px-5 py-2 text-sm font-medium text-forest-700 hover:bg-forest-50 disabled:opacity-50"
                >
                  {applyingDiscount ? 'Đang kiểm tra...' : 'Áp dụng'}
                </button>
              </div>
            )}
            {discountMsg && <p className="mt-2 text-sm text-red-600">{discountMsg}</p>}
          </div>

          <label className="flex items-start gap-2.5 text-sm text-forest-600">
            <input type="checkbox" className="mt-1 accent-forest-700" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              Tôi đã đọc và đồng ý với{' '}
              <Link to="/info/dieu-kien-giao-dich" target="_blank" className="font-medium text-clay-600 hover:underline">Điều khoản</Link> và{' '}
              <Link to="/info/bao-mat-du-lieu" target="_blank" className="font-medium text-clay-600 hover:underline">Chính sách bảo vệ dữ liệu cá nhân</Link>.
            </span>
          </label>

          {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-forest-700 px-6 py-3.5 font-semibold text-cream-50 shadow-lg transition hover:bg-forest-800 disabled:opacity-50"
          >
            {submitting ? 'Đang xử lý...' : `Xác nhận & đặt cọc ${formatPrice(deposit)}`}
          </button>
        </form>

        {/* Tóm tắt đơn (dính khi cuộn) */}
        <aside className="mt-6 w-full lg:sticky lg:top-24 lg:mt-0 lg:w-96 lg:shrink-0">
          <div className="overflow-hidden rounded-3xl border border-cream-200 bg-white">
            {product.thumbnail && (
              <img src={product.thumbnail} alt={product.name} className="h-40 w-full object-cover" />
            )}
            <div className="p-6">
              <h2 className="font-display text-lg font-semibold text-forest-900">{product.name}</h2>
              {product.location && <p className="mt-0.5 text-sm text-forest-400">📍 {product.location}</p>}

              <div className="mt-4 space-y-1.5 border-t border-cream-100 pt-4 text-sm">
                {isTour ? (
                  <>
                    <Row label="Ngày khởi hành" value={new Date(date).toLocaleDateString('vi-VN')} />
                    <Row label="Người lớn" value={`${guests}`} />
                    {children > 0 && <Row label="Trẻ em" value={`${children}`} />}
                  </>
                ) : (
                  <>
                    <Row label="Nhận phòng" value={new Date(from).toLocaleDateString('vi-VN')} />
                    <Row label="Trả phòng" value={new Date(to).toLocaleDateString('vi-VN')} />
                    <Row label="Số đêm" value={`${nights} đêm`} />
                    <Row label="Số khách" value={`${guests} khách`} />
                  </>
                )}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-cream-100 pt-4 text-sm">
                {isTour ? (
                  <>
                    <Row label={`Người lớn ${formatPrice(product.price)} × ${guests}`} value={formatPrice(product.price * guests)} />
                    {children > 0 && (
                      <Row label={`Trẻ em ${formatPrice(priceChild)} × ${children}`} value={formatPrice(priceChild * children)} />
                    )}
                  </>
                ) : (
                  <Row label={`Giá ${formatPrice(product.price)} × ${nights} đêm`} value={formatPrice(total)} />
                )}
                {applied && (
                  <>
                    <Row label={`Mã giảm giá (${applied.code})`} value={`-${formatPrice(applied.discount)}`} />
                    <Row label="Tổng sau giảm" value={formatPrice(payableTotal)} />
                  </>
                )}
                <Row label="Còn lại (trả sau)" value={formatPrice(remaining)} />
              </div>

              {/* Giá đã GỒM VAT — tách hiển thị phần chưa VAT + VAT */}
              <div className="mt-3 space-y-1 border-t border-cream-100 pt-3 text-xs text-forest-400">
                <Row label="Giá chưa VAT" value={formatPrice(splitVat(payableTotal, vatPercent).net)} />
                <Row label={`Thuế VAT (${vatPercent}%)`} value={formatPrice(splitVat(payableTotal, vatPercent).tax)} />
                <div className="flex items-center justify-between font-medium text-forest-700">
                  <span>Giá đã gồm VAT</span>
                  <span>{formatPrice(payableTotal)}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-forest-700 px-5 py-4 text-cream-50">
                <span className="text-sm">Đặt cọc ({Math.round(depositRate * 100)}%)</span>
                <span className="font-display text-2xl font-bold">{formatPrice(deposit)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '-')
const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '-')

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-forest-400">{label}</span>
      <span className={strong ? 'font-bold text-forest-700' : 'text-forest-800'}>{value}</span>
    </div>
  )
}

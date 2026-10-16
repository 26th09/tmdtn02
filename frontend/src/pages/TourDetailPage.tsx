import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Loading } from '../components/StateBlocks'
import { ProductCard } from '../components/ProductCard'
import { api, formatPrice, type TourDetailResponse } from '../lib/api'

const NOTE_LABEL: Record<string, string> = { TERM: 'Cần biết trước khi đặt', FAQ: 'Câu hỏi thường gặp', REDEMPTION: 'Hướng dẫn sử dụng' }

// UC-03 – Chi tiết tour (bảng riêng): thư viện ảnh, lịch trình, bao gồm/không bao gồm, chuyến khởi hành + giá, đánh giá.
export function TourDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<TourDetailResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [depId, setDepId] = useState<number | null>(null)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)

  useEffect(() => {
    if (!slug) return
    setStatus('loading')
    api
      .getTourDetail(slug)
      .then((d) => {
        setData(d)
        setDepId(d.tour.departures[0]?.id ?? null)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [slug])

  const tour = data?.tour
  const selected = useMemo(() => tour?.departures.find((d) => d.id === depId) ?? null, [tour, depId])
  const priceOf = (t: 'ADULT' | 'CHILD') => selected?.prices.find((p) => p.paxType === t)?.price ?? tour?.basePrice ?? 0
  const tentative = selected ? priceOf('ADULT') * adults + priceOf('CHILD') * children : 0
  const totalPax = adults + children

  function book() {
    if (!selected || !slug) return
    const date = selected.departureDate.slice(0, 10)
    navigate(`/booking/${slug}?date=${date}&guests=${adults}&children=${children}`)
  }

  if (status === 'loading') return <Loading />
  if (status === 'error' || !tour) return <ErrorState onRetry={() => location.reload()} />

  const cover = tour.images.find((i) => i.isCover)?.url || tour.images[0]?.url || tour.thumbnail
  const gallery = tour.images.slice(0, 5)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="mb-3 text-sm text-slate-500">
        <Link to="/" className="hover:text-emerald-700">Trang chủ</Link> / <Link to="/search?type=TOUR" className="hover:text-emerald-700">Tour</Link> / {tour.title}
      </nav>

      {/* Gallery */}
      <div className="grid grid-cols-4 gap-2 overflow-hidden rounded-2xl">
        <div className="col-span-4 aspect-[16/7] bg-slate-100 sm:col-span-2 sm:row-span-2 sm:aspect-auto">
          {cover && <img src={cover} alt={tour.title} className="h-full w-full object-cover" />}
        </div>
        {gallery.slice(1, 5).map((img) => (
          <div key={img.id} className="hidden aspect-[4/3] bg-slate-100 sm:block">
            <img src={img.url} alt={img.caption || ''} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>

      <div className="mt-6 gap-8 lg:flex">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {tour.region && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{tour.region.name}</span>}
            {tour.theme && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{tour.theme.name}</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tour.durationDays}N{tour.durationNights}Đ</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{tour.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
            <span className="text-amber-500">★ {tour.avgRating.toFixed(1)}</span>
            <span>({tour.reviewCount} đánh giá)</span>
            {tour.destination && <span>📍 {tour.destination}</span>}
          </div>
          {tour.shortDescription && <p className="mt-3 text-slate-600">{tour.shortDescription}</p>}

          <Info label="Điểm khởi hành" value={tour.departurePoint} />
          <Info label="Điểm tập trung" value={tour.meetingPoint} />
          <Info label="Ngôn ngữ hướng dẫn" value={tour.guideLanguage} />
          <Info label="Số khách/đơn" value={`${tour.minPax}–${tour.maxPax}`} />

          {tour.highlights && (
            <Section title="Điểm nổi bật">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {tour.highlights.split('\n').filter(Boolean).map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </Section>
          )}

          {tour.description && (
            <Section title="Giới thiệu">
              <p className="whitespace-pre-line text-sm text-slate-700">{tour.description}</p>
            </Section>
          )}

          {tour.itinerary.length > 0 && (
            <Section title="Lịch trình">
              <ol className="space-y-3">
                {tour.itinerary.map((it) => (
                  <li key={it.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-800">Ngày {it.dayNumber}{it.title ? ` — ${it.title}` : ''}</p>
                    {it.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{it.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      {it.meals && <span>🍽 {it.meals}</span>}
                      {it.accommodation && <span>🏨 {it.accommodation}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(tour.included.length > 0 || tour.excluded.length > 0) && (
            <Section title="Bao gồm / Không bao gồm">
              <div className="grid gap-4 sm:grid-cols-2">
                <ul className="space-y-1 text-sm text-slate-700">
                  {tour.included.map((i) => <li key={i.id}>✅ {i.itemText}</li>)}
                </ul>
                <ul className="space-y-1 text-sm text-slate-500">
                  {tour.excluded.map((i) => <li key={i.id}>❌ {i.itemText}</li>)}
                </ul>
              </div>
            </Section>
          )}

          {tour.cancellationPolicy && (
            <Section title={`Chính sách hủy — ${tour.cancellationPolicy.name}`}>
              <ul className="space-y-1 text-sm text-slate-700">
                {tour.cancellationPolicy.freeHours > 0 && <li>• Miễn phí hủy trong {tour.cancellationPolicy.freeHours} giờ đầu sau khi đặt.</li>}
                {tour.cancellationPolicy.milestones.map((m, i) => (
                  <li key={i}>• Hủy trước ≥ {m.daysBefore} ngày so với ngày khởi hành: hoàn {m.refundRate}%.</li>
                ))}
                <li>• Hủy sát ngày hơn mốc cuối: không hoàn tiền.</li>
              </ul>
            </Section>
          )}

          {tour.notes.length > 0 &&
            tour.notes.map((n) => (
              <Section key={n.id} title={n.title || NOTE_LABEL[n.type] || 'Ghi chú'}>
                <p className="whitespace-pre-line text-sm text-slate-600">{n.content}</p>
              </Section>
            ))}

          <Section title={`Đánh giá (${data?.reviews.length ?? 0})`}>
            {data && data.reviews.length > 0 ? (
              <div className="space-y-3">
                {data.reviews.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{r.authorName}</span>
                      <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
                    {r.images && r.images.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.images.map((im) => (
                          <a key={im.id} href={im.url} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                            <img src={im.url} alt="" className="h-full w-full object-cover transition hover:scale-105" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Chưa có đánh giá.</p>
            )}
          </Section>
        </div>

        {/* Widget đặt tour */}
        <aside className="mt-6 w-full lg:mt-0 lg:w-80 lg:shrink-0">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Chỉ từ</p>
            <p className="text-2xl font-bold text-emerald-600">{formatPrice(tour.basePrice)}<span className="text-sm font-normal text-slate-400">/khách</span></p>

            {/* Đặt tour thao tác hoàn toàn bằng bàn phím: Tab giữa các ô, mũi tên ↑/↓ hoặc
                nút +/− để đổi số khách, Enter để đặt (form submit). */}
            <form onSubmit={(e) => { e.preventDefault(); book() }}>
              <label htmlFor="tour-departure" className="mt-4 block text-xs font-medium text-slate-500">Chọn chuyến khởi hành</label>
              {tour.departures.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">Hiện chưa có chuyến khởi hành nào được mở.</p>
              ) : (
                <select
                  id="tour-departure"
                  value={depId ?? ''}
                  onChange={(e) => setDepId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  {tour.departures.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.slotsLeft <= 0}>
                      {new Date(d.departureDate).toLocaleDateString('vi-VN')} — còn {d.slotsLeft} chỗ
                    </option>
                  ))}
                </select>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stepper id="tour-adults" label="Người lớn" value={adults} min={1} onChange={setAdults} />
                <Stepper id="tour-children" label="Trẻ em" value={children} min={0} onChange={setChildren} />
              </div>

              {selected && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                  <Row label={`Người lớn × ${adults}`} value={formatPrice(priceOf('ADULT') * adults)} />
                  {children > 0 && <Row label={`Trẻ em × ${children}`} value={formatPrice(priceOf('CHILD') * children)} />}
                  <Row label="Tạm tính" value={formatPrice(tentative)} strong />
                  {selected.slotsLeft < totalPax && <p className="text-xs text-red-600">Chuyến này chỉ còn {selected.slotsLeft} chỗ.</p>}
                </div>
              )}

              <button
                type="submit"
                disabled={!selected || selected.slotsLeft < totalPax}
                className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                Đặt tour
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Mẹo: nhấn <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-sans">Enter</kbd> để đặt nhanh.
              </p>
            </form>
          </div>
        </aside>
      </div>

      {data && data.similar.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Tour tương tự</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.similar.map((p) => <ProductCard key={`${p.type}-${p.id}`} product={p} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}
// Bộ chọn số lượng thao tác bằng bàn phím: Tab tới nút −/+ (bấm Enter/Space), hoặc focus ô
// số rồi dùng mũi tên ↑/↓. Giữ ô <input type=number> để vẫn gõ trực tiếp được.
function Stepper({ id, label, value, min, onChange }: { id: string; label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate-500">{label}</label>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 focus-within:border-emerald-500">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Giảm ${label.toLowerCase()}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-l-lg text-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 disabled:opacity-40"
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
          aria-label={`Số lượng ${label.toLowerCase()}`}
          className="w-full min-w-0 border-x border-slate-200 py-2 text-center text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          aria-label={`Tăng ${label.toLowerCase()}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-r-lg text-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
        >
          +
        </button>
      </div>
    </div>
  )
}
function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <p className="mt-2 text-sm text-slate-600">
      <span className="font-medium text-slate-800">{label}:</span> {value}
    </p>
  )
}
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold text-emerald-700' : 'text-slate-800'}>{value}</span>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DualSearchBar } from '../components/DualSearchBar'
import { ProductCard } from '../components/ProductCard'
import { ErrorState, Loading } from '../components/StateBlocks'
import { api, type HomeData, type Promotion } from '../lib/api'

// Lý do chọn StayTour (nội dung tĩnh, phong cách "Why choose us" của Travivu).
const TRUST = [
  { icon: '✈', title: 'Giá tốt mỗi ngày', desc: 'So sánh & đặt phòng, tour với mức giá ưu đãi nhất.' },
  { icon: '⌂', title: 'Homestay tuyển chọn', desc: 'Chỗ nghỉ được thẩm định, hình ảnh thực tế.' },
  { icon: '☺', title: 'Hướng dẫn địa phương', desc: 'Trải nghiệm bản địa cùng người dẫn tận tâm.' },
  { icon: '✓', title: 'Đặt chỗ an toàn', desc: 'Thanh toán bảo mật, xác nhận tức thì.' },
]

// Cảm nhận khách hàng (nội dung tĩnh minh hoạ, phong cách testimonials của Travivu).
const REVIEWS = [
  { name: 'Minh Anh', city: 'Hà Nội', text: 'Đặt homestay ở Đà Lạt cực nhanh, chỗ nghỉ đúng như hình. Sẽ quay lại!' },
  { name: 'Hoàng Nam', city: 'TP.HCM', text: 'Tour miền Tây được sắp xếp chỉn chu, hướng dẫn viên thân thiện.' },
  { name: 'Thu Trang', city: 'Đà Nẵng', text: 'Giao diện dễ dùng, thanh toán mượt mà. Rất đáng tin cậy.' },
]

export function HomePage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  const load = useCallback(() => {
    setStatus('loading')
    api
      .getHome()
      .then((d) => {
        setData(d)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="bg-cream-50">
      {/* ── Hero + thanh tìm kiếm kép ── */}
      <section className="relative">
        <div className="relative overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=75"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-forest-900/80 via-forest-900/45 to-transparent" />
          <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-40 sm:pt-28 sm:pb-48">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.25em] text-cream-200">
              Lên kế hoạch · Khám phá · Trải nghiệm
            </p>
            <h1 className="max-w-2xl font-display text-5xl font-semibold leading-tight text-cream-50 sm:text-6xl">
              Bạn sẽ phiêu lưu <span className="italic text-cream-300">nơi đâu</span> tiếp theo?
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-cream-100">
              Khám phá những homestay & tour truyền cảm hứng khắp Việt Nam — và dựng nên hành trình chỉn chu chỉ trong vài phút.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/search?type=HOMESTAY"
                className="rounded-full bg-forest-600 px-7 py-3 text-sm font-semibold text-cream-50 shadow-lg transition hover:bg-forest-500"
              >
                Bắt đầu lên kế hoạch →
              </Link>
              <Link
                to="/search?type=TOUR"
                className="rounded-full border border-cream-100/60 bg-white/10 px-7 py-3 text-sm font-semibold text-cream-50 backdrop-blur transition hover:bg-white/20"
              >
                Khám phá điểm đến
              </Link>
            </div>
          </div>
        </div>

        {/* Thanh tìm kiếm nổi, đè lên hero (phong cách Wanderly) */}
        <div className="relative mx-auto -mt-28 max-w-6xl px-6">
          <div className="rounded-3xl bg-white p-5 shadow-2xl shadow-forest-900/15 ring-1 ring-cream-200">
            <h2 className="mb-3 px-1 font-display text-xl font-semibold text-forest-900">
              Lên kế hoạch cho chuyến đi tiếp theo
            </h2>
            <DualSearchBar compact />
          </div>
        </div>
      </section>

      {status === 'loading' && <Loading />}
      {status === 'error' && <ErrorState message="Không thể tải nội dung trang chủ." onRetry={load} />}

      {status === 'ok' && data && (
        <div className="mx-auto max-w-7xl px-6 py-20">
          {/* ── Điểm đến đáng đến (areas) ── */}
          {data.areas.length > 0 && (
            <section className="mb-24">
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-500">Điểm đến nổi bật</p>
                  <h2 className="mt-2 font-display text-4xl font-semibold text-forest-900">Những nơi đáng đến.</h2>
                  <p className="mt-2 max-w-md text-forest-400">Điểm đến tuyển chọn cho hành trình khó quên tiếp theo của bạn.</p>
                </div>
                <Link to="/search" className="hidden text-sm font-medium text-forest-600 hover:text-forest-800 sm:block">
                  Xem tất cả điểm đến →
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {data.areas.map((a) => (
                  <Link
                    key={a.id}
                    to={`/search?destination=${encodeURIComponent(a.name)}`}
                    className="group relative aspect-[3/4] overflow-hidden rounded-2xl"
                  >
                    {a.image && (
                      <img
                        src={a.image}
                        alt={a.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-forest-900/80 via-forest-900/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-5">
                      <h3 className="font-display text-2xl font-semibold text-cream-50">{a.name}</h3>
                      <span className="mt-1 inline-block text-sm text-cream-200 opacity-0 transition group-hover:opacity-100">
                        Khám phá ngay →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Homestay & tour nổi bật ── */}
          <section className="mb-24">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-500">Gợi ý cho bạn</p>
                <h2 className="mt-2 font-display text-4xl font-semibold text-forest-900">Homestay & tour nổi bật.</h2>
              </div>
              <Link to="/search" className="hidden text-sm font-medium text-forest-600 hover:text-forest-800 sm:block">
                Xem tất cả →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {data.featured.map((p) => (
                <ProductCard key={`${p.type}-${p.id}`} product={p} />
              ))}
            </div>
          </section>

          {/* ── Vì sao chọn StayTour ── */}
          <section className="mb-24 rounded-3xl bg-forest-800 px-8 py-14 text-cream-50">
            <div className="mb-10 text-center">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cream-300">Vì sao chọn chúng tôi</p>
              <h2 className="mt-2 font-display text-4xl font-semibold text-cream-50">Dịch vụ du lịch đáng tin cậy.</h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((t) => (
                <div key={t.title} className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-forest-600 text-2xl text-cream-50">
                    {t.icon}
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-cream-50">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-cream-200">{t.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Khuyến mại đang chạy ── */}
          {data.promotions.length > 0 && (
            <section className="mb-24">
              <div className="mb-8">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-500">Ưu đãi</p>
                <h2 className="mt-2 font-display text-4xl font-semibold text-forest-900">Khuyến mại đang chạy.</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {data.promotions.map((p) => (
                  <PromoCard key={p.id} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* ── Cảm nhận khách hàng ── */}
          <section>
            <div className="mb-10 text-center">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-clay-500">Cảm nhận</p>
              <h2 className="mt-2 font-display text-4xl font-semibold text-forest-900">Khách hàng nói gì về StayTour.</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {REVIEWS.map((r) => (
                <div key={r.name} className="rounded-2xl border border-cream-200 bg-white p-7 shadow-sm">
                  <div className="text-gold-400">★★★★★</div>
                  <p className="mt-4 leading-relaxed text-forest-700">“{r.text}”</p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-full bg-forest-100 font-display text-lg font-semibold text-forest-700">
                      {r.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-forest-900">{r.name}</p>
                      <p className="text-sm text-forest-400">{r.city}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// Đồng hồ đếm lùi tới thời điểm kết thúc khuyến mãi (cập nhật mỗi giây).
function Countdown({ to }: { to: string }) {
  const [left, setLeft] = useState(() => new Date(to).getTime() - Date.now())
  useEffect(() => {
    const id = setInterval(() => setLeft(new Date(to).getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [to])
  if (left <= 0) return <span className="text-sm font-semibold text-clay-600">Đã kết thúc</span>
  const d = Math.floor(left / 86400000)
  const h = Math.floor((left % 86400000) / 3600000)
  const m = Math.floor((left % 3600000) / 60000)
  const s = Math.floor((left % 60000) / 1000)
  const Box = ({ v, l }: { v: number; l: string }) => (
    <span className="flex flex-col items-center">
      <span className="min-w-[2.2rem] rounded-lg bg-forest-800 px-2 py-1 text-center font-mono text-lg font-bold text-cream-50 tabular-nums">
        {String(v).padStart(2, '0')}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wide text-forest-400">{l}</span>
    </span>
  )
  return (
    <div className="flex items-center gap-1.5">
      {d > 0 && <Box v={d} l="ngày" />}
      <Box v={h} l="giờ" />
      <Box v={m} l="phút" />
      <Box v={s} l="giây" />
    </div>
  )
}

function PromoCard({ p }: { p: Promotion }) {
  const ending = p.endAt ? new Date(p.endAt).getTime() - Date.now() : null
  const soon = ending != null && ending > 0 && ending < 3 * 86400000
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-cream-200 bg-white">
      {p.discountPercent != null && (
        <span className="absolute left-4 top-4 z-10 rounded-full bg-clay-500 px-3 py-1 text-sm font-bold text-white shadow">
          -{p.discountPercent}%
        </span>
      )}
      {soon && (
        <span className="absolute right-4 top-4 z-10 animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow">
          Sắp kết thúc!
        </span>
      )}
      {p.image && (
        <img src={p.image} alt="" className="h-44 w-full object-cover transition duration-500 group-hover:scale-105" />
      )}
      <div className="p-6">
        <h3 className="font-display text-2xl font-semibold text-forest-800">{p.title}</h3>
        {p.description && <p className="mt-2 text-sm leading-relaxed text-forest-400">{p.description}</p>}

        {p.endAt && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-forest-600">Kết thúc sau:</span>
            <Countdown to={p.endAt} />
          </div>
        )}

        {p.discountCode && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-clay-400 bg-clay-50 px-3 py-1.5">
            <span className="text-xs text-forest-500">Mã:</span>
            <span className="font-mono text-sm font-bold text-clay-600">{p.discountCode}</span>
          </div>
        )}

        {/* Tham chiếu tour/homestay đang giảm */}
        {p.products && p.products.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-forest-400">Đang giảm</p>
            <div className="flex flex-wrap gap-1.5">
              {p.products.map((pr) => (
                <Link
                  key={`${pr.type}-${pr.id}`}
                  to={pr.type === 'TOUR' ? `/tour/${pr.slug}` : `/product/${pr.slug}`}
                  className="rounded-full border border-cream-300 px-3 py-1 text-xs text-forest-600 transition hover:border-forest-400 hover:text-forest-800"
                >
                  {pr.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {(p.serviceGroup || p.ctaLink) && (
          <Link
            to={p.ctaLink || `/search?group=${p.serviceGroup?.id ?? ''}`}
            className="mt-4 inline-block rounded-full bg-forest-700 px-5 py-2 text-sm font-semibold text-cream-50 transition hover:bg-forest-800"
          >
            Xem tất cả ưu đãi →
          </Link>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminReview, type TopRatedTour } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

const STATUS_LABEL: Record<string, string> = { PENDING: 'Chờ kiểm duyệt', APPROVED: 'Đã đăng', REJECTED: 'Đã ẩn' }

function Stars({ n }: { n: number }) {
  return <span className="text-amber-400">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

// Biểu đồ thanh ngang: xếp hạng tour theo điểm đánh giá trung bình (thang 5).
function TourRankChart({ tours }: { tours: TopRatedTour[] }) {
  if (!tours.length) return null
  return (
    <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-200">🏆 Tour được đánh giá tốt nhất</h2>
        <span className="text-xs text-slate-500">Điểm trung bình (thang 5) · {tours.length} tour</span>
      </div>
      <ul className="space-y-2.5">
        {tours.map((t, i) => {
          const pct = Math.max(4, (t.avgRating / 5) * 100)
          return (
            <li key={t.id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs font-semibold text-slate-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Link to={`/tour/${t.slug}`} target="_blank" className="truncate text-sm text-slate-200 hover:text-emerald-400">
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-xs">
                    <span className="font-semibold text-amber-400">★ {t.avgRating.toFixed(1)}</span>
                    <span className="ml-1 text-slate-500">({t.reviewCount} lượt)</span>
                  </span>
                </div>
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
                  role="img"
                  aria-label={`${t.title}: ${t.avgRating.toFixed(1)} trên 5, ${t.reviewCount} lượt đánh giá`}
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// UC-21 – Quản lý đánh giá: xem người đánh giá + đơn hàng liên kết, phản hồi khách qua email,
// ẩn đánh giá vi phạm. Đánh giá mới được đăng trực tiếp (không cần phê duyệt).
export function AdminReviewsPage() {
  const [items, setItems] = useState<AdminReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  // Soạn phản hồi theo từng đánh giá.
  const [replyOpen, setReplyOpen] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyMsg, setReplyMsg] = useState<string | null>(null)

  // Báo cáo: xếp hạng tour được đánh giá tốt nhất.
  const [topTours, setTopTours] = useState<TopRatedTour[]>([])

  // Bộ lọc tìm kiếm + lọc theo sao + sắp xếp (lọc phía client trên danh sách đã tải).
  const [search, setSearch] = useState('')
  const [starFilter, setStarFilter] = useState(0) // 0 = tất cả
  const [sortBy, setSortBy] = useState<'newest' | 'highest' | 'lowest'>('newest')

  useEffect(() => {
    adminApi.topRatedTours(10).then((r) => setTopTours(r.items)).catch(() => setTopTours([]))
  }, [])

  // Tải toàn bộ đánh giá (không lọc trạng thái) để xem và phản hồi.
  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listReviews({})
      .then((r) => setItems(r.items))
      .catch(() => setError('Không tải được danh sách đánh giá'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function approve(r: AdminReview) {
    setError(null)
    setBusyId(r.id)
    try {
      await adminApi.approveReview(r.id)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Thao tác thất bại')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(r: AdminReview) {
    setError(null)
    setBusyId(r.id)
    try {
      await adminApi.rejectReview(r.id)
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Thao tác thất bại')
    } finally {
      setBusyId(null)
    }
  }

  function openReply(r: AdminReview) {
    setReplyOpen(r.id)
    setReplyText(r.replyText ?? '')
    setReplyMsg(null)
  }

  async function sendReply(r: AdminReview) {
    if (!replyText.trim()) return
    setReplyBusy(true)
    setReplyMsg(null)
    try {
      const res = await adminApi.replyReview(r.id, replyText.trim())
      setReplyMsg(`✓ Đã gửi phản hồi tới ${res.sentTo}`)
      setReplyOpen(null)
      load()
    } catch (err) {
      setReplyMsg(err instanceof AdminApiError ? err.message : 'Gửi phản hồi thất bại')
    } finally {
      setReplyBusy(false)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = items
    .filter((r) => (starFilter ? r.rating === starFilter : true))
    .filter((r) => {
      if (!q) return true
      const hay = [r.reviewer?.name, r.authorName, r.reviewer?.email, r.product?.name, r.booking?.code, r.comment]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'highest') return b.rating - a.rating
      if (sortBy === 'lowest') return a.rating - b.rating
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Báo cáo và quản lý phản hồi của khách hàng</h1>

      {/* Báo cáo: biểu đồ xếp hạng tour được đánh giá tốt nhất */}
      <TourRankChart tours={topTours} />

      <h2 className="mb-3 font-semibold text-slate-200">Danh sách đánh giá{!loading ? ` (${filtered.length}/${items.length})` : ''}</h2>

      {/* Bộ lọc: tìm theo tên khách / sản phẩm / mã đơn / nội dung + lọc sao + sắp xếp */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên khách, sản phẩm, mã đơn, email, nội dung..."
          className={`${field} min-w-64 flex-1`}
        />
        <select value={starFilter} onChange={(e) => setStarFilter(Number(e.target.value))} className={field}>
          <option value={0}>Tất cả số sao</option>
          {[5, 4, 3, 2, 1].map((s) => (
            <option key={s} value={s}>{s} sao</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={field}>
          <option value="newest">Mới nhất</option>
          <option value="highest">Điểm cao → thấp</option>
          <option value="lowest">Điểm thấp → cao</option>
        </select>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}
      {replyMsg && <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{replyMsg}</div>}

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Chưa có đánh giá nào.</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">Không có đánh giá khớp bộ lọc.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-200">{r.reviewer?.name || r.authorName}</span>
                  {r.reviewer?.isGuest != null && (
                    <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">
                      {r.reviewer.isGuest ? 'Khách vãng lai' : 'Thành viên'}
                    </span>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {r.reviewer?.email && <span>✉ {r.reviewer.email}</span>}
                    <span>· {r.product?.name}</span>
                    {r.booking?.code && (
                      <Link to={`/admin/orders/${r.booking.code}`} className="font-mono text-emerald-400 hover:text-emerald-300">
                        🧾 Đơn {r.booking.code}
                      </Link>
                    )}
                    <span>· {new Date(r.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    r.approved ? 'bg-emerald-900 text-emerald-300' : r.rejected ? 'bg-red-950 text-red-300' : 'bg-amber-900 text-amber-300'
                  }`}
                >
                  {STATUS_LABEL[r.approved ? 'APPROVED' : r.rejected ? 'REJECTED' : 'PENDING']}
                </span>
              </div>

              <div className="mb-2"><Stars n={r.rating} /></div>
              {r.comment && <p className="mb-3 text-sm text-slate-300">{r.comment}</p>}

              {/* Phản hồi đã gửi trước đó */}
              {r.replyText && (
                <div className="mb-3 rounded-lg border-l-2 border-emerald-700 bg-slate-900 px-3 py-2">
                  <p className="text-xs font-medium text-emerald-400">
                    Phản hồi đã gửi{r.repliedAt ? ` · ${new Date(r.repliedAt).toLocaleString('vi-VN')}` : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{r.replyText}</p>
                </div>
              )}

              {/* Ô soạn phản hồi (gửi email trực tiếp) */}
              {replyOpen === r.id ? (
                <div className="mb-3 space-y-2">
                  <textarea
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Phản hồi tới ${r.reviewer?.email || 'khách hàng'}...`}
                    className={`${field} min-h-24 w-full`}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={replyBusy || !replyText.trim()}
                      onClick={() => sendReply(r)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {replyBusy ? 'Đang gửi...' : '✉ Gửi phản hồi'}
                    </button>
                    <button
                      disabled={replyBusy}
                      onClick={() => setReplyOpen(null)}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {replyOpen !== r.id && (
                  <button
                    disabled={!r.reviewer?.email}
                    onClick={() => openReply(r)}
                    title={r.reviewer?.email ? '' : 'Đánh giá này không có email khách hàng'}
                    className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-40"
                  >
                    {r.replyText ? '✉ Phản hồi lại' : '✉ Phản hồi khách'}
                  </button>
                )}
                {!r.approved && (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => approve(r)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Hiện lại
                  </button>
                )}
                {!r.rejected && (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => reject(r)}
                    className="rounded-lg border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {r.approved ? 'Ẩn (vi phạm)' : 'Từ chối'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

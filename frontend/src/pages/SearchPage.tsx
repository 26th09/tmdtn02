import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DualSearchBar } from '../components/DualSearchBar'
import { ProductCard } from '../components/ProductCard'
import { ErrorState, Loading } from '../components/StateBlocks'
import { ApiError, api, formatPrice, type SearchResult } from '../lib/api'

interface Filters {
  minPrice: string
  maxPrice: string
  locations: string[]
  amenities: string[]
  minRating: string
  durations: number[]
  group: string
  sort: string
}

const emptyFilters: Filters = {
  minPrice: '',
  maxPrice: '',
  locations: [],
  amenities: [],
  minRating: '',
  durations: [],
  group: '',
  sort: '',
}

// Làm phẳng cây nhóm thành danh sách có thụt đầu dòng cho <select>.
function flattenGroups(nodes: { id: number; name: string; children?: unknown[] }[] | undefined, depth = 0): { id: number; label: string }[] {
  if (!nodes) return []
  const out: { id: number; label: string }[] = []
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` })
    out.push(...flattenGroups((n.children as { id: number; name: string; children?: unknown[] }[]) || [], depth + 1))
  }
  return out
}

export function SearchPage() {
  const [params] = useSearchParams()
  // Tiêu chí tìm kiếm cơ bản lấy từ URL (do thanh tìm kiếm kép đẩy lên).
  const criteriaKey = params.toString()
  const type = params.get('type') === 'TOUR' ? 'TOUR' : 'HOMESTAY'

  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [data, setData] = useState<SearchResult | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [invalid, setInvalid] = useState<string | null>(null) // ngoại lệ 2a

  // Khi tiêu chí cơ bản đổi (người dùng tìm lại - luồng 4a) thì reset bộ lọc.
  useEffect(() => {
    setFilters(emptyFilters)
  }, [criteriaKey])

  const load = useCallback(() => {
    const qs = new URLSearchParams()
    // tiêu chí cơ bản
    for (const k of ['type', 'destination', 'guests', 'from', 'to', 'depart']) {
      const v = params.get(k)
      if (v) qs.set(k, v)
    }
    // bộ lọc thứ cấp
    if (filters.minPrice) qs.set('minPrice', filters.minPrice)
    if (filters.maxPrice) qs.set('maxPrice', filters.maxPrice)
    if (filters.minRating) qs.set('minRating', filters.minRating)
    if (filters.locations.length) qs.set('location', filters.locations.join(',')) // 1 khu vực/lần cho đơn giản
    if (filters.amenities.length) qs.set('amenities', filters.amenities.join(','))
    if (filters.durations.length) qs.set('duration', filters.durations.join(','))
    if (filters.group) qs.set('group', filters.group)
    if (filters.sort) qs.set('sort', filters.sort)

    setStatus('loading')
    setInvalid(null)
    api
      .search(qs)
      .then((d) => {
        setData(d)
        setStatus('ok')
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 400) {
          setInvalid(err.message) // ngoại lệ 2a: tiêu chí không hợp lệ
          setStatus('ok')
        } else {
          setStatus('error')
        }
      })
  }, [params, filters])

  useEffect(() => {
    load()
  }, [load])

  const facets = data?.facets
  const summary = useMemo(() => {
    const dest = params.get('destination')
    return [type === 'HOMESTAY' ? 'Homestay' : 'Tour', dest ? `tại "${dest}"` : ''].filter(Boolean).join(' ')
  }, [params, type])

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
  }

  return (
    <div>
      <section className="border-b border-cream-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <DualSearchBar compact />
        </div>
      </section>

      <div className="mx-auto max-w-7xl gap-8 px-6 py-8 lg:flex">
        {/* Cột bộ lọc */}
        <aside className="mb-6 w-full shrink-0 lg:mb-0 lg:w-72 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-cream-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-forest-900">Bộ lọc</h2>
              <button
                onClick={() => setFilters(emptyFilters)}
                className="text-xs text-clay-500 hover:text-clay-600"
              >
                Xóa lọc
              </button>
            </div>

            {/* Giá */}
            <div className="mb-5">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Khoảng giá (₫)</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder={facets ? String(facets.priceMin) : 'Từ'}
                  value={filters.minPrice}
                  onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))}
                  className="w-full rounded-lg border border-cream-300 px-2 py-1.5 text-sm focus:border-forest-400 focus:outline-none"
                />
                <span className="text-forest-300">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder={facets ? String(facets.priceMax) : 'Đến'}
                  value={filters.maxPrice}
                  onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
                  className="w-full rounded-lg border border-cream-300 px-2 py-1.5 text-sm focus:border-forest-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Đánh giá */}
            <div className="mb-5">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Đánh giá</p>
              {['4.5', '4', '0'].map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                  <input
                    type="radio"
                    name="rating"
                    checked={filters.minRating === (r === '0' ? '' : r)}
                    onChange={() => setFilters((f) => ({ ...f, minRating: r === '0' ? '' : r }))}
                  />
                  {r === '0' ? 'Tất cả' : `${r}★ trở lên`}
                </label>
              ))}
            </div>

            {/* Nhóm dịch vụ (cây theo vùng/địa phương) */}
            {facets && facets.groups && facets.groups.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Nhóm dịch vụ</p>
                <select
                  value={filters.group}
                  onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}
                  className="w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-forest-900 focus:border-forest-400 focus:outline-none"
                >
                  <option value="">Tất cả nhóm</option>
                  {flattenGroups(facets.groups).map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Khu vực */}
            {facets && facets.locations.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Khu vực</p>
                {facets.locations.map((loc) => (
                  <label key={loc} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.locations.includes(loc)}
                      onChange={() => setFilters((f) => ({ ...f, locations: toggle(f.locations, loc) }))}
                    />
                    {loc}
                  </label>
                ))}
              </div>
            )}

            {/* Tiện nghi (homestay) */}
            {type === 'HOMESTAY' && facets && facets.amenities.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Tiện nghi</p>
                {facets.amenities.map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.amenities.includes(a)}
                      onChange={() => setFilters((f) => ({ ...f, amenities: toggle(f.amenities, a) }))}
                    />
                    {a}
                  </label>
                ))}
              </div>
            )}

            {/* Thời lượng (tour) */}
            {type === 'TOUR' && facets && facets.durations.length > 0 && (
              <div className="mb-1">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-forest-500">Thời lượng</p>
                {facets.durations.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                    <input
                      type="checkbox"
                      checked={filters.durations.includes(d)}
                      onChange={() => setFilters((f) => ({ ...f, durations: toggle(f.durations, d) }))}
                    />
                    {d} ngày
                  </label>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Cột kết quả */}
        <div className="flex-1">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cream-200 bg-white px-5 py-3">
            <h1 className="font-display text-xl font-semibold text-forest-900">
              Tìm kiếm {summary}
              {status === 'ok' && !invalid && (
                <span className="ml-2 text-sm font-normal text-forest-400">
                  ({data?.count ?? 0} kết quả
                  {data?.nights ? `, ${data.nights} đêm` : ''})
                </span>
              )}
            </h1>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              className="rounded-full border border-cream-300 px-4 py-1.5 text-sm text-forest-700 focus:border-forest-400 focus:outline-none"
            >
              <option value="">Sắp xếp: Mới nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
              <option value="rating_desc">Đánh giá cao nhất</option>
            </select>
          </div>

          {/* Ngoại lệ 2a: tiêu chí không hợp lệ */}
          {invalid && (
            <div className="rounded-xl border border-clay-400 bg-clay-400/10 px-4 py-3 text-sm text-clay-600">
              ⚠️ {invalid}. Vui lòng chỉnh lại tiêu chí tìm kiếm.
            </div>
          )}

          {!invalid && status === 'loading' && <Loading />}
          {!invalid && status === 'error' && <ErrorState onRetry={load} />}

          {/* Ngoại lệ 3a: không có kết quả */}
          {!invalid && status === 'ok' && data && data.count === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-forest-400">
              <div className="text-4xl">🔍</div>
              <p className="mt-3 font-display text-lg font-medium text-forest-700">Không tìm thấy sản phẩm phù hợp</p>
              <p className="mt-1 text-sm">Hãy thử nới lỏng tiêu chí: mở rộng khoảng giá, bỏ bớt bộ lọc hoặc đổi khu vực.</p>
            </div>
          )}

          {!invalid && status === 'ok' && data && data.count > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((p) => (
                <div key={`${p.type}-${p.id}`}>
                  <ProductCard product={p} />
                  {p.totalPrice != null && (
                    <p className="mt-1 px-1 text-xs text-forest-400">
                      Tạm tính {p.nights} đêm:{' '}
                      <span className="font-semibold text-clay-600">{formatPrice(p.totalPrice)}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

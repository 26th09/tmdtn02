import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminTourCat, type AdminTourDetail, type TourImage } from '../../lib/adminApi'
import { CategoryCombo, resolveCategoryId } from '../../components/admin/CategoryCombo'

const field = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
const label = 'mb-1 block text-sm text-slate-300'

const empty = {
  title: '', slug: '', tourCode: '', shortDescription: '', description: '', highlights: '',
  durationDays: '1', durationNights: '0', departurePoint: '', destination: '',
  meetingPoint: '', minPax: '1', maxPax: '30', guideLanguage: '', basePrice: '', depositRate: '',
  cancellationPolicyId: '', metaTitle: '', metaDescription: '', itinerary: '', included: '', excluded: '', note: '',
}

// UC-17 – Tạo mới / chỉnh sửa tour (bảng riêng) + quản lý ảnh (BR-82).
export function AdminTourFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [f, setF] = useState({ ...empty })
  const [peakSeason, setPeakSeason] = useState(false) // Luồng 3: mùa cao điểm
  const [regionName, setRegionName] = useState('')
  const [themeName, setThemeName] = useState('')
  const [images, setImages] = useState<TourImage[]>([])
  const [tourId, setTourId] = useState<number | null>(null)
  const [cats, setCats] = useState<{ regions: AdminTourCat[]; themes: AdminTourCat[]; policies: { id: number; name: string }[] }>({ regions: [], themes: [], policies: [] })

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(!isEdit)

  const set = (k: keyof typeof empty, v: string) => setF((prev) => ({ ...prev, [k]: v }))

  useEffect(() => {
    adminApi.getTourCategories().then((c) => setCats({ regions: c.regions, themes: c.themes, policies: c.policies })).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    adminApi.getTour(Number(id)).then(({ tour }) => {
      fillForm(tour)
      setLoaded(true)
    })
  }, [id])

  function fillForm(t: AdminTourDetail) {
    setF({
      title: t.title, slug: t.slug, tourCode: t.tourCode, shortDescription: t.shortDescription ?? '',
      description: t.description ?? '', highlights: t.highlights ?? '',
      durationDays: String(t.durationDays), durationNights: String(t.durationNights),
      departurePoint: t.departurePoint ?? '', destination: t.destination ?? '', meetingPoint: t.meetingPoint ?? '',
      minPax: String(t.minPax), maxPax: String(t.maxPax), guideLanguage: t.guideLanguage ?? '',
      basePrice: String(t.basePrice), depositRate: t.depositRate != null ? String(t.depositRate) : '',
      // (isPeakSeason xử lý ở state riêng bên dưới)
      cancellationPolicyId: t.cancellationPolicyId != null ? String(t.cancellationPolicyId) : '',
      metaTitle: t.metaTitle ?? '', metaDescription: t.metaDescription ?? '',
      itinerary: (t.itinerary ?? []).map((it) => `${it.title || 'Ngày ' + it.dayNumber}: ${it.description || ''}`).join('\n'),
      included: (t.inclusions ?? []).filter((i) => i.type === 'INCLUDED').map((i) => i.itemText).join('\n'),
      excluded: (t.inclusions ?? []).filter((i) => i.type === 'EXCLUDED').map((i) => i.itemText).join('\n'),
      note: (t.notes ?? [])[0]?.content ?? '',
    })
    setPeakSeason(Boolean(t.isPeakSeason))
    setRegionName(t.region?.name ?? '')
    setThemeName(t.theme?.name ?? '')
    setImages(t.images ?? [])
    setTourId(t.id)
  }

  function buildPayload(regionId?: number, themeId?: number) {
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
    const itinerary = lines(f.itinerary).map((line, i) => {
      const m = line.match(/^(.*?):\s*(.*)$/)
      return { dayNumber: i + 1, title: m ? m[1].trim() : `Ngày ${i + 1}`, description: m ? m[2].trim() : line }
    })
    return {
      title: f.title,
      slug: f.slug || undefined,
      tourCode: f.tourCode || undefined,
      shortDescription: f.shortDescription || undefined,
      description: f.description || undefined,
      highlights: f.highlights || undefined,
      regionId: regionId ?? undefined,
      themeId: themeId ?? undefined,
      durationDays: f.durationDays || undefined,
      durationNights: f.durationNights || undefined,
      departurePoint: f.departurePoint || undefined,
      destination: f.destination || undefined,
      meetingPoint: f.meetingPoint || undefined,
      minPax: f.minPax || undefined,
      maxPax: f.maxPax || undefined,
      guideLanguage: f.guideLanguage || undefined,
      basePrice: Number(f.basePrice),
      depositRate: f.depositRate || undefined,
      isPeakSeason: peakSeason,
      cancellationPolicyId: f.cancellationPolicyId || undefined,
      metaTitle: f.metaTitle || undefined,
      metaDescription: f.metaDescription || undefined,
      itinerary,
      included: lines(f.included),
      excluded: lines(f.excluded),
      notes: f.note.trim() ? [{ type: 'TERM', title: 'Cần biết trước khi đặt', content: f.note.trim() }] : [],
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      // Vùng miền / chủ đề: chọn có sẵn -> id; gõ mới -> tự tạo danh mục.
      const regionId = await resolveCategoryId(regionName, cats.regions, async (n) => {
        const { category } = await adminApi.createTourCategory('region', n)
        setCats((c) => ({ ...c, regions: [...c.regions, category] }))
        return category
      })
      const themeId = await resolveCategoryId(themeName, cats.themes, async (n) => {
        const { category } = await adminApi.createTourCategory('theme', n)
        setCats((c) => ({ ...c, themes: [...c.themes, category] }))
        return category
      })
      const payload = buildPayload(regionId, themeId)
      if (isEdit && id) {
        const { tour } = await adminApi.updateTour(Number(id), payload)
        fillForm(tour)
        setNotice('Đã lưu thay đổi.')
      } else {
        const { tour } = await adminApi.createTour(payload)
        navigate(`/admin/tours/${tour.id}/edit`, { replace: true })
        return
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Lưu thất bại. Vui lòng thử lại.') // 5a
    } finally {
      setSaving(false)
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tourId) return
    setUploading(true)
    setError(null)
    try {
      const up = await adminApi.uploadTourImage(file)
      const { image } = await adminApi.addTourImage(tourId, up.filename)
      setImages((prev) => [...prev, image])
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tải ảnh thất bại')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function removeImage(imageId: number) {
    if (!tourId) return
    await adminApi.removeTourImage(tourId, imageId)
    setImages((prev) => prev.filter((im) => im.id !== imageId))
  }

  if (!loaded) return <p className="text-slate-500">Đang tải...</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">{isEdit ? 'Chỉnh sửa tour' : 'Thêm tour mới'}</h1>

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <fieldset className="space-y-4">
          <legend className="mb-2 font-semibold text-slate-200">Thông tin cơ bản</legend>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className={label}>Tên tour *</label><input className={field} value={f.title} onChange={(e) => set('title', e.target.value)} required /></div>
            <div><label className={label}>Mã tour</label><input className={field} value={f.tourCode} onChange={(e) => set('tourCode', e.target.value)} placeholder="Để trống -> tự sinh" /></div>
            <div><label className={label}>Đường dẫn (slug)</label><input className={field} value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="Để trống -> tự sinh" /></div>
            <div className="col-span-2"><label className={label}>Mô tả ngắn (tagline)</label><input className={field} value={f.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} /></div>
            <CategoryCombo label="Vùng miền" value={regionName} onChange={setRegionName} options={cats.regions} placeholder="Chọn hoặc gõ vùng miền mới" />
            <CategoryCombo label="Chủ đề" value={themeName} onChange={setThemeName} options={cats.themes} placeholder="Chọn hoặc gõ chủ đề mới" />

            <div><label className={label}>Số ngày</label><input className={field} type="number" min={1} value={f.durationDays} onChange={(e) => set('durationDays', e.target.value)} /></div>
            <div><label className={label}>Số đêm</label><input className={field} type="number" min={0} value={f.durationNights} onChange={(e) => set('durationNights', e.target.value)} /></div>
            <div><label className={label}>Điểm khởi hành</label><input className={field} value={f.departurePoint} onChange={(e) => set('departurePoint', e.target.value)} /></div>
            <div><label className={label}>Điểm đến chính</label><input className={field} value={f.destination} onChange={(e) => set('destination', e.target.value)} /></div>
            <div><label className={label}>Số khách tối thiểu</label><input className={field} type="number" min={1} value={f.minPax} onChange={(e) => set('minPax', e.target.value)} /></div>
            <div><label className={label}>Số khách tối đa</label><input className={field} type="number" min={1} value={f.maxPax} onChange={(e) => set('maxPax', e.target.value)} /></div>
            <div><label className={label}>Ngôn ngữ hướng dẫn</label><input className={field} value={f.guideLanguage} onChange={(e) => set('guideLanguage', e.target.value)} placeholder="Tiếng Việt" /></div>
            <div className="col-span-2"><label className={label}>Điểm tập trung + hướng dẫn</label><textarea className={field} rows={2} value={f.meetingPoint} onChange={(e) => set('meetingPoint', e.target.value)} /></div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Giá & chính sách</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div><label className={label}>Giá tham khảo (VNĐ) *</label><input className={field} type="number" min={0} value={f.basePrice} onChange={(e) => set('basePrice', e.target.value)} required /></div>
            <div><label className={label}>Tỷ lệ cọc (%)</label><input className={field} type="number" min={1} max={100} value={f.depositRate} onChange={(e) => set('depositRate', e.target.value)} placeholder="Theo cấu hình hệ thống" /></div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-200">
                <input type="checkbox" checked={peakSeason} onChange={(e) => setPeakSeason(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
                🔥 Mùa cao điểm (ẩn "Trả sau", buộc đặt cọc)
              </label>
            </div>
            <div><label className={label}>Chính sách hủy</label>
              <select className={field} value={f.cancellationPolicyId} onChange={(e) => set('cancellationPolicyId', e.target.value)}>
                <option value="">— Mặc định —</option>
                {cats.policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Nội dung</legend>
          <div><label className={label}>Điểm nổi bật (mỗi dòng một mục)</label><textarea className={field} rows={3} value={f.highlights} onChange={(e) => set('highlights', e.target.value)} /></div>
          <div><label className={label}>Giới thiệu chi tiết</label><textarea className={field} rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
          <div><label className={label}>Lịch trình (mỗi dòng một ngày, dạng "Tiêu đề: nội dung")</label><textarea className={field} rows={4} value={f.itinerary} onChange={(e) => set('itinerary', e.target.value)} placeholder={'Hà Nội – Sa Pa: Khởi hành, nhận phòng\nChinh phục Fansipan: Cáp treo lên đỉnh'} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Bao gồm (mỗi dòng một mục)</label><textarea className={field} rows={3} value={f.included} onChange={(e) => set('included', e.target.value)} /></div>
            <div><label className={label}>Không bao gồm</label><textarea className={field} rows={3} value={f.excluded} onChange={(e) => set('excluded', e.target.value)} /></div>
          </div>
          <div><label className={label}>Cần biết trước khi đặt (điều khoản/FAQ)</label><textarea className={field} rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
        </fieldset>

        <fieldset className="space-y-2 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">SEO</legend>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Meta title</label><input className={field} value={f.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} /></div>
            <div><label className={label}>Meta description</label><input className={field} value={f.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></div>
          </div>
        </fieldset>

        {tourId ? (
          <div className="border-t border-slate-800 pt-4">
            <label className={label}>Thư viện ảnh</label>
            <div className="flex flex-wrap gap-2">
              {images.map((im) => (
                <div key={im.id} className="group relative h-20 w-28 overflow-hidden rounded-lg border border-slate-700">
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                  {im.isCover && <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1 text-[10px] text-white">Bìa</span>}
                  <button type="button" onClick={() => removeImage(im.id)} className="absolute right-1 top-1 hidden rounded-full bg-black/70 px-1.5 text-xs text-white group-hover:block">✕</button>
                </div>
              ))}
              <label className="flex h-20 w-28 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500 hover:border-emerald-500">
                {uploading ? 'Đang tải...' : '+ Thêm ảnh'}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} disabled={uploading} />
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">JPEG/PNG/WEBP, tối đa 5MB. Ảnh đầu tiên là ảnh bìa.</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Lưu tour trước để tải ảnh và thêm chuyến khởi hành.</p>
        )}

        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">⚠️ {error}</div>}
        {notice && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">✓ {notice}</div>}

        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo tour'}
        </button>
        {tourId && (
          <a href={`/admin/tours/${tourId}/departures`} className="ml-3 text-sm text-blue-400 hover:underline">Quản lý chuyến khởi hành →</a>
        )}
      </form>
    </div>
  )
}

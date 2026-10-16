import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminGuideDetail } from '../../lib/adminApi'

const field = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
const label = 'mb-1 block text-sm text-slate-300'

const empty = {
  title: '', slug: '', authorName: '', excerpt: '', content: '',
  locationName: '', latitude: '', longitude: '', publishedAt: '',
}

function toDateInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function AdminGuideFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [f, setF] = useState({ ...empty })
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [tourIds, setTourIds] = useState<number[]>([])
  const [tours, setTours] = useState<{ id: number; title: string; slug: string }[]>([])
  const [, setGuideId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(!isEdit)
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    adminApi.getGuideMeta().then((d) => setTours(d.tours)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!id) return
    adminApi.getGuide(Number(id)).then(({ guide }) => { fill(guide); setLoaded(true) }).catch(() => setLoaded(true))
  }, [id])

  function fill(g: AdminGuideDetail) {
    setF({
      title: g.title, slug: g.slug, authorName: g.authorName ?? '', excerpt: g.excerpt ?? '', content: g.content ?? '',
      locationName: g.locationName ?? '', latitude: g.latitude != null ? String(g.latitude) : '',
      longitude: g.longitude != null ? String(g.longitude) : '', publishedAt: toDateInput(g.publishedAt),
    })
    setCoverImage(g.coverImage)
    setTourIds((g.relatedTours ?? []).map((r) => r.tourId))
    setGuideId(g.id)
  }

  function buildPayload() {
    return {
      title: f.title,
      slug: f.slug || undefined,
      authorName: f.authorName || undefined,
      excerpt: f.excerpt || undefined,
      content: f.content,
      coverImage: coverImage ?? undefined,
      locationName: f.locationName || undefined,
      latitude: f.latitude || undefined,
      longitude: f.longitude || undefined,
      publishedAt: f.publishedAt || undefined,
      tourIds,
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setSaving(true)
    try {
      if (isEdit && id) { const { guide } = await adminApi.updateGuide(Number(id), buildPayload()); fill(guide); setNotice('Đã lưu thay đổi.') }
      else { const { guide } = await adminApi.createGuide(buildPayload()); navigate(`/admin/guides/${guide.id}/edit`, { replace: true }); return }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Không gửi được yêu cầu đến máy chủ. Kiểm tra kết nối rồi bấm Lưu lại.')
    } finally { setSaving(false) }
  }

  async function onPickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const up = await adminApi.uploadGuideImage(file)
      setCoverImage(up.url)
    } catch (err) { setError(err instanceof AdminApiError ? err.message : 'Tải ảnh thất bại') }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  const toggleTour = (tid: number) => setTourIds((prev) => (prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]))

  if (!loaded) return <p className="text-slate-500">Đang tải...</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">{isEdit ? 'Chỉnh sửa cẩm nang' : 'Thêm bài cẩm nang'}</h1>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <fieldset className="space-y-4">
          <legend className="mb-2 font-semibold text-slate-200">Nội dung</legend>
          <div><label className={label}>Tiêu đề *</label><input className={field} value={f.title} onChange={(e) => set('title', e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Tác giả</label><input className={field} value={f.authorName} onChange={(e) => set('authorName', e.target.value)} /></div>
            <div><label className={label}>Ngày đăng</label><input className={field} type="date" value={f.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} /></div>
          </div>
          <div><label className={label}>Slug</label><input className={field} value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="Để trống -> tự sinh từ tiêu đề" /></div>
          <div><label className={label}>Tóm tắt ngắn</label><textarea className={field} rows={2} value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} placeholder="Hiển thị ở thẻ danh sách" /></div>
          <div><label className={label}>Nội dung bài viết *</label><textarea className={field} rows={10} value={f.content} onChange={(e) => set('content', e.target.value)} placeholder="Mỗi đoạn một dòng..." required /></div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Ảnh bìa</legend>
          <div className="flex items-center gap-4">
            {coverImage ? (
              <div className="group relative h-24 w-40 overflow-hidden rounded-lg border border-slate-700">
                <img src={coverImage} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setCoverImage(null)} className="absolute right-1 top-1 hidden rounded-full bg-black/70 px-1.5 text-xs text-white group-hover:block">✕</button>
              </div>
            ) : (
              <label className="flex h-24 w-40 cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500 hover:border-emerald-500">
                {uploading ? 'Đang tải...' : '+ Tải ảnh bìa'}
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickCover} disabled={uploading} />
              </label>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Địa điểm (bản đồ)</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="col-span-3"><label className={label}>Tên địa điểm</label><input className={field} value={f.locationName} onChange={(e) => set('locationName', e.target.value)} placeholder="VD: Đà Lạt, Lâm Đồng" /></div>
            <div><label className={label}>Vĩ độ (latitude)</label><input className={field} value={f.latitude} onChange={(e) => set('latitude', e.target.value)} placeholder="11.9404" /></div>
            <div><label className={label}>Kinh độ (longitude)</label><input className={field} value={f.longitude} onChange={(e) => set('longitude', e.target.value)} placeholder="108.4583" /></div>
            <p className="col-span-3 text-xs text-slate-500">Nhập toạ độ để hiển thị bản đồ ở trang bài viết. Có thể lấy toạ độ bằng cách chuột phải trên Google Maps.</p>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Tour liên quan</legend>
          {tours.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có tour nào để liên kết.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tours.map((t) => (
                <label key={t.id} className={`cursor-pointer rounded-lg border px-3 py-1 text-sm ${tourIds.includes(t.id) ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
                  <input type="checkbox" className="mr-1 hidden" checked={tourIds.includes(t.id)} onChange={() => toggleTour(t.id)} />
                  {tourIds.includes(t.id) ? '✓ ' : ''}{t.title}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">⚠️ {error}</div>}
        {notice && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">✓ {notice}</div>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo bài viết'}</button>
          <button type="button" onClick={() => navigate('/admin/guides')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Quay lại</button>
        </div>
        {isEdit && <p className="text-xs text-slate-500">Bài mới ở trạng thái "Nháp". Vào danh sách bấm "Hiện" để công khai.</p>}
      </form>
    </div>
  )
}

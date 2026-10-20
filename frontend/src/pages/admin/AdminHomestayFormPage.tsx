import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminAmenity, type AdminProductDetail, type AdminPropertyCat, type AdminRoomType } from '../../lib/adminApi'
import { CategoryCombo, resolveCategoryId } from '../../components/admin/CategoryCombo'

const field = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'
const label = 'mb-1 block text-sm text-slate-300'

const empty = {
  name: '', slug: '', propertyCode: '', propertyType: 'HOMESTAY', starRating: '', shortDescription: '', description: '',
  address: '', latitude: '', longitude: '', checkInTime: '14:00', checkOutTime: '12:00',
  basePrice: '', depositRate: '', cancellationPolicyId: '', contactPhone: '', contactEmail: '', metaTitle: '', metaDescription: '', houseRules: '',
}

export function AdminHomestayFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [f, setF] = useState({ ...empty })
  const [peakSeason, setPeakSeason] = useState(false) // Luồng 3: mùa cao điểm
  const [provinceName, setProvinceName] = useState('')
  const [areaName, setAreaName] = useState('')
  const [amenityIds, setAmenityIds] = useState<number[]>([])
  const [images, setImages] = useState<AdminProductDetail['images']>([])
  const [roomTypes, setRoomTypes] = useState<AdminRoomType[]>([])
  const [propId, setPropId] = useState<number | null>(null)
  const [meta, setMeta] = useState<{ provinces: AdminPropertyCat[]; areas: AdminPropertyCat[]; amenities: AdminAmenity[]; policies: { id: number; name: string }[] }>({ provinces: [], areas: [], amenities: [], policies: [] })

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(!isEdit)
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    adminApi.getHomestayMeta().then(setMeta).catch(() => {})
  }, [])
  useEffect(() => {
    if (!id) return
    adminApi.getHomestay(Number(id)).then(({ property }) => { fill(property); setLoaded(true) })
  }, [id])

  function fill(p: AdminProductDetail) {
    setF({
      name: p.name, slug: p.slug, propertyCode: p.propertyCode, propertyType: p.propertyType, starRating: p.starRating != null ? String(p.starRating) : '',
      shortDescription: p.shortDescription ?? '', description: p.description ?? '',
      address: p.address ?? '',
      latitude: p.latitude != null ? String(p.latitude) : '', longitude: p.longitude != null ? String(p.longitude) : '',
      checkInTime: p.checkInTime ?? '', checkOutTime: p.checkOutTime ?? '', basePrice: String(p.basePrice), depositRate: p.depositRate != null ? String(p.depositRate) : '',
      cancellationPolicyId: p.cancellationPolicyId != null ? String(p.cancellationPolicyId) : '', contactPhone: p.contactPhone ?? '', contactEmail: p.contactEmail ?? '',
      metaTitle: p.metaTitle ?? '', metaDescription: p.metaDescription ?? '', houseRules: (p.policies ?? []).map((x) => x.content).join('\n'),
    })
    setPeakSeason(Boolean(p.isPeakSeason))
    setProvinceName(p.province?.name ?? '')
    setAreaName(p.area?.name ?? '')
    setAmenityIds((p.amenities ?? []).map((a) => a.amenity.id))
    setImages(p.images ?? [])
    setRoomTypes(p.roomTypes ?? [])
    setPropId(p.id)
  }

  function buildPayload(provinceId?: number, areaId?: number) {
    return {
      name: f.name, slug: f.slug || undefined, propertyCode: f.propertyCode || undefined, propertyType: f.propertyType,
      starRating: f.starRating || undefined, shortDescription: f.shortDescription || undefined, description: f.description || undefined,
      provinceId: provinceId ?? undefined, areaId: areaId ?? undefined, address: f.address || undefined,
      latitude: f.latitude || undefined, longitude: f.longitude || undefined, checkInTime: f.checkInTime || undefined, checkOutTime: f.checkOutTime || undefined,
      basePrice: Number(f.basePrice), depositRate: f.depositRate || undefined, isPeakSeason: peakSeason, cancellationPolicyId: f.cancellationPolicyId || undefined,
      contactPhone: f.contactPhone || undefined, contactEmail: f.contactEmail || undefined, metaTitle: f.metaTitle || undefined, metaDescription: f.metaDescription || undefined,
      amenityIds,
      policies: f.houseRules.split('\n').map((s) => s.trim()).filter(Boolean).map((content) => ({ type: 'HOUSE_RULE', content })),
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setSaving(true)
    try {
      // Giải quyết tỉnh/khu vực: chọn có sẵn -> dùng id; gõ mới -> tự tạo danh mục rồi lấy id.
      const provinceId = await resolveCategoryId(provinceName, meta.provinces, async (n) => {
        const { category } = await adminApi.createHomestayCategory('province', n)
        setMeta((m) => ({ ...m, provinces: [...m.provinces, category] }))
        return category
      })
      const areaId = await resolveCategoryId(areaName, meta.areas, async (n) => {
        const { category } = await adminApi.createHomestayCategory('area', n)
        setMeta((m) => ({ ...m, areas: [...m.areas, category] }))
        return category
      })
      if (isEdit && id) { const { property } = await adminApi.updateHomestay(Number(id), buildPayload(provinceId, areaId)); fill(property); setNotice('Đã lưu thay đổi.') }
      else { const { property } = await adminApi.createHomestay(buildPayload(provinceId, areaId)); navigate(`/admin/homestays/${property.id}/edit`, { replace: true }); return }
    } catch (err) {
      // 5a: lỗi từ máy chủ hiện nguyên thông báo; lỗi fetch bị reject (mất kết nối, máy chủ khởi động lại).
      setError(err instanceof AdminApiError ? err.message : 'Không gửi được yêu cầu đến máy chủ. Kiểm tra kết nối rồi bấm Lưu lại.')
    } finally { setSaving(false) }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !propId) return
    setUploading(true); setError(null)
    try {
      const up = await adminApi.uploadImage(file)
      await adminApi.addImage(propId, up.filename)
      const { property } = await adminApi.getHomestay(propId); setImages(property.images)
    } catch (err) { setError(err instanceof AdminApiError ? err.message : 'Tải ảnh thất bại') }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }
  async function removeImage(imageId: number) {
    if (!propId) return
    await adminApi.removeImage(propId, imageId)
    setImages((prev) => prev.filter((im) => im.id !== imageId))
  }

  const toggleAmenity = (aid: number) => setAmenityIds((prev) => (prev.includes(aid) ? prev.filter((x) => x !== aid) : [...prev, aid]))

  if (!loaded) return <p className="text-slate-500">Đang tải...</p>

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-white">{isEdit ? 'Chỉnh sửa chỗ nghỉ' : 'Thêm chỗ nghỉ mới'}</h1>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <fieldset className="space-y-4">
          <legend className="mb-2 font-semibold text-slate-200">Thông tin cơ bản</legend>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className={label}>Tên chỗ nghỉ *</label><input className={field} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
            <div><label className={label}>Mã</label><input className={field} value={f.propertyCode} onChange={(e) => set('propertyCode', e.target.value)} placeholder="Tự sinh" /></div>
            <div><label className={label}>Slug</label><input className={field} value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="Tự sinh" /></div>
            <div><label className={label}>Loại hình</label>
              <select className={field} value={f.propertyType} onChange={(e) => set('propertyType', e.target.value)}>
                {['HOMESTAY', 'HOTEL', 'VILLA', 'APARTMENT', 'RESORT'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className={label}>Hạng sao</label><input className={field} type="number" min={0} max={5} value={f.starRating} onChange={(e) => set('starRating', e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>Mô tả ngắn</label><input className={field} value={f.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} /></div>
            <CategoryCombo label="Tỉnh/Thành" value={provinceName} onChange={setProvinceName} options={meta.provinces} placeholder="Chọn hoặc gõ tỉnh/thành mới" />
            <CategoryCombo label="Khu vực" value={areaName} onChange={setAreaName} options={meta.areas} placeholder="Chọn hoặc gõ khu vực mới" />

            <div className="col-span-2"><label className={label}>Địa chỉ đầy đủ</label><input className={field} value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div><label className={label}>Vĩ độ (latitude)</label><input className={field} value={f.latitude} onChange={(e) => set('latitude', e.target.value)} /></div>
            <div><label className={label}>Kinh độ (longitude)</label><input className={field} value={f.longitude} onChange={(e) => set('longitude', e.target.value)} /></div>
            <div><label className={label}>Giờ nhận phòng</label><input className={field} value={f.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} placeholder="14:00" /></div>
            <div><label className={label}>Giờ trả phòng</label><input className={field} value={f.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} placeholder="12:00" /></div>
            <div><label className={label}>Điện thoại</label><input className={field} value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></div>
            <div><label className={label}>Email</label><input className={field} value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></div>
            <div className="col-span-2"><label className={label}>Giới thiệu chi tiết</label><textarea className={field} rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
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
                <option value="">— Mặc định —</option>{meta.policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">Tiện nghi</legend>
          <div className="flex flex-wrap gap-2">
            {meta.amenities.map((a) => (
              <label key={a.id} className={`cursor-pointer rounded-lg border px-3 py-1 text-sm ${amenityIds.includes(a.id) ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
                <input type="checkbox" className="mr-1 hidden" checked={amenityIds.includes(a.id)} onChange={() => toggleAmenity(a.id)} />
                {amenityIds.includes(a.id) ? '✓ ' : ''}{a.name}
              </label>
            ))}
          </div>
          <div><label className={label}>Nội quy (mỗi dòng một mục, vd "Xuất trình giấy tờ khi nhận phòng")</label><textarea className={field} rows={2} value={f.houseRules} onChange={(e) => set('houseRules', e.target.value)} /></div>
        </fieldset>

        <fieldset className="space-y-2 border-t border-slate-800 pt-4">
          <legend className="mb-2 font-semibold text-slate-200">SEO</legend>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={label}>Meta title</label><input className={field} value={f.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} /></div>
            <div><label className={label}>Meta description</label><input className={field} value={f.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} /></div>
          </div>
        </fieldset>

        {propId ? (
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
          </div>
        ) : (
          <p className="text-xs text-slate-500">Lưu chỗ nghỉ trước để tải ảnh và quản lý loại phòng/tồn kho.</p>
        )}

        {error && <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">⚠️ {error}</div>}
        {notice && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">✓ {notice}</div>}
        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo chỗ nghỉ'}</button>
      </form>

      {propId && <RoomTypesEditor propertyId={propId} roomTypes={roomTypes} onChange={setRoomTypes} />}
    </div>
  )
}

// Quản lý loại phòng inline.
function RoomTypesEditor({ propertyId, roomTypes, onChange }: { propertyId: number; roomTypes: AdminRoomType[]; onChange: (r: AdminRoomType[]) => void }) {
  const [name, setName] = useState('')
  const [maxOcc, setMaxOcc] = useState('2')
  const [totalRooms, setTotalRooms] = useState('1')
  const [price, setPrice] = useState('')
  const [bedType, setBedType] = useState('')
  const [breakfast, setBreakfast] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const { property } = await adminApi.getHomestay(propertyId)
    onChange(property.roomTypes)
  }
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    try {
      await adminApi.createRoomType(propertyId, { name, maxOccupancy: Number(maxOcc), totalRooms: Number(totalRooms), basePricePerNight: Number(price), bedType, breakfastIncluded: breakfast })
      setName(''); setPrice(''); setBedType(''); setBreakfast(false); await refresh()
    } catch (err) { setError(err instanceof AdminApiError ? err.message : 'Thêm loại phòng thất bại') }
  }
  async function remove(rt: AdminRoomType) {
    setError(null)
    try { await adminApi.deleteRoomType(propertyId, rt.id); await refresh() }
    catch (err) { setError(err instanceof AdminApiError ? err.message : 'Xóa thất bại') }
  }

  const cell = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100'
  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
      <h2 className="mb-3 font-semibold text-slate-200">Loại phòng</h2>
      {error && <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">⚠️ {error}</div>}
      {roomTypes.length > 0 && (
        <table className="mb-4 block w-full overflow-x-auto text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-1 pr-3">Tên</th><th className="py-1 pr-3">Giường</th><th className="py-1 pr-3">Sức chứa</th><th className="py-1 pr-3">Số phòng</th><th className="py-1 pr-3">Giá/đêm</th><th></th></tr></thead>
          <tbody>
            {roomTypes.map((rt) => (
              <tr key={rt.id} className="border-t border-slate-800 text-slate-300">
                <td className="py-1 pr-3">{rt.name}</td>
                <td className="py-1 pr-3">{rt.bedType || '-'}</td>
                <td className="py-1 pr-3">{rt.maxOccupancy}</td>
                <td className="py-1 pr-3">{rt.totalRooms}</td>
                <td className="py-1 pr-3">{rt.basePricePerNight.toLocaleString('vi-VN')}₫</td>
                <td className="py-1"><button onClick={() => remove(rt)} className="text-red-400 hover:underline">Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <input className={`${cell} w-40`} placeholder="Tên loại phòng *" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={`${cell} w-36`} placeholder="Giường" value={bedType} onChange={(e) => setBedType(e.target.value)} />
        <input className={`${cell} w-24`} type="number" min={1} placeholder="Sức chứa" value={maxOcc} onChange={(e) => setMaxOcc(e.target.value)} />
        <input className={`${cell} w-24`} type="number" min={1} placeholder="Số phòng" value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} />
        <input className={`${cell} w-32`} type="number" min={0} placeholder="Giá/đêm" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={breakfast} onChange={(e) => setBreakfast(e.target.checked)} />Kèm sáng</label>
        <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Thêm</button>
      </form>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminRoomType, type InventoryDay } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'
const todayStr = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

type Conflict = { message: string; conflictDates: string[]; bookings: { code: string; checkIn: string; checkOut: string; status: string }[] }

// UC-16 – Lịch tồn phòng theo LOẠI PHÒNG: mở/chặn khoảng ngày + giá riêng (BR-74/26).
export function AdminHomestayCalendarPage() {
  const { id } = useParams<{ id: string }>()
  const propertyId = Number(id)

  const [roomTypes, setRoomTypes] = useState<AdminRoomType[]>([])
  const [rtId, setRtId] = useState<number | null>(null)
  const [propName, setPropName] = useState('')

  const [rangeFrom, setRangeFrom] = useState(todayStr())
  const [rangeTo, setRangeTo] = useState(plusDays(14))
  const [calendar, setCalendar] = useState<InventoryDay[]>([])
  const [basePrice, setBasePrice] = useState(0)
  const [loading, setLoading] = useState(true)

  const [applyFrom, setApplyFrom] = useState(todayStr())
  const [applyTo, setApplyTo] = useState(plusDays(1))
  const [totalRooms, setTotalRooms] = useState('5')
  const [priceOverride, setPriceOverride] = useState('')
  const [isBlocked, setIsBlocked] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    adminApi.getHomestay(propertyId).then(({ property }) => {
      setPropName(property.name)
      setRoomTypes(property.roomTypes)
      setRtId(property.roomTypes[0]?.id ?? null)
    })
  }, [propertyId])

  const load = useCallback(() => {
    if (!rtId) { setLoading(false); return }
    setLoading(true)
    adminApi
      .getInventory(propertyId, rtId, rangeFrom, rangeTo)
      .then((r) => { setCalendar(r.calendar); setBasePrice(r.basePrice) })
      .finally(() => setLoading(false))
  }, [propertyId, rtId, rangeFrom, rangeTo])

  useEffect(() => { load() }, [load])

  async function applyRange(e: React.FormEvent) {
    e.preventDefault()
    if (!rtId) return
    setError(null); setConflict(null); setSuccess(null); setApplying(true)
    try {
      await adminApi.setInventory(propertyId, rtId, { from: applyFrom, to: applyTo, totalRooms: Number(totalRooms), priceOverride: priceOverride ? Number(priceOverride) : null, isBlocked })
      setSuccess('Đã cập nhật lịch tồn phòng.')
      load()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) { setConflict((err.body as Conflict) ?? null); setError(err.message) }
      else setError(err instanceof AdminApiError ? err.message : 'Cập nhật thất bại')
    } finally { setApplying(false) }
  }

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500">
        <Link to="/admin/homestays" className="hover:text-emerald-400">Chỗ nghỉ</Link> / Lịch tồn phòng
      </nav>
      <h1 className="mb-2 text-2xl font-bold text-white">Lịch tồn phòng — {propName}</h1>

      <div className="mb-6">
        <label className="mr-2 text-sm text-slate-400">Loại phòng:</label>
        <select className={field} value={rtId ?? ''} onChange={(e) => setRtId(Number(e.target.value))}>
          {roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        {roomTypes.length === 0 && <span className="ml-2 text-sm text-amber-400">Chưa có loại phòng — hãy thêm ở trang chỉnh sửa.</span>}
      </div>

      <form onSubmit={applyRange} className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Áp dụng cho một khoảng ngày</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">Từ ngày<input className={field} type="date" value={applyFrom} onChange={(e) => setApplyFrom(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Đến ngày (không tính)<input className={field} type="date" value={applyTo} onChange={(e) => setApplyTo(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Số phòng mở bán<input className={`${field} w-32`} type="number" min={0} value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">Giá riêng (trống = {basePrice.toLocaleString('vi-VN')}đ)<input className={`${field} w-44`} type="number" min={0} value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} /></label>
          <label className="flex items-center gap-1 text-xs text-slate-400"><input type="checkbox" checked={isBlocked} onChange={(e) => setIsBlocked(e.target.checked)} />Chặn ngày (bảo trì)</label>
          <button type="submit" disabled={applying || !rtId} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{applying ? 'Đang áp dụng...' : 'Áp dụng'}</button>
        </div>
        {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <p>⚠️ {error}</p>
            {conflict && conflict.bookings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {conflict.bookings.map((b) => (
                  <li key={b.code}>Đơn <span className="font-mono">{b.code}</span> ({new Date(b.checkIn).toLocaleDateString('vi-VN')} → {new Date(b.checkOut).toLocaleDateString('vi-VN')}) — xử lý ở Quản lý đơn hàng trước.</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <div className="mb-3 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">Xem từ<input className={field} type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">Đến<input className={field} type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></label>
      </div>

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-950 text-left text-slate-400">
              <tr><th className="px-4 py-2">Ngày</th><th className="px-4 py-2">Tổng phòng</th><th className="px-4 py-2">Đã đặt</th><th className="px-4 py-2">Còn</th><th className="px-4 py-2">Giá riêng</th><th className="px-4 py-2">Trạng thái</th></tr>
            </thead>
            <tbody>
              {calendar.map((c) => (
                <tr key={c.date} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-slate-200">{new Date(c.date).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-2 text-slate-400">{c.totalRooms}</td>
                  <td className="px-4 py-2 text-slate-400">{c.bookedRooms}</td>
                  <td className={`px-4 py-2 ${c.totalRooms - c.bookedRooms - c.heldRooms <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>{c.totalRooms - c.bookedRooms - c.heldRooms}</td>
                  <td className="px-4 py-2 text-slate-400">{c.priceOverride != null ? `${c.priceOverride.toLocaleString('vi-VN')}đ` : <span className="text-slate-600">giá cơ bản</span>}</td>
                  <td className="px-4 py-2">{c.isBlocked ? <span className="text-red-400">Đã chặn</span> : <span className="text-slate-500">Mở</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

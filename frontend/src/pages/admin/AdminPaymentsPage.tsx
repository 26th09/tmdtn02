import { useEffect, useState } from 'react'
import { AdminApiError, adminApi } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'

const field = 'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-slate-400'

// Trang quản lý phương thức thanh toán + phí hủy theo ngày + thuế GTGT (gom kiểu WooCommerce Settings → Payments/Tax).
export function AdminPaymentsPage() {
  const { admin } = useAdminAuth()
  const isSuper = admin?.role === 'SUPER_ADMIN'
  const [form, setForm] = useState<Record<string, string>>({})
  const [vnpay, setVnpay] = useState(true)
  const [payDep, setPayDep] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminApi
      .getSystemConfig()
      .then(({ config: c }) => {
        setForm({
          depositRatePercent: String(c.depositRatePercent),
          payOnDepartureMinHours: String(c.payOnDepartureMinHours ?? 48),
          cancelFreeHours: String(c.cancelFreeHours),
          cancelTier1Days: String(c.cancelTier1Days), cancelTier1Ratio: String(c.cancelTier1Ratio),
          cancelTier2Days: String(c.cancelTier2Days), cancelTier2Ratio: String(c.cancelTier2Ratio),
          cancelTier3Days: String(c.cancelTier3Days ?? 1), cancelTier3Ratio: String(c.cancelTier3Ratio ?? 20),
          vatPercent: String(c.vatPercent ?? 8),
          fullPaymentHoursBeforeStart: String(c.fullPaymentHoursBeforeStart ?? 1),
          codDueDays: String(c.codDueDays ?? 7),
        })
        setVnpay(c.vnpayEnabled)
        setPayDep(c.payOnDepartureEnabled)
      })
      .catch(() => setError('Không tải được cấu hình'))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null); setSaving(true)
    try {
      const payload: Record<string, unknown> = { vnpayEnabled: vnpay, payOnDepartureEnabled: payDep }
      for (const k of Object.keys(form)) payload[k] = Number(form[k])
      await adminApi.updateSystemConfig(payload)
      setInfo('Đã lưu cấu hình thanh toán.')
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-slate-500">Đang tải...</p>

  const refundOf = (k: string) => Number(form[k] || 0)

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Phương thức thanh toán & Phí</h1>
      {!isSuper && <p className="text-sm text-amber-400">Chỉ SUPER_ADMIN mới được chỉnh — bạn đang ở chế độ xem.</p>}
      {error && <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}
      {info && <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{info}</div>}

      {/* Phương thức thanh toán */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Phương thức thanh toán</h2>
        <div className="space-y-3">
          <Method
            name="VNPAY (cổng online)"
            desc="Thẻ ATM / QR / thẻ quốc tế — xác nhận tự động."
            enabled={vnpay}
            onToggle={() => isSuper && setVnpay((v) => !v)}
            disabled={!isSuper}
          />
          <Method
            name="Trả sau khi đi tour (Pay on Departure)"
            desc="Giữ chỗ, thanh toán trực tiếp cho HDV vào ngày đi. Điều hành gọi xác nhận."
            enabled={payDep}
            onToggle={() => isSuper && setPayDep((v) => !v)}
            disabled={!isSuper}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label><span className={label}>Tỷ lệ đặt cọc (%)</span><input className={field} type="number" min={1} max={100} disabled={!isSuper} value={form.depositRatePercent || ''} onChange={(e) => set('depositRatePercent', e.target.value)} /></label>
          <label><span className={label}>"Trả sau" tối thiểu còn (giờ)</span><input className={field} type="number" min={0} disabled={!isSuper} value={form.payOnDepartureMinHours || ''} onChange={(e) => set('payOnDepartureMinHours', e.target.value)} /></label>
        </div>
      </section>

      {/* Phí hủy theo ngày */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-1 font-semibold text-slate-200">Phí hủy theo ngày</h2>
        <p className="mb-3 text-xs text-slate-500">Mô hình bậc thang như các sàn lớn (Booking/Agoda/Klook): hủy càng sát ngày, hoàn càng ít (phí hủy càng cao). Phí hủy = 100% − tỷ lệ hoàn.</p>
        <label className="mb-3 block max-w-xs"><span className={label}>Miễn phí hủy trong (giờ đầu sau khi đặt)</span><input className={field} type="number" min={0} disabled={!isSuper} value={form.cancelFreeHours || ''} onChange={(e) => set('cancelFreeHours', e.target.value)} /></label>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400">
              <tr><th className="px-3 py-2">Mốc</th><th className="px-3 py-2">Hủy trước ≥ (ngày)</th><th className="px-3 py-2">Hoàn (%)</th><th className="px-3 py-2">Phí hủy</th></tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((n) => (
                <tr key={n} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-400">Mức {n}</td>
                  <td className="px-3 py-2"><input className={`${field} w-24`} type="number" min={0} disabled={!isSuper} value={form[`cancelTier${n}Days`] || ''} onChange={(e) => set(`cancelTier${n}Days`, e.target.value)} /></td>
                  <td className="px-3 py-2"><input className={`${field} w-24`} type="number" min={0} max={100} disabled={!isSuper} value={form[`cancelTier${n}Ratio`] || ''} onChange={(e) => set(`cancelTier${n}Ratio`, e.target.value)} /></td>
                  <td className="px-3 py-2 text-amber-300">{100 - refundOf(`cancelTier${n}Ratio`)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Hủy sát hơn mốc cuối (dưới {form.cancelTier3Days || 1} ngày): không hoàn (phí hủy 100%). Mốc ngày phải giảm dần từ mức 1 → 3.</p>
      </section>

      {/* Thuế & hạn thanh toán */}
      <section className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="mb-3 font-semibold text-slate-200">Thuế GTGT & hạn thanh toán</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label><span className={label}>Thuế GTGT / VAT (%)</span><input className={field} type="number" min={0} max={100} disabled={!isSuper} value={form.vatPercent || ''} onChange={(e) => set('vatPercent', e.target.value)} /></label>
          <label><span className={label}>Hạn trả đủ trước đi/checkin (giờ)</span><input className={field} type="number" min={0} disabled={!isSuper} value={form.fullPaymentHoursBeforeStart || ''} onChange={(e) => set('fullPaymentHoursBeforeStart', e.target.value)} /></label>
          <label><span className={label}>Hạn thu "Trả sau" (ngày)</span><input className={field} type="number" min={1} disabled={!isSuper} value={form.codDueDays || ''} onChange={(e) => set('codDueDays', e.target.value)} /></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Giá niêm yết đã gồm VAT. VAT dùng để tách doanh thu "sau thuế" + "thuế" trong báo cáo và xuất hóa đơn.</p>
      </section>

      {isSuper && (
        <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      )}
    </form>
  )
}

function Method({ name, desc, enabled, onToggle, disabled }: { name: string; desc: string; enabled: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-slate-200">{name}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
        aria-pressed={enabled}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

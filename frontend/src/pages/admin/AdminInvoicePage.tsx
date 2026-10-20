import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminApi, type AdminOrderDetail, type AdminSystemConfig } from '../../lib/adminApi'

const fmt = (n: number) => (n || 0).toLocaleString('vi-VN') + '₫'
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—')

// Thông tin StayTour mặc định (dùng khi cấu hình người bán chưa điền).
const SELLER = {
  name: 'StayTour',
  address: 'VP làm việc: Đại học Phenikaa, Hà Nội',
  phone: '0784369189',
  email: '23010221@st.phenikaa-uni.edu.vn',
}

// Hóa đơn GTGT (VAT) in được cho một đơn. Giá đã gồm VAT -> tách phần chưa VAT + thuế.
export function AdminInvoicePage() {
  const { code } = useParams<{ code: string }>()
  const [order, setOrder] = useState<AdminOrderDetail | null>(null)
  const [config, setConfig] = useState<AdminSystemConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    Promise.all([adminApi.getOrder(code), adminApi.getSystemConfig()])
      .then(([o, c]) => {
        setOrder(o.order)
        setConfig(c.config)
      })
      .catch(() => setError('Không tải được dữ liệu hóa đơn'))
  }, [code])

  if (error) return <p className="p-6 text-red-600">{error}</p>
  if (!order || !config) return <p className="p-6 text-slate-500">Đang tải...</p>

  const vat = config.vatPercent || 0
  const grossAfterDiscount = order.payable // đã gồm VAT, sau giảm giá
  const tax = vat > 0 ? Math.round((grossAfterDiscount * vat) / (100 + vat)) : 0
  const net = grossAfterDiscount - tax
  const qty = order.type === 'TOUR' ? order.guests + order.children : order.nights || 1
  const unit = qty > 0 ? Math.round(order.totalPrice / qty) : order.totalPrice

  return (
    <div className="mx-auto max-w-3xl p-6">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/admin/orders/${order.code}`} className="text-sm text-emerald-600 hover:underline">← Về chi tiết đơn</Link>
        <button onClick={() => window.print()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          🖨 In / Lưu PDF
        </button>
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-800">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">HÓA ĐƠN GTGT</h1>
            <p className="text-sm text-slate-500">(VAT Invoice)</p>
          </div>
          <div className="text-right text-sm">
            <p>Số HĐ: <strong>{order.code}</strong></p>
            <p>Ngày: {fmtDate(order.createdAt)}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 font-semibold text-slate-500">ĐƠN VỊ BÁN</p>
            <p className="font-medium">{config.sellerName || SELLER.name}</p>
            <p>{config.sellerAddress || SELLER.address}</p>
            <p>Hotline: {config.sellerPhone || SELLER.phone}</p>
            <p>Email: {config.sellerEmail || SELLER.email}</p>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-500">KHÁCH HÀNG</p>
            <p className="font-medium">{order.guestName}</p>
            <p>ĐT: {order.guestPhone}</p>
            <p>Email: {order.guestEmail}</p>
          </div>
        </div>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 text-left">
              <th className="py-2 pr-2">Mô tả</th>
              <th className="py-2 px-2 text-right">SL</th>
              <th className="py-2 px-2 text-right">Đơn giá</th>
              <th className="py-2 pl-2 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-2 pr-2">
                {order.productName} ({order.type === 'HOMESTAY' ? 'Homestay' : 'Tour'})
                <div className="text-xs text-slate-500">
                  {order.type === 'TOUR' ? `Khởi hành ${fmtDate(order.checkIn)}` : `${fmtDate(order.checkIn)} → ${fmtDate(order.checkOut)}`}
                </div>
              </td>
              <td className="py-2 px-2 text-right">{qty}</td>
              <td className="py-2 px-2 text-right">{fmt(unit)}</td>
              <td className="py-2 pl-2 text-right">{fmt(order.totalPrice)}</td>
            </tr>
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <Line label="Tổng tiền hàng" value={fmt(order.totalPrice)} />
          {order.discountCode && <Line label={`Giảm giá (${order.discountCode})`} value={`-${fmt(order.discountAmount)}`} />}
          <Line label="Tiền chưa thuế" value={fmt(net)} />
          <Line label={`Thuế GTGT (${vat}%)`} value={fmt(tax)} />
          <div className="flex justify-between border-t border-slate-300 pt-1 text-base font-bold">
            <span>TỔNG THANH TOÁN</span>
            <span>{fmt(grossAfterDiscount)}</span>
          </div>
          <Line label="Đã thanh toán" value={fmt(order.paidAmount)} />
          {order.outstanding > 0 && <Line label="Còn phải thu" value={fmt(order.outstanding)} />}
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Giá niêm yết đã bao gồm thuế GTGT. Hóa đơn phục vụ mục đích nội bộ/đối chiếu; mức thuế theo cấu hình hệ thống.
        </p>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  )
}

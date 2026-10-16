import { Link } from 'react-router-dom'
import { useAdminAuth } from '../../lib/adminAuth'

// Trang tổng quan sau khi đăng nhập khu vực quản trị.
const SHORTCUTS: { to: string; icon: string; title: string; desc: string }[] = [
  { to: '/admin/homestays', icon: '⌂', title: 'Homestay', desc: 'Quản lý chỗ nghỉ & lịch tồn phòng' },
  { to: '/admin/tours', icon: '✈', title: 'Tour', desc: 'Quản lý tour & ngày khởi hành' },
  { to: '/admin/orders', icon: '🧾', title: 'Đơn hàng', desc: 'Xử lý đơn, hủy & hoàn tiền' },
  { to: '/admin/discounts', icon: '％', title: 'Mã khuyến mại', desc: 'Tạo & quản lý ưu đãi' },
  { to: '/admin/reviews', icon: '★', title: 'Đánh giá', desc: 'Xem & phản hồi đánh giá của khách' },
  { to: '/admin/reports', icon: '📊', title: 'Báo cáo', desc: 'Thống kê doanh thu & hoạt động' },
  { to: '/admin/users', icon: '☺', title: 'Người dùng', desc: 'Quản lý tài khoản & phân quyền' },
  { to: '/admin/settings', icon: '⚙', title: 'Cấu hình', desc: 'Thiết lập hệ thống & nhật ký' },
]

export function AdminDashboardPage() {
  const { admin } = useAdminAuth()

  return (
    <div>
      {/* Lời chào */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-emerald-900/40 to-slate-900 p-6">
        <h2 className="text-2xl font-semibold text-white">Xin chào, {admin?.name || admin?.username} 👋</h2>
        <p className="mt-1.5 text-slate-300">
          Bạn đang đăng nhập với quyền{' '}
          <span className="font-medium text-emerald-400">
            {admin?.role === 'SUPER_ADMIN' ? 'Toàn quyền (Super Admin)' : 'Quản lý (Manager)'}
          </span>
          . Chọn một khu vực bên dưới để bắt đầu.
        </p>
      </div>

      {/* Truy cập nhanh */}
      <h3 className="mt-8 mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Truy cập nhanh</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-emerald-500/60 hover:bg-slate-800/60"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/15 text-xl text-emerald-300 transition group-hover:bg-emerald-500/25">
              {s.icon}
            </span>
            <p className="mt-3 font-semibold text-white">{s.title}</p>
            <p className="mt-1 text-sm text-slate-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

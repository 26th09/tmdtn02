import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../lib/adminAuth'
import { adminApi } from '../lib/adminApi'

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Toàn quyền',
  MANAGER: 'Quản lý',
}

// Cấu trúc menu quản trị theo nhóm chức năng.
const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string; end?: boolean; superOnly?: boolean }[] }[] = [
  {
    title: 'Tổng quan',
    items: [{ to: '/admin', label: 'Bảng điều khiển', icon: '▦', end: true }],
  },
  {
    title: 'Kinh doanh',
    items: [
      { to: '/admin/homestays', label: 'Homestay', icon: '⌂' },
      { to: '/admin/tours', label: 'Tour', icon: '✈' },
      { to: '/admin/guides', label: 'Cẩm nang du lịch', icon: '❏' },
      { to: '/admin/orders', label: 'Đơn hàng', icon: '🧾' },
      { to: '/admin/discounts', label: 'Mã khuyến mại', icon: '％' },
      { to: '/admin/promotions', label: 'Chương trình khuyến mại', icon: '🎁' },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { to: '/admin/reviews', label: 'Báo cáo và quản lý phản hồi của khách hàng', icon: '★' },
      { to: '/admin/reports', label: 'Báo cáo & thống kê', icon: '📊' },
      { to: '/admin/users', label: 'Người dùng', icon: '☺' },
      { to: '/admin/admins', label: 'Tài khoản quản trị', icon: '🔑', superOnly: true },
      { to: '/admin/settings', label: 'Cấu hình hệ thống', icon: '⚙' },
    ],
  },
]

// Nhãn tiêu đề trang theo đường dẫn hiện tại.
const TITLES: { prefix: string; label: string }[] = [
  { prefix: '/admin/homestays', label: 'Quản lý Homestay' },
  { prefix: '/admin/tours', label: 'Quản lý Tour' },
  { prefix: '/admin/guides', label: 'Cẩm nang du lịch' },
  { prefix: '/admin/orders', label: 'Quản lý đơn hàng' },
  { prefix: '/admin/discounts', label: 'Mã khuyến mại' },
  { prefix: '/admin/promotions', label: 'Chương trình khuyến mại' },
  { prefix: '/admin/reviews', label: 'Báo cáo và quản lý phản hồi của khách hàng' },
  { prefix: '/admin/reports', label: 'Báo cáo & thống kê' },
  { prefix: '/admin/users', label: 'Quản lý người dùng' },
  { prefix: '/admin/admins', label: 'Quản lý tài khoản quản trị' },
  { prefix: '/admin/settings', label: 'Cấu hình hệ thống' },
]

export function AdminLayout() {
  const { admin, logout } = useAdminAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Menu mobile cho khu vực quản trị.
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Nhắc hạn mật khẩu: lấy số ngày còn lại (hiển thị banner khi <= 7 ngày).
  const [pwDaysLeft, setPwDaysLeft] = useState<number | null>(null)
  useEffect(() => {
    adminApi.me().then((r) => setPwDaysLeft(r.password?.daysLeft ?? null)).catch(() => {})
  }, [])

  const pageTitle = TITLES.find((t) => pathname.startsWith(t.prefix))?.label ?? 'Bảng điều khiển'
  const initials = (admin?.name || admin?.username || 'A').charAt(0).toUpperCase()

  // Danh sách điều hướng dùng chung cho sidebar (desktop) và drawer (mobile).
  const navList = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
          <div className="space-y-1">
            {group.items.filter((item) => !item.superOnly || admin?.role === 'SUPER_ADMIN').map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 shadow-[inset_2px_0_0_0] shadow-emerald-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <span className="w-5 text-center text-base">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-800 bg-slate-900 lg:flex">
          <Link to="/admin" className="flex items-center gap-2.5 border-b border-slate-800 px-6 py-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-base font-bold text-slate-900">S</span>
            <span className="text-lg font-semibold text-white">StayTour <span className="text-emerald-400">Admin</span></span>
          </Link>

          {navList}

          <div className="border-t border-slate-800 p-3">
            <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white">
              <span className="w-5 text-center">↩</span> Về trang khách hàng
            </Link>
          </div>
        </aside>

        {/* ── Drawer điều hướng cho mobile ── */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                <Link to="/admin" className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500 text-base font-bold text-slate-900">S</span>
                  <span className="text-lg font-semibold text-white">StayTour <span className="text-emerald-400">Admin</span></span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Đóng menu"
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              </div>
              {navList}
              <div className="border-t border-slate-800 p-3">
                <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white">
                  <span className="w-5 text-center">↩</span> Về trang khách hàng
                </Link>
              </div>
            </aside>
          </div>
        )}

        {/* ── Nội dung ── */}
        <div className="min-h-screen flex-1 lg:ml-64">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3.5 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Mở menu"
                aria-expanded={menuOpen}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-slate-800 lg:hidden"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-white">{pageTitle}</h1>
                <p className="text-xs text-slate-500">Khu vực quản trị</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-2.5 sm:flex">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-300">
                  {initials}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-medium text-slate-100">{admin?.name || admin?.username}</p>
                  <p className="text-xs text-slate-500">{admin ? ROLE_LABEL[admin.role] : ''}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  logout()
                  navigate('/admin/login')
                }}
                className="rounded-lg border border-slate-700 px-3.5 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                Đăng xuất
              </button>
            </div>
          </header>
          <main className="p-6">
            {pwDaysLeft != null && pwDaysLeft <= 7 && (
              <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
                🔐 Mật khẩu quản trị của bạn {pwDaysLeft <= 0 ? 'đã hết hạn' : `sẽ hết hạn trong ${pwDaysLeft} ngày`}. Vui lòng đổi mật khẩu để tránh gián đoạn (chính sách: đổi mỗi 30 ngày).
              </div>
            )}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { AdminAuthProvider } from './lib/adminAuth'
import { FavoritesProvider } from './lib/favorites'
import { Layout } from './components/Layout'
import { AdminLayout } from './components/AdminLayout'
import { RequireAuth } from './components/RequireAuth'
import { RequireAdminAuth } from './components/RequireAdminAuth'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminActivatePage } from './pages/admin/AdminActivatePage'
import { AdminForgotPasswordPage, AdminResetPasswordPage } from './pages/admin/AdminPasswordResetPages'
import { AdminAccountsPage } from './pages/admin/AdminAccountsPage'
import { AdminContactsPage } from './pages/admin/AdminContactsPage'
import { AdminServiceGroupsPage } from './pages/admin/AdminServiceGroupsPage'
import { ContactPage } from './pages/ContactPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminHomestaysPage } from './pages/admin/AdminHomestaysPage'
import { AdminHomestayFormPage } from './pages/admin/AdminHomestayFormPage'
import { AdminHomestayCalendarPage } from './pages/admin/AdminHomestayCalendarPage'
import { AdminToursPage } from './pages/admin/AdminToursPage'
import { AdminTourFormPage } from './pages/admin/AdminTourFormPage'
import { AdminTourDeparturesPage } from './pages/admin/AdminTourDeparturesPage'
import { AdminGuidesPage } from './pages/admin/AdminGuidesPage'
import { AdminGuideFormPage } from './pages/admin/AdminGuideFormPage'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage'
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage'
import { AdminInvoicePage } from './pages/admin/AdminInvoicePage'
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminDiscountsPage } from './pages/admin/AdminDiscountsPage'
import { AdminPromotionsPage } from './pages/admin/AdminPromotionsPage'
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage'
import { AdminReportsPage } from './pages/admin/AdminReportsPage'
import { AdminConfigPage } from './pages/admin/AdminConfigPage'
import { CategoryPage } from './pages/CategoryPage'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { TourDetailPage } from './pages/TourDetailPage'
import { InfoArticlePage, InfoIndexPage } from './pages/InfoPages'
import { HomestayListPage, TourListPage } from './pages/CatalogListPages'
import { GuideDetailPage, GuideListPage } from './pages/GuidePages'
import { AboutPage } from './pages/AboutPage'
import { RegisterPage } from './pages/RegisterPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages'
import { ProfilePage } from './pages/ProfilePage'
import { WishlistPage } from './pages/WishlistPage'
import { BookingPage } from './pages/BookingPage'
import { PaymentResultPage } from './pages/PaymentResultPage'
import { OrderDetailPage, OrdersPage } from './pages/OrdersPage'
import { TrackOrderPage } from './pages/TrackOrderPage'
import { ReviewPage } from './pages/ReviewPage'
import { NotFoundPage } from './pages/Placeholders'

function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <AdminAuthProvider>
          <BrowserRouter>
            <Routes>
        {/* Nhóm D – Khu vực quản trị (/admin), hoàn toàn tách biệt với website chính:
            provider, layout và guard riêng, không dùng chung với Route element={<Layout />} bên dưới. */}
        <Route path="admin/login" element={<AdminLoginPage />} />
        <Route path="admin/activate" element={<AdminActivatePage />} />
        <Route path="admin/forgot-password" element={<AdminForgotPasswordPage />} />
        <Route path="admin/reset-password" element={<AdminResetPasswordPage />} />
        <Route
          path="admin/*"
          element={
            <RequireAdminAuth>
              <AdminLayout />
            </RequireAdminAuth>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          {/* UC-16 – Quản lý homestay & lịch tồn phòng */}
          <Route path="homestays" element={<AdminHomestaysPage />} />
          <Route path="homestays/new" element={<AdminHomestayFormPage />} />
          <Route path="homestays/:id/edit" element={<AdminHomestayFormPage />} />
          <Route path="homestays/:id/calendar" element={<AdminHomestayCalendarPage />} />
          {/* UC-17 – Quản lý tour & ngày khởi hành */}
          <Route path="tours" element={<AdminToursPage />} />
          <Route path="tours/new" element={<AdminTourFormPage />} />
          <Route path="tours/:id/edit" element={<AdminTourFormPage />} />
          <Route path="tours/:id/departures" element={<AdminTourDeparturesPage />} />
          {/* Quản lý cẩm nang du lịch */}
          <Route path="guides" element={<AdminGuidesPage />} />
          <Route path="guides/new" element={<AdminGuideFormPage />} />
          <Route path="guides/:id/edit" element={<AdminGuideFormPage />} />
          {/* UC-18 – Quản lý đơn & xử lý hủy/hoàn tiền */}
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="orders/:code" element={<AdminOrderDetailPage />} />
          <Route path="orders/:code/invoice" element={<AdminInvoicePage />} />
          {/* UC-19 – Quản lý người dùng & phân quyền */}
          <Route path="users" element={<AdminUsersPage />} />
          {/* UC-20 – Quản lý mã khuyến mại */}
          <Route path="discounts" element={<AdminDiscountsPage />} />
          {/* Quản lý chương trình khuyến mại (banner trang chủ) */}
          <Route path="promotions" element={<AdminPromotionsPage />} />
          {/* UC-21 – Kiểm duyệt đánh giá */}
          <Route path="reviews" element={<AdminReviewsPage />} />
          {/* UC-22 – Báo cáo & thống kê */}
          <Route path="reports" element={<AdminReportsPage />} />
          {/* Quản lý tài khoản quản trị (SUPER_ADMIN) */}
          <Route path="admins" element={<AdminAccountsPage />} />
          {/* Chăm sóc khách hàng / liên hệ */}
          <Route path="contacts" element={<AdminContactsPage />} />
          {/* Nhóm dịch vụ (cây phân cấp) */}
          <Route path="service-groups" element={<AdminServiceGroupsPage />} />
          {/* Phương thức thanh toán & phí & thuế */}
          <Route path="payments" element={<AdminPaymentsPage />} />
          {/* UC-23 – Cấu hình hệ thống & nhật ký */}
          <Route path="settings" element={<AdminConfigPage />} />
        </Route>

        <Route element={<Layout />}>
          {/* UC-01 – Duyệt trang chủ & danh mục */}
          <Route index element={<HomePage />} />
          <Route path="category/:slug" element={<CategoryPage />} />
          {/* Điều hướng sang các use case khác của Nhóm A */}
          <Route path="search" element={<SearchPage />} />
          {/* Trang danh sách Homestay / Tour riêng */}
          <Route path="homestays" element={<HomestayListPage />} />
          <Route path="tours" element={<TourListPage />} />
          {/* Cẩm nang du lịch */}
          <Route path="guides" element={<GuideListPage />} />
          <Route path="guides/:slug" element={<GuideDetailPage />} />
          {/* Giới thiệu website */}
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          {/* UC-03 – Xem chi tiết & tình trạng còn trống */}
          <Route path="product/:slug" element={<ProductDetailPage />} />
          {/* UC-03 – Chi tiết tour (bảng riêng) */}
          <Route path="tour/:slug" element={<TourDetailPage />} />
          {/* UC-09/10 – Đặt homestay/tour (hỗ trợ guest checkout) + UC-11 thanh toán */}
          <Route path="booking/:slug" element={<BookingPage />} />
          <Route path="payment-result" element={<PaymentResultPage />} />
          {/* UC-04 – Xem thông tin & chính sách */}
          <Route path="info" element={<InfoIndexPage />} />
          <Route path="info/:slug" element={<InfoArticlePage />} />
          {/* UC-05 – Đăng ký tài khoản & xác thực email */}
          <Route path="register" element={<RegisterPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          {/* UC-06 – Đăng nhập / quên & đặt lại mật khẩu */}
          <Route path="login" element={<LoginPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          {/* UC-07 – Quản lý hồ sơ (cần đăng nhập) */}
          <Route
            path="profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          {/* UC-08 – Danh sách yêu thích (cần đăng nhập) */}
          <Route
            path="favorites"
            element={
              <RequireAuth>
                <WishlistPage />
              </RequireAuth>
            }
          />
          {/* UC-13 – Tra cứu & theo dõi đơn: "Đơn của tôi" (Customer) + tra cứu Guest */}
          <Route
            path="orders"
            element={
              <RequireAuth>
                <OrdersPage />
              </RequireAuth>
            }
          />
          <Route
            path="orders/:code"
            element={
              <RequireAuth>
                <OrderDetailPage />
              </RequireAuth>
            }
          />
          <Route path="track" element={<TrackOrderPage />} />
          {/* UC-15 – Guest đánh giá qua liên kết token trong email */}
          <Route path="review" element={<ReviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
            </Routes>
          </BrowserRouter>
        </AdminAuthProvider>
      </FavoritesProvider>
    </AuthProvider>
  )
}

export default App

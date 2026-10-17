import cors from 'cors'
import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import { UPLOAD_DIR } from './lib/uploads.js'
import adminAuthRoutes from './routes/adminAuth.routes.js'
import adminHomestaysRoutes from './routes/admin/homestays.routes.js'
import adminToursRoutes from './routes/admin/tours.routes.js'
import adminOrdersRoutes from './routes/admin/orders.routes.js'
import adminUsersRoutes from './routes/admin/users.routes.js'
import adminDiscountsRoutes from './routes/admin/discounts.routes.js'
import adminReviewsRoutes from './routes/admin/reviews.routes.js'
import adminReportsRoutes from './routes/admin/reports.routes.js'
import adminConfigRoutes from './routes/admin/config.routes.js'
import adminGuidesRoutes from './routes/admin/travelGuides.routes.js'
import adminPromotionsRoutes from './routes/admin/promotions.routes.js'
import adminAdminsRoutes from './routes/admin/admins.routes.js'
import authRoutes from './routes/auth.routes.js'
import bookingsRoutes from './routes/bookings.routes.js'
import catalogRoutes from './routes/catalog.routes.js'
import discountsRoutes from './routes/discounts.routes.js'
import favoritesRoutes from './routes/favorites.routes.js'
import infoRoutes from './routes/info.routes.js'
import ordersRoutes from './routes/orders.routes.js'
import paymentsRoutes from './routes/payments.routes.js'
import reviewsRoutes from './routes/reviews.routes.js'
import guidesRoutes from './routes/guides.routes.js'

const app = express()

// CORS: cho phép CLIENT_URL cấu hình + mọi địa chỉ cục bộ khi phát triển.
// Chấp nhận localhost, 127.0.0.1, [::1] và dải IP LAN riêng (192.168/10.x/172.16-31)
// với BẤT KỲ cổng nào — để mở web qua IP máy (điện thoại cùng mạng, Vite --host...) vẫn gọi được API.
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173'
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true) // curl/Postman (không có Origin)
      if (origin === allowedOrigin || LOCAL_ORIGIN.test(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`Origin không được phép: ${origin}`))
    },
  }),
)
app.use(express.json())

// BR-76: phục vụ ảnh tải lên tĩnh (thư mục ngoài src/, không thể bị require/execute).
app.use('/uploads', express.static(UPLOAD_DIR))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
// Nhóm D – Khu vực quản trị (/admin), tách biệt hoàn toàn khỏi /api/auth (BR-67).
app.use('/api/admin/auth', adminAuthRoutes)
app.use('/api/admin/homestays', adminHomestaysRoutes)
app.use('/api/admin/tours', adminToursRoutes)
app.use('/api/admin/orders', adminOrdersRoutes)
app.use('/api/admin/users', adminUsersRoutes)
app.use('/api/admin/discounts', adminDiscountsRoutes)
app.use('/api/admin/reviews', adminReviewsRoutes)
app.use('/api/admin/reports', adminReportsRoutes)
app.use('/api/admin/config', adminConfigRoutes)
app.use('/api/admin/guides', adminGuidesRoutes)
app.use('/api/admin/promotions', adminPromotionsRoutes)
app.use('/api/admin/admins', adminAdminsRoutes)
app.use('/api/catalog', catalogRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/favorites', favoritesRoutes)
app.use('/api/info', infoRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/reviews', reviewsRoutes)
app.use('/api/guides', guidesRoutes)
app.use('/api/discounts', discountsRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app

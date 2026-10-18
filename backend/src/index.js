import 'dotenv/config'
import app from './app.js'
import { isEmailConfigured } from './lib/mailer.js'
import { isGoogleConfigured } from './lib/google.js'
import { isVnpayConfigured } from './lib/vnpay.js'
import { sweepCompletedBookings } from './lib/booking.js'
import { sweepAdminPasswordExpiry } from './lib/adminExpiry.js'
import { sweepPaymentDeadlines } from './lib/paymentSweep.js'

const PORT = process.env.PORT || 4000

// UC-15 (BR-64) – Tác vụ nền định kỳ: tự hoàn tất đơn khi kết thúc trải nghiệm + gửi thư mời đánh giá,
// không phụ thuộc việc khách có mở đơn hay không. Chạy sau khi khởi động và lặp lại theo chu kỳ.
const SWEEP_MINUTES = Number(process.env.REVIEW_SWEEP_MINUTES || 30)
function startReviewSweep() {
  const run = () => sweepCompletedBookings().catch((e) => console.error('[UC-15 sweep] lỗi:', e))
  setTimeout(run, 10_000) // chạy lần đầu ~10s sau khi khởi động
  setInterval(run, SWEEP_MINUTES * 60_000)
}

// Nhắc hạn mật khẩu admin (7/3/1 ngày trước hạn). Quét vài giờ một lần là đủ.
const PWD_SWEEP_HOURS = Number(process.env.ADMIN_PWD_SWEEP_HOURS || 6)
function startAdminPasswordSweep() {
  const run = () => sweepAdminPasswordExpiry().catch((e) => console.error('[Admin expiry] lỗi:', e))
  setTimeout(run, 20_000)
  setInterval(run, PWD_SWEEP_HOURS * 3600_000)
}

// Tự hủy đơn quá hạn thanh toán (chính sách bắt buộc) + trả lại tồn kho.
const PAY_SWEEP_MINUTES = Number(process.env.PAYMENT_SWEEP_MINUTES || 30)
function startPaymentSweep() {
  const run = () => sweepPaymentDeadlines().catch((e) => console.error('[Payment sweep] lỗi:', e))
  setTimeout(run, 15_000)
  setInterval(run, PAY_SWEEP_MINUTES * 60_000)
}

app.listen(PORT, () => {
  console.log(`Backend đang chạy tại http://localhost:${PORT}`)
  console.log(`  • Email: ${isEmailConfigured() ? 'SMTP (gửi thật)' : 'DEV (log link ra console)'}`)
  console.log(`  • Google login: ${isGoogleConfigured() ? 'BẬT' : 'TẮT (chưa cấu hình GOOGLE_CLIENT_ID)'}`)
  console.log(`  • VNPAY: ${isVnpayConfigured() ? 'BẬT' : 'TẮT (dùng COD; cấu hình VNP_TMN_CODE để bật)'}`)
  console.log(`  • Quét đánh giá (UC-15): mỗi ${SWEEP_MINUTES} phút`)
  console.log(`  • Nhắc hạn mật khẩu admin: mỗi ${PWD_SWEEP_HOURS} giờ`)
  console.log(`  • Tự hủy đơn quá hạn thanh toán: mỗi ${PAY_SWEEP_MINUTES} phút`)
  startReviewSweep()
  startAdminPasswordSweep()
  startPaymentSweep()
})

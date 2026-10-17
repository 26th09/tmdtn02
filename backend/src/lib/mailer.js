import nodemailer from 'nodemailer'

// Mailer cho UC-05. Nếu có cấu hình SMTP (SMTP_HOST...) thì gửi thật;
// nếu không (môi trường học tập/dev) thì log ra console và không gửi.
let transporter = null
const smtpConfigured = Boolean(process.env.SMTP_HOST)

if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // Thất bại nhanh thay vì treo request khi SMTP chậm/không phản hồi.
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  })
}

export function isEmailConfigured() {
  return smtpConfigured
}

// UC-05 – Gửi MÃ OTP xác thực tài khoản về email. Ném lỗi nếu SMTP lỗi (để controller báo gửi lại).
export async function sendVerificationEmail(to, code) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const subject = 'Mã xác thực tài khoản StayTour'
  const html = `
    <p>Chào bạn,</p>
    <p>Cảm ơn bạn đã đăng ký StayTour. Mã xác thực (OTP) của bạn là:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
    <p>Mã có hiệu lực trong <strong>10 phút</strong>. Vui lòng nhập mã này để kích hoạt tài khoản.</p>
    <p>Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
  `

  if (!transporter) {
    // Không có SMTP -> log mã ra console để không chặn luồng.
    console.log(`[MAILER dev] Mã OTP xác thực tới ${to}: ${code}`)
    return true
  }

  await transporter.sendMail({ from, to, subject, html })
  return true
}

// Gửi email xác nhận đặt chỗ (UC-09/10). Nêu mã đơn, PIN (guest) và số tiền cọc.
export async function sendBookingEmail(to, booking) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const fmt = (n) => n.toLocaleString('vi-VN') + '₫'
  const pinLine = booking.pin
    ? `<p><strong>Mã PIN tra cứu:</strong> ${booking.pin} (giữ kín để tra cứu/hủy đơn)</p>`
    : ''
  // UC-13 (luồng thay thế 3a): liên kết tra cứu trực tiếp, không cần nhập lại mã đơn/PIN.
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const trackUrl = booking.pin
    ? `${clientUrl}/track?code=${encodeURIComponent(booking.code)}&pin=${encodeURIComponent(booking.pin)}`
    : `${clientUrl}/orders`
  const html = `
    <p>Cảm ơn bạn đã đặt tại StayTour!</p>
    <p><strong>Mã đơn:</strong> ${booking.code}</p>
    ${pinLine}
    <p><strong>Sản phẩm:</strong> ${booking.productName}</p>
    <p><strong>Tổng tiền:</strong> ${fmt(booking.totalPrice)} · <strong>Đặt cọc:</strong> ${fmt(booking.depositAmount)} · <strong>Còn lại:</strong> ${fmt(booking.remainingAmount)}</p>
    <p>Đơn đang ở trạng thái <strong>chờ đặt cọc</strong>. Vui lòng hoàn tất thanh toán cọc để xác nhận đơn.</p>
    <p><a href="${trackUrl}">Xem/theo dõi đơn của bạn</a></p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Xác nhận đặt chỗ tới ${to}: đơn ${booking.code}${booking.pin ? ' PIN ' + booking.pin : ''}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Xác nhận đặt chỗ ${booking.code} — StayTour`, html })
  return true
}

// Gửi email xác nhận hủy đơn (UC-14). BR-60: nêu rõ mức hoàn tiền áp dụng.
export async function sendCancellationEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const fmt = (n) => n.toLocaleString('vi-VN') + '₫'
  const refundLine =
    info.refundAmount > 0
      ? `<p>Số tiền hoàn: <strong>${fmt(info.refundAmount)}</strong> (${info.ratio}% khoản đã thanh toán). Yêu cầu hoàn tiền đã được ghi nhận và sẽ được xử lý trong thời gian sớm nhất.</p>`
      : `<p>Đơn không phát sinh khoản hoàn tiền theo chính sách hủy hiện hành.</p>`
  const html = `
    <p>Đơn <strong>${info.code}</strong> (${info.productName}) của bạn đã được hủy thành công.</p>
    ${refundLine}
    <p>Nếu đây không phải yêu cầu của bạn, vui lòng liên hệ hỗ trợ ngay.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Xác nhận hủy đơn ${info.code} tới ${to}: hoàn ${info.refundAmount}đ (${info.ratio}%)`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Xác nhận hủy đơn ${info.code} — StayTour`, html })
  return true
}

// Gửi email mời đánh giá sau lưu trú (UC-15, BR-64). Chỉ dành cho Guest (Customer đánh giá qua "Đơn của tôi").
export async function sendReviewInviteEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const html = `
    <p>Cảm ơn bạn đã sử dụng dịch vụ tại StayTour!</p>
    <p>Đơn <strong>${info.code}</strong> (${info.productName}) của bạn đã hoàn tất. Bạn có muốn chia sẻ trải nghiệm không?</p>
    <p><a href="${info.reviewUrl}">Viết đánh giá</a></p>
    <p>Liên kết chỉ dùng được một lần và có hiệu lực trong 30 ngày.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Mời đánh giá đơn ${info.code} tới ${to}: ${info.reviewUrl}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Chia sẻ trải nghiệm của bạn — StayTour`, html })
  return true
}

// UC-15 (BR-64) – Thư cảm ơn + mời đánh giá cho KHÁCH ĐÃ ĐĂNG NHẬP (không dùng token,
// đánh giá ngay trong "Đơn của tôi"). Gửi khi kỳ lưu trú/chuyến đi kết thúc.
export async function sendReviewThankYouEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const html = `
    <p>Cảm ơn bạn đã sử dụng dịch vụ tại StayTour!</p>
    <p>Đơn <strong>${info.code}</strong> (${info.productName}) của bạn đã hoàn tất. Hi vọng bạn đã có trải nghiệm tuyệt vời.</p>
    <p>Hãy chia sẻ cảm nhận để giúp những khách hàng khác:</p>
    <p><a href="${info.reviewUrl}">Viết đánh giá trong "Đơn của tôi"</a></p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Cảm ơn + mời đánh giá đơn ${info.code} tới ${to}: ${info.reviewUrl}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Cảm ơn bạn — chia sẻ trải nghiệm tại StayTour`, html })
  return true
}

// Phản hồi của người bán/quản trị cho một đánh giá — gửi trực tiếp tới email khách hàng.
export async function sendReviewReplyEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const stars = '★'.repeat(info.rating) + '☆'.repeat(5 - info.rating)
  const quoted = info.comment
    ? `<blockquote style="margin:12px 0;padding:8px 14px;border-left:3px solid #d6d3c4;color:#555">${info.comment}</blockquote>`
    : ''
  const html = `
    <p>Chào ${info.authorName || 'bạn'},</p>
    <p>Cảm ơn bạn đã đánh giá <strong>${info.productName}</strong>${info.code ? ` (đơn <strong>${info.code}</strong>)` : ''}.</p>
    <p>Đánh giá của bạn: <span style="color:#e0a800">${stars}</span></p>
    ${quoted}
    <p><strong>Phản hồi từ StayTour:</strong></p>
    <p style="white-space:pre-line">${info.reply}</p>
    <p>Trân trọng,<br/>Đội ngũ StayTour</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Phản hồi đánh giá tới ${to} (đơn ${info.code || '-'}): ${info.reply}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Phản hồi đánh giá của bạn — StayTour`, html })
  return true
}

// UC-18 – Thông báo khi quản trị viên chuyển trạng thái đơn (BR-90).
const ORDER_STATUS_LABEL = {
  DEPOSITED: 'đã cọc',
  CONFIRMED: 'đã xác nhận',
  COMPLETED: 'hoàn tất',
  CANCELLED: 'đã hủy',
}
export async function sendOrderStatusEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const label = ORDER_STATUS_LABEL[info.status] || info.status
  const html = `
    <p>Đơn <strong>${info.code}</strong> (${info.productName}) của bạn vừa được cập nhật sang trạng thái <strong>${label}</strong>.</p>
    <p>Nếu có thắc mắc, vui lòng liên hệ hỗ trợ.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Cập nhật trạng thái đơn ${info.code} tới ${to}: ${label}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Cập nhật đơn ${info.code} — StayTour`, html })
  return true
}

// UC-18 – Thông báo khi yêu cầu hoàn tiền đã được xử lý (BR-87/90).
export async function sendRefundProcessedEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const fmt = (n) => n.toLocaleString('vi-VN') + '₫'
  const refLine = info.referenceCode ? `<p>Mã tham chiếu hoàn tiền: <strong>${info.referenceCode}</strong></p>` : ''
  const html = `
    <p>Yêu cầu hoàn tiền cho đơn <strong>${info.code}</strong> (${info.productName}) đã được xử lý.</p>
    <p>Số tiền hoàn: <strong>${fmt(info.amount)}</strong></p>
    ${refLine}
  `
  if (!transporter) {
    console.log(`[MAILER dev] Đã xử lý hoàn tiền đơn ${info.code} tới ${to}: ${info.amount}đ`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Hoàn tiền đơn ${info.code} đã xử lý — StayTour`, html })
  return true
}

// ---- Bảo mật tài khoản quản trị ----

// Gửi thông tin tài khoản + liên kết kích hoạt cho admin mới (do SUPER_ADMIN tạo từ hệ thống).
export async function sendAdminCredentialsEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const html = `
    <p>Chào ${info.name || info.username},</p>
    <p>Tài khoản quản trị StayTour đã được tạo cho bạn:</p>
    <p><strong>Tên đăng nhập:</strong> ${info.username}<br/>
       <strong>Mật khẩu tạm:</strong> ${info.tempPassword}</p>
    <p>Lần đăng nhập đầu tiên, vui lòng kích hoạt tài khoản qua liên kết dưới đây (nhập lại tài khoản/mật khẩu,
       xác thực OTP và đặt mật khẩu mới):</p>
    <p><a href="${info.activationUrl}">Kích hoạt tài khoản quản trị</a></p>
    <p>Liên kết có hiệu lực trong 48 giờ và chỉ dùng một lần. Không chia sẻ email này cho người khác.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Tài khoản admin mới ${info.username} tới ${to}: mật khẩu tạm ${info.tempPassword} · kích hoạt ${info.activationUrl}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: 'Tài khoản quản trị StayTour — kích hoạt', html })
  return true
}

// Gửi MÃ OTP 2FA cho một lần đăng nhập quản trị.
export async function sendAdminOtpEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const html = `
    <p>Mã xác thực đăng nhập quản trị (2FA) của bạn là:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${info.otp}</p>
    <p>Mã có hiệu lực trong <strong>5 phút</strong>. Nếu không phải bạn đăng nhập, hãy đổi mật khẩu ngay.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] OTP đăng nhập admin tới ${to}: ${info.otp}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: 'Mã OTP đăng nhập quản trị — StayTour', html })
  return true
}

// Nhắc admin đổi mật khẩu trước khi hết hạn (gửi ở mốc 7 / 3 / 1 ngày).
export async function sendAdminPasswordExpiryEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const whenTxt = info.daysLeft <= 0 ? 'hôm nay' : `trong ${info.daysLeft} ngày`
  const html = `
    <p>Chào ${info.username},</p>
    <p>Mật khẩu quản trị của bạn sẽ <strong>hết hạn ${whenTxt}</strong> (hạn: ${new Date(info.expiresAt).toLocaleDateString('vi-VN')}).</p>
    <p>Vui lòng đăng nhập và đổi mật khẩu mới để không bị gián đoạn truy cập. Chính sách: đổi mật khẩu định kỳ mỗi 30 ngày.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Nhắc hạn mật khẩu admin ${info.username} tới ${to}: còn ${info.daysLeft} ngày`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Mật khẩu quản trị sắp hết hạn (còn ${info.daysLeft} ngày) — StayTour`, html })
  return true
}

// Gửi email đặt lại mật khẩu (UC-06 1a).
export async function sendPasswordResetEmail(to, resetUrl) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const subject = 'Đặt lại mật khẩu StayTour'
  const html = `
    <p>Chào bạn,</p>
    <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Bấm liên kết dưới đây để đặt mật khẩu mới:</p>
    <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>
    <p>Liên kết có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
  `

  if (!transporter) {
    console.log(`[MAILER dev] Gửi đặt lại mật khẩu tới ${to}: ${resetUrl}`)
    return true
  }

  await transporter.sendMail({ from, to, subject, html })
  return true
}

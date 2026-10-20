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

// "Trả sau khi đi tour": đã tiếp nhận yêu cầu, điều hành sẽ gọi xác nhận.
export async function sendPayOnDepartureRequestEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const fmt = (n) => (n || 0).toLocaleString('vi-VN') + '₫'
  const html = `
    <p>Cảm ơn bạn đã đặt tour tại StayTour!</p>
    <p>Yêu cầu đặt chỗ <strong>${info.code}</strong> ${info.productName || ''} đã được tiếp nhận theo hình thức
       <strong>Trả sau khi đi tour</strong> (không cần trả tiền ngay).</p>
    <p>Điều hành viên sẽ liên hệ (gọi điện/Zalo) để xác nhận điểm đón và số lượng khách
       trong thời gian sớm nhất (thường trong vòng ~15 phút giờ hành chính).</p>
    <p>Số tiền cần chuẩn bị để thanh toán cho hướng dẫn viên/tài xế vào ngày khởi hành:
       <strong>${fmt(info.payable)}</strong>.</p>
    <p>⚠️ Vui lòng giữ máy liên lạc. Hủy không báo trước có thể ảnh hưởng tới các lần đặt sau.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Tiếp nhận trả-sau đơn ${info.code} tới ${to}: chuẩn bị ${fmt(info.payable)}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Đã tiếp nhận yêu cầu đặt tour ${info.code} — StayTour`, html })
  return true
}

// Voucher/vé điện tử khi điều hành XÁC NHẬN đơn trả-sau.
export async function sendTourVoucherEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const fmt = (n) => (n || 0).toLocaleString('vi-VN') + '₫'
  const html = `
    <p>🎉 Đặt tour <strong>THÀNH CÔNG</strong>!</p>
    <p>Đơn <strong>${info.code}</strong> ${info.productName || ''} của bạn đã được xác nhận. Đây là vé điện tử / voucher của bạn.</p>
    <p><strong>Mã đặt chỗ:</strong> ${info.code}</p>
    <p>Vui lòng chuẩn bị sẵn <strong>${fmt(info.payable)}</strong> để thanh toán cho hướng dẫn viên tại điểm đón
       (tiền mặt hoặc quét mã QR).</p>
    <p>Chúc bạn có một chuyến đi tuyệt vời cùng StayTour!</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Voucher xác nhận đơn ${info.code} tới ${to}: thu ${fmt(info.payable)} khi đi`)
    return true
  }
  await transporter.sendMail({ from, to, subject: `Xác nhận đặt tour ${info.code} — Vé điện tử StayTour`, html })
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

// Trả lời tin nhắn liên hệ/CSKH qua email (có thể kèm ảnh/PDF/CSV).
// attachments: [{ filename, path }] (đường dẫn tệp trên đĩa).
export async function sendContactReplyEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const subject = info.subject ? `Re: ${info.subject}` : 'Phản hồi từ StayTour'
  const quoted = info.originalBody
    ? `<hr/><p style="color:#888;font-size:12px">Nội dung bạn đã gửi:</p><blockquote style="margin:8px 0;padding:8px 14px;border-left:3px solid #d6d3c4;color:#666;white-space:pre-line">${info.originalBody}</blockquote>`
    : ''
  const html = `
    <p>Chào ${info.name || 'bạn'},</p>
    <p style="white-space:pre-line">${info.body}</p>
    <p>Trân trọng,<br/>Bộ phận CSKH StayTour</p>
    ${quoted}
  `
  if (!transporter) {
    const names = (info.attachments || []).map((a) => a.filename).join(', ')
    console.log(`[MAILER dev] Trả lời liên hệ tới ${to}: ${info.body}${names ? ' · đính kèm: ' + names : ''}`)
    return true
  }
  await transporter.sendMail({ from, to, subject, html, attachments: info.attachments || [] })
  return true
}

// Đăng ký nhận ưu đãi (ô ở footer trang khách): email chào mừng/xác nhận đã đăng ký.
export async function sendPromoSubscribeEmail(to) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const html = `
    <p>Chào bạn,</p>
    <p>Cảm ơn bạn đã đăng ký nhận ưu đãi từ <strong>StayTour</strong>! 🎉</p>
    <p>Từ giờ, bạn sẽ là người đầu tiên nhận được các chương trình khuyến mại, mã giảm giá
       và gợi ý hành trình mới nhất của chúng tôi qua email này.</p>
    <p><a href="${clientUrl}">Khám phá homestay & tour ngay</a></p>
    <p>Nếu bạn không muốn nhận email nữa, chỉ cần phản hồi email này để chúng tôi hủy đăng ký.</p>
    <p>Trân trọng,<br/>Đội ngũ StayTour</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Chào mừng đăng ký nhận ưu đãi tới ${to}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: 'Chào mừng bạn đến với ưu đãi StayTour! 🎉', html })
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

// Quên mật khẩu admin: gửi liên kết đặt lại + mã OTP (nhập ở trang đặt lại).
export async function sendAdminResetEmail(to, info) {
  const from = process.env.MAIL_FROM || 'StayTour <no-reply@staytour.example>'
  const html = `
    <p>Chào ${info.username || 'bạn'},</p>
    <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu quản trị. Bấm liên kết dưới đây để tiếp tục:</p>
    <p><a href="${info.resetUrl}">Đặt lại mật khẩu quản trị</a></p>
    <p>Mã OTP xác nhận của bạn là:</p>
    <p style="font-size:26px;font-weight:bold;letter-spacing:6px;margin:14px 0">${info.otp}</p>
    <p>Liên kết và mã có hiệu lực trong <strong>30 phút</strong> và chỉ dùng một lần. Nếu không phải bạn, hãy bỏ qua email này.</p>
  `
  if (!transporter) {
    console.log(`[MAILER dev] Đặt lại mật khẩu admin tới ${to}: ${info.resetUrl} · OTP ${info.otp}`)
    return true
  }
  await transporter.sendMail({ from, to, subject: 'Đặt lại mật khẩu quản trị — StayTour', html })
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

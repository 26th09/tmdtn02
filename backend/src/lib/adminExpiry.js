import { prisma } from './prisma.js'
import { sendAdminPasswordExpiryEmail } from './mailer.js'
import { PASSWORD_MAX_AGE_DAYS, REMINDER_DAYS, passwordExpiresAt, daysUntilExpiry } from './adminSecurity.js'

// Mốc nhắc theo số ngày còn lại -> stage (1=7 ngày, 2=3 ngày, 3=1 ngày/hết hạn).
function targetStage(daysLeft) {
  if (daysLeft <= REMINDER_DAYS[2]) return 3 // <= 1 ngày
  if (daysLeft <= REMINDER_DAYS[1]) return 2 // <= 3 ngày
  if (daysLeft <= REMINDER_DAYS[0]) return 1 // <= 7 ngày
  return 0
}

// Quét định kỳ: gửi email nhắc đổi mật khẩu ở các mốc 7 / 3 / 1 ngày trước hạn, mỗi mốc 1 lần.
// expiryReminderStage lưu mốc đã gửi; reset về 0 khi admin đổi mật khẩu.
export async function sweepAdminPasswordExpiry() {
  const soon = new Date(Date.now() - (PASSWORD_MAX_AGE_DAYS - REMINDER_DAYS[0]) * 86400000)
  const admins = await prisma.admin.findMany({
    where: { active: true, activated: true, email: { not: null }, passwordChangedAt: { lte: soon } },
    select: { id: true, username: true, email: true, passwordChangedAt: true, expiryReminderStage: true },
  })
  let sent = 0
  for (const a of admins) {
    const daysLeft = daysUntilExpiry(a)
    const stage = targetStage(daysLeft)
    if (stage > 0 && stage > a.expiryReminderStage) {
      await sendAdminPasswordExpiryEmail(a.email, {
        username: a.username,
        daysLeft: Math.max(0, daysLeft),
        expiresAt: passwordExpiresAt(a.passwordChangedAt),
      }).catch((e) => console.error('Gửi nhắc hạn mật khẩu admin thất bại:', e))
      await prisma.admin.update({ where: { id: a.id }, data: { expiryReminderStage: stage } })
      sent++
    }
  }
  if (sent) console.log(`[Admin expiry] Đã gửi ${sent} email nhắc đổi mật khẩu.`)
  return sent
}

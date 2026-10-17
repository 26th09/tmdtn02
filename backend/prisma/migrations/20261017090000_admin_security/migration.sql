-- Bảo mật tài khoản admin: email (gửi OTP/thông tin), 2FA OTP, kích hoạt lần đầu,
-- hạn mật khẩu 1 tháng + mốc nhắc hạn.
ALTER TABLE `Admin`
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `activated` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `expiryReminderStage` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `activationTokenHash` VARCHAR(191) NULL,
  ADD COLUMN `activationExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `otpHash` VARCHAR(191) NULL,
  ADD COLUMN `otpExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `otpAttempts` INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `Admin_email_key` ON `Admin`(`email`);

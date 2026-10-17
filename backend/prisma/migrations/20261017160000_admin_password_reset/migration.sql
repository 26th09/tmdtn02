-- Quên mật khẩu admin: token đặt lại qua email + OTP.
ALTER TABLE `Admin`
  ADD COLUMN `resetTokenHash` VARCHAR(191) NULL,
  ADD COLUMN `resetExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `resetOtpHash` VARCHAR(191) NULL,
  ADD COLUMN `resetOtpAttempts` INTEGER NOT NULL DEFAULT 0;

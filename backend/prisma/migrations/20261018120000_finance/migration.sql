-- Quản lý tài chính: cấu hình VAT + hạn thanh toán; theo dõi tiền đã nhận thực tế.
ALTER TABLE `SystemConfig`
  ADD COLUMN `vatPercent` INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN `fullPaymentHoursBeforeStart` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `codDueDays` INTEGER NOT NULL DEFAULT 7;
ALTER TABLE `Booking` ADD COLUMN `paidAmount` INTEGER NOT NULL DEFAULT 0;

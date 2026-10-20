-- Quản lý phương thức thanh toán (bật/tắt) + mốc phí hủy thứ 3.
ALTER TABLE `SystemConfig`
  ADD COLUMN `cancelTier3Days` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `cancelTier3Ratio` INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN `vnpayEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `payOnDepartureEnabled` BOOLEAN NOT NULL DEFAULT true;

-- Trả sau khi đi tour: số giờ tối thiểu tới ngày đi mới cho chọn.
ALTER TABLE `SystemConfig` ADD COLUMN `payOnDepartureMinHours` INTEGER NOT NULL DEFAULT 48;

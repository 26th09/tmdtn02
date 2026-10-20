-- Liên hệ hỗ trợ đơn: tham chiếu mã đơn khách đã đặt.
ALTER TABLE `ContactMessage` ADD COLUMN `bookingCode` VARCHAR(191) NULL;

-- AlterTable: Booking — tách trạng thái tiền + field pre-auth Stripe (Luồng 1)
ALTER TABLE `Booking`
  ADD COLUMN `paymentStatus` ENUM('UNPAID', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN `stripePaymentIntentId` VARCHAR(191) NULL,
  ADD COLUMN `cardAuthAmount` INTEGER NULL,
  ADD COLUMN `cardAuthStatus` VARCHAR(191) NULL;

-- AlterTable: Payment — phân biệt giữ thẻ (AUTH) vs thu tiền (CHARGE)
ALTER TABLE `Payment` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'CHARGE';

-- AlterTable: Tour / Property — mùa cao điểm (Luồng 3)
ALTER TABLE `Tour` ADD COLUMN `isPeakSeason` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Property` ADD COLUMN `isPeakSeason` BOOLEAN NOT NULL DEFAULT false;

-- Backfill trạng thái tiền cho đơn cũ dựa trên paidAmount thực nhận.
UPDATE `Booking` SET `paymentStatus` = 'PAID'
  WHERE `paidAmount` > 0 AND `paidAmount` >= (`totalPrice` - `discountAmount`);
UPDATE `Booking` SET `paymentStatus` = 'PARTIALLY_PAID'
  WHERE `paidAmount` > 0 AND `paidAmount` < (`totalPrice` - `discountAmount`);

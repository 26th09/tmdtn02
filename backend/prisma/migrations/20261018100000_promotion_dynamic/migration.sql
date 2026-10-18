-- Khuyến mãi động: khung thời gian (đếm lùi) + tham chiếu nhóm/sản phẩm đang giảm.
ALTER TABLE `Promotion`
  ADD COLUMN `startAt` DATETIME(3) NULL,
  ADD COLUMN `endAt` DATETIME(3) NULL,
  ADD COLUMN `discountCode` VARCHAR(191) NULL,
  ADD COLUMN `discountPercent` INTEGER NULL,
  ADD COLUMN `serviceGroupId` INTEGER NULL,
  ADD COLUMN `ctaLink` VARCHAR(191) NULL;
ALTER TABLE `Promotion` ADD CONSTRAINT `Promotion_serviceGroupId_fkey` FOREIGN KEY (`serviceGroupId`) REFERENCES `ServiceGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

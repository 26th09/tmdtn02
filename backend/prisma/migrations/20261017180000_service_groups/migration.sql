-- Nhóm dịch vụ (cây phân cấp) gom tour/homestay/bài viết; khuyến mãi theo nhóm.
CREATE TABLE `ServiceGroup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  `parentId` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ServiceGroup_slug_key`(`slug`),
  INDEX `ServiceGroup_parentId_idx`(`parentId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ServiceGroupTour` (
  `groupId` INTEGER NOT NULL,
  `tourId` INTEGER NOT NULL,
  INDEX `ServiceGroupTour_tourId_idx`(`tourId`),
  PRIMARY KEY (`groupId`, `tourId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ServiceGroupProperty` (
  `groupId` INTEGER NOT NULL,
  `propertyId` INTEGER NOT NULL,
  INDEX `ServiceGroupProperty_propertyId_idx`(`propertyId`),
  PRIMARY KEY (`groupId`, `propertyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ServiceGroupGuide` (
  `groupId` INTEGER NOT NULL,
  `guideId` INTEGER NOT NULL,
  INDEX `ServiceGroupGuide_guideId_idx`(`guideId`),
  PRIMARY KEY (`groupId`, `guideId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DiscountCode` ADD COLUMN `serviceGroupId` INTEGER NULL;

ALTER TABLE `ServiceGroup` ADD CONSTRAINT `ServiceGroup_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ServiceGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupTour` ADD CONSTRAINT `ServiceGroupTour_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ServiceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupTour` ADD CONSTRAINT `ServiceGroupTour_tourId_fkey` FOREIGN KEY (`tourId`) REFERENCES `Tour`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupProperty` ADD CONSTRAINT `ServiceGroupProperty_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ServiceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupProperty` ADD CONSTRAINT `ServiceGroupProperty_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupGuide` ADD CONSTRAINT `ServiceGroupGuide_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `ServiceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ServiceGroupGuide` ADD CONSTRAINT `ServiceGroupGuide_guideId_fkey` FOREIGN KEY (`guideId`) REFERENCES `TravelGuide`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DiscountCode` ADD CONSTRAINT `DiscountCode_serviceGroupId_fkey` FOREIGN KEY (`serviceGroupId`) REFERENCES `ServiceGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

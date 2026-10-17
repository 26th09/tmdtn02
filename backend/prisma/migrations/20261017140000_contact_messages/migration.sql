-- Liên hệ & chăm sóc khách hàng: tin nhắn từ đối tác/khách + lịch sử trả lời qua email.
CREATE TABLE `ContactMessage` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `type` ENUM('CUSTOMER', 'PARTNER') NOT NULL DEFAULT 'CUSTOMER',
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NULL,
  `subject` VARCHAR(191) NULL,
  `body` TEXT NOT NULL,
  `status` ENUM('UNREAD', 'READ', 'REPLIED', 'ARCHIVED') NOT NULL DEFAULT 'UNREAD',
  `readAt` DATETIME(3) NULL,
  `repliedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ContactMessage_status_idx`(`status`),
  INDEX `ContactMessage_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactReply` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `messageId` INTEGER NOT NULL,
  `adminId` INTEGER NULL,
  `body` TEXT NOT NULL,
  `attachments` JSON NULL,
  `toEmail` VARCHAR(191) NOT NULL,
  `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ContactReply_messageId_idx`(`messageId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ContactReply` ADD CONSTRAINT `ContactReply_messageId_fkey`
  FOREIGN KEY (`messageId`) REFERENCES `ContactMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

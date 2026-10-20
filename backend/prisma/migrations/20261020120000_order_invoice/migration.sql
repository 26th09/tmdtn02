-- CreateTable: OrderInvoice — hóa đơn điện tử (mô phỏng IVAN), 0/1 hóa đơn mỗi đơn Booking.
CREATE TABLE `OrderInvoice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingId` INTEGER NOT NULL,
    `taxCode` VARCHAR(191) NULL,
    `companyName` VARCHAR(191) NULL,
    `companyAddress` VARCHAR(191) NULL,
    `invoiceEmail` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'ISSUED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceSerial` VARCHAR(191) NULL,
    `reservationCode` VARCHAR(191) NULL,
    `pdfUrl` VARCHAR(191) NULL,
    `xmlUrl` VARCHAR(191) NULL,
    `errorLog` TEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `issuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderInvoice_bookingId_key`(`bookingId`),
    INDEX `OrderInvoice_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderInvoice` ADD CONSTRAINT `OrderInvoice_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

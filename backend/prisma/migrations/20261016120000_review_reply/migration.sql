-- Phản hồi khách hàng cho đánh giá (gửi kèm email). Không cần phê duyệt nữa:
-- đánh giá mới được đẩy trực tiếp (approved=true set ở tầng ứng dụng).
ALTER TABLE `Review`
  ADD COLUMN `replyText` TEXT NULL,
  ADD COLUMN `repliedAt` DATETIME(3) NULL;

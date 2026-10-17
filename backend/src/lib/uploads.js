import crypto from 'crypto'
import fs from 'fs'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// UC-16 (BR-76) – Thư mục lưu ảnh tải lên nằm NGOÀI thư mục mã nguồn (src/), không thể
// bị Node require/execute; chỉ được phục vụ tĩnh (express.static) qua đường dẫn /uploads.
export const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // BR-76: đổi tên tệp — không giữ tên gốc người dùng đặt (chống path traversal / đè tệp).
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || ''
    cb(null, crypto.randomBytes(16).toString('hex') + ext)
  },
})

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WEBP')) // 5a
  }
  cb(null, true)
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE, files: 1 },
})

// UC-15 – Tải nhiều ảnh cùng lúc (đính kèm đánh giá): tối đa 6 ảnh/lần.
export const uploadImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE, files: 6 },
})

export function publicUploadUrl(filename) {
  const base = process.env.BACKEND_URL || 'http://localhost:4000'
  return `${base}/uploads/${filename}`
}

// Đường dẫn tệp trên đĩa (để nodemailer đính kèm theo path).
export function uploadDiskPath(filename) {
  return path.join(UPLOAD_DIR, filename)
}

// Đính kèm liên hệ/CSKH: cho phép ảnh + PDF + CSV. Tối đa 5 tệp, 10MB/tệp.
const ATTACH_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/csv': '.csv',
  'application/vnd.ms-excel': '.csv', // một số trình duyệt gắn mime này cho .csv
}
const attachStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = ATTACH_EXT[file.mimetype] || path.extname(file.originalname).toLowerCase().slice(0, 8)
    cb(null, crypto.randomBytes(16).toString('hex') + ext)
  },
})
function attachFilter(req, file, cb) {
  // Chấp nhận theo mime; .csv đôi khi là text/plain nên nới cho đuôi .csv.
  const okMime = Boolean(ATTACH_EXT[file.mimetype])
  const okCsv = file.mimetype === 'text/plain' && /\.csv$/i.test(file.originalname)
  if (!okMime && !okCsv) return cb(new Error('Chỉ chấp nhận ảnh (JPG/PNG/WEBP), PDF hoặc CSV'))
  cb(null, true)
}
export const uploadAttachments = multer({
  storage: attachStorage,
  fileFilter: attachFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
})

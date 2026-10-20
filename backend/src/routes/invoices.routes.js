import { Router } from 'express'
import { lookupInvoiceTaxCode } from '../controllers/invoices.controller.js'

const router = Router()

// Công khai (hỗ trợ guest): tra mã số thuế để tự điền tên/địa chỉ công ty ở bước thanh toán.
router.post('/lookup', lookupInvoiceTaxCode)

export default router

import { Router } from 'express'
import { listInvoices, retryInvoice, cancelInvoiceAdmin } from '../../controllers/admin/invoices.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()
router.use(requireAdmin)

router.get('/', listInvoices)
router.post('/:id/retry', retryInvoice)
router.post('/:id/cancel', cancelInvoiceAdmin)

export default router

import { lookupTaxCode } from '../lib/einvoice.js'

// POST /api/invoices/lookup { taxCode } — nút "Kiểm tra" ở checkout: tra tên + địa chỉ công ty (mô phỏng).
export async function lookupInvoiceTaxCode(req, res, next) {
  try {
    const taxCode = String(req.body?.taxCode || '').trim()
    if (!taxCode) return res.status(400).json({ message: 'Vui lòng nhập mã số thuế' })
    const result = await lookupTaxCode(taxCode)
    if (!result.ok) return res.status(400).json({ message: result.message })
    res.json({ taxCode: result.taxCode, companyName: result.companyName, companyAddress: result.companyAddress })
  } catch (err) {
    next(err)
  }
}

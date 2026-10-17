import { useState } from 'react'
import { ApiError, api } from '../lib/api'

const field =
  'w-full rounded-xl border border-cream-300 bg-white px-3.5 py-2.5 text-sm text-forest-900 placeholder:text-forest-300 focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100'
const lbl = 'mb-1.5 block text-sm font-medium text-forest-700'

// Trang liên hệ công khai: khách hàng / đối tác gửi yêu cầu, bộ phận CSKH trả lời qua email.
export function ContactPage() {
  const [type, setType] = useState<'CUSTOMER' | 'PARTNER'>('CUSTOMER')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name || !email || !body) {
      setError('Vui lòng nhập họ tên, email và nội dung')
      return
    }
    setSubmitting(true)
    try {
      const r = await api.submitContact({ type, name, email, phone: phone || undefined, subject: subject || undefined, body })
      setDone(r.message)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gửi liên hệ thất bại. Vui lòng thử lại.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-forest-100 text-3xl">✅</div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-forest-900">Đã gửi liên hệ</h1>
        <p className="mt-2 text-forest-500">{done}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-4xl font-semibold text-forest-900">Liên hệ với chúng tôi</h1>
      <p className="mt-2 text-forest-500">
        Khách hàng cần hỗ trợ hay đối tác muốn hợp tác — gửi thông tin bên dưới, bộ phận CSKH sẽ phản hồi qua email sớm nhất.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl border border-cream-200 bg-white p-6">
        <div>
          <span className={lbl}>Bạn là</span>
          <div className="flex flex-wrap gap-2">
            {([['CUSTOMER', 'Khách hàng'], ['PARTNER', 'Đối tác']] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setType(v)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  type === v ? 'bg-forest-700 text-cream-50' : 'bg-cream-100 text-forest-600 hover:bg-cream-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Họ và tên <span className="text-clay-500">*</span></label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={lbl}>Email <span className="text-clay-500">*</span></label>
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div>
            <label className={lbl}>Số điện thoại</label>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" />
          </div>
        </div>
        <div>
          <label className={lbl}>Tiêu đề</label>
          <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Chủ đề liên hệ" />
        </div>
        <div>
          <label className={lbl}>Nội dung <span className="text-clay-500">*</span></label>
          <textarea className={`${field} min-h-32`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nội dung bạn muốn trao đổi..." />
        </div>
        {error && <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-forest-700 px-6 py-3 font-semibold text-cream-50 shadow-sm transition hover:bg-forest-800 disabled:opacity-50"
        >
          {submitting ? 'Đang gửi...' : 'Gửi liên hệ'}
        </button>
      </form>
    </div>
  )
}

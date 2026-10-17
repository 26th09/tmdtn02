import { useState } from 'react'
import { AdminApiError, adminApi, type AdminSession } from '../../lib/adminApi'

export const authField =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none'

// Ô nhập mật khẩu có nút hiện/ẩn (con mắt).
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        className={`${authField} pr-10`}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-200"
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}

// Bước nhập OTP 2FA. Gọi onSession khi đã cấp phiên, onNeedPassword khi phải đổi mật khẩu.
export function OtpStep({
  challenge,
  sentTo,
  onSession,
  onNeedPassword,
}: {
  challenge: string
  sentTo: string | null
  onSession: (s: AdminSession) => void
  onNeedPassword: (changeToken: string, reason: 'FIRST_LOGIN' | 'EXPIRED') => void
}) {
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await adminApi.verifyOtp(challenge, otp.trim())
      if ('requirePasswordChange' in r) onNeedPassword(r.changeToken, r.reason)
      else onSession(r)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Xác thực OTP thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-400">
        Đã gửi mã OTP 6 số tới email {sentTo || 'quản trị'}. Mã có hiệu lực 5 phút.
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-300">Mã OTP</span>
        <input
          className={`${authField} text-center text-lg tracking-[0.4em]`}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoFocus
          placeholder="______"
        />
      </label>
      {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
      <button
        type="submit"
        disabled={loading || otp.length !== 6}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Đang xác thực...' : 'Xác thực OTP'}
      </button>
    </form>
  )
}

// Bước đặt mật khẩu mới (lần đầu kích hoạt / khi hết hạn). Gọi onSession khi xong.
export function NewPasswordStep({
  changeToken,
  reason,
  onSession,
}: {
  changeToken: string
  reason: 'FIRST_LOGIN' | 'EXPIRED'
  onSession: (s: AdminSession) => void
}) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw !== pw2) return setError('Mật khẩu nhập lại không khớp')
    setLoading(true)
    try {
      const s = await adminApi.changeAdminPassword(changeToken, pw)
      onSession(s)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đổi mật khẩu thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
        {reason === 'FIRST_LOGIN'
          ? 'Lần đăng nhập đầu tiên: vui lòng đặt mật khẩu mới cho tài khoản.'
          : 'Mật khẩu đã hết hạn (đổi định kỳ 30 ngày): vui lòng đặt mật khẩu mới.'}
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-300">Mật khẩu mới</span>
        <PasswordInput value={pw} onChange={setPw} autoFocus placeholder="≥ 8 ký tự, gồm chữ và số" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-slate-300">Nhập lại mật khẩu</span>
        <PasswordInput value={pw2} onChange={setPw2} />
      </label>
      {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
      <button
        type="submit"
        disabled={loading || !pw || !pw2}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? 'Đang lưu...' : 'Đặt mật khẩu & vào hệ thống'}
      </button>
    </form>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AdminApiError, adminApi } from '../../lib/adminApi'
import { PasswordInput, authField } from './adminAuthFlow'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-center text-xl font-bold text-white">{title}</h1>
        {children}
      </div>
    </div>
  )
}

// Quên mật khẩu: nhập email đã thiết lập -> gửi link + OTP.
export function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await adminApi.forgotPassword(email.trim())
      setMsg(r.message)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Gửi yêu cầu thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell title="Quên mật khẩu quản trị">
      {msg ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-3 text-sm text-emerald-300">{msg}</div>
          <Link to="/admin/login" className="block text-center text-sm text-emerald-400 hover:underline">← Về đăng nhập</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-slate-400">Nhập email đã thiết lập cho tài khoản quản trị. Hệ thống sẽ gửi liên kết đặt lại kèm mã OTP.</p>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Email</span>
            <input className={authField} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="email@domain.com" />
          </label>
          {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
          <button type="submit" disabled={loading || !email.trim()} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại'}
          </button>
          <Link to="/admin/login" className="block text-center text-xs text-slate-500 hover:text-slate-300">← Về đăng nhập</Link>
        </form>
      )}
    </Shell>
  )
}

// Đặt lại mật khẩu từ link token: nhập OTP + mật khẩu mới.
export function AdminResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()

  const [phase, setPhase] = useState<'loading' | 'invalid' | 'form' | 'done'>('loading')
  const [emailMasked, setEmailMasked] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setPhase('invalid')
      return
    }
    adminApi
      .resetContext(token)
      .then((r) => {
        setEmailMasked(r.email)
        setPhase('form')
      })
      .catch(() => setPhase('invalid'))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw !== pw2) return setError('Mật khẩu nhập lại không khớp')
    setLoading(true)
    try {
      await adminApi.resetPassword(token, otp.trim(), pw)
      setPhase('done')
      setTimeout(() => navigate('/admin/login', { replace: true }), 2500)
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đặt lại thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell title="Đặt lại mật khẩu quản trị">
      {phase === 'loading' && <p className="mt-6 text-center text-sm text-slate-500">Đang kiểm tra liên kết...</p>}
      {phase === 'invalid' && (
        <div className="mt-6 rounded-lg border border-red-800 bg-red-950/40 px-3 py-3 text-sm text-red-300">
          Liên kết đặt lại không hợp lệ hoặc đã hết hạn. <Link to="/admin/forgot-password" className="text-emerald-400 hover:underline">Yêu cầu lại</Link>.
        </div>
      )}
      {phase === 'done' && (
        <div className="mt-6 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-3 text-sm text-emerald-300">
          Đặt lại mật khẩu thành công! Đang chuyển về trang đăng nhập...
        </div>
      )}
      {phase === 'form' && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-slate-400">Nhập mã OTP đã gửi tới email {emailMasked || 'của bạn'} và mật khẩu mới.</p>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Mã OTP</span>
            <input
              className={`${authField} text-center text-lg tracking-[0.4em]`}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="______"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Mật khẩu mới</span>
            <PasswordInput value={pw} onChange={setPw} placeholder="≥ 8 ký tự, gồm chữ và số" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300">Nhập lại mật khẩu</span>
            <PasswordInput value={pw2} onChange={setPw2} />
          </label>
          {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
          <button type="submit" disabled={loading || otp.length !== 6 || !pw} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {loading ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
          </button>
        </form>
      )}
    </Shell>
  )
}

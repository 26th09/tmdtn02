import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminSession } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'
import { OtpStep, NewPasswordStep, authField } from './adminAuthFlow'

type Phase = 'cred' | 'otp' | 'password'

// UC-24 – Đăng nhập quản trị 2 bước (mật khẩu -> OTP 2FA), tách biệt hoàn toàn với /login của Customer.
export function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const expired = params.get('expired') === '1'
  const { login } = useAdminAuth()

  const [phase, setPhase] = useState<Phase>('cred')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [changeToken, setChangeToken] = useState('')
  const [pwReason, setPwReason] = useState<'FIRST_LOGIN' | 'EXPIRED'>('EXPIRED')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function finish(s: AdminSession) {
    login(s.token, s.admin)
    const from = (location.state as { from?: string } | null)?.from || '/admin'
    navigate(from, { replace: true })
  }

  async function submitCred(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await adminApi.login(username.trim(), password)
      setChallenge(r.challenge)
      setSentTo(r.sentTo)
      setPhase('otp')
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đăng nhập thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-center text-xl font-bold text-white">🛠️ StayTour Admin</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          {phase === 'cred' ? 'Đăng nhập khu vực quản trị' : phase === 'otp' ? 'Xác thực 2 yếu tố (OTP)' : 'Đổi mật khẩu'}
        </p>

        {expired && phase === 'cred' && (
          <div className="mt-4 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
            Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.
          </div>
        )}

        {phase === 'cred' && (
          <form onSubmit={submitCred} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Tài khoản</span>
              <input className={authField} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Mật khẩu</span>
              <input className={authField} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Đang kiểm tra...' : 'Tiếp tục'}
            </button>
          </form>
        )}

        {phase === 'otp' && (
          <OtpStep
            challenge={challenge}
            sentTo={sentTo}
            onSession={finish}
            onNeedPassword={(t, reason) => {
              setChangeToken(t)
              setPwReason(reason)
              setPhase('password')
            }}
          />
        )}

        {phase === 'password' && <NewPasswordStep changeToken={changeToken} reason={pwReason} onSession={finish} />}

        <p className="mt-6 text-center text-xs text-slate-600">
          Khu vực này dành riêng cho quản trị viên, bảo vệ bằng xác thực 2 yếu tố (OTP qua email).
        </p>
      </div>
    </div>
  )
}

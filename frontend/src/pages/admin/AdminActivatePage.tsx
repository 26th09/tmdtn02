import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AdminApiError, adminApi, type AdminSession } from '../../lib/adminApi'
import { useAdminAuth } from '../../lib/adminAuth'
import { OtpStep, NewPasswordStep, PasswordInput, authField } from './adminAuthFlow'

type Phase = 'loading' | 'invalid' | 'cred' | 'otp' | 'password'

// Kích hoạt tài khoản admin lần đầu qua link token trong email: nhập lại tài khoản/mật khẩu tạm,
// xác thực OTP rồi đặt mật khẩu mới.
export function AdminActivatePage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const { login } = useAdminAuth()

  const [phase, setPhase] = useState<Phase>('loading')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [changeToken, setChangeToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setPhase('invalid')
      return
    }
    adminApi
      .activationContext(token)
      .then((r) => {
        setUsername(r.username)
        setPhase('cred')
      })
      .catch(() => setPhase('invalid'))
  }, [token])

  function finish(s: AdminSession) {
    login(s.token, s.admin)
    navigate('/admin', { replace: true })
  }

  async function submitCred(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await adminApi.activate(token, username.trim(), password)
      setChallenge(r.challenge)
      setSentTo(r.sentTo)
      setPhase('otp')
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Kích hoạt thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6">
        <h1 className="text-center text-xl font-bold text-white">🛠️ Kích hoạt tài khoản quản trị</h1>

        {phase === 'loading' && <p className="mt-6 text-center text-sm text-slate-500">Đang kiểm tra liên kết...</p>}

        {phase === 'invalid' && (
          <div className="mt-6 rounded-lg border border-red-800 bg-red-950/40 px-3 py-3 text-sm text-red-300">
            Liên kết kích hoạt không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ quản trị cấp cao để gửi lại.
          </div>
        )}

        {phase === 'cred' && (
          <form onSubmit={submitCred} className="mt-6 space-y-4">
            <p className="text-sm text-slate-400">Nhập lại tài khoản và mật khẩu tạm (trong email) để xác nhận.</p>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Tài khoản</span>
              <input className={authField} value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-300">Mật khẩu tạm</span>
              <PasswordInput value={password} onChange={setPassword} autoFocus />
            </label>
            {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Đang xử lý...' : 'Tiếp tục'}
            </button>
          </form>
        )}

        {phase === 'otp' && (
          <OtpStep
            challenge={challenge}
            sentTo={sentTo}
            onSession={finish}
            onNeedPassword={(t) => {
              setChangeToken(t)
              setPhase('password')
            }}
          />
        )}

        {phase === 'password' && <NewPasswordStep changeToken={changeToken} reason="FIRST_LOGIN" onSession={finish} />}
      </div>
    </div>
  )
}

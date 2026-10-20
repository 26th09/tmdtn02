import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AdminApiError,
  adminApi,
  type ContactCounts,
  type ContactMessage,
  type ContactReply,
  type NewsletterSubscriber,
  type SubscriberCounts,
} from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'
const TYPE_LABEL: Record<string, string> = { CUSTOMER: 'Khách hàng', PARTNER: 'Đối tác' }
const STATUS_LABEL: Record<string, string> = { UNREAD: 'Chưa đọc', READ: 'Đã đọc', REPLIED: 'Đã trả lời', ARCHIVED: 'Lưu trữ' }
const fmt = (s: string) => new Date(s).toLocaleString('vi-VN')

export function AdminContactsPage() {
  const [tab, setTab] = useState<'inbox' | 'sent' | 'subscribers'>('inbox')
  const [filter, setFilter] = useState('INBOX') // INBOX | UNREAD | READ | REPLIED | ''
  const [items, setItems] = useState<ContactMessage[]>([])
  const [counts, setCounts] = useState<ContactCounts>({ unread: 0, total: 0, replied: 0 })
  const [sent, setSent] = useState<ContactReply[]>([])
  const [selected, setSelected] = useState<ContactMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listContacts({ status: filter || undefined })
      .then((r) => {
        setItems(r.items)
        setCounts(r.counts)
      })
      .catch(() => setError('Không tải được danh sách liên hệ'))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => {
    if (tab === 'inbox') load()
    else if (tab === 'sent') adminApi.listSentReplies().then((r) => setSent(r.items)).catch(() => setError('Không tải được mục đã gửi'))
  }, [tab, load])

  async function open(id: number) {
    setError(null)
    try {
      const r = await adminApi.getContact(id)
      setSelected(r.item)
      // cập nhật trạng thái đã đọc trong danh sách + badge
      setItems((prev) => prev.map((m) => (m.id === id ? { ...m, status: r.item.status } : m)))
      setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - (items.find((m) => m.id === id)?.status === 'UNREAD' ? 1 : 0)) }))
    } catch {
      setError('Không mở được tin nhắn')
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Chăm sóc khách hàng</h1>
        {counts.unread > 0 && (
          <span className="rounded-full bg-red-900 px-2.5 py-0.5 text-xs font-medium text-red-200">{counts.unread} chưa đọc</span>
        )}
      </div>

      <div className="mb-4 flex gap-2 border-b border-slate-800">
        <TabBtn active={tab === 'inbox'} onClick={() => { setTab('inbox'); setSelected(null) }}>Hộp thư{counts.unread ? ` (${counts.unread})` : ''}</TabBtn>
        <TabBtn active={tab === 'sent'} onClick={() => { setTab('sent'); setSelected(null) }}>Đã gửi</TabBtn>
        <TabBtn active={tab === 'subscribers'} onClick={() => { setTab('subscribers'); setSelected(null) }}>Đăng ký nhận ưu đãi</TabBtn>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}
      {msg && <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">{msg}</div>}

      {tab === 'subscribers' ? (
        <SubscribersList onError={(e) => setError(e)} onMsg={(m) => setMsg(m)} />
      ) : tab === 'sent' ? (
        <SentList items={sent} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          {/* Danh sách hộp thư */}
          <div>
            <div className="mb-3 flex gap-2">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className={field}>
                <option value="INBOX">Hộp thư (chưa trả lời)</option>
                <option value="UNREAD">Chưa đọc</option>
                <option value="READ">Đã đọc</option>
                <option value="REPLIED">Đã trả lời</option>
                <option value="">Tất cả</option>
              </select>
            </div>
            {loading ? (
              <p className="text-slate-500">Đang tải...</p>
            ) : items.length === 0 ? (
              <p className="text-slate-500">Không có tin nhắn.</p>
            ) : (
              <div className="space-y-2">
                {items.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => open(m.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                      selected?.id === m.id ? 'border-emerald-600 bg-slate-900' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate ${m.status === 'UNREAD' ? 'font-bold text-white' : 'text-slate-300'}`}>
                        {m.status === 'UNREAD' && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />}
                        {m.name}
                      </span>
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">{TYPE_LABEL[m.type]}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-400">
                      {m.bookingCode && <span className="mr-1 rounded bg-emerald-950 px-1 text-[11px] text-emerald-300">🧾 {m.bookingCode}</span>}
                      {m.subject || m.body}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">{fmt(m.createdAt)} · {STATUS_LABEL[m.status]}{m._count?.replies ? ` · ${m._count.replies} trả lời` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chi tiết + trả lời */}
          <div>
            {selected ? (
              <ContactDetail
                key={selected.id}
                item={selected}
                onReplied={() => {
                  setMsg('✓ Đã gửi email trả lời.')
                  load()
                  adminApi.getContact(selected.id).then((r) => setSelected(r.item)).catch(() => {})
                }}
                onError={(e) => setError(e)}
                onStatus={() => load()}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">
                Chọn một tin nhắn để xem và trả lời.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ContactDetail({
  item,
  onReplied,
  onError,
  onStatus,
}: {
  item: ContactMessage
  onReplied: () => void
  onError: (e: string) => void
  onStatus: () => void
}) {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    try {
      await adminApi.replyContact(item.id, body.trim(), files)
      setBody('')
      setFiles([])
      if (fileRef.current) fileRef.current.value = ''
      onReplied()
    } catch (err) {
      onError(err instanceof AdminApiError ? err.message : 'Gửi trả lời thất bại')
    } finally {
      setSending(false)
    }
  }

  async function markUnread() {
    try {
      await adminApi.setContactStatus(item.id, 'UNREAD')
      onStatus()
    } catch {
      onError('Không đổi được trạng thái')
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-100">{item.subject || '(Không có tiêu đề)'}</h2>
          <div className="mt-0.5 text-sm text-slate-400">
            {item.name} · <a href={`mailto:${item.email}`} className="text-emerald-400 hover:underline">{item.email}</a>
            {item.phone && ` · ${item.phone}`}
          </div>
          <div className="text-xs text-slate-600">
            {TYPE_LABEL[item.type]} · {fmt(item.createdAt)}
            {item.bookingCode && (
              <> · <Link to={`/admin/orders/${item.bookingCode}`} className="font-mono text-emerald-400 hover:text-emerald-300">🧾 Đơn {item.bookingCode}</Link></>
            )}
          </div>
        </div>
        <button onClick={markUnread} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">
          Đánh dấu chưa đọc
        </button>
      </div>

      <p className="whitespace-pre-line rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-200">{item.body}</p>

      {/* Lịch sử trả lời (theo dõi liên lạc) */}
      {item.replies && item.replies.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-slate-500">Lịch sử trả lời ({item.replies.length})</p>
          {item.replies.map((r) => (
            <div key={r.id} className="rounded-lg border-l-2 border-emerald-700 bg-slate-900 px-3 py-2">
              <p className="text-xs text-emerald-400">Đã gửi · {fmt(r.sentAt)} → {r.toEmail}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-300">{r.body}</p>
              {r.attachments && r.attachments.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {r.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:text-emerald-300">
                      📎 {a.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Soạn trả lời qua email */}
      <form onSubmit={send} className="mt-4 space-y-2 border-t border-slate-800 pt-4">
        <p className="text-sm font-medium text-slate-300">Trả lời qua email tới {item.email}</p>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Nội dung trả lời..." className={`${field} min-h-28 w-full`} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.csv,text/csv,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
            className="text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
          {files.length > 0 && <span className="text-xs text-slate-500">{files.length} tệp (ảnh/PDF/CSV, tối đa 5)</span>}
        </div>
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? 'Đang gửi...' : '✉ Gửi email trả lời'}
        </button>
      </form>
    </div>
  )
}

function SentList({ items }: { items: ContactReply[] }) {
  if (items.length === 0) return <p className="text-slate-500">Chưa gửi email trả lời nào.</p>
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-200">→ {r.message?.name || r.toEmail} <span className="text-slate-500">({r.toEmail})</span></span>
            <span className="text-xs text-slate-600">{fmt(r.sentAt)}</span>
          </div>
          {r.message?.subject && <div className="mt-0.5 text-xs text-slate-500">Chủ đề: {r.message.subject}</div>}
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-400">{r.body}</p>
          {r.attachments && r.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {r.attachments.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:text-emerald-300">📎 {a.name}</a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SubscribersList({ onError, onMsg }: { onError: (e: string) => void; onMsg: (m: string) => void }) {
  const [items, setItems] = useState<NewsletterSubscriber[]>([])
  const [counts, setCounts] = useState<SubscriberCounts>({ subscribed: 0, total: 0 })
  const [filter, setFilter] = useState('') // '' | SUBSCRIBED | UNSUBSCRIBED
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listSubscribers({ status: filter || undefined })
      .then((r) => {
        setItems(r.items)
        setCounts(r.counts)
      })
      .catch(() => onError('Không tải được danh sách đăng ký'))
      .finally(() => setLoading(false))
  }, [filter, onError])

  useEffect(() => { load() }, [load])

  async function toggle(s: NewsletterSubscriber) {
    const next = s.status === 'SUBSCRIBED' ? 'UNSUBSCRIBED' : 'SUBSCRIBED'
    try {
      await adminApi.setSubscriberStatus(s.id, next)
      onMsg(next === 'UNSUBSCRIBED' ? '✓ Đã hủy nhận ưu đãi.' : '✓ Đã khôi phục nhận ưu đãi.')
      load()
    } catch {
      onError('Không đổi được trạng thái')
    }
  }

  async function remove(s: NewsletterSubscriber) {
    if (!window.confirm(`Xóa ${s.email} khỏi danh sách nhận ưu đãi?`)) return
    try {
      await adminApi.deleteSubscriber(s.id)
      onMsg('✓ Đã xóa khỏi danh sách.')
      load()
    } catch {
      onError('Không xóa được')
    }
  }

  function exportCsv() {
    const header = 'Email,Trạng thái,Nguồn,Ngày đăng ký\n'
    const rows = items
      .map((s) => `${s.email},${s.status === 'SUBSCRIBED' ? 'Đang nhận' : 'Đã hủy'},${s.source || ''},${fmt(s.createdAt)}`)
      .join('\n')
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dang-ky-nhan-uu-dai-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={field}>
          <option value="">Tất cả ({counts.total})</option>
          <option value="SUBSCRIBED">Đang nhận ({counts.subscribed})</option>
          <option value="UNSUBSCRIBED">Đã hủy</option>
        </select>
        <span className="text-sm text-slate-400">
          {counts.subscribed} đang nhận · {counts.total} tổng
        </span>
        {items.length > 0 && (
          <button onClick={exportCsv} className="ml-auto rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
            ⬇ Xuất CSV
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Chưa có ai đăng ký nhận ưu đãi.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Trạng thái</th>
                <th className="px-4 py-2.5">Ngày đăng ký</th>
                <th className="px-4 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((s) => (
                <tr key={s.id} className="bg-slate-950">
                  <td className="px-4 py-2.5">
                    <a href={`mailto:${s.email}`} className="text-emerald-400 hover:underline">{s.email}</a>
                    {s.source && <span className="ml-2 text-xs text-slate-600">({s.source})</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.status === 'SUBSCRIBED' ? (
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">Đang nhận</span>
                    ) : (
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">Đã hủy</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{fmt(s.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => toggle(s)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">
                      {s.status === 'SUBSCRIBED' ? 'Hủy nhận' : 'Khôi phục'}
                    </button>
                    <button onClick={() => remove(s)} className="ml-2 rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950">
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

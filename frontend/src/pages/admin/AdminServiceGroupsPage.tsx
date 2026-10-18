import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi, type ServiceGroup, type ServiceGroupMembers } from '../../lib/adminApi'

const field = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

// Quản lý nhóm dịch vụ: cây phân cấp (theo vùng/địa phương) gom tour/homestay/bài viết.
export function AdminServiceGroupsPage() {
  const [tree, setTree] = useState<ServiceGroup[]>([])
  const [flat, setFlat] = useState<ServiceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [members, setMembers] = useState<ServiceGroupMembers | null>(null)

  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string>('')

  const load = useCallback(() => {
    setLoading(true)
    adminApi
      .listServiceGroups()
      .then((r) => {
        setTree(r.tree)
        setFlat(r.flat)
      })
      .catch(() => setError('Không tải được nhóm dịch vụ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => load(), [load])

  const loadMembers = useCallback((id: number) => {
    setSelectedId(id)
    adminApi.getServiceGroupMembers(id).then(setMembers).catch(() => setError('Không tải được thành viên nhóm'))
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newName.trim()) return
    try {
      await adminApi.createServiceGroup({ name: newName.trim(), parentId: newParent ? Number(newParent) : null })
      setNewName('')
      setNewParent('')
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tạo nhóm thất bại')
    }
  }

  async function rename(g: ServiceGroup) {
    const name = window.prompt('Tên nhóm mới:', g.name)
    if (!name || !name.trim()) return
    try {
      await adminApi.updateServiceGroup(g.id, { name: name.trim() })
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Đổi tên thất bại')
    }
  }

  async function addChild(parent: ServiceGroup) {
    const name = window.prompt(`Tên nhóm con trong "${parent.name}":`, '')
    if (!name || !name.trim()) return
    try {
      await adminApi.createServiceGroup({ name: name.trim(), parentId: parent.id })
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Tạo nhóm con thất bại')
    }
  }

  async function remove(g: ServiceGroup) {
    if (!window.confirm(`Xóa nhóm "${g.name}"? Nhóm con sẽ trở thành nhóm gốc, các gắn kết sẽ bị gỡ.`)) return
    try {
      await adminApi.deleteServiceGroup(g.id)
      if (selectedId === g.id) {
        setSelectedId(null)
        setMembers(null)
      }
      load()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Xóa thất bại')
    }
  }

  function renderNode(g: ServiceGroup, depth: number) {
    const total = (g._count?.tours ?? 0) + (g._count?.properties ?? 0) + (g._count?.guides ?? 0)
    return (
      <div key={g.id}>
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${selectedId === g.id ? 'bg-slate-900' : 'hover:bg-slate-900/50'}`}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
        >
          <button onClick={() => loadMembers(g.id)} className="min-w-0 flex-1 text-left">
            <span className="text-slate-200">{g.name}</span>
            {total > 0 && <span className="ml-2 text-xs text-slate-500">({total})</span>}
          </button>
          <button onClick={() => addChild(g)} title="Thêm nhóm con" className="text-xs text-emerald-400 hover:underline">+ con</button>
          <button onClick={() => rename(g)} title="Đổi tên" className="text-xs text-slate-400 hover:underline">sửa</button>
          <button onClick={() => remove(g)} title="Xóa" className="text-xs text-red-400 hover:underline">xóa</button>
        </div>
        {g.children && g.children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">Nhóm dịch vụ</h1>
      <p className="mb-4 text-sm text-slate-500">
        Tạo cây nhóm theo vùng/địa phương (vd: Tây Bắc → Sapa) gom tour, homestay và bài viết — phục vụ tìm kiếm, lọc, khuyến mãi và báo cáo theo nhóm.
      </p>

      {error && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">⚠️ {error}</div>}

      <form onSubmit={create} className="mb-4 flex flex-wrap gap-2">
        <input className={`${field} flex-1`} placeholder="Tên nhóm mới..." value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select className={field} value={newParent} onChange={(e) => setNewParent(e.target.value)}>
          <option value="">— Nhóm gốc —</option>
          {flat.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button type="submit" disabled={!newName.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          + Thêm nhóm
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          {loading ? (
            <p className="text-slate-500">Đang tải...</p>
          ) : tree.length === 0 ? (
            <p className="text-slate-500">Chưa có nhóm nào.</p>
          ) : (
            tree.map((g) => renderNode(g, 0))
          )}
        </div>

        <div>
          {members ? (
            <MembersPanel key={members.group.id} data={members} onChanged={() => { loadMembers(members.group.id); load() }} />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">
              Chọn một nhóm để quản lý tour/homestay/bài viết trong nhóm.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MembersPanel({ data, onChanged }: { data: ServiceGroupMembers; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)

  async function add(kind: 'tour' | 'property' | 'guide', itemId: number) {
    if (!itemId) return
    setError(null)
    try {
      await adminApi.addServiceGroupItem(data.group.id, kind, itemId)
      onChanged()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Thêm thất bại')
    }
  }
  async function remove(kind: 'tour' | 'property' | 'guide', itemId: number) {
    setError(null)
    try {
      await adminApi.removeServiceGroupItem(data.group.id, kind, itemId)
      onChanged()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Gỡ thất bại')
    }
  }

  const sections: { kind: 'tour' | 'property' | 'guide'; title: string; members: { id: number; name: string }[]; options: { id: number; name: string }[] }[] = [
    { kind: 'tour', title: 'Tour', members: data.members.tours.map((t) => ({ id: t.id, name: t.title })), options: data.options.tours.map((t) => ({ id: t.id, name: t.title })) },
    { kind: 'property', title: 'Homestay', members: data.members.properties.map((p) => ({ id: p.id, name: p.name })), options: data.options.properties.map((p) => ({ id: p.id, name: p.name })) },
    { kind: 'guide', title: 'Bài viết (cẩm nang)', members: data.members.guides.map((g) => ({ id: g.id, name: g.title })), options: data.options.guides.map((g) => ({ id: g.id, name: g.title })) },
  ]

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
      <h2 className="mb-3 font-semibold text-slate-100">Thành viên nhóm: {data.group.name}</h2>
      {error && <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</div>}
      <div className="space-y-4">
        {sections.map((s) => {
          const memberIds = new Set(s.members.map((m) => m.id))
          const available = s.options.filter((o) => !memberIds.has(o.id))
          return (
            <div key={s.kind}>
              <p className="mb-1.5 text-sm font-medium text-slate-300">{s.title} <span className="text-slate-500">({s.members.length})</span></p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {s.members.length === 0 && <span className="text-xs text-slate-600">Chưa có.</span>}
                {s.members.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200">
                    {m.name}
                    <button onClick={() => remove(s.kind, m.id)} className="text-slate-400 hover:text-red-400" title="Gỡ">✕</button>
                  </span>
                ))}
              </div>
              <select
                className={field}
                value=""
                onChange={(e) => e.target.value && add(s.kind, Number(e.target.value))}
              >
                <option value="">+ Thêm {s.title.toLowerCase()}...</option>
                {available.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

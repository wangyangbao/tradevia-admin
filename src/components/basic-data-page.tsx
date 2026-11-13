import { CatalogPage } from '@/components/catalog-page'
import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, ClipboardList, Eye, FileClock, FolderTree, ImagePlus, Layers3, LockKeyhole, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ManagementFilters, ManagementHeader, ManagementSummary } from '@/components/management-layout'
import { exportCsv } from '@/components/records'
import { useOrganization } from '@/lib/organization-context'
import { useAuth } from '@/lib/auth-context'
import { getScope, readOrganization } from '@/lib/organization'
import { addArchiveRate, archiveDefinitions, archiveStorageKey, basicPages, canMaintainArchives, currentRate, readArchives, referenceCount, relatedArchives, removeArchive, saveArchive, today, toggleArchive } from '@/lib/basic-data'
import type { Archive, ArchiveState, BasicPage, Field } from '@/lib/basic-data'
import { categoryCustomerStats, readCustomers, visibleCustomers } from '@/lib/customers'
import type { CustomerState } from '@/lib/customers'
import '@/styles/basic-data.css'

type Action = { kind: 'toggle' | 'remove'; row: Archive }
const pageSize = 10
const eventTimestamp = () => new Date().toISOString()
const timestamp = (at: string) => new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const blank = (kind: BasicPage): Archive => ({ id: crypto.randomUUID(), kind, code: '', name: '', en: '', active: true, sort: 10, note: '', refs: 0, selling: 0, updatedAt: '', values: Object.fromEntries(archiveDefinitions[kind].fields.map(f => [f.key, f.type === 'checkbox' ? false : f.options?.[0] ?? (f.type === 'number' ? f.min ?? 0 : f.type === 'date' ? today() : '')])) })
export function BasicDataPage({ page }: { page: BasicPage }) {
  const org = useOrganization()
  if (!org.scope) return <div className="org-no-access"><LockKeyhole size={30} /><h2>请先加入业务组织</h2><p>分配组织后即可查看本租户的基础档案。</p></div>
  return <ArchiveWorkspace key={`${org.tenantId}:${page}`} page={page} />
}
function ArchiveWorkspace({ page: initialPage }: { page: BasicPage }) {
  const [page, setPage] = useState(initialPage)
  const hasDirectory = initialPage !== 'outletCategories'
  const selectArchive = (next: BasicPage) => { setPage(next); setSearch(''); setStatus('all'); setCategory('all'); setIndex(1); setDraft(null); setDetail(null); setAction(null); setRateRow(null); setShowLogs(false); setFormError('') }
  const org = useOrganization(), { user } = useAuth()
  const [loaded, setLoaded] = useState(() => { try { return { state: readArchives(org.tenantId), error: '' } } catch (error) { return { state: null, error: (error as Error).message } } })
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [category, setCategory] = useState('all'), [index, setIndex] = useState(1)
  const [draft, setDraft] = useState<Archive | null>(null), [detail, setDetail] = useState<Archive | null>(null), [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState(''), [formError, setFormError] = useState(''), [rateRow, setRateRow] = useState<Archive | null>(null), [rate, setRate] = useState(''), [rateDate, setRateDate] = useState(today)
  const editingRevision = useRef(0)
  const [showLogs, setShowLogs] = useState(false), [showGuide, setShowGuide] = useState(false)
  const editable = canMaintainArchives(org.state, org.scope)
  const def = archiveDefinitions[page]
  useEffect(() => {
    const sync = () => { try { setLoaded({ state: readArchives(org.tenantId), error: '' }) } catch (error) { setLoaded({ state: null, error: (error as Error).message }) } }
    const storage = (event: StorageEvent) => { if (!event.key || event.key === archiveStorageKey(org.tenantId)) sync() }
    window.addEventListener('storage', storage); window.addEventListener('focus', sync); window.addEventListener('tradevia-catalog-change', sync)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('focus', sync); window.removeEventListener('tradevia-catalog-change', sync) }
  }, [org.tenantId])
  const [customerSnapshot, setCustomerSnapshot] = useState<{ state: CustomerState | null; error: string }>(() => { try { return { state: readCustomers(org.tenantId), error: '' } } catch (e) { return { state: null, error: (e as Error).message } } })
  useEffect(() => {
    const sync = () => { try { setCustomerSnapshot({ state: readCustomers(org.tenantId), error: '' }) } catch (e) { setCustomerSnapshot({ state: null, error: (e as Error).message }) } }
    window.addEventListener('storage', sync); window.addEventListener('focus', sync); window.addEventListener('tradevia-customers-change', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); window.removeEventListener('tradevia-customers-change', sync) }
  }, [org.tenantId])
  const categoryCustomers = customerSnapshot.state ? visibleCustomers(customerSnapshot.state, org.state, org.scope) : []
  const categoryStats = (id: string) => customerSnapshot.state && loaded.state ? categoryCustomerStats(customerSnapshot.state, id, loaded.state, categoryCustomers) : null
  const state = loaded.state
  const refCount = (row: Archive) => referenceCount(state!, row, row.kind === 'outletCategories' && customerSnapshot.state ? categoryCustomers.filter(c => c.categoryId === row.id).length : row.refs)
  const commit = (operation: (latest: ArchiveState, latestOrg: ReturnType<typeof readOrganization>, scope: ReturnType<typeof getScope>) => ArchiveState, actionName: string, why = '', expectedRevision = state?.revision) => {
    if (!user || !state || loaded.error) throw new Error(loaded.error || '当前无法保存，请刷新后重试。')
    const latest = readArchives(org.tenantId)
    if (latest.revision !== expectedRevision) {
      setLoaded({ state: latest, error: '' })
      throw new Error('其他页面已更新档案，列表已刷新。请取消并重新打开本次操作，核对后再保存。')
    }
    const latestOrg = readOrganization(), scope = getScope(latestOrg, user, org.tenantId)
    const next = operation(latest, latestOrg, scope)
    const at = eventTimestamp()
    next.revision = latest.revision + 1
    next.logs = [...next.logs, { id: crypto.randomUUID(), actor: scope?.email ?? '', action: actionName, reason: why, at }]
    try { localStorage.setItem(archiveStorageKey(org.tenantId), JSON.stringify(next)) } catch { throw new Error('保存失败，浏览器存储空间不足或不可用。请处理后重试，当前修改尚未保存。') }
    setLoaded({ state: next, error: '' })
  }
  const rows = state?.rows.filter(r => r.kind === page) ?? []
  const filterField = def.fields.find(f => ['type', 'scene', 'channelId', 'divisionId', 'storage', 'category'].includes(f.key))
  const options = (field: Field, editing?: Archive): { value: string; label: string; disabled?: boolean }[] => {
    if (field.source === 'divisions') return org.state.units.filter(u => u.tenantId === org.tenantId && u.level === 2).map(u => ({ value: u.id, label: `${u.name}${u.active ? '' : '（已停用）'}`, disabled: !u.active }))
    if (field.source) return (state?.rows ?? []).filter(r => r.kind === field.source && r.id !== editing?.id && (field.key !== 'baseId' || (r.values.base && (!editing || r.values.type === editing.values.type)))).map(r => ({ value: r.id, label: `${r.name} · ${r.code}${r.active ? '' : '（已停用）'}`, disabled: !r.active }))
    return (field.options ?? []).map(value => ({ value, label: value }))
  }
  const fieldText = (row: Archive, key: string): string => {
    if (!state) return '—'
    if (key === 'selling') return `${row.selling} 个在售商品`
    if (key === 'rate') { const value = currentRate(state, row.id); return value ? `${value.rate.toFixed(6)} PHP` : '尚未生效' }
    if (key === 'base') return page === 'currencies' ? (row.values.base ? '本位币' : '辅助币种') : row.values.base ? '基本单位' : '换算单位'
    if (key === 'factor') return row.values.base ? '1' : `1 ${row.name} = ${row.values.factor} ${state.rows.find(r => r.id === row.values.baseId)?.name ?? '—'}`
    const value = row.values[key]
    if (typeof value === 'boolean') return value ? '是' : '否'
    const field = def.fields.find(f => f.key === key)
    if (field?.source === 'divisions') return org.state.units.find(u => u.id === value)?.name ?? '所属事业部'
    if (field?.source) return state.rows.find(r => r.id === value)?.name ?? '—'
    return value === '' || value === undefined ? '—' : String(value)
  }
  const filtered = rows.filter(r => (status === 'all' || r.active === (status === 'active')) && (category === 'all' || String(r.values[filterField?.key ?? '']) === category) && `${r.code} ${r.name} ${r.en}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(index, pages)
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize)
  const startEdit = (row?: Archive) => { editingRevision.current = state?.revision ?? 0; setFormError(''); setDraft(row ? structuredClone(row) : blank(page)) }
  const setValue = (key: string, value: string | number | boolean) => setDraft(previous => {
    if (!previous) return previous
    const values = { ...previous.values, [key]: value }
    if (page === 'unitArchives' && key === 'base' && value) { values.factor = 1; values.baseId = '' }
    if (page === 'outletCategories' && key === 'parentId' && value) values.channelId = state?.rows.find(r => r.id === value)?.values.channelId ?? ''
    if (page === 'settlementMethods' && key === 'type') values.credit = value === '赊销'
    return { ...previous, values }
  })
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft) return
    try {
      const existing = rows.some(r => r.id === draft.id)
      commit((s, o, sc) => saveArchive(s, draft, o, sc), `${existing ? '编辑' : '新增'}${def.singular}：${draft.name}`, '', editingRevision.current)
      setDraft(null); toast.success(`${def.singular}已保存`)
    } catch (error) { setFormError((error as Error).message) }
  }
  const confirmAction = (event: React.FormEvent) => {
    event.preventDefault()
    if (!action || !reason.trim()) return
    try {
      const name = action.kind === 'remove' ? '删除' : action.row.active ? '停用' : '启用'
      commit((s, o, sc) => action.kind === 'remove' ? removeArchive(s, action.row.id, o, sc) : toggleArchive(s, action.row.id, o, sc), `${name}${def.singular}：${action.row.name}`, reason.trim(), editingRevision.current)
      setAction(null); toast.success(`已${name}“${action.row.name}”`)
    } catch (error) { setFormError((error as Error).message) }
  }
  const exportRows = () => {
    exportCsv(['编码', '中文名称', '英文名称', ...def.columns.map(k => def.fields.find(f => f.key === k)?.label ?? ({ base: '单位属性', selling: '在售商品', rate: '当前汇率' }[k] ?? k)), '引用数', '排序号', '状态', '备注'], filtered.map(r => [r.code, r.name, r.en, ...def.columns.map(k => fieldText(r, k)), refCount(r), r.sort, r.active ? '启用' : '停用', r.note]), `${def.title}-${today()}.csv`)
    toast.success(`已导出当前筛选的 ${filtered.length} 条档案`)
  }
  const labelFor = (key: string) => def.fields.find(f => f.key === key)?.label ?? ({ base: page === 'currencies' ? '币种属性' : '单位属性', selling: '商品状态', rate: '当前汇率' }[key] ?? key)
  const existing = !!draft && rows.some(r => r.id === draft.id)
  const lockedKeys = draft && existing && refCount(draft) > 0 ? page === 'unitArchives' ? ['factor', 'base', 'baseId', 'type', 'precision'] : page === 'currencies' ? ['symbol', 'precision', 'base'] : page === 'brands' ? ['divisionId'] : page === 'settlementMethods' ? ['type', 'credit'] : page === 'businessReasons' ? ['scene'] : [] : []
  return <div className={`basic-data-page management-page ${!hasDirectory ? 'store-classifications' : ''}`}>
    <div className="basic-intro"><div><span className="basic-module-icon"><Layers3 size={19} /></span><div><span className="basic-eyebrow">{hasDirectory ? '基础数据' : '门店管理'} <ChevronRight size={11} />{def.group}</span><p>{def.description}</p></div></div><button onClick={() => setShowGuide(true)}><CircleHelp size={14} />档案使用说明</button></div>
    <div className="basic-workspace">
      {hasDirectory && <aside className="basic-directory" aria-label="基础档案分类"><div className="basic-directory-title"><BookOpen size={15} /><strong>基础档案</strong><span>{basicPages.length}</span></div>{['商品基础', '客户与渠道', '业务规则'].map(group => <div className="basic-directory-group" key={group}><p>{group}</p>{basicPages.filter(p => archiveDefinitions[p].group === group).map(p => <button type="button" key={p} onClick={() => selectArchive(p)} aria-current={page === p ? 'page' : undefined} className={page === p ? 'selected' : ''}><span>{archiveDefinitions[p].title}</span><small>{state?.rows.filter(r => r.kind === p).length ?? '—'}</small></button>)}</div>)}<div className="basic-directory-note"><ShieldCheck size={16} /><span>总部统一维护<br />各业务组织共享使用</span></div></aside>}
      {page === 'productCategories' ? <CatalogPage page="productCategories" /> : <section className="basic-panel">
        <ManagementHeader title={def.title} context={<span className="basic-access"><LockKeyhole size={11} />{editable ? '总部维护' : '仅查看'}</span>} actions={<><Button variant="outline" size="sm" onClick={() => setShowLogs(true)} disabled={!state}><FileClock size={14} />变更记录</Button><Button variant="outline" size="sm" onClick={exportRows} disabled={!state || !filtered.length}><ArrowDownToLine size={14} />导出</Button>{editable && <Button size="sm" onClick={() => startEdit()} disabled={!state}><Plus size={14} />新增{def.singular}</Button>}</>} />
        <ManagementFilters actions={<button className="basic-clear" onClick={() => { setSearch(''); setStatus('all'); setCategory('all'); setIndex(1) }}>重置</button>}><div className="basic-search"><Search size={14} /><Input aria-label="搜索档案" placeholder="搜索编码、中文或英文名称" value={search} onChange={e => { setSearch(e.target.value); setIndex(1) }} /></div><select aria-label="档案状态" value={status} onChange={e => { setStatus(e.target.value); setIndex(1) }}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select>{filterField && <select aria-label={filterField.label} value={category} onChange={e => { setCategory(e.target.value); setIndex(1) }}><option value="all">全部{filterField.label.replace('所属', '').replace('关联', '')}</option>{options(filterField).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}</ManagementFilters>
        <ManagementSummary items={[{ label: '档案总数', value: rows.length }, { label: '启用', value: rows.filter(r => r.active).length }, { label: '停用', value: rows.filter(r => !r.active).length }, { label: '筛选结果', value: filtered.length }]} trailing="按排序号升序展示" />
        {loaded.error ? <div className="basic-empty" role="alert"><LockKeyhole size={30} /><h2>暂时无法读取档案</h2><p>{loaded.error}</p><Button variant="outline" onClick={() => { try { setLoaded({ state: readArchives(org.tenantId), error: '' }) } catch (e) { toast.error((e as Error).message) } }}>重新读取</Button></div> : <div className="basic-table-scroll"><table className="basic-table"><thead><tr><th>编码 / 名称</th>{def.columns.map(k => <th key={k}>{labelFor(k)}</th>)}{page === 'outletCategories' && <><th>客户数 / 活跃</th><th title="含下级分类，按近三个完整自然月的成交金额计算">近 3 月月均销额</th></>}<th>引用</th><th>排序</th><th>状态</th><th className="basic-action-column">操作</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><button className="basic-record-name" onClick={() => setDetail(row)}>{page === 'brands' && row.values.logo ? <img src={String(row.values.logo)} alt="" /> : <span className={`basic-record-symbol ${row.active ? '' : 'inactive'}`}>{page === 'currencies' ? String(row.values.symbol) : row.name.slice(0, 1)}</span>}<span><strong>{row.name}{row.values.base && page === 'currencies' ? <i>本位币</i> : null}</strong><small>{row.code} <span>· {row.en}</span></small></span></button></td>{def.columns.map(k => <td key={k}>{['coldChain', 'keyOutlet', 'voucher', 'credit', 'freezer', 'explanation'].includes(k) ? <span className={row.values[k] ? 'basic-yes' : 'basic-muted'}>{row.values[k] ? <Check size={13} /> : '—'}{row.values[k] ? '是' : ''}</span> : fieldText(row, k)}</td>)}{page === 'outletCategories' && <><td>{categoryStats(row.id) ? `${categoryStats(row.id)!.count} / ${categoryStats(row.id)!.active}` : '读取失败'}</td><td>{categoryStats(row.id) ? `₱${(categoryStats(row.id)!.monthlySales / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td></>}<td><button className="basic-ref" onClick={() => setDetail(row)}>{refCount(row)} <ChevronRight size={10} /></button></td><td className="basic-muted">{row.sort}</td><td><span className={`basic-status ${row.active ? 'enabled' : ''}`}><span />{row.active ? '启用' : '停用'}</span></td><td className="basic-action-column"><div className="basic-row-actions"><button onClick={() => editable ? startEdit(row) : setDetail(row)}>{editable ? '编辑' : '查看'}</button>{page === 'currencies' && <button onClick={() => { setRateRow(row); setRate(''); setRateDate(today()); setFormError('') }}>汇率</button>}{editable && <><button disabled={!!(page === 'currencies' && row.values.base)} onClick={() => { editingRevision.current = state?.revision ?? 0; setAction({ kind: 'toggle', row }); setReason(''); setFormError('') }}>{row.active ? '停用' : '启用'}</button><button className="basic-delete" disabled={refCount(row) > 0 || row.selling > 0 || !!(page === 'currencies' && row.values.base)} title={refCount(row) ? '被引用的档案不可删除' : '删除档案'} onClick={() => { editingRevision.current = state?.revision ?? 0; setAction({ kind: 'remove', row }); setReason(''); setFormError('') }}>删除</button></>}</div></td></tr>)}</tbody></table>{!visible.length && <div className="basic-empty"><FolderTree size={32} /><h2>{rows.length ? '没有符合条件的档案' : '还没有这类基础档案'}</h2><p>{rows.length ? '请更换搜索关键词或重置筛选条件。' : editable ? '点击右上角新增，建立第一条档案。' : '请联系总部管理员维护。'}</p></div>}</div>}
        <div className="basic-table-footer"><span>共 {filtered.length} 条{filtered.length > 0 && ` · 第 ${(current - 1) * pageSize + 1}—${Math.min(current * pageSize, filtered.length)} 条`}</span><div><span>每页 {pageSize} 条</span><Button size="icon" variant="outline" aria-label="上一页" disabled={current === 1} onClick={() => setIndex(current - 1)}><ArrowLeft size={13} /></Button><strong>{current} / {pages}</strong><Button size="icon" variant="outline" aria-label="下一页" disabled={current === pages} onClick={() => setIndex(current + 1)}><ArrowRight size={13} /></Button></div></div>
      </section>}
    </div>
    <div className="basic-bottom-note"><ShieldCheck size={13} /><span>{def.usage}{page === 'outletCategories' && (customerSnapshot.error || ' 客户数与月均销额包含下级分类，仅统计当前组织范围内客户；月均取近三个完整自然月。')}</span></div>
    <Dialog open={!!draft} onOpenChange={open => !open && setDraft(null)}><DialogContent closeLabel="关闭" className="basic-dialog"><DialogHeader><DialogTitle>{existing ? '编辑' : '新增'}{def.singular}</DialogTitle><DialogDescription>编码创建后不可更改；中英文名称分别维护。{existing && draft && refCount(draft) > 0 ? '已引用档案的关键字段已锁定。' : '带 * 的字段为必填项。'}</DialogDescription></DialogHeader>{draft && <form onSubmit={save} className="basic-form"><div className="basic-form-grid"><div className="basic-field"><Label htmlFor="archive-code">{def.singular}编码 *</Label><Input id="archive-code" value={draft.code} disabled={existing} maxLength={def.maxCode} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder={`最多 ${def.maxCode} 位，如 ${page === 'currencies' ? 'EUR' : 'CODE01'}`} required /></div><div className="basic-field"><Label htmlFor="archive-sort">排序号 *</Label><Input id="archive-sort" type="number" min={0} max={9999} step="1" value={Number.isNaN(draft.sort) ? '' : draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value === '' ? NaN : Number(e.target.value) })} required /></div><div className="basic-field"><Label htmlFor="archive-name">中文名称 *</Label><Input id="archive-name" maxLength={page === 'unitArchives' ? 20 : 40} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required /></div><div className="basic-field"><Label htmlFor="archive-en">英文名称 *</Label><Input id="archive-en" maxLength={page === 'unitArchives' ? 20 : 80} value={draft.en} onChange={e => setDraft({ ...draft, en: e.target.value })} required /></div>
      {def.fields.filter(f => !(page === 'unitArchives' && f.key === 'baseId' && draft.values.base) && !(page === 'currencies' && existing && ['rate', 'rateDate'].includes(f.key))).map(field => {
        const disabled = lockedKeys.includes(field.key) || (page === 'currencies' && !!draft.values.base) || (page === 'unitArchives' && field.key === 'factor' && !!draft.values.base) || (page === 'outletCategories' && field.key === 'channelId' && !!draft.values.parentId) || (page === 'settlementMethods' && field.key === 'credit')
        return <div className={`basic-field ${field.type === 'image' ? 'full' : ''} ${field.type === 'checkbox' ? 'basic-checkbox-field' : ''}`} key={field.key}>
          {field.type === 'checkbox' ? <label htmlFor={`archive-${field.key}`}><input id={`archive-${field.key}`} type="checkbox" checked={!!draft.values[field.key]} disabled={disabled} onChange={e => setValue(field.key, e.target.checked)} />{field.label}</label> : <Label htmlFor={`archive-${field.key}`}>{field.label}{field.required ? ' *' : ''}{disabled ? <LockKeyhole size={11} /> : null}</Label>}
          {field.type === 'select' ? <select id={`archive-${field.key}`} value={String(draft.values[field.key] ?? '')} required={field.required} disabled={disabled} onChange={e => setValue(field.key, e.target.value)}><option value="">{field.required ? '请选择' : '无'}</option>{options(field, draft).map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select> : field.type === 'image' ? <div className="basic-image-upload">{draft.values.logo ? <img src={String(draft.values.logo)} alt="品牌标识预览" /> : <ImagePlus size={24} />}<input id={`archive-${field.key}`} type="file" accept="image/png" onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return
            if (file.type !== 'image/png' || file.size > 1024 * 1024) { setFormError('请选择不超过 1 MB 的 PNG 图片。'); e.target.value = ''; return }
            const targetId = draft.id
            try { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重试。')); reader.readAsDataURL(file) }); setDraft(d => d?.id === targetId ? { ...d, values: { ...d.values, logo: data } } : d); setFormError('') } catch (error) { setFormError((error as Error).message) }
          }} />{draft.values.logo && <button type="button" aria-label="移除品牌标识" onClick={() => setValue('logo', '')}><X size={15} /></button>}</div> : field.type !== 'checkbox' ? <Input id={`archive-${field.key}`} type={field.type ?? 'text'} required={field.required} disabled={disabled} min={field.min} max={field.max} step={field.step ?? '1'} maxLength={100} value={String(draft.values[field.key] ?? '')} onChange={e => setValue(field.key, field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} /> : null}
          {field.hint && <small>{field.hint}</small>}
        </div>
      })}<div className="basic-field full"><Label htmlFor="archive-note">备注</Label><textarea id="archive-note" maxLength={500} rows={2} value={draft.note} placeholder="可填写档案用途或维护说明（选填）" onChange={e => setDraft({ ...draft, note: e.target.value })} /></div></div>{formError && <p role="alert" className="basic-form-error">{formError}</p>}<div className="basic-form-footer"><span><ShieldCheck size={12} />新档案默认启用</span><Button type="button" variant="outline" onClick={() => setDraft(null)}>取消</Button><Button type="submit">保存档案</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open => !open && setAction(null)}><DialogContent closeLabel="关闭" className="basic-confirm"><DialogHeader><DialogTitle>{action?.kind === 'remove' ? '删除' : action?.row.active ? '停用' : '启用'}{def.singular}</DialogTitle><DialogDescription>{action?.row.name} · {action?.row.code}</DialogDescription></DialogHeader><form onSubmit={confirmAction}><div className="basic-confirm-note">{action?.kind === 'remove' ? '仅未被引用的档案可删除。删除后编码将保留，不可再次使用。' : action?.row.active ? `停用后不再供新业务选择，历史记录保留。系统将先校验关联档案${page === 'brands' ? '和在售商品' : ''}。` : '启用前会校验上级分类、基本单位及关联渠道的有效状态。'}</div><div className="basic-field"><Label htmlFor="archive-reason">操作原因 *</Label><textarea id="archive-reason" rows={3} required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="请填写本次操作原因" /></div>{formError && <p role="alert" className="basic-form-error">{formError}</p>}<div className="basic-form-footer"><Button type="button" variant="outline" onClick={() => setAction(null)}>取消</Button><Button variant={action?.kind === 'remove' ? 'destructive' : 'default'} disabled={!reason.trim()} type="submit">确认{action?.kind === 'remove' ? '删除' : action?.row.active ? '停用' : '启用'}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}><DialogContent closeLabel="关闭" className="basic-dialog"><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{detail?.code} · {detail?.en}</DialogDescription></DialogHeader>{detail && state && <div className="basic-detail-body"><dl className="basic-detail-grid">{def.columns.map(k => <div key={k}><dt>{labelFor(k)}</dt><dd>{fieldText(detail, k)}</dd></div>)}<div><dt>状态</dt><dd>{detail.active ? '启用' : '停用'}</dd></div><div><dt>最近更新</dt><dd>{timestamp(detail.updatedAt)}</dd></div></dl><div className="basic-detail-section"><h3><ClipboardList size={15} />引用情况 <span>{refCount(detail)}</span></h3>{relatedArchives(state, detail).map(r => <div className="basic-related" key={r.id}><span>{archiveDefinitions[r.kind].singular} · {r.name}</span><small>{r.active ? '启用' : '停用'}</small></div>)}{page === 'outletCategories' && categoryCustomers.filter(c => c.categoryId === detail.id).map(c => <a className="basic-related" key={c.id} href={`#outlets?customer=${encodeURIComponent(c.id)}`}><span>客户 · {c.name}</span><small>查看档案 <ChevronRight size={10} /></small></a>)}{page !== 'outletCategories' && detail.refs > 0 && <p>业务示例引用：{detail.refs} 条（商品、门店或单据的预置引用计数）。</p>}{detail.selling > 0 && <p>其中在售商品 {detail.selling} 个，停用品牌前须先下架。</p>}{!refCount(detail) && <p>暂无关联档案或业务引用。</p>}</div>{detail.note && <div className="basic-detail-section"><h3>备注</h3><p>{detail.note}</p></div>}<p className="basic-detail-hint">{page === 'outletCategories' ? '客户引用按当前组织可见档案实时计算，可直接打开关联客户。' : '关联档案按当前数据计算；业务示例引用为演示计数，后续由各业务模块实时提供。'}</p></div>}<div className="basic-form-footer"><Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>{editable && <Button onClick={() => { startEdit(detail!); setDetail(null) }}>编辑档案</Button>}</div></DialogContent></Dialog>
    <Dialog open={!!rateRow} onOpenChange={open => !open && setRateRow(null)}><DialogContent closeLabel="关闭" className="basic-dialog"><DialogHeader><DialogTitle>{rateRow?.name} · 汇率记录</DialogTitle><DialogDescription>1 {rateRow?.code} = N PHP。新增记录按日期生效，已有汇率记录不可覆盖。</DialogDescription></DialogHeader>{rateRow?.values.base ? <div className="basic-confirm-note">菲律宾比索为本位币，汇率固定为 1，无需维护。</div> : <>{editable && rateRow?.active && <form onSubmit={e => { e.preventDefault(); try { commit((s, o, sc) => addArchiveRate(s, rateRow!.id, Number(rate), rateDate, o, sc), `新增${rateRow!.code}汇率：${rate}；生效日 ${rateDate}`); setRate(''); setFormError(''); toast.success('汇率记录已保存') } catch (error) { setFormError((error as Error).message) } }}><div className="basic-rate-form"><div className="basic-field"><Label htmlFor="exchange-rate">折合 PHP *</Label><Input id="exchange-rate" type="number" required min="0.000001" max="1000000" step="0.000001" value={rate} onChange={e => setRate(e.target.value)} /></div><div className="basic-field"><Label htmlFor="exchange-date">生效日期 *</Label><Input id="exchange-date" type="date" required value={rateDate} onChange={e => setRateDate(e.target.value)} /></div><Button type="submit">新增记录</Button></div>{formError && <p className="basic-form-error" role="alert">{formError}</p>}</form>}<div className="basic-rate-history"><table className="basic-table"><thead><tr><th>生效日期</th><th>汇率（折合 PHP）</th><th>状态</th></tr></thead><tbody>{state?.rates.filter(r => r.currencyId === rateRow?.id).sort((a, b) => b.date.localeCompare(a.date)).map(r => <tr key={r.id}><td>{r.date}</td><td>{r.rate.toFixed(6)}</td><td>{r.date > today() ? '待生效' : currentRate(state, rateRow!.id)?.id === r.id ? '当前生效' : '历史记录'}</td></tr>)}</tbody></table></div></>}<p className="basic-detail-hint">预置汇率仅为演示数值，不代表实时市场汇率。历史单据应保留当时汇率。</p><Button variant="outline" onClick={() => setRateRow(null)}>关闭</Button></DialogContent></Dialog>
    <Dialog open={showLogs} onOpenChange={setShowLogs}><DialogContent closeLabel="关闭" className="basic-dialog"><DialogHeader><DialogTitle>基础档案变更记录</DialogTitle><DialogDescription>显示当前租户全部基础档案的维护记录。</DialogDescription></DialogHeader><div className="basic-log-list">{state?.logs.length ? [...state.logs].reverse().map(log => <div key={log.id}><FileClock size={15} /><div><strong>{log.action}</strong>{log.reason && <p>原因：{log.reason}</p>}<small>{log.actor} · {timestamp(log.at)}</small></div></div>) : <div className="basic-empty"><FileClock size={28} /><p>暂无变更记录，维护档案后将在这里留痕。</p></div>}</div><Button variant="outline" onClick={() => setShowLogs(false)}>关闭</Button></DialogContent></Dialog>
    <Dialog open={showGuide} onOpenChange={setShowGuide}><DialogContent closeLabel="关闭" className="basic-dialog"><DialogHeader><DialogTitle>基础档案使用说明</DialogTitle><DialogDescription>建立一次，全业务统一引用。</DialogDescription></DialogHeader><div className="basic-guide"><h3><ShieldCheck size={16} />维护与权限</h3><p>总部管理员统一维护本租户的档案，事业部、大区和经销商可以查看。不同租户独立保存，停用档案保留历史。</p><h3><Layers3 size={16} />本次补充的档案</h3><p>商品分类用于商品归类与效期预警；门店分类用于客户分层；结算方式用于收款要求；竞品档案用于市场采集；业务原因用于退货、报损、配送和拜访异常统计。</p><h3><Eye size={16} />当前档案用途</h3><p>{def.usage}</p><h3><LockKeyhole size={16} />删除与变更</h3><p>编码创建后锁定，被引用的档案不可删除；计量和归属等关键字段被使用后受限。停用和删除需填写原因，变更记录可追溯。</p><p className="basic-detail-hint">当前为浏览器内的交互演示，修改保存在本浏览器。基础档案之间已关联校验，订单、库存和门店业务的实时联动将在对应模块接入时完成。</p></div><Button onClick={() => setShowGuide(false)}>知道了</Button></DialogContent></Dialog>
  </div>
}

import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowDownToLine, Building2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleHelp, History, LockKeyhole, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOrganization } from '@/lib/organization-context'
import { departmentEnabled, departmentPath, descendants, levelNames, unitEnabled } from '@/lib/organization'
import type { Department, Person, Unit } from '@/lib/organization'
import { exportCsv } from './records'
import { ManagementHeader, ManagementFilters, ManagementSummary } from './management-layout'
import { PersonnelDirectory } from './personnel-directory'
import '@/styles/organization.css'

type OrgPage = 'businessUnits' | 'departments' | 'personnel'
type Edit = { kind: 'unit'; row: Unit; existing: boolean } | { kind: 'department'; row: Department; existing: boolean } | { kind: 'person'; row: Person; existing: boolean }
type Action = { kind: 'units' | 'departments' | 'people'; id: string; name: string; type: 'toggle' | 'delete' | 'password'; active: boolean }
const titles = { businessUnits: '业务单元', departments: '部门', personnel: '人员' }
const nextCode = (prefix: string) => `${prefix}-${Date.now().toString().slice(-9)}`
const todayInShanghai = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="org-field"><span>{label}</span>{children}</label> }
function Badge({ active }: { active: boolean }) { return <span className={`org-status ${active ? 'enabled' : ''}`}><i />{active ? '启用' : '停用'}</span> }
export function OrganizationPage({ page }: { page: OrgPage }) {
  const org = useOrganization()
  return <OrganizationWorkspace key={`${org.tenantId}-${org.scope?.unitId}-${page}`} page={page} />
}
function OrganizationWorkspace({ page }: { page: OrgPage }) {
  const org = useOrganization()
  const { state, units, departments, people, scope, tenantId } = org
  const root = units.find(u => u.id === scope?.unitId)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [type, setType] = useState('all'), [unitFilter, setUnitFilter] = useState('all')
  const [selected, setSelected] = useState<{ kind: 'unit' | 'department'; id: string } | null>(() => { const id = sessionStorage.getItem('tradevia-personnel-department'); if (page === 'personnel' && id && departments.some(d => d.id === id)) { return { kind: 'department', id } } return null })
  useEffect(() => { if (page === 'personnel') sessionStorage.removeItem('tradevia-personnel-department') }, [page])
  const expansionKey = `tradevia-unit-expanded-${scope?.email}-${tenantId}-${root?.id}`
  const [expanded, setExpanded] = useState<Set<string>>(() => { try { const stored = JSON.parse(sessionStorage.getItem(expansionKey) ?? 'null'); if (Array.isArray(stored)) return new Set(stored.filter(id => units.some(u => u.id === id))) } catch { /* Restore defaults. */ } return new Set(units.filter(u => u.level <= (root?.level ?? 1)).map(u => u.id)) })
  useEffect(() => { sessionStorage.setItem(expansionKey, JSON.stringify([...expanded])) }, [expansionKey, expanded])
  const [edit, setEdit] = useState<Edit | null>(null), [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState(''), [password, setPassword] = useState(''), [temporary, setTemporary] = useState<string | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [logOpen, setLogOpen] = useState(false), [helpOpen, setHelpOpen] = useState(false)
  const activeUnits = units.filter(u => unitEnabled(state, u.id))
  const statusMatch = (active: boolean) => status === 'all' || (status === 'active') === active
  const keyword = query.trim().toLowerCase()
  const matches = (value: string) => value.toLowerCase().includes(keyword)
  const departmentIds = selected?.kind === 'department' ? descendants(departments, selected.id) : null
  const unitIds = selected?.kind === 'unit' ? descendants(units, selected.id) : null
  const filteredPeople = people.filter(p => (!departmentIds || departmentIds.has(p.departmentId)) && (!unitIds || unitIds.has(p.unitId)) && statusMatch(p.active) && matches(`${p.name} ${p.code} ${p.email} ${p.phone}`))
  const filteredDepartments = departments.filter(d => (unitFilter === 'all' || d.unitId === unitFilter) && (!departmentIds || departmentIds.has(d.id)) && statusMatch(d.active) && matches(`${d.name} ${d.code} ${departmentPath(departments, d.id)}`)).sort((a, b) => a.unitId.localeCompare(b.unitId) || a.sort - b.sort)
  const matchingUnits = units.filter(u => statusMatch(u.active) && (type === 'all' || String(u.level) === type) && matches(`${u.name} ${u.code}`))
  const includedUnits = new Set(matchingUnits.map(u => u.id))
  matchingUnits.forEach(u => { let parent = units.find(p => p.id === u.parentId); while (parent) { includedUnits.add(parent.id); parent = units.find(p => p.id === parent!.parentId) } })
  const filteringUnits = !!keyword || type !== 'all' || status !== 'all'
  const unitName = (id: string) => units.find(u => u.id === id)?.name ?? '—'
  const countPeople = (id: string, kind: 'unit' | 'department') => { const ids = kind === 'unit' ? descendants(units, id) : descendants(departments, id); return people.filter(p => p.active && ids.has(kind === 'unit' ? p.unitId : p.departmentId)).length }
  const openEdit = (next: Edit) => { setError(''); setPassword(''); setEdit(next) }
  const newUnit = (parent: Unit) => openEdit({ kind: 'unit', existing: false, row: { ...parent, id: crypto.randomUUID(), parentId: parent.id, code: nextCode('BU'), name: '', level: parent.level + 1, manager: '', phone: '', address: '', taxId: '', active: true, businessRefs: 0, sort: 1, note: '', effectiveDate: todayInShanghai() } })
  const newDepartment = () => {
    const unitId = unitFilter !== 'all' ? unitFilter : activeUnits[0]?.id
    if (!unitId) { toast.error('请先创建并启用业务单元。'); return }
    openEdit({ kind: 'department', existing: false, row: { id: crypto.randomUUID(), tenantId, unitId, parentId: null, code: nextCode('DP'), name: '', manager: '', capacity: 0, sort: 1, active: true, note: '' } })
  }
  const newPerson = () => {
    const department = selected?.kind === 'department' ? departments.find(d => d.id === selected.id && departmentEnabled(state, d.id)) : departments.find(d => departmentEnabled(state, d.id) && activeUnits.some(u => u.id === d.unitId) && (!unitIds || unitIds.has(d.unitId)))
    if (!department) { toast.error('当前范围内没有可用部门，请先新增并启用部门。'); return }
    let next = Math.max(0, ...state.people.map(p => Number(p.code.replace('EMP-', ''))).filter(Number.isFinite)) + 1
    while (state.people.some(p => p.code === `EMP-${String(next).padStart(4, '0')}`)) next++
    openEdit({ kind: 'person', existing: false, row: { id: crypto.randomUUID(), tenantId, unitId: department.unitId, departmentId: department.id, code: `EMP-${String(next).padStart(4, '0')}`, name: '', email: '', phone: '', role: '成员', position: '其他', active: true, joinedAt: todayInShanghai(), note: '' } })
  }
  const setRow = (change: Record<string, unknown>) => setEdit(previous => previous ? { ...previous, row: { ...previous.row, ...change } } as Edit : null)
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!edit || busy) return
    setBusy(true); setError('')
    try {
      if (edit.kind === 'unit') await org.saveUnit(edit.row)
      else if (edit.kind === 'department') await org.saveDepartment(edit.row)
      else await org.savePerson({ ...edit.row, email: edit.row.email.trim().toLowerCase() }, password)
      setEdit(null); toast.success('已保存，组织与权限范围已更新')
    } catch (caught) { setError(caught instanceof Error ? (caught.message === 'emailTaken' ? '登录邮箱或手机号已被使用。' : caught.message === 'invalidPassword' ? '密码须为 8–72 位，并包含字母和数字。' : caught.message) : '保存失败，请重试。') }
    finally { setBusy(false) }
  }
  const openAction = (next: Action) => { setReason(''); setError(''); setAction(next) }
  const confirmAction = async (event: FormEvent) => {
    event.preventDefault(); if (!action || busy) return
    setBusy(true); setError('')
    try {
      if (action.type === 'password') setTemporary(await org.resetPassword(people.find(p => p.id === action.id)!))
      else if (action.type === 'delete') await org.remove(action.kind as 'units' | 'departments', action.id, reason)
      else await org.toggle(action.kind, action.id, reason)
      setAction(null); toast.success('操作已完成')
    } catch (caught) { setError(caught instanceof Error ? caught.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  const exportData = async () => {
    try {
      if (page === 'businessUnits') {
        if (!matchingUnits.length) return toast.error('当前没有可导出的记录。')
        await org.logExport('业务单元')
        exportCsv(['编码', '名称', '类型', '上级', '负责人', '联系电话', '状态'], matchingUnits.map(u => [u.code, u.name, levelNames[u.level - 1], units.some(p => p.id === u.parentId) ? unitName(u.parentId!) : '当前管理组织', u.manager, u.phone, u.active ? '启用' : '停用']), '业务单元.csv')
      } else if (page === 'departments') {
        if (!filteredDepartments.length) return toast.error('当前没有可导出的记录。')
        await org.logExport('部门')
        exportCsv(['编码', '部门名称', '业务单元', '层级路径', '负责人', '编制', '状态'], filteredDepartments.map(d => [d.code, d.name, unitName(d.unitId), departmentPath(departments, d.id), d.manager, d.capacity, d.active ? '启用' : '停用']), '部门.csv')
      } else {
        if (!filteredPeople.length) return toast.error('当前没有可导出的记录。')
        await org.logExport('人员')
        exportCsv(['工号', '姓名', '业务单元', '部门', '登录账号', '手机号', '角色', '状态'], filteredPeople.map(p => [p.code, p.name, unitName(p.unitId), departmentPath(departments, p.departmentId), p.email, p.phone, p.role, p.active ? '启用' : '停用']), '人员.csv')
      }
      toast.success('已按当前筛选范围导出')
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : '导出失败。') }
  }
  const rowActions = (kind: 'units' | 'departments' | 'people', row: Unit | Department | Person) => scope?.admin ? <div className="org-row-actions">
    <button onClick={() => openEdit({ kind: kind === 'units' ? 'unit' : kind === 'departments' ? 'department' : 'person', row: { ...row }, existing: true } as Edit)}>编辑</button>
    {kind === 'units' && <button disabled={(row as Unit).level === 4 || !row.active} title={(row as Unit).level === 4 ? '经销商为最末级' : '新增下一级组织'} onClick={() => newUnit(row as Unit)}>新增下级</button>}
    {kind === 'people' && <button disabled={(row as Person).email === scope.email} onClick={() => openAction({ kind, id: row.id, name: row.name, type: 'password', active: row.active })}>重置密码</button>}
    <button disabled={kind === 'people' && (row as Person).email === scope.email} onClick={() => openAction({ kind, id: row.id, name: row.name, type: 'toggle', active: row.active })}>{row.active ? '停用' : '启用'}</button>
    {kind !== 'people' && <button className="danger" onClick={() => openAction({ kind, id: row.id, name: row.name, type: 'delete', active: row.active })}>删除</button>}
  </div> : <span className="org-muted">仅查看</span>
  const renderUnit = (unit: Unit, depth: number): ReactNode => {
    if (!includedUnits.has(unit.id)) return null
    const children = units.filter(u => u.parentId === unit.id), isExpanded = filteringUnits || expanded.has(unit.id)
    return <tbody key={unit.id}><tr><td><div className="org-unit-name" style={{ paddingLeft: depth * 22 }}><button className="org-expand" disabled={!children.length} aria-label={`${isExpanded ? '收起' : '展开'}${unit.name}`} aria-expanded={children.length ? isExpanded : undefined} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id); return next })}>{children.length ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="org-leaf" />}</button><span className={`org-unit-icon level-${unit.level}`}><Building2 size={16} /></span><span><strong>{unit.name}</strong><small>{unit.code}{children.length ? ` · 下级 ${children.length}` : ''}</small></span></div></td><td><span className={`org-level level-${unit.level}`}>{levelNames[unit.level - 1]}</span></td><td>{unit.id === root?.id ? <span className="org-muted">当前管理组织</span> : unitName(unit.parentId!)}</td><td>{unit.manager}</td><td>{countPeople(unit.id, 'unit')} <span className="org-muted">人</span></td><td><Badge active={unit.active} /></td><td>{rowActions('units', unit)}</td></tr>{isExpanded && children.map(child => <tr className="org-tree-wrapper" key={child.id}><td colSpan={7}><table aria-label={`${child.name}下级组织`}><colgroup><col style={{ width: '27%' }} /><col style={{ width: '9%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '23%' }} /></colgroup>{renderUnit(child, depth + 1)}</table></td></tr>)}</tbody>
  }
  if (!scope || !root) return <div className="org-no-access"><ShieldCheck size={40} /><h1>尚未分配组织权限</h1><p>请联系管理员将你的账号加入租户并分配所属组织。也可以退出后使用演示账号检查各层级。</p></div>
  return <div className="organization-page">
    <ManagementHeader title={titles[page]} context={<><span className="management-scope" title={`${state.tenants.find(t => t.id === tenantId)?.name} · ${levelNames[root.level - 1]}${scope.admin ? '管理员' : '成员'}`}><Building2 size={14} />{root.name}</span><span className="management-scope-note"><ShieldCheck size={13} />仅本级及下级组织</span></>} actions={<><Button variant="ghost" size="icon" aria-label="组织架构使用说明" onClick={() => setHelpOpen(true)}><CircleHelp size={16} /></Button><Button variant="outline" onClick={() => setLogOpen(true)}><History size={14} />操作记录</Button>{scope.admin && <><Button variant="outline" onClick={exportData}><ArrowDownToLine size={14} />导出</Button><Button onClick={() => page === 'businessUnits' ? root.level < 4 ? newUnit(root) : toast.info('经销商为最末级，可通过部门管理内部团队。') : page === 'departments' ? newDepartment() : newPerson()} disabled={page === 'businessUnits' && root.level === 4}><Plus size={15} />{page === 'businessUnits' ? '新增下级业务单元' : page === 'departments' ? '新增部门' : '新增人员'}</Button></>}</>} />
    <ManagementSummary items={[{ label: '可见业务单元', value: units.length }, { label: '组织部门', value: departments.length }, { label: '范围内人员', value: people.length }, { label: '启用人员', value: people.filter(p => p.active).length }]} trailing={<>{units.filter(u => u.level === 4).length} 家经销商 · {departments.filter(d => d.active).length} 个启用部门</>} />
    <div className={page === 'personnel' ? 'org-people-layout management-content' : 'org-list-layout management-content'}>
      {page === 'personnel' && <PersonnelDirectory root={root} units={units} departments={departments} people={people} selected={selected} onSelect={setSelected} storageKey={`tradevia-personnel-expanded-${scope.email}-${tenantId}-${root.id}`} />}
      <section className="org-panel">
        <div className="org-panel-heading"><h2>{page === 'businessUnits' ? '组织关系' : page === 'departments' ? '部门列表' : selected ? selected.kind === 'unit' ? unitName(selected.id) : departmentPath(departments, selected.id) : '全部人员'}<span>{page === 'businessUnits' ? matchingUnits.length : page === 'departments' ? filteredDepartments.length : filteredPeople.length}</span></h2><span className="org-list-scope">{page === 'personnel' ? '包含下级部门人员' : page === 'departments' ? '按层级路径展示' : '四级业务单元'}</span></div>
        <ManagementFilters actions={<>{(keyword || status !== 'all' || type !== 'all' || unitFilter !== 'all' || (selected && page !== 'personnel')) && <button className="org-clear" onClick={() => { setQuery(''); setStatus('all'); setType('all'); setUnitFilter('all'); setSelected(null) }}><X size={13} />清除</button>}{page === 'businessUnits' && <button className="org-expand-all" onClick={() => setExpanded(expanded.size === units.length ? new Set() : new Set(units.map(u => u.id)))}>{expanded.size === units.length ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}{expanded.size === units.length ? '全部收起' : '全部展开'}</button>}</>}><div className="org-list-search"><Search size={15} /><Input aria-label="搜索当前列表" placeholder={page === 'personnel' ? '搜索姓名、工号、账号或手机' : '搜索名称或编码'} value={query} onChange={e => setQuery(e.target.value)} /></div>{page === 'businessUnits' && <select aria-label="业务单元类型" value={type} onChange={e => setType(e.target.value)}><option value="all">全部类型</option>{levelNames.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select>}{page === 'departments' && <select aria-label="筛选所属业务单元" value={unitFilter} onChange={e => { setUnitFilter(e.target.value); setSelected(null) }}><option value="all">全部业务单元</option>{units.map(u => <option value={u.id} key={u.id}>{u.name}</option>)}</select>}<select aria-label="筛选状态" value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></ManagementFilters>
        <div className="org-table-scroll">{page === 'businessUnits' ? <table className="org-table org-business-table"><colgroup><col style={{ width: '27%' }} /><col style={{ width: '9%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '23%' }} /></colgroup><thead><tr>{['业务单元', '类型', '上级组织', '负责人', '在职人数', '状态', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead>{renderUnit(root, 0)}</table> : page === 'departments' ? <table className="org-table"><thead><tr>{['部门名称 / 编码', '业务单元 / 层级路径', '负责人', '在职 / 编制', '状态', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{filteredDepartments.map(d => <tr key={d.id}><td><strong>{d.name}</strong><small>{d.code}</small></td><td><span>{unitName(d.unitId)}</span><div className="org-path">{departmentPath(departments, d.id).split(' / ').map((name, i) => { const ancestors: Department[] = []; let ancestor: Department | undefined = d; while (ancestor) { ancestors.unshift(ancestor); ancestor = departments.find(x => x.id === ancestor!.parentId) }; return <span key={i}>{i > 0 && ' / '}<button onClick={() => { setSelected({ kind: 'department', id: ancestors[i]?.id ?? d.id }); setUnitFilter(d.unitId) }}>{name}</button></span> })}</div></td><td>{d.manager || '—'}</td><td><button className="org-link" onClick={() => { sessionStorage.setItem('tradevia-personnel-department', d.id); location.hash = 'personnel' }}>{countPeople(d.id, 'department')}</button><span className="org-muted"> / {d.capacity || '未设置'}</span></td><td><Badge active={d.active} /></td><td>{rowActions('departments', d)}</td></tr>)}</tbody></table> : <table className="org-table org-person-table"><thead><tr>{['人员', '业务单元 / 部门', '登录账号 / 手机号', '角色', '账号状态', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{filteredPeople.map(p => <tr key={p.id}><td><div className="org-person-name"><span className="org-person-avatar">{p.name.slice(-2)}</span><span><strong>{p.name}{p.email === scope.email && <em>我</em>}</strong><small>{p.code} · {p.position}</small></span></div></td><td>{unitName(p.unitId)}<small>{departmentPath(departments, p.departmentId)}</small></td><td>{p.email}<small>{p.phone}</small></td><td><span className={`org-role ${p.role === '管理员' ? 'admin' : ''}`}>{p.role === '管理员' && <ShieldCheck size={12} />}{p.role}</span></td><td><Badge active={p.active} /></td><td>{rowActions('people', p)}</td></tr>)}</tbody></table>}</div>
        {(page === 'businessUnits' ? !matchingUnits.length : page === 'departments' ? !filteredDepartments.length : !filteredPeople.length) && <div className="org-empty"><Search size={28} /><strong>没有找到匹配的记录</strong><p>请调整搜索条件，或选择其他组织与部门。</p></div>}
        <div className="org-table-footer"><span>共 {page === 'businessUnits' ? matchingUnits.length : page === 'departments' ? filteredDepartments.length : filteredPeople.length} 条 · 当前权限范围内</span><span><ShieldCheck size={13} />{scope.admin ? '可管理' : '仅查看'}</span></div>
      </section>
    </div>
    <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy) setEdit(null) }}><DialogContent closeLabel="关闭" className="org-editor"><DialogHeader><DialogTitle>{edit?.existing ? '编辑' : '新增'}{edit?.kind === 'unit' ? '业务单元' : edit?.kind === 'department' ? '部门' : '人员'}</DialogTitle><DialogDescription>所属租户：{state.tenants.find(t => t.id === tenantId)?.name}。可选范围受当前账号权限限制。</DialogDescription></DialogHeader>{edit && <form onSubmit={save} className="org-form"><div className="org-form-grid">
      <Field label={edit.kind === 'person' ? '工号' : '编码'}><Input value={edit.row.code} onChange={e => setRow({ code: e.target.value })} maxLength={20} disabled={edit.existing || edit.kind === 'person'} required /></Field><Field label={edit.kind === 'person' ? '姓名 *' : '名称 *'}><Input value={edit.row.name} onChange={e => setRow({ name: e.target.value })} maxLength={edit.kind === 'unit' ? 60 : 40} disabled={edit.kind === 'unit' && !edit.row.active} required /></Field>
      {edit.kind === 'unit' ? <><Field label="业务单元类型"><Input value={levelNames[edit.row.level - 1]} disabled /></Field><Field label="上级业务单元"><Input value={units.some(u => u.id === (edit.row as Unit).parentId) ? unitName(edit.row.parentId!) : '当前管理组织'} disabled /></Field><Field label="负责人 *"><Input value={edit.row.manager} disabled={!edit.row.active} onChange={e => setRow({ manager: e.target.value })} required maxLength={40} /></Field><Field label="联系电话 *"><Input value={edit.row.phone} onChange={e => setRow({ phone: e.target.value })} required maxLength={20} /></Field><Field label="所在地址 *"><Input value={edit.row.address} disabled={!edit.row.active} onChange={e => setRow({ address: e.target.value })} maxLength={200} required /></Field><Field label="生效日期 *"><Input type="date" value={edit.row.effectiveDate} disabled={!edit.row.active} onChange={e => setRow({ effectiveDate: e.target.value })} required /></Field><Field label="默认币种"><select value={edit.row.currency} disabled={!edit.row.active} onChange={e => setRow({ currency: e.target.value })}>{['PHP', 'USD', 'CNY'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="默认语言"><select value={edit.row.language} disabled={!edit.row.active} onChange={e => setRow({ language: e.target.value })}><option>中文</option><option>英文</option></select></Field>{edit.row.level === 4 && <><Field label="纳税人识别号 *"><Input value={edit.row.taxId} disabled={!edit.row.active} maxLength={30} onChange={e => setRow({ taxId: e.target.value })} required /></Field><Field label="默认账期（天） *"><Input type="number" min={0} max={90} disabled={!edit.row.active} value={edit.row.creditDays} onChange={e => setRow({ creditDays: Number(e.target.value) })} required /></Field></>}</> : <><Field label="所属业务单元 *"><select value={edit.row.unitId} disabled={edit.existing && edit.kind === 'department'} onChange={e => setRow({ unitId: e.target.value, ...(edit.kind === 'department' ? { parentId: null, manager: '' } : { departmentId: '' }) })} required>{activeUnits.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>{edit.kind === 'department' ? <><Field label="上级部门"><select value={edit.row.parentId ?? ''} disabled={edit.existing} onChange={e => setRow({ parentId: e.target.value || null })}><option value="">无（一级部门）</option>{departments.filter(d => departmentEnabled(state, d.id) && d.unitId === (edit.row as Department).unitId && d.id !== edit.row.id).map(d => <option key={d.id} value={d.id}>{departmentPath(departments, d.id)}</option>)}</select></Field><Field label="部门负责人"><select value={edit.row.manager} onChange={e => setRow({ manager: e.target.value })}><option value="">暂不设置</option>{people.filter(p => p.active && descendants(departments, edit.row.id).has(p.departmentId)).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select></Field><Field label="编制人数"><Input type="number" min={0} value={edit.row.capacity} onChange={e => setRow({ capacity: Number(e.target.value) })} /></Field></> : <><Field label="所属部门 *"><select value={edit.row.departmentId} onChange={e => setRow({ departmentId: e.target.value })} required><option value="">请选择部门</option>{departments.filter(d => d.unitId === (edit.row as Person).unitId && departmentEnabled(state, d.id)).map(d => <option key={d.id} value={d.id}>{departmentPath(departments, d.id)}</option>)}</select></Field><Field label="登录邮箱 *"><Input type="email" value={edit.row.email} maxLength={254} onChange={e => setRow({ email: e.target.value })} required /></Field><Field label="手机号（也可用于登录） *"><Input value={edit.row.phone} placeholder="+639XXXXXXXXX" maxLength={13} onChange={e => setRow({ phone: e.target.value })} required /></Field><Field label="岗位类型"><select value={edit.row.position} onChange={e => setRow({ position: e.target.value })}>{['管理员', '仓管', '财务', '其他'].map(v => <option key={v}>{v}</option>)}</select></Field><Field label="组织角色 *"><select value={edit.row.role} onChange={e => setRow({ role: e.target.value })}><option>成员</option><option>管理员</option></select></Field><Field label="入职日期 *"><Input type="date" value={edit.row.joinedAt} onChange={e => setRow({ joinedAt: e.target.value })} required /></Field>{!edit.existing && <Field label="初始临时密码 *"><Input type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} placeholder="8–72 位，含字母和数字" required /></Field>}</>}</>}
      {edit.kind !== 'person' && <Field label="排序号"><Input type="number" min={1} max={9999} disabled={edit.kind === 'unit' && !edit.row.active} value={edit.row.sort} onChange={e => setRow({ sort: Number(e.target.value) })} required /></Field>}
      </div><Field label="备注"><textarea value={edit.row.note} maxLength={edit.kind === 'unit' ? 500 : 200} onChange={e => setRow({ note: e.target.value })} rows={2} /></Field>{edit.kind === 'person' && <p className="org-form-tip"><LockKeyhole size={14} />管理员可管理所属组织及下级；成员仅可查看。新增账号首次登录需修改密码。</p>}{error && <p className="org-form-error" role="alert">{error}</p>}<div className="org-form-footer"><Button variant="outline" type="button" disabled={busy} onClick={() => setEdit(null)}>取消</Button><Button disabled={busy} type="submit">{busy ? '正在保存…' : '保存'}</Button></div></form>}</DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null) }}><DialogContent closeLabel="关闭"><DialogHeader><DialogTitle>{action?.type === 'password' ? '重置登录密码' : action?.type === 'delete' ? '删除确认' : action?.active ? '停用确认' : '启用确认'}</DialogTitle><DialogDescription>{action?.name}{action?.type === 'password' ? '：重置后旧密码与旧登录会话失效，下次登录需修改临时密码。' : action?.type === 'delete' ? '：删除后无法恢复，仅无关联数据时允许删除。' : action?.kind === 'people' && action.active ? '：停用后无法登录，已有登录会话也会失效。' : '：操作会校验关联人员与组织状态。'}</DialogDescription></DialogHeader><form onSubmit={confirmAction}>{action?.type !== 'password' && (action?.type === 'delete' || action?.active) && <Field label={`${action.type === 'delete' ? '删除' : '停用'}原因 *`}><textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required maxLength={200} /></Field>}{error && <p className="org-form-error" role="alert">{error}</p>}<div className="org-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>取消</Button><Button type="submit" disabled={busy} variant={action?.type === 'delete' ? 'destructive' : 'default'}>{busy ? '处理中…' : '确认操作'}</Button></div></form></DialogContent></Dialog>
    <Dialog open={!!temporary} onOpenChange={open => !open && setTemporary(null)}><DialogContent closeLabel="关闭"><DialogHeader><DialogTitle>临时密码已生成</DialogTitle><DialogDescription>请妥善交给账号本人。首次登录必须设置新密码，关闭此窗口后不再展示。</DialogDescription></DialogHeader><Input aria-label="临时密码" readOnly value={temporary ?? ''} /><Button onClick={async () => { try { await navigator.clipboard.writeText(temporary!); toast.success('已复制临时密码') } catch { toast.error('请选中并手动复制临时密码。') } }}>复制临时密码</Button></DialogContent></Dialog>
    <Dialog open={logOpen} onOpenChange={setLogOpen}><DialogContent closeLabel="关闭" className="org-editor"><DialogHeader><DialogTitle>组织架构操作记录</DialogTitle><DialogDescription>仅展示当前租户、当前组织及下级的操作。日志不记录密码。</DialogDescription></DialogHeader><div className="org-audit-list">{state.logs.filter(log => log.tenantId === tenantId && units.some(u => u.id === log.unitId)).slice().reverse().map(log => <div key={log.id}><strong>{log.action}</strong><small>{log.actor} · {new Date(log.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small></div>)}{!state.logs.some(log => log.tenantId === tenantId && units.some(u => u.id === log.unitId)) && <p className="org-muted">暂无操作记录。</p>}</div></DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent closeLabel="关闭"><DialogHeader><DialogTitle>组织与权限说明</DialogTitle><DialogDescription>以当前租户内的成员身份确定数据范围。</DialogDescription></DialogHeader><p>总部 → 事业部 → 大区 → 经销商。登录后只显示自己所属组织及下级，上级与同级组织不出现在组织树、选择项或导出中。</p><p>左上角可切换已加入的租户。人员页默认显示可见范围内全部人员，点击部门后包含其下级部门人员。</p><p className="org-form-tip">演示改动保存在当前浏览器。账号与组织权限均为本地演示，正式上线需要接入服务端校验。</p></DialogContent></Dialog>
  </div>
}

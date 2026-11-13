// Demo data model. All production reads and writes must repeat these checks on the server.
export const organizationStorageKey = 'tradevia-organization-v1'
export const levelNames = ['总部', '事业部', '大区', '经销商'] as const
export type Unit = { id: string; tenantId: string; parentId: string | null; code: string; name: string; level: number; manager: string; phone: string; address: string; currency: string; language: string; taxId: string; creditDays: number; effectiveDate: string; sort: number; active: boolean; note: string; businessRefs: number }
export type Department = { id: string; tenantId: string; unitId: string; parentId: string | null; code: string; name: string; manager: string; capacity: number; sort: number; active: boolean; note: string }
export type Person = { id: string; tenantId: string; unitId: string; departmentId: string; code: string; name: string; email: string; phone: string; role: '管理员' | '成员'; position: string; active: boolean; joinedAt: string; note: string }
export type Membership = { email: string; tenantId: string; unitId: string; admin: boolean }
export type OrgState = { tenants: { id: string; name: string }[]; units: Unit[]; departments: Department[]; people: Person[]; memberships: Membership[]; logs: { id: string; tenantId: string; unitId: string; actor: string; action: string; at: string }[] }
export type OrgActor = { email: string; demo: boolean }
export type OrgScope = { tenantId: string; unitId: string; admin: boolean; email: string }
export const demoAccounts = [
  { name: '总部管理员', email: 'hq@tradevia.demo', root: 'hq' },
  { name: '事业部管理员', email: 'division@tradevia.demo', root: 'ice' },
  { name: '大区管理员', email: 'region@tradevia.demo', root: 'manila' },
  { name: '经销商管理员', email: 'dealer@tradevia.demo', root: 'dealer-mm' },
] as const
export function createOrganizationSeed(): OrgState {
  const definitions: [string, string | null, string, number, string][] = [
    ['hq', null, '哈尼冰淇淋总部', 1, '张敏'], ['ice', 'hq', '冰淇淋事业部', 2, '李明'], ['food', 'hq', '食品事业部', 2, '周宁'],
    ['manila', 'ice', '马尼拉大区', 3, '王芳'], ['luzon', 'ice', '吕宋北区', 3, '刘洋'], ['visayas', 'food', '米沙鄢大区', 3, '赵静'],
    ['dealer-mm', 'manila', '马尼拉联合经销商', 4, '陈杰'], ['dealer-pasig', 'manila', '帕西格经销商', 4, '林欣'], ['dealer-lz', 'luzon', '吕宋冷链经销商', 4, '黄伟'], ['dealer-cebu', 'visayas', '宿务经销商', 4, '吴婷'],
  ]
  const units: Unit[] = definitions.map(([id, parentId, name, level, manager], i) => ({ id, tenantId: 'hani', parentId, name, level, manager, code: `BU-${String(i + 1).padStart(3, '0')}`, phone: `+63917000${String(i + 1).padStart(4, '0')}`, address: '菲律宾 · 马尼拉', currency: 'PHP', language: '中文', taxId: level === 4 ? `TIN-000${i}` : '', creditDays: 30, effectiveDate: '2026-11-01', sort: i + 1, active: true, note: '', businessRefs: level === 4 ? 2 : 0 }))
  units.push({ ...units[0], id: 'island-hq', tenantId: 'island', name: '海岛食品总部', code: 'IS-HQ', manager: '张敏', businessRefs: 0 })
  const departments: Department[] = units.flatMap((unit, i) => [
    { id: `${unit.id}-admin`, tenantId: unit.tenantId, unitId: unit.id, parentId: null, code: `DP-${i + 1}01`, name: '综合管理部', manager: unit.manager, capacity: 10, sort: 1, active: true, note: '' },
    { id: `${unit.id}-sales`, tenantId: unit.tenantId, unitId: unit.id, parentId: null, code: `DP-${i + 1}02`, name: '销售部', manager: '', capacity: 20, sort: 2, active: true, note: '' },
    { id: `${unit.id}-team`, tenantId: unit.tenantId, unitId: unit.id, parentId: `${unit.id}-sales`, code: `DP-${i + 1}03`, name: '渠道一组', manager: '', capacity: 8, sort: 3, active: true, note: '' },
  ])
  const people: Person[] = units.flatMap((unit, i) => {
    const demo = demoAccounts.find(a => a.root === unit.id)
    return [
      { id: `p-${unit.id}`, tenantId: unit.tenantId, unitId: unit.id, departmentId: `${unit.id}-admin`, code: `EMP-${String(i * 2 + 1).padStart(4, '0')}`, name: unit.manager, email: demo?.email ?? (unit.id === 'island-hq' ? demoAccounts[0].email : `manager${i}@tradevia.demo`), phone: `+63918000${String(i * 2 + 1).padStart(4, '0')}`, role: '管理员', position: '管理员', active: true, joinedAt: '2026-11-01', note: '' },
      { id: `s-${unit.id}`, tenantId: unit.tenantId, unitId: unit.id, departmentId: `${unit.id}-team`, code: `EMP-${String(i * 2 + 2).padStart(4, '0')}`, name: ['林晓', '何安', '郑悦', '许晨', '梁月', '宋可', '唐雨', '沈星', '陆川', '苏晴', '方圆'][i], email: `staff${i}@tradevia.demo`, phone: `+63918000${String(i * 2 + 2).padStart(4, '0')}`, role: '成员', position: '其他', active: true, joinedAt: '2026-11-02', note: '' },
    ]
  })
  return { tenants: [{ id: 'hani', name: '哈尼冰淇淋' }, { id: 'island', name: '海岛食品' }], units, departments, people, memberships: people.map(p => ({ email: p.email, tenantId: p.tenantId, unitId: p.unitId, admin: p.role === '管理员' })), logs: [] }
}
export function readOrganization(): OrgState {
  const raw = localStorage.getItem(organizationStorageKey)
  if (!raw) return createOrganizationSeed()
  try {
    const state = JSON.parse(raw)
    if (!state || !['tenants', 'units', 'departments', 'people', 'memberships', 'logs'].every(key => Array.isArray(state[key]))) throw new Error()
    return state
  } catch { throw new Error('组织数据无法读取，请保留浏览器数据并联系管理员。') }
}
export function actorEmail(actor: OrgActor) { return actor.demo ? demoAccounts[0].email : actor.email }
export function membershipsFor(state: OrgState, actor: OrgActor): Membership[] {
  const email = actorEmail(actor)
  return state.memberships.filter(m => m.email === email && state.people.some(p => p.email === email && p.tenantId === m.tenantId && p.active) && unitEnabled(state, m.unitId))
}
export function descendants<T extends { id: string; parentId: string | null }>(rows: T[], rootId: string): Set<string> {
  const found = new Set<string>()
  const queue = [rootId]
  for (let i = 0; i < queue.length; i++) {
    if (found.has(queue[i]) || !rows.some(row => row.id === queue[i])) continue
    found.add(queue[i]); rows.filter(row => row.parentId === queue[i]).forEach(row => queue.push(row.id))
  }
  return found
}
export function unitEnabled(state: OrgState, id: string): boolean {
  const visited = new Set<string>()
  let unit = state.units.find(u => u.id === id)
  if (!unit) return false
  while (unit) {
    if (!unit.active || visited.has(unit.id)) return false
    visited.add(unit.id)
    if (!unit.parentId) return true
    unit = state.units.find(u => u.id === unit!.parentId)
    if (!unit) return false
  }
  return false
}
export function departmentEnabled(state: OrgState, id: string): boolean {
  const seen = new Set<string>()
  let department = state.departments.find(d => d.id === id)
  if (!department || !unitEnabled(state, department.unitId)) return false
  while (department) {
    if (!department.active || seen.has(department.id)) return false
    seen.add(department.id)
    if (!department.parentId) return true
    const parentId: string = department.parentId
    const unitId: string = department.unitId
    department = state.departments.find(d => d.id === parentId && d.unitId === unitId)
    if (!department) return false
  }
  return false
}
export function getScope(state: OrgState, actor: OrgActor, tenantId: string): OrgScope | null {
  const membership = membershipsFor(state, actor).find(m => m.tenantId === tenantId)
  return membership ? { ...membership, email: actorEmail(actor) } : null
}
export function visibleUnits(state: OrgState, scope: OrgScope | null) {
  if (!scope) return []
  const ids = descendants(state.units.filter(u => u.tenantId === scope.tenantId), scope.unitId)
  return state.units.filter(u => u.tenantId === scope.tenantId && ids.has(u.id)).sort((a, b) => a.sort - b.sort)
}
export function scopedData(state: OrgState, scope: OrgScope | null) {
  const units = visibleUnits(state, scope)
  const ids = new Set(units.map(u => u.id))
  return { units, departments: state.departments.filter(d => d.tenantId === scope?.tenantId && ids.has(d.unitId)), people: state.people.filter(p => p.tenantId === scope?.tenantId && ids.has(p.unitId)).sort((a, b) => a.code.localeCompare(b.code)) }
}
export function departmentPath(departments: Department[], id: string): string {
  const names: string[] = [], visited = new Set<string>()
  let row = departments.find(d => d.id === id)
  while (row && !visited.has(row.id)) { visited.add(row.id); names.unshift(row.name); row = departments.find(d => d.id === row!.parentId) }
  return names.join(' / ')
}
export function assertWrite(state: OrgState, scope: OrgScope | null, unitId: string) {
  if (!scope?.admin || !visibleUnits(state, scope).some(u => u.id === unitId)) throw new Error('没有权限操作此组织的数据。')
}
const requireText = (value: string, max: number, label: string) => { if (!value?.trim() || value.trim().length > max) throw new Error(`${label}不能为空，且不超过 ${max} 个字符。`) }
export function saveUnit(state: OrgState, scope: OrgScope, input: Unit): OrgState {
  const old = state.units.find(u => u.id === input.id)
  if (old) assertWrite(state, scope, old.id)
  else {
    if (!input.parentId) throw new Error('总部已存在，请使用新增下级。')
    assertWrite(state, scope, input.parentId)
  }
  const parent = state.units.find(u => u.id === input.parentId)
  if (input.tenantId !== scope.tenantId || (old && (old.code !== input.code || old.level !== input.level || old.parentId !== input.parentId || old.tenantId !== input.tenantId))) throw new Error('组织编码、类型与所属层级不可修改。')
  if (!old && (!parent || parent.level >= 4 || input.level !== parent.level + 1 || !unitEnabled(state, parent.id))) throw new Error('仅支持总部 → 事业部 → 大区 → 经销商四个层级。')
  requireText(input.name, 60, '业务单元名称'); requireText(input.code, 20, '编码'); requireText(input.manager, 40, '负责人'); requireText(input.address, 200, '地址')
  if (!/^[+\d][\d\s-]{5,19}$/.test(input.phone)) throw new Error('请输入有效联系电话。')
  if (state.units.some(u => u.id !== input.id && (u.code === input.code || (u.tenantId === input.tenantId && u.parentId === input.parentId && u.name === input.name.trim())))) throw new Error('编码已存在，或同一上级下名称重复。')
  if (!Number.isInteger(input.sort) || input.sort < 1 || input.sort > 9999 || !Number.isInteger(input.creditDays) || input.creditDays < 0 || input.creditDays > 90) throw new Error('排序号应为 1–9999，账期应为 0–90 天的整数。')
  if (!input.effectiveDate || (input.level === 4 && !input.taxId.trim())) throw new Error('请填写生效日期；经销商还需填写纳税人识别号。')
  if (old && !old.active && (input.name !== old.name || input.manager !== old.manager || input.address !== old.address || input.currency !== old.currency || input.taxId !== old.taxId || input.creditDays !== old.creditDays || input.effectiveDate !== old.effectiveDate || input.sort !== old.sort || input.language !== old.language)) throw new Error('停用的业务单元仅可修改联系电话与备注。')
  if (old && old.active !== input.active) throw new Error('请使用启用或停用操作修改状态。')
  const row = { ...input, name: input.name.trim() }
  return { ...state, units: old ? state.units.map(u => u.id === row.id ? row : u) : [...state.units, row] }
}
export function saveDepartment(state: OrgState, scope: OrgScope, input: Department): OrgState {
  const old = state.departments.find(d => d.id === input.id)
  if (old) assertWrite(state, scope, old.unitId)
  assertWrite(state, scope, input.unitId)
  if (input.tenantId !== scope.tenantId || !unitEnabled(state, input.unitId)) throw new Error('请选择当前范围内启用的业务单元。')
  requireText(input.name, 40, '部门名称'); requireText(input.code, 20, '部门编码')
  if (old && (old.unitId !== input.unitId || old.code !== input.code || old.parentId !== input.parentId || old.active !== input.active)) throw new Error('编辑时不能变更部门编码、组织、上级或状态。')
  const parent = state.departments.find(d => d.id === input.parentId)
  if (input.parentId && (!parent || parent.unitId !== input.unitId || !departmentEnabled(state, parent.id) || descendants(state.departments, input.id).has(input.parentId))) throw new Error('上级部门必须属于同一业务单元，且不能形成循环。')
  if (parent && departmentPath(state.departments, parent.id).split(' / ').length >= 5) throw new Error('部门最多支持五级。')
  if (state.departments.some(d => d.id !== input.id && d.unitId === input.unitId && (d.code === input.code || (d.parentId === input.parentId && d.name === input.name.trim())))) throw new Error('同一业务单元内编码或同级部门名称重复。')
  if (!Number.isInteger(input.capacity) || input.capacity < 0 || !Number.isInteger(input.sort) || input.sort < 1 || input.sort > 9999) throw new Error('编制为非负整数，排序号为 1–9999。')
  if (input.manager && !state.people.some(p => p.name === input.manager && p.active && p.unitId === input.unitId && descendants(state.departments, input.id).has(p.departmentId))) throw new Error('负责人必须属于本部门或下级部门。')
  const row = { ...input, name: input.name.trim() }
  return { ...state, departments: old ? state.departments.map(d => d.id === row.id ? row : d) : [...state.departments, row] }
}
export function savePerson(state: OrgState, scope: OrgScope, input: Person): OrgState {
  const old = state.people.find(p => p.id === input.id)
  if (old) assertWrite(state, scope, old.unitId)
  assertWrite(state, scope, input.unitId)
  if (input.tenantId !== scope.tenantId || !unitEnabled(state, input.unitId)) throw new Error('请选择启用的业务单元。')
  const department = state.departments.find(d => d.id === input.departmentId && d.unitId === input.unitId && departmentEnabled(state, d.id))
  if (!department) throw new Error('部门必须启用且属于所选业务单元。')
  requireText(input.name, 40, '姓名')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !/^(\+63\d{10}|09\d{9})$/.test(input.phone)) throw new Error('请填写有效邮箱和菲律宾手机号（+63 后 10 位或 09 开头 11 位）。')
  if (state.people.some(p => p.id !== input.id && (p.code === input.code || p.phone === input.phone || (p.email === input.email && p.tenantId === input.tenantId)))) throw new Error('工号、手机号或本租户登录账号已存在。')
  if (old && (old.code !== input.code || old.tenantId !== input.tenantId || old.active !== input.active)) throw new Error('不能更改工号、租户或直接修改状态。')
  if (old?.email === scope.email && (old.unitId !== input.unitId || input.role !== old.role || old.email !== input.email)) throw new Error('不能调整自己的组织、管理角色或登录账号，请由其他管理员操作。')
  if (!['管理员', '成员'].includes(input.role)) throw new Error('角色不合法。')
  if (!input.joinedAt || input.joinedAt > new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)) throw new Error('请填写有效入职日期，最晚不超过未来 90 天。')
  const memberships = state.memberships.filter(m => !(old && m.email === old.email && m.tenantId === old.tenantId))
  memberships.push({ email: input.email, tenantId: input.tenantId, unitId: input.unitId, admin: input.role === '管理员' })
  return { ...state, people: old ? state.people.map(p => p.id === input.id ? input : p) : [...state.people, input], memberships }
}
export function toggleRecord(state: OrgState, scope: OrgScope, kind: 'units' | 'departments' | 'people', id: string, reason: string): OrgState {
  const row = state[kind].find(r => r.id === id)
  if (!row) throw new Error('记录不存在。')
  assertWrite(state, scope, kind === 'units' ? row.id : (row as Department | Person).unitId)
  if (row.active && !reason.trim()) throw new Error('请填写停用原因。')
  if (kind === 'people') {
    const p = row as Person
    if (p.email === scope.email) throw new Error('不能停用当前登录账号。')
    if (!p.active && !departmentEnabled(state, p.departmentId)) throw new Error('请先启用所属组织与部门。')
  } else if (kind === 'units') {
    const ids = descendants(state.units, id)
    const count = state.people.filter(p => ids.has(p.unitId) && p.active).length
    if (row.active && (count || state.units.some(u => ids.has(u.id) && u.businessRefs))) throw new Error(`该组织及下级仍有 ${count} 名在职人员或关联业务，请先处理后停用。`)
    const unit = row as Unit
    if (!row.active && unit.parentId && !unitEnabled(state, unit.parentId)) throw new Error('请先启用上级业务单元。')
  } else {
    const ids = descendants(state.departments, id)
    const count = state.people.filter(p => ids.has(p.departmentId) && p.active).length
    if (row.active && count) throw new Error(`本部门及下级仍有 ${count} 名在职人员，请先调岗。`)
    const dept = row as Department
    if (!row.active && (!unitEnabled(state, dept.unitId) || (dept.parentId && !departmentEnabled(state, dept.parentId)))) throw new Error('请先启用所属组织与上级部门。')
  }
  return { ...state, [kind]: state[kind].map(r => r.id === id ? { ...r, active: !r.active, note: row.active ? reason : r.note } : r) }
}
export function deleteRecord(state: OrgState, scope: OrgScope, kind: 'units' | 'departments', id: string, reason: string): OrgState {
  const row = state[kind].find(r => r.id === id)
  if (!row) throw new Error('记录不存在。')
  assertWrite(state, scope, kind === 'units' ? id : (row as Department).unitId)
  if (!reason.trim()) throw new Error('请填写删除原因。')
  if (kind === 'units') {
    if (id === scope.unitId || state.units.some(u => u.parentId === id) || state.people.some(p => p.unitId === id) || state.departments.some(d => d.unitId === id) || (row as Unit).businessRefs) throw new Error('当前组织或存在下级、部门、人员、业务引用的组织不可删除，请使用停用。')
  } else if (state.departments.some(d => d.parentId === id) || state.people.some(p => p.departmentId === id)) throw new Error('存在下级部门或人员，不能删除。')
  return { ...state, [kind]: state[kind].filter(r => r.id !== id) }
}

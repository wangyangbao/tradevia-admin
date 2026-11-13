import { createCustomerSeed } from './customers.ts'
import { assertWrite, descendants, unitEnabled, visibleUnits } from './organization.ts'
import type { OrgScope, OrgState } from './organization.ts'

export const fieldPages = ['fieldActions', 'fieldTypes', 'fieldRules', 'fieldVisits', 'fieldStatistics'] as const
export type FieldPage = typeof fieldPages[number]
export const fieldTitles: Record<FieldPage, string> = { fieldActions: '外勤动作', fieldTypes: '外勤类型', fieldRules: '外勤规则', fieldVisits: '拜访记录', fieldStatistics: '外勤统计' }
export const actionNames = { photo: '拍照动作', report: '数据上报', order: '订货动作' } as const
export const reportTemplates = ['陈列上报', '销售上报', '库存上报', '自定义配置'] as const
export type ReportField = { id: string; label: string; kind: '文本' | '数字' | '单选'; required: boolean; options: string }
type Base = { id: string; code: string; name: string; unitId: string; active: boolean; updatedAt: string }
export type FieldAction = Base & { kind: keyof typeof actionNames; photo: { min: number; max: number; cameraOnly: boolean; updateFront: boolean }; report: { template: typeof reportTemplates[number]; fields: ReportField[] }; order: { mode: '引单模式' | '车销模式'; showStock: boolean; allowPrice: boolean; allowZero: boolean; remarkRequired: boolean; print: boolean; nextOrder: boolean } }
export type FieldType = Base & { scene: '访销' | '车销' | '新店开发' | '陈列检查' | '其他'; duration: number; isDefault: boolean; steps: { actionId: string; required: boolean; allowSkip: boolean }[] }
export type FieldRule = Base & { typeId: string; units: string[]; people: string[]; categories: string[]; start: string; end: string; radius: number; timeStart: string; timeEnd: string; minStay: number; maxStay: number; allowException: boolean; offline: boolean; priority: number }
export type VisitRecord = { id: string; unitId: string; customerId: string; customerName: string; personId: string; personName: string; date: string; typeName: string; routeName: string; status: '已完成' | '进行中' | '已跳过'; checkIn: string; checkOut: string; stay: number | null; distance: number | null; location: string; flags: string[]; reason: string; ruleCodes: string[]; constraint: string; actions: { name: string; status: '已完成' | '已跳过' | '未完成'; content: string }[]; orderIds: string[]; amount: number; review?: { result: '确认有效' | '确认无效'; note: string; actor: string; at: string }; source: '演示数据' }
export type FieldState = { version: 1; revision: number; actions: FieldAction[]; types: FieldType[]; rules: FieldRule[]; visits: VisitRecord[]; logs: { id: string; unitId: string; action: string; actor: string; at: string }[] }
export type ConfigKind = 'actions' | 'types' | 'rules'
export const fieldStorageKey = (tenant: string) => `tradevia-fieldwork-v1:${tenant}`
export function templateFields(template: typeof reportTemplates[number]): ReportField[] {
  const rows: [string, ReportField['kind'], string][] = template === '陈列上报' ? [['商品名称', '文本', ''], ['陈列排面数', '数字', ''], ['价签是否一致', '单选', '是,否']] : template === '销售上报' ? [['商品名称', '文本', ''], ['销售数量', '数字', ''], ['销售金额', '数字', '']] : template === '库存上报' ? [['商品名称', '文本', ''], ['库存数量', '数字', ''], ['临期数量', '数字', '']] : [['上报内容', '文本', '']]
  return rows.map(([label, kind, options], i) => ({ id: `f-${i + 1}`, label, kind, options, required: true }))
}
export function blankAction(unitId: string, kind: FieldAction['kind']): FieldAction { return { id: crypto.randomUUID(), code: '', name: '', unitId, active: true, updatedAt: '', kind, photo: { min: 1, max: 3, cameraOnly: true, updateFront: false }, report: { template: '陈列上报', fields: templateFields('陈列上报') }, order: { mode: '引单模式', showStock: true, allowPrice: false, allowZero: true, remarkRequired: false, print: false, nextOrder: false } } }
export function blankType(unitId: string): FieldType { return { id: crypto.randomUUID(), code: '', name: '', unitId, active: true, updatedAt: '', scene: '访销', duration: 15, isDefault: false, steps: [] } }
export function blankRule(unitId: string): FieldRule { return { id: crypto.randomUUID(), code: '', name: '', unitId, active: true, updatedAt: '', typeId: '', units: [unitId], people: [], categories: [], start: '2026-11-01', end: '2027-12-31', radius: 100, timeStart: '08:00', timeEnd: '18:00', minStay: 5, maxStay: 60, allowException: true, offline: true, priority: 10 } }
export function createFieldSeed(tenant: string): FieldState {
  const s: FieldState = { version: 1, revision: 0, actions: [], types: [], rules: [], visits: [], logs: [] }
  if (tenant !== 'hani') return s
  s.actions = (['photo', 'report', 'order'] as const).map((kind, i) => ({ ...blankAction('hq', kind), id: `fa-${kind}`, code: `ACT-00${i + 1}`, name: ['门头与陈列拍照', '门店库存上报', '访销订货'][i], updatedAt: '2026-11-10T09:00:00+08:00', ...(kind === 'report' ? { report: { template: '库存上报' as const, fields: templateFields('库存上报') } } : {}) }))
  s.types = [{ ...blankType('hq'), id: 'ft-standard', code: 'VISIT-SALES', name: '标准访销拜访', isDefault: true, steps: s.actions.map(a => ({ actionId: a.id, required: a.kind !== 'order', allowSkip: a.kind === 'order' })), updatedAt: '2026-11-10T09:00:00+08:00' }]
  s.rules = [{ ...blankRule('hq'), id: 'fr-standard', code: 'RULE-001', name: '日常门店拜访规则', typeId: 'ft-standard', units: ['ice', 'food'], updatedAt: '2026-11-10T09:00:00+08:00' }]
  s.visits = createCustomerSeed(tenant).customers.filter(c => c.status !== '关闭').map((c, i) => {
    const flagged = i === 1 || i === 3, skipped = i === 4, progress = i === 5
    const orders = createCustomerSeed(tenant).orders.filter(o => o.customerId === c.id && o.date === '2026-11-07')
    const address = c.addresses[0]
    return { id: `FV-261107-${String(i + 1).padStart(4, '0')}`, unitId: c.dealerId, customerId: c.id, customerName: c.name, personId: c.ownerId, personName: c.visits[0]?.actor ?? '业务员', date: '2026-11-07', typeName: '标准访销拜访', routeName: c.routeId || '临时拜访', status: skipped ? '已跳过' : progress ? '进行中' : '已完成', checkIn: skipped ? '' : '10:30', checkOut: skipped || progress ? '' : i === 3 ? '10:32' : '10:48', stay: skipped || progress ? null : i === 3 ? 2 : 18, distance: skipped ? null : i === 1 ? 280 : 35, location: address ? `${address.latitude}, ${address.longitude}` : '', flags: flagged ? [i === 1 ? '超出签到范围' : '停留时间不足'] : [], reason: i === 1 ? '店铺装修，店主临时在街角收货。' : i === 3 ? '店主外出，完成拍照后提前离店。' : skipped ? '门店当日未营业。' : '', ruleCodes: ['RULE-001'], constraint: '签到半径 100 米；08:00–18:00；停留 5–60 分钟', actions: skipped ? [] : [{ name: '门头与陈列拍照', status: '已完成', content: '演示记录，未接入现场照片。' }, { name: '门店库存上报', status: progress ? '未完成' : '已完成', content: progress ? '等待业务员提交' : '香草冰淇淋棒：库存 24；临期 0（示例）' }, { name: '访销订货', status: orders.length && !progress ? '已完成' : '已跳过', content: orders.length && !progress ? `关联订单：${orders.map(o => o.id).join('、')}` : '本次无需补货' }], orderIds: skipped || progress ? [] : orders.map(o => o.id), amount: skipped || progress ? 0 : orders.reduce((n,o) => n + o.amount, 0), source: '演示数据' }
  })
  return s
}
export function readFieldwork(tenant: string): FieldState {
  const raw = localStorage.getItem(fieldStorageKey(tenant))
  if (!raw) return createFieldSeed(tenant)
  try {
    const s = JSON.parse(raw) as FieldState
    if (s.version !== 1 || !Number.isInteger(s.revision) || s.revision < 0 || !['actions', 'types', 'rules', 'visits', 'logs'].every(k => Array.isArray(s[k as keyof FieldState]))) throw Error()
    for (const rows of [s.actions, s.types, s.rules]) {
      if (new Set(rows.map(r => r.id)).size !== rows.length || new Set(rows.map(r => r.code)).size !== rows.length) throw Error()
      if (rows.some(r => !r.id || !r.code || !r.name || !r.unitId || typeof r.active !== 'boolean')) throw Error()
    }
    if (s.actions.some(a => !actionNames[a.kind] || !a.photo || !a.report || !Array.isArray(a.report.fields) || !a.order) || s.types.some(t => !Array.isArray(t.steps)) || s.rules.some(r => !Array.isArray(r.units) || !Array.isArray(r.people) || !Array.isArray(r.categories)) || s.visits.some(v => !Array.isArray(v.actions) || !Array.isArray(v.flags))) throw Error()
    if (s.actions.some(a => !Number.isInteger(a.photo.min) || !Number.isInteger(a.photo.max) || !reportTemplates.includes(a.report.template) || a.report.fields.some(f => typeof f.label !== 'string' || !['文本', '数字', '单选'].includes(f.kind) || typeof f.options !== 'string' || typeof f.required !== 'boolean') || !['引单模式', '车销模式'].includes(a.order.mode)) || s.types.some(t => !Number.isInteger(t.duration) || typeof t.isDefault !== 'boolean' || t.steps.some(step => !s.actions.some(a => a.id === step.actionId) || typeof step.required !== 'boolean' || typeof step.allowSkip !== 'boolean')) || s.rules.some(r => !s.types.some(t => t.id === r.typeId) || ![r.radius, r.minStay, r.maxStay, r.priority].every(Number.isInteger) || ![r.start, r.end, r.timeStart, r.timeEnd].every(v => typeof v === 'string')) || s.visits.some(v => !v.id || !v.unitId || typeof v.customerName !== 'string' || typeof v.personName !== 'string' || !Number.isFinite(v.amount) || !Array.isArray(v.ruleCodes) || !Array.isArray(v.orderIds) || !['已完成', '进行中', '已跳过'].includes(v.status))) throw Error()
    return s
  } catch { throw new Error('外勤数据读取失败，请保留浏览器数据并联系管理员。') }
}
export function configVisible(unitId: string, org: OrgState, scope: OrgScope | null): boolean {
  if (!scope) return false
  const units = org.units.filter(u => u.tenantId === scope.tenantId)
  return visibleUnits(org, scope).some(u => u.id === unitId) || descendants(units, unitId).has(scope.unitId)
}
const text = (v: string, max: number, label: string) => { if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw Error(`${label}必填，且不超过 ${max} 个字。`) }
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const integer = (n: number, min: number, max: number, label: string) => { if (!Number.isInteger(n) || n < min || n > max) throw Error(`${label}应为 ${min}–${max} 的整数。`) }
function usableAction(s: FieldState, id: string, unitId: string, org: OrgState) { const a = s.actions.find(a => a.id === id && a.active); return a && descendants(org.units, a.unitId).has(unitId) ? a : null }
export function saveFieldConfig(s: FieldState, kind: ConfigKind, input: FieldAction | FieldType | FieldRule, org: OrgState, scope: OrgScope | null): FieldState {
  assertWrite(org, scope, input.unitId)
  const old = s[kind].find(r => r.id === input.id)
  if (old) { assertWrite(org, scope, old.unitId); if (old.unitId !== input.unitId || old.code !== input.code) throw Error('所属组织和编码不可修改。') }
  if (!unitEnabled(org, input.unitId)) throw Error('所属组织已停用。')
  text(input.code, 16, '编码'); text(input.name, kind === 'rules' ? 60 : 40, '名称')
  if (!/^[A-Z0-9_-]+$/.test(input.code)) throw Error('编码仅支持大写字母、数字、短横线与下划线。')
  if (s[kind].some(r => r.id !== input.id && r.code === input.code)) throw Error('编码已存在，请更换。')
  if (kind === 'actions') {
    const a = input as FieldAction
    if (!actionNames[a.kind] || (old && (old as FieldAction).kind !== a.kind)) throw Error('动作类别不可修改。')
    if (!a.active && s.types.some(t => t.active && t.steps.some(step => step.actionId === a.id))) throw Error('请先停用或调整引用此动作的外勤类型。')
    if (a.kind === 'photo') { integer(a.photo.min, 1, 9, '最少照片数'); integer(a.photo.max, a.photo.min, 9, '最多照片数') }
    if (a.kind === 'report') {
      if (!reportTemplates.includes(a.report.template) || !a.report.fields.length || a.report.fields.length > 20) throw Error('上报模板需包含 1–20 个字段。')
      if (new Set(a.report.fields.map(f => f.label.trim())).size !== a.report.fields.length) throw Error('上报字段名称不能重复。')
      a.report.fields.forEach(f => { text(f.label, 30, '字段名称'); if (!['文本', '数字', '单选'].includes(f.kind)) throw Error('字段类型无效。'); if (f.kind === '单选' && new Set(f.options.split(/[,，]/).map(v => v.trim()).filter(Boolean)).size < 2) throw Error('单选字段至少需要两个不同选项，用逗号分隔。') })
    }
    if (a.kind === 'order' && !['引单模式', '车销模式'].includes(a.order.mode)) throw Error('请选择引单或车销模式。')
  } else if (kind === 'types') {
    const t = input as FieldType
    integer(t.duration, 1, 480, '预计时长')
    if (!t.steps.length || new Set(t.steps.map(a => a.actionId)).size !== t.steps.length) throw Error('至少选择一个动作，同一动作不可重复。')
    if (t.active && t.steps.some(step => !usableAction(s, step.actionId, t.unitId, org))) throw Error('类型中包含停用或不适用于此组织的动作。')
    if (t.steps.some(step => step.required && step.allowSkip)) throw Error('必做动作不能同时允许跳过。')
    if (t.isDefault && !t.active) throw Error('默认类型不能停用，请先设置其他默认类型。')
    if (t.isDefault && s.types.some(r => r.id !== t.id && r.unitId === t.unitId && r.isDefault && r.active)) throw Error('当前组织已有默认类型，请先取消原默认设置。')
    if (!t.active && s.rules.some(r => r.active && r.typeId === t.id)) throw Error('请先停用引用此类型的外勤规则。')
  } else {
    const r = input as FieldRule, t = s.types.find(t => t.id === r.typeId)
    if (!t || (r.active && !t.active) || !descendants(org.units, t.unitId).has(r.unitId)) throw Error('请选择启用且适用的外勤类型。')
    const ownerRange = descendants(org.units, r.unitId)
    if (!r.units.length || r.units.some(id => !ownerRange.has(id) || !unitEnabled(org, id))) throw Error('请选择所属组织范围内的有效业务单元。')
    const covered = new Set(r.units.flatMap(id => [...descendants(org.units, id)]))
    if (r.people.some(id => !org.people.some(p => p.id === id && p.tenantId === scope?.tenantId && p.active && covered.has(p.unitId)))) throw Error('指定人员必须在适用业务单元内且处于启用状态。')
    if (!validDate(r.start) || !validDate(r.end) || r.start > r.end) throw Error('请填写有效的生效起止日期。')
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.timeStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.timeEnd) || r.timeStart >= r.timeEnd) throw Error('签到开始时间应早于结束时间，一期不支持跨天。')
    integer(r.radius, 50, 1000, '签到半径'); integer(r.minStay, 0, 480, '最短停留'); integer(r.maxStay, Math.max(1, r.minStay), 720, '最长停留'); integer(r.priority, 0, 999, '优先级')
  }
  const next = structuredClone(s), row = { ...structuredClone(input), code: input.code.trim(), name: input.name.trim(), updatedAt: new Date().toISOString() }
  // All writes share one validated union boundary.
  const rows = next[kind] as (FieldAction | FieldType | FieldRule)[]
  const i = rows.findIndex(r => r.id === row.id); if (i < 0) rows.push(row); else rows[i] = row
  return next
}
export function removeFieldConfig(s: FieldState, kind: ConfigKind, id: string, org: OrgState, scope: OrgScope | null): FieldState {
  const row = s[kind].find(r => r.id === id); if (!row) throw Error('记录不存在。'); assertWrite(org, scope, row.unitId)
  if (row.active || (kind === 'types' && (row as FieldType).isDefault)) throw Error('请先停用后删除；默认类型不能删除。')
  if ((kind === 'actions' && s.types.some(t => t.steps.some(a => a.actionId === id))) || (kind === 'types' && s.rules.some(r => r.typeId === id))) throw Error('记录仍被引用，不能删除。')
  const next = structuredClone(s); next[kind] = next[kind].filter(r => r.id !== id) as FieldAction[] & FieldType[] & FieldRule[]; return next
}
export function resolveFieldRules(s: FieldState, org: OrgState, personId: string, categoryId: string, date: string) {
  const p = org.people.find(p => p.id === personId && p.active && unitEnabled(org, p.unitId))
  if (!p) throw Error('请选择有效人员。')
  const depth = (unitId: string) => { let d = 0, u = org.units.find(u => u.id === unitId); while (u && d < 10) { d++; u = org.units.find(r => r.id === u?.parentId) } return d }
  const rules = s.rules.filter(r => r.active && r.start <= date && r.end >= date && r.units.some(id => unitEnabled(org, id) && descendants(org.units, id).has(p.unitId)) && (!r.people.length || r.people.includes(p.id)) && (!r.categories.length || r.categories.includes(categoryId)) && s.types.some(t => t.id === r.typeId && t.active)).sort((a,b) => b.priority - a.priority || depth(b.unitId) - depth(a.unitId) || a.code.localeCompare(b.code))
  const types = rules.length ? rules.map(r => s.types.find(t => t.id === r.typeId)!) : s.types.filter(t => t.active && t.isDefault && descendants(org.units, t.unitId).has(p.unitId)).sort((a,b) => depth(b.unitId) - depth(a.unitId)).slice(0,1)
  if (!types.length) return null
  const steps = new Map<string, FieldType['steps'][number]>()
  types.forEach(t => t.steps.forEach(a => { const old = steps.get(a.actionId); steps.set(a.actionId, { ...a, required: a.required || !!old?.required, allowSkip: a.allowSkip && (old?.allowSkip ?? true) && !a.required && !old?.required }) }))
  const result = { typeName: types[0].name, rules: rules.map(r => r.code), steps: [...steps.values()], radius: rules.length ? Math.min(...rules.map(r => r.radius)) : 100, minStay: rules.length ? Math.max(...rules.map(r => r.minStay)) : 5, maxStay: rules.length ? Math.min(...rules.map(r => r.maxStay)) : 60, timeStart: rules.length ? rules.map(r => r.timeStart).sort().at(-1)! : '08:00', timeEnd: rules.length ? rules.map(r => r.timeEnd).sort()[0] : '18:00', allowException: rules.every(r => r.allowException), offline: rules.every(r => r.offline) }
  if (result.minStay > result.maxStay || result.timeStart >= result.timeEnd) throw Error('命中规则的时间或停留要求存在冲突，请调整后再使用。')
  return result
}
export function visitEffective(v: VisitRecord) { return v.status === '已完成' && !v.flags.includes('重复拜访') && v.review?.result !== '确认无效' && (!v.flags.length || v.review?.result === '确认有效') }
export function visitSummary(rows: VisitRecord[]) { const completed = rows.filter(v => v.status === '已完成'), exceptions = rows.filter(v => v.flags.length); return { total: rows.length, completed: completed.length, effective: rows.filter(visitEffective).length, pending: exceptions.filter(v => !v.review).length, abnormal: exceptions.length, rate: rows.length ? `${(exceptions.length / rows.length * 100).toFixed(1)}%` : '—', amount: completed.reduce((n,v) => n + v.amount, 0), avgStay: completed.filter(v => v.stay !== null).length ? Math.round(completed.reduce((n,v) => n + (v.stay ?? 0), 0) / completed.filter(v => v.stay !== null).length) : 0 } }
export function reviewFieldVisit(s: FieldState, id: string, result: '确认有效' | '确认无效', note: string, org: OrgState, scope: OrgScope | null): FieldState {
  const row = s.visits.find(v => v.id === id); if (!row) throw Error('拜访不存在。'); assertWrite(org, scope, row.unitId); text(note, 300, '复核说明')
  if (!row.flags.length || row.review) throw Error('仅支持复核尚未处理的异常拜访。')
  if (result === '确认有效' && (row.status !== '已完成' || row.flags.includes('重复拜访'))) throw Error('未完成或重复拜访不能确认为有效拜访。')
  const next = structuredClone(s); next.visits.find(v => v.id === id)!.review = { result, note: note.trim(), actor: scope!.email, at: new Date().toISOString() }; return next
}

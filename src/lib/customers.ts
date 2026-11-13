import { projectSalesCustomers } from './sales-projection.ts'
import { initialOrders, outlets } from './data.ts'
import type { Order } from './data'
import { assertWrite, unitEnabled, visibleUnits } from './organization.ts'
import type { OrgScope, OrgState } from './organization'
import type { ArchiveState } from './basic-data'

export const customerStorageKey = (tenantId: string) => `tradevia-customers-v1-${tenantId}`
export const customerStatuses = ['潜在', '活跃', '休眠', '关闭'] as const
export type CustomerStatus = typeof customerStatuses[number]
export type CustomerAddress = { id: string; label: string; province: string; city: string; barangay: string; street: string; detail: string; latitude: number; longitude: number; recipient: string; phone: string; primary: boolean }
export type CustomerContact = { id: string; name: string; role: string; phone: string; email: string; note: string; primary: boolean }
export type CustomerVisit = { id: string; date: string; actor: string; type: string; result: string; content: string; nextDate: string; source: '现场拜访' | 'PC补录' }
export type CustomerLog = { id: string; action: string; actor: string; at: string; content: string }
export type Customer = {
  id: string; code: string; name: string; alias: string; dealerId: string; categoryId: string; channelId: string; ownerId: string; routeId: string; grade: string; frequency: string; keyOutlet: boolean
  status: CustomerStatus; creditLimit: number; creditDays: number; settlements: string[]; taxInfo: string; hours: string; storeType: string; chain: string; freezers: number; freezerBrand: string; competitors: string[]; photo: string; note: string; firstVisit: string; createdAt: string; updatedAt: string; createdBy: string
  addresses: CustomerAddress[]; contacts: CustomerContact[]; visits: CustomerVisit[]; logs: CustomerLog[]
}
export type CustomerOrder = { salesId?: string; id: string; customerId: string; date: string; dueDate: string; amount: number; status: '待审核' | '配送中' | '已签收' | '已取消'; payment: string; owner: string; items: { name: string; quantity: number; price: number; price4?: number; unit?: string; giftFor?: string; total?: number }[]; sourceOrder?: Order }
export type CustomerReceipt = { grossAmount?: number; refundedAmount?: number; id: string; customerId: string; orderId: string; date: string; amount: number; method: string; status: '已确认' | '待确认' | '已作废'; actor: string; reference: string; note: string }
export type CustomerState = { version: 1; revision: number; customers: Customer[]; orders: CustomerOrder[]; receipts: CustomerReceipt[] }
export const customerItemAmount = (item: CustomerOrder['items'][number]) => item.total !== undefined ? item.total : item.price4 === undefined ? item.price * item.quantity : Math.round(item.price4 * item.quantity / 100)
export const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const phoneValid = (phone: string) => phone.split(';').every(p => /^[+\d][\d\s()-]{5,24}$/.test(p.trim()))
const required = (value: string, max: number, name: string) => { if (!value?.trim() || value.length > max) throw new Error(`${name}必填，且不得超过 ${max} 个字符。`) }
const id = () => crypto.randomUUID()
export const fullAddress = (address?: CustomerAddress) => address ? [address.detail, address.street, address.barangay, address.city, address.province].filter(Boolean).join(', ') : '—'
export function customerMapUrl(address?: Pick<CustomerAddress, 'latitude' | 'longitude'>): string | null {
  if (!address || !Number.isFinite(address.latitude) || !Number.isFinite(address.longitude) || Math.abs(address.latitude) > 90 || Math.abs(address.longitude) > 180) return null
  const coordinates = `${address.latitude.toFixed(6)},${address.longitude.toFixed(6)}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`
}
export function blankCustomer(dealerId = '', ownerId = ''): Customer {
  return { id: id(), code: '', name: '', alias: '', dealerId, categoryId: '', channelId: '', ownerId, routeId: '', grade: 'B', frequency: '每周 1 次', keyOutlet: false, status: '潜在', creditLimit: 0, creditDays: 0, settlements: ['现金'], taxInfo: '', hours: '06:00—20:00', storeType: '独立店', chain: '', freezers: 0, freezerBrand: '无冰柜', competitors: [], photo: '', note: '', firstVisit: '', createdAt: '', updatedAt: '', createdBy: '', addresses: [blankAddress()], contacts: [blankContact()], visits: [], logs: [] }
}
export const blankAddress = (): CustomerAddress => ({ id: id(), label: '门店地址', province: '', city: '', barangay: '', street: '', detail: '', latitude: NaN, longitude: NaN, recipient: '', phone: '', primary: true })
export const blankContact = (): CustomerContact => ({ id: id(), name: '', role: '店主', phone: '', email: '', note: '', primary: true })
export function createCustomerSeed(tenantId: string): CustomerState {
  const state: CustomerState = { version: 1, revision: 0, customers: [], orders: [], receipts: [] }
  if (tenantId !== 'hani') return state
  const dealer: Record<string, string> = { 'OUT-001': 'dealer-mm', 'OUT-002': 'dealer-lz', 'OUT-003': 'dealer-cebu', 'OUT-004': 'dealer-pasig', 'OUT-006': 'dealer-lz', 'OUT-007': 'dealer-cebu', 'OUT-008': 'dealer-mm' }
  const points: Record<string, [number, number]> = { 'OUT-001': [14.6463, 121.0414], 'OUT-002': [15.0343, 120.6841], 'OUT-003': [10.3157, 123.8854], 'OUT-004': [14.5764, 121.0851], 'OUT-006': [15.145, 120.5887], 'OUT-007': [10.3333, 123.9422], 'OUT-008': [14.5547, 121.0244] }
  for (const [i, outlet] of outlets.filter(o => dealer[o.id]).entries()) {
    const dealerId = dealer[outlet.id], modern = outlet.channel === 'convenience', closed = !outlet.active
    const province = outlet.region === 'manila' ? 'Metro Manila' : outlet.region === 'northLuzon' ? 'Pampanga' : 'Cebu'
    const at = `2026-11-09T0${8 - i}:10:00+08:00`
    const c: Customer = { ...blankCustomer(dealerId, `s-${dealerId}`), id: outlet.id, code: `CU-BU-${dealerId === 'dealer-mm' ? '007' : dealerId === 'dealer-pasig' ? '008' : dealerId === 'dealer-lz' ? '009' : '010'}-${String(i + 1).padStart(6, '0')}`, name: outlet.name, alias: ['Nena 社区店', 'Santos 便利店', '宿务街角店', 'Reyes 家庭店', 'Marikit 便利店', '海岛日用店', 'Del Rosario 门店'][i], categoryId: modern ? 'outletCategories-CHAIN' : i === 0 ? 'outletCategories-KEY-SARI' : 'outletCategories-SARI', channelId: modern ? 'channels-MODERN' : 'channels-TRAD', grade: modern || i === 0 ? 'A' : 'B', frequency: modern || i === 0 ? '每周 2 次' : '每周 1 次', keyOutlet: modern || i === 0, routeId: outlet.region === 'manila' ? 'RT-0001' : outlet.id === 'OUT-002' ? 'RT-0002' : outlet.region === 'visayas' ? 'RT-0003' : '', status: closed ? '关闭' : '活跃', creditLimit: modern ? 5000000 : 3000000, creditDays: modern ? 30 : 7, settlements: ['现金', 'GCash 钱包', '赊销'], taxInfo: `TIN 123-456-${String(i + 1).padStart(3, '0')} · ${outlet.name}`, freezers: i % 3 + 1, freezerBrand: '蒙牛投放', competitors: ['competitors-SELECTA'], firstVisit: '2026-09-02', note: i === 0 ? '社区重点门店，周一和周四重点跟进补货。配送前请先联系店主。' : '', createdAt: '2026-09-01T09:00:00+08:00', updatedAt: at, createdBy: '总部管理员', contacts: [{ id: `contact-${outlet.id}`, name: outlet.contact, role: '店主', phone: `+63 917 800 ${String(1000 + i)}`, email: '', note: '配送前可电话联系', primary: true }], addresses: [{ id: `address-${outlet.id}`, label: '门店地址', province, city: outlet.address.split(',')[0], barangay: i === 0 ? 'Bagong Pag-asa' : 'Poblacion', street: i === 0 ? 'Mindanao Avenue' : 'Rizal Street', detail: `${18 + i} 号，临街一层`, latitude: points[outlet.id][0], longitude: points[outlet.id][1], recipient: outlet.contact, phone: `+63 917 800 ${1000 + i}`, primary: true }], visits: closed ? [] : [{ id: `visit-${outlet.id}`, date: '2026-11-07T10:30', actor: ({ 'dealer-mm': '唐雨', 'dealer-pasig': '沈星', 'dealer-lz': '陆川', 'dealer-cebu': '苏晴' } as Record<string, string>)[dealerId], type: '日常拜访', result: '已完成', content: i === 0 ? '核对冰柜温度及陈列，香草口味余量偏低。店主希望下次配送增加巧克力口味，已约定周四复访。' : '完成门店拜访，核对库存与陈列，沟通下次补货安排。', nextDate: '2026-11-12', source: '现场拜访' }], logs: [{ id: `log-${outlet.id}`, action: '客户建档', actor: '总部管理员', at: '2026-09-01T09:00:00+08:00', content: '演示档案已建立，门店、联系人及地址信息已归档。' }] }
    state.customers.push(c)
    const legacy = initialOrders.filter(o => o.outlet === outlet.name)
    for (const order of legacy) state.orders.push({ id: order.id, customerId: c.id, date: order.date, dueDate: '2026-11-14', amount: Math.round(order.amount * 100), status: ({ pending: '待审核', delivering: '配送中', delivered: '已签收', cancelled: '已取消' } as const)[order.status], payment: order.payment === 'credit' ? '赊销' : order.payment === 'cash' ? '现金' : 'GCash', owner: c.visits[0]?.actor ?? '唐雨', items: [{ name: order.snapshot?.productName ?? ({ vanilla: '香草冰淇淋棒', chocolate: '巧克力脆皮冰淇淋', strawberry: '草莓甜筒', mango: '芒果冰棒', milk: '经典牛奶冰淇淋', cookies: '曲奇奶油冰淇淋' } as Record<string, string>)[order.product], quantity: order.quantity, price: order.price * 100 }] })
    const pastId = `SO-261025-${String(100 + i)}`
    state.orders.push({ id: pastId, customerId: c.id, date: '2026-10-25', dueDate: i === 0 ? '2026-11-01' : '2026-11-24', amount: 1440000, status: '已签收', payment: '赊销', owner: c.visits[0]?.actor ?? '唐雨', items: [{ name: '香草冰淇淋棒', quantity: 480, price: 3000 }] })
    state.receipts.push({ id: `RC-261028-${String(i + 1).padStart(4, '0')}`, customerId: c.id, orderId: pastId, date: '2026-10-28', amount: i === 0 ? 576000 : closed ? 1020000 : 1440000, method: i % 2 ? '银行转账' : 'GCash', status: '已确认', actor: c.visits[0]?.actor ?? '唐雨', reference: `DEMO-${100008 + i}`, note: '演示收款凭证，仅用于展示客户往来。' })
    for (const order of state.orders.filter(o => o.customerId === c.id && o.id !== pastId && o.status === '已签收')) state.receipts.push({ id: `RC-261107-${String(i + 1).padStart(4, '0')}`, customerId: c.id, orderId: order.id, date: '2026-11-07', amount: order.amount, method: order.payment, status: '已确认', actor: order.owner, reference: `DEMO-${200008 + i}`, note: '订单已结清。' })
  }
  return state
}
export function readCustomers(tenantId: string): CustomerState {
  const raw = localStorage.getItem(customerStorageKey(tenantId))
  if (!raw) return projectSalesCustomers(createCustomerSeed(tenantId), tenantId)
  try {
    const s = JSON.parse(raw) as CustomerState
    if (s.version !== 1 || !Number.isInteger(s.revision) || !Array.isArray(s.customers) || !Array.isArray(s.orders) || !Array.isArray(s.receipts) || s.customers.some(c => typeof c.id !== 'string' || typeof c.name !== 'string' || !customerStatuses.includes(c.status) || !Number.isInteger(c.creditLimit) || !['addresses', 'contacts', 'visits', 'logs', 'settlements', 'competitors'].every(k => Array.isArray(c[k as keyof Customer])))) throw new Error()
    const unique = (rows: { id: string }[]) => new Set(rows.map(r => r.id)).size === rows.length
    if (!unique(s.customers) || !unique(s.orders) || !unique(s.receipts) || new Set(s.customers.map(c => c.code)).size !== s.customers.length || s.revision < 0) throw new Error()
    for (const c of s.customers) {
      if (!['id', 'code', 'name', 'alias', 'dealerId', 'categoryId', 'channelId', 'ownerId', 'routeId', 'grade', 'frequency', 'taxInfo', 'hours', 'storeType', 'chain', 'freezerBrand', 'photo', 'note', 'firstVisit', 'createdAt', 'updatedAt', 'createdBy'].every(k => typeof c[k as keyof Customer] === 'string') || !c.id || !c.code || !c.name || !Number.isInteger(c.creditDays) || !Number.isInteger(c.freezers) || !Number.isFinite(Date.parse(c.createdAt)) || !Number.isFinite(Date.parse(c.updatedAt)) || typeof c.keyOutlet !== 'boolean' || !c.settlements.every(v => typeof v === 'string') || !c.competitors.every(v => typeof v === 'string')) throw new Error()
      if (!unique(c.addresses) || !unique(c.contacts) || !unique(c.visits) || !unique(c.logs) || c.addresses.filter(a => a.primary).length !== 1 || c.contacts.filter(a => a.primary).length !== 1) throw new Error()
      c.addresses.forEach(a => { if (typeof a.id !== 'string' || typeof a.primary !== 'boolean') throw new Error(); validateAddress(a) })
      c.contacts.forEach(a => { if (typeof a.id !== 'string' || typeof a.primary !== 'boolean') throw new Error(); validateContact(a) })
      if (c.visits.some(v => !['id', 'date', 'actor', 'type', 'result', 'content', 'nextDate', 'source'].every(k => typeof v[k as keyof CustomerVisit] === 'string') || !Number.isFinite(Date.parse(v.date))) || c.logs.some(l => !['id', 'action', 'actor', 'at', 'content'].every(k => typeof l[k as keyof CustomerLog] === 'string') || !Number.isFinite(Date.parse(l.at)))) throw new Error()
    }
    for (const o of s.orders) {
      if (!s.customers.some(c => c.id === o.customerId) || !['待审核', '配送中', '已签收', '已取消'].includes(o.status) || !Number.isSafeInteger(o.amount) || o.amount < 0 || !Number.isFinite(Date.parse(o.date)) || !Number.isFinite(Date.parse(o.dueDate)) || typeof o.owner !== 'string' || typeof o.payment !== 'string' || !Array.isArray(o.items) || !o.items.length || o.items.some(i => typeof i.name !== 'string' || !Number.isInteger(i.quantity) || i.quantity < 1 || !Number.isSafeInteger(i.price) || i.price < 0 || i.price4 !== undefined && (!Number.isSafeInteger(i.price4) || i.price4 < 0)) || o.items.reduce((sum, i) => sum + customerItemAmount(i), 0) !== o.amount) throw new Error()
      if (o.sourceOrder) { const source = o.sourceOrder; if (source.id !== o.id || typeof source.outlet !== 'string' || typeof source.distributor !== 'string' || !['manila', 'northLuzon', 'visayas', 'mindanao'].includes(source.region) || !['pending', 'delivering', 'delivered', 'cancelled'].includes(source.status) || !['cash', 'credit', 'wallet'].includes(source.payment) || (!source.snapshot && !['vanilla', 'chocolate', 'strawberry', 'mango', 'milk', 'cookies'].includes(source.product)) || source.snapshot && !validOrderSnapshot(source) || Math.round(source.amount * 100) !== o.amount || !Number.isInteger(source.quantity) || Math.round(source.price * source.quantity * 100) !== o.amount) throw new Error() }
    }
    for (const r of s.receipts) if (!s.orders.some(o => o.id === r.orderId && o.customerId === r.customerId) || !['已确认', '待确认', '已作废'].includes(r.status) || !Number.isSafeInteger(r.amount) || r.amount < 0 || !Number.isFinite(Date.parse(r.date)) || !['id', 'actor', 'method', 'reference', 'note'].every(k => typeof r[k as keyof CustomerReceipt] === 'string')) throw new Error()
    return projectSalesCustomers(s, tenantId)
  } catch { throw new Error('客户数据读取失败，原数据已保留。请联系管理员检查后重试。') }
}
export function visibleCustomers(state: CustomerState, org: OrgState, scope: OrgScope | null) {
  const units = new Set(visibleUnits(org, scope).map(u => u.id))
  return state.customers.filter(c => units.has(c.dealerId))
}
function assertCustomerWrite(customer: Customer, org: OrgState, scope: OrgScope | null) { assertWrite(org, scope, customer.dealerId); if (!unitEnabled(org, customer.dealerId)) throw new Error('所属经销商已停用，无法维护客户。') }
export function customerTotals(state: CustomerState, customerId: string, asOf = localDate()) {
  const orders = state.orders.filter(o => o.customerId === customerId), receipts = state.receipts.filter(r => r.customerId === customerId && r.status === '已确认')
  const effective = orders.filter(o => ['已签收', '配送中'].includes(o.status))
  const receivable = orders.filter(o => o.status === '已签收')
  const outstanding = (o: CustomerOrder) => Math.max(0, o.amount - receipts.filter(r => r.orderId === o.id).reduce((s, r) => s + r.amount, 0))
  return { sales: effective.reduce((s, o) => s + o.amount, 0), received: receipts.reduce((s, r) => s + r.amount, 0), debt: receivable.reduce((s, o) => s + outstanding(o), 0), overdue: receivable.filter(o => o.dueDate < asOf).reduce((s, o) => s + outstanding(o), 0), orderCount: orders.length, receiptCount: state.receipts.filter(r => r.customerId === customerId).length, lastOrder: effective.map(o => o.date).sort().at(-1) ?? '', outstanding }
}
function validateAddress(a: CustomerAddress) {
  required(a.label, 40, '地址名称'); required(a.province, 80, '省'); required(a.city, 80, '市'); required(a.barangay, 80, 'Barangay'); required(a.detail, 200, '详细地址'); required(a.recipient, 40, '收货人')
  if (a.street.length > 100 || !phoneValid(a.phone)) throw new Error('街道不超过 100 字，请填写有效的收货电话。')
  if (!Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) || a.latitude < -90 || a.latitude > 90 || a.longitude < -180 || a.longitude > 180) throw new Error('请填写有效经纬度：纬度 -90～90，经度 -180～180。')
}
function validateContact(c: CustomerContact) {
  required(c.name, 40, '联系人'); required(c.role, 40, '职务')
  if (!phoneValid(c.phone) || c.note.length > 200 || (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))) throw new Error('请检查联系人电话、邮箱和备注（最多 200 字）。')
}
function addLog(c: Customer, action: string, content: string, actor: string): Customer { const at = new Date().toISOString(); return { ...c, updatedAt: at, logs: [...c.logs, { id: id(), action, content, actor, at }] } }
export function criticalCustomerChanges(old: Customer, next: Customer) { return [['categoryId', '门店分类'], ['ownerId', '负责业务员'], ['creditLimit', '信用额度'], ['creditDays', '账期']].filter(([key]) => old[key as keyof Customer] !== next[key as keyof Customer]).map(([, label]) => label) }
export function duplicateCustomers(state: CustomerState, input: Customer) {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}]/gu, '')
  const similarity = (a: string, b: string) => { a = normalize(a); b = normalize(b); if (!a.length || !b.length) return 0; const dp = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let previous = dp[0]; dp[0] = i; for (let j = 1; j <= b.length; j++) { const before = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = before } } return 1 - dp[b.length] / Math.max(a.length, b.length) }
  const a = input.addresses.find(a => a.primary)
  if (!a) return []
  return state.customers.filter(c => { const b = c.addresses.find(a => a.primary); if (c.id === input.id || c.dealerId !== input.dealerId || !b || similarity(c.name, input.name) <= .8) return false; const rad = Math.PI / 180, dLat = (a.latitude - b.latitude) * rad, dLng = (a.longitude - b.longitude) * rad; const distance = 6371000 * 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2)); return distance < 50 })
}
export function saveCustomer(state: CustomerState, input: Customer, org: OrgState, scope: OrgScope | null, archives: ArchiveState, confirmed = false, duplicateConfirmed = false): CustomerState {
  const old = state.customers.find(c => c.id === input.id)
  assertCustomerWrite(old ?? input, org, scope)
  if (old && (old.code !== input.code || old.dealerId !== input.dealerId)) throw new Error('门店编码和所属经销商创建后不可更改。')
  if (old && old.status !== input.status) throw new Error('请通过客户状态操作变更状态。')
  const c = { ...input, name: input.name.trim(), alias: input.alias.trim(), note: input.note.trim() }
  required(c.name, 80, '门店名称')
  if (/[\p{Extended_Pictographic}\p{Cc}]/u.test(c.name) || c.alias.length > 40 || c.note.length > 500) throw new Error('请检查名称、简称（40字内）与备注（500字内）。')
  const dealer = org.units.find(u => u.id === c.dealerId && u.tenantId === scope?.tenantId && u.level === 4 && u.active)
  if (!dealer || !org.people.some(p => p.id === c.ownerId && p.unitId === dealer.id && p.tenantId === scope?.tenantId && p.active && p.role === '成员')) throw new Error('请选择本经销商的在职业务员。')
  for (const [key, kind] of [['categoryId', 'outletCategories'], ['channelId', 'channels']] as const) if (!archives.rows.some(r => r.id === c[key] && r.kind === kind && (r.active || old?.[key] === c[key]))) throw new Error('请选择启用的门店分类和渠道。')
  if (!['A', 'B', 'C', 'D'].includes(c.grade) || !['每周 2 次', '每周 1 次', '每两周 1 次', '每月 1 次'].includes(c.frequency)) throw new Error('请选择有效等级和拜访频次。')
  if (!Number.isInteger(c.creditLimit) || c.creditLimit < 0 || c.creditLimit > 99999900 || !Number.isInteger(c.creditDays) || c.creditDays < 0 || c.creditDays > 90) throw new Error('信用额度为 0—999999 比索，最多两位小数；账期为 0—90 天的整数。')
  if (!c.settlements.length || c.settlements.some(name => !archives.rows.some(r => r.kind === 'settlementMethods' && r.name === name && (r.active || old?.settlements.includes(name))))) throw new Error('请选择有效的结算方式。')
  if (c.settlements.includes('赊销') && (!c.taxInfo.trim() || !c.creditLimit)) throw new Error('赊销客户须填写开票信息并设置大于 0 的信用额度。')
  if (!Number.isInteger(c.freezers) || c.freezers < 0 || c.freezers > 20 || (c.storeType === '连锁店' && !c.chain.trim())) throw new Error('冰柜数量应为 0—20 的整数；连锁店必须填写连锁名称。')
  if (!c.photo && !old) throw new Error('首次建档请上传门头照片。')
  if (c.photo && !/^data:image\/(png|jpeg|webp);base64,/.test(c.photo)) throw new Error('门头照片格式无效。')
  if (c.taxInfo.length > 200 || c.hours.length > 40 || c.chain.length > 80 || !['独立店', '连锁店', '市场摊位', '流动摊点'].includes(c.storeType) || !['蒙牛投放', '门店自有', '竞品投放', '无冰柜'].includes(c.freezerBrand)) throw new Error('请检查开票信息、营业时间、门店类型、连锁名称和冰柜归属。')
  if (c.competitors.some(value => !archives.rows.some(r => r.kind === 'competitors' && r.id === value && (r.active || old?.competitors.includes(value))))) throw new Error('请选择有效的竞品档案。')
  if (!c.addresses.length || c.addresses.filter(a => a.primary).length !== 1 || !c.contacts.length || c.contacts.filter(a => a.primary).length !== 1) throw new Error('必须保留一个默认地址和一个主要联系人。')
  c.addresses.forEach(validateAddress); c.contacts.forEach(validateContact)
  c.addresses = c.addresses.map(a => ({ ...a, latitude: Number(a.latitude.toFixed(6)), longitude: Number(a.longitude.toFixed(6)) }))
  if (old && criticalCustomerChanges(old, c).length && !confirmed) throw new Error('分类、业务员、信用额度或账期变更，请先二次确认。')
  if (old && c.creditLimit !== old.creditLimit && (Math.abs(c.creditLimit - old.creditLimit) > old.creditLimit * .5 || Math.abs(c.creditLimit - old.creditLimit) > 5000000)) throw new Error('额度变更超过原额度 50% 或 5 万比索，须财务审批；当前演示未接入审批，暂不允许直接保存此项变更。')
  if (!old && duplicateCustomers(state, c).length && !duplicateConfirmed) throw new Error('发现同一经销商下名称相似、距离小于 50 米的客户，请核对后确认是否继续建档。')
  const at = new Date().toISOString()
  if (!old) { const prefix = `CU-${dealer.code}-`; const next = Math.max(0, ...state.customers.filter(o => o.code.startsWith(prefix)).map(o => Number(o.code.slice(prefix.length)) || 0)) + 1; c.code = `${prefix}${String(next).padStart(6, '0')}`; c.createdAt = at; c.createdBy = scope!.email; c.status = '潜在'; c.visits = []; c.logs = [] }
  else { c.visits = old.visits; c.logs = old.logs; c.createdAt = old.createdAt; c.createdBy = old.createdBy; c.firstVisit = old.firstVisit }
  const details = old ? `${criticalCustomerChanges(old, c).join('、') || '基本信息'}已更新。${old.ownerId !== c.ownerId ? `业务交接时间：${at}；历史订单与应收归属保持原记录。` : ''}` : 'PC 客户建档，信息即时生效。'
  const saved = addLog(c, old ? '编辑客户' : '客户建档', details, scope!.email)
  return { ...state, customers: old ? state.customers.map(row => row.id === c.id ? saved : row) : [saved, ...state.customers] }
}
export type RelatedChange = { kind: 'address'; value: CustomerAddress } | { kind: 'contact'; value: CustomerContact } | { kind: 'visit'; value: CustomerVisit } | { kind: 'note'; content: string } | { kind: 'deleteAddress' | 'deleteContact'; id: string } | { kind: 'status'; status: CustomerStatus; reason: string }
export function changeCustomer(state: CustomerState, customerId: string, change: RelatedChange, org: OrgState, scope: OrgScope | null): CustomerState {
  const old = state.customers.find(c => c.id === customerId)
  if (!old) throw new Error('客户不存在。')
  assertCustomerWrite(old, org, scope)
  let c = { ...old }, action = '', content = ''
  if (change.kind === 'address') { const a = change.value; validateAddress(a); if (!old.addresses.length && !a.primary) throw new Error('首个地址必须设为默认。'); c.addresses = [...old.addresses.filter(x => x.id !== a.id).map(x => a.primary ? { ...x, primary: false } : x), { ...a, latitude: Number(a.latitude.toFixed(6)), longitude: Number(a.longitude.toFixed(6)) }]; if (c.addresses.filter(x => x.primary).length !== 1) throw new Error('请保留一个默认地址。'); action = '维护客户地址'; content = `${a.label} · ${fullAddress(a)}` }
  if (change.kind === 'contact') { const a = change.value; validateContact(a); c.contacts = [...old.contacts.filter(x => x.id !== a.id).map(x => a.primary ? { ...x, primary: false } : x), a]; if (c.contacts.filter(x => x.primary).length !== 1) throw new Error('请保留一位主要联系人。'); action = '维护联系人'; content = `${a.name} · ${a.role}` }
  if (change.kind === 'deleteAddress' || change.kind === 'deleteContact') { const field = change.kind === 'deleteAddress' ? 'addresses' : 'contacts'; const target = c[field].find(x => x.id === change.id); if (!target || target.primary) throw new Error('默认地址或主要联系人不能删除，请先指定其他记录为默认。'); if (field === 'addresses') c.addresses = c.addresses.filter(x => x.id !== change.id); else c.contacts = c.contacts.filter(x => x.id !== change.id); action = field === 'addresses' ? '删除客户地址' : '删除联系人'; content = '移除一条非默认记录。' }
  if (change.kind === 'visit') { const v = change.value; if (!v.date || Number.isNaN(Date.parse(v.date)) || new Date(v.date).getTime() > Date.now()) throw new Error('拜访时间须为已发生的有效时间。'); required(v.actor, 40, '拜访人'); required(v.content, 1000, '拜访内容'); if (v.nextDate && v.nextDate < v.date.slice(0, 10)) throw new Error('下次跟进日期不能早于本次拜访。'); c.visits = [{ ...v, id: id(), source: 'PC补录' }, ...c.visits]; if (!c.firstVisit && v.result === '已完成') c.firstVisit = v.date.slice(0, 10); action = '补录外勤记录'; content = `${v.type} · ${v.content}` }
  if (change.kind === 'note') { required(change.content, 1000, '跟进内容'); action = '跟进记录'; content = change.content.trim() }
  if (change.kind === 'status') { required(change.reason, 200, '状态变更原因'); if (!customerStatuses.includes(change.status) || change.status === old.status) throw new Error('请选择不同的有效状态。'); if (old.status === '关闭' && change.status !== '关闭') throw new Error('关闭客户重新激活需重新采集门头照与坐标，并由管理员审核；当前演示未接入重新激活审核。'); c.status = change.status; action = '客户状态变更'; content = `${old.status} → ${change.status}；原因：${change.reason}` }
  c = addLog(c, action, content, scope!.email)
  return { ...state, customers: state.customers.map(row => row.id === customerId ? c : row) }
}
export function batchCustomerCategory(state: CustomerState, ids: string[], categoryId: string, archives: ArchiveState, org: OrgState, scope: OrgScope | null): CustomerState {
  const category = archives.rows.find(r => r.kind === 'outletCategories' && r.id === categoryId && r.active)
  if (!category || !ids.length) throw new Error('请选择客户和启用的分类。')
  const unique = new Set(ids)
  for (const customerId of unique) { const customer = state.customers.find(c => c.id === customerId); if (!customer) throw new Error('部分客户已不存在，请刷新。'); assertCustomerWrite(customer, org, scope) }
  return { ...state, customers: state.customers.map(c => unique.has(c.id) ? addLog({ ...c, categoryId }, '批量调整分类', `门店分类调整为「${category.name}」；渠道、等级、频次保持原值。`, scope!.email) : c) }
}
export function dormancyHint(state: CustomerState, customer: Customer, date = localDate()) {
  if (customer.status === '关闭' || customer.status === '潜在') return ''
  const last = customerTotals(state, customer.id, date).lastOrder || customer.createdAt.slice(0, 10)
  const days = Math.floor((Date.parse(date) - Date.parse(last)) / 86400000)
  return days >= 180 ? '关闭候选 · 180 天无有效订单' : days >= 60 ? '休眠提醒 · 60 天无有效订单' : ''
}
export function categoryCustomerStats(state: CustomerState, categoryId: string, archives: ArchiveState, customers = state.customers, asOf = localDate()) {
  const ids = new Set([categoryId])
  archives.rows.filter(r => r.kind === 'outletCategories' && r.values.parentId === categoryId).forEach(r => ids.add(r.id))
  const rows = customers.filter(c => ids.has(c.categoryId)), customerIds = new Set(rows.map(c => c.id))
  const month = new Date(`${asOf.slice(0, 7)}-01T00:00:00Z`), end = month.toISOString().slice(0, 10)
  month.setUTCMonth(month.getUTCMonth() - 3)
  const start = month.toISOString().slice(0, 10)
  const sales = state.orders.filter(o => customerIds.has(o.customerId) && ['已签收', '配送中'].includes(o.status) && o.date >= start && o.date < end).reduce((sum, o) => sum + o.amount, 0)
  return { count: rows.length, active: rows.filter(c => c.status === '活跃').length, monthlySales: Math.round(sales / 3), start, end }
}
export function customerArchiveReferences(state: CustomerState, kind: string, archiveId: string, archiveName = '') {
  return state.customers.filter(c => kind === 'outletCategories' ? c.categoryId === archiveId : kind === 'channels' ? c.channelId === archiveId : kind === 'competitors' ? c.competitors.includes(archiveId) : kind === 'settlementMethods' ? c.settlements.includes(archiveName) : false).length
}
export function linkCustomerSalesOrder(state: CustomerState, customerId: string, order: Order, org: OrgState, scope: OrgScope | null): CustomerState {
  const customer = state.customers.find(c => c.id === customerId)
  if (!customer) throw new Error('关联客户不存在。')
  assertCustomerWrite(customer, org, scope)
  if (customer.status === '关闭') throw new Error('已关闭客户不能新建销售订单。')
  if (state.orders.some(o => o.id === order.id)) throw new Error('订单编号已存在，请刷新后重试。')
  if (!order.id || !/^\d{4}-\d{2}-\d{2}$/.test(order.date) || !Number.isFinite(Date.parse(order.date)) || !['pending', 'delivering', 'delivered', 'cancelled'].includes(order.status) || !Number.isInteger(order.quantity) || order.quantity <= 0 || !Number.isFinite(order.price) || order.price < 0 || !Number.isFinite(order.amount) || order.amount < 0 || Math.round(order.price * order.quantity * 100) !== Math.round(order.amount * 100)) throw new Error('订单编号、日期、数量、单价与金额不一致或无效。')
  const due = new Date(`${order.date}T00:00:00Z`); due.setUTCDate(due.getUTCDate() + customer.creditDays)
  if (order.snapshot && !validOrderSnapshot(order)) throw new Error('订单价格快照无效。')
  const row: CustomerOrder = { id: order.id, customerId, date: order.date, dueDate: due.toISOString().slice(0, 10), amount: Math.round(order.amount * 100), status: ({ pending: '待审核', delivering: '配送中', delivered: '已签收', cancelled: '已取消' } as const)[order.status], payment: order.payment === 'credit' ? '赊销' : order.payment === 'cash' ? '现金' : '电子钱包', owner: org.people.find(p => p.id === customer.ownerId)?.name ?? '', items: [{ name: order.snapshot?.productName ?? ({ vanilla: '香草冰淇淋棒', chocolate: '巧克力脆皮冰淇淋', strawberry: '草莓甜筒', mango: '芒果冰棒', milk: '经典牛奶冰淇淋', cookies: '曲奇奶油冰淇淋' } as Record<string, string>)[order.product] ?? order.product, quantity: order.quantity, price: Math.round(order.price * 100), ...(order.snapshot ? { price4: order.snapshot.price4, unit: order.snapshot.unitName } : {}) }, ...(order.snapshot?.gift ? [{ name: `${order.snapshot.productName}（赠品）`, quantity: order.snapshot.gift, price: 0, price4: 0, unit: order.snapshot.unitName, giftFor: order.snapshot.productId }] : [])], sourceOrder: structuredClone(order) }
  return { ...state, orders: [row, ...state.orders], customers: state.customers.map(c => c.id === customerId ? { ...c, updatedAt: new Date().toISOString() } : c) }
}
function validOrderSnapshot(order: Order) {
  const s = order.snapshot
  return !!s && ['productId', 'productCode', 'productName', 'unitId', 'unitName', 'listId', 'listCode', 'listName', 'lineId', 'currencyId', 'currencyCode', 'pricedAt'].every(k => typeof s[k as keyof typeof s] === 'string' && !!s[k as keyof typeof s]) && Number.isSafeInteger(s.price4) && s.price4 >= 0 && s.price4 / 10000 === order.price && Number.isSafeInteger(s.gift) && s.gift >= 0 && typeof s.taxIncluded === 'boolean' && typeof s.approvalRequired === 'boolean' && Number.isFinite(s.tax) && s.currencyCode === 'PHP'
}
export function restoreCustomerSalesOrders(state: CustomerState): Order[] { return state.orders.filter(o => o.sourceOrder).map(o => ({ ...o.sourceOrder! })) }

export const customerTabs = ['详细信息', '客户地址', '联系人', '外勤记录', '销售订单', '收款单', '修改记录'] as const
export type CustomerTab = typeof customerTabs[number]
export const customerMoney = (cents: number) => `₱${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Persist customer-owned records only; sales records are projected from the sales aggregate.
export function serializeCustomerState(state: CustomerState) {
  const ids = new Set(state.orders.filter(o => o.salesId).map(o => o.id))
  return JSON.stringify({ ...state, orders: state.orders.filter(o => !o.salesId), receipts: state.receipts.filter(r => !ids.has(r.orderId)) })
}

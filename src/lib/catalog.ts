import type { ArchiveState, Archive } from './basic-data'
import { currentRate } from './basic-data.ts'
import type { Customer } from './customers'
import { readCustomers } from './customers.ts'
import type { OrgScope, OrgState } from './organization'
import { unitEnabled } from './organization.ts'

export const catalogStorageKey = (tenant: string) => `tradevia-catalog-v1-${tenant}`
export const productStatuses = ['在售', '停售', '新品待上市'] as const
export const priceTypes = ['标准价', '渠道价', '促销价', '客户专属价', '经销商结算价'] as const
export type Product = {
  id: string; code: string; name: string; en: string; brandId: string; categoryId: string; spec: string
  baseUnitId: string; salesUnitId: string; pack: number; shelfDays: number; storage: string; tax: number; taxIncluded: boolean
  cost4: number; minimum4: number; retail4: number; qualityReturn: boolean; batch: boolean; image: string; barcodes: string[]
  status: typeof productStatuses[number]; note: string; createdAt: string; updatedAt: string; referenced: boolean
}
export type PriceLine = { id: string; productId: string; unitId: string; price4: number; discount: number; minimum: number; gift: number; start: string; end: string }
export type PriceList = {
  id: string; code: string; name: string; type: typeof priceTypes[number]; unitId: string; currencyId: string; taxIncluded: boolean
  start: string; end: string; priority: number; scope: '全部客户' | '按条件' | '指定客户'; channels: string[]; categories: string[]; grades: string[]; customers: string[]
  state: '草稿' | '待审核' | '已审核' | '停用'; note: string; lines: PriceLine[]; createdAt: string; updatedAt: string; approvedBy: string; approvedAt: string
}
export type CatalogState = { version: 1; revision: number; products: Product[]; lists: PriceList[]; retired: string[]; logs: { id: string; action: string; actor: string; at: string; unitId: string }[] }
export type PriceSnapshot = { productId: string; productCode: string; productName: string; unitId: string; unitName: string; price4: number; listId: string; listCode: string; listName: string; lineId: string; currencyId: string; currencyCode: string; taxIncluded: boolean; tax: number; gift: number; approvalRequired: boolean; pricedAt: string }
export const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const price4 = (value: string | number) => Math.round(Number(value) * 10000)
export const priceText = (value: number) => (value / 10000).toFixed(4)
export const money4 = (value: number, symbol = '₱') => `${symbol}${(value / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
export const effective4 = (line: PriceLine) => Math.round(line.price4 * line.discount / 100)
export const conversionRate = (product: Product) => product.baseUnitId === product.salesUnitId ? 1 : 1 / product.pack
export function blankProduct(): Product {
  return { id: crypto.randomUUID(), code: '', name: '', en: '', brandId: '', categoryId: '', spec: '', baseUnitId: 'unitArchives-CTN', salesUnitId: 'unitArchives-PCS', pack: 24, shelfDays: 365, storage: '冷冻（-18℃）', tax: 12, taxIncluded: true, cost4: 0, minimum4: 0, retail4: 0, qualityReturn: true, batch: true, image: '', barcodes: [], status: '新品待上市', note: '', createdAt: '', updatedAt: '', referenced: false }
}
export function blankPriceList(unitId: string): PriceList {
  return { id: crypto.randomUUID(), code: '', name: '', type: '标准价', unitId, currencyId: 'currencies-PHP', taxIncluded: true, start: dateToday(), end: `${dateToday().slice(0, 4)}-12-31`, priority: 100, scope: '全部客户', channels: [], categories: [], grades: [], customers: [], state: '草稿', note: '', lines: [], createdAt: '', updatedAt: '', approvedBy: '', approvedAt: '' }
}
export function createCatalogSeed(tenant: string): CatalogState {
  const state: CatalogState = { version: 1, revision: 0, products: [], lists: [], retired: [], logs: [] }
  if (tenant !== 'hani') return state
  const names = ['哈尼香草冰淇淋棒', '哈尼巧克力脆皮冰淇淋', '哈尼草莓甜筒', '哈尼芒果冰棒', '哈尼经典牛奶冰淇淋', '哈尼曲奇奶油冰淇淋']
  state.products = names.map((name, i) => ({ ...blankProduct(), id: `SKU-${String(i + 1).padStart(3, '0')}`, code: `SKU-${String(i + 1).padStart(3, '0')}`, name, en: ['Vanilla ice cream bar', 'Chocolate coated ice cream', 'Strawberry cone', 'Mango ice pop', 'Classic milk ice cream', 'Cookies and cream'][i], brandId: 'brands-HANI', categoryId: i === 2 ? 'productCategories-CONE' : 'productCategories-STICK', spec: i === 2 ? '90ml/支，24支/箱' : '80ml/支，24支/箱', minimum4: price4([24, 28, 24, 15, 20, 28][i]), retail4: price4([30, 35, 30, 20, 25, 35][i]), cost4: price4([18, 22, 18, 11, 15, 22][i]), status: '在售', createdAt: '2026-11-01T01:00:00Z', updatedAt: '2026-11-09T01:00:00Z', referenced: true }))
  const list: PriceList = { ...blankPriceList('ice'), id: 'price-standard', code: 'PL-STD-2026', name: '2026 年冰淇淋标准价', start: '2026-01-01', end: '2026-12-31', state: '已审核', approvedBy: '总部管理员', approvedAt: '2026-11-01T01:00:00Z', createdAt: '2026-11-01T01:00:00Z', updatedAt: '2026-11-09T01:00:00Z', lines: state.products.map(p => ({ id: `line-${p.id}`, productId: p.id, unitId: p.salesUnitId, price4: p.retail4, discount: 100, minimum: 1, gift: 0, start: '', end: '' })) }
  state.lists.push(list)
  return state
}
export function readCatalog(tenant: string): CatalogState {
  const raw = localStorage.getItem(catalogStorageKey(tenant))
  if (!raw) return createCatalogSeed(tenant)
  try {
    const s = JSON.parse(raw) as CatalogState
    if (s.version !== 1 || !Number.isInteger(s.revision) || s.revision < 0 || !Array.isArray(s.products) || !Array.isArray(s.lists) || !Array.isArray(s.logs) || !Array.isArray(s.retired)) throw new Error()
    const unique = (rows: { id: string }[]) => new Set(rows.map(r => r.id)).size === rows.length
    if (!unique(s.products) || !unique(s.lists) || new Set(s.products.map(p => p.code)).size !== s.products.length || new Set(s.lists.map(l => l.code)).size !== s.lists.length) throw new Error()
    for (const p of s.products) {
      if (!['id', 'code', 'name', 'en', 'brandId', 'categoryId', 'spec', 'baseUnitId', 'salesUnitId', 'storage', 'image', 'note', 'createdAt', 'updatedAt'].every(k => typeof p[k as keyof Product] === 'string') || !p.id || !p.code || !p.name || !productStatuses.includes(p.status) || !Array.isArray(p.barcodes) || p.barcodes.some(b => typeof b !== 'string' || !validBarcode(b)) || ['taxIncluded', 'qualityReturn', 'batch', 'referenced'].some(k => typeof p[k as keyof Product] !== 'boolean')) throw new Error()
      integer(p.pack, 1, 10000, '箱规'); integer(p.shelfDays, 1, 3650, '保质期')
      for (const v of [p.retail4, p.minimum4, p.cost4]) integer(v, 0, 1000000000000, '价格')
      if (!Number.isFinite(p.tax) || p.tax < 0 || p.tax > 100 || !p.batch || p.storage !== '冷冻（-18℃）') throw new Error()
    }
    const barcodes = s.products.flatMap(p => p.barcodes)
    if (new Set(barcodes).size !== barcodes.length) throw new Error()
    for (const l of s.lists) {
      if (!['id', 'code', 'name', 'unitId', 'currencyId', 'start', 'end', 'note', 'createdAt', 'updatedAt', 'approvedBy', 'approvedAt'].every(k => typeof l[k as keyof PriceList] === 'string') || !l.id || !l.code || !l.name || !priceTypes.includes(l.type) || !['草稿', '待审核', '已审核', '停用'].includes(l.state) || !['全部客户', '按条件', '指定客户'].includes(l.scope) || typeof l.taxIncluded !== 'boolean' || !['lines', 'customers', 'channels', 'categories', 'grades'].every(k => Array.isArray(l[k as keyof PriceList])) || !unique(l.lines) || !dateValid(l.start) || !dateValid(l.end) || l.end < l.start) throw new Error()
      integer(l.priority, 1, 9999, '优先级')
      if ([...l.customers, ...l.channels, ...l.categories, ...l.grades].some(v => typeof v !== 'string') || l.state === '已审核' && (!l.approvedBy || !Number.isFinite(Date.parse(l.approvedAt)))) throw new Error()
      for (const line of l.lines) {
        if (!line.id || !s.products.some(p => p.id === line.productId) || typeof line.unitId !== 'string' || typeof line.start !== 'string' || typeof line.end !== 'string' || !Number.isFinite(line.discount) || line.discount < 0 || line.discount > 100 || line.start && !dateValid(line.start) || line.end && !dateValid(line.end)) throw new Error()
        integer(line.price4, 0, 1000000000000, '单价'); integer(line.minimum, 1, 1000000, '起订量'); integer(line.gift, 0, 1000000, '赠品数量')
      }
    }
    if (s.logs.some(l => !['id', 'action', 'actor', 'at', 'unitId'].every(k => typeof l[k as keyof typeof l] === 'string')) || s.retired.some(v => typeof v !== 'string')) throw new Error()
    return s
  } catch { throw new Error('商品与价格数据读取失败，原数据已保留，请联系管理员。') }
}
export function ancestor(org: OrgState, parentId: string, childId: string): boolean {
  const seen = new Set<string>(); let id = childId
  while (id && !seen.has(id)) { if (id === parentId) return true; seen.add(id); id = org.units.find(u => u.id === id)?.parentId ?? '' }
  return false
}
export function canMaintainCatalog(org: OrgState, scope: OrgScope | null, unitId?: string) {
  const unit = org.units.find(u => u.id === scope?.unitId && u.tenantId === scope?.tenantId)
  if (!scope?.admin || !unit?.active || !unitEnabled(org, unit.id) || unit.level > 2) return false
  return !unitId || org.units.some(u => u.id === unitId && u.tenantId === scope.tenantId && unitEnabled(org, u.id)) && ancestor(org, scope.unitId, unitId)
}
export function productVisible(p: Product, archives: ArchiveState, org: OrgState, scope: OrgScope | null) {
  if (!scope) return false
  const divisionId = String(archives.rows.find(r => r.id === p.brandId)?.values.divisionId ?? '')
  return org.units.some(u => u.id === divisionId && u.tenantId === scope.tenantId) && (ancestor(org, scope.unitId, divisionId) || ancestor(org, divisionId, scope.unitId))
}
export function listVisible(l: PriceList, org: OrgState, scope: OrgScope | null) { return !!scope && org.units.some(u => u.id === l.unitId && u.tenantId === scope.tenantId) && (ancestor(org, scope.unitId, l.unitId) || ancestor(org, l.unitId, scope.unitId)) }
export function assertProductWrite(p: Product, archives: ArchiveState, org: OrgState, scope: OrgScope | null) {
  const division = String(archives.rows.find(r => r.id === p.brandId)?.values.divisionId ?? '')
  if (!canMaintainCatalog(org, scope, division) || !division) throw new Error('仅总部或所属事业部管理员可以维护商品。')
}
const text = (v: string, max: number, name: string) => { if (!v.trim() || v.trim().length > max) throw new Error(`${name}必填，且不能超过 ${max} 个字符。`) }
const integer = (v: number, min: number, max: number, name: string) => { if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error(`${name}须为 ${min}—${max} 范围内的整数。`) }
const dateValid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const overlap = (a: string, b: string, c: string, d: string) => a <= d && c <= b
const archive = (s: ArchiveState, id: string, kind: string) => s.rows.find(r => r.id === id && r.kind === kind && r.active)
export function validBarcode(v: string) {
  if (!/^\d{13}$/.test(v)) return false
  const sum = [...v.slice(0, 12)].reduce((n, x, i) => n + Number(x) * (i % 2 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === Number(v[12])
}
export function saveProduct(s: CatalogState, input: Product, a: ArchiveState, org: OrgState, scope: OrgScope | null): CatalogState {
  const old = s.products.find(p => p.id === input.id), p = { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), en: input.en.trim(), barcodes: input.barcodes.map(b => b.trim()).filter(Boolean) }
  if (old) assertProductWrite(old, a, org, scope)
  assertProductWrite(p, a, org, scope)
  text(p.code, 20, '商品编码'); text(p.name, 60, '商品名称'); text(p.spec, 100, '规格描述')
  if (!/^[A-Z][A-Z0-9-]*$/.test(p.code) || p.en.length > 100 || p.note.length > 1000) throw new Error('请检查编码格式、英文名称或备注长度。')
  if (old && p.code !== old.code) throw new Error('商品编码创建后不可修改。')
  if (s.products.some(x => x.id !== p.id && x.code === p.code) || (!old && s.retired.includes(`product:${p.code}`))) throw new Error('商品编码已存在或已归档，不可重复使用。')
  const category = archive(a, p.categoryId, 'productCategories'), brand = archive(a, p.brandId, 'brands')
  if (!category || !brand || category.values.brandId !== p.brandId) throw new Error('请选择启用且品牌一致的商品分类。')
  if (category.values.parentId && !archive(a, String(category.values.parentId), 'productCategories')) throw new Error('上级商品分类已停用。')
  if (![p.baseUnitId, p.salesUnitId].every(id => archive(a, id, 'unitArchives'))) throw new Error('请选择启用的基本单位和销售单位。')
  const baseName = archive(a, p.baseUnitId, 'unitArchives')!.name
  if (p.baseUnitId !== p.salesUnitId && (baseName !== '箱' || archive(a, p.salesUnitId, 'unitArchives')!.values.type !== '数量单位')) throw new Error('不同单位销售时，基本单位须为箱，销售单位须为数量单位；换算率按箱规计算。')
  integer(p.pack, 1, 10000, '箱规'); integer(p.shelfDays, 1, 3650, '保质期')
  if (!Number.isFinite(p.tax) || p.tax < 0 || p.tax > 100 || p.storage !== '冷冻（-18℃）' || !p.batch) throw new Error('冰淇淋固定冷冻储存、启用批次；税率须在 0—100% 之间。')
  for (const v of [p.cost4, p.minimum4, p.retail4]) integer(v, 0, 1000000000000, '价格（最多四位小数）')
  if (!productStatuses.includes(p.status)) throw new Error('无效商品状态。')
  if (new Set(p.barcodes).size !== p.barcodes.length || p.barcodes.some(b => !validBarcode(b) || s.products.some(x => x.id !== p.id && x.barcodes.includes(b)))) throw new Error('条码须为有效 EAN-13，且同一商品内、不同商品间均不可重复。')
  if (p.image && (!/^data:image\/(png|jpeg|webp);base64,/.test(p.image) || p.image.length > 2800000)) throw new Error('商品图片限 PNG、JPG、WebP，大小不超过 2 MB。')
  if (old && (productHasOrders(old, scope) || s.lists.some(l => l.lines.some(line => line.productId === p.id))) && ['brandId', 'taxIncluded', 'baseUnitId', 'salesUnitId', 'pack'].some(k => p[k as keyof Product] !== old[k as keyof Product])) throw new Error('商品已被业务或价目表引用，品牌、含税口径及单位换算不能直接修改。')
  const at = new Date().toISOString(), saved = { ...p, referenced: old?.referenced ?? false, createdAt: old?.createdAt ?? at, updatedAt: at }
  return { ...s, products: old ? s.products.map(x => x.id === p.id ? saved : x) : [...s.products, saved] }
}
export function deleteProduct(s: CatalogState, id: string, a: ArchiveState, org: OrgState, scope: OrgScope | null) {
  const p = s.products.find(p => p.id === id)
  if (!p) throw new Error('商品不存在。')
  assertProductWrite(p, a, org, scope)
  if (productHasOrders(p, scope) || s.lists.some(l => l.lines.some(line => line.productId === id))) throw new Error('商品已被业务或价目表引用，请使用下架保留历史记录。')
  return { ...s, products: s.products.filter(p => p.id !== id), retired: [...s.retired, `product:${p.code}`] }
}
export function priceStatus(l: PriceList, date = dateToday()) {
  if (l.state !== '已审核') return l.state
  return date > l.end ? '失效' : date < l.start ? '未生效' : '生效'
}
function productHasOrders(p: Product, scope: OrgScope | null) {
  return p.referenced || !!scope && readCustomers(scope.tenantId).orders.some(o => o.sourceOrder?.snapshot?.productId === p.id)
}
export function currencyRate(a: ArchiveState, currencyId: string, date: string) {
  return currentRate(a, currencyId, date)?.rate ?? 0
}
export function needsApproval(l: PriceList, s: CatalogState, a?: ArchiveState) {
  const rate = a ? currencyRate(a, l.currencyId, l.start) : 1
  return ['促销价', '客户专属价'].includes(l.type) || l.lines.some(line => { const p = s.products.find(p => p.id === line.productId); return p && Math.round(effective4(line) * rate) < unitMinimum4(p, line.unitId) })
}
export function unitMinimum4(p: Product, unitId: string) { return unitId === p.salesUnitId ? p.minimum4 : p.baseUnitId === unitId ? p.minimum4 * p.pack : Infinity }
export function validatePriceList(s: CatalogState, l: PriceList, a: ArchiveState, org: OrgState, scope: OrgScope | null, customers: Customer[], draft = false) {
  const old = s.lists.find(x => x.id === l.id)
  if (!canMaintainCatalog(org, scope, l.unitId) || old && !canMaintainCatalog(org, scope, old.unitId)) throw new Error('仅总部或所属事业部管理员可维护该价目表。')
  text(l.code, 16, '价目表编码'); text(l.name, 100, '价目表名称')
  if (!/^[A-Z][A-Z0-9-]*$/.test(l.code) || old && l.code !== old.code) throw new Error('编码格式不正确，或尝试修改已有编码。')
  if (s.lists.some(x => x.id !== l.id && x.code === l.code) || !old && s.retired.includes(`list:${l.code}`)) throw new Error('价目表编码已存在或已归档。')
  if (!priceTypes.includes(l.type) || !['全部客户', '按条件', '指定客户'].includes(l.scope) || !archive(a, l.currencyId, 'currencies')) throw new Error('请选择有效类型、适用范围与币种。')
  integer(l.priority, 1, 9999, '优先级')
  if (!dateValid(l.start) || !dateValid(l.end) || l.end < l.start) throw new Error('请填写有效日期，结束日期不能早于开始日期。')
  if (!currencyRate(a, l.currencyId, l.start)) throw new Error('该币种在价目表开始日期尚无有效汇率，请先维护币种汇率。')
  if (l.note.length > 1000 || new Set(l.lines.map(line => line.id)).size !== l.lines.length) throw new Error('备注不能超过 1000 字，商品明细标识不可重复。')
  if (l.type === '渠道价' && (!l.channels.length || l.scope !== '按条件')) throw new Error('渠道价须选择按条件适用，并指定渠道。')
  if (l.type === '客户专属价' && (l.scope === '全部客户' || l.scope === '指定客户' && !l.customers.length || l.scope === '按条件' && !l.categories.length)) throw new Error('客户专属价须指定客户或客户分类。')
  if (l.scope === '按条件' && !l.channels.length && !l.categories.length && !l.grades.length) throw new Error('请至少选择一个客户条件。')
  if (l.scope === '指定客户' && !l.customers.length) throw new Error('请至少选择一个适用客户。')
  if (l.channels.some(id => !archive(a, id, 'channels')) || l.categories.some(id => !archive(a, id, 'outletCategories')) || l.grades.some(g => !['A', 'B', 'C', 'D'].includes(g))) throw new Error('适用渠道、客户分类或等级无效。')
  if (l.customers.some(id => !customers.some(c => c.id === id && c.status !== '关闭' && ancestor(org, l.unitId, c.dealerId)))) throw new Error('指定客户必须有效且属于价目表业务单元。')
  if (!draft && !l.lines.length) throw new Error('请至少添加一个商品并维护价格。')
  for (const line of l.lines) {
    const p = s.products.find(p => p.id === line.productId)
    if (!p || !productVisible(p, a, org, scope) || !ancestor(org, String(a.rows.find(r => r.id === p.brandId)?.values.divisionId), l.unitId) && org.units.find(u => u.id === l.unitId)?.level !== 1) throw new Error('商品不属于当前业务单元。')
    if (p.status !== '在售') throw new Error(`${p.name}已停售或未上市，请移除后重试。`)
    if (l.taxIncluded !== p.taxIncluded) throw new Error(`${p.name}的含税口径与价目表不一致。`)
    if (![p.salesUnitId, p.baseUnitId].includes(line.unitId)) throw new Error(`${p.name}的销售单位与商品档案不一致。`)
    integer(line.price4, 0, 1000000000000, '单价（最多四位小数）'); integer(line.minimum, 1, 1000000, '阶梯起订量'); integer(line.gift, 0, 1000000, '赠品数量')
    if (!Number.isFinite(line.discount) || line.discount < 0 || line.discount > 100) throw new Error('折扣率须在 0—100% 之间。')
    const start = line.start || l.start, end = line.end || l.end
    if (!dateValid(start) || !dateValid(end) || start < l.start || end > l.end || end < start) throw new Error('明细生效期须在价目表有效期内，且结束不早于开始。')
    if (l.lines.some(other => other.id !== line.id && other.productId === line.productId && other.minimum === line.minimum && overlap(start, end, other.start || l.start, other.end || l.end))) throw new Error('同一商品同一起订量的明细生效期不能重叠；阶梯价请设置不同起订量。')
  }
  if (!draft && s.lists.some(other => other.id !== l.id && ['已审核', '待审核'].includes(other.state) && other.type === l.type && other.currencyId === l.currencyId && other.unitId === l.unitId && other.priority === l.priority && overlap(l.start, l.end, other.start, other.end) && scopeOverlaps(l, other, customers, org, a))) throw new Error('同一范围、类型和时段已存在相同优先级的价目表，请调整优先级或日期。')
}
export function matchesCustomer(l: PriceList, c: Customer, org: OrgState, a?: ArchiveState) {
  if (!ancestor(org, l.unitId, c.dealerId)) return false
  if (l.scope === '全部客户') return true
  if (l.scope === '指定客户') return l.customers.includes(c.id)
  const parentId = String(a?.rows.find(r => r.id === c.categoryId)?.values.parentId ?? '')
  return (!l.channels.length || l.channels.includes(c.channelId)) && (!l.categories.length || l.categories.includes(c.categoryId) || l.categories.includes(parentId)) && (!l.grades.length || l.grades.includes(c.grade))
}
function scopeOverlaps(a: PriceList, b: PriceList, customers: Customer[], org: OrgState, archives: ArchiveState) {
  if (customers.some(c => matchesCustomer(a, c, org, archives) && matchesCustomer(b, c, org, archives))) return true
  if (a.scope === '指定客户' || b.scope === '指定客户') return a.scope === b.scope && a.customers.some(id => b.customers.includes(id))
  if (a.scope === '全部客户' || b.scope === '全部客户') return true
  return (!a.channels.length || !b.channels.length || a.channels.some(x => b.channels.includes(x))) && (!a.categories.length || !b.categories.length || a.categories.some(x => b.categories.includes(x) || b.categories.includes(String(archives.rows.find(r => r.id === x)?.values.parentId ?? ''))) || b.categories.some(x => a.categories.includes(String(archives.rows.find(r => r.id === x)?.values.parentId ?? '')))) && (!a.grades.length || !b.grades.length || a.grades.some(x => b.grades.includes(x)))
}
export function savePriceList(s: CatalogState, input: PriceList, a: ArchiveState, org: OrgState, scope: OrgScope | null, customers: Customer[], submit: boolean) {
  const l = structuredClone(input); l.code = l.code.trim().toUpperCase(); l.name = l.name.trim()
  // Discard stale hidden scope values so subsequent type/range changes cannot leak recipients.
  if (l.scope !== '指定客户') l.customers = []
  if (l.scope !== '按条件') { l.channels = []; l.categories = []; l.grades = [] }
  validatePriceList(s, l, a, org, scope, customers, !submit)
  const at = new Date().toISOString(), old = s.lists.find(x => x.id === l.id)
  l.state = submit ? needsApproval(l, s, a) ? '待审核' : '已审核' : '草稿'
  l.approvedBy = l.state === '已审核' ? scope!.email : ''; l.approvedAt = l.state === '已审核' ? at : ''
  l.createdAt = old?.createdAt || at; l.updatedAt = at
  return { ...s, lists: old ? s.lists.map(x => x.id === l.id ? l : x) : [...s.lists, l] }
}
export function reviewPriceList(s: CatalogState, id: string, action: '通过' | '退回' | '停用' | '删除', a: ArchiveState, org: OrgState, scope: OrgScope | null, customers: Customer[]) {
  const l = s.lists.find(x => x.id === id)
  if (!l || !canMaintainCatalog(org, scope, l.unitId)) throw new Error('没有权限操作此价目表。')
  if (action === '删除') {
    if (l.state !== '草稿') throw new Error('仅草稿价目表可以删除。')
    return { ...s, lists: s.lists.filter(x => x.id !== id), retired: [...s.retired, `list:${l.code}`] }
  }
  if (action !== '停用' && l.state !== '待审核') throw new Error('仅待审核价目表可进行审核。')
  if (action === '通过') validatePriceList(s, l, a, org, scope, customers)
  const at = new Date().toISOString()
  return { ...s, lists: s.lists.map(x => x.id === id ? { ...x, state: action === '通过' ? '已审核' as const : action === '退回' ? '草稿' as const : '停用' as const, approvedBy: action === '通过' ? scope!.email : '', approvedAt: action === '通过' ? at : '', updatedAt: at } : x) }
}
export function resolvePrice(s: CatalogState, productId: string, unitId: string, customer: Customer, org: OrgState, archives: ArchiveState, date = dateToday(), quantity = 1, currencyId = 'currencies-PHP') {
  const p = s.products.find(x => x.id === productId)
  if (!p || p.status !== '在售' || customer.status === '关闭' || !Number.isInteger(quantity) || quantity < 1 || !dateValid(date) || !unitEnabled(org, customer.dealerId)) return null
  const rank = { '客户专属价': 4, '促销价': 3, '渠道价': 2, '标准价': 1, '经销商结算价': 0 }
  return s.lists.filter(l => l.currencyId === currencyId && l.taxIncluded === p.taxIncluded && l.type !== '经销商结算价' && unitEnabled(org, l.unitId) && priceStatus(l, date) === '生效' && matchesCustomer(l, customer, org, archives)).flatMap(l => l.lines.filter(line => line.productId === productId && line.unitId === unitId && line.minimum <= quantity && (line.start || l.start) <= date && (line.end || l.end) >= date).sort((a, b) => b.minimum - a.minimum || effective4(a) - effective4(b)).slice(0, 1).map(line => ({ list: l, line, price4: effective4(line), source: `${l.name} / ${l.code}`, approvalRequired: Math.round(effective4(line) * currencyRate(archives, l.currencyId, date)) < unitMinimum4(p, unitId) }))).sort((a, b) => rank[b.list.type] - rank[a.list.type] || b.list.priority - a.list.priority || b.list.start.localeCompare(a.list.start) || a.price4 - b.price4)[0] ?? null
}
export function snapshotOrderPrice(s: CatalogState, productId: string, unitId: string, customer: Customer, org: OrgState, archives: ArchiveState, scope: OrgScope | null, date = dateToday(), quantity = 1): PriceSnapshot {
  const p = s.products.find(p => p.id === productId)
  if (!p || !productVisible(p, archives, org, scope) || p.status !== '在售') throw new Error('商品已停售、未上市或不在当前组织可见范围内。')
  if (!scope || !ancestor(org, scope.unitId, customer.dealerId)) throw new Error('客户不在当前组织范围内。')
  const quote = resolvePrice(s, productId, unitId, customer, org, archives, date, quantity)
  if (!quote) throw new Error('未找到有效的 PHP 客户价格，请先维护并发布价目表。')
  return { productId: p.id, productCode: p.code, productName: p.name, unitId, unitName: archives.rows.find(r => r.id === unitId)?.name ?? '', price4: quote.price4, listId: quote.list.id, listCode: quote.list.code, listName: quote.list.name, lineId: quote.line.id, currencyId: quote.list.currencyId, currencyCode: archives.rows.find(r => r.id === quote.list.currencyId)?.code ?? 'PHP', taxIncluded: p.taxIncluded, tax: p.tax, gift: quote.line.gift, approvalRequired: quote.approvalRequired, pricedAt: date }
}
export function catalogReferences(s: CatalogState, row: Archive) {
  const products = s.products.filter(p => row.kind === 'productCategories' ? p.categoryId === row.id : row.kind === 'brands' ? p.brandId === row.id : row.kind === 'unitArchives' ? [p.baseUnitId, p.salesUnitId].includes(row.id) : false)
  const lists = s.lists.filter(l => row.kind === 'currencies' ? l.currencyId === row.id : row.kind === 'channels' ? l.channels.includes(row.id) : row.kind === 'outletCategories' ? l.categories.includes(row.id) : false)
  return { count: products.length + lists.length, selling: products.filter(p => p.status === '在售').length }
}

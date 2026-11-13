import type { OrgScope, OrgState } from './organization'
import { canMaintainCatalog, catalogReferences, readCatalog } from './catalog.ts'
import { customerArchiveReferences, readCustomers } from './customers.ts'

export const basicPages = ['unitArchives', 'currencies', 'brands', 'channels', 'productCategories', 'outletCategories', 'settlementMethods', 'competitors', 'businessReasons'] as const
export type BasicPage = typeof basicPages[number]
export type Archive = { id: string; kind: BasicPage; code: string; name: string; en: string; active: boolean; sort: number; note: string; values: Record<string, string | number | boolean>; refs: number; selling: number; updatedAt: string }
export type Rate = { id: string; currencyId: string; date: string; rate: number }
export type ArchiveState = { version: 1; revision: number; rows: Archive[]; rates: Rate[]; retiredCodes: string[]; logs: { id: string; actor: string; action: string; reason: string; at: string }[] }
export type Field = { key: string; label: string; type?: 'number' | 'select' | 'checkbox' | 'date' | 'image'; required?: boolean; options?: string[]; source?: BasicPage | 'divisions'; min?: number; max?: number; step?: string; hint?: string }
export type ArchiveDefinition = { title: string; singular: string; group: string; description: string; usage: string; fields: Field[]; columns: string[]; maxCode: number }
const frequency = ['每周 2 次', '每周 1 次', '每两周 1 次', '每月 1 次']
export const archiveDefinitions: Record<BasicPage, ArchiveDefinition> = {
  unitArchives: { title: '单位档案', singular: '单位', group: '商品基础', maxCode: 10, description: '统一商品的计量口径，支持整箱与拆零销售。', usage: '用于商品计量、库存数量与订单换算。实际箱规在商品档案中确认，不同商品可以使用不同箱规。', columns: ['type', 'base', 'factor', 'precision'], fields: [
    { key: 'type', label: '单位类型', type: 'select', options: ['数量单位', '重量单位', '体积单位'], required: true }, { key: 'base', label: '基本单位', type: 'checkbox', hint: '基本单位的换算率固定为 1。' }, { key: 'baseId', label: '换算基本单位', type: 'select', source: 'unitArchives' }, { key: 'factor', label: '默认换算率', type: 'number', min: 1, max: 1000000, required: true, hint: '1 个当前单位 = N 个基本单位；仅允许正整数。' }, { key: 'precision', label: '小数精度', type: 'number', min: 0, max: 3, required: true },
  ] },
  currencies: { title: '币种档案', singular: '币种', group: '商品基础', maxCode: 3, description: '以菲律宾比索为本位币，按生效日期维护汇率。', usage: '汇率表示 1 单位外币可兑换的菲律宾比索金额。历史单据保留发生时的汇率快照；本位币不可切换或停用。', columns: ['symbol', 'precision', 'base', 'rate'], fields: [
    { key: 'symbol', label: '货币符号', required: true }, { key: 'precision', label: '小数位数', type: 'number', min: 0, max: 4, required: true }, { key: 'rate', label: '初始汇率（折合 PHP）', type: 'number', min: 0.000001, max: 1000000, step: '0.000001', required: true }, { key: 'rateDate', label: '汇率生效日', type: 'date', required: true },
  ] },
  brands: { title: '品牌档案', singular: '品牌', group: '商品基础', maxCode: 12, description: '维护自有品牌及所属事业部，统一销量与铺货分析。', usage: '品牌归属一个事业部。存在在售商品时须先下架，才可停用品牌；被使用后编码及事业部归属锁定。', columns: ['divisionId', 'selling'], fields: [
    { key: 'divisionId', label: '所属事业部', type: 'select', source: 'divisions', required: true }, { key: 'logo', label: '品牌标识', type: 'image', hint: '支持 PNG 图片，大小不超过 1 MB。' },
  ] },
  channels: { title: '渠道档案', singular: '渠道', group: '客户与渠道', maxCode: 12, description: '按经营形态管理渠道，统一账期、拜访与冷链要求。', usage: '渠道默认参数供后续新建门店带入，修改不会自动覆盖存量门店。价目表将在商品与价格模块接入后关联。', columns: ['type', 'creditDays', 'frequency', 'coldChain'], fields: [
    { key: 'type', label: '渠道类型', type: 'select', options: ['传统', '现代', '餐饮', '特通', '其他'], required: true }, { key: 'creditDays', label: '默认账期（天）', type: 'number', min: 0, max: 90, required: true }, { key: 'frequency', label: '默认拜访频次', type: 'select', options: frequency, required: true }, { key: 'coldChain', label: '需要冷链陈列检查', type: 'checkbox' },
  ] },
  productCategories: { title: '商品分类', singular: '商品分类', group: '商品基础', maxCode: 12, description: '建立商品分类层级，统一存储条件与效期预警口径。', usage: '最多两级：品类—系列。分类归属一个品牌；被商品或下级分类引用后不能删除。', columns: ['parentId', 'brandId', 'tax', 'mandatory', 'warningDays'], fields: [
    { key: 'parentId', label: '上级分类', type: 'select', source: 'productCategories' }, { key: 'brandId', label: '所属品牌', type: 'select', source: 'brands', required: true }, { key: 'tax', label: '默认税率（%）', type: 'number', min: 0, max: 100, step: '0.01', required: true }, { key: 'mandatory', label: '是否必铺品项', type: 'checkbox' }, { key: 'storage', label: '存储条件', type: 'select', options: ['冷冻（-18℃）', '冷藏', '常温'], required: true }, { key: 'warningDays', label: '临期预警（剩余天数）', type: 'number', min: 1, max: 540, required: true },
  ] },
  outletCategories: { title: '门店分类', singular: '门店分类', group: '客户与渠道', maxCode: 12, description: '将渠道与门店等级组合，形成可执行的客户分层。', usage: '最多两级分类，子分类继承上级渠道。默认等级、频次与重点门店标记供后续新建门店带入。', columns: ['parentId', 'channelId', 'grade', 'frequency', 'keyOutlet'], fields: [
    { key: 'parentId', label: '上级分类', type: 'select', source: 'outletCategories' }, { key: 'channelId', label: '关联渠道', type: 'select', source: 'channels', required: true }, { key: 'grade', label: '门店等级', type: 'select', options: ['A', 'B', 'C', 'D'], required: true }, { key: 'frequency', label: '默认拜访频次', type: 'select', options: frequency, required: true }, { key: 'keyOutlet', label: '重点门店', type: 'checkbox' },
  ] },
  settlementMethods: { title: '结算方式', singular: '结算方式', group: '业务规则', maxCode: 12, description: '统一现金、银行及电子钱包等结算方式的展示口径。', usage: '结算类型决定后续收款凭证和信用校验要求。这里维护档案，不发起支付，也不保存银行账号或钱包密钥。', columns: ['type', 'voucher', 'credit'], fields: [
    { key: 'type', label: '结算类型', type: 'select', options: ['现金', '支票', '银行转账', '电子钱包', '赊销'], required: true }, { key: 'voucher', label: '需要收款凭证', type: 'checkbox' }, { key: 'credit', label: '需要账期与信用额度校验', type: 'checkbox', hint: '选择赊销时自动启用。' },
  ] },
  competitors: { title: '竞品档案', singular: '竞品', group: '客户与渠道', maxCode: 12, description: '统一竞品名称，避免门店与拜访采集时重复填写。', usage: '用于门店主要竞品、冰柜归属和拜访陈列记录，与自有品牌档案分别维护。', columns: ['company', 'category', 'freezer'], fields: [
    { key: 'company', label: '所属企业', required: true }, { key: 'category', label: '主营品类', type: 'select', options: ['冰淇淋', '乳制品', '冷冻食品', '其他'], required: true }, { key: 'freezer', label: '有冰柜投放', type: 'checkbox' },
  ] },
  businessReasons: { title: '业务原因', singular: '业务原因', group: '业务规则', maxCode: 12, description: '规范退货、报损与配送异常的原因，便于追责和统计。', usage: '按业务场景分别维护原因。选择需要补充说明的原因时，后续单据应要求填写说明；原因不会自行触发退款或库存调整。', columns: ['scene', 'responsibility', 'explanation'], fields: [
    { key: 'scene', label: '适用场景', type: 'select', options: ['销售退货', '库存报损', '配送拒收', '出库差异', '拜访跳过'], required: true }, { key: 'responsibility', label: '默认责任方', type: 'select', options: ['待判定', '供应商', '经销商', '配送方', '门店'], required: true }, { key: 'explanation', label: '需要补充说明', type: 'checkbox' },
  ] },
}
export const archiveStorageKey = (tenantId: string) => `tradevia-basic-data-v1-${tenantId}`
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function createArchiveSeed(tenantId: string): ArchiveState {
  const rows: Archive[] = []
  const add = (kind: BasicPage, code: string, name: string, en: string, values: Archive['values'], refs = 0, selling = 0, active = true) => rows.push({ id: `${kind}-${code}`, kind, code, name, en, values, refs, selling, active, sort: (rows.filter(r => r.kind === kind).length + 1) * 10, note: '', updatedAt: '2026-11-09T01:00:00.000Z' })
  add('unitArchives', 'PCS', '支', 'Piece', { type: '数量单位', base: true, baseId: '', factor: 1, precision: 0 }, tenantId === 'hani' ? 6 : 0)
  add('unitArchives', 'CTN', '箱', 'Carton', { type: '数量单位', base: false, baseId: 'unitArchives-PCS', factor: 24, precision: 0 }, tenantId === 'hani' ? 6 : 0)
  add('unitArchives', 'BOX', '盒', 'Box', { type: '数量单位', base: true, baseId: '', factor: 1, precision: 0 })
  add('unitArchives', 'BAG', '袋', 'Bag', { type: '数量单位', base: true, baseId: '', factor: 1, precision: 0 })
  add('currencies', 'PHP', '菲律宾比索', 'Philippine Peso', { symbol: '₱', precision: 2, base: true, rate: 1, rateDate: '2026-01-01' }, tenantId === 'hani' ? 12 : 0)
  add('currencies', 'USD', '美元', 'US Dollar', { symbol: '$', precision: 2, base: false, rate: 58.25, rateDate: '2026-11-01' })
  add('currencies', 'CNY', '人民币', 'Chinese Yuan', { symbol: '¥', precision: 2, base: false, rate: 8.12, rateDate: '2026-11-01' })
  for (const [code, name, en, type, voucher] of [['CASH', '现金', 'Cash', '现金', false], ['CHECK', '支票', 'Check', '支票', true], ['BANK', '银行转账', 'Bank transfer', '银行转账', true], ['GCASH', 'GCash 钱包', 'GCash', '电子钱包', true], ['MAYA', 'Maya 钱包', 'Maya', '电子钱包', true], ['CREDIT', '赊销', 'Credit', '赊销', false]] as const) add('settlementMethods', code, name, en, { type, voucher, credit: type === '赊销' }, tenantId === 'hani' ? 2 : 0)
  if (tenantId === 'hani') {
    add('brands', 'HANI', '哈尼', 'Hani', { divisionId: 'ice', logo: '' }, 6, 6)
    add('brands', 'HANI-SELECT', '哈尼甄选', 'Hani Select', { divisionId: 'ice', logo: '' })
    add('brands', 'ISLAND', '海岛轻食', 'Island Foods', { divisionId: 'food', logo: '' }, 0, 0, false)
    for (const [code, name, en, type, creditDays, freq] of [['TRAD', '传统渠道', 'Traditional trade', '传统', 0, '每周 2 次'], ['MODERN', '现代渠道', 'Modern trade', '现代', 30, '每周 1 次'], ['FOOD', '餐饮渠道', 'Food service', '餐饮', 15, '每周 1 次'], ['SPECIAL', '特通渠道', 'Special trade', '特通', 7, '每两周 1 次']] as const) add('channels', code, name, en, { type, creditDays, frequency: freq, coldChain: true }, 3)
    add('productCategories', 'ICE', '冰淇淋', 'Ice cream', { brandId: 'brands-HANI', tax: 12, mandatory: false, parentId: '', storage: '冷冻（-18℃）', warningDays: 60 })
    add('productCategories', 'STICK', '棒冰', 'Ice cream bars', { brandId: 'brands-HANI', tax: 12, mandatory: false, parentId: 'productCategories-ICE', storage: '冷冻（-18℃）', warningDays: 60 }, 4)
    add('productCategories', 'CONE', '甜筒', 'Cones', { brandId: 'brands-HANI', tax: 12, mandatory: false, parentId: 'productCategories-ICE', storage: '冷冻（-18℃）', warningDays: 60 }, 2)
    add('productCategories', 'FAMILY', '家庭装', 'Family tubs', { brandId: 'brands-HANI', tax: 12, mandatory: false, parentId: 'productCategories-ICE', storage: '冷冻（-18℃）', warningDays: 90 })
    add('outletCategories', 'SARI', '社区零售店', 'Sari-sari stores', { parentId: '', channelId: 'channels-TRAD', grade: 'B', frequency: '每周 1 次', keyOutlet: false }, 8)
    add('outletCategories', 'KEY-SARI', '重点社区店', 'Key community stores', { parentId: 'outletCategories-SARI', channelId: 'channels-TRAD', grade: 'A', frequency: '每周 2 次', keyOutlet: true }, 2)
    add('outletCategories', 'CHAIN', '连锁便利店', 'Chain convenience stores', { parentId: '', channelId: 'channels-MODERN', grade: 'A', frequency: '每周 2 次', keyOutlet: true }, 2)
    add('competitors', 'SELECTA', '和路雪 Selecta', 'Selecta', { company: 'Unilever / RFM', category: '冰淇淋', freezer: true }, 5)
    add('competitors', 'NESTLE', '雀巢冰淇淋', 'Nestlé Ice Cream', { company: 'Nestlé', category: '冰淇淋', freezer: true }, 3)
    add('competitors', 'MAGNOLIA', '木兰冰淇淋', 'Magnolia', { company: 'San Miguel', category: '冰淇淋', freezer: true })
    for (const [code, name, en, scene, responsibility] of [['RET-MELT', '融化', 'Melted', '销售退货', '配送方'], ['RET-DAMAGE', '包装破损', 'Damaged packaging', '销售退货', '待判定'], ['LOSS-EXPIRE', '超过保质期', 'Expired', '库存报损', '经销商'], ['LOSS-MELT', '冷链中断融化', 'Cold chain failure', '库存报损', '经销商'], ['REJECT-CLOSE', '门店关闭', 'Store closed', '配送拒收', '门店'], ['DIFF-SHORT', '库存不足', 'Insufficient stock', '出库差异', '经销商'], ['VISIT-CLOSE', '门店未营业', 'Store not open', '拜访跳过', '门店'], ['RET-OTHER', '其他退货原因', 'Other return reasons', '销售退货', '待判定']] as const) add('businessReasons', code, name, en, { scene, responsibility, explanation: true })
  }
  return { version: 1, revision: 0, rows, rates: rows.filter(r => r.kind === 'currencies').map(r => ({ id: crypto.randomUUID(), currencyId: r.id, date: String(r.values.rateDate), rate: Number(r.values.rate) })), retiredCodes: [], logs: [] }
}
export function readArchives(tenantId: string): ArchiveState {
  const raw = localStorage.getItem(archiveStorageKey(tenantId))
  if (!raw) return createArchiveSeed(tenantId)
  try {
    const parsed = JSON.parse(raw) as ArchiveState
    if (parsed.version !== 1 || !Number.isInteger(parsed.revision) || !Array.isArray(parsed.rows) || !Array.isArray(parsed.rates) || !Array.isArray(parsed.logs) || !Array.isArray(parsed.retiredCodes) || parsed.rows.some(r => !basicPages.includes(r.kind) || typeof r.id !== 'string' || typeof r.code !== 'string' || typeof r.name !== 'string' || typeof r.active !== 'boolean' || !r.values || typeof r.refs !== 'number')) throw new Error()
    parsed.rows = parsed.rows.map(r => r.kind === 'productCategories' ? { ...r, values: { brandId: parsed.rows.find(b => b.kind === 'brands' && b.active)?.id ?? '', tax: 12, mandatory: false, ...r.values } } : r)
    return parsed
  } catch { throw new Error('基础档案读取失败，已保留原数据。请联系管理员处理后重试。') }
}
export function canMaintainArchives(org: OrgState, scope: OrgScope | null): boolean {
  return !!scope?.admin && org.units.some(u => u.id === scope.unitId && u.tenantId === scope.tenantId && u.level === 1 && u.active)
}
export function assertArchiveWrite(org: OrgState, scope: OrgScope | null) {
  if (!canMaintainArchives(org, scope)) throw new Error('仅总部管理员可以维护基础档案。')
}
export function relatedArchives(state: ArchiveState, row: Archive): Archive[] {
  return state.rows.filter(r => r.id !== row.id && archiveDefinitions[r.kind].fields.some(f => f.source === row.kind && r.values[f.key] === row.id))
}
export function referenceCount(state: ArchiveState, row: Archive, businessReferences = row.refs): number { return businessReferences + relatedArchives(state, row).length }
export function currentRate(state: ArchiveState, id: string, date = today()): Rate | undefined { return state.rates.filter(r => r.currencyId === id && r.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0] }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value }
function validateRate(rate: number, date: string) {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000 || Math.abs(rate * 1000000 - Math.round(rate * 1000000)) > 0.001) throw new Error('汇率须大于 0，不超过 1,000,000，最多保留 6 位小数。')
  if (!validDate(date)) throw new Error('请选择有效的汇率生效日期。')
}
export function saveArchive(state: ArchiveState, draft: Archive, org: OrgState, scope: OrgScope | null): ArchiveState {
  if (draft.kind === 'productCategories') {
    const division = String(state.rows.find(r => r.id === draft.values.brandId)?.values.divisionId ?? '')
    if (!division || !canMaintainCatalog(org, scope, division)) throw new Error('仅总部或所属事业部管理员可维护商品分类。')
    const original = state.rows.find(r => r.id === draft.id)
    if (original && !canMaintainCatalog(org, scope, String(state.rows.find(r => r.id === original.values.brandId)?.values.divisionId ?? ''))) throw new Error('没有权限修改该商品分类。')
  } else assertArchiveWrite(org, scope)
  const old = state.rows.find(r => r.id === draft.id)
  const row: Archive = { ...draft, code: draft.code.trim().toUpperCase(), name: draft.name.trim(), en: draft.en.trim(), note: draft.note.trim(), refs: old?.refs ?? 0, selling: old?.selling ?? 0, values: { ...draft.values }, updatedAt: new Date().toISOString() }
  const def = archiveDefinitions[row.kind]
  if (!def) throw new Error('无效的档案类型。')
  if (old && (old.kind !== row.kind || old.code !== row.code || old.active !== row.active)) throw new Error('编码不可修改，状态请通过启用或停用操作调整。')
  if (!new RegExp(`^[A-Z][A-Z0-9-]{0,${def.maxCode - 1}}$`).test(row.code)) throw new Error(`编码须以字母开头，仅含大写字母、数字或短横线，最长 ${def.maxCode} 位。`)
  if (row.kind === 'currencies' && !/^[A-Z]{3}$/.test(row.code)) throw new Error('币种编码须为 3 位 ISO 字母代码。')
  if (!row.name || (row.kind !== 'productCategories' && !row.en) || row.name.length > (row.kind === 'unitArchives' ? 20 : 40) || row.en.length > (row.kind === 'unitArchives' ? 20 : 80)) throw new Error(row.kind === 'productCategories' ? '请填写分类名称，并遵守名称长度限制。' : '请填写中英文名称，并遵守名称长度限制。')
  if (/[\p{Extended_Pictographic}\p{Cc}]/u.test(row.name + row.en)) throw new Error('名称中不能包含表情或控制字符。')
  if (!Number.isInteger(row.sort) || row.sort < 0 || row.sort > 9999 || row.note.length > 500) throw new Error('排序号须为 0—9999 的整数，备注不得超过 500 字。')
  if (state.rows.some(r => r.id !== row.id && r.kind === row.kind && (r.code === row.code || r.name === row.name || (!!row.en && r.en.toLowerCase() === row.en.toLowerCase())))) throw new Error('同类档案的编码、中文名或英文名已存在，请勿重复建档。')
  if (!old && state.retiredCodes.includes(`${row.kind}:${row.code}`)) throw new Error('该编码已被删除归档，不可复用。')
  if (row.kind === 'unitArchives' && row.values.base) { row.values.factor = 1; row.values.baseId = '' }
  if (row.kind === 'settlementMethods') row.values.credit = row.values.type === '赊销'
  if (row.kind === 'outletCategories' && row.values.parentId) {
    const parent = state.rows.find(r => r.id === row.values.parentId && r.kind === row.kind)
    if (parent) row.values.channelId = parent.values.channelId
  }
  for (const field of def.fields) {
    const value = row.values[field.key]
    if (field.type === 'image') {
      if (value && (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > 1400000)) throw new Error('品牌标识须为不超过 1 MB 的 PNG 图片。')
      continue
    }
    if (field.required && (value === '' || value === undefined || value === null)) throw new Error(`请填写${field.label}。`)
    if (field.type === 'checkbox' && typeof value !== 'boolean') throw new Error(`${field.label}格式不正确。`)
    if (field.type === 'number' && value !== '' && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < (field.min ?? 0) || value > (field.max ?? Infinity) || (!field.step && !Number.isInteger(value)))) throw new Error(`${field.label}须为 ${field.min ?? 0}—${field.max ?? '不限'} 范围内${field.step ? '的数值' : '的整数'}。`)
    if (field.options && !field.options.includes(String(value))) throw new Error(`请选择有效的${field.label}。`)
    if (field.source && value) {
      const target = field.source === 'divisions' ? org.units.find(u => u.id === value && u.tenantId === scope!.tenantId && u.level === 2) : state.rows.find(r => r.id === value && r.kind === field.source)
      if (!target || (!target.active && (!old || old.values[field.key] !== value || row.active))) throw new Error(`${field.label}已停用或不存在，请重新选择。`)
    }
  }
  if (row.kind === 'unitArchives' && !row.values.base) {
    const base = state.rows.find(r => r.id === row.values.baseId && r.kind === row.kind)
    if (!base?.values.base || base.values.type !== row.values.type) throw new Error('请选择同类型的基本单位进行换算。')
  }
  if (old && referenceCount(state, old, old.refs + (scope ? catalogReferences(readCatalog(scope.tenantId), old).count : 0)) > 0) {
    const locked = row.kind === 'unitArchives' ? ['factor', 'base', 'baseId', 'type', 'precision'] : row.kind === 'currencies' ? ['symbol', 'precision', 'base'] : row.kind === 'brands' ? ['divisionId'] : row.kind === 'productCategories' ? ['brandId'] : row.kind === 'settlementMethods' ? ['type', 'credit'] : row.kind === 'businessReasons' ? ['scene'] : []
    if (locked.some(k => old.values[k] !== row.values[k])) throw new Error('该档案已被使用，计量、归属或业务类型等关键字段不可修改，请另建档案。')
  }
  if (row.kind === 'productCategories' || row.kind === 'outletCategories') {
    const nextRows = [...state.rows.filter(r => r.id !== row.id), row]
    const limit = 2
    for (const item of nextRows.filter(r => r.kind === row.kind)) {
      const seen = new Set([item.id]); let parentId = item.values.parentId; let depth = 1
      while (parentId) {
        if (seen.has(String(parentId))) throw new Error('分类不能以自身或下级分类为上级。')
        seen.add(String(parentId)); const parent = nextRows.find(r => r.id === parentId); parentId = parent?.values.parentId ?? ''; depth++
        if (depth > limit) throw new Error(`该操作将使分类超过 ${limit} 级，请先调整下级分类。`)
      }
    }
    if (row.kind === 'productCategories') {
      const parent = nextRows.find(r => r.id === row.values.parentId)
      if (parent && parent.values.brandId !== row.values.brandId) throw new Error('上下级商品分类必须属于同一品牌。')
      if (nextRows.some(r => r.kind === row.kind && r.values.parentId === row.id && r.values.brandId !== row.values.brandId)) throw new Error('下级分类品牌不同，请先调整下级分类。')
    }
    if (row.kind === 'outletCategories' && state.rows.some(r => r.kind === row.kind && r.values.parentId === row.id && r.values.channelId !== row.values.channelId)) throw new Error('存在子分类时不可直接变更渠道，请先调整子分类关系。')
  }
  let rates = state.rates
  if (row.kind === 'currencies') {
    if (old && (old.values.base !== row.values.base || old.values.rate !== row.values.rate || old.values.rateDate !== row.values.rateDate)) throw new Error('本位币不可切换；汇率请通过“维护汇率”新增生效记录。')
    if (!old) {
      row.values.base = false; validateRate(Number(row.values.rate), String(row.values.rateDate))
      rates = [...rates, { id: crypto.randomUUID(), currencyId: row.id, rate: Number(row.values.rate), date: String(row.values.rateDate) }]
    }
    if (row.values.base && (row.code !== 'PHP' || row.values.precision !== 2 || row.values.symbol !== '₱' || !row.active)) throw new Error('本位币 PHP 的符号、小数位和启用状态不可修改。')
  }
  return { ...state, rows: old ? state.rows.map(r => r.id === row.id ? row : r) : [...state.rows, row], rates }
}
export function toggleArchive(state: ArchiveState, id: string, org: OrgState, scope: OrgScope | null): ArchiveState {
  const row = state.rows.find(r => r.id === id)
  if (row?.kind === 'productCategories') {
    if (!canMaintainCatalog(org, scope, String(state.rows.find(r => r.id === row.values.brandId)?.values.divisionId ?? ''))) throw new Error('没有权限维护该商品分类。')
  } else assertArchiveWrite(org, scope)
  if (!row) throw new Error('档案不存在，请刷新后重试。')
  const live = scope ? catalogReferences(readCatalog(scope.tenantId), row) : { count: 0, selling: 0 }
  if (row.active) {
    if (row.kind === 'brands' && live.selling > 0) throw new Error(`该品牌仍有 ${live.selling} 个在售商品，请先在商品管理中下架。`)
    if (row.kind === 'currencies' && row.values.base) throw new Error('本位币不可停用。')
    const activeRelated = relatedArchives(state, row).filter(r => r.active)
    if (activeRelated.length) throw new Error(`仍被 ${activeRelated.length} 个启用档案引用（${activeRelated.map(r => r.name).join('、')}），请先调整或停用关联档案。`)
    if (['productCategories', 'unitArchives'].includes(row.kind) && live.selling) throw new Error('仍有在售商品引用该档案，请先下架商品。')
  } else {
    // Reuse save validation to ensure inactive parents/channels cannot be reintroduced.
    const temporarilyActive = { ...state, rows: state.rows.map(r => r.id === id ? { ...r, active: true } : r) }
    saveArchive(temporarilyActive, { ...row, active: true }, org, scope)
  }
  return { ...state, rows: state.rows.map(r => r.id === id ? { ...r, active: !r.active, updatedAt: new Date().toISOString() } : r) }
}
export function removeArchive(state: ArchiveState, id: string, org: OrgState, scope: OrgScope | null): ArchiveState {
  const row = state.rows.find(r => r.id === id)
  if (row?.kind === 'productCategories') {
    if (!canMaintainCatalog(org, scope, String(state.rows.find(r => r.id === row.values.brandId)?.values.divisionId ?? ''))) throw new Error('没有权限维护该商品分类。')
  } else assertArchiveWrite(org, scope)
  if (!row) throw new Error('档案不存在，请刷新后重试。')
  if (scope && ['outletCategories', 'channels', 'competitors', 'settlementMethods'].includes(row.kind) && customerArchiveReferences(readCustomers(scope.tenantId), row.kind, row.id, row.name) > 0) throw new Error('该档案已被客户引用，不能删除；可停用以停止用于新业务。')
  if (row.kind === 'currencies' && row.values.base) throw new Error('本位币不可删除。')
  if (scope && catalogReferences(readCatalog(scope.tenantId), row).count) throw new Error('该档案已被商品或价目表引用，不能删除。')
  if (referenceCount(state, row, row.kind === 'outletCategories' ? 0 : row.refs) > 0 || row.selling > 0) throw new Error('该档案已被引用，不能删除；可在满足条件后停用。')
  return { ...state, rows: state.rows.filter(r => r.id !== id), rates: state.rates.filter(r => r.currencyId !== id), retiredCodes: [...state.retiredCodes, `${row.kind}:${row.code}`] }
}
export function addArchiveRate(state: ArchiveState, id: string, rate: number, date: string, org: OrgState, scope: OrgScope | null): ArchiveState {
  assertArchiveWrite(org, scope)
  const row = state.rows.find(r => r.id === id && r.kind === 'currencies')
  if (!row || row.values.base || !row.active) throw new Error('仅可为启用的辅助币种维护汇率。')
  validateRate(rate, date)
  if (state.rates.some(r => r.currencyId === id && r.date === date)) throw new Error('该币种在此日期已有汇率，不可覆盖，请选择其他生效日期。')
  return { ...state, rates: [...state.rates, { id: crypto.randomUUID(), currencyId: id, rate, date }], rows: state.rows.map(r => r.id === id ? { ...r, updatedAt: new Date().toISOString() } : r) }
}

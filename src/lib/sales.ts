import { readArchives } from './basic-data.ts'
import type { ArchiveState } from './basic-data'
import { readCatalog, snapshotOrderPrice, unitMinimum4, productVisible } from './catalog.ts'
import type { CatalogState } from './catalog'
import { customerTotals, fullAddress, localDate, readCustomers } from './customers.ts'
import type { Customer, CustomerState } from './customers'
import { ancestor } from './catalog.ts'
import { getScope, readOrganization, unitEnabled } from './organization.ts'
import type { OrgScope, OrgState, OrgActor } from './organization'
import { lineTotal, lineTax, orderAmount, salesStorageKey } from './sales-types.ts'
import type { SalesState, SalesOrder, SalesLine, Shipment, Invoice, QuantityLine, SalesLog } from './sales-types'
export * from './sales-types.ts'

export type SalesContext = { org: OrgState; scope: OrgScope | null; customers: CustomerState; catalog: CatalogState; archives: ArchiveState; today: string }
export type OrderInput = Omit<SalesOrder, 'id' | 'lines' | 'status' | 'creditApproved' | 'priceApproved' | 'createdBy' | 'createdAt'> & { id: string; lines: { productId: string; unitId: string; quantity: number; price4?: number; reason?: string }[] }
const uid = () => crypto.randomUUID()
const fail = (message: string): never => { throw new Error(message) }
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
export const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const integer = (n: number, min: number, max: number, label: string) => { if (!Number.isSafeInteger(n) || n < min || n > max) fail(`${label}须为 ${min}～${max} 范围内的整数。`) }
const text = (value: string, label: string, min = 1, max = 200) => { if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(`${label}须填写 ${min}～${max} 个字。`) }
const seq = (rows: { id: string }[], prefix: string) => `${prefix}${String(1 + Math.max(0, ...rows.filter(r => r.id.startsWith(prefix)).map(r => Number(r.id.slice(prefix.length)) || 0))).padStart(4, '0')}`
function log(s: SalesState, o: SalesOrder, ctx: SalesContext, action: string, content: string, documentId = o.id) {
  s.logs.push({ id: uid(), orderId: o.id, documentId, action, content, actor: ctx.scope!.email, at: new Date().toISOString() })
}
export function visibleSales(s: SalesState, ctx: SalesContext) { return s.orders.filter(o => !!ctx.scope && ctx.org.units.some(u => u.id === o.dealerId && u.tenantId === ctx.scope!.tenantId) && ancestor(ctx.org, ctx.scope.unitId, o.dealerId)) }
function assertAccess(o: SalesOrder, ctx: SalesContext, admin = false) {
  if (!ctx.scope || !ctx.org.units.some(u => u.id === o.dealerId && u.tenantId === ctx.scope!.tenantId) || !ancestor(ctx.org, ctx.scope.unitId, o.dealerId) || !unitEnabled(ctx.org, o.dealerId) || !unitEnabled(ctx.org, ctx.scope.unitId)) fail('当前账号无权操作该经销商的单据，或所属组织已停用。')
  if (admin && !ctx.scope!.admin) fail('此操作需要管理员审核权限。')
}
const orderById = (s: SalesState, id: string) => s.orders.find(o => o.id === id) ?? fail('订单不存在。')
const actualCustomer = (o: SalesOrder, ctx: SalesContext) => ctx.customers.customers.find(c => c.id === o.customerId && c.dealerId === o.dealerId) ?? fail('客户不存在或所属经销商已变更。')
const assertCustomer = (c: Customer, ctx: SalesContext) => { if (!['活跃', '潜在'].includes(c.status) || !unitEnabled(ctx.org, c.dealerId)) fail('仅启用组织下的活跃或潜在客户可下单。') }
export function batchStock(s: SalesState, batchId: string) { const b = s.batches.find(b => b.id === batchId); return (b?.opening ?? 0) + s.movements.filter(m => m.batchId === batchId).reduce((sum, m) => sum + m.quantity, 0) }
export function shippedQuantity(s: SalesState, orderId: string, lineId: string, signedOnly = false) { return s.shipments.filter(d => d.orderId === orderId && (signedOnly ? d.status === '已签收' : ['配送中', '已签收'].includes(d.status))).reduce((sum, d) => sum + ((signedOnly ? d.accepted ?? d.lines : d.lines).find(l => l.lineId === lineId)?.quantity ?? 0), 0) }
export function returnedQuantity(s: SalesState, orderId: string, lineId: string) { return s.returns.filter(r => r.orderId === orderId && r.kind !== '拒收退回').reduce((sum, r) => sum + (r.lines.find(l => l.lineId === lineId)?.quantity ?? 0), 0) }
export function reservedStock(s: SalesState, warehouseId: string, productId: string, exceptOrder = '') {
  return s.orders.filter(o => o.status === '已审核' && o.warehouseId === warehouseId && o.id !== exceptOrder).reduce((sum, o) => sum + o.lines.filter(l => l.productId === productId).reduce((n, l) => n + (l.quantity - shippedQuantity(s, o.id, l.id)) * l.factor, 0), 0)
}
export function availableStock(s: SalesState, warehouseId: string, productId: string, today: string, exceptOrder = '') {
  return s.batches.filter(b => b.warehouseId === warehouseId && b.productId === productId && !b.blocked && b.expiry >= today).reduce((sum, b) => sum + batchStock(s, b.id), 0) - reservedStock(s, warehouseId, productId, exceptOrder)
}
export function orderLedger(s: SalesState, o: SalesOrder, today = localDate()) {
  const signed = o.lines.reduce((sum, l) => sum + lineTotal(l, shippedQuantity(s, o.id, l.id, true)), 0)
  const returned = s.returns.filter(r => r.orderId === o.id).reduce((sum, r) => sum + r.amount, 0)
  const received = s.receipts.filter(r => r.orderId === o.id && r.status === '已确认').reduce((sum, r) => sum + r.amount, 0)
  const refunded = s.refunds.filter(r => r.orderId === o.id).reduce((sum, r) => sum + r.amount, 0)
  const net = signed - returned, netReceived = received - refunded, balance = Math.max(0, net - netReceived), refundDue = Math.max(0, netReceived - net)
  const shipped = o.lines.every(l => shippedQuantity(s, o.id, l.id) === l.quantity)
  const refused = (lineId: string) => s.returns.filter(r => r.orderId === o.id && r.kind === '拒收退回').reduce((sum, r) => sum + (r.lines.find(l => l.lineId === lineId)?.quantity ?? 0), 0)
  const completed = o.lines.every(l => shippedQuantity(s, o.id, l.id, true) + refused(l.id) === l.quantity)
  const hasRefusal = o.lines.some(l => refused(l.id) > 0)
  return { ordered: orderAmount(o), signed, returned, net, received, refunded, netReceived, balance, refundDue, shipped, completed,
    delivery: completed ? hasRefusal ? signed > 0 ? '部分签收' : '整单拒收' : '已完成' : s.shipments.some(d => d.orderId === o.id && d.status === '配送中') ? '配送中' : shipped ? '待签收' : o.lines.some(l => shippedQuantity(s, o.id, l.id) > 0) ? '部分发货' : '待发货',
    payment: !signed ? '未形成应收' : refundDue ? '待退款' : !balance ? '已结清' : today > o.dueDate ? '已逾期' : netReceived > 0 ? '部分收款' : '未收款' }
}
function checkStock(s: SalesState, o: SalesOrder, ctx: SalesContext) {
  const needs = new Map<string, number>()
  o.lines.forEach(l => needs.set(l.productId, (needs.get(l.productId) ?? 0) + (l.quantity - shippedQuantity(s, o.id, l.id)) * l.factor))
  for (const [product, quantity] of needs) { const available = availableStock(s, o.warehouseId, product, ctx.today, o.id); if (quantity > available) fail(`${o.lines.find(l => l.productId === product)!.name}库存不足，缺少 ${quantity - available} 支，请调整数量或补货。`) }
}
export function creditExposure(s: SalesState, o: SalesOrder, ctx: SalesContext) {
  const ids = new Set(s.orders.map(x => x.id))
  const legacy = { ...ctx.customers, orders: ctx.customers.orders.filter(x => !ids.has(x.id)), receipts: ctx.customers.receipts.filter(x => !ids.has(x.orderId)) }
  return customerTotals(legacy, o.customerId, ctx.today).debt + s.orders.filter(x => x.customerId === o.customerId && x.id !== o.id && x.status === '已审核').reduce((sum, x) => {
    const ledger = orderLedger(s, x, ctx.today)
    return sum + ledger.balance + x.lines.reduce((n, l) => n + lineTotal(l, l.quantity - shippedQuantity(s, x.id, l.id, true)), 0)
  }, 0)
}
function validateCredit(s: SalesState, o: SalesOrder, ctx: SalesContext) {
  const c = actualCustomer(o, ctx)
  if (o.payment === '赊销' && (!c.settlements.includes('赊销') || c.creditDays <= 0 || c.creditLimit <= 0)) fail('客户未开通赊销，请维护账期和额度或选择现款结算。')
  if (o.payment === '赊销' && creditExposure(s, o, ctx) + orderAmount(o) > c.creditLimit) fail('客户欠款及未履约订单加本单金额超过信用额度，请先回款或调整订单。')
}
function validateProducts(o: SalesOrder, ctx: SalesContext) {
  for (const l of o.lines) { const p = ctx.catalog.products.find(p => p.id === l.productId); if (!p || p.status !== '在售' || !productVisible(p, ctx.archives, ctx.org, ctx.scope)) fail(`${l.name}已停售或不在可售范围。`) }
}
export function quoteLine(ctx: SalesContext, c: Customer, productId: string, unitId: string, quantity: number): SalesLine {
  integer(quantity, 1, 10000, '数量')
  const p = ctx.catalog.products.find(p => p.id === productId) ?? fail('商品不存在。')
  if (![p.salesUnitId, p.baseUnitId].includes(unitId)) fail('销售单位与商品箱规不匹配。')
  // A box quote may inherit the piece price only when there is no explicit box price.
  let snapshot
  try { snapshot = snapshotOrderPrice(ctx.catalog, productId, unitId, c, ctx.org, ctx.archives, ctx.scope, ctx.today, quantity) }
  catch (error) {
    if (unitId !== p.baseUnitId || p.baseUnitId === p.salesUnitId) throw error
    const piece = snapshotOrderPrice(ctx.catalog, productId, p.salesUnitId, c, ctx.org, ctx.archives, ctx.scope, ctx.today, quantity * p.pack)
    snapshot = { ...piece, unitId, unitName: ctx.archives.rows.find(a => a.id === unitId)?.name ?? '箱', price4: piece.price4 * p.pack, gift: piece.gift }
  }
  return { id: uid(), productId, name: p.name, unitId, unit: snapshot.unitName, factor: unitId === p.baseUnitId && p.baseUnitId !== p.salesUnitId ? p.pack : 1, quantity, price4: snapshot.price4, tax: snapshot.tax, taxIncluded: snapshot.taxIncluded, giftFor: '', snapshot }
}
export function saveSalesOrder(state: SalesState, input: OrderInput, submit: boolean, ctx: SalesContext): SalesState {
  const s = structuredClone(state), old = s.orders.find(o => o.id === input.id)
  if (old) { assertAccess(old, ctx); if (!['草稿', '已驳回'].includes(old.status)) fail('只有草稿或被驳回的订单可以编辑。') }
  const c = ctx.customers.customers.find(c => c.id === input.customerId) ?? fail('请选择客户。')
  const o: SalesOrder = { ...input, dealerId: c.dealerId, customerName: c.name, id: old?.id || seq(s.orders, `SO-${ctx.org.units.find(u => u.id === c.dealerId)?.code}-${ctx.today.replaceAll('-', '')}-`), status: '草稿', lines: [], creditApproved: false, priceApproved: false, createdBy: old?.createdBy || ctx.scope?.email || '', createdAt: old?.createdAt || new Date().toISOString() }
  assertAccess(o, ctx); assertCustomer(c, ctx)
  if (!['访销订单', '车销订单'].includes(o.mode)) fail('请选择访销订单或车销订单。')
  if (!dateValid(o.date) || o.date < addDays(ctx.today, -7) || o.date > ctx.today) fail('订单日期须为今天或前 7 天内。')
  if (!dateValid(o.deliveryDate) || o.deliveryDate < o.date) fail('配送日期不得早于订单日期。')
  if (o.mode === '车销订单' && (o.date !== ctx.today || o.deliveryDate !== ctx.today)) fail('车销须当日下单、当日交付。')
  if (!c.settlements.includes(o.payment)) fail('结算方式未在客户档案中启用。')
  o.dueDate = addDays(o.deliveryDate, o.payment === '赊销' ? c.creditDays : 0)
  text(o.recipient, '收货人', 1, 40); text(o.phone, '收货电话', 6, 30); text(o.address, '配送地址', 1, 300)
  if (!/^[+\d][\d\s()-]{5,29}$/.test(o.phone)) fail('请填写有效收货电话。')
  if (o.note.length > 200) fail('备注不能超过 200 字。')
  const a = c.addresses.find(a => a.primary)
  if ((o.recipient !== a?.recipient || o.phone !== a?.phone || o.address !== fullAddress(a))) text(o.addressReason, '收货信息修改原因', 5)
  const warehouse = s.warehouses.find(w => w.id === o.warehouseId && w.dealerId === o.dealerId)
  if (!warehouse || warehouse.type !== (o.mode === '车销订单' ? '车仓' : '经销商仓')) fail('请选择所属经销商匹配订单模式的仓库。')
  const person = ctx.org.people.find(p => p.id === o.ownerId && p.unitId === o.dealerId && p.active) ?? fail('请选择本经销商启用的业务员。')
  if (!person) fail('请选择本经销商启用的业务员。'); o.owner = person.name
  if (!input.lines.length) fail('至少添加一条商品明细。')
  if (new Set(input.lines.map(l => `${l.productId}:${l.unitId}`)).size !== input.lines.length) fail('同一商品与单位请合并数量，不能重复添加。')
  for (const row of input.lines) {
    const line = quoteLine({ ...ctx, today: o.date }, c, row.productId, row.unitId, row.quantity)
    if (line.price4 <= 0) fail('匹配价格为零，请先维护有效价目表；零价仅允许系统赠品。')
    if (row.price4 !== undefined && row.price4 !== line.price4) { integer(row.price4, 1, 1000000000000, '成交单价'); text(row.reason ?? '', '改价原因', 5); line.price4 = row.price4 }
    line.snapshot.approvalRequired = line.price4 < unitMinimum4(ctx.catalog.products.find(p => p.id === line.productId)!, line.unitId)
    o.lines.push(line)
    if (line.snapshot.gift > 0) o.lines.push({ ...line, id: uid(), quantity: line.snapshot.gift, unitId: ctx.catalog.products.find(p => p.id === line.productId)!.salesUnitId, unit: ctx.archives.rows.find(a => a.id === ctx.catalog.products.find(p => p.id === line.productId)!.salesUnitId)?.name ?? '支', factor: 1, price4: 0, giftFor: line.id })
  }
  if (new Set(o.lines.map(l => l.taxIncluded)).size !== 1) fail('同一订单不能混用含税和不含税商品。')
  if (old) s.orders[s.orders.findIndex(x => x.id === o.id)] = o; else s.orders.unshift(o)
  log(s, o, ctx, old ? '编辑订单' : '创建订单', `${o.mode}，保存价格、税率、单位和赠品快照${input.lines.some(l => l.reason) ? `；改价原因：${input.lines.filter(l => l.reason).map(l => l.reason).join('；')}` : ''}`)
  return submit ? submitSalesOrder(s, o.id, ctx) : s
}
export function submitSalesOrder(state: SalesState, id: string, ctx: SalesContext): SalesState {
  const s = structuredClone(state), o = orderById(s, id)
  assertAccess(o, ctx)
  if (!['草稿', '已驳回'].includes(o.status)) fail('当前状态不能重复提交。')
  assertCustomer(actualCustomer(o, ctx), ctx); validateProducts(o, ctx); validateCredit(s, o, ctx); checkStock(s, o, ctx)
  if (o.mode === '车销订单' && o.payment !== '赊销' && !o.onsiteReceipt) fail('车销现款订单须先确认现场收款信息，或选择已开通的赊销。')
  o.status = '待审核'; log(s, o, ctx, '提交订单', `本单金额 ${(orderAmount(o) / 100).toFixed(2)} PHP，其他欠款与未履约金额 ${(creditExposure(s, o, ctx) / 100).toFixed(2)} PHP，客户额度 ${(actualCustomer(o, ctx).creditLimit / 100).toFixed(2)} PHP；` + (o.mode === '车销订单' ? '车销正常价格自动审批，低价需管理员审核后交付' : '提交后等待管理员审核并占用库存'))
  const low = o.lines.some(l => !l.giftFor && l.price4 < unitMinimum4(ctx.catalog.products.find(p => p.id === l.productId)!, l.unitId))
  if (o.mode === '车销订单' && !low) return approveOrder(s, id, ctx, true)
  return s
}
export function approveOrder(state: SalesState, id: string, ctx: SalesContext, automatic = false): SalesState {
  const s = structuredClone(state), o = orderById(s, id)
  assertAccess(o, ctx, !automatic)
  if (automatic && o.mode !== '车销订单') fail('访销订单须人工审核。')
  if (o.status !== '待审核') fail('只有待审核订单可以审核。')
  if (o.mode === '车销订单' && o.date !== ctx.today) fail('车销订单须当日交付，请驳回后重新确认日期与现场收款。')
  assertCustomer(actualCustomer(o, ctx), ctx); validateProducts(o, ctx); validateCredit(s, o, ctx); checkStock(s, o, ctx)
  const low = o.lines.some(l => !l.giftFor && l.price4 < unitMinimum4(ctx.catalog.products.find(p => p.id === l.productId)!, l.unitId))
  if (automatic && low) fail('低于最低价的订单须管理员审核。')
  o.status = '已审核'; o.creditApproved = true; o.priceApproved = true
  log(s, o, ctx, automatic ? '自动审核通过' : '审核通过', `锁定库存；${low ? '管理员批准低价；' : ''}信用检查通过`)
  if (o.mode === '车销订单') {
    const next = createShipment(s, o.id, { date: ctx.today, driverId: o.ownerId, vehicle: '现场车销', warehouseId: o.warehouseId, note: '车销自动履约', lines: o.lines.map(l => ({ lineId: l.id, quantity: l.quantity })) }, ctx)
    const d = next.shipments.at(-1)!
    const dispatched = dispatchShipment(next, d.id, ctx)
    const signed = signShipment(dispatched, d.id, o.recipient, ctx)
    return o.onsiteReceipt ? recordReceipt(signed, o.id, { ...o.onsiteReceipt, date: ctx.today }, ctx) : signed
  }
  return s
}
export function changeOrder(state: SalesState, id: string, action: '撤回' | '驳回' | '作废', reason: string, ctx: SalesContext): SalesState {
  const s = structuredClone(state), o = orderById(s, id); assertAccess(o, ctx, action === '驳回' || (action === '作废' && o.status === '已审核'))
  if (action === '撤回') { if (o.status !== '待审核') fail('只有待审核订单可撤回。'); o.status = '草稿' }
  if (action === '驳回') { if (o.status !== '待审核') fail('只有待审核订单可驳回。'); text(reason, '驳回意见', 10); o.status = '已驳回' }
  if (action === '作废') {
    text(reason, '作废原因', 5)
    if (o.status === '已取消') fail('订单已经作废。')
    if (s.outbounds.some(b => b.orderId === o.id)) fail('订单已有出库，请通过退货冲销，不能作废。')
    o.status = '已取消'; s.shipments.filter(d => d.orderId === o.id && d.status === '草稿').forEach(d => { d.status = '已取消' })
  }
  log(s, o, ctx, `${action}订单`, reason || '审核前撤回，返回草稿；尚未占用库存'); return s
}
export type ShipmentInput = Pick<Shipment, 'date' | 'driverId' | 'vehicle' | 'warehouseId' | 'note' | 'lines'>
function validateQuantities(o: SalesOrder, lines: QuantityLine[], maximum: (id: string) => number) {
  if (!lines.length || new Set(lines.map(l => l.lineId)).size !== lines.length) fail('明细不能为空且不能重复。')
  for (const row of lines) { if (!o.lines.some(l => l.id === row.lineId)) fail('明细不属于来源订单。'); integer(row.quantity, 1, maximum(row.lineId), '本次数量') }
}
export function createShipment(state: SalesState, orderId: string, input: ShipmentInput, ctx: SalesContext, editId = ''): SalesState {
  const s = structuredClone(state), o = orderById(s, orderId); assertAccess(o, ctx)
  if (o.status !== '已审核') fail('须先审核订单才能生成发货单。')
  const old = editId ? s.shipments.find(d => d.id === editId && d.orderId === orderId) : undefined
  if (editId && (!old || old.status !== '草稿')) fail('只有未出库的草稿发货单可以编辑。')
  if (!dateValid(input.date) || input.date < o.date) fail('发货日期不得早于订单日期。')
  if (input.warehouseId !== o.warehouseId) fail('发货仓必须继承订单仓库，不能跨仓使用库存占用。')
  const driver = ctx.org.people.find(p => p.id === input.driverId && p.unitId === o.dealerId && p.active) ?? fail('请选择本经销商有效配送员。')
  if (!driver) fail('请选择本经销商有效配送员。'); text(input.vehicle, '车辆', 1, 40)
  const allocated = (lineId: string) => s.shipments.filter(d => d.orderId === orderId && d.id !== editId && d.status !== '已取消').reduce((sum, d) => sum + (d.lines.find(l => l.lineId === lineId)?.quantity ?? 0), 0)
  validateQuantities(o, input.lines, id => o.lines.find(l => l.id === id)!.quantity - allocated(id))
  const d: Shipment = { ...input, id: old?.id || seq(s.shipments, `DN-${ctx.org.units.find(u => u.id === o.dealerId)?.code}-${ctx.today.replaceAll('-', '')}-`), orderId, driver: driver.name, status: '草稿', signedBy: '', signedAt: '', result: '' }
  if (old) s.shipments[s.shipments.findIndex(x => x.id === old.id)] = d; else s.shipments.push(d)
  log(s, o, ctx, old ? '修改发货单' : '生成发货单', '继承订单价格，数量已校验；差额保留为剩余待发', d.id); return s
}
export function dispatchShipment(state: SalesState, id: string, ctx: SalesContext): SalesState {
  const s = structuredClone(state), d = s.shipments.find(d => d.id === id) ?? fail('发货单不存在。'), o = orderById(s, d.orderId)
  assertAccess(o, ctx)
  if (d.status !== '草稿' || o.status !== '已审核') fail('仅已审核订单的草稿发货单可以提交，不能重复出库。')
  if (d.date > ctx.today) fail('发货日期尚未到达，请到计划日期再提交出库。')
  checkStock(s, o, ctx)
  const outboundId = seq(s.outbounds, `OB-${d.warehouseId}-${ctx.today.replaceAll('-', '')}-`)
  const picks: SalesState['outbounds'][number]['lines'] = []
  for (const row of d.lines) {
    const line = o.lines.find(l => l.id === row.lineId) ?? fail('来源商品丢失。')
    let required = row.quantity * line.factor
    const batches = s.batches.filter(b => b.warehouseId === d.warehouseId && b.productId === line.productId && !b.blocked && b.expiry >= ctx.today).sort((a, b) => a.expiry.localeCompare(b.expiry) || a.batch.localeCompare(b.batch))
    for (const batch of batches) {
      const quantity = Math.min(required, batchStock(s, batch.id)); if (quantity <= 0) continue
      picks.push({ lineId: line.id, batchId: batch.id, quantity: quantity / line.factor, baseQuantity: quantity })
      s.movements.push({ id: uid(), batchId: batch.id, quantity: -quantity, documentId: outboundId, kind: '销售出库', at: new Date().toISOString() }); required -= quantity
      if (!required) break
    }
    if (required) fail(`${line.name}有效批次不足，尚缺 ${required} 支，未进行出库。`)
  }
  s.outbounds.push({ id: outboundId, orderId: o.id, shipmentId: d.id, warehouseId: d.warehouseId, date: ctx.today, actor: ctx.scope!.email, status: '已出库', lines: picks, note: d.note })
  d.status = '配送中'; log(s, o, ctx, '提交发货并自动出库', `生成 ${outboundId}；按先到期先出分配批次、扣减库存`, d.id); return s
}
export function cancelShipment(state: SalesState, id: string, reason: string, ctx: SalesContext) {
  const s = structuredClone(state), d = s.shipments.find(d => d.id === id) ?? fail('发货单不存在。'), o = orderById(s, d.orderId); assertAccess(o, ctx); text(reason, '作废原因', 5)
  if (d.status !== '草稿') fail('已出库的发货单不能作废，请走退货流程。')
  d.status = '已取消'; log(s, o, ctx, '作废发货单', `${reason}；数量回到剩余待发，订单库存占用保留`, id); return s
}
export type SignOptions = { result: '正常签收' | '部分签收' | '整单拒收'; accepted: QuantityLine[]; reason: string; evidence: string; disposition: '可再销售' | '报损'; returnedConfirmed: boolean }
export function signShipment(state: SalesState, id: string, signer: string, ctx: SalesContext, options?: SignOptions) {
  const s = structuredClone(state), d = s.shipments.find(d => d.id === id) ?? fail('发货单不存在。'), o = orderById(s, d.orderId); assertAccess(o, ctx); text(signer, '签收人', 1, 40)
  if (d.status !== '配送中') fail('只有已出库配送中的发货单可签收，不能重复签收。')
  const result = options?.result ?? '正常签收'
  if (!['正常签收', '部分签收', '整单拒收'].includes(result)) fail('请选择有效配送结果。')
  const accepted = result === '正常签收' ? structuredClone(d.lines) : result === '整单拒收' ? d.lines.map(l => ({ ...l, quantity: 0 })) : options!.accepted
  if (new Set(accepted.map(l => l.lineId)).size !== accepted.length || accepted.length !== d.lines.length) fail('签收明细须与发货明细逐行对应。')
  for (const l of accepted) { const source = d.lines.find(x => x.lineId === l.lineId) ?? fail('签收商品不在本次配送中。'); integer(l.quantity, 0, source.quantity, '签收数量') }
  if (result === '部分签收' && (!accepted.some(l => l.quantity > 0) || accepted.every(l => l.quantity === d.lines.find(x => x.lineId === l.lineId)!.quantity))) fail('部分签收须同时包含已收和拒收数量。')
  if (result !== '正常签收') {
    text(options!.reason, '拒收原因', 5)
    if (!options!.returnedConfirmed) fail('请先确认拒收商品已实际回仓并完成处理。')
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(options!.evidence) || options!.evidence.length > 2800000) fail('部分签收或拒收须上传 2MB 以内的现场照片。')
    if (!['可再销售', '报损'].includes(options!.disposition)) fail('请选择退回商品处理方式。')
  }
  d.status = '已签收'; d.signedBy = signer; d.signedAt = new Date().toISOString(); d.result = result; d.accepted = accepted; d.evidence = options?.evidence ?? ''; d.exceptionReason = options?.reason ?? ''
  if (!s.shipments.some(x => x.orderId === o.id && x.id !== d.id && x.status === '已签收')) o.dueDate = addDays(ctx.today, o.payment === '赊销' ? actualCustomer(o, ctx).creditDays : 0)
  if (result !== '正常签收') {
    const refused = d.lines.map(l => ({ lineId: l.lineId, quantity: l.quantity - accepted.find(x => x.lineId === l.lineId)!.quantity })).filter(l => l.quantity > 0)
    const returnId = seq(s.returns, `SR-${ctx.today.replaceAll('-', '')}-`)
    if (options!.disposition === '可再销售') restoreReturnStock(s, o, d.id, returnId, refused, ctx)
    s.returns.push({ id: returnId, orderId: o.id, shipmentId: d.id, date: ctx.today, lines: refused, amount: 0, reason: options!.reason, disposition: options!.disposition, actor: ctx.scope!.email, kind: '拒收退回' })
    log(s, o, ctx, '拒收商品退回', `${returnId}，${result}，${options!.disposition}；拒收部分未形成应收；${options!.reason}`, returnId)
  }
  log(s, o, ctx, '签收确认', `${signer}登记${result}，仅按实际签收数量形成应收；${o.mode === '车销订单' ? '车销现场交付' : 'PC登记'}`, id); return s
}
function restoreReturnStock(s: SalesState, o: SalesOrder, shipmentId: string, returnId: string, lines: QuantityLine[], ctx: SalesContext) {
  const outbound = s.outbounds.find(b => b.shipmentId === shipmentId) ?? fail('来源出库单不存在。')
  const pastReturns = new Set(s.returns.filter(r => r.shipmentId === shipmentId).map(r => r.id))
  for (const row of lines) {
    const l = o.lines.find(l => l.id === row.lineId)!, seen = new Set<string>()
    let left = row.quantity * l.factor
    for (const pick of outbound.lines.filter(p => p.lineId === l.id)) {
      const batch = s.batches.find(b => b.id === pick.batchId)!
      if (seen.has(batch.id) || batch.blocked || batch.expiry < ctx.today) continue
      seen.add(batch.id)
      const sent = outbound.lines.filter(p => p.batchId === batch.id).reduce((n, p) => n + p.baseQuantity, 0)
      const restored = s.movements.filter(m => m.batchId === batch.id && (pastReturns.has(m.documentId) || m.documentId === returnId)).reduce((n, m) => n + m.quantity, 0)
      const take = Math.min(left, sent - restored)
      if (take > 0) { s.movements.push({ id: uid(), batchId: batch.id, quantity: take, documentId: returnId, kind: '退货入库', at: new Date().toISOString() }); left -= take }
      if (!left) break
    }
    if (left) fail('原批次已过期、禁售或可回补数量不足，请选择报损处理。')
  }
}
export function recordReceipt(state: SalesState, id: string, input: { amount: number; method: string; reference: string; note: string; date: string }, ctx: SalesContext) {
  const s = structuredClone(state), o = orderById(s, id); assertAccess(o, ctx)
  const ledger = orderLedger(s, o, ctx.today); integer(input.amount, 1, ledger.balance, '收款金额（分）')
  if (!dateValid(input.date) || input.date > ctx.today || input.date < o.date) fail('收款日期不得早于订单或晚于今天。')
  if (!['现金', '银行转账', 'GCash 钱包', 'Maya', '支票'].includes(input.method)) fail('请选择有效收款方式。')
  if (input.method !== '现金') text(input.reference, '交易凭证号', 3, 80)
  if (input.amount < ledger.balance) text(input.note, '部分收款说明', 5)
  if (input.reference.trim() && s.receipts.some(r => r.status === '已确认' && r.method === input.method && r.reference === input.reference.trim())) fail('该交易凭证已登记，请勿重复收款。')
  const receipt = { ...input, reference: input.reference.trim(), id: seq(s.receipts, `RC-${ctx.today.replaceAll('-', '')}-`), orderId: id, actor: ctx.scope!.email, status: '已确认' as const }
  s.receipts.push(receipt); log(s, o, ctx, '登记收款', `${receipt.id}，${input.method}收款 ${(input.amount / 100).toFixed(2)} PHP，自动核销应收`, receipt.id); return s
}
export function voidReceipt(state: SalesState, id: string, reason: string, ctx: SalesContext) {
  const s = structuredClone(state), r = s.receipts.find(r => r.id === id) ?? fail('收款单不存在。'), o = orderById(s, r.orderId); assertAccess(o, ctx, true); text(reason, '作废原因', 5)
  if (r.status !== '已确认') fail('收款单已作废。')
  if (orderLedger(s, o).netReceived < r.amount) fail('已发生退款，作废会造成净收款为负，请先核对资金记录。')
  r.status = '已作废'; log(s, o, ctx, '作废收款', reason, r.id); return s
}
export function saveInvoice(state: SalesState, orderId: string, input: Pick<Invoice, 'title' | 'taxId' | 'address' | 'date' | 'externalNo' | 'note'>, ctx: SalesContext, id = '') {
  const s = structuredClone(state), o = orderById(s, orderId); assertAccess(o, ctx)
  const ledger = orderLedger(s, o)
  if (!ledger.completed || ledger.net <= 0) fail('订单须全部签收且净销售金额大于零才能开票。')
  if (s.invoices.some(i => i.orderId === o.id && i.status !== '已作废' && i.id !== id)) fail('该订单已有有效发票，不能重复开票。')
  const old = id ? s.invoices.find(i => i.id === id && i.orderId === orderId) : undefined
  if (id && (!old || old.status !== '草稿')) fail('只有草稿发票可编辑。')
  text(input.title, '发票抬头', 1, 150); text(input.taxId, '税号', 3, 80); text(input.address, '开票地址', 3, 300)
  if (!dateValid(input.date) || input.date < o.date || input.date > ctx.today) fail('开票日期须在订单日至今天之间。')
  const tax = o.lines.reduce((sum, l) => sum + lineTax(l, shippedQuantity(s, o.id, l.id, true) - returnedQuantity(s, o.id, l.id)), 0)
  const invoice: Invoice = { ...input, id: old?.id || seq(s.invoices, `SI-${ctx.today.replaceAll('-', '')}-`), orderId, customerId: o.customerId, status: '草稿', amount: ledger.net, tax, lines: o.lines.map(l => ({ lineId: l.id, quantity: shippedQuantity(s, o.id, l.id, true) - returnedQuantity(s, o.id, l.id) })) }
  if (old) s.invoices[s.invoices.findIndex(i => i.id === id)] = invoice; else s.invoices.push(invoice)
  log(s, o, ctx, old ? '编辑发票' : '生成发票', '根据净签收金额生成开票快照，开票不重复增加应收', invoice.id); return s
}
export function issueInvoice(state: SalesState, id: string, externalNo: string, ctx: SalesContext) {
  const s = structuredClone(state), i = s.invoices.find(i => i.id === id) ?? fail('发票不存在。'), o = orderById(s, i.orderId); assertAccess(o, ctx, true)
  if (i.status !== '草稿') fail('仅草稿发票可以确认。')
  if (i.amount !== orderLedger(s, o).net) fail('订单发生退货，发票金额已过期，请重新编辑。')
  text(externalNo, '发票凭证号', 3, 80)
  if (s.invoices.some(x => x.id !== id && x.status === '已开票' && x.externalNo === externalNo.trim())) fail('发票凭证号已存在。')
  i.status = '已开票'; i.externalNo = externalNo.trim(); log(s, o, ctx, '确认开票', `登记发票凭证 ${i.externalNo}；系统未连接税务平台`, id); return s
}
export function voidInvoice(state: SalesState, id: string, reason: string, ctx: SalesContext) {
  const s = structuredClone(state), i = s.invoices.find(i => i.id === id) ?? fail('发票不存在。'), o = orderById(s, i.orderId); assertAccess(o, ctx, true); text(reason, '作废原因', 5)
  if (i.status === '已作废') fail('发票已作废。')
  i.status = '已作废'; log(s, o, ctx, '作废发票', `${reason}；仅作废内部登记，应收及回款保持按履约事实计算`, id); return s
}
export function createReturn(state: SalesState, orderId: string, shipmentId: string, lines: QuantityLine[], reason: string, disposition: '可再销售' | '报损', ctx: SalesContext) {
  const s = structuredClone(state), o = orderById(s, orderId); assertAccess(o, ctx, true); text(reason, '退货原因', 5)
  const d = s.shipments.find(d => d.id === shipmentId && d.orderId === orderId && d.status === '已签收') ?? fail('请选择已签收的来源发货单。')
  if (!['可再销售', '报损'].includes(disposition)) fail('请选择退货处理方式。')
  if (s.invoices.some(i => i.orderId === orderId && i.status === '已开票')) fail('订单已开票，请先完成原票作废登记，再退货并重新开票。')
  const qty = (lineId: string) => ((d.accepted ?? d.lines).find(l => l.lineId === lineId)?.quantity ?? 0) - s.returns.filter(r => r.shipmentId === shipmentId && r.kind !== '拒收退回').reduce((sum, r) => sum + (r.lines.find(l => l.lineId === lineId)?.quantity ?? 0), 0)
  validateQuantities(o, lines, qty)
  const id = seq(s.returns, `SR-${ctx.today.replaceAll('-', '')}-`)
  let amount = 0
  for (const row of lines) {
    const l = o.lines.find(l => l.id === row.lineId)!, already = returnedQuantity(s, orderId, l.id), signed = shippedQuantity(s, orderId, l.id, true)
    amount += lineTotal(l, signed - already) - lineTotal(l, signed - already - row.quantity)

  }
  if (disposition === '可再销售') restoreReturnStock(s, o, shipmentId, id, lines, ctx)
  s.returns.push({ id, orderId, shipmentId, date: ctx.today, lines, amount, reason, disposition, actor: ctx.scope!.email })
  s.invoices.filter(i => i.orderId === orderId && i.status === '草稿').forEach(i => { i.status = '已作废' })
  log(s, o, ctx, '退货冲减应收', `${id}，${reason}；${disposition}；金额 ${(amount / 100).toFixed(2)} PHP，已收超额转待退款`, id); return s
}
export function refundOrder(state: SalesState, orderId: string, reference: string, ctx: SalesContext) {
  const s = structuredClone(state), o = orderById(s, orderId); assertAccess(o, ctx, true); text(reference, '退款凭证', 3, 80)
  const amount = orderLedger(s, o).refundDue
  if (!amount) fail('当前没有待退款金额。')
  if (s.refunds.some(r => r.reference === reference.trim())) fail('退款凭证已登记，不能重复退款。')
  const r = { id: seq(s.refunds, `RF-${ctx.today.replaceAll('-', '')}-`), orderId, returnId: s.returns.filter(r => r.orderId === orderId).at(-1)?.id ?? '', amount, date: ctx.today, reference: reference.trim(), actor: ctx.scope!.email }
  s.refunds.push(r); log(s, o, ctx, '登记退款', `${r.id}，已退款 ${(amount / 100).toFixed(2)} PHP，凭证 ${reference}`, r.id); return s
}

export function createSalesSeed(tenant: string, customers: CustomerState, org: OrgState, catalog: CatalogState, archives: ArchiveState, today = localDate()): SalesState {
  let s: SalesState = { version: 1, revision: 0, orders: [], shipments: [], outbounds: [], invoices: [], receipts: [], returns: [], refunds: [], batches: [], movements: [], warehouses: [], logs: [] }
  const dealers = org.units.filter(u => u.tenantId === tenant && u.level === 4)
  for (const dealer of dealers) {
    for (const type of ['经销商仓', '车仓'] as const) {
      const warehouseId = `${dealer.id}-${type === '车仓' ? 'VAN' : 'WH'}`
      s.warehouses.push({ id: warehouseId, dealerId: dealer.id, name: `${dealer.name.replace('经销商', '')}${type === '车仓' ? '配送车仓' : '冷冻仓'}`, type })
      for (const p of catalog.products) for (const [i, offset] of [45, 180, -2].entries()) s.batches.push({ id: `${warehouseId}-${p.id}-${i}`, warehouseId, productId: p.id, batch: `LOT-${today.replaceAll('-', '')}-${i + 1}`, expiry: addDays(today, offset), opening: i === 2 ? 24 : type === '车仓' ? 1500 : 15000, blocked: false })
    }
  }
  if (tenant !== 'hani') return s
  const ctx: SalesContext = { org, scope: { tenantId: tenant, unitId: 'hq', admin: true, email: '演示管理员' }, customers, catalog, archives, today }
  const valid = customers.customers.filter(c => ['活跃', '潜在'].includes(c.status) && ancestor(org, 'ice', c.dealerId))
  for (let n = 0; n < 72 && valid.length; n++) {
    const c = valid[n % valid.length], mode = n % 4 === 0 ? '车销订单' : '访销订单', p = catalog.products[n % catalog.products.length]
    if (!p || p.status !== '在售') continue
    try {
      const date = mode === '车销订单' ? today : addDays(today, -(n % 7)), a = c.addresses.find(a => a.primary)!, owner = org.people.find(p => p.id === c.ownerId)!
      const input: OrderInput = { id: '', customerId: c.id, customerName: c.name, dealerId: c.dealerId, ownerId: owner.id, owner: owner.name, routeId: c.routeId, mode, date, deliveryDate: today, dueDate: today, warehouseId: `${c.dealerId}-${mode === '车销订单' ? 'VAN' : 'WH'}`, payment: n % 3 === 1 ? '赊销' : '现金', recipient: a.recipient, phone: a.phone, address: fullAddress(a), addressReason: '', note: '预置演示数据，可继续操作完整流程。', lines: [{ productId: p.id, unitId: p.salesUnitId, quantity: 12 + n % 5 * 6 }] }
      if (mode === '车销订单' && input.payment !== '赊销') input.onsiteReceipt = { amount: Math.round(p.retail4 * input.lines[0].quantity / 100), method: '现金', reference: '', note: '车销现场已确认收到货款', date: today }
      s = saveSalesOrder(s, input, false, { ...ctx, today })
      const o = s.orders[0], stage = n % 8
      if (stage === 1 && mode !== '车销订单') { s = submitSalesOrder(s, o.id, ctx); s = changeOrder(s, o.id, '驳回', '配送地址需补充门牌号后再提交审核', ctx); continue }
      if (stage === 2) { s = changeOrder(s, o.id, '作废', '客户调整采购计划，取消本次订货', ctx); continue }
      if (stage === 3) { s = submitSalesOrder(s, o.id, ctx); continue }
      if (stage === 0 && n % 16 === 0) continue
      s = submitSalesOrder(s, o.id, ctx)
      if (mode !== '车销订单') {
        s = approveOrder(s, o.id, ctx)
        if (stage === 4) continue
        s = createShipment(s, o.id, { date: today, driverId: owner.id, vehicle: '冷链配送车 01', warehouseId: o.warehouseId, note: '', lines: o.lines.map(l => ({ lineId: l.id, quantity: stage === 7 && n % 16 === 7 ? Math.floor(l.quantity / 2) : l.quantity })) }, ctx)
        const shipment = s.shipments.at(-1)!
        if (stage === 5) continue
        s = dispatchShipment(s, shipment.id, ctx)
        if (stage === 6) continue
        s = signShipment(s, shipment.id, a.recipient, ctx)
      }
      if (n % 3 !== 1 && mode !== '车销订单') {
        const amount = orderLedger(s, orderById(s, o.id)).balance
        s = recordReceipt(s, o.id, { amount: n % 3 === 0 ? amount : Math.floor(amount / 2), method: '现金', reference: '', note: '演示客户分次回款，余款下次结清', date: today }, ctx)
      }
      if (n % 4 === 0) {
        s = saveInvoice(s, o.id, { title: c.name, taxId: c.taxInfo || 'DEMO-TIN', address: fullAddress(a), date: today, externalNo: '', note: '演示开票登记' }, ctx)
        if (n % 8 === 0) s = issueInvoice(s, s.invoices.at(-1)!.id, `DEMO-INV-${n + 1}`, ctx)
      }
    } catch { /* A customized catalog may make a seed row inapplicable; never alter master data. */ }
  }
  // Include a completed return and refund so the exception flow is reviewable.
  const candidate = s.orders.find(o => orderLedger(s, o).completed && orderLedger(s, o).received === orderAmount(o) && !s.invoices.some(i => i.orderId === o.id && i.status === '已开票'))
  if (candidate) { try { s = createReturn(s, candidate.id, s.shipments.find(d => d.orderId === candidate.id)!.id, [{ lineId: candidate.lines[0].id, quantity: 2 }], '门店库存调整，退回未拆封商品', '可再销售', ctx); s = refundOrder(s, candidate.id, 'DEMO-REFUND-001', ctx) } catch { /* The seed remains usable if master data was customized. */ } }
  return s
}
export function salesContext(actor: OrgActor, tenant: string): SalesContext {
  const org = readOrganization()
  return { org, scope: getScope(org, actor, tenant), customers: readCustomers(tenant), catalog: readCatalog(tenant), archives: readArchives(tenant), today: localDate() }
}
function validateSalesAggregate(s: SalesState) {
  const qtyValid = (rows: QuantityLine[], o: SalesOrder, allowZero = false) => rows.length > 0 && new Set(rows.map(l => l.lineId)).size === rows.length && rows.every(l => o.lines.some(x => x.id === l.lineId) && Number.isSafeInteger(l.quantity) && l.quantity >= (allowZero ? 0 : 1))
  const cents = (v: number) => Number.isSafeInteger(v) && v >= 0
  for (const o of s.orders) {
    if (!o.id || !o.customerId || !o.dealerId || !o.customerName || !['访销订单', '车销订单'].includes(o.mode) || !dateValid(o.date) || !dateValid(o.deliveryDate) || !dateValid(o.dueDate) || !s.warehouses.some(w => w.id === o.warehouseId && w.dealerId === o.dealerId) || !o.lines.length || new Set(o.lines.map(l => l.id)).size !== o.lines.length) fail('订单结构异常')
    for (const l of o.lines) if (!l.id || !l.productId || !l.name || !l.unit || !Number.isSafeInteger(l.factor) || l.factor < 1 || !cents(l.price4) || !Number.isFinite(l.tax) || l.tax < 0 || l.tax > 100 || typeof l.taxIncluded !== 'boolean' || !l.snapshot || !cents(l.snapshot.price4) || l.giftFor && (!o.lines.some(x => x.id === l.giftFor && !x.giftFor) || l.price4 !== 0)) fail('商品快照异常')
    for (const l of o.lines) if (shippedQuantity(s, o.id, l.id) > l.quantity || returnedQuantity(s, o.id, l.id) > shippedQuantity(s, o.id, l.id, true)) fail('履约数量异常')
    const ledger = orderLedger(s, o)
    if (ledger.net < 0 || ledger.netReceived < 0) fail('资金台账异常')
  }
  for (const d of s.shipments) {
    const o = orderById(s, d.orderId)
    if (!['草稿', '配送中', '已签收', '已取消'].includes(d.status) || d.warehouseId !== o.warehouseId || !dateValid(d.date) || !qtyValid(d.lines, o) || d.accepted && (!qtyValid(d.accepted, o, true) || d.accepted.length !== d.lines.length || d.accepted.some(l => l.quantity > (d.lines.find(x => x.lineId === l.lineId)?.quantity ?? -1)))) fail('发货数量异常')
    if (['配送中', '已签收'].includes(d.status) && s.outbounds.filter(b => b.shipmentId === d.id).length !== 1) fail('发货与出库关联异常')
  }
  for (const b of s.outbounds) {
    const o = orderById(s, b.orderId)
    if (b.status !== '已出库' || !s.shipments.some(d => d.id === b.shipmentId && d.orderId === o.id) || b.warehouseId !== o.warehouseId || !b.lines.length || !dateValid(b.date)) fail('出库关联异常')
    for (const l of b.lines) if (!o.lines.some(x => x.id === l.lineId) || !s.batches.some(x => x.id === l.batchId && x.warehouseId === b.warehouseId && x.productId === o.lines.find(r => r.id === l.lineId)!.productId) || !Number.isSafeInteger(l.baseQuantity) || l.baseQuantity <= 0) fail('出库批次异常')
    const moved = s.movements.filter(m => m.documentId === b.id && m.kind === '销售出库')
    if (moved.reduce((sum, m) => sum - m.quantity, 0) !== b.lines.reduce((sum, l) => sum + l.baseQuantity, 0)) fail('出库与库存流水不一致')
  }
  for (const b of s.batches) if (!s.warehouses.some(w => w.id === b.warehouseId) || !cents(b.opening) || !dateValid(b.expiry) || typeof b.blocked !== 'boolean') fail('库存批次异常')
  for (const r of s.receipts) if (!s.orders.some(o => o.id === r.orderId) || !cents(r.amount) || r.amount <= 0 || !dateValid(r.date) || !['已确认', '已作废'].includes(r.status)) fail('收款异常')
  for (const r of s.returns) { const o = orderById(s, r.orderId); if (!s.shipments.some(d => d.id === r.shipmentId && d.orderId === r.orderId && d.status === '已签收') || !qtyValid(r.lines, o) || !cents(r.amount) || !['可再销售', '报损'].includes(r.disposition)) fail('退货异常') }
  for (const r of s.refunds) if (!s.returns.some(x => x.id === r.returnId && x.orderId === r.orderId) || !cents(r.amount) || r.amount <= 0 || !dateValid(r.date)) fail('退款关联异常')
  for (const i of s.invoices) { const o = orderById(s, i.orderId); if (!['草稿', '已开票', '已作废'].includes(i.status) || !cents(i.amount) || !cents(i.tax) || i.tax > i.amount || !dateValid(i.date) || !qtyValid(i.lines, o, true) || i.customerId !== o.customerId) fail('发票快照异常') }
  for (const m of s.movements) if (m.kind === '销售出库' ? m.quantity >= 0 || !s.outbounds.some(b => b.id === m.documentId) : m.kind !== '退货入库' || m.quantity <= 0 || !s.returns.some(r => r.id === m.documentId)) fail('库存流水关联异常')
}
export function readSales(tenant: string): SalesState {
  const raw = localStorage.getItem(salesStorageKey(tenant))
  if (raw) {
    try {
      const s = JSON.parse(raw) as SalesState
      if (s.version !== 1 || !Number.isSafeInteger(s.revision) || s.revision < 0 || !['orders', 'shipments', 'outbounds', 'invoices', 'receipts', 'returns', 'refunds', 'batches', 'movements', 'warehouses', 'logs'].every(k => Array.isArray(s[k as keyof SalesState]))) fail('结构不完整')
      for (const rows of [s.orders, s.shipments, s.outbounds, s.invoices, s.receipts, s.returns, s.refunds, s.batches, s.movements, s.warehouses, s.logs]) if (new Set(rows.map(r => r.id)).size !== rows.length) fail('单号重复')
      if (s.orders.some(o => !Array.isArray(o.lines) || !['草稿', '待审核', '已驳回', '已审核', '已取消'].includes(o.status) || o.lines.some(l => !Number.isSafeInteger(l.quantity) || l.quantity <= 0 || !Number.isSafeInteger(l.price4) || l.price4 < 0)) || s.movements.some(m => !s.batches.some(b => b.id === m.batchId) || !Number.isSafeInteger(m.quantity)) || s.batches.some(b => batchStock(s, b.id) < 0)) fail('数据校验失败')
      validateSalesAggregate(s)
      return s
    } catch { fail('销售数据读取失败，原数据已保留，请联系管理员检查。') }
  }
  const s = createSalesSeed(tenant, readCustomers(tenant), readOrganization(), readCatalog(tenant), readArchives(tenant))
  // Persist the generated aggregate once, so customer projections and every module share stable IDs.
  localStorage.setItem(salesStorageKey(tenant), JSON.stringify(s)); return s
}
export function commitSales(tenant: string, actor: OrgActor, revision: number, operation: (s: SalesState, ctx: SalesContext) => SalesState) {
  const latest = readSales(tenant)
  if (latest.revision !== revision) fail('销售数据已在其他页面更新，请重新读取后再操作。当前输入已保留。')
  const next = operation(latest, salesContext(actor, tenant)); next.revision = latest.revision + 1
  try { localStorage.setItem(salesStorageKey(tenant), JSON.stringify(next)) } catch { fail('保存失败，浏览器存储空间不足，当前输入已保留。') }
  window.dispatchEvent(new Event('tradevia-sales-change')); window.dispatchEvent(new Event('tradevia-customers-change')); return next
}
export const orderHistory = (s: SalesState, orderId: string): SalesLog[] => s.logs.filter(l => l.orderId === orderId).slice().reverse()

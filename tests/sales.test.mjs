import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createArchiveSeed } from '../src/lib/basic-data.ts'
import { createCatalogSeed, catalogStorageKey } from '../src/lib/catalog.ts'
import { createCustomerSeed, customerStorageKey, fullAddress, readCustomers, serializeCustomerState } from '../src/lib/customers.ts'
import { createOrganizationSeed, organizationStorageKey } from '../src/lib/organization.ts'
import { addDays, approveOrder, availableStock, batchStock, cancelShipment, changeOrder, commitSales, createReturn, createSalesSeed, createShipment, dispatchShipment, issueInvoice, lineTotal, orderAmount, orderLedger, quoteLine, readSales, recordReceipt, refundOrder, reservedStock, returnedQuantity, salesStorageKey, saveInvoice, saveSalesOrder, signShipment, submitSalesOrder, visibleSales, voidInvoice, voidReceipt } from '../src/lib/sales.ts'
let ctx, empty, input
beforeEach(() => {
  const map = new Map()
  globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }
  globalThis.window = { dispatchEvent: () => true }
  const org = createOrganizationSeed(), customers = createCustomerSeed('hani'), catalog = createCatalogSeed('hani'), archives = createArchiveSeed('hani')
  ctx = { org, customers, catalog, archives, today: '2026-11-11', scope: { tenantId: 'hani', unitId: 'hq', admin: true, email: 'hq@tradevia.demo' } }
  empty = createSalesSeed('hani', { ...customers, customers: [] }, org, catalog, archives, ctx.today)
  const c = customers.customers.find(c => c.id === 'OUT-001'), a = c.addresses[0]
  input = { id: '', customerId: c.id, customerName: c.name, dealerId: c.dealerId, ownerId: c.ownerId, owner: '唐雨', routeId: c.routeId, mode: '访销订单', date: ctx.today, deliveryDate: ctx.today, dueDate: '', warehouseId: `${c.dealerId}-WH`, payment: '现金', recipient: a.recipient, phone: a.phone, address: fullAddress(a), addressReason: '', note: '', lines: [{ productId: 'SKU-001', unitId: 'unitArchives-PCS', quantity: 24 }] }
})
const create = (patch = {}, submit = true) => saveSalesOrder(empty, { ...input, ...patch }, submit, ctx)
const approved = () => { const s = create(); return approveOrder(s, s.orders[0].id, ctx) }
const ship = (s, quantity = 24) => createShipment(s, s.orders[0].id, { date: ctx.today, driverId: 's-dealer-mm', vehicle: '冷链配送车 01', warehouseId: input.warehouseId, note: '', lines: [{ lineId: s.orders[0].lines[0].id, quantity }] }, ctx)
const delivered = () => { let s = ship(approved()); s = dispatchShipment(s, s.shipments.at(-1).id, ctx); return signShipment(s, s.shipments.at(-1).id, input.recipient, ctx) }
const receive = (s, amount = orderLedger(s, s.orders[0]).balance, patch = {}) => recordReceipt(s, s.orders[0].id, { amount, method: '现金', reference: '', note: '分次支付剩余款项，下周结清', date: ctx.today, ...patch }, ctx)
const invoice = s => saveInvoice(s, s.orders[0].id, { title: input.customerName, taxId: 'TIN-123-456', address: input.address, date: ctx.today, externalNo: '', note: '' }, ctx)

test('访销订单完整闭环：审核占用→发货扣减→签收应收→分次回款→开票不重复应收', () => {
  let s = create(), o = s.orders[0], product = o.lines[0].productId
  assert.equal(o.status, '待审核'); assert.equal(orderLedger(s, o).net, 0); assert.equal(reservedStock(s, o.warehouseId, product), 0)
  const stock = availableStock(s, o.warehouseId, product, ctx.today)
  s = approveOrder(s, o.id, ctx); assert.equal(reservedStock(s, o.warehouseId, product), 24)
  s = ship(s); const d = s.shipments[0]
  s = dispatchShipment(s, d.id, ctx); assert.equal(s.outbounds.length, 1); assert.equal(reservedStock(s, o.warehouseId, product), 0); assert.equal(availableStock(s, o.warehouseId, product, ctx.today), stock - 24); assert.equal(orderLedger(s, o).net, 0)
  s = signShipment(s, d.id, input.recipient, ctx); assert.equal(orderLedger(s, o).net, 72000)
  s = receive(s, 20000); assert.equal(orderLedger(s, o, ctx.today).payment, '部分收款'); assert.equal(orderLedger(s, o).balance, 52000)
  s = receive(s); assert.equal(orderLedger(s, o).balance, 0)
  s = invoice(s); s = issueInvoice(s, s.invoices[0].id, 'INV-10001', ctx)
  assert.equal(orderLedger(s, o).net, 72000); assert.equal(orderLedger(s, o).received, 72000); assert.equal(s.invoices[0].amount, 72000); assert.equal(s.invoices[0].tax, 7714)
  assert.ok(s.logs.some(l => l.action === '登记收款'))
})
test('车销现款原子提交同时生成订单、发货、出库、签收和已确认收款', () => {
  const s = create({ mode: '车销订单', warehouseId: 'dealer-mm-VAN', onsiteReceipt: { amount: 72000, method: '现金', reference: '', note: '', date: ctx.today } })
  assert.equal(s.orders[0].status, '已审核'); assert.equal(s.shipments[0].status, '已签收'); assert.equal(s.outbounds.length, 1); assert.equal(s.receipts.length, 1); assert.equal(orderLedger(s, s.orders[0]).balance, 0)
  assert.equal(s.movements.reduce((n, m) => n + m.quantity, 0), -24)
})
test('车销现款未确认收款或超额收款时整体失败，未改动原台账', () => {
  const before = JSON.stringify(empty)
  assert.throws(() => create({ mode: '车销订单', warehouseId: 'dealer-mm-VAN' }), /现场收款/)
  assert.throws(() => create({ mode: '车销订单', warehouseId: 'dealer-mm-VAN', onsiteReceipt: { amount: 72001, method: '现金', reference: '', note: '', date: ctx.today } }), /收款金额/)
  assert.equal(JSON.stringify(empty), before)
})
test('车销赊销可交付未收款；低价车销进入人工审核，普通成员不能批准', () => {
  const s = create({ mode: '车销订单', warehouseId: 'dealer-mm-VAN', payment: '赊销' })
  assert.equal(s.shipments[0].status, '已签收'); assert.equal(orderLedger(s, s.orders[0]).balance, 72000)
  const pending = create({ mode: '车销订单', warehouseId: 'dealer-mm-VAN', payment: '赊销', lines: [{ ...input.lines[0], price4: 100000, reason: '客户活动优惠，申请低价审批' }] })
  assert.equal(pending.orders[0].status, '待审核'); assert.equal(pending.outbounds.length, 0)
  assert.throws(() => approveOrder(pending, pending.orders[0].id, { ...ctx, scope: { ...ctx.scope, admin: false } }), /管理员/)
  const approvedLow = approveOrder(pending, pending.orders[0].id, ctx)
  assert.equal(approvedLow.outbounds.length, 1); assert.equal(orderLedger(approvedLow, approvedLow.orders[0]).net, 24000)
})
test('拆分配送限制累计数量；只对签收部分计应收，剩余占用保留', () => {
  let s = ship(approved(), 10), o = s.orders[0]
  assert.throws(() => createShipment(s, o.id, { ...s.shipments[0], lines: [{ lineId: o.lines[0].id, quantity: 15 }] }, ctx), /数量/)
  s = dispatchShipment(s, s.shipments[0].id, ctx); s = signShipment(s, s.shipments[0].id, input.recipient, ctx)
  assert.equal(orderLedger(s, o).net, 30000); assert.equal(reservedStock(s, o.warehouseId, o.lines[0].productId), 14)
  s = ship(s, 14); const second = s.shipments.at(-1)
  s = dispatchShipment(s, second.id, ctx); s = signShipment(s, second.id, input.recipient, ctx)
  assert.equal(orderLedger(s, o).net, 72000); assert.equal(orderLedger(s, o).completed, true); assert.equal(s.outbounds.length, 2)
})
test('重复出库、签收与重复订单提交均被阻止', () => {
  let s = ship(approved()), id = s.shipments[0].id
  assert.throws(() => submitSalesOrder(s, s.orders[0].id, ctx), /重复提交/)
  s = dispatchShipment(s, id, ctx); const before = JSON.stringify(s)
  assert.throws(() => dispatchShipment(s, id, ctx), /重复出库/); assert.equal(JSON.stringify(s), before)
  s = signShipment(s, id, input.recipient, ctx); assert.throws(() => signShipment(s, id, input.recipient, ctx), /重复签收/)
})
test('先到期先出，过期与禁售批次不可出库；批次不足时不产生部分扣减', () => {
  const wh = input.warehouseId
  empty.batches.filter(b => b.warehouseId === wh && b.productId === 'SKU-001').forEach(b => { b.opening = b.expiry < ctx.today ? 1000 : 12 })
  let s = ship(approved()), d = s.shipments[0]
  s = dispatchShipment(s, d.id, ctx)
  assert.equal(s.outbounds[0].lines.length, 2); assert.ok(s.outbounds[0].lines.every(p => s.batches.find(b => b.id === p.batchId).expiry >= ctx.today))
  const blocked = ship(approved()); blocked.batches.filter(b => b.warehouseId === wh).forEach(b => { b.blocked = true })
  const before = JSON.stringify(blocked); assert.throws(() => dispatchShipment(blocked, blocked.shipments[0].id, ctx), /库存不足/); assert.equal(JSON.stringify(blocked), before)
})
test('箱与支取价、扣库联动，赠品零价且同样占用库存', () => {
  const list = ctx.catalog.lists[0]; list.lines.find(l => l.productId === 'SKU-001').gift = 2
  const q = quoteLine(ctx, ctx.customers.customers[0], 'SKU-001', 'unitArchives-CTN', 2)
  assert.equal(q.price4, 7200000); assert.equal(q.factor, 24)
  const s = create({ lines: [{ productId: 'SKU-001', unitId: 'unitArchives-CTN', quantity: 2 }] })
  const o = s.orders[0], a = approveOrder(s, o.id, ctx)
  assert.equal(o.lines.length, 2); assert.equal(o.lines[1].price4, 0); assert.equal(o.lines[1].quantity, 2); assert.equal(reservedStock(a, o.warehouseId, 'SKU-001'), 50); assert.equal(orderAmount(o), 144000)
})
test('信用检查包含未履约已审核订单，不能用多笔订单绕过额度', () => {
  const c = ctx.customers.customers[0]; c.creditLimit = 950000
  let s = create({ payment: '赊销' }); s = approveOrder(s, s.orders[0].id, ctx)
  assert.equal(orderAmount(s.orders[0]), 72000)
  assert.throws(() => saveSalesOrder(s, { ...input, payment: '赊销' }, true, ctx), /信用额度/)
})
test('无价目表、零价、停售、关闭客户、跨组织客户和改址无原因均拦截', () => {
  ctx.catalog.lists = []; assert.throws(() => create(), /有效.*价格/)
  ctx.catalog = createCatalogSeed('hani'); ctx.catalog.lists[0].lines[0].price4 = 0; assert.throws(() => create(), /价格为零/)
  ctx.catalog = createCatalogSeed('hani'); ctx.catalog.products[0].status = '停售'; assert.throws(() => create(), /停售/)
  ctx.catalog = createCatalogSeed('hani'); ctx.customers.customers[0].status = '关闭'; assert.throws(() => create(), /活跃或潜在/)
  ctx.customers = createCustomerSeed('hani'); assert.throws(() => saveSalesOrder(empty, input, true, { ...ctx, scope: { ...ctx.scope, unitId: 'dealer-lz' } }), /无权/)
  assert.throws(() => create({ address: '新的配送地址' }), /修改原因/)
})
test('单据日期与车销仓库边界校验', () => {
  assert.throws(() => create({ date: '2026-02-30' }), /日期/)
  assert.throws(() => create({ date: addDays(ctx.today, -8) }), /日期/)
  assert.throws(() => create({ deliveryDate: '2026-11-10' }), /配送日期/)
  assert.throws(() => create({ mode: '车销订单', warehouseId: input.warehouseId }), /仓库/)
})
test('审核前撤回/驳回可编辑；作废审核单释放库存并取消草稿发货单', () => {
  let s = create(), o = s.orders[0]
  assert.throws(() => changeOrder(s, o.id, '驳回', '太短', ctx), /10/)
  s = changeOrder(s, o.id, '撤回', '', ctx); assert.equal(s.orders[0].status, '草稿')
  s = submitSalesOrder(s, o.id, ctx); s = changeOrder(s, o.id, '驳回', '客户地址资料不够完整，请补充后重新提交', ctx); assert.equal(s.orders[0].status, '已驳回')
  s = saveSalesOrder(s, { ...input, id: o.id }, true, ctx); s = approveOrder(s, o.id, ctx); s = ship(s)
  s = changeOrder(s, o.id, '作废', '客户取消本次采购计划', ctx)
  assert.equal(reservedStock(s, o.warehouseId, o.lines[0].productId), 0); assert.equal(s.shipments[0].status, '已取消')
})
test('作废草稿配送释放待发数量；已出库只能退货', () => {
  let s = ship(approved()), d = s.shipments[0]
  s = cancelShipment(s, d.id, '配送日期调整，重新安排车辆', ctx); assert.equal(s.shipments[0].status, '已取消')
  s = ship(s); s = dispatchShipment(s, s.shipments.at(-1).id, ctx)
  assert.throws(() => cancelShipment(s, s.shipments.at(-1).id, '客户取消计划请退款', ctx), /已出库/)
  assert.throws(() => changeOrder(s, s.orders[0].id, '作废', '客户取消计划请退款', ctx), /已有出库/)
})
test('回款校验超收、零数、小数分、非有限数、交易凭证重复和部分收款说明', () => {
  let s = delivered(), o = s.orders[0]
  for (const amount of [72001, 0, -1, Infinity, NaN, 0.5]) assert.throws(() => receive(s, amount), /金额/)
  assert.throws(() => receive(s, 1000, { note: '' }), /部分收款说明/)
  assert.throws(() => receive(s, 1000, { method: 'GCash 钱包', reference: '' }), /凭证/)
  s = receive(s, 1000, { method: 'GCash 钱包', reference: 'PAY-0001' })
  assert.throws(() => receive(s, 1000, { method: 'GCash 钱包', reference: 'PAY-0001' }), /凭证已登记/)
  assert.equal(orderLedger(s, o).balance, 71000)
})
test('退货回补库存和冲减应收；已全收款超额转待退款，退款后净额对齐', () => {
  let s = receive(delivered()), o = s.orders[0], d = s.shipments[0], l = o.lines[0]
  const stock = availableStock(s, o.warehouseId, l.productId, ctx.today)
  s = createReturn(s, o.id, d.id, [{ lineId: l.id, quantity: 4 }], '门店退回未拆封商品，检验合格', '可再销售', ctx)
  assert.equal(orderLedger(s, o).net, 60000); assert.equal(orderLedger(s, o).refundDue, 12000); assert.equal(availableStock(s, o.warehouseId, l.productId, ctx.today), stock + 4)
  s = refundOrder(s, o.id, 'REFUND-001', ctx); assert.equal(orderLedger(s, o).netReceived, 60000); assert.equal(orderLedger(s, o).refundDue, 0)
  assert.throws(() => refundOrder(s, o.id, 'REFUND-002', ctx), /没有待退款/)
  assert.throws(() => voidReceipt(s, s.receipts[0].id, '收款记录有误，请重新登记', ctx), /净收款为负/)
})
test('报损退货不回补可售库存，累计退货不能超过来源签收量', () => {
  let s = delivered(), o = s.orders[0], d = s.shipments[0], l = o.lines[0]
  const before = s.movements.length
  s = createReturn(s, o.id, d.id, [{ lineId: l.id, quantity: 24 }], '冷链异常商品融化，全部报损', '报损', ctx)
  assert.equal(s.movements.length, before); assert.equal(orderLedger(s, o).net, 0); assert.equal(returnedQuantity(s, o.id, l.id), 24)
  assert.throws(() => createReturn(s, o.id, d.id, [{ lineId: l.id, quantity: 1 }], '商品融化，申请报损', '报损', ctx), /数量/)
})
test('未签收不能开票，重复开票和外部发票号重复被阻止；退货须先作废已开票登记', () => {
  assert.throws(() => invoice(approved()), /全部签收/)
  let s = invoice(delivered()), o = s.orders[0], i = s.invoices[0]
  assert.throws(() => invoice(s), /已有有效发票/)
  s = issueInvoice(s, i.id, 'INV-0001', ctx)
  assert.throws(() => createReturn(s, o.id, s.shipments[0].id, [{ lineId: o.lines[0].id, quantity: 1 }], '商品质量异常申请退货', '报损', ctx), /原票作废/)
  s = voidInvoice(s, i.id, '退货需重开发票，原票已作废', ctx)
  s = createReturn(s, o.id, s.shipments[0].id, [{ lineId: o.lines[0].id, quantity: 1 }], '商品质量异常申请退货', '报损', ctx)
  s = invoice(s); assert.equal(s.invoices.at(-1).amount, 69000); assert.equal(s.invoices[0].lines[0].quantity, 24); assert.equal(s.invoices.at(-1).lines[0].quantity, 23)
})
test('四位小数成交价分次签收与多次退货不会累积舍入差', () => {
  let s = create({ lines: [{ ...input.lines[0], price4: 300051, reason: '四位小数价格测试，审批留痕' }] }); s = approveOrder(s, s.orders[0].id, ctx)
  for (const quantity of [7, 17]) { s = ship(s, quantity); const d = s.shipments.at(-1); s = dispatchShipment(s, d.id, ctx); s = signShipment(s, d.id, input.recipient, ctx) }
  const o = s.orders[0]; assert.equal(orderLedger(s, o).net, orderAmount(o))
  for (let n = 0; n < 3; n++) s = createReturn(s, o.id, s.shipments[0].id, [{ lineId: o.lines[0].id, quantity: 1 }], '多次退货核对四舍五入精度', '报损', ctx)
  assert.equal(orderLedger(s, o).net, lineTotal(o.lines[0], 21))
})
test('客户档案实时投影销售净额、净回款；维护客户再读也不会覆盖销售流水', () => {
  let s = receive(delivered()), o = s.orders[0]
  s = createReturn(s, o.id, s.shipments[0].id, [{ lineId: o.lines[0].id, quantity: 2 }], '客户退回完好商品，请退款', '可再销售', ctx); s = refundOrder(s, o.id, 'RF-TEST-1', ctx)
  localStorage.setItem(salesStorageKey('hani'), JSON.stringify(s))
  let customers = readCustomers('hani'), co = customers.orders.find(x => x.id === o.id)
  assert.equal(co.amount, 66000); assert.equal(co.salesId, o.id); assert.equal(customers.receipts.find(r => r.orderId === o.id).amount, 66000)
  customers.customers[0].note = '修改客户备注但不修改销售业务'
  localStorage.setItem(customerStorageKey('hani'), serializeCustomerState(customers))
  customers = readCustomers('hani'); assert.equal(customers.orders.find(x => x.id === o.id).amount, 66000); assert.equal(customers.customers[0].note, '修改客户备注但不修改销售业务')
  assert.equal(readSales('hani').returns.length, 1)
})
test('租户和组织范围隔离，普通成员不能作废发票、退货或退款', () => {
  const s = delivered(), o = s.orders[0]
  assert.equal(visibleSales(s, { ...ctx, scope: { ...ctx.scope, unitId: 'dealer-lz' } }).length, 0)
  assert.equal(visibleSales(s, { ...ctx, scope: { ...ctx.scope, tenantId: 'island', unitId: 'island-hq' } }).length, 0)
  assert.throws(() => createReturn(s, o.id, s.shipments[0].id, [{ lineId: o.lines[0].id, quantity: 1 }], '门店退货操作验证权限', '报损', { ...ctx, scope: { ...ctx.scope, admin: false } }), /管理员/)
})
test('同版本重复写入拒绝，存储失败保留原数据，损坏数据不重置覆盖', () => {
  localStorage.setItem(organizationStorageKey, JSON.stringify(ctx.org)); localStorage.setItem(catalogStorageKey('hani'), JSON.stringify(ctx.catalog)); localStorage.setItem(salesStorageKey('hani'), JSON.stringify(empty))
  const actor = { email: 'hq@tradevia.demo', demo: false }
  const next = commitSales('hani', actor, 0, s => ({ ...s })); assert.equal(next.revision, 1)
  assert.throws(() => commitSales('hani', actor, 0, s => s), /其他页面更新/)
  const before = localStorage.getItem(salesStorageKey('hani')), setter = localStorage.setItem
  localStorage.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => commitSales('hani', actor, 1, s => s), /保存失败/); assert.equal(localStorage.getItem(salesStorageKey('hani')), before)
  localStorage.setItem = setter; localStorage.setItem(salesStorageKey('hani'), 'broken'); assert.throws(() => readSales('hani'), /原数据已保留/); assert.equal(localStorage.getItem(salesStorageKey('hani')), 'broken')
})
test('预置72笔覆盖草稿、审核、配送、签收、回款和开票；每笔数量金额均可核对', () => {
  const s = createSalesSeed('hani', ctx.customers, ctx.org, ctx.catalog, ctx.archives, ctx.today)
  assert.equal(s.orders.length, 72); assert.ok(s.orders.some(o => o.status === '草稿')); assert.ok(s.shipments.length > 30); assert.ok(s.invoices.length > 10); assert.equal(s.returns.length, 1); assert.equal(s.refunds.length, 1)
  for (const b of s.batches) assert.ok(batchStock(s, b.id) >= 0)
  for (const o of s.orders) { const l = orderLedger(s, o); assert.ok(l.net >= 0); assert.ok(l.balance >= 0); assert.equal(l.net - l.netReceived, l.balance - l.refundDue); for (const row of o.lines) assert.ok(returnedQuantity(s, o.id, row.id) <= row.quantity) }
  for (const b of s.outbounds) assert.equal(s.movements.filter(m => m.documentId === b.id).reduce((sum, m) => sum - m.quantity, 0), b.lines.reduce((sum, l) => sum + l.baseQuantity, 0))
})

test('部分签收：拒收实物回仓，签收净额与退货不重复冲减，发票只开已接受数量', () => {
  let s = ship(approved()), o = s.orders[0], d = s.shipments[0], l = o.lines[0]
  s = dispatchShipment(s, d.id, ctx)
  const options = { result: '部分签收', accepted: [{ lineId: l.id, quantity: 20 }], reason: '门店临时调整需求，拒收四支', evidence: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', disposition: '可再销售', returnedConfirmed: true }
  assert.throws(() => signShipment(s, d.id, input.recipient, ctx, { ...options, evidence: '' }), /现场照片/)
  assert.throws(() => signShipment(s, d.id, input.recipient, ctx, { ...options, returnedConfirmed: false }), /实际回仓/)
  s = signShipment(s, d.id, input.recipient, ctx, options)
  assert.equal(orderLedger(s, o).net, 60000); assert.equal(orderLedger(s, o).returned, 0); assert.equal(orderLedger(s, o).completed, true); assert.equal(orderLedger(s, o).delivery, '部分签收')
  assert.equal(s.returns[0].kind, '拒收退回'); assert.equal(s.returns[0].amount, 0); assert.equal(s.movements.reduce((n, m) => n + m.quantity, 0), -20)
  s = invoice(s); assert.equal(s.invoices[0].amount, 60000); assert.equal(s.invoices[0].lines[0].quantity, 20)
  s = createReturn(s, o.id, d.id, [{ lineId: l.id, quantity: 2 }], '已接受商品再次发生质量退货', '报损', ctx)
  assert.equal(orderLedger(s, o).net, 54000)
  assert.throws(() => createReturn(s, o.id, d.id, [{ lineId: l.id, quantity: 19 }], '退货累计超限校验测试', '报损', ctx), /数量/)
})
test('整单拒收不形成应收，报损不回补库存，不能生成零金额发票', () => {
  let s = ship(approved()), o = s.orders[0], d = s.shipments[0]
  s = dispatchShipment(s, d.id, ctx)
  s = signShipment(s, d.id, input.recipient, ctx, { result: '整单拒收', accepted: [], reason: '运输过程商品融化，客户整单拒收', evidence: 'data:image/jpeg;base64,aW1hZ2U=', disposition: '报损', returnedConfirmed: true })
  assert.equal(orderLedger(s, o).net, 0); assert.equal(orderLedger(s, o).delivery, '整单拒收'); assert.equal(orderLedger(s, o).completed, true)
  assert.equal(s.movements.length, 1); assert.throws(() => invoice(s), /净销售金额/)
})
test('分次配送的后续签收不得顺延首批应收到期日', () => {
  let s = create({ payment: '赊销' }); s = approveOrder(s, s.orders[0].id, ctx); s = ship(s, 10)
  s = dispatchShipment(s, s.shipments[0].id, ctx); s = signShipment(s, s.shipments[0].id, input.recipient, ctx)
  const due = s.orders[0].dueDate
  s = ship(s, 14); s = dispatchShipment(s, s.shipments.at(-1).id, ctx); s = signShipment(s, s.shipments.at(-1).id, input.recipient, { ...ctx, today: addDays(ctx.today, 2) })
  assert.equal(s.orders[0].dueDate, due)
})

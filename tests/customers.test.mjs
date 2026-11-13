import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { batchCustomerCategory, blankCustomer, categoryCustomerStats, changeCustomer, createCustomerSeed, customerArchiveReferences, customerMapUrl, customerStorageKey, customerTotals, dormancyHint, duplicateCustomers, linkCustomerSalesOrder, readCustomers, restoreCustomerSalesOrders, saveCustomer, visibleCustomers } from '../src/lib/customers.ts'
import { createArchiveSeed, removeArchive } from '../src/lib/basic-data.ts'
import { createOrganizationSeed, getScope } from '../src/lib/organization.ts'

let org, scope, archives, state
const currentScope = email => getScope(org, { email, demo: false }, 'hani')
const first = () => structuredClone(state.customers[0])
const save = (c, confirmed = false, duplicateConfirmed = false) => saveCustomer(state, c, org, scope, archives, confirmed, duplicateConfirmed)
function freshCustomer() {
  const c = { ...first(), id: crypto.randomUUID(), code: '', name: 'New independent outlet', createdAt: '', createdBy: '', updatedAt: '', visits: [], logs: [], photo: 'data:image/png;base64,iVBORw0KGgo=' }
  c.addresses = c.addresses.map(a => ({ ...a, id: crypto.randomUUID(), latitude: a.latitude + .01 }))
  c.contacts = c.contacts.map(a => ({ ...a, id: crypto.randomUUID() }))
  return c
}
beforeEach(() => {
  org = createOrganizationSeed(); scope = currentScope('hq@tradevia.demo'); archives = createArchiveSeed('hani'); state = createCustomerSeed('hani')
  const values = new Map(); globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
})
test('seed customers and their persisted ledgers are valid, independent and tenant isolated', () => {
  assert.equal(state.customers.length, 7)
  for (const c of state.customers) assert.doesNotThrow(() => save(c), c.name)
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  assert.deepEqual(readCustomers('hani'), state)
  assert.equal(readCustomers('island').customers.length, 0)
  first().contacts[0].name = 'Other'
  assert.equal(createCustomerSeed('hani').customers[0].contacts[0].name, 'Ana Reyes')
})
test('customer lists honor organization subtrees and reject all writes outside scope', () => {
  const dealerScope = currentScope('dealer@tradevia.demo'), regionScope = currentScope('region@tradevia.demo')
  assert.deepEqual(visibleCustomers(state, org, dealerScope).map(c => c.id), ['OUT-001', 'OUT-008'])
  assert.deepEqual(visibleCustomers(state, org, regionScope).map(c => c.id), ['OUT-001', 'OUT-004', 'OUT-008'])
  assert.equal(visibleCustomers(state, org, null).length, 0)
  const foreign = state.customers.find(c => c.dealerId === 'dealer-cebu')
  assert.throws(() => saveCustomer(state, foreign, org, dealerScope, archives), /没有权限/)
  assert.throws(() => changeCustomer(state, foreign.id, { kind: 'note', content: 'test' }, org, dealerScope), /没有权限/)
  assert.throws(() => saveCustomer(state, first(), org, currentScope('staff6@tradevia.demo'), archives), /没有权限/)
  assert.throws(() => saveCustomer(state, first(), org, getScope(org, { email: 'hq@tradevia.demo', demo: false }, 'island'), archives), /没有权限/)
})
test('new PC customers get immutable dealer-prefixed codes, initial status and audit logs', () => {
  const c = freshCustomer(); c.status = '关闭'
  const next = save(c), saved = next.customers.find(x => x.id === c.id)
  assert.match(saved.code, /^CU-BU-007-\d{6}$/)
  assert.equal(saved.code, 'CU-BU-007-000008')
  assert.equal(saved.status, '潜在'); assert.equal(saved.createdBy, scope.email)
  assert.equal(saved.logs[0].action, '客户建档'); assert.ok(saved.createdAt)
  assert.equal(next.orders.length, state.orders.length)
  assert.equal(state.customers.length, 7)
  assert.throws(() => saveCustomer(next, { ...saved, code: 'NEW' }, org, scope, archives), /不可更改/)
  assert.throws(() => saveCustomer(next, { ...saved, dealerId: 'dealer-lz' }, org, scope, archives), /不可更改/)
})
test('required photo, contact, address and coordinate checks cannot be skipped', () => {
  assert.throws(() => save(blankCustomer('dealer-mm', 's-dealer-mm')), /门店名称/)
  assert.throws(() => save({ ...freshCustomer(), photo: '' }), /门头照片/)
  assert.throws(() => save({ ...freshCustomer(), photo: 'data:image/svg+xml,bad' }), /照片格式/)
  const c = freshCustomer()
  for (const latitude of [NaN, Infinity, -91, 91]) assert.throws(() => save({ ...c, addresses: [{ ...c.addresses[0], latitude }] }), /经纬度/)
  assert.throws(() => save({ ...c, contacts: [{ ...c.contacts[0], phone: 'abc' }] }), /电话/)
  assert.throws(() => save({ ...c, contacts: [] }), /主要联系人/)
  assert.throws(() => save({ ...c, addresses: [] }), /默认地址/)
  assert.throws(() => save({ ...c, addresses: [{ ...c.addresses[0], barangay: '' }] }), /Barangay/)
})
test('classification, owner, credit and settlement rules validate against live master records', () => {
  const c = freshCustomer()
  for (const ownerId of ['s-dealer-lz', 'p-dealer-mm', 'unknown']) assert.throws(() => save({ ...c, ownerId }), /在职业务员/)
  assert.throws(() => save({ ...c, categoryId: 'unknown' }), /启用的门店分类/)
  const inactive = structuredClone(archives); inactive.rows.find(r => r.id === c.categoryId).active = false
  assert.throws(() => saveCustomer(state, c, org, scope, inactive), /启用的门店分类/)
  for (const creditLimit of [-1, 100000000, 1.5, NaN]) assert.throws(() => save({ ...c, creditLimit }), /信用额度/)
  for (const creditDays of [-1, 91, 1.5, NaN]) assert.throws(() => save({ ...c, creditDays }), /账期/)
  assert.throws(() => save({ ...c, settlements: [] }), /结算方式/)
  assert.throws(() => save({ ...c, settlements: ['赊销'], taxInfo: '' }), /开票信息/)
  assert.throws(() => save({ ...c, settlements: ['赊销'], creditLimit: 0 }), /信用额度/)
  assert.throws(() => save({ ...c, storeType: '连锁店', chain: '' }), /连锁名称/)
  assert.throws(() => save({ ...c, freezers: 21 }), /冰柜数量/)
})
test('critical changes require confirmation and large credit changes cannot bypass approval', () => {
  const c = first()
  assert.throws(() => save({ ...c, creditDays: 14 }), /二次确认/)
  assert.doesNotThrow(() => save({ ...c, creditDays: 14 }, true))
  assert.throws(() => save({ ...c, creditLimit: c.creditLimit * 2 }, true), /财务审批/)
  const high = structuredClone(state); high.customers[0].creditLimit = 20000000
  assert.throws(() => saveCustomer(high, { ...high.customers[0], creditLimit: 26000000 }, org, scope, archives, true), /财务审批/)
  assert.doesNotThrow(() => save({ ...c, creditLimit: c.creditLimit + 100000 }, true))
})
test('owner handovers and customer renames preserve all historical order and receipt associations', () => {
  const c = first(), next = save({ ...c, name: 'Renamed store' })
  assert.deepEqual(next.orders, state.orders); assert.deepEqual(next.receipts, state.receipts)
  const { outstanding: _before, ...before } = customerTotals(state, c.id), { outstanding: _after, ...after } = customerTotals(next, c.id)
  assert.deepEqual(after, before)
  org.people.push({ ...org.people.find(p => p.id === c.ownerId), id: 'new-sales', name: '新业务员', email: 'new-sales@tradevia.demo' })
  const transferred = save({ ...c, ownerId: 'new-sales' }, true)
  assert.equal(transferred.customers[0].ownerId, 'new-sales')
  assert.match(transferred.customers[0].logs.at(-1).content, /交接时间/)
  assert.deepEqual(transferred.orders, state.orders)
})
test('name similarity and distance jointly flag duplicates and require explicit acknowledgement', () => {
  const c = freshCustomer(); c.name = first().name; c.addresses[0].latitude = first().addresses[0].latitude
  assert.equal(duplicateCustomers(state, c).length, 1)
  assert.throws(() => save(c), /小于 50 米/)
  assert.doesNotThrow(() => save(c, false, true))
  assert.equal(duplicateCustomers(state, { ...c, dealerId: 'dealer-pasig' }).length, 0)
  c.addresses[0].latitude += .01; assert.equal(duplicateCustomers(state, c).length, 0)
  c.name = 'Entirely Different'; c.addresses[0].latitude = first().addresses[0].latitude
  assert.equal(duplicateCustomers(state, c).length, 0)
})
test('money totals exclude pending/cancelled orders and unconfirmed receipts; overdue uses due date', () => {
  const c = first(), totals = customerTotals(state, c.id, '2026-11-09')
  assert.equal(totals.sales, 1440000); assert.equal(totals.received, 576000); assert.equal(totals.debt, 864000); assert.equal(totals.overdue, 864000)
  const oldTotals = customerTotals(state, c.id, '2026-11-01'); assert.equal(oldTotals.overdue, 0)
  state.receipts.push({ ...state.receipts[0], id: 'unconfirmed', status: '待确认', amount: 500000 })
  assert.equal(customerTotals(state, c.id).debt, 864000)
  state.receipts.push({ ...state.receipts[0], id: 'void', status: '已作废', amount: 400000 })
  assert.equal(customerTotals(state, c.id).received, 576000)
  state.orders.push({ ...state.orders[0], id: 'cancelled', status: '已取消', amount: 999999 })
  assert.equal(customerTotals(state, c.id).debt, 864000)
})
test('address CRUD keeps exactly one default, rounds coordinates and audits each change', () => {
  const c = first(), other = { ...c.addresses[0], id: 'other-address', label: '仓库地址', primary: true, latitude: 14.12345678 }
  state = changeCustomer(state, c.id, { kind: 'address', value: other }, org, scope)
  let addresses = state.customers[0].addresses
  assert.equal(addresses.filter(a => a.primary).length, 1); assert.equal(addresses.find(a => a.id === other.id).latitude, 14.123457)
  assert.throws(() => changeCustomer(state, c.id, { kind: 'deleteAddress', id: other.id }, org, scope), /不能删除/)
  state = changeCustomer(state, c.id, { kind: 'deleteAddress', id: c.addresses[0].id }, org, scope)
  assert.equal(state.customers[0].addresses.length, 1); assert.equal(state.customers[0].logs.at(-1).action, '删除客户地址')
})
test('map destinations use exact saved coordinates and never invent a position for incomplete addresses', () => {
  const url = new URL(customerMapUrl(first().addresses[0]))
  assert.equal(url.origin, 'https://www.google.com')
  assert.equal(url.searchParams.get('query'), '14.646300,121.041400')
  assert.equal(new URL(customerMapUrl({ latitude: 0, longitude: 0 })).searchParams.get('query'), '0.000000,0.000000')
  for (const address of [undefined, { latitude: NaN, longitude: 121 }, { latitude: 14, longitude: NaN }, { latitude: Infinity, longitude: 121 }, { latitude: 91, longitude: 121 }, { latitude: -91, longitude: 121 }, { latitude: 14, longitude: 181 }, { latitude: 14, longitude: -181 }]) assert.equal(customerMapUrl(address), null)
})
test('contact CRUD protects primary contacts and rejects invalid email/phone', () => {
  const c = first(), other = { ...c.contacts[0], id: 'second-contact', name: '采购负责人', primary: false }
  state = changeCustomer(state, c.id, { kind: 'contact', value: other }, org, scope)
  assert.equal(state.customers[0].contacts.length, 2)
  assert.throws(() => changeCustomer(state, c.id, { kind: 'deleteContact', id: c.contacts[0].id }, org, scope), /不能删除/)
  assert.throws(() => changeCustomer(state, c.id, { kind: 'contact', value: { ...other, email: 'bad' } }, org, scope), /邮箱/)
  state = changeCustomer(state, c.id, { kind: 'contact', value: { ...other, primary: true } }, org, scope)
  assert.equal(state.customers[0].contacts.filter(x => x.primary).length, 1)
  state = changeCustomer(state, c.id, { kind: 'deleteContact', id: c.contacts[0].id }, org, scope)
  assert.equal(state.customers[0].contacts.length, 1)
})
test('follow-up publishing and PC visit entry are auditable and never forge field check-ins', () => {
  const c = first(), visit = { id: 'test-visit', date: '2026-11-01T10:30', actor: '唐雨', type: '日常拜访', result: '已完成', content: '核对陈列和库存', nextDate: '2026-11-12', source: '现场拜访' }
  state = changeCustomer(state, c.id, { kind: 'note', content: '下次配送前先联系店主' }, org, scope)
  assert.equal(state.customers[0].logs.at(-1).action, '跟进记录')
  assert.throws(() => changeCustomer(state, c.id, { kind: 'note', content: ' ' }, org, scope), /跟进内容/)
  state = changeCustomer(state, c.id, { kind: 'visit', value: visit }, org, scope)
  assert.equal(state.customers[0].visits[0].source, 'PC补录'); assert.equal(state.customers[0].visits.length, 2)
  assert.throws(() => changeCustomer(state, c.id, { kind: 'visit', value: { ...visit, date: '2099-01-01T10:30' } }, org, scope), /已发生/)
  assert.throws(() => changeCustomer(state, c.id, { kind: 'visit', value: { ...visit, nextDate: '2026-10-01' } }, org, scope), /早于/)
})
test('closing requires a reason and reactivation never bypasses the missing review workflow', () => {
  const c = first()
  assert.throws(() => changeCustomer(state, c.id, { kind: 'status', status: '关闭', reason: '' }, org, scope), /原因/)
  state = changeCustomer(state, c.id, { kind: 'status', status: '关闭', reason: '已核实门店停止经营' }, org, scope)
  assert.equal(state.customers[0].status, '关闭'); assert.equal(state.customers[0].logs.at(-1).action, '客户状态变更')
  assert.throws(() => changeCustomer(state, c.id, { kind: 'status', status: '活跃', reason: '恢复' }, org, scope), /重新采集/)
  assert.throws(() => save({ ...state.customers[0], status: '活跃' }), /客户状态操作/)
})
test('batch classification is atomic, scoped, preserves negotiated terms and logs every row', () => {
  const ids = ['OUT-001', 'OUT-004'], categoryId = 'outletCategories-CHAIN'
  const next = batchCustomerCategory(state, ids, categoryId, archives, org, scope)
  for (const id of ids) { const old = state.customers.find(c => c.id === id), saved = next.customers.find(c => c.id === id); assert.equal(saved.categoryId, categoryId); assert.equal(saved.channelId, old.channelId); assert.equal(saved.creditDays, old.creditDays); assert.equal(saved.logs.at(-1).action, '批量调整分类') }
  assert.throws(() => batchCustomerCategory(state, ids, categoryId, archives, org, currentScope('dealer@tradevia.demo')), /没有权限/)
  assert.equal(state.customers[0].categoryId, 'outletCategories-KEY-SARI')
})
test('classification statistics include descendants but never customer counts outside scope', () => {
  const full = categoryCustomerStats(state, 'outletCategories-SARI', archives, state.customers, '2026-11-09')
  assert.equal(full.count, 4); assert.equal(full.active, 4); assert.equal(full.monthlySales, 1920000)
  const own = visibleCustomers(state, org, currentScope('dealer@tradevia.demo'))
  const limited = categoryCustomerStats(state, 'outletCategories-SARI', archives, own, '2026-11-09')
  assert.equal(limited.count, 1); assert.equal(limited.monthlySales, 480000)
})
test('new master categories referenced by customers cannot be deleted even if legacy refs are zero', () => {
  const category = { ...archives.rows.find(r => r.kind === 'outletCategories'), id: 'new-category', refs: 0, values: { parentId: '', channelId: 'channels-TRAD', grade: 'B', frequency: '每周 1 次', keyOutlet: false } }
  archives.rows.push(category); state.customers[0].categoryId = category.id
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  assert.equal(customerArchiveReferences(state, 'outletCategories', category.id), 1)
  assert.throws(() => removeArchive(archives, category.id, org, scope), /客户引用/)
})
test('classification removal uses actual customer references after all customers are reassigned', () => {
  state.customers = state.customers.map(c => ({ ...c, categoryId: 'outletCategories-CHAIN' }))
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  const category = archives.rows.find(r => r.id === 'outletCategories-KEY-SARI')
  assert.ok(category.refs > 0)
  const next = removeArchive(archives, category.id, org, scope)
  assert.equal(next.rows.some(r => r.id === category.id), false)
})
test('60/180 day reminders are explicit and never silently close customer accounts', () => {
  const c = first(), noOrders = { ...state, orders: [] }
  c.createdAt = '2026-01-01T00:00:00Z'
  assert.match(dormancyHint(noOrders, c, '2026-04-01'), /60 天/)
  assert.match(dormancyHint(noOrders, c, '2026-11-09'), /180 天/)
  assert.equal(c.status, '活跃'); assert.equal(dormancyHint(noOrders, { ...c, status: '关闭' }, '2026-11-09'), '')
})
test('corrupt data fails closed and preserves exact originals rather than resetting customer records', () => {
  for (const mutate of [s => { s.customers[0].addresses[0].latitude = 'bad' }, s => { s.customers.push(s.customers[0]) }, s => { s.receipts[0].customerId = 'unknown' }, s => { s.orders[0].amount += 1 }, s => { s.customers[0].logs = null }]) {
    const changed = structuredClone(state); mutate(changed); const raw = JSON.stringify(changed)
    localStorage.setItem(customerStorageKey('hani'), raw)
    assert.throws(() => readCustomers('hani'), /读取失败/)
    assert.equal(localStorage.getItem(customerStorageKey('hani')), raw)
  }
})
test('new sales orders are linked by stable customer ID, retain the original salesperson and restore after refresh', () => {
  const order = { id: 'SO-261109-0001', outlet: 'Aling Nena Store', distributor: '马尼拉联合经销商', region: 'manila', date: '2026-11-09', amount: 720, status: 'pending', product: 'vanilla', quantity: 24, price: 30, payment: 'credit' }
  state = linkCustomerSalesOrder(state, 'OUT-001', order, org, scope)
  const linked = state.orders[0]
  assert.equal(linked.customerId, 'OUT-001'); assert.equal(linked.owner, '唐雨'); assert.equal(linked.amount, 72000); assert.equal(linked.dueDate, '2026-11-16')
  assert.equal(linked.status, '待审核'); assert.equal(customerTotals(state, 'OUT-001').debt, 864000)
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(state))
  assert.deepEqual(restoreCustomerSalesOrders(readCustomers('hani')), [order])
  assert.throws(() => linkCustomerSalesOrder(state, 'OUT-001', order, org, scope), /编号已存在/)
  state = saveCustomer(state, { ...state.customers[0], name: 'New name' }, org, scope, archives)
  assert.equal(state.orders[0].customerId, 'OUT-001'); assert.equal(state.orders[0].owner, '唐雨')
})
test('sales links cannot create documents for closed, inaccessible or nonexistent customers', () => {
  const order = { id: 'SO-261109-0001', outlet: 'test', distributor: 'test', region: 'manila', date: '2026-11-09', amount: 720, status: 'pending', product: 'vanilla', quantity: 24, price: 30, payment: 'credit' }
  assert.throws(() => linkCustomerSalesOrder(state, 'OUT-008', order, org, scope), /已关闭/)
  assert.throws(() => linkCustomerSalesOrder(state, 'OUT-002', order, org, currentScope('dealer@tradevia.demo')), /没有权限/)
  assert.throws(() => linkCustomerSalesOrder(state, 'missing', order, org, scope), /不存在/)
  assert.throws(() => linkCustomerSalesOrder(state, 'OUT-001', { ...order, amount: 1 }, org, scope), /不一致/)
})

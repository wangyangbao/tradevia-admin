import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createOrganizationSeed, getScope } from '../src/lib/organization.ts'
import { archiveStorageKey, createArchiveSeed, readArchives, removeArchive, saveArchive, toggleArchive } from '../src/lib/basic-data.ts'
import { createCustomerSeed, customerStorageKey, linkCustomerSalesOrder, readCustomers, restoreCustomerSalesOrders } from '../src/lib/customers.ts'
import { blankProduct, blankPriceList, canMaintainCatalog, catalogStorageKey, conversionRate, createCatalogSeed, deleteProduct, effective4, listVisible, matchesCustomer, needsApproval, price4, priceStatus, productVisible, readCatalog, resolvePrice, reviewPriceList, savePriceList, saveProduct, snapshotOrderPrice, validBarcode, validatePriceList } from '../src/lib/catalog.ts'
let state, archives, org, scope, customers
beforeEach(() => {
  const map = new Map(); globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }
  state = createCatalogSeed('hani'); archives = createArchiveSeed('hani'); org = createOrganizationSeed(); scope = getScope(org, { email: 'hq@tradevia.demo' }, 'hani'); customers = createCustomerSeed('hani').customers
})
const product = (patch = {}) => ({ ...blankProduct(), code: 'SKU-NEW', name: '新品香草80ml', brandId: 'brands-HANI', categoryId: 'productCategories-STICK', spec: '80ml/支，24支/箱', ...patch })
const line = (patch = {}) => ({ id: crypto.randomUUID(), productId: 'SKU-001', unitId: 'unitArchives-PCS', price4: price4(30), discount: 100, minimum: 1, gift: 0, start: '', end: '', ...patch })
const list = (patch = {}) => ({ ...blankPriceList('ice'), code: 'PL-NEW', name: '测试价目表', start: '2026-11-01', end: '2026-11-30', priority: 101, lines: [line()], ...patch })
const save = (l, submit = true) => savePriceList(state, l, archives, org, scope, customers, submit)
const quote = (s = state, date = '2026-11-10', qty = 1, c = customers[0]) => resolvePrice(s, 'SKU-001', 'unitArchives-PCS', c, org, archives, date, qty)
test('seed products and price lists satisfy PRD validation and persist independently per tenant', () => {
  for (const p of state.products) assert.doesNotThrow(() => saveProduct(state, p, archives, org, scope))
  for (const l of state.lists) assert.doesNotThrow(() => validatePriceList(state, l, archives, org, scope, customers))
  localStorage.setItem(catalogStorageKey('hani'), JSON.stringify(state))
  assert.equal(readCatalog('hani').products.length, 6); assert.equal(readCatalog('island').products.length, 0)
})
test('corrupt records never reset storage or allow partial financial data', () => {
  for (const mutate of [s => { s.products[0].name = null }, s => { s.lists[0].lines[0].price4 = 1.5 }, s => { s.lists[0].customers = null }, s => { s.products.push(s.products[0]) }, s => { s.lists[0].approvedBy = '' }]) {
    const broken = structuredClone(state); mutate(broken); const raw = JSON.stringify(broken)
    localStorage.setItem(catalogStorageKey('hani'), raw)
    assert.throws(() => readCatalog('hani'), /读取失败/); assert.equal(localStorage.getItem(catalogStorageKey('hani')), raw)
  }
})
test('only headquarters and the owning division maintain catalog; lower organizations are read-only', () => {
  for (const email of ['region@tradevia.demo', 'dealer@tradevia.demo', 'staff6@tradevia.demo']) {
    const other = getScope(org, { email }, 'hani')
    assert.equal(canMaintainCatalog(org, other), false)
    assert.throws(() => saveProduct(state, product(), archives, org, other), /仅总部/)
    assert.throws(() => savePriceList(state, list(), archives, org, other, customers, true), /仅总部/)
  }
  const division = getScope(org, { email: 'division@tradevia.demo' }, 'hani')
  assert.doesNotThrow(() => saveProduct(state, product(), archives, org, division))
  assert.equal(canMaintainCatalog(org, division, 'food'), false)
  const dealer = getScope(org, { email: 'dealer@tradevia.demo' }, 'hani')
  assert.equal(productVisible(state.products[0], archives, org, dealer), true)
  assert.equal(listVisible(list({ unitId: 'dealer-cebu' }), org, dealer), false)
})
test('classification remains the shared archive and enforces exactly two levels, brand and cycle safety', () => {
  const root = archives.rows.find(r => r.code === 'ICE'), child = archives.rows.find(r => r.code === 'STICK')
  assert.throws(() => saveArchive(archives, { ...root, values: { ...root.values, parentId: child.id } }, org, scope), /下级/)
  assert.throws(() => saveArchive(archives, { ...child, id: 'third', code: 'THIRD', name: '三级', en: '', values: { ...child.values, parentId: child.id } }, org, scope), /2 级/)
  assert.throws(() => saveArchive(archives, { ...child, values: { ...child.values, brandId: 'brands-HANI-SELECT' } }, org, scope), /已被使用|同一品牌/)
  const sc = getScope(org, { email: 'division@tradevia.demo' }, 'hani')
  assert.doesNotThrow(() => saveArchive(archives, { ...root, id: 'new', code: 'NEW', name: '新分类', en: '', refs: 0, values: { ...root.values } }, org, sc))
  const legacy = structuredClone(archives); delete legacy.rows.find(r => r.code === 'ICE').values.tax
  localStorage.setItem(archiveStorageKey('hani'), JSON.stringify(legacy)); assert.equal(readArchives('hani').rows.find(r => r.code === 'ICE').values.tax, 12)
})
test('product code is immutable and unique, brand and category are consistent', () => {
  assert.throws(() => saveProduct(state, product({ code: 'SKU-001' }), archives, org, scope), /已存在/)
  assert.throws(() => saveProduct(state, { ...state.products[0], code: 'CHANGED' }, archives, org, scope), /不可修改/)
  assert.throws(() => saveProduct(state, product({ brandId: 'brands-HANI-SELECT' }), archives, org, scope), /品牌一致/)
  assert.throws(() => saveProduct(state, product({ name: '' }), archives, org, scope), /商品名称/)
  assert.equal(saveProduct(state, product(), archives, org, scope).products.at(-1).status, '新品待上市')
})
test('EAN13 supports multiple codes but rejects checksum errors and cross-product duplicates', () => {
  assert.equal(validBarcode('6901234567892'), true); assert.equal(validBarcode('6901234567890'), false)
  state = saveProduct(state, product({ barcodes: ['6901234567892', '4006381333931'] }), archives, org, scope)
  assert.throws(() => saveProduct(state, product({ id: 'other', code: 'SKU-OTHER', barcodes: ['6901234567892'] }), archives, org, scope), /不可重复/)
  assert.throws(() => saveProduct(state, product({ id: 'other', code: 'SKU-OTHER', barcodes: ['6901234567890'] }), archives, org, scope), /有效 EAN/)
})
test('inventory attributes, fixed cold chain and batch control cannot be bypassed', () => {
  assert.equal(conversionRate(product()), 1 / 24)
  assert.throws(() => saveProduct(state, product({ pack: 0 }), archives, org, scope), /箱规/)
  assert.throws(() => saveProduct(state, product({ shelfDays: -1 }), archives, org, scope), /保质期/)
  assert.throws(() => saveProduct(state, product({ batch: false }), archives, org, scope), /固定冷冻/)
  assert.throws(() => saveProduct(state, product({ storage: '常温' }), archives, org, scope), /固定冷冻/)
  assert.throws(() => saveProduct(state, { ...state.products[0], pack: 12 }, archives, org, scope), /不能直接修改/)
})
test('unreferenced product deletion retires the code while used products can only stop selling', () => {
  const p = product(); state = saveProduct(state, p, archives, org, scope)
  state = deleteProduct(state, p.id, archives, org, scope)
  assert.throws(() => saveProduct(state, p, archives, org, scope), /归档/)
  assert.throws(() => deleteProduct(state, 'SKU-001', archives, org, scope), /引用/)
  state = saveProduct(state, { ...state.products[0], status: '停售' }, archives, org, scope)
  assert.equal(quote(), null)
})
test('new real product references block master archive deletion and ownership changes even with zero legacy counts', () => {
  const category = archives.rows.find(r => r.code === 'FAMILY'), brand = archives.rows.find(r => r.code === 'HANI-SELECT')
  const cat = { ...category, values: { ...category.values, parentId: '', brandId: brand.id } }
  archives = saveArchive(archives, cat, org, scope)
  state = saveProduct(state, product({ brandId: brand.id, categoryId: cat.id }), archives, org, scope)
  localStorage.setItem(catalogStorageKey('hani'), JSON.stringify(state))
  assert.throws(() => removeArchive(archives, cat.id, org, scope), /引用/)
  assert.throws(() => toggleArchive(archives, brand.id, org, scope), /在售商品|启用档案/)
  assert.throws(() => saveArchive(archives, { ...brand, values: { ...brand.values, divisionId: 'food' } }, org, scope), /已被使用/)
})
test('price list rejects invalid dates, missing conditional scope, tax mismatch and inactive products', () => {
  assert.throws(() => save(list({ end: '2026-10-01' })), /日期/)
  assert.throws(() => save(list({ start: '2026-02-30' })), /日期/)
  assert.throws(() => save(list({ type: '渠道价' })), /指定渠道/)
  assert.throws(() => save(list({ type: '客户专属价' })), /指定客户/)
  assert.throws(() => save(list({ taxIncluded: false })), /含税口径/)
  state.products[0].status = '停售'; assert.throws(() => save(list()), /停售/)
})
test('customer selection is restricted to the owning unit and condition groups use AND and descendant categories', () => {
  const c = list({ scope: '按条件', channels: ['channels-TRAD'], categories: ['outletCategories-SARI'], grades: ['A'] })
  assert.equal(matchesCustomer(c, customers[0], org, archives), true)
  assert.equal(matchesCustomer(c, customers[1], org, archives), false)
  assert.throws(() => save(list({ unitId: 'dealer-cebu', scope: '指定客户', customers: ['OUT-001'] })), /属于价目表业务单元/)
})
test('drafts may omit items; publishing cannot; stale hidden customer conditions are cleared', () => {
  const l = list({ lines: [], customers: ['missing'], channels: ['missing'] })
  const draft = save(l, false).lists.at(-1); assert.equal(draft.state, '草稿'); assert.deepEqual(draft.customers, []); assert.deepEqual(draft.channels, [])
  assert.throws(() => save(l), /添加一个商品/)
})
test('discount is applied after unit price and low effective prices enter review', () => {
  const l = list({ lines: [line({ price4: price4(30), discount: 75 })] })
  assert.equal(effective4(l.lines[0]), price4(22.5)); assert.equal(needsApproval(l, state, archives), true)
  state = save(l); assert.equal(state.lists.at(-1).state, '待审核'); assert.equal(quote().price4, price4(30))
  state = reviewPriceList(state, l.id, '通过', archives, org, scope, customers)
  assert.equal(quote().price4, price4(22.5)); assert.equal(quote().approvalRequired, true)
  assert.ok(state.lists.at(-1).approvedAt); assert.equal(state.lists.at(-1).approvedBy, scope.email)
})
test('promotion and exclusive lists always require review, and edits invalidate the old approval', () => {
  const l = list({ type: '促销价' }); state = save(l); assert.equal(state.lists.at(-1).state, '待审核')
  state = reviewPriceList(state, l.id, '通过', archives, org, scope, customers)
  state = savePriceList(state, state.lists.at(-1), archives, org, scope, customers, false)
  assert.equal(state.lists.at(-1).state, '草稿'); assert.equal(state.lists.at(-1).approvedBy, '')
  assert.throws(() => reviewPriceList(state, l.id, '通过', archives, org, scope, customers), /仅待审核/)
})
test('same scope and time with the same priority cannot publish, including parent and child customer categories', () => {
  assert.throws(() => save(list({ priority: 100 })), /相同优先级/)
  const a = list({ type: '客户专属价', scope: '按条件', categories: ['outletCategories-SARI'], priority: 400 })
  state = save(a)
  const b = list({ code: 'PL-OTHER', type: '客户专属价', scope: '按条件', categories: ['outletCategories-KEY-SARI'], priority: 400 })
  assert.throws(() => save(b), /相同优先级/)
})
test('price item overlap and periods validate, while genuinely different quantity tiers are accepted', () => {
  assert.throws(() => save(list({ lines: [line(), line()] })), /生效期不能重叠/)
  assert.throws(() => save(list({ lines: [line({ start: '2026-10-01' })] })), /明细生效期/)
  assert.throws(() => save(list({ lines: [line({ discount: 101 })] })), /折扣率/)
  const l = list({ lines: [line({ price4: price4(29) }), line({ minimum: 10, price4: price4(26) })] })
  state = save(l); assert.equal(quote(state, '2026-11-10', 1).price4, price4(29)); assert.equal(quote(state, '2026-11-10', 10).price4, price4(26))
})
test('customer exclusive outranks promotion, promotion outranks channel, and expiration falls back to standard', () => {
  for (const [i, type] of ['渠道价', '促销价', '客户专属价'].entries()) {
    const l = list({ code: `PL-${i}`, type, priority: 200 + i, scope: type === '渠道价' ? '按条件' : type === '客户专属价' ? '指定客户' : '全部客户', channels: type === '渠道价' ? ['channels-TRAD'] : [], customers: type === '客户专属价' ? ['OUT-001'] : [], lines: [line({ price4: price4(29 - i) })] })
    state = save(l); if (state.lists.at(-1).state === '待审核') state = reviewPriceList(state, l.id, '通过', archives, org, scope, customers)
    assert.equal(quote().list.type, type)
  }
  assert.equal(quote(state, '2026-12-01').list.type, '标准价')
  assert.equal(priceStatus(state.lists.at(-1), '2026-12-01'), '失效')
  assert.equal(priceStatus(state.lists.at(-1), '2026-10-01'), '未生效')
})
test('foreign currency prices stay separate and minimum-price checks use the matching currency rate', () => {
  const l = list({ currencyId: 'currencies-USD', lines: [line({ price4: price4(1) })] })
  assert.equal(needsApproval(l, state, archives), false)
  state = save(l)
  assert.equal(quote().list.currencyId, 'currencies-PHP')
  assert.equal(resolvePrice(state, 'SKU-001', 'unitArchives-PCS', customers[0], org, archives, '2026-11-10', 1, 'currencies-USD').price4, price4(1))
  assert.throws(() => save(list({ code: 'PL-NORATE', currencyId: 'currencies-USD', start: '2026-01-01' })), /有效汇率/)
})
test('four decimal price snapshots and free gifts survive save and reload without repricing historical orders', () => {
  const l = list({ lines: [line({ price4: price4(25.1234), gift: 2 })] }); state = save(l)
  const snapshot = snapshotOrderPrice(state, 'SKU-001', 'unitArchives-PCS', customers[0], org, archives, scope, '2026-11-10', 3)
  const order = { id: 'SO-261110-0001', outlet: customers[0].name, distributor: '马尼拉联合经销商', region: 'manila', amount: Math.round(snapshot.price4 * 3 / 100) / 100, price: snapshot.price4 / 10000, status: 'pending', date: '2026-11-10', product: 'product', quantity: 3, payment: 'cash', snapshot }
  const saved = linkCustomerSalesOrder(createCustomerSeed('hani'), customers[0].id, order, org, scope)
  localStorage.setItem(customerStorageKey('hani'), JSON.stringify(saved))
  const restored = restoreCustomerSalesOrders(readCustomers('hani'))[0]
  assert.equal(restored.price, 25.1234); assert.equal(restored.amount, 75.37)
  assert.equal(saved.orders[0].items[1].price, 0); assert.equal(saved.orders[0].items[1].giftFor, 'SKU-001')
  state.lists.at(-1).lines[0].price4 = price4(28); state.products[0].name = '改名后的商品'
  assert.equal(restored.snapshot.price4, price4(25.1234)); assert.notEqual(restored.snapshot.productName, state.products[0].name)
  state.products[0].status = '停售'
  assert.throws(() => snapshotOrderPrice(state, 'SKU-001', 'unitArchives-PCS', customers[0], org, archives, scope, '2026-11-10', 3), /停售/)
})
test('CSV import handles quoted specifications, defaults, multi-barcode and all-or-nothing errors', async () => {
  const { prepareProductImport, productImportHeaders, parseProductCsv } = await import('../src/lib/catalog-import.ts')
  const cells = ['SKU-CSV', '导入香草', '', 'HANI', 'STICK', '80ml/支, 24支/箱', 'CTN', 'PCS', '24', '365', '', '是', '18.1234', '24', '30', '6901234567892;4006381333931', '', '是', '备注"双引号"\n下一行']
  const csv = lines => '\uFEFF' + lines.map(r => r.map(v => `"${v.replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const source = csv([productImportHeaders, cells])
  const prepared = prepareProductImport(source, state, archives, org, scope)
  assert.equal(prepared.issues.length, 0); assert.equal(prepared.state.products.at(-1).cost4, price4(18.1234)); assert.equal(prepared.state.products.at(-1).tax, 12)
  assert.equal(prepared.state.products.at(-1).barcodes.length, 2); assert.equal(prepared.state.products.at(-1).status, '新品待上市')
  assert.equal(prepared.state.products.at(-1).note, '备注"双引号"\n下一行')
  const duplicate = prepareProductImport(csv([productImportHeaders, cells, cells]), state, archives, org, scope)
  assert.equal(duplicate.issues[0].row, 3); assert.equal(duplicate.state, state)
  const malformed = [...cells]; malformed[8] = '0'
  const invalid = prepareProductImport(csv([productImportHeaders, cells, malformed]), state, archives, org, scope)
  assert.ok(invalid.issues.length); assert.equal(invalid.state.products.length, 6)
  assert.throws(() => parseProductCsv('"unclosed'), /引号/)
  assert.throws(() => prepareProductImport('wrong,headers\na,b', state, archives, org, scope), /列名/)
})

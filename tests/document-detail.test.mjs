import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, DocumentContent, PreferenceProvider
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  DocumentContent = (await server.ssrLoadModule('/src/components/document-detail.tsx')).DocumentContent
  PreferenceProvider = (await server.ssrLoadModule('/src/lib/preferences.tsx')).PreferenceProvider
})
after(async () => { await server?.close() })

const order = { id: 'SO-DETAIL', customerId: 'customer-a', date: '2026-11-10', dueDate: '2026-11-17', amount: 100000, status: '已签收', payment: '赊销', owner: '测试业务员', items: [{ name: '商品 A', quantity: 10, unit: '支', price: 10000 }] }
const receipt = { id: 'RC-DETAIL', customerId: 'customer-a', orderId: order.id, date: '2026-11-10', amount: 20000, method: '现金', status: '已确认', actor: '收款员', reference: 'PAY-123', note: '门店补货回款' }
const render = (record, receipts = [], orders = [order]) => renderToStaticMarkup(createElement(PreferenceProvider, null, createElement(DocumentContent, { record, receipts, orders, customerName: '测试门店', onRecord: () => {} })))
const metric = (html, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.match(new RegExp(`<span>${escaped}</span><strong>(.*?)</strong>`))?.[1]
}

test('signed-order detail counts only confirmed receipts for the same order and customer', () => {
  const receipts = [receipt, { ...receipt, id: 'pending', status: '待确认', amount: 30000 }, { ...receipt, id: 'void', status: '已作废', amount: 40000 }, { ...receipt, id: 'other-customer', customerId: 'customer-b', amount: 90000 }, { ...receipt, id: 'other-order', orderId: 'SO-OTHER', amount: 90000 }]
  const html = render({ kind: 'order', value: order }, receipts)
  assert.equal(metric(html, '订单金额'), '₱1,000.00')
  assert.equal(metric(html, '已确认回款'), '₱200.00')
  assert.equal(metric(html, '待收余额'), '₱800.00')
  assert.match(html, /关联收款（3）/)
  assert.match(html, /账款到期日/)
  assert.doesNotMatch(html, /已开票金额|退款金额|退货金额/)
})

test('orders that have not formed receivables do not present their amount as debt', () => {
  for (const status of ['待审核', '配送中', '已取消']) {
    const html = render({ kind: 'order', value: { ...order, status } })
    assert.equal(metric(html, '待收余额'), '尚未形成应收')
  }
  assert.equal(metric(render({ kind: 'order', value: order }, [{ ...receipt, amount: 120000 }]), '待收余额'), '₱0.00')
})

test('legacy sales detail retains its actual amount without inventing collection figures', () => {
  const sale = { id: 'SO-LEGACY', outlet: '测试门店', distributor: '测试经销商', region: 'manila', amount: 720, status: 'pending', date: '2026-11-10', product: 'vanilla', quantity: 24, price: 30, payment: 'cash' }
  const html = render({ kind: 'sales', value: sale })
  assert.equal(metric(html, '订单金额'), '₱720.00')
  assert.match(html, /测试经销商/)
  assert.match(html, /订单商品（1）/)
  assert.doesNotMatch(html, /已确认回款|待收余额|关联收款（/)
})

test('order detail shows the saved price precision, tax and approval information', () => {
  const sourceOrder = { id: order.id, outlet: '测试门店', distributor: '测试经销商', region: 'manila', amount: 1000, status: 'pending', date: order.date, product: 'vanilla', quantity: 10, price: 100, payment: 'credit', snapshot: { productId: 'SKU-TEST', productCode: 'SKU-TEST', productName: '商品 A', unitId: 'PCS', unitName: '支', price4: 123456, listId: 'pl-test', listCode: 'PL-SAVED', listName: '保存时的专属价', lineId: 'line-test', currencyId: 'PHP', currencyCode: 'PHP', taxIncluded: true, tax: 12, gift: 1, approvalRequired: true, pricedAt: order.date } }
  const html = render({ kind: 'order', value: { ...order, sourceOrder } })
  for (const text of ['₱12.3456', '保存时的专属价', 'PL-SAVED', '12%', '低价订单待审核']) assert.ok(html.includes(text), text)
})

test('receipt details distinguish received amounts from confirmed amounts and link only the same customer order', () => {
  for (const status of ['已确认', '待确认', '已作废']) {
    const html = render({ kind: 'receipt', value: { ...receipt, status } })
    assert.equal(metric(html, '收款金额'), '₱200.00')
    assert.equal(metric(html, '已确认金额'), status === '已确认' ? '₱200.00' : '₱0.00')
    assert.match(html, /PAY-123/)
    assert.match(html, /门店补货回款/)
    assert.match(html, /<button[^>]*><span>SO-DETAIL/)
  }
  const html = render({ kind: 'receipt', value: receipt }, [], [{ ...order, customerId: 'customer-b' }])
  assert.doesNotMatch(html, /<button[^>]*><span>SO-DETAIL/)
})

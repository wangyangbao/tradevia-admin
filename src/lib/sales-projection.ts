import type { CustomerState } from './customers'
import type { SalesState } from './sales-types'
import { lineTotal, salesStorageKey } from './sales-types.ts'

// Read-only projection: sales is the source of truth; customer master edits never write it.
export function projectSalesCustomers(base: CustomerState, tenant: string): CustomerState {
  const raw = localStorage.getItem(salesStorageKey(tenant))
  if (!raw) return base
  const sales = JSON.parse(raw) as SalesState
  if (sales.version !== 1 || !Array.isArray(sales.orders) || !Array.isArray(sales.receipts) || !Array.isArray(sales.refunds)) throw new Error('销售台账无法读取，请联系管理员。')
  const ids = new Set(sales.orders.map(o => o.id))
  const orders = sales.orders.map(o => {
    const signed = sales.shipments.filter(s => s.orderId === o.id && s.status === '已签收')
    const shipped = sales.shipments.some(s => s.orderId === o.id && s.status === '配送中')
    const quantity = (lineId: string) => signed.reduce((sum, s) => sum + ((s.accepted ?? s.lines).find(l => l.lineId === lineId)?.quantity ?? 0), 0)
    const returned = sales.returns.filter(r => r.orderId === o.id).reduce((sum, r) => sum + r.amount, 0)
    const items = o.lines.map(l => { const qty = signed.length ? quantity(l.id) - sales.returns.filter(r => r.orderId === o.id && r.kind !== '拒收退回').reduce((sum, r) => sum + (r.lines.find(x => x.lineId === l.id)?.quantity ?? 0), 0) : l.quantity; return { name: l.name, quantity: qty, price: Math.round(l.price4 / 100), price4: l.price4, unit: l.unit, giftFor: l.giftFor, total: lineTotal(l, qty) } })
    const amount = (signed.length ? o.lines.reduce((sum, l) => sum + lineTotal(l, quantity(l.id)), 0) - returned : o.lines.reduce((sum, l) => sum + lineTotal(l), 0))
    return { id: o.id, salesId: o.id, customerId: o.customerId, date: o.date, dueDate: o.dueDate, amount, status: (o.status === '已取消' ? '已取消' : signed.length ? '已签收' : shipped ? '配送中' : '待审核') as '已取消' | '已签收' | '配送中' | '待审核', payment: o.payment, owner: o.owner, items }
  })
  const receipts = sales.orders.flatMap(o => {
    let refund = sales.refunds.filter(r => r.orderId === o.id).reduce((sum, r) => sum + r.amount, 0)
    return sales.receipts.filter(r => r.orderId === o.id).map(r => {
      const deduction = r.status === '已确认' ? Math.min(refund, r.amount) : 0; refund -= deduction
      return { ...r, customerId: o.customerId, grossAmount: r.amount, refundedAmount: deduction, amount: r.amount - deduction, note: deduction ? `${r.note}（已退款 ${moneyText(deduction)}，展示净回款）` : r.note }
    })
  })
  return { ...base, orders: [...orders, ...base.orders.filter(o => !ids.has(o.id))], receipts: [...receipts, ...base.receipts.filter(r => !ids.has(r.orderId))] }
}
const moneyText = (amount: number) => `₱${(amount / 100).toFixed(2)}`

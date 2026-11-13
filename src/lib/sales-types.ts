import type { PriceSnapshot } from './catalog'
export const salesPages = ['orders', 'shipments', 'outbounds', 'invoices'] as const
export type SalesPage = typeof salesPages[number]
export type SalesLine = { id: string; productId: string; name: string; unitId: string; unit: string; factor: number; quantity: number; price4: number; tax: number; taxIncluded: boolean; giftFor: string; snapshot: PriceSnapshot }
export type SalesOrder = { id: string; customerId: string; customerName: string; dealerId: string; ownerId: string; owner: string; routeId: string; mode: '访销订单' | '车销订单'; date: string; deliveryDate: string; dueDate: string; warehouseId: string; payment: string; recipient: string; phone: string; address: string; addressReason: string; note: string; status: '草稿' | '待审核' | '已驳回' | '已审核' | '已取消'; lines: SalesLine[]; creditApproved: boolean; priceApproved: boolean; createdBy: string; createdAt: string; onsiteReceipt?: { amount: number; method: string; reference: string; note: string; date: string } }
export type QuantityLine = { lineId: string; quantity: number }
export type Shipment = { id: string; orderId: string; date: string; driverId: string; driver: string; vehicle: string; warehouseId: string; note: string; status: '草稿' | '配送中' | '已签收' | '已取消'; lines: QuantityLine[]; signedBy: string; signedAt: string; result: string; accepted?: QuantityLine[]; evidence?: string; exceptionReason?: string }
export type StockBatch = { id: string; warehouseId: string; productId: string; batch: string; expiry: string; opening: number; blocked: boolean }
export type StockMovement = { id: string; batchId: string; quantity: number; documentId: string; kind: '销售出库' | '退货入库'; at: string }
export type Outbound = { id: string; orderId: string; shipmentId: string; warehouseId: string; date: string; actor: string; status: '已出库'; lines: { lineId: string; batchId: string; quantity: number; baseQuantity: number }[]; note: string }
export type Invoice = { id: string; orderId: string; customerId: string; date: string; title: string; taxId: string; address: string; status: '草稿' | '已开票' | '已作废'; amount: number; tax: number; externalNo: string; note: string; lines: QuantityLine[] }
export type SalesReceipt = { id: string; orderId: string; date: string; amount: number; method: string; reference: string; note: string; actor: string; status: '已确认' | '已作废' }
export type SalesReturn = { id: string; orderId: string; shipmentId: string; date: string; lines: QuantityLine[]; amount: number; reason: string; disposition: '可再销售' | '报损'; actor: string; kind?: '拒收退回' }
export type Refund = { id: string; orderId: string; returnId: string; amount: number; date: string; reference: string; actor: string }
export type SalesLog = { id: string; orderId: string; documentId: string; action: string; content: string; actor: string; at: string }
export type Warehouse = { id: string; dealerId: string; name: string; type: '经销商仓' | '车仓' }
export type SalesState = { version: 1; revision: number; orders: SalesOrder[]; shipments: Shipment[]; outbounds: Outbound[]; invoices: Invoice[]; receipts: SalesReceipt[]; returns: SalesReturn[]; refunds: Refund[]; batches: StockBatch[]; movements: StockMovement[]; warehouses: Warehouse[]; logs: SalesLog[] }
export const salesStorageKey = (tenant: string) => `tradevia-sales-v1-${tenant}`
export const lineAmount = (line: SalesLine, quantity = line.quantity) => Math.round(line.price4 * quantity / 100)
export const lineTax = (line: SalesLine, quantity = line.quantity) => line.taxIncluded ? Math.round(lineAmount(line, quantity) * line.tax / (100 + line.tax)) : Math.round(lineAmount(line, quantity) * line.tax / 100)
export const lineTotal = (line: SalesLine, quantity = line.quantity) => lineAmount(line, quantity) + (line.taxIncluded ? 0 : lineTax(line, quantity))
export const orderAmount = (order: SalesOrder) => order.lines.reduce((sum, line) => sum + lineTotal(line), 0)
export const money = (cents: number) => `₱${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

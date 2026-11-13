import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { DetailDrawer, DetailFields, DetailMetrics, DetailSection, DetailTabs } from '@/components/ui/detail-drawer'
import { usePreferences } from '@/lib/preferences'
import { customerItemAmount, customerMoney } from '@/lib/customers'
import type { CustomerOrder, CustomerReceipt } from '@/lib/customers'
import { money4 } from '@/lib/catalog'
import type { Order } from '@/lib/data'

export type DocumentRecord = { kind: 'order'; value: CustomerOrder } | { kind: 'receipt'; value: CustomerReceipt } | { kind: 'sales'; value: Order }
const statusNames = { pending: '待审核', delivering: '配送中', delivered: '已签收', cancelled: '已取消' }
function DocumentStatus({ value }: { value: string }) {
  return <span className="detail-document-status">{value}</span>
}

export function DocumentDetail({ record, customerName, orders, receipts, onRecord, onClose }: {
  record: DocumentRecord; customerName: string; orders: CustomerOrder[]; receipts: CustomerReceipt[]
  onRecord: (record: DocumentRecord) => void; onClose: () => void
}) {
  // Keep one drawer mounted when following a related document, so closing restores the original list focus.
  return <DetailDrawer open onClose={onClose} title={record.value.id} badge={record.kind === 'receipt' ? '收款单' : '销售订单'} description={customerName} footer="演示台账只读，未发起实际交易、审批或收款。">
    <DocumentContent key={`${record.kind}-${record.value.id}`} record={record} customerName={customerName} orders={orders} receipts={receipts} onRecord={onRecord} />
  </DetailDrawer>
}

export function DocumentContent({ record, customerName, orders, receipts, onRecord }: {
  record: DocumentRecord; customerName: string; orders: CustomerOrder[]; receipts: CustomerReceipt[]; onRecord: (record: DocumentRecord) => void
}) {
  const [tab, setTab] = useState('information')
  const { t, money, number } = usePreferences()
  const status = record.kind === 'sales' ? statusNames[record.value.status] : record.value.status
  if (record.kind === 'receipt') {
    const receipt = record.value, order = orders.find(o => o.id === receipt.orderId && o.customerId === receipt.customerId)
    return <>
      <DetailSection><DetailFields summary values={[[ '客户名称', customerName ], ['收款日期', receipt.date], ['收款人', receipt.actor], ['单据状态', <DocumentStatus key="status" value={status} />]]} /></DetailSection>
      <DetailMetrics items={[{ label: receipt.grossAmount === undefined ? '收款金额' : '原收款金额', value: customerMoney(receipt.grossAmount ?? receipt.amount) }, ...(receipt.refundedAmount ? [{ label: '已退款', value: customerMoney(receipt.refundedAmount) }] : []), { label: receipt.grossAmount === undefined ? '已确认金额' : '已确认净回款', value: customerMoney(receipt.status === '已确认' ? receipt.amount : 0), tone: 'blue' }]} />
      <DetailTabs value={tab} onChange={setTab} tabs={[{ id: 'information', label: '详细信息', content: <>
        <DetailSection title="收款信息"><DetailFields values={[[ '收款单号', receipt.id ], ['收款日期', receipt.date], ['结算方式', receipt.method], ['收款人', receipt.actor], ['交易凭证号', receipt.reference || '—'], ['单据状态', status]]} /></DetailSection>
        <DetailSection title="关联订单">{order ? <div className="detail-related-records"><button onClick={() => onRecord({ kind: 'order', value: order })}><span>{order.id}<small>{order.date} · {order.status}</small></span><strong>{customerMoney(order.amount)}</strong><ChevronRight size={14} /></button></div> : <p className="detail-note">{receipt.orderId || '暂无关联订单'}</p>}</DetailSection>
        <DetailSection title="备注"><p className="detail-note">{receipt.note || '暂无备注'}</p></DetailSection>
      </> }]} />
    </>
  }
  const ledger = record.kind === 'order' ? record.value : undefined
  const source = record.kind === 'sales' ? record.value : ledger?.sourceOrder
  const related = receipts.filter(r => ledger && r.orderId === ledger.id && r.customerId === ledger.customerId)
  const received = related.filter(r => r.status === '已确认').reduce((sum, r) => sum + r.amount, 0)
  const amount = ledger ? customerMoney(ledger.amount) : money(source!.amount, true)
  const items = ledger?.items ?? [{ name: source!.snapshot?.productName ?? t(source!.product), quantity: source!.quantity, unit: source!.snapshot?.unitName ?? t('pcs'), price: source!.price * 100, price4: source!.snapshot?.price4 ?? Math.round(source!.price * 10000) }]
  const priceSnapshot = source?.snapshot
  return <>
    {ledger?.salesId && <DetailSection><p className="detail-note">此订单来自销售业务台账，金额已扣除退货。<a className="sales-link" href={`#orders?document=${encodeURIComponent(ledger.salesId)}`}>查看完整履约、发票与资金记录 →</a></p></DetailSection>}
    <DetailSection><DetailFields summary values={[[ '客户名称', customerName ], ['下单日期', record.value.date], ['结算方式', ledger?.payment ?? t(source!.payment)], ['订单状态', <DocumentStatus key="status" value={status} />]]} /></DetailSection>
    <DetailMetrics items={[{ label: '订单金额', value: amount, tone: 'warm' }, ...(ledger ? [{ label: '已确认回款', value: customerMoney(received), tone: 'blue' as const }, { label: '待收余额', value: ledger.status === '已签收' ? customerMoney(Math.max(0, ledger.amount - received)) : '尚未形成应收' }] : [{ label: '商品数量', value: `${number(source!.quantity)} ${source!.snapshot?.unitName ?? t('pcs')}`, tone: 'blue' as const }])]} />
    <DetailTabs value={tab} onChange={setTab} tabs={[
      { id: 'information', label: '详细信息', content: <>
        <DetailSection title="基本信息"><DetailFields values={[[ '订单编号', record.value.id ], ['客户名称', customerName], ['下单日期', record.value.date], ['订单状态', status], ...(source ? [[ '所属经销商', source.distributor ], ['所属大区', t(source.region)]] as [string, string][] : []), ...(ledger ? [[ '原业务员', ledger.owner ]] as [string, string][] : [])]} /></DetailSection>
        <DetailSection title="结算信息"><DetailFields values={[[ '订单金额', amount ], ['结算方式', ledger?.payment ?? t(source!.payment)], ...(ledger ? [[ '账款到期日', ledger.dueDate ], ['已确认回款', customerMoney(received)], ['待收余额', ledger.status === '已签收' ? customerMoney(Math.max(0, ledger.amount - received)) : '尚未形成应收']] as [string, string][] : [])]} />{ledger && <p className="detail-note">仅已确认收款计入回款；已签收订单形成应收。</p>}</DetailSection>
        {priceSnapshot && <DetailSection title="价格来源"><DetailFields values={[[ '价目表', priceSnapshot.listName ], ['价目表编码', priceSnapshot.listCode], ['成交单价', money4(priceSnapshot.price4)], ['币种', priceSnapshot.currencyCode], ['含税口径', priceSnapshot.taxIncluded ? '含税' : '不含税'], ['税率', `${priceSnapshot.tax}%`]]} /><p className="detail-note">保存订单时已锁定价格、税率和赠品快照。{priceSnapshot.approvalRequired ? '低价订单待审核。' : ''}</p></DetailSection>}
        {!priceSnapshot && <p className="detail-note">{t('orderStatusHint')}</p>}
      </> },
      { id: 'products', label: `订单商品（${items.length}）`, content: <DetailSection title="商品明细"><div className="detail-document-scroll"><table className="detail-document-table"><thead><tr><th>商品名称</th><th>数量</th><th>销售单位</th><th>单价</th><th>小计</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td>{item.name}{item.giftFor && <small>关联主商品：{item.giftFor}</small>}</td><td>{number(item.quantity)}</td><td>{item.unit ?? '支'}</td><td>{item.price4 === undefined ? customerMoney(item.price) : money4(item.price4)}</td><td>{customerMoney(customerItemAmount(item))}</td></tr>)}</tbody></table></div><div className="detail-document-total">订单合计 <strong>{amount}</strong></div></DetailSection> },
      ...(ledger ? [{ id: 'receipts', label: `关联收款（${related.length}）`, content: <DetailSection title="关联收款单"><div className="detail-related-records">{related.map(receipt => <button key={receipt.id} onClick={() => onRecord({ kind: 'receipt', value: receipt })}><span>{receipt.id}<small>{receipt.date} · {receipt.method} · {receipt.status}</small></span><strong>{customerMoney(receipt.amount)}</strong><ChevronRight size={14} /></button>)}</div>{!related.length && <p className="detail-note">暂无关联收款记录</p>}</DetailSection> }] : [])
    ]} />
  </>
}

export function SalesOrderDetail({ order, ledger, receipts, onClose }: { order: Order; ledger?: CustomerOrder; receipts: CustomerReceipt[]; onClose: () => void }) {
  const [related, setRelated] = useState<DocumentRecord | null>(null)
  const linkedOrder = ledger ? { ...ledger, sourceOrder: order } : undefined
  return <DocumentDetail record={related ?? (linkedOrder ? { kind: 'order', value: linkedOrder } : { kind: 'sales', value: order })} customerName={order.outlet} orders={linkedOrder ? [linkedOrder] : []} receipts={receipts} onRecord={setRelated} onClose={onClose} />
}

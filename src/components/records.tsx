import { companyName } from '@/lib/brand'
import { useState } from 'react'
import { Globe2, Plus, RotateCcw, ArrowDownToLine, ArrowUpRight, Boxes, Check, ChevronRight, CreditCard, Package, Search, Store, Truck, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DetailDrawer, DetailFields, DetailMetrics, DetailSection } from '@/components/ui/detail-drawer'
import { usePreferences } from '@/lib/preferences'
import type { TextKey } from '@/lib/i18n'
import { distributorData, outlets, products, receivableData, regions } from '@/lib/data'
import type { Order } from '@/lib/data'
import { ManagementHeader, ManagementFilters, ManagementSummary } from './management-layout'
import { cn } from '@/lib/utils'

export function StatusBadge({ status }: { status: TextKey }) {
  const { t } = usePreferences()
  return <span className={cn('status-badge', `badge-${status}`)}><span />{t(status)}</span>
}
export function EmptyState({ onReset }: { onReset?: () => void }) {
  const { t } = usePreferences()
  return <div className="empty-state"><span className="empty-icon"><Search size={24} /></span><h3>{t('noResults')}</h3><p>{t('noResultsHint')}</p>{onReset && <Button variant="outline" size="sm" onClick={onReset}>{t('clearFilters')}</Button>}</div>
}
export function OrderTable({ orders, onOrder, compact = false }: { orders: Order[]; onOrder: (order: Order) => void; compact?: boolean }) {
  const { t, money } = usePreferences()
  return <Table className="data-table"><TableHeader><TableRow><TableHead>{t('orderNo')}</TableHead><TableHead>{t('outlet')}</TableHead>{!compact && <TableHead>{t('distributor')}</TableHead>}<TableHead className="text-right">{t('amount')}</TableHead><TableHead>{t('status')}</TableHead>{!compact && <TableHead>{t('date')}</TableHead>}<TableHead className="w-12"><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader><TableBody>{orders.map(o => <TableRow key={o.id} className="clickable-row" onClick={event => { event.currentTarget.querySelector('button')?.focus({ preventScroll: true }); onOrder(o) }}><TableCell><button className="order-id" onClick={e => { e.stopPropagation(); onOrder(o) }}>{o.id}</button></TableCell><TableCell><div className="cell-with-icon"><span className="outlet-icon"><Store size={14} /></span><span>{o.outlet}</span></div></TableCell>{!compact && <TableCell className="secondary-cell">{o.distributor}</TableCell>}<TableCell className="amount-cell text-right">{money(o.amount, true)}</TableCell><TableCell><StatusBadge status={o.status} /></TableCell>{!compact && <TableCell className="secondary-cell tabular-nums">{o.date}</TableCell>}<TableCell><Button variant="ghost" size="icon-sm" aria-label={`${t('detail')} ${o.id}`} onClick={e => { e.stopPropagation(); onOrder(o) }}><ArrowUpRight size={15} /></Button></TableCell></TableRow>)}</TableBody></Table>
}
export function exportCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function RecordsPage({ page, region, setRegion, orders, onOrder, onCreateOrder }: { page: 'orders' | 'outlets' | 'distributors' | 'inventory' | 'receivables'; region: string; setRegion: (region: string) => void; onCreateOrder: () => void; orders: Order[]; onOrder: (order: Order) => void }) {
  const { t, money, number } = usePreferences()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [record, setRecord] = useState<{ title: string; pairs: [string, ReactNode][]; amounts?: { amount: number; received: number } } | null>(null)
  const match = (text: string, r: string) => (region === 'all' || region === r) && text.toLowerCase().includes(query.toLowerCase())
  const filteredOrders = orders.filter(o => match(`${o.id} ${o.outlet} ${o.distributor}`, o.region) && (status === 'all' || o.status === status))
  const filteredOutlets = outlets.filter(o => match(`${o.id} ${o.name} ${o.contact} ${t(o.region)} ${o.address}`, o.region))
  const filteredDistributors = distributorData.filter(d => match(`${d.id} ${d.name} ${d.owner} ${t(d.region)}`, d.region))
  const filteredProducts = products.filter(p => match(`${p.id} ${t(p.name)} ${t(p.warehouse)}`, p.region))
  const filteredReceivables = receivableData.filter(r => match(`${r.id} ${r.outlet} ${t(r.status)}`, r.region) && (status === 'all' || r.status === status))
  const count = { orders: filteredOrders.length, outlets: filteredOutlets.length, distributors: filteredDistributors.length, inventory: filteredProducts.length, receivables: filteredReceivables.length }[page]
  const stats = (() => {
    if (page === 'orders') return [{ label: t('orderCount'), value: number(filteredOrders.length), icon: Package }, { label: t('totalSales'), value: money(filteredOrders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.amount, 0)), icon: Wallet }, { label: t('pending'), value: number(filteredOrders.filter(o => o.status === 'pending').length), icon: Truck }]
    if (page === 'outlets') return [{ label: t('storeCount'), value: number(filteredOutlets.length), icon: Store }, { label: t('activeOutlets'), value: number(filteredOutlets.filter(o => o.active).length), icon: Users }, { label: t('currentDebt'), value: money(filteredOutlets.reduce((sum, o) => sum + o.balance, 0)), icon: Wallet }]
    if (page === 'distributors') return [{ label: t('distributorCount'), value: number(filteredDistributors.length), icon: Truck }, { label: t('storeNetwork'), value: number(filteredDistributors.reduce((sum, d) => sum + d.stores, 0)), icon: Store }, { label: t('monthlySales'), value: money(filteredDistributors.reduce((sum, d) => sum + d.sales, 0)), icon: Wallet }]
    if (page === 'inventory') return [{ label: t('totalInventory'), value: `${number(filteredProducts.reduce((sum, p) => sum + p.available, 0))} ${t('pcs')}`, icon: Boxes }, { label: t('lowStock'), value: number(filteredProducts.filter(p => p.status === 'low').length), icon: Package }, { label: t('nearExpiry'), value: number(filteredProducts.filter(p => p.status === 'expirySoon').length), icon: Truck }]
    return [{ label: t('totalReceivable'), value: money(filteredReceivables.reduce((sum, r) => sum + r.amount - r.received, 0)), icon: CreditCard }, { label: t('overdueAmount'), value: money(filteredReceivables.filter(r => r.status === 'overdue').reduce((sum, r) => sum + r.amount - r.received, 0)), icon: Wallet }, { label: t('received'), value: money(filteredReceivables.reduce((sum, r) => sum + r.received, 0)), icon: Check }]
  })()
  const handleExport = () => {
    let headers: string[] = []; let rows: (string | number)[][] = []
    if (page === 'orders') { headers = [t('orderNo'), t('outlet'), t('amount'), t('status'), t('date')]; rows = filteredOrders.map(o => [o.id, o.outlet, o.amount, t(o.status), o.date]) }
    if (page === 'outlets') { headers = [t('outlet'), t('region'), t('contact'), t('currentDebt')]; rows = filteredOutlets.map(o => [o.name, t(o.region), o.contact, o.balance]) }
    if (page === 'distributors') { headers = [t('distributor'), t('region'), t('owner'), t('storeNetwork'), t('monthlySales')]; rows = filteredDistributors.map(d => [d.name, t(d.region), d.owner, d.stores, d.sales]) }
    if (page === 'inventory') { headers = [t('sku'), t('product'), t('warehouse'), t('available'), t('reserved'), t('expiry')]; rows = filteredProducts.map(p => [p.id, t(p.name), t(p.warehouse), p.available, p.reserved, p.expiry]) }
    if (page === 'receivables') { headers = [t('receivableNo'), t('outlet'), t('receivableAmount'), t('received'), t('balance'), t('dueDate')]; rows = filteredReceivables.map(r => [r.id, r.outlet, r.amount, r.received, r.amount - r.received, r.due]) }
    if (!rows.length) { toast.info(t('exportEmpty')); return }
    exportCsv(headers, rows, `${companyName}-${page}-2026-11-07.csv`); toast.success(t('exportDone'))
  }
  const reset = () => { setQuery(''); setStatus('all'); setRegion('all') }
  return <div className="records-page page-enter management-page"><Card className="list-card">
    <ManagementHeader title={t(page)} context={<span className="record-count">{count}</span>} actions={<><Button variant="outline" onClick={handleExport}><ArrowDownToLine size={14} />{t('export')}</Button>{page === 'orders' && <Button onClick={onCreateOrder} data-testid="new-order"><Plus size={15} />{t('createOrder')}</Button>}</>} />
    <ManagementFilters label={t('searchHint')} actions={(query || status !== 'all' || region !== 'all') && <Button variant="ghost" onClick={reset}><RotateCcw size={13} />{t('clearFilters')}</Button>}>
      <div className="list-search"><Search size={15} /><Input aria-label={t('searchHint')} placeholder={t('searchHint')} value={query} onChange={e => setQuery(e.target.value)} /></div>
      <Select value={region} onValueChange={setRegion}><SelectTrigger className="region-select" aria-label={t('region')}><Globe2 size={14} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('allRegions')}</SelectItem>{regions.map(r => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}</SelectContent></Select>
      {(page === 'orders' || page === 'receivables') && <Select value={status} onValueChange={setStatus}><SelectTrigger className="status-select" aria-label={t('status')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('allStatuses')}</SelectItem>{(page === 'orders' ? ['pending', 'delivering', 'delivered', 'cancelled'] : ['unpaid', 'partial', 'overdue', 'paid']).map(s => <SelectItem key={s} value={s}>{t(s as TextKey)}</SelectItem>)}</SelectContent></Select>}
    </ManagementFilters>
    <ManagementSummary items={stats} />
      {count === 0 ? <EmptyState onReset={reset} /> : <>
      {page === 'orders' && <OrderTable orders={filteredOrders} onOrder={onOrder} />}
      {page === 'outlets' && <Table className="data-table"><TableHeader><TableRow>{['outlet', 'region', 'storeType', 'contact', 'currentDebt', 'status'].map(h => <TableHead key={h}>{t(h as TextKey)}</TableHead>)}<TableHead><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader><TableBody>{filteredOutlets.map(o => <TableRow key={o.id}><TableCell><div className="cell-with-icon"><span className="record-avatar"><Store size={17} /></span><div className="two-line-cell"><strong>{o.name}</strong><small>{o.id}</small></div></div></TableCell><TableCell>{t(o.region)}</TableCell><TableCell className="secondary-cell">{t(o.channel)}</TableCell><TableCell>{o.contact}</TableCell><TableCell className="amount-cell">{money(o.balance)}</TableCell><TableCell><StatusBadge status={o.active ? 'active' : 'inactive'} /></TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label={`${t('detail')} ${o.name}`} onClick={() => setRecord({ title: o.name, pairs: [[t('outlet'), o.name], [t('region'), t(o.region)], [t('contact'), o.contact], [t('storeType'), t(o.channel)], [t('deliveryAddress'), o.address], [t('currentDebt'), money(o.balance)]] })}><ChevronRight size={16} /></Button></TableCell></TableRow>)}</TableBody></Table>}
      {page === 'distributors' && <Table className="data-table"><TableHeader><TableRow>{['distributor', 'region', 'owner', 'storeNetwork', 'monthlySales', 'status', 'action'].map(h => <TableHead key={h}>{t(h as TextKey)}</TableHead>)}</TableRow></TableHeader><TableBody>{filteredDistributors.map(d => <TableRow key={d.id}><TableCell><div className="cell-with-icon"><span className="record-avatar"><Truck size={16} /></span><div className="two-line-cell"><strong>{d.name}</strong><small>{d.id}</small></div></div></TableCell><TableCell>{t(d.region)}</TableCell><TableCell>{d.owner}</TableCell><TableCell>{number(d.stores)}</TableCell><TableCell className="amount-cell">{money(d.sales)}</TableCell><TableCell><StatusBadge status="active" /></TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label={`${t('detail')} ${d.name}`} onClick={() => setRecord({ title: d.name, pairs: [[t('distributor'), d.name], [t('region'), t(d.region)], [t('owner'), d.owner], [t('storeNetwork'), number(d.stores)], [t('monthlySales'), money(d.sales)]] })}><ChevronRight size={16} /></Button></TableCell></TableRow>)}</TableBody></Table>}
      {page === 'inventory' && <Table className="data-table"><TableHeader><TableRow>{['product', 'warehouse', 'available', 'reserved', 'expiry', 'status'].map(h => <TableHead key={h}>{t(h as TextKey)}</TableHead>)}</TableRow></TableHeader><TableBody>{filteredProducts.map(p => <TableRow key={p.id}><TableCell><div className="cell-with-icon"><span className={cn('product-thumbnail', `product-${p.color}`)}><svg width="20" height="30" viewBox="0 0 20 30" fill="none" aria-hidden="true"><rect x="8" y="19" width="4" height="10" rx="2" fill="#CBA984" /><path d="M3 8a7 7 0 0 1 14 0v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" fill="currentColor" /><path d="M7 7v10" stroke="white" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" /></svg></span><div className="two-line-cell"><strong>{t(p.name)}</strong><small>{p.id}</small></div></div></TableCell><TableCell className="secondary-cell">{t(p.warehouse)}</TableCell><TableCell className="amount-cell">{number(p.available)} <span className="muted-unit">{t('pcs')}</span></TableCell><TableCell className="secondary-cell">{number(p.reserved)} {t('pcs')}</TableCell><TableCell className="tabular-nums">{p.expiry}</TableCell><TableCell><StatusBadge status={p.status} /></TableCell></TableRow>)}</TableBody></Table>}
      {page === 'receivables' && <Table className="data-table"><TableHeader><TableRow>{['receivableNo', 'outlet', 'receivableAmount', 'received', 'balance', 'dueDate', 'status'].map(h => <TableHead key={h}>{t(h as TextKey)}</TableHead>)}</TableRow></TableHeader><TableBody>{filteredReceivables.map(r => <TableRow key={r.id}><TableCell><button className="order-id" onClick={() => setRecord({ title: r.id, amounts: { amount: r.amount, received: r.received }, pairs: [[t('receivableNo'), r.id], [t('outlet'), r.outlet], [t('region'), t(r.region)], [t('dueDate'), r.due], [t('status'), <StatusBadge key="status" status={r.status} />]] })}>{r.id}</button></TableCell><TableCell>{r.outlet}</TableCell><TableCell className="amount-cell">{money(r.amount)}</TableCell><TableCell className="secondary-cell">{money(r.received)}</TableCell><TableCell className={cn('amount-cell', r.status === 'overdue' && 'overdue-text')}>{money(r.amount - r.received)}</TableCell><TableCell className="secondary-cell tabular-nums">{r.due}</TableCell><TableCell><StatusBadge status={r.status} /></TableCell></TableRow>)}</TableBody></Table>}
      </>}
      <div className="table-footer"><span>{t('showing')} <strong>{count}</strong> {t('records')}</span><span className="sample-label">{t('demoData')}</span></div></Card><p className="demo-footnote">{t('demoNotice')}</p>
      {record && <DetailDrawer open onClose={() => setRecord(null)} title={record.title} badge={page === 'receivables' ? '应收单' : t(page)} description={`${t('detailsLabel')} · ${t('demoTag')}`}>
        {record.amounts && <DetailMetrics items={[{ label: t('receivableAmount'), value: money(record.amounts.amount), tone: 'warm' }, { label: t('received'), value: money(record.amounts.received), tone: 'blue' }, { label: t('balance'), value: money(record.amounts.amount - record.amounts.received) }]} />}
        <DetailSection title="基本信息"><DetailFields values={record.pairs} /></DetailSection>
      </DetailDrawer>}

    </div>
}

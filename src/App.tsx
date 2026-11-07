import { companyName } from '@/lib/brand'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Globe2, Plus, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkspaceShell } from '@/components/workspace-shell'
import { AuthPage } from '@/components/auth-page'
import { RecordsPage, StatusBadge, exportCsv } from '@/components/records'
import { SettingsPage } from '@/components/settings-page'
import { usePreferences } from '@/lib/preferences'
import { useAuth } from '@/lib/auth-context'
import { initialOrders, outlets, products, regions } from '@/lib/data'
import type { Page, Order } from '@/lib/data'
import type { TextKey } from '@/lib/i18n'

const validPages: Page[] = ['overview', 'orders', 'outlets', 'distributors', 'inventory', 'receivables', 'settings', 'visitRoutes']
const Dashboard = lazy(() => import('@/components/dashboard').then(module => ({ default: module.Dashboard })))
const VisitRoutesPage = lazy(() => import('@/components/visit-routes-page').then(module => ({ default: module.VisitRoutesPage })))
const descriptions: Record<Page, TextKey> = { overview: 'overviewDescription', orders: 'ordersDescription', outlets: 'outletsDescription', distributors: 'distributorsDescription', inventory: 'inventoryDescription', receivables: 'receivablesDescription', settings: 'settingsDescription', visitRoutes: 'visitRoutesDescription' }
function currentPage(): Page {
  const hash = location.hash.slice(1) as Page
  return validPages.includes(hash) ? hash : 'overview'
}
function WorkspaceApp() {
  const { t, money, number } = usePreferences()
  const [page, setPage] = useState<Page>(currentPage)
  const [region, setRegion] = useState('all')
  const [range, setRange] = useState('7d')
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [outletId, setOutletId] = useState('')
  const [productId, setProductId] = useState('SKU-001')
  const [quantity, setQuantity] = useState('24')
  useEffect(() => {
    const change = () => { setPage(currentPage()); window.scrollTo({ top: 0, behavior: 'instant' }) }
    window.addEventListener('hashchange', change)
    const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(v => !v) } }
    window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('keydown', keyboard) }
  }, [])
  const navigate = (next: Page) => { location.hash = next; setPage(next) }
  const selectedProduct = products.find(p => p.id === productId)!
  const quantityNumber = Number(quantity)
  const validQuantity = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= 10000
  const createOrder = (event: React.FormEvent) => {
    event.preventDefault()
    if (!outletId || !validQuantity) { toast.error(t('numberValidation')); return }
    const outlet = outlets.find(o => o.id === outletId)!
    const distributor = initialOrders.find(o => o.region === outlet.region)!.distributor
    const order: Order = { id: `SO-261107-${String(87 + orders.length - initialOrders.length).padStart(4, '0')}`, outlet: outlet.name, distributor, region: outlet.region, amount: quantityNumber * selectedProduct.price, status: 'pending', date: '2026-11-07', product: selectedProduct.name, quantity: quantityNumber, price: selectedProduct.price, payment: 'credit' }
    setOrders(previous => [order, ...previous]); setNewOrderOpen(false); setOutletId(''); setQuantity('24')
    setRegion('all'); navigate('orders'); toast.success(t('orderCreated'), { description: t('orderCreatedHint') })
  }
  const exportDashboard = () => {
    const filtered = orders.filter(o => region === 'all' || o.region === region)
    exportCsv([t('orderNo'), t('outlet'), t('distributor'), t('amount'), t('status'), t('date')], filtered.map(o => [o.id, o.outlet, o.distributor, o.amount, t(o.status), o.date]), `${companyName}-orders-2026-11-07.csv`)
    toast.success(t('exportDone'))
  }
  return <><WorkspaceShell page={page} navigate={navigate} orders={orders} onOrder={setSelectedOrder} searchOpen={searchOpen} setSearchOpen={setSearchOpen}>{page !== 'visitRoutes' && <div className="page-heading"><div><div className="page-eyebrow">{companyName} <span>/</span> {t(page)}</div><h1>{t(page)}</h1><p>{t(descriptions[page])}</p></div><div className="page-actions">{page !== 'settings' && <Select value={region} onValueChange={setRegion}><SelectTrigger className="region-select" aria-label={t('region')}><Globe2 size={15} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('allRegions')}</SelectItem>{regions.map(r => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}</SelectContent></Select>}{page === 'overview' && <Button variant="outline" className="export-dashboard" onClick={exportDashboard}><ArrowDownToLine size={15} /><span>{t('export')}</span></Button>}{(page === 'overview' || page === 'orders') && <Button onClick={() => setNewOrderOpen(true)} data-testid="new-order"><Plus size={16} />{t('createOrder')}</Button>}</div></div>}
    {page === 'visitRoutes' ? <Suspense fallback={<div className="dashboard-skeleton" role="status" aria-label={t('loading')}><div /><div /><div /><div /></div>}><VisitRoutesPage region={region} setRegion={setRegion} /></Suspense> : page === 'overview' ? <Suspense fallback={<div className="dashboard-skeleton" role="status" aria-label={t('loading')}><div /><div /><div /><div /><div className="skeleton-chart" /></div>}><Dashboard orders={orders} onOrder={setSelectedOrder} navigate={navigate} region={region} range={range} setRange={setRange} /></Suspense> : page === 'settings' ? <SettingsPage /> : <RecordsPage key={page} page={page} region={region} orders={orders} onOrder={setSelectedOrder} />}
  </WorkspaceShell>
  <Dialog open={!!selectedOrder} onOpenChange={open => !open && setSelectedOrder(null)}><DialogContent closeLabel={t('close')} className="order-dialog"><DialogHeader><DialogTitle>{t('orderDetails')}</DialogTitle><DialogDescription>{t('orderDetailsHint')}</DialogDescription></DialogHeader>{selectedOrder && <><div className="order-detail-hero"><span className="order-detail-icon"><ShoppingBag size={22} /></span><div><strong>{selectedOrder.id}</strong><span>{selectedOrder.outlet}</span></div><StatusBadge status={selectedOrder.status} /></div><dl className="detail-grid"><div><dt>{t('distributor')}</dt><dd>{selectedOrder.distributor}</dd></div><div><dt>{t('region')}</dt><dd>{t(selectedOrder.region)}</dd></div><div><dt>{t('date')}</dt><dd>{selectedOrder.date}</dd></div><div><dt>{t('paymentMethod')}</dt><dd>{t(selectedOrder.payment)}</dd></div></dl><div className="order-item-detail"><span>{t(selectedOrder.product)}<small>{number(selectedOrder.quantity)} {t('pcs')} × {money(selectedOrder.price)}</small></span><strong>{money(selectedOrder.amount, true)}</strong></div><div className="order-total"><span>{t('amount')}</span><strong>{money(selectedOrder.amount, true)}</strong></div><p className="dialog-note">{t('orderStatusHint')}</p></>}<Button variant="outline" onClick={() => setSelectedOrder(null)}>{t('close')}</Button></DialogContent></Dialog>
  <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}><DialogContent closeLabel={t('close')} className="new-order-dialog"><DialogHeader><DialogTitle>{t('createOrder')}</DialogTitle><DialogDescription>{t('newOrderHint')}</DialogDescription></DialogHeader><form onSubmit={createOrder} className="order-form"><div className="form-field"><Label htmlFor="order-outlet">{t('outlet')}</Label><Select value={outletId} onValueChange={setOutletId} required><SelectTrigger id="order-outlet"><SelectValue placeholder={t('selectOutlet')} /></SelectTrigger><SelectContent>{outlets.filter(o => o.active).map(o => <SelectItem value={o.id} key={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div><div className="form-field"><Label htmlFor="order-product">{t('product')}</Label><Select value={productId} onValueChange={setProductId}><SelectTrigger id="order-product"><SelectValue /></SelectTrigger><SelectContent>{products.map(p => <SelectItem value={p.id} key={p.id}>{t(p.name)} · {money(p.price)}/{t('pcs')}</SelectItem>)}</SelectContent></Select></div><div className="form-field"><Label htmlFor="order-quantity">{t('quantity')} ({t('pcs')})</Label><Input id="order-quantity" type="number" min="1" max="10000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required /></div><div className="order-preview"><span>{t('orderPreview')}</span><strong>{money(validQuantity ? quantityNumber * selectedProduct.price : 0, true)}</strong></div><div className="form-actions"><Button type="button" variant="outline" onClick={() => setNewOrderOpen(false)}>{t('cancel')}</Button><Button type="submit" disabled={!outletId || !validQuantity}><Plus size={15} />{t('submit')}</Button></div></form></DialogContent></Dialog>
  </>
}
function App() {
  const { user } = useAuth()
  const { mode } = usePreferences()
  const [authPage, setAuthPage] = useState<'login' | 'register'>(() => location.hash === '#register' ? 'register' : 'login')
  const destination = useRef<Page>(currentPage())
  useEffect(() => {
    const sync = () => {
      const hash = location.hash.slice(1)
      if (!user) {
        if (validPages.includes(hash as Page)) destination.current = hash as Page
        setAuthPage(hash === 'register' ? 'register' : 'login')
        if (hash !== 'login' && hash !== 'register') location.replace('#login')
      } else if (!validPages.includes(hash as Page)) {
        location.replace(`#${destination.current}`)
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [user])
  return <>{user ? <WorkspaceApp key={user.id} /> : <AuthPage key={authPage} page={authPage} />}<Toaster position="bottom-right" theme={mode} richColors closeButton /></>
}
export default App

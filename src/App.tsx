import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Globe2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { navigateWorkspace } from '@/lib/navigation'
import { FieldworkPage } from '@/components/fieldwork-page'
import { fieldPages } from '@/lib/fieldwork'
import { SalesManagementPage, SalesLedgerPage } from '@/components/sales-page'
import { readSales, salesPages, visibleSales, salesContext, orderAmount, orderLedger } from '@/lib/sales'
import type { SalesPage } from '@/lib/sales'
import { SalesOrderDetail } from '@/components/document-detail'
import { CatalogPage } from '@/components/catalog-page'
import type { CatalogPageId } from '@/components/catalog-page'
import { BasicDataPage } from '@/components/basic-data-page'
import { CustomersPage } from '@/components/customers-page'
import { basicPages } from '@/lib/basic-data'
import type { BasicPage } from '@/lib/basic-data'
import { companyName } from '@/lib/brand'
import { readCustomers, restoreCustomerSalesOrders } from '@/lib/customers'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { WorkspaceShell } from '@/components/workspace-shell'
import { AuthPage } from '@/components/auth-page'
import { RecordsPage, exportCsv } from '@/components/records'
import { SettingsPage } from '@/components/settings-page'
import { usePreferences } from '@/lib/preferences'
import { useAuth } from '@/lib/auth-context'
import { OrganizationPage } from '@/components/organization-page'
import { OrganizationProvider, useOrganization } from '@/lib/organization-context'
import { PasswordChange } from '@/components/password-change'
import { initialOrders } from '@/lib/data'
import type { Page, Order } from '@/lib/data'

const validPages: Page[] = [...salesPages, ...fieldPages, ...basicPages, 'products', 'priceLists', 'overview', 'outlets', 'distributors', 'inventory', 'receivables', 'settings', 'visitRoutes', 'businessUnits', 'departments', 'personnel']
const Dashboard = lazy(() => import('@/components/dashboard').then(module => ({ default: module.Dashboard })))
const VisitRoutesPage = lazy(() => import('@/components/visit-routes-page').then(module => ({ default: module.VisitRoutesPage })))
function currentPage(): Page {
  const hash = location.hash.slice(1).split('?')[0] as Page
  return validPages.includes(hash) ? hash : 'overview'
}
function WorkspaceApp() {
  const { t } = usePreferences(), { user } = useAuth(), org = useOrganization()
  const [page, setPage] = useState<Page>(currentPage), lastRoutePage = useRef(page)
  const [region, setRegion] = useState('all'), [range, setRange] = useState('7d'), [searchOpen, setSearchOpen] = useState(false), [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const legacyAvailable = org.tenantId === 'hani' && org.scope?.unitId === 'hq'
  const loadBusiness = useCallback(() => {
    try {
      const sales = readSales(org.tenantId), customers = readCustomers(org.tenantId), ctx = salesContext(user!, org.tenantId)
      const linked: Order[] = visibleSales(sales, ctx).map(o => ({ id: o.id, outlet: o.customerName, distributor: org.state.units.find(u => u.id === o.dealerId)?.name ?? '', region: o.dealerId === 'dealer-lz' ? 'northLuzon' : o.dealerId === 'dealer-cebu' ? 'visayas' : 'manila', amount: orderAmount(o) / 100, status: o.status === '已取消' ? 'cancelled' : orderLedger(sales, o).completed ? 'delivered' : orderLedger(sales, o).delivery === '配送中' ? 'delivering' : 'pending', date: o.date, product: 'vanilla', quantity: o.lines.reduce((sum, l) => sum + l.quantity, 0), price: o.lines[0]?.price4 / 10000 || 0, payment: o.payment === '赊销' ? 'credit' : o.payment === '现金' ? 'cash' : 'wallet' }))
      return { sales, customers, orders: [...linked, ...(legacyAvailable ? [...restoreCustomerSalesOrders(customers), ...initialOrders] : [])] }
    } catch { return { sales: null, customers: null, orders: legacyAvailable ? initialOrders : [] } }
  }, [org.tenantId, org.state, user, legacyAvailable])
  const [business, setBusiness] = useState(loadBusiness)
  useEffect(() => {
    const sync = () => setBusiness(loadBusiness())
    sync(); for (const name of ['tradevia-sales-change', 'tradevia-customers-change', 'storage', 'focus']) window.addEventListener(name, sync)
    return () => { for (const name of ['tradevia-sales-change', 'tradevia-customers-change', 'storage', 'focus']) window.removeEventListener(name, sync) }
  }, [loadBusiness])
  useEffect(() => {
    const change = () => { const next = currentPage(); setPage(next); if (lastRoutePage.current !== next) window.scrollTo({ top: 0, behavior: 'instant' }); lastRoutePage.current = next }
    const keyboard = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(v => !v) } }
    window.addEventListener('hashchange', change); window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('keydown', keyboard) }
  }, [])
  const navigate = (next: Page) => { if (navigateWorkspace(next)) setPage(next) }
  const onOrder = (order: Order) => { if (business.sales?.orders.some(o => o.id === order.id)) { location.hash = `orders?document=${encodeURIComponent(order.id)}`; setPage('orders') } else setSelectedOrder(order) }
  const isFieldPage = fieldPages.includes(page as import('@/lib/fieldwork').FieldPage), isBasicPage = basicPages.includes(page as BasicPage), isCatalogPage = ['productCategories', 'products', 'priceLists'].includes(page), isOrgPage = ['businessUnits', 'departments', 'personnel'].includes(page), isSalesPage = salesPages.includes(page as SalesPage)
  const exportDashboard = () => { const rows = business.orders.filter(o => region === 'all' || o.region === region); exportCsv([t('orderNo'), t('outlet'), t('amount'), t('status'), t('date')], rows.map(o => [o.id, o.outlet, o.amount, t(o.status), o.date]), `${companyName}-orders.csv`); toast.success(t('exportDone')) }
  return <><WorkspaceShell page={page} navigate={navigate} orders={business.orders} onOrder={onOrder} searchOpen={searchOpen} setSearchOpen={setSearchOpen}>
    {(page === 'overview' || page === 'settings' || page === 'distributors' && !legacyAvailable) && <div className="page-heading"><div><div className="page-eyebrow">{companyName} <span>/</span> {t(page)}</div><h1>{t(page)}</h1><p>{t(page === 'overview' ? 'overviewDescription' : page === 'settings' ? 'settingsDescription' : 'distributorsDescription')}</p></div><div className="page-actions">{page === 'overview' && <><Button variant="outline" onClick={exportDashboard}><ArrowDownToLine size={15} />{t('export')}</Button><Button onClick={() => { location.hash = 'orders?choose=1'; setPage('orders') }} data-testid="new-order"><Plus size={16} />{t('createOrder')}</Button></>}</div></div>}
    {isSalesPage ? <SalesManagementPage key={`${org.tenantId}:${org.scope?.unitId}:${page}`} page={page as SalesPage} /> : page === 'inventory' || page === 'receivables' ? <SalesLedgerPage key={`${org.tenantId}:${page}`} page={page} /> : isFieldPage ? <FieldworkPage page={page as import('@/lib/fieldwork').FieldPage} /> : isCatalogPage ? <CatalogPage key={page} page={page as CatalogPageId} /> : page === 'outlets' ? <CustomersPage /> : isBasicPage ? <BasicDataPage page={page as BasicPage} /> : isOrgPage ? <OrganizationPage page={page as 'businessUnits' | 'departments' | 'personnel'} /> : !legacyAvailable && page !== 'settings' ? <div className="org-no-access"><Globe2 size={36} /><h2>当前组织暂无该模块的业务数据</h2><p>可通过销售管理查看当前组织的订单、库存与应收。</p><Button onClick={() => navigate('orders')}>查看销售管理</Button></div> : page === 'visitRoutes' ? <Suspense fallback={<p>{t('loading')}</p>}><VisitRoutesPage region={region} setRegion={setRegion} /></Suspense> : page === 'overview' ? <Suspense fallback={<div className="dashboard-skeleton" role="status" aria-label={t('loading')}><div /><div /><div /><div /><div className="skeleton-chart" /></div>}><Dashboard orders={business.orders} onOrder={onOrder} navigate={navigate} region={region} range={range} setRange={setRange} /></Suspense> : page === 'settings' ? <SettingsPage /> : <RecordsPage key={page} page="distributors" region={region} setRegion={setRegion} orders={business.orders} onOrder={onOrder} onCreateOrder={() => navigate('orders')} />}
  </WorkspaceShell>{selectedOrder && <SalesOrderDetail key={selectedOrder.id} order={selectedOrder} ledger={business.customers?.orders.find(o => o.id === selectedOrder.id)} receipts={business.customers?.receipts ?? []} onClose={() => setSelectedOrder(null)} />}</>
}
function App() {
  const { user } = useAuth()
  const { mode } = usePreferences()
  const [authPage, setAuthPage] = useState<'login' | 'register'>(() => location.hash === '#register' ? 'register' : 'login')
  const destination = useRef(validPages.includes(location.hash.slice(1).split('?')[0] as Page) ? location.hash.slice(1) : 'overview')
  useEffect(() => {
    const sync = () => {
      const hash = location.hash.slice(1).split('?')[0]
      if (!user) {
        if (validPages.includes(hash as Page)) destination.current = location.hash.slice(1)
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
  return <>{user ? <OrganizationProvider key={user.id}>{user.passwordChangeRequired ? <PasswordChange forced /> : <WorkspaceApp />}</OrganizationProvider> : <AuthPage key={authPage} page={authPage} />}<Toaster position="bottom-right" theme={mode} richColors closeButton /></>
}
export default App

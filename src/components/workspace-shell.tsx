import { fieldPages } from '@/lib/fieldwork'
import { basicPages } from '@/lib/basic-data'
import type { BasicPage } from '@/lib/basic-data'
import { companyName } from '@/lib/brand'
import { useState } from 'react'
import { ArrowUpRight, Building2, FolderTree, Users, Bell, BookOpen, Boxes, Check, ChevronDown, ChevronRight, CircleHelp, Command, CreditCard, Globe2, IceCreamCone, LayoutDashboard, LogOut, Menu, Monitor, Moon, Palette, Route, Search, Settings2, ShieldCheck, ShoppingBag, Store, Sun, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { accents, usePreferences } from '@/lib/preferences'
import { useAuth } from '@/lib/auth-context'
import { useOrganization } from '@/lib/organization-context'
import { levelNames } from '@/lib/organization'
import { PasswordChange } from './password-change'
import { authEn, authZh } from '@/lib/auth-i18n'
import { AuthError } from '@/lib/auth'
import type { Mode } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import type { Page, Order } from '@/lib/data'

const navGroups = [
  { label: 'organizationNav', items: [{ id: 'businessUnits', icon: Building2 }, { id: 'departments', icon: FolderTree }, { id: 'personnel', icon: Users }] },
  { label: 'basicDataNav', items: [{ id: 'unitArchives', icon: BookOpen }] },
  { label: 'productManagementNav', items: [{ id: 'productCategories', icon: FolderTree }, { id: 'products', icon: IceCreamCone }, { id: 'priceLists', icon: CreditCard }] },
  { label: 'salesManagementNav', items: [{ id: 'orders', icon: ShoppingBag }, { id: 'shipments', icon: Truck }, { id: 'outbounds', icon: Boxes }, { id: 'invoices', icon: BookOpen }] },
  { label: 'storeManagementNav', items: [{ id: 'outletCategories', icon: FolderTree }, { id: 'outlets', icon: Store }] },
  { label: 'fieldworkNav', items: [{ id: 'fieldActions', icon: Settings2 }, { id: 'fieldTypes', icon: FolderTree }, { id: 'fieldRules', icon: ShieldCheck }, { id: 'visitRoutes', icon: Route }, { id: 'fieldVisits', icon: BookOpen }, { id: 'fieldStatistics', icon: LayoutDashboard }] },
  { label: 'channelNav', items: [{ id: 'distributors', icon: Truck }] },
  { label: 'operationNav', items: [{ id: 'inventory', icon: Boxes }, { id: 'receivables', icon: CreditCard }] },
] as const

type NavGroup = typeof navGroups[number]['label']
const isNavigationPage = (id: Page, page: Page) => page === id || (id === 'unitArchives' && page !== 'outletCategories' && page !== 'productCategories' && basicPages.includes(page as BasicPage))
const navigationGroup = (page: Page) => navGroups.find(group => group.items.some(item => isNavigationPage(item.id, page)))?.label

export function Logo({ small = false }: { small?: boolean }) {
  return <div className="brand"><div className="brand-mark"><IceCreamCone size={23} strokeWidth={1.8} aria-hidden="true" /></div>{!small && <span className="brand-name">{companyName}</span>}</div>
}

export function ThemeControls({ compact = false }: { compact?: boolean }) {
  const { t, accent, setAccent, mode, setMode } = usePreferences()
  const modes = [{ id: 'light', icon: Sun }, { id: 'dark', icon: Moon }, { id: 'system', icon: Monitor }] as const
  return <div className={cn('theme-controls', compact && 'compact')}>
    <p className="control-label">{t('accent')}</p>
    <div className="color-options">{accents.map(c => <button key={c.id} type="button" className={cn('color-option', accent === c.id && 'selected')} style={{ '--swatch': c.hex } as React.CSSProperties} aria-label={t(c.id)} aria-pressed={accent === c.id} title={t(c.id)} data-testid={`color-${c.id}`} onClick={() => setAccent(c.id)}><span>{accent === c.id && <Check size={15} strokeWidth={2.5} />}</span>{!compact && <span className="color-name">{t(c.id)}</span>}</button>)}</div>
    <p className="control-label mode-label">{t('mode')}</p>
    <div className="mode-segment">{modes.map(({ id, icon: Icon }) => <button key={id} className={cn(mode === id && 'selected')} aria-pressed={mode === id} data-testid={`mode-${id}`} onClick={() => setMode(id as Mode)}><Icon size={15} />{t(id)}</button>)}</div>
  </div>
}

export function WorkspaceShell({ page, navigate, children, orders, onOrder, searchOpen, setSearchOpen }: { page: Page; navigate: (page: Page) => void; children: ReactNode; orders: Order[]; onOrder: (order: Order) => void; searchOpen: boolean; setSearchOpen: (open: boolean) => void }) {
  const { t, locale, setLocale } = usePreferences()
  const { user, signOut } = useAuth()
  const org = useOrganization()
  const currentUnit = org.units.find(u => u.id === org.scope?.unitId)
  const listPage = [...fieldPages, ...basicPages, 'products', 'priceLists', 'businessUnits', 'departments', 'personnel', 'orders', 'shipments', 'outbounds', 'invoices', 'outlets', 'distributors', 'inventory', 'receivables', 'visitRoutes'].includes(page)
  const legacyAvailable = org.tenantId === 'hani' && org.scope?.unitId === 'hq'
  const tenantName = org.state.tenants.find(t => t.id === org.tenantId)?.name
  const [passwordOpen, setPasswordOpen] = useState(false)
  const authCopy = locale === 'zh' ? authZh : authEn
  const displayName = org.people.find(p => p.email === org.scope?.email)?.name ?? (user?.demo ? authCopy.demoAccount : user?.name ?? '')
  const initials = user?.demo ? '哈尼' : Array.from(displayName).slice(0, 2).join('').toUpperCase()
  const logout = () => {
    try { signOut(); toast.success(authCopy.logoutSuccess) }
    catch (error) { toast.error(authCopy[error instanceof AuthError ? error.code : 'unknownError']) }
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [navigation, setNavigation] = useState(() => {
    const current = navigationGroup(page)
    return { page, expandedGroups: new Set<NavGroup>(current ? [current] : []) }
  })
  if (navigation.page !== page) {
    const current = navigationGroup(page)
    setNavigation({ page, expandedGroups: current ? new Set([...navigation.expandedGroups, current]) : navigation.expandedGroups })
  }
  const toggleGroup = (label: NavGroup) => setNavigation(previous => {
    const next = new Set(previous.expandedGroups)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    return { ...previous, expandedGroups: next }
  })
  const go = (target: Page) => { navigate(target); setMobileOpen(false); setSearchOpen(false) }
  const found = orders.filter(o => `${o.id} ${o.outlet} ${o.distributor}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
  const isActive = (id: Page) => isNavigationPage(id, page)
  const links = [{ id: 'overview', icon: LayoutDashboard } as const, ...navGroups.flatMap(g => [...g.items]), { id: 'settings', icon: Settings2 } as const]
  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-backdrop" aria-label={t('collapseMenu')} onClick={() => setMobileOpen(false)} />}
    <aside className={cn('sidebar', mobileOpen && 'sidebar-open')} aria-label={t('mainNav')}>
      <div className="sidebar-brand"><Logo /><Button className="mobile-close" variant="ghost" size="icon" aria-label={t('collapseMenu')} onClick={() => setMobileOpen(false)}><X size={18} /></Button></div>
      <DropdownMenu><DropdownMenuTrigger asChild><button className="workspace-switch"><span className="workspace-icon"><Globe2 size={19} /></span><span className="workspace-text"><strong>{tenantName ?? '未加入租户'}</strong><span>{currentUnit?.name ?? '等待分配组织'}</span></span><ChevronDown size={14} className="muted-icon" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="workspace-menu"><DropdownMenuLabel>切换所属租户</DropdownMenuLabel>{org.memberships.map(m => <DropdownMenuItem key={m.tenantId} onClick={() => { try { org.switchTenant(m.tenantId); toast.success('已切换租户') } catch (error) { toast.error((error as Error).message) } }}>{org.tenantId === m.tenantId ? <Check size={15} /> : <Building2 size={15} />}<span>{org.state.tenants.find(t => t.id === m.tenantId)?.name}</span></DropdownMenuItem>)}{!org.memberships.length && <DropdownMenuItem disabled>尚未分配租户</DropdownMenuItem>}<DropdownMenuSeparator /><DropdownMenuItem onClick={() => go('businessUnits')}><FolderTree size={15} />查看组织架构</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      <nav className="sidebar-nav" aria-label={t('mainNav')}>
        <a href="#overview" className={cn('nav-item nav-home', page === 'overview' && 'active')} aria-current={page === 'overview' ? 'page' : undefined} onClick={e => { e.preventDefault(); go('overview') }}><LayoutDashboard size={18} strokeWidth={1.8} /><span>{t('overview')}</span>{page === 'overview' && <span className="nav-active-dot" />}</a>
        {navGroups.map(group => {
          const expanded = navigation.expandedGroups.has(group.label)
          const current = group.items.some(item => isActive(item.id))
          return <div className="nav-group" key={group.label}>
            <button type="button" id={`nav-trigger-${group.label}`} className={cn('nav-item nav-module-trigger', current && 'current')} aria-expanded={expanded} aria-controls={`nav-children-${group.label}`} onClick={() => toggleGroup(group.label)}>
              <span className="nav-disclosure" aria-hidden="true"><ChevronRight size={13} strokeWidth={2.2} /></span><span>{t(group.label)}</span>{current && !expanded && <span className="nav-active-dot" />}
            </button>
            <div id={`nav-children-${group.label}`} className="nav-submenu" role="group" aria-labelledby={`nav-trigger-${group.label}`} hidden={!expanded}>
              {expanded && group.items.map(({ id, icon: Icon }) => <a key={id} href={`#${id}`} className={cn('nav-item', isActive(id) && 'active')} aria-current={isActive(id) ? 'page' : undefined} onClick={e => { e.preventDefault(); go(id) }}><Icon size={17} strokeWidth={1.8} /><span>{t(id === 'unitArchives' ? 'basicArchives' : id)}</span>{id === 'orders' && <span className="nav-count">{orders.length}</span>}{isActive(id) && id !== 'orders' && <span className="nav-active-dot" />}</a>)}
            </div>
          </div>
        })}
      </nav>
      <div className="sidebar-bottom"><a href="#settings" className={cn('nav-item', page === 'settings' && 'active')} aria-current={page === 'settings' ? 'page' : undefined} onClick={e => { e.preventDefault(); go('settings') }}><Settings2 size={18} strokeWidth={1.8} /><span>{t('settings')}</span></a><button className="nav-item" onClick={() => setHelpOpen(true)}><CircleHelp size={18} strokeWidth={1.8} /><span>{t('help')}</span><ArrowUpRight size={14} className="trailing-icon" /></button><div className="workspace-notice"><ShieldCheck size={17} /><div><strong>{t('demo')}</strong><p>{t('demoData')}</p></div></div><button className="sidebar-profile" onClick={() => setAccountOpen(true)}><span className="avatar">{initials}</span><span><strong>{displayName}</strong><small>{currentUnit ? `${levelNames[currentUnit.level - 1]} · ${org.scope?.admin ? '管理员' : '成员'}` : authCopy.localAccount}</small></span><ChevronRight size={15} className="trailing-icon" /></button></div>
    </aside>
    <div className="workspace-body"><header className="topbar"><div className="topbar-left"><Button className="mobile-menu" variant="ghost" size="icon" aria-label={t('openMenu')} onClick={() => setMobileOpen(true)}><Menu size={20} /></Button><span className="breadcrumb-home">{t('workspace')}</span><ChevronRight size={13} className="breadcrumb-chevron" /><span className="breadcrumb-current">{t(isNavigationPage('unitArchives', page) ? 'basicArchives' : page)}</span></div><div className="topbar-right"><button className="header-search" onClick={() => setSearchOpen(true)} aria-label={t('globalSearch')}><Search size={16} /><span>{t('search')}</span><kbd><Command size={11} /> K</kbd></button><div className="header-divider" /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="language-button" aria-label={t('language')} data-testid="language-menu"><Globe2 size={17} /><span>{locale === 'zh' ? '简体中文' : 'English'}</span><ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>{t('language')}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuRadioGroup value={locale} onValueChange={v => setLocale(v as 'zh' | 'en')}><DropdownMenuRadioItem value="zh">简体中文</DropdownMenuRadioItem><DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={t('appearance')} data-testid="theme-menu"><Palette size={18} /></Button></PopoverTrigger><PopoverContent align="end" className="theme-popover"><div className="popover-heading"><Palette size={16} /><strong>{t('appearance')}</strong></div><ThemeControls compact /><button className="popover-settings" onClick={() => go('settings')}>{t('settings')}<ArrowUpRight size={14} /></button></PopoverContent></Popover><Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}><PopoverTrigger asChild><Button className="notification-button" variant="ghost" size="icon" aria-label={t('notifications')}><Bell size={18} /><span className="notification-dot" /></Button></PopoverTrigger><PopoverContent align="end" className="notification-popover"><div className="notification-title"><strong>{t('noticeTitle')}</strong><span>{legacyAvailable ? 3 : 1} {t('unread')}</span></div>{legacyAvailable ? [{ icon: ShoppingBag, title: 'noticeOne', text: 'noticeOneDetail', page: 'orders' }, { icon: Boxes, title: 'noticeTwo', text: 'noticeTwoDetail', page: 'inventory' }, { icon: BookOpen, title: 'noticeThree', text: 'noticeThreeDetail', page: 'overview' }].map((n, i) => <button className="notification-item" key={i} onClick={() => { go(n.page as Page); setNotificationsOpen(false) }}><span className="notification-item-icon"><n.icon size={17} /></span><span><strong>{t(n.title as 'noticeOne')}</strong><small>{t(n.text as 'noticeOneDetail')}</small></span><ChevronRight size={14} /></button>) : <button className="notification-item" onClick={() => { go('businessUnits'); setNotificationsOpen(false) }}><span className="notification-item-icon"><ShieldCheck size={17} /></span><span><strong>组织权限已生效</strong><small>{currentUnit?.name ?? '等待分配组织'} · 仅本级及下级</small></span><ChevronRight size={14} /></button>}</PopoverContent></Popover><button className="header-avatar" aria-label={t('accountInfo')} onClick={() => setAccountOpen(true)}>{initials}</button></div></header>
      <main className={cn("main-content", listPage && "management-main")} id="main-content">{children}<footer className="page-footer"><span><span className="status-dot" />{t('online')}</span><span>{t('dataUpdated')}</span><span>{companyName} <span className="footer-version">v0.1</span></span></footer></main>
    </div>
    <Dialog open={searchOpen} onOpenChange={v => { setSearchOpen(v); if (!v) setQuery('') }}><DialogContent closeLabel={t('close')} className="search-dialog"><DialogHeader><DialogTitle>{t('globalSearch')}</DialogTitle><DialogDescription>{t('globalSearchHint')}</DialogDescription></DialogHeader><div className="search-input-wrap"><Search size={17} /><Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('globalSearchHint')} autoFocus /></div>{!query && <div className="search-section"><p>{t('pages')}</p>{links.map(({ id, icon: Icon }) => <button key={id} onClick={() => go(id)}><Icon size={17} /><span>{t(id)}</span><ChevronRight size={14} /></button>)}</div>}{query && <div className="search-section"><p>{t('searchResults')}</p>{found.length ? found.map(o => <button key={o.id} onClick={() => { onOrder(o); setSearchOpen(false); setQuery('') }}><ShoppingBag size={17} /><span>{o.outlet}<small>{o.id}</small></span><ChevronRight size={14} /></button>) : <div className="search-empty">{t('noResults')}</div>}</div>}</DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent closeLabel={t('close')}><DialogHeader><DialogTitle>{t('helpTitle')}</DialogTitle><DialogDescription>{t('helpText')}</DialogDescription></DialogHeader><p className="dialog-note">{t('helpFooter')}</p><Button onClick={() => setHelpOpen(false)}>{t('understood')}</Button></DialogContent></Dialog>
    <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent closeLabel={t('close')}><DialogHeader><DialogTitle>{t('accountInfo')}</DialogTitle><DialogDescription>{user?.demo ? authCopy.demoAccountHint : authCopy.accountHint}</DialogDescription></DialogHeader><div className="account-preview"><span className="avatar avatar-large">{initials}</span><div><strong>{displayName}</strong><p>{authCopy.localAccount}</p></div></div>{!user?.demo && <p className="auth-account-email">{user?.email}</p>}<div className="auth-account-actions">{!user?.demo && <Button variant="outline" onClick={() => { setAccountOpen(false); setPasswordOpen(true) }}>修改密码</Button>}<Button variant="outline" onClick={() => setAccountOpen(false)}>{t('close')}</Button><Button variant="destructive" onClick={logout}><LogOut size={15} />{authCopy.logout}</Button></div></DialogContent></Dialog>
    <PasswordChange open={passwordOpen} onClose={() => setPasswordOpen(false)} />
  </div>
}

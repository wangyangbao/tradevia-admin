import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCheck, ChevronRight, CirclePause, Globe2, Info, ListFilter, LocateFixed, MapPin, MapPinned, MoreHorizontal, Pencil, Play, Plus, Route, Save, Search, ShieldCheck, Store, Trash2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { exportCsv } from '@/components/records'
import { VisitRouteMap } from '@/components/visit-route-map'
import { usePreferences } from '@/lib/preferences'
import { regions } from '@/lib/data'
import { applyRouteChange, nextRouteId, readVisitRoutes, routeConflicts, routeStorageKey, visitOutlets, visitStaff } from '@/lib/visit-routes'
import type { VisitRoute } from '@/lib/visit-routes'
import { visitEn, visitZh } from '@/lib/visit-route-i18n'
import type { VisitTextKey } from '@/lib/visit-route-i18n'
import { cn } from '@/lib/utils'
import '@/styles/visit-routes.css'

function useVisitText() {
  const { locale } = usePreferences()
  return (key: VisitTextKey) => (locale === 'zh' ? visitZh : visitEn)[key]
}
const weekdayKeys: VisitTextKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
function scheduleLabel(route: VisitRoute, v: (key: VisitTextKey) => string) {
  const days = [...route.days].sort((a, b) => a - b)
  return `${v(route.frequency)} · ${days.map(day => route.frequency === 'weekly' ? v(weekdayKeys[day - 1]) : `${day}${v('daySuffix')}`).join(' / ')}`
}
function Person({ id }: { id: string }) {
  const person = visitStaff.find(item => item.id === id)!
  return <span className="visit-person"><span className="visit-person-avatar">{person.initials}</span><span>{person.name}</span></span>
}
function RouteStatus({ route }: { route: VisitRoute }) {
  const v = useVisitText()
  return <span className={cn('visit-status', route.status === 'enabled' ? 'is-enabled' : 'is-paused')}><i />{v(route.status)}</span>
}

function RouteEditor({ route, nextId, onClose, onSave }: { route: VisitRoute | null; nextId: string; onClose: () => void; onSave: (route: VisitRoute, allocate: boolean) => void }) {
  const { t } = usePreferences()
  const v = useVisitText()
  const [form, setForm] = useState<VisitRoute>(route ? structuredClone(route) : { id: nextId, name: '', executorId: '', ownerId: 'EMP-001', region: 'manila', visitType: 'routine', frequency: 'weekly', days: [1], policy: 'shared', status: 'enabled', outletIds: [] })
  const [allocate, setAllocate] = useState(!route)
  const [error, setError] = useState(false)
  const update = <K extends keyof VisitRoute,>(key: K, value: VisitRoute[K]) => setForm(previous => ({ ...previous, [key]: value }))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.executorId || !form.ownerId || !form.days.length) { setError(true); return }
    onSave({ ...form, name: form.name.trim(), days: [...form.days].sort((a, b) => a - b) }, allocate)
  }
  const eligibleStaff = visitStaff.filter(person => !route?.outletIds.length || person.region === route.region)
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="visit-editor" closeLabel={t('close')}><DialogHeader><div className="visit-dialog-symbol"><Route size={21} /></div><DialogTitle>{v(route ? 'editRoute' : 'newRoute')}</DialogTitle><DialogDescription>{v(route ? 'editHint' : 'createHint')}</DialogDescription></DialogHeader>
    <form className="visit-form" onSubmit={submit}>
      <div className="form-field"><Label htmlFor="visit-name">{v('routeName')} <span className="visit-required">*</span><span className="visit-field-hint">{form.name.length}/40</span></Label><Input id="visit-name" maxLength={40} value={form.name} onChange={event => update('name', event.target.value)} placeholder={v('namePlaceholder')} required autoFocus /></div>
      <div className="visit-form-columns"><div className="form-field"><Label htmlFor="visit-executor">{v('executor')} <span className="visit-required">*</span></Label><Select value={form.executorId} onValueChange={id => { const person = visitStaff.find(item => item.id === id)!; setForm(previous => ({ ...previous, executorId: id, region: person.region })) }}><SelectTrigger id="visit-executor"><SelectValue placeholder={v('selectExecutor')} /></SelectTrigger><SelectContent>{eligibleStaff.map(person => <SelectItem key={person.id} value={person.id}>{person.name} · {t(person.region)}</SelectItem>)}</SelectContent></Select></div><div className="form-field"><Label htmlFor="visit-owner">{v('routeOwner')} <span className="visit-required">*</span></Label><Select value={form.ownerId} onValueChange={id => update('ownerId', id)}><SelectTrigger id="visit-owner"><SelectValue placeholder={v('selectOwner')} /></SelectTrigger><SelectContent>{visitStaff.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="visit-form-columns"><div className="form-field"><Label htmlFor="visit-type">{v('visitType')}</Label><Select value={form.visitType} disabled={!form.executorId} onValueChange={type => update('visitType', type as VisitRoute['visitType'])}><SelectTrigger id="visit-type"><SelectValue placeholder={v('selectionRequired')} /></SelectTrigger><SelectContent>{(['routine', 'merchandising', 'collectionVisit'] as const).map(type => <SelectItem key={type} value={type}>{v(type)}</SelectItem>)}</SelectContent></Select></div><div className="form-field"><Label>{t('region')}</Label><div className="visit-readonly-field"><Globe2 size={14} />{form.executorId ? t(form.region) : '—'}</div></div></div>
      <fieldset className="visit-fieldset"><legend>{v('frequency')} <span className="visit-required">*</span></legend><div className="visit-frequency-buttons">{(['weekly', 'monthly'] as const).map(frequency => <button type="button" key={frequency} className={cn(form.frequency === frequency && 'selected')} aria-pressed={form.frequency === frequency} onClick={() => setForm(previous => ({ ...previous, frequency, days: [1] }))}><CalendarDays size={15} />{v(frequency)}{form.frequency === frequency && <Check size={14} />}</button>)}</div></fieldset>
      <fieldset className="visit-fieldset"><legend>{v('visitDays')} <span className="visit-required">*</span></legend><div className={cn('visit-day-grid', form.frequency === 'monthly' && 'monthly')}>{Array.from({ length: form.frequency === 'weekly' ? 7 : 31 }, (_, index) => index + 1).map(day => <button type="button" key={day} aria-pressed={form.days.includes(day)} className={cn(form.days.includes(day) && 'selected')} onClick={() => update('days', form.days.includes(day) ? form.days.filter(value => value !== day) : [...form.days, day])}>{form.frequency === 'weekly' ? v(weekdayKeys[day - 1]) : day}</button>)}</div><p className="visit-form-hint">{v(form.frequency === 'weekly' ? 'weekHint' : 'monthHint')}</p></fieldset>
      <fieldset className="visit-fieldset"><legend>{v('policy')}</legend><div className="visit-policy-options">{(['shared', 'exclusive'] as const).map(policy => <label key={policy} className={cn(form.policy === policy && 'selected')}><input type="radio" name="visit-policy" value={policy} checked={form.policy === policy} onChange={() => update('policy', policy)} /><span><strong>{v(policy)}</strong><small>{v(policy === 'shared' ? 'sharedHint' : 'exclusiveHint')}</small></span></label>)}</div></fieldset>
      {error && <p className="visit-inline-error" role="alert">{v('validation')}</p>}
      <div className="visit-editor-footer"><Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button><Button type="submit" onClick={() => setAllocate(false)}>{v('saveRoute')}</Button><Button type="submit" onClick={() => setAllocate(true)}>{v(route ? 'saveAndAssign' : 'createAndAssign')}<ArrowRight size={14} /></Button></div>
    </form>
  </DialogContent></Dialog>
}

function OutletAllocation({ route, routes, onSave, onExit }: { route: VisitRoute; routes: VisitRoute[]; onSave: (route: VisitRoute) => void; onExit: () => void }) {
  const { t } = usePreferences()
  const v = useVisitText()
  const [selectedIds, setSelectedIds] = useState<string[]>([...route.outletIds])
  const [policy, setPolicy] = useState(route.policy)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [allocation, setAllocation] = useState('all')
  const [channel, setChannel] = useState('all')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const assignedIds = new Set(routes.flatMap(item => item.outletIds))
  const blockedIds = new Set(routes.filter(item => item.id !== route.id && item.policy === 'exclusive').flatMap(item => item.outletIds))
  const visible = visitOutlets.filter(outlet => outlet.active && outlet.region === route.region
    && `${outlet.name} ${outlet.address} ${outlet.contact}`.toLowerCase().includes(query.toLowerCase().trim())
    && (scope === 'all' || outlet.salespersonId === scope) && (channel === 'all' || outlet.channel === channel)
    && (allocation === 'all' || (allocation === 'assigned' ? assignedIds.has(outlet.id) : !assignedIds.has(outlet.id))))
  const dirty = policy !== route.policy || [...selectedIds].sort().join(',') !== [...route.outletIds].sort().join(',')
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const toggle = useCallback((id: string) => {
    const blocked = routes.some(item => item.id !== route.id && item.policy === 'exclusive' && item.outletIds.includes(id))
    setSelectedIds(previous => {
      if (previous.includes(id)) return previous.filter(value => value !== id)
      if (policy === 'shared' && blocked) return previous
      return [...previous, id]
    })
    if (policy === 'shared' && blocked && !selectedIds.includes(id)) toast.info(v('lockedHint'))
  }, [routes, route.id, policy, selectedIds, v])
  const draft = { ...route, outletIds: selectedIds, policy }
  const conflicts = routeConflicts(routes, draft)
  const transferIds = new Set(conflicts.flatMap(item => item.outletIds.filter(id => selectedIds.includes(id))))
  const exit = () => { if (dirty) setDiscardOpen(true); else onExit() }
  const hasBlockingConflict = policy === 'shared' && conflicts.length > 0
  return <div className="visit-allocation page-enter">
    <div className="page-heading"><div><button className="visit-back-link" onClick={exit}><ArrowLeft size={13} />{v('backToRoutes')}</button><h1>{v('assignOutlets')}</h1><p>{route.name} <span className="visit-subtitle-divider">/</span> {visitStaff.find(person => person.id === route.executorId)!.name} <span className="visit-subtitle-divider">/</span> {scheduleLabel(route, v)}</p></div><div className="page-actions"><Button variant="outline" onClick={exit}>{v('exitAssignment')}</Button><Button onClick={() => onSave(draft)} disabled={hasBlockingConflict}><Save size={15} />{v('saveAssignment')}{dirty && <span className="visit-unsaved-dot" />}</Button></div></div>
    <div className="visit-allocation-toolbar"><div className="visit-assignment-filters"><span className="visit-filter-label"><ListFilter size={14} />{v('customerScope')}</span><Select value={scope} onValueChange={setScope}><SelectTrigger aria-label={v('customerScope')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{v('allSalespeople')}</SelectItem>{visitStaff.filter(person => person.region === route.region).map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select><Select value={allocation} onValueChange={setAllocation}><SelectTrigger aria-label={v('assignmentStatus')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{v('allOutlets')}</SelectItem><SelectItem value="unassigned">{v('unassigned')}</SelectItem><SelectItem value="assigned">{v('assigned')}</SelectItem></SelectContent></Select><Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label={v('channel')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{v('allChannels')}</SelectItem>{(['traditional', 'convenience', 'supermarket'] as const).map(type => <SelectItem key={type} value={type}>{t(type)}</SelectItem>)}</SelectContent></Select></div><div className="visit-map-legend"><span><i className="legend-unassigned" />{v('unassigned')}</span><span><i className="legend-assigned" />{v('assigned')}</span><span><i className="legend-selected" />{v('selected')}</span></div></div>
    <div className="visit-allocation-grid">
      <section className="visit-outlet-list"><div className="visit-panel-heading"><h2>{v('availableOutlets')} <span>{visible.length}</span></h2><span className="visit-region-chip"><MapPin size={11} />{t(route.region)}</span></div><div className="visit-outlet-search"><Search size={15} /><Input aria-label={v('outletSearch')} placeholder={v('outletSearch')} value={query} onChange={event => setQuery(event.target.value)} /></div><div className="visit-select-results"><span>{v('activeOnly')}</span><button onClick={() => setSelectedIds(previous => [...new Set([...previous, ...visible.filter(outlet => policy === 'exclusive' || !blockedIds.has(outlet.id)).map(outlet => outlet.id)])])} disabled={!visible.length}>{v('selectVisible')}</button></div>
        <div className="visit-scroll-list">{visible.length ? visible.map(outlet => { const selected = selectedIds.includes(outlet.id); const other = routes.filter(item => item.id !== route.id && item.outletIds.includes(outlet.id)); const blocked = policy === 'shared' && blockedIds.has(outlet.id) && !selected; return <div key={outlet.id} className={cn('visit-outlet-card', selected && 'selected', blocked && 'is-locked')}><label><input type="checkbox" checked={selected} disabled={blocked} onChange={() => toggle(outlet.id)} /><span className="visit-outlet-info"><strong>{outlet.name}</strong><small>{outlet.address}</small><span>{t(outlet.channel)} <i>·</i> {outlet.contact}</span></span></label><div className="visit-outlet-card-bottom"><span className={cn('visit-allocation-badge', other.length || assignedIds.has(outlet.id) ? 'assigned' : '')} title={other.map(item => item.name).join(', ')}><i />{blocked ? v('exclusiveOutlet') : assignedIds.has(outlet.id) ? v('assigned') : v('unassigned')}</span><button aria-label={`${v('locate')} ${outlet.name}`} onClick={() => setFocusId(previous => previous === outlet.id ? null : outlet.id)}><LocateFixed size={14} /></button></div></div> }) : <div className="visit-compact-empty"><Search size={25} /><strong>{v('noAvailable')}</strong><p>{v('noAvailableHint')}</p><Button size="sm" variant="outline" onClick={() => { setQuery(''); setScope('all'); setAllocation('all'); setChannel('all') }}>{t('clearFilters')}</Button></div>}</div>
      </section>
      <VisitRouteMap outlets={visible} selectedIds={selectedIds} assignedIds={assignedIds} focusId={focusId} onToggle={toggle} />
      <section className="visit-selected-panel"><div className="visit-panel-heading"><h2>{v('selectedOutlets')} <span>{selectedIds.length}</span></h2><button className="visit-text-button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>{v('clearSelected')}</button></div><div className="visit-scroll-list">{selectedIds.length ? selectedIds.map((id, index) => { const outlet = visitOutlets.find(item => item.id === id)!; return <div className="visit-selected-item" key={id}><span className="visit-outlet-number">{index + 1}</span><span><strong>{outlet.name}</strong><small>{outlet.address}</small></span><button aria-label={`${v('removeOutlet')} ${outlet.name}`} onClick={() => setSelectedIds(previous => previous.filter(value => value !== id))}><X size={14} /></button></div> }) : <div className="visit-compact-empty"><span className="visit-empty-circle"><Store size={26} /></span><strong>{v('noSelected')}</strong><p>{v('selectHint')}</p></div>}</div><div className="visit-allocation-policy"><Label htmlFor="allocation-policy"><ShieldCheck size={14} />{v('policy')}</Label><Select value={policy} onValueChange={value => setPolicy(value as VisitRoute['policy'])}><SelectTrigger id="allocation-policy"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="shared">{v('shared')}</SelectItem><SelectItem value="exclusive">{v('exclusive')}</SelectItem></SelectContent></Select><p>{v(policy === 'shared' ? 'sharedSummary' : 'exclusiveSummary')}</p>{hasBlockingConflict && <p className="visit-inline-error" role="alert">{v('sharedBlocked')}</p>}{policy === 'exclusive' && transferIds.size > 0 && <div className="visit-transfer-note"><Info size={14} /><span>{v('transferCount')} <strong>{transferIds.size}</strong></span></div>}{!selectedIds.length && dirty && <p>{v('zeroSelection')}</p>}</div></section>
    </div>
    <p className="visit-local-note"><ShieldCheck size={13} />{v('savedLocally')}<span>·</span>{v('planningOnly')}</p>
    <Dialog open={discardOpen} onOpenChange={setDiscardOpen}><DialogContent closeLabel={t('close')}><DialogHeader><DialogTitle>{v('discardTitle')}</DialogTitle><DialogDescription>{v('discardHint')}</DialogDescription></DialogHeader><div className="form-actions"><Button variant="outline" onClick={() => setDiscardOpen(false)}>{v('continueEditing')}</Button><Button onClick={onExit}>{v('discard')}</Button></div></DialogContent></Dialog>
  </div>
}

export function VisitRoutesPage({ region, setRegion }: { region: string; setRegion: (region: string) => void }) {
  const { t, locale } = usePreferences()
  const v = useVisitText()
  const [routes, setRoutes] = useState<VisitRoute[]>(readVisitRoutes)
  const currentRoutes = useRef(routes)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [executor, setExecutor] = useState('all')
  const [frequency, setFrequency] = useState('all')
  const [editor, setEditor] = useState<VisitRoute | 'new' | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ route: VisitRoute; allocate: boolean } | null>(null)
  const regional = routes.filter(route => region === 'all' || route.region === region)
  const filtered = regional.filter(route => `${route.name} ${route.id} ${visitStaff.find(person => person.id === route.executorId)!.name}`.toLowerCase().includes(query.toLowerCase().trim()) && (status === 'all' || route.status === status) && (executor === 'all' || route.executorId === executor) && (frequency === 'all' || route.frequency === frequency))
  const activeOutlets = visitOutlets.filter(outlet => outlet.active && (region === 'all' || outlet.region === region))
  const assignedIds = new Set(regional.flatMap(route => route.outletIds))
  const detail = routes.find(route => route.id === detailId)
  const assignment = routes.find(route => route.id === assigningId)
  const deleteTarget = routes.find(route => route.id === deleteId)
  const persist = (next: VisitRoute[]) => {
    let saved = true
    try { localStorage.setItem(routeStorageKey, JSON.stringify(next)) } catch { saved = false; toast.warning(v('storageWarning')) }
    currentRoutes.current = next
    setRoutes(next)
    return saved
  }
  const commit = (route: VisitRoute, allocate: boolean) => {
    const isAssignment = !!assigningId
    const saved = persist(applyRouteChange(currentRoutes.current, route))
    setEditor(null); setPending(null); setDetailId(null)
    setAssigningId(allocate ? route.id : null)
    if (region !== 'all' && region !== route.region) setRegion(route.region)
    setQuery(''); setStatus('all'); setExecutor('all'); setFrequency('all')
    if (saved) toast.success(v(isAssignment ? 'assignmentSaved' : 'routeSaved'))
  }
  const requestSave = (route: VisitRoute, allocate = false) => {
    if (currentRoutes.current.some(other => other.id !== route.id && other.executorId === route.executorId && other.name.toLocaleLowerCase() === route.name.toLocaleLowerCase())) { toast.error(v('duplicateName')); return }
    const conflicts = routeConflicts(currentRoutes.current, route)
    if (conflicts.length && route.policy === 'shared') { toast.error(v('sharedBlocked')); return }
    if (conflicts.length) { setPending({ route, allocate }); return }
    commit(route, allocate)
  }
  const resetFilters = () => { setQuery(''); setStatus('all'); setExecutor('all'); setFrequency('all') }
  const doExport = () => {
    if (!filtered.length) { toast.info(t('exportEmpty')); return }
    exportCsv([v('routeCode'), v('routeName'), v('executor'), v('routeOwner'), t('region'), v('visitType'), v('frequency'), v('outletCount'), v('policy'), t('status')], filtered.map(route => [route.id, route.name, visitStaff.find(person => person.id === route.executorId)!.name, visitStaff.find(person => person.id === route.ownerId)!.name, t(route.region), v(route.visitType), scheduleLabel(route, v), route.outletIds.length, v(route.policy), v(route.status)]), `${v('exportFilename')}.csv`)
    toast.success(t('exportDone'))
  }
  const remove = () => {
    if (!deleteTarget) return
    const removed = structuredClone(deleteTarget)
    persist(currentRoutes.current.filter(route => route.id !== removed.id)); setDeleteId(null)
    toast.success(v('routeDeleted'), { action: { label: v('undo'), onClick: () => {
      const restored = { ...removed, id: currentRoutes.current.some(route => route.id === removed.id) ? nextRouteId(currentRoutes.current) : removed.id }
      if (routeConflicts(currentRoutes.current, restored).length) { toast.error(v('sharedBlocked')); return }
      persist([...currentRoutes.current, restored]); toast.success(v('restored'))
    } } })
  }
  const stats = [
    { key: 'totalRoutes', value: regional.length, hint: 'filterHint', icon: Route },
    { key: 'enabledRoutes', value: regional.filter(route => route.status === 'enabled').length, hint: 'enabledHint', icon: CalendarDays },
    { key: 'coveredOutlets', value: assignedIds.size, hint: 'coverageHint', icon: Store },
    { key: 'unassignedOutlets', value: activeOutlets.filter(outlet => !assignedIds.has(outlet.id)).length, hint: 'unassignedHint', icon: MapPinned },
  ] as const

  return <div className="visit-routes-page">
    {assignment ? <OutletAllocation key={assignment.id} route={assignment} routes={routes} onSave={route => requestSave(route)} onExit={() => setAssigningId(null)} /> : <div className="page-enter">
      <div className="page-heading"><div><h1>{v('visitRoutes')}</h1><p>{v('description')}</p></div><div className="page-actions"><Select value={region} onValueChange={setRegion}><SelectTrigger className="region-select" aria-label={t('region')}><Globe2 size={15} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('allRegions')}</SelectItem>{regions.map(item => <SelectItem key={item} value={item}>{t(item)}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={doExport}><ArrowDownToLine size={15} />{t('export')}</Button><Button onClick={() => setEditor('new')}><Plus size={16} />{v('newRoute')}</Button></div></div>
      <div className="visit-stats-grid">{stats.map(({ key, value, hint, icon: Icon }) => <Card key={key} className="visit-stat"><div><span>{v(key)}</span><strong>{value}<small>{key === 'totalRoutes' || key === 'enabledRoutes' ? '' : v('outletsUnit')}</small></strong><p>{v(hint)}</p></div><span className={cn('visit-stat-icon', key === 'unassignedOutlets' && value > 0 && 'is-attention')}><Icon size={20} strokeWidth={1.6} /></span></Card>)}</div>
      <Card className="list-card visit-routes-card"><div className="visit-card-top"><div className="list-heading"><h2>{v('listTitle')}</h2><span className="record-count">{regional.length}</span></div><span className="visit-saved-label"><CheckCheck size={13} />{v('savedLocally')}</span></div><div className="visit-list-filters"><div className="visit-route-tabs" role="group" aria-label={t('status')}>{(['all', 'enabled', 'paused'] as const).map(tab => <button key={tab} className={cn(status === tab && 'selected')} aria-pressed={status === tab} onClick={() => setStatus(tab)}>{v(tab)}<span>{tab === 'all' ? regional.length : regional.filter(route => route.status === tab).length}</span></button>)}</div><div className="visit-route-tools"><div className="list-search visit-route-search"><Search size={14} /><Input aria-label={v('routeSearch')} placeholder={v('routeSearch')} value={query} onChange={event => setQuery(event.target.value)} /></div><Select value={executor} onValueChange={setExecutor}><SelectTrigger aria-label={v('executor')}><Users size={13} /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{v('allExecutors')}</SelectItem>{visitStaff.map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select><Select value={frequency} onValueChange={setFrequency}><SelectTrigger aria-label={v('frequency')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{v('allFrequencies')}</SelectItem><SelectItem value="weekly">{v('weekly')}</SelectItem><SelectItem value="monthly">{v('monthly')}</SelectItem></SelectContent></Select></div></div>
        {filtered.length ? <Table className="data-table visit-route-table"><TableHeader><TableRow><TableHead>{v('routeName')}</TableHead><TableHead>{v('executor')}</TableHead><TableHead>{v('frequency')}</TableHead><TableHead>{v('outletCount')}</TableHead><TableHead>{v('routeOwner')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('action')}</TableHead></TableRow></TableHeader><TableBody>{filtered.map(route => <TableRow key={route.id}><TableCell><div className="visit-route-name-cell"><span className="visit-route-symbol"><Route size={18} /></span><div><button onClick={() => setDetailId(route.id)}>{route.name}</button><small>{route.id}<span>·</span>{t(route.region)}</small></div></div></TableCell><TableCell><Person id={route.executorId} /><span className="visit-cell-secondary">{v(route.visitType)}</span></TableCell><TableCell><span className="visit-schedule"><CalendarDays size={13} />{v(route.frequency)}</span><span className="visit-cell-secondary">{route.days.slice().sort((a, b) => a - b).map(day => route.frequency === 'weekly' ? v(weekdayKeys[day - 1]) : `${day}${v('daySuffix')}`).join(' / ')}</span></TableCell><TableCell><button className={cn('visit-outlet-count', !route.outletIds.length && 'is-empty')} onClick={() => setAssigningId(route.id)}><Store size={13} />{route.outletIds.length ? `${route.outletIds.length} ${v('outletsUnit')}` : v('noOutlets')}<ChevronRight size={12} /></button><span className="visit-cell-secondary">{v(route.policy)}</span></TableCell><TableCell className="secondary-cell">{visitStaff.find(person => person.id === route.ownerId)!.name}</TableCell><TableCell><RouteStatus route={route} /></TableCell><TableCell><div className="visit-row-actions"><Button variant="outline" size="sm" onClick={() => setAssigningId(route.id)}><MapPin size={13} />{v('assignOutlets')}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`${v('actions')} ${route.name}`}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setDetailId(route.id)}><Info size={14} />{v('routeDetails')}</DropdownMenuItem><DropdownMenuItem onClick={() => setEditor(route)}><Pencil size={14} />{v('edit')}</DropdownMenuItem><DropdownMenuItem onClick={() => { const next = { ...route, status: route.status === 'enabled' ? 'paused' : 'enabled' } as VisitRoute; const saved = persist(routes.map(item => item.id === route.id ? next : item)); if (saved) toast.success(v(next.status === 'enabled' ? 'routeEnabled' : 'routePaused')) }}>{route.status === 'enabled' ? <CirclePause size={14} /> : <Play size={14} />}{v(route.status === 'enabled' ? 'pause' : 'enable')}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="visit-delete-action" onClick={() => setDeleteId(route.id)}><Trash2 size={14} />{v('delete')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>)}</TableBody></Table> : <div className="empty-state"><span className="empty-icon"><Route size={24} /></span><h3>{v('noRoutesTitle')}</h3><p>{v('noRoutesHint')}</p><Button variant="outline" size="sm" onClick={resetFilters}>{t('clearFilters')}</Button></div>}
        <div className="table-footer"><span>{t('showing')} <strong>{filtered.length}</strong> {t('records')}</span><span className="sample-label">{t('demoData')}</span></div>
      </Card>
      <div className="visit-workflow-note"><span className="visit-workflow-icon"><Route size={19} /></span><div><strong>{v('stepPlan')}<ChevronRight size={12} />{v('stepAssign')}<ChevronRight size={12} />{v('stepSave')}</strong><p>{v('planningOnly')}</p></div><ShieldCheck size={19} /></div>
    </div>}
    {editor && <RouteEditor key={typeof editor === 'string' ? editor : editor.id} route={editor === 'new' ? null : editor} nextId={nextRouteId(routes)} onClose={() => setEditor(null)} onSave={requestSave} />}
    <Dialog open={!!detail} onOpenChange={open => !open && setDetailId(null)}><DialogContent className="visit-detail-dialog" closeLabel={t('close')}><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{v('routeDetails')} · {detail?.id}</DialogDescription></DialogHeader>{detail && <><div className="visit-detail-status"><RouteStatus route={detail} /><span>{t(detail.region)}</span></div><dl className="detail-grid"><div><dt>{v('executor')}</dt><dd><Person id={detail.executorId} /></dd></div><div><dt>{v('routeOwner')}</dt><dd>{visitStaff.find(person => person.id === detail.ownerId)!.name}</dd></div><div><dt>{v('frequency')}</dt><dd>{scheduleLabel(detail, v)}</dd></div><div><dt>{v('visitType')}</dt><dd>{v(detail.visitType)}</dd></div><div className="visit-detail-wide"><dt>{v('policy')}</dt><dd>{v(detail.policy)}</dd></div></dl><div className="visit-detail-outlets"><h3>{v('assignedStores')} <span>{detail.outletIds.length}</span></h3>{detail.outletIds.length ? detail.outletIds.map(id => { const outlet = visitOutlets.find(item => item.id === id)!; return <div key={id}><Store size={14} /><span><strong>{outlet.name}</strong><small>{outlet.address}</small></span></div> }) : <p>{v('noAssignedHint')}</p>}</div><div className="form-actions"><Button variant="outline" onClick={() => { setDetailId(null); setEditor(detail) }}><Pencil size={14} />{v('editRoute')}</Button><Button onClick={() => { setDetailId(null); setAssigningId(detail.id) }}><MapPin size={14} />{v('assignOutlets')}</Button></div></>}</DialogContent></Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteId(null)}><DialogContent closeLabel={t('close')}><DialogHeader><DialogTitle>{v('deleteTitle')}</DialogTitle><DialogDescription>{v('deleteHint')}</DialogDescription></DialogHeader><div className="dialog-note">{deleteTarget?.name}</div><div className="form-actions"><Button variant="outline" onClick={() => setDeleteId(null)}>{t('cancel')}</Button><Button variant="destructive" onClick={remove}>{v('delete')}</Button></div></DialogContent></Dialog>
    <Dialog open={!!pending} onOpenChange={open => !open && setPending(null)}><DialogContent className="visit-transfer-dialog" closeLabel={t('close')}><DialogHeader><DialogTitle>{v('conflictTitle')}</DialogTitle><DialogDescription>{v('conflictHint')}</DialogDescription></DialogHeader><div className="visit-transfer-list">{pending && routeConflicts(routes, pending.route).map(route => <div key={route.id}><strong>{route.name}</strong>{route.outletIds.filter(id => pending.route.outletIds.includes(id)).map(id => <span key={id}><Store size={12} />{visitOutlets.find(outlet => outlet.id === id)!.name}</span>)}</div>)}</div><div className="form-actions"><Button variant="outline" onClick={() => setPending(null)}>{t('cancel')}</Button><Button onClick={() => pending && commit(pending.route, pending.allocate)}>{v('confirmTransfer')}</Button></div></DialogContent></Dialog>
    <span className="sr-only">{locale === 'zh' ? '拜访路线管理' : 'Visit route management'}</span>
  </div>
}

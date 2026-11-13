import { useId, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import '@/styles/detail-drawer.css'

type Navigation = { previous?: () => void; next?: () => void; position: number; total: number }
export function DetailDrawer({ open, onClose, title, description, badge, actions, navigation, children, footer, className, bodyRef }: {
  open: boolean; onClose: () => void; title: ReactNode; description: string; badge: string; actions?: ReactNode
  navigation?: Navigation; children: ReactNode; footer?: ReactNode; className?: string; bodyRef?: Ref<HTMLDivElement>
}) {
  const [expanded, setExpanded] = useState(false), opener = useRef<HTMLElement | null>(null)
  return <DialogPrimitive.Root open={open} onOpenChange={value => !value && onClose()}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="detail-drawer-overlay" />
      <DialogPrimitive.Content data-slot="detail-drawer" data-expanded={expanded} className={cn('detail-drawer', className)} onOpenAutoFocus={() => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setExpanded(false)
      }} onCloseAutoFocus={event => {
        event.preventDefault()
        if (opener.current?.isConnected && [...document.querySelectorAll('[role="dialog"][data-state="open"]')].every(dialog => dialog.contains(opener.current))) opener.current.focus({ preventScroll: true })
      }}>
        <header className="detail-drawer-header">
          <div className="detail-drawer-heading"><span className="detail-drawer-badge">{badge}</span><div><DialogPrimitive.Title className="detail-drawer-title">{title}</DialogPrimitive.Title><DialogPrimitive.Description className="detail-drawer-description">{description}</DialogPrimitive.Description></div></div>
          <div className="detail-drawer-tools">{navigation && <div className="detail-drawer-navigation"><span>{navigation.position} / {navigation.total}</span><Button variant="ghost" size="icon-sm" aria-label="上一条" title="上一条" disabled={!navigation.previous} onClick={navigation.previous}><ChevronLeft size={16} /></Button><Button variant="ghost" size="icon-sm" aria-label="下一条" title="下一条" disabled={!navigation.next} onClick={navigation.next}><ChevronRight size={16} /></Button></div>}{actions}<Button variant="ghost" size="icon-sm" className="detail-drawer-expand" aria-label={expanded ? '还原详情宽度' : '放大详情'} title={expanded ? '还原详情宽度' : '放大详情'} aria-pressed={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</Button><DialogPrimitive.Close asChild><Button variant="ghost" size="icon-sm" aria-label="关闭详情" title="关闭详情（Esc）"><X size={18} /></Button></DialogPrimitive.Close></div>
        </header>
        <div className="detail-drawer-body" ref={bodyRef}>{children}</div>
        {footer && <footer className="detail-drawer-footer">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
export function DetailSection({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={cn('detail-drawer-card', className)}>{title && <h3 className="detail-section-title">{title}</h3>}{children}</section>
}
export function DetailFields({ values, summary = false }: { values: [string, ReactNode][]; summary?: boolean }) {
  return <dl className={summary ? 'detail-summary-fields' : 'detail-field-grid'}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
}
export function DetailMetrics({ items }: { items: { label: string; value: ReactNode; tone?: 'primary' | 'warm' | 'blue' | 'purple' }[] }) {
  return <DetailSection title="单据摘要"><div className="detail-metric-grid">{items.map(item => <div className={`detail-metric tone-${item.tone ?? 'primary'}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></DetailSection>
}
export function DetailTabs({ tabs, value, onChange }: { tabs: { id: string; label: string; content: ReactNode }[]; value: string; onChange: (id: string) => void }) {
  const prefix = useId(), selected = tabs.find(tab => tab.id === value) ?? tabs[0]
  return <section className="detail-drawer-card detail-tab-card"><div className="detail-tab-list" role="tablist" aria-label="详情内容">{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${prefix}-tab-${tab.id}`} aria-controls={`${prefix}-panel-${tab.id}`} aria-selected={selected.id === tab.id} tabIndex={selected.id === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={event => {
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (target < 0) return
    event.preventDefault(); onChange(tabs[target].id); document.getElementById(`${prefix}-tab-${tabs[target].id}`)?.focus()
  }}>{tab.label}</button>)}</div><div className="detail-tab-panel" key={selected.id} role="tabpanel" id={`${prefix}-panel-${selected.id}`} aria-labelledby={`${prefix}-tab-${selected.id}`} tabIndex={0}>{selected.content}</div></section>
}

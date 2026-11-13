import type { ReactNode } from 'react'

// Shared compact header and query layout for management lists.
export function ManagementHeader({ title, context, actions }: { title: ReactNode; context?: ReactNode; actions?: ReactNode }) {
  return <header className="management-header"><div className="management-heading"><h1>{title}</h1>{context && <div className="management-context">{context}</div>}</div>{actions && <div className="management-actions">{actions}</div>}</header>
}
export function ManagementFilters({ children, actions, label = '筛选条件' }: { children: ReactNode; actions?: ReactNode; label?: string }) {
  return <div className="management-filters" aria-label={label}><div className="management-filter-fields">{children}</div>{actions && <div className="management-filter-actions">{actions}</div>}</div>
}
export function ManagementSummary({ items, trailing }: { items: { label: string; value: ReactNode }[]; trailing?: ReactNode }) {
  return <div className="management-summary"><dl>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>{trailing && <span className="management-summary-trailing">{trailing}</span>}</div>
}

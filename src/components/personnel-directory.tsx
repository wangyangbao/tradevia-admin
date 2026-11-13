import { useEffect, useState } from 'react'
import { Building2, ChevronDown, ChevronRight, FolderTree, Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { descendants } from '@/lib/organization'
import type { Department, Person, Unit } from '@/lib/organization'

type Selection = { kind: 'unit' | 'department'; id: string }
type DirectoryNode = Selection & { key: string; name: string; count: number; children: DirectoryNode[] }
type Props = {
  root: Unit
  units: Unit[]
  departments: Department[]
  people: Person[]
  selected: Selection | null
  onSelect: (selection: Selection | null) => void
  storageKey: string
}

export function PersonnelDirectory({ root, units, departments, people, selected, onSelect, storageKey }: Props) {
  const activePeople = people.filter(p => p.active)
  const departmentNode = (department: Department): DirectoryNode => {
    const ids = descendants(departments, department.id)
    return { kind: 'department', id: department.id, key: `department:${department.id}`, name: department.name,
      count: activePeople.filter(p => ids.has(p.departmentId)).length,
      children: departments.filter(d => d.parentId === department.id).map(departmentNode) }
  }
  const unitNode = (unit: Unit): DirectoryNode => {
    const ids = descendants(units, unit.id)
    return { kind: 'unit', id: unit.id, key: `unit:${unit.id}`, name: unit.name,
      count: activePeople.filter(p => ids.has(p.unitId)).length,
      children: [...departments.filter(d => d.unitId === unit.id && !d.parentId).map(departmentNode), ...units.filter(u => u.parentId === unit.id).map(unitNode)] }
  }
  const tree = unitNode(root)
  const branchKeys: string[] = []
  const selectedPath: string[] = []
  const collect = (node: DirectoryNode, path: string[]) => {
    if (node.children.length) branchKeys.push(node.key)
    if (selected?.kind === node.kind && selected.id === node.id) selectedPath.push(...path)
    node.children.forEach(child => collect(child, [...path, node.key]))
  }
  collect(tree, [])
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    let initial = [tree.key]
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (Array.isArray(stored)) initial = stored.filter(key => branchKeys.includes(key))
    } catch { /* Use the initial root expansion when storage is unavailable. */ }
    return new Set([...initial, ...selectedPath])
  })
  const [search, setSearch] = useState({ query: '', collapsed: new Set<string>() })
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify([...expanded])) } catch { /* Folding still works without browser storage. */ }
  }, [expanded, storageKey])

  const keyword = search.query.trim().toLocaleLowerCase()
  const filterNode = (node: DirectoryNode): DirectoryNode | null => {
    if (!keyword || node.name.toLocaleLowerCase().includes(keyword)) return node
    const children = node.children.map(filterNode).filter((child): child is DirectoryNode => !!child)
    return children.length ? { ...node, children } : null
  }
  const filteredTree = filterNode(tree)
  const isExpanded = (key: string) => keyword ? !search.collapsed.has(key) : expanded.has(key)
  const toggle = (key: string) => {
    if (keyword) {
      setSearch(previous => {
        const collapsed = new Set(previous.collapsed)
        if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key)
        return { ...previous, collapsed }
      })
    } else {
      setExpanded(previous => {
        const next = new Set(previous)
        if (next.has(key)) next.delete(key); else next.add(key)
        return next
      })
    }
  }
  const expandAll = (open: boolean) => {
    if (keyword) setSearch(previous => ({ ...previous, collapsed: new Set(open ? [] : branchKeys) }))
    else setExpanded(new Set(open ? branchKeys : []))
  }
  const renderNode = (node: DirectoryNode, depth: number) => {
    const open = isExpanded(node.key)
    const isSelected = selected?.kind === node.kind && selected.id === node.id
    const Icon = node.kind === 'unit' ? Building2 : FolderTree
    return <li key={node.key}>
      <div className={`org-directory-row ${node.kind === 'unit' ? 'org-directory-unit' : ''} ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 12 }}>
        {node.children.length ? <button type="button" className="org-tree-toggle" aria-label={`${open ? '收起' : '展开'}${node.name}`} aria-expanded={open} aria-controls={`directory-children-${node.key}`} onClick={() => toggle(node.key)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="org-tree-toggle-space" />}
        <button type="button" className="org-directory-select" aria-label={`查看${node.name}人员`} aria-pressed={isSelected} title={node.name} onClick={() => onSelect({ kind: node.kind, id: node.id })}><Icon size={14} /><span>{node.name}</span><small>{node.count}</small></button>
      </div>
      {!!node.children.length && open && <ul id={`directory-children-${node.key}`}>{node.children.map(child => renderNode(child, depth + 1))}</ul>}
    </li>
  }
  return <aside className="org-directory">
    <div className="org-directory-title"><strong>组织与部门</strong><span>{activePeople.length} 人在职</span></div>
    <div className="org-tree-search"><Search size={14} /><Input aria-label="搜索组织或部门" placeholder="查找组织、部门" value={search.query} onChange={event => setSearch({ query: event.target.value, collapsed: new Set() })} /></div>
    <div className="org-directory-tools"><span>{keyword ? '已展开匹配路径' : '点击箭头展开或收起'}</span><button type="button" onClick={() => expandAll(true)}>全部展开</button><i /><button type="button" onClick={() => expandAll(false)}>全部收起</button></div>
    <button type="button" className={`org-tree-node org-tree-all ${!selected ? 'selected' : ''}`} aria-pressed={!selected} onClick={() => onSelect(null)}><Users size={15} /><span>全部人员</span><small>{people.length}</small></button>
    <nav className="org-tree-scroll" aria-label="组织与部门目录">{filteredTree ? <ul className="org-directory-tree">{renderNode(filteredTree, 0)}</ul> : <p className="org-directory-empty" role="status">没有找到匹配的组织或部门</p>}</nav>
    <p className="org-tree-foot">点击名称筛选人员，包含下级部门</p>
  </aside>
}

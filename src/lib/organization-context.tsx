import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth-context'
import { authStorageKeys, registerAccount, resetManagedPassword, updateManagedAccount } from './auth'
import { actorEmail, assertWrite, deleteRecord, getScope, membershipsFor, organizationStorageKey, readOrganization, saveDepartment, savePerson, saveUnit, scopedData, toggleRecord } from './organization'
import type { Department, OrgState, Person, Unit } from './organization'

function useOrganizationValue() {
  const { user } = useAuth()
  const [state, setState] = useState<OrgState>(readOrganization)
  const [chosenTenant, setChosenTenant] = useState(() => sessionStorage.getItem(`tradevia-tenant-${user?.id}`) ?? '')
  const memberships = user ? membershipsFor(state, user) : []
  const tenantId = memberships.find(m => m.tenantId === chosenTenant)?.tenantId ?? memberships[0]?.tenantId ?? ''
  const scope = user ? getScope(state, user, tenantId) : null
  const data = scopedData(state, scope)
  useEffect(() => {
    const sync = () => { try { setState(readOrganization()) } catch { /* Keep last valid data; writes will reject corrupt storage. */ } }
    window.addEventListener('storage', sync); window.addEventListener('focus', sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync) }
  }, [])
  const switchTenant = (id: string) => {
    if (!memberships.some(m => m.tenantId === id)) throw new Error('你没有该租户的访问权限。')
    sessionStorage.setItem(`tradevia-tenant-${user?.id}`, id); setChosenTenant(id)
  }
  const commit = async (action: string, unitId: string, operation: (latest: OrgState, current: NonNullable<typeof scope>) => OrgState, accountOperation?: () => Promise<unknown> | void) => {
    if (!user) throw new Error('请先登录。')
    const latest = readOrganization(), current = getScope(latest, user, tenantId)
    if (!current) throw new Error('当前租户权限已失效，请刷新页面。')
    assertWrite(latest, current, unitId)
    const next = operation(latest, current)
    const previousAccounts = localStorage.getItem(authStorageKeys.accounts)
    try {
      await accountOperation?.()
      next.logs = [...next.logs, { id: crypto.randomUUID(), tenantId, unitId, actor: actorEmail(user), action, at: new Date().toISOString() }]
      localStorage.setItem(organizationStorageKey, JSON.stringify(next))
    } catch (error) {
      if (previousAccounts) localStorage.setItem(authStorageKeys.accounts, previousAccounts)
      else localStorage.removeItem(authStorageKeys.accounts)
      throw error
    }
    setState(next); window.dispatchEvent(new Event('tradevia-auth-change'))
  }
  return { state, ...data, tenantId, scope, memberships, switchTenant,
    saveUnit: (row: Unit) => commit(`${state.units.some(u => u.id === row.id) ? '编辑' : '新增'}业务单元：${row.name}`, state.units.some(u => u.id === row.id) ? row.id : row.parentId!, (s, sc) => saveUnit(s, sc, row)),
    saveDepartment: (row: Department) => commit(`保存部门：${row.name}`, row.unitId, (s, sc) => saveDepartment(s, sc, row)),
    savePerson: (row: Person, password: string) => {
      const old = state.people.find(p => p.id === row.id)
      return commit(`保存人员及登录账号：${row.name}`, old?.unitId ?? row.unitId, (s, sc) => savePerson(s, sc, row), async () => {
        if (!old) {
          await registerAccount({ name: row.name, email: row.email, password })
          updateManagedAccount(row.email, { phone: row.phone, enabled: row.active })
          await resetManagedPassword(row.email, password, true)
        } else {
          if (row.email !== old.email && state.people.some(p => p.email === old.email && p.tenantId !== row.tenantId)) throw new Error('该账号加入了多个租户，暂不支持在单一租户中修改其登录邮箱。')
          updateManagedAccount(old.email, { name: row.name, email: row.email, phone: row.phone })
        }
      })
    },
    toggle: (kind: 'units' | 'departments' | 'people', id: string, reason: string) => {
      const row = state[kind].find(r => r.id === id)!
      return commit(`${row.active ? '停用' : '启用'}：${row.name}${reason ? `；原因：${reason}` : ''}`, kind === 'units' ? id : (row as Person | Department).unitId, (s, sc) => toggleRecord(s, sc, kind, id, reason), kind === 'people' ? () => updateManagedAccount((row as Person).email, { enabled: !row.active }) : undefined)
    },
    remove: (kind: 'units' | 'departments', id: string, reason: string) => {
      const row = state[kind].find(r => r.id === id)!
      return commit(`删除：${row.name}；原因：${reason}`, kind === 'units' ? (row as Unit).parentId ?? id : (row as Department).unitId, (s, sc) => deleteRecord(s, sc, kind, id, reason))
    },
    resetPassword: (person: Person) => {
      if (person.email === scope?.email) return Promise.reject(new Error('请通过账号信息修改自己的密码。'))
      const password = `Tmp${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}9`
      return commit(`重置人员密码：${person.name}`, person.unitId, s => s, () => resetManagedPassword(person.email, password)).then(() => password)
    },
    logExport: (name: string) => {
      if (!scope) return Promise.reject(new Error('没有导出权限。'))
      return commit(`导出：${name}`, scope.unitId, s => s)
    },
  }
}
type OrganizationValue = ReturnType<typeof useOrganizationValue>
const OrganizationContext = createContext<OrganizationValue | null>(null)
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const value = useOrganizationValue()
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}
// oxlint-disable-next-line react/only-export-components
export function useOrganization() {
  const value = useContext(OrganizationContext)
  if (!value) throw new Error('OrganizationProvider is required')
  return value
}

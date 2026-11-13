import { accountExists, registerAccount, updateManagedAccount } from './auth'
import { readOrganization } from './organization'

let preparing: Promise<void> | null = null
export function prepareOrganizationAccounts() {
  if (preparing) return preparing
  preparing = (async () => {
    for (const person of readOrganization().people) {
      // Never recreate removed/renamed accounts for existing organization records.
      if (accountExists(person.email)) continue
      const marker = `tradevia-provisioned-${person.id}`
      if (localStorage.getItem(marker)) continue
      await registerAccount({ name: person.name, email: person.email, password: 'Demo123456' })
      updateManagedAccount(person.email, { phone: person.phone, enabled: person.active })
      localStorage.setItem(marker, '1')
    }
  })().finally(() => { preparing = null })
  return preparing
}

// Let an active full-page editor retain unsaved input before navigating.
export function navigateWorkspace(hash: string) {
  const event = new CustomEvent('tradevia-navigation-request', { cancelable: true, detail: { hash } })
  if (!window.dispatchEvent(event)) return false
  location.hash = hash
  return true
}

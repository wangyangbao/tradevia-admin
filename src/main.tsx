import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PreferenceProvider } from './lib/preferences.tsx'
import { AuthProvider } from './lib/auth-context.tsx'
import './styles/workspace.css'
import './styles/management.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferenceProvider><AuthProvider><App /></AuthProvider></PreferenceProvider>
  </StrictMode>,
)

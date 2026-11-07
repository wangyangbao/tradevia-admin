import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PreferenceProvider } from './lib/preferences.tsx'
import './styles/workspace.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferenceProvider><App /></PreferenceProvider>
  </StrictMode>,
)

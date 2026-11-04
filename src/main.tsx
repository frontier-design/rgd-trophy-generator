import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root'
import './styles/global.css'
import { SettingsProvider } from './state'

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

createRoot(root).render(
  <StrictMode>
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  </StrictMode>,
)

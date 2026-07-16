import './assets/main.css'
// Bootstrap Monaco BEFORE React renders – must be first non-CSS import
import './views/utils/monacoSetup'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

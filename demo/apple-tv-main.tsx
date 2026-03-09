import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppleTVApp } from './AppleTVApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppleTVApp />
  </StrictMode>,
)

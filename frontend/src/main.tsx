import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/* =========================================================================
   THEME ENFORCEMENT: STRICT LIGHT MODE
   Dark mode is deactivated by user requirement.
   This ensures html never retains the 'dark' class and localStorage is set to 'light'.
   ========================================================================= */
document.documentElement.classList.remove('dark')
localStorage.setItem('theme', 'light')

// Guard against external or cached attempts to add the 'dark' class
const themeGuard = new MutationObserver(() => {
  if (document.documentElement.classList.contains('dark')) {
    document.documentElement.classList.remove('dark')
  }
})
themeGuard.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


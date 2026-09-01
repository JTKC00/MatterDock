import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import { GlobalSearchDialog } from '@/features/search/GlobalSearchDialog'
import { useAppActions } from '../AppContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { openNewMatter } = useAppActions()
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openNewMatter()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNewMatter])

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <div className="app-shell">
      <Sidebar />
      <main ref={mainRef} className="main" tabIndex={-1}>
        <Outlet />
      </main>
      <NewMatterDialog />
      {searchOpen ? <GlobalSearchDialog open onClose={() => setSearchOpen(false)} /> : null}
    </div>
  )
}

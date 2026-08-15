import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import { GlobalSearchDialog } from '@/features/search/GlobalSearchDialog'
import { useAppActions } from '../AppContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { openNewMatter } = useAppActions()
  const [searchOpen, setSearchOpen] = useState(false)

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

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
      <NewMatterDialog />
      {searchOpen ? <GlobalSearchDialog open onClose={() => setSearchOpen(false)} /> : null}
    </div>
  )
}

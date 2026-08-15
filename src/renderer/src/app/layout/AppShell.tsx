import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { NewMatterDialog } from '@/features/matters/NewMatterDialog'
import { useAppActions } from '../AppContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { openNewMatter } = useAppActions()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openNewMatter()
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
    </div>
  )
}

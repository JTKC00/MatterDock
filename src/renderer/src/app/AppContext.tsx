import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type AppContextValue = {
  newMatterOpen: boolean
  openNewMatter: () => void
  closeNewMatter: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [newMatterOpen, setNewMatterOpen] = useState(false)
  const value = useMemo(
    () => ({
      newMatterOpen,
      openNewMatter: () => setNewMatterOpen(true),
      closeNewMatter: () => setNewMatterOpen(false)
    }),
    [newMatterOpen]
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useAppActions(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppProvider is missing')
  return value
}

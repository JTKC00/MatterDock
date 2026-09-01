import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { SupportedLocale } from '@shared/i18n'
import { AppProvider } from './app/AppContext'
import { AppShell } from './app/layout/AppShell'
import { SettingsPage } from './features/settings/SettingsPage'
import { SearchPage } from './features/search/SearchPage'
import { TodayPage } from './features/tasks/TodayPage'
import { WaitingPage } from './features/tasks/WaitingPage'
import { ContactDetailPage, ContactListPage } from './features/contacts/ContactPages'
import { MatterDetailPage } from './features/matters/MatterDetailPage'
import { MatterListPage } from './features/matters/MatterListPage'
import { OrganisationDetailPage, OrganisationListPage } from './features/organisations/OrganisationPages'
import { LocaleProvider } from './i18n/LocaleProvider'
import { setActiveLocale } from './i18n/runtime'
import { api } from './lib/api'
import { ToastProvider } from './lib/toast'

export function App() {
  const [locale, setLocale] = useState<SupportedLocale | null>(null)

  useEffect(() => {
    void api.settings
      .getLocale()
      .then((result) => {
        setActiveLocale(result.locale)
        setLocale(result.locale)
      })
      .catch(() => {
        setActiveLocale('en')
        setLocale('en')
      })
  }, [])

  if (!locale) return null

  return (
    <LocaleProvider locale={locale} onLocaleChange={setLocale}>
      <ToastProvider>
        <AppProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/matters" replace />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/matters" element={<MatterListPage />} />
              <Route path="/matters/:matterId" element={<MatterDetailPage />} />
              <Route path="/waiting" element={<WaitingPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/organisations" element={<OrganisationListPage />} />
              <Route path="/organisations/:organisationId" element={<OrganisationDetailPage />} />
              <Route path="/contacts" element={<ContactListPage />} />
              <Route path="/contacts/:contactId" element={<ContactDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/matters" replace />} />
            </Route>
          </Routes>
        </AppProvider>
      </ToastProvider>
    </LocaleProvider>
  )
}

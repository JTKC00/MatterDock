import { NavLink } from 'react-router-dom'
import { Building2, Clock3, Contact, Inbox, Search, Settings, SunMedium, Trash2 } from 'lucide-react'
import { useT } from '@/i18n/LocaleProvider'

export function Sidebar() {
  const t = useT()
  const items = [
    { to: '/today', label: t('nav.today'), icon: SunMedium },
    { to: '/matters', label: t('nav.matters'), icon: Inbox },
    { to: '/waiting', label: t('nav.waiting'), icon: Clock3 },
    { to: '/search', label: t('nav.search'), icon: Search },
    { to: '/organisations', label: t('nav.organisations'), icon: Building2 },
    { to: '/contacts', label: t('nav.contacts'), icon: Contact },
    { to: '/trash', label: t('nav.trash'), icon: Trash2 },
    { to: '/settings', label: t('nav.settings'), icon: Settings }
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 3v10" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </div>
        <div>
          <div className="brand-name">{t('brand.name')}</div>
          <div className="brand-byline">{t('brand.byline')}</div>
        </div>
      </div>
      <nav className="nav" aria-label={t('nav.primary')}>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
      <div className="sidebar-foot">{t('brand.offline')}</div>
    </aside>
  )
}

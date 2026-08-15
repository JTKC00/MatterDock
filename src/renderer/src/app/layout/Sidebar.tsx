import { NavLink } from 'react-router-dom'
import { Building2, Clock3, Contact, Inbox, Search, Settings, SunMedium } from 'lucide-react'

const items = [
  { to: '/today', label: 'Today', icon: SunMedium },
  { to: '/matters', label: 'Matters', icon: Inbox },
  { to: '/waiting', label: 'Waiting', icon: Clock3 },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/organisations', label: 'Organisations', icon: Building2 },
  { to: '/contacts', label: 'Contacts', icon: Contact },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function Sidebar() {
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
          <div className="brand-name">MatterDock</div>
          <div className="brand-byline">by Snugzap</div>
        </div>
      </div>
      <nav className="nav" aria-label="Main">
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
      <div className="sidebar-foot">Your data stays on this computer. MatterDock works offline.</div>
    </aside>
  )
}

export function ComingSoonPage({
  kicker,
  title,
  body
}: {
  kicker: string
  title: string
  body: string
}) {
  return (
    <div className="page">
      <div className="coming-soon">
        <div className="kicker">{kicker}</div>
        <h1 className="page-title" style={{ marginTop: 8 }}>
          {title}
        </h1>
        <p className="page-subtitle" style={{ maxWidth: 440 }}>
          {body}
        </p>
      </div>
    </div>
  )
}

export function TodayPage() {
  return (
    <ComingSoonPage
      kicker="Later"
      title="Today"
      body="A quiet view of what needs attention today will live here. For now, open Matters to see everything currently in motion."
    />
  )
}

export function WaitingPage() {
  return (
    <ComingSoonPage
      kicker="Later"
      title="Waiting"
      body="Waiting items will appear here once follow-ups can be marked as waiting on someone else. Until then, filter Matters by Waiting."
    />
  )
}

export function SearchPage() {
  return (
    <ComingSoonPage
      kicker="Later"
      title="Search"
      body="Global search is not part of this foundation release. Use the search field on Matters, Organisations, or Contacts."
    />
  )
}

export function SettingsPage() {
  return (
    <ComingSoonPage
      kicker="Local-first"
      title="Settings"
      body="MatterDock keeps every matter, contact and document reference on this computer. There is no account and nothing is sent to the cloud."
    />
  )
}

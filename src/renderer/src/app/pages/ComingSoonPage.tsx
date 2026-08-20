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

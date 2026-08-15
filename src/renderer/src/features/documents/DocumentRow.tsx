import { useState } from 'react'
import type { MatterDocument } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { extensionLabel, formatBytes } from './format'

export function DocumentRow({
  document,
  onOpen,
  onReveal,
  onCopyPath,
  onEditNotes,
  onRelink,
  onRemove
}: {
  document: MatterDocument
  onOpen: () => void
  onReveal: () => void
  onCopyPath: () => void
  onEditNotes: () => void
  onRelink: () => void
  onRemove: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const missing = !document.available

  return (
    <article className="work-card">
      <div className="work-card-top">
        <div>
          <div className="work-kicker">
            {extensionLabel(document.fileExtension)}
            {' · '}
            {document.storageMode === 'copy' ? 'MatterDock copy' : 'Reference original'}
          </div>
          <div className="entity-title">{document.displayName}</div>
          <div className="work-meta">
            {document.fileSize != null ? <span>{formatBytes(document.fileSize)}</span> : null}
            {document.resolvedPath ? (
              <span className="doc-path" title={document.resolvedPath}>
                {document.resolvedPath}
              </span>
            ) : null}
          </div>
          {missing ? (
            <p className="field-error" style={{ marginTop: 8 }}>
              {document.availability === 'missing_copy'
                ? 'Managed copy missing'
                : 'File unavailable. The original file could not be found at its saved location.'}
            </p>
          ) : null}
          {document.notes ? <p className="quiet" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{document.notes}</p> : null}
        </div>
        <div className="work-card-actions">
          {missing && document.availability === 'missing_reference' ? (
            <Button variant="secondary" onClick={onRelink}>
              Locate File…
            </Button>
          ) : (
            <Button variant="secondary" onClick={onOpen} disabled={missing}>
              Open
            </Button>
          )}
          <button type="button" className="icon-btn timeline-more-btn" aria-label="Document actions" onClick={() => setMenuOpen((value) => !value)}>
            •••
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div className="combobox-menu work-menu" role="menu">
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onOpen() }} disabled={missing}>
            Open
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onReveal() }} disabled={missing}>
            Show in Folder
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onCopyPath() }} disabled={!document.resolvedPath}>
            Copy Path
          </button>
          {document.availability === 'missing_reference' ? (
            <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onRelink() }}>
              Locate File…
            </button>
          ) : null}
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onEditNotes() }}>
            Edit Notes
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onRemove() }}>
            Remove from Matter
          </button>
        </div>
      ) : null}
    </article>
  )
}

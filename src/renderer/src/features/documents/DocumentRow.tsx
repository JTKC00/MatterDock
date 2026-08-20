import { useState } from 'react'
import type { MatterDocument } from '@shared/types'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n/LocaleProvider'
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
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const missing = !document.available

  return (
    <article className="work-card">
      <div className="work-card-top">
        <div>
          <div className="work-kicker">
            {extensionLabel(document.fileExtension)}
            {' · '}
            {document.storageMode === 'copy' ? t('documents.copy') : t('documents.reference')}
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
              {document.availability === 'missing_copy' ? t('documents.missingCopy') : t('documents.fileUnavailable')}
            </p>
          ) : null}
          {document.notes ? <p className="quiet" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{document.notes}</p> : null}
        </div>
        <div className="work-card-actions">
          {missing && document.availability === 'missing_reference' ? (
            <Button variant="secondary" onClick={onRelink}>
              {t('documents.relink')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onOpen} disabled={missing}>
              {t('documents.open')}
            </Button>
          )}
          <button type="button" className="icon-btn timeline-more-btn" aria-label={t('documents.actions')} onClick={() => setMenuOpen((value) => !value)}>
            •••
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div className="combobox-menu work-menu" role="menu">
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onOpen() }} disabled={missing}>
            {t('documents.open')}
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onReveal() }} disabled={missing}>
            {t('documents.reveal')}
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onCopyPath() }} disabled={!document.resolvedPath}>
            {t('documents.copyPath')}
          </button>
          {document.availability === 'missing_reference' ? (
            <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onRelink() }}>
              {t('documents.relink')}
            </button>
          ) : null}
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onEditNotes() }}>
            {t('documents.editNotes')}
          </button>
          <button type="button" className="combobox-item" role="menuitem" onClick={() => { setMenuOpen(false); onRemove() }}>
            {t('documents.removeFromMatter')}
          </button>
        </div>
      ) : null}
    </article>
  )
}

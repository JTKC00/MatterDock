import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { BackupSummary } from '@shared/backup'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

type Busy = 'backup' | 'inspect' | 'restore' | 'export' | null

export function SettingsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<Busy>(null)
  const [lastBackup, setLastBackup] = useState(false)
  const [lastExport, setLastExport] = useState(false)
  const [restore, setRestore] = useState<{ token: string; summary: BackupSummary } | null>(null)

  async function createBackup() {
    setBusy('backup')
    try {
      const result = await api.backup.create()
      if (!result.created) return
      setLastBackup(true)
      toast.push('Backup created.')
    } catch (error) {
      toast.push(messageFrom(error, 'The backup could not be created. Your MatterDock data was not changed.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function inspectRestore() {
    setBusy('inspect')
    try {
      const result = await api.backup.inspect()
      if (result.canceled) return
      setRestore({ token: result.token, summary: result.summary })
    } catch (error) {
      toast.push(messageFrom(error, 'This file is not a valid MatterDock backup.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function confirmRestore() {
    if (!restore) return
    setBusy('restore')
    try {
      await api.backup.restore(restore.token)
      setRestore(null)
      queryClient.clear()
      toast.push('Backup restored successfully.')
      navigate('/matters')
    } catch (error) {
      toast.push(
        messageFrom(error, 'The backup could not be restored. Your previous MatterDock data has been recovered.'),
        'error'
      )
      setRestore(null)
    } finally {
      setBusy(null)
    }
  }

  async function exportData() {
    setBusy('export')
    try {
      const result = await api.backup.exportData()
      if (!result.created) return
      setLastExport(true)
      toast.push('Data exported.')
    } catch (error) {
      toast.push(
        messageFrom(error, 'The data export could not be created. Your MatterDock data was not changed.'),
        'error'
      )
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Your MatterDock data stays on this computer.</p>
        </div>
      </header>
      <div className="scroll settings-page">
        <h2 className="section-label">Data & Backup</h2>

        {busy ? <p className="settings-busy">{busyLabel(busy)}</p> : null}

        <section className="settings-card">
          <h3>Backup</h3>
          <p>Create a portable copy of your MatterDock database and managed documents. Referenced original files are not copied.</p>
          <div className="settings-actions">
            <Button variant="primary" onClick={() => void createBackup()} disabled={disabled}>
              Create Backup…
            </Button>
            {lastBackup ? (
              <Button variant="ghost" onClick={() => void api.backup.revealBackup()} disabled={disabled}>
                Show in Folder
              </Button>
            ) : null}
          </div>
        </section>

        <section className="settings-card">
          <h3>Restore</h3>
          <p>Replace the current workspace with a previous MatterDock backup. A recovery copy is created before restore.</p>
          <div className="settings-actions">
            <Button onClick={() => void inspectRestore()} disabled={disabled}>
              Restore Backup…
            </Button>
          </div>
        </section>

        <section className="settings-card">
          <h3>Data Portability</h3>
          <p>Export your MatterDock data as JSON, CSV and managed document files for use outside MatterDock.</p>
          <p className="settings-note">This export may contain personal or confidential information. Store it securely.</p>
          <div className="settings-actions">
            <Button onClick={() => void exportData()} disabled={disabled}>
              Export Data…
            </Button>
            {lastExport ? (
              <Button variant="ghost" onClick={() => void api.backup.revealExport()} disabled={disabled}>
                Show in Folder
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      <Dialog
        open={restore !== null && busy !== 'restore'}
        onOpenChange={(open) => {
          if (!open && busy !== 'restore') setRestore(null)
        }}
        title="Restore this backup?"
        description="Current MatterDock data will be replaced with the contents of this backup. A safety copy of your current MatterDock data will be created before restore."
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => void confirmRestore()}>
              Restore
            </Button>
          </>
        }
      >
        {restore ? (
          <p className="muted">
            Created {formatCreated(restore.summary.createdAt)} · {restore.summary.matterCount} matters ·{' '}
            {restore.summary.managedDocumentCount} managed documents
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}

function busyLabel(busy: Exclude<Busy, null>): string {
  if (busy === 'backup') return 'Creating backup…'
  if (busy === 'inspect') return 'Checking backup…'
  if (busy === 'restore') return 'Restoring backup…'
  return 'Exporting data…'
}

function formatCreated(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

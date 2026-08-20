import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { BackupSummary } from '@shared/backup'
import type { SupportedLocale } from '@shared/i18n'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Field'
import { useLocale, useT } from '@/i18n/LocaleProvider'
import { getActiveLocale } from '@/i18n/runtime'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

type Busy = 'backup' | 'inspect' | 'restore' | 'export' | null

export function SettingsPage() {
  const t = useT()
  const { locale, setLocale } = useLocale()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<Busy>(null)
  const [lastBackup, setLastBackup] = useState(false)
  const [lastExport, setLastExport] = useState(false)
  const [restore, setRestore] = useState<{ token: string; summary: BackupSummary } | null>(null)

  async function changeLocale(next: SupportedLocale) {
    try {
      await setLocale(next)
      toast.push(t('settings.localeSaved'))
    } catch {
      toast.push(t('settings.localeSaveFailed'), 'error')
    }
  }

  async function createBackup() {
    setBusy('backup')
    try {
      const result = await api.backup.create()
      if (!result.created) return
      setLastBackup(true)
      toast.push(t('settings.backupCreated'))
    } catch (error) {
      toast.push(messageFrom(error, t('errors.backupFailed')), 'error')
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
      toast.push(messageFrom(error, t('errors.backupInvalid')), 'error')
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
      toast.push(t('settings.restoreSuccess'))
      navigate('/matters')
    } catch (error) {
      toast.push(messageFrom(error, t('errors.restoreFailedRecovered')), 'error')
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
      toast.push(t('settings.dataExported'))
    } catch (error) {
      toast.push(messageFrom(error, t('errors.exportFailed')), 'error')
    } finally {
      setBusy(null)
    }
  }

  const disabled = busy !== null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </header>
      <div className="scroll settings-page">
        <h2 className="section-label">{t('settings.language')}</h2>
        <section className="settings-card">
          <h3>{t('settings.language')}</h3>
          <p>{t('settings.languageHelp')}</p>
          <p className="settings-note">{t('settings.preferenceNote')}</p>
          <div className="settings-actions">
            <Select
              aria-label={t('settings.language')}
              value={locale}
              onChange={(event) => void changeLocale(event.target.value as SupportedLocale)}
            >
              <option value="en">{t('settings.english')}</option>
              <option value="zh-HK">{t('settings.zhHK')}</option>
            </Select>
          </div>
        </section>

        <h2 className="section-label">{t('settings.dataBackup')}</h2>

        {busy ? <p className="settings-busy">{busyLabel(busy, t)}</p> : null}

        <section className="settings-card">
          <h3>{t('settings.backup')}</h3>
          <p>{t('settings.backupHelp')}</p>
          <div className="settings-actions">
            <Button variant="primary" onClick={() => void createBackup()} disabled={disabled}>
              {t('settings.createBackup')}
            </Button>
            {lastBackup ? (
              <Button variant="ghost" onClick={() => void api.backup.revealBackup()} disabled={disabled}>
                {t('common.showInFolder')}
              </Button>
            ) : null}
          </div>
        </section>

        <section className="settings-card">
          <h3>{t('settings.restore')}</h3>
          <p>{t('settings.restoreHelp')}</p>
          <div className="settings-actions">
            <Button onClick={() => void inspectRestore()} disabled={disabled}>
              {t('settings.restoreBackup')}
            </Button>
          </div>
        </section>

        <section className="settings-card">
          <h3>{t('settings.portability')}</h3>
          <p>{t('settings.portabilityHelp')}</p>
          <p className="settings-note">{t('settings.portabilityNote')}</p>
          <div className="settings-actions">
            <Button onClick={() => void exportData()} disabled={disabled}>
              {t('settings.exportData')}
            </Button>
            {lastExport ? (
              <Button variant="ghost" onClick={() => void api.backup.revealExport()} disabled={disabled}>
                {t('common.showInFolder')}
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
        title={t('settings.restoreTitle')}
        description={t('settings.restoreDescription')}
        actions={
          <>
            <DialogCloseButton />
            <Button variant="danger" onClick={() => void confirmRestore()}>
              {t('settings.restoreConfirm')}
            </Button>
          </>
        }
      >
        {restore ? (
          <p className="muted">
            {t('settings.restoreSummary', {
              date: formatCreated(restore.summary.createdAt),
              matters: restore.summary.matterCount,
              managed: restore.summary.managedDocumentCount
            })}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}

function busyLabel(busy: Exclude<Busy, null>, t: (key: string) => string): string {
  if (busy === 'backup') return t('settings.creatingBackup')
  if (busy === 'inspect') return t('settings.checkingBackup')
  if (busy === 'restore') return t('settings.restoringBackup')
  return t('settings.exportingData')
}

function formatCreated(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(getActiveLocale() === 'zh-HK' ? 'zh-HK' : 'en-GB')
}

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

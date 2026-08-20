import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { CONTEXT_PRESETS, type ContextFormat, type ContextOptions, type ContextPreset } from '@shared/types'
import { defaultContextOptions, optionsForPreset } from '@shared/contextOptions'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { useT } from '@/i18n/LocaleProvider'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

const PRESET_KEYS: Record<ContextPreset, string> = {
  full: 'context.full',
  current_work: 'context.currentWork',
  timeline: 'context.timeline',
  privacy_safe: 'context.privacySafe'
}

export function PrepareContextDialog({
  open,
  matterId,
  onClose
}: {
  open: boolean
  matterId: string
  onClose: () => void
}) {
  const t = useT()
  const toast = useToast()
  const [preset, setPreset] = useState<ContextPreset>('full')
  const [options, setOptions] = useState<ContextOptions>(defaultContextOptions)
  const [customText, setCustomText] = useState('')

  const merged: ContextOptions = useMemo(
    () => ({
      ...options,
      customRedactions: customText.split('\n')
    }),
    [options, customText]
  )

  const preview = useQuery({
    queryKey: ['context-preview', matterId, merged],
    queryFn: () => api.context.build(matterId, merged),
    enabled: open
  })

  const copy = useMutation({
    mutationFn: async () => {
      if (!preview.data) throw new UserFacingError(t('context.failed'))
      await api.context.copy(preview.data.content)
    },
    onSuccess: () => toast.push(t('context.copied')),
    onError: (error) => toast.push(messageFrom(error, t('context.failed')), 'error')
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!preview.data) throw new UserFacingError(t('context.failed'))
      return api.context.save({
        suggestedName: preview.data.suggestedName,
        format: preview.data.format,
        content: preview.data.content
      })
    },
    onSuccess: (result) => {
      if (result.saved) toast.push(t('context.saved'))
    },
    onError: (error) => toast.push(messageFrom(error, t('context.failed')), 'error')
  })

  function patch(next: Partial<ContextOptions>) {
    setOptions((current) => ({ ...current, ...next }))
  }

  const privacyOff =
    !merged.redactContactNames &&
    !merged.redactOrganisationNames &&
    !merged.redactEmails &&
    !merged.redactPhones &&
    !merged.redactReference

  if (!open) return null

  return (
    <Dialog
      open
      wide
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t('context.title')}
      description={t('context.description')}
      actions={
        <>
          <DialogCloseButton />
          <Button onClick={() => copy.mutate()} disabled={copy.isPending || !preview.data}>
            {t('context.copy')}
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !preview.data}>
            {t('context.save')}
          </Button>
        </>
      }
    >
      <div className="context-layout">
        <div className="context-options">
          <Field label={t('context.preset')} htmlFor="context-preset">
            <select
              id="context-preset"
              className="select"
              value={preset}
              onChange={(event) => {
                const next = event.target.value as ContextPreset
                setPreset(next)
                setOptions(optionsForPreset(next))
              }}
            >
              {CONTEXT_PRESETS.map((value) => (
                <option key={value} value={value}>
                  {t(PRESET_KEYS[value])}
                </option>
              ))}
            </select>
          </Field>
          <p className="section-label">{t('context.include')}</p>
          <Check label={t('context.overviewLong')} checked={options.includeOverview} onChange={(value) => patch({ includeOverview: value })} />
          <Check label={t('context.includeOrganisation')} checked={options.includeOrganisation} onChange={(value) => patch({ includeOrganisation: value })} />
          <Check label={t('context.includeContacts')} checked={options.includeContacts} onChange={(value) => patch({ includeContacts: value })} />
          <Check label={t('context.includeNextAction')} checked={options.includeNextAction} onChange={(value) => patch({ includeNextAction: value })} />
          <Check label={t('context.includeOpenActionsLong')} checked={options.includeOpenActions} onChange={(value) => patch({ includeOpenActions: value })} />
          <Check label={t('context.includeWaiting')} checked={options.includeWaiting} onChange={(value) => patch({ includeWaiting: value })} />
          <Check label={t('context.includeTimeline')} checked={options.includeTimeline} onChange={(value) => patch({ includeTimeline: value })} />
          <Check label={t('context.includeDocuments')} checked={options.includeDocuments} onChange={(value) => patch({ includeDocuments: value })} />
          <Check
            label={t('context.includeClosedWorkLong')}
            checked={options.includeClosedWork}
            onChange={(value) => patch({ includeClosedWork: value })}
          />
          {options.includeTimeline ? (
            <Field label={t('context.timelineRange')} htmlFor="timeline-range">
              <select
                id="timeline-range"
                className="select"
                value={options.timelineRange}
                onChange={(event) => patch({ timelineRange: event.target.value as ContextOptions['timelineRange'] })}
              >
                <option value="all">{t('context.allActivity')}</option>
                <option value="30d">{t('context.timeline30')}</option>
                <option value="90d">{t('context.timeline90')}</option>
              </select>
            </Field>
          ) : null}
          <Check
            label={t('context.includeFilePathsLong')}
            checked={options.includeFilePaths}
            onChange={(value) => patch({ includeFilePaths: value })}
          />
          <p className="section-label">{t('context.privacy')}</p>
          <p className="muted">{t('context.privacyHelp')}</p>
          <Check label={t('context.redactContacts')} checked={options.redactContactNames} onChange={(value) => patch({ redactContactNames: value })} />
          <Check
            label={t('context.redactOrganisations')}
            checked={options.redactOrganisationNames}
            onChange={(value) => patch({ redactOrganisationNames: value })}
          />
          <Check label={t('context.redactEmailsLong')} checked={options.redactEmails} onChange={(value) => patch({ redactEmails: value })} />
          <Check label={t('context.redactPhonesLong')} checked={options.redactPhones} onChange={(value) => patch({ redactPhones: value })} />
          <Check label={t('context.redactReferenceLong')} checked={options.redactReference} onChange={(value) => patch({ redactReference: value })} />
          <Check label={t('context.hideFilePathsLong')} checked={options.hideFilePaths} onChange={(value) => patch({ hideFilePaths: value })} />
          <Field label={t('context.customRedactLabel')} htmlFor="custom-redact">
            <Textarea
              id="custom-redact"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder={t('context.customPlaceholder')}
            />
          </Field>
          <p className="section-label">{t('context.format')}</p>
          {(['markdown', 'text', 'json'] as ContextFormat[]).map((format) => (
            <label key={format} className="radio-row">
              <input type="radio" name="context-format" checked={options.format === format} onChange={() => patch({ format })} />
              {t(`context.${format}`)}
            </label>
          ))}
          {privacyOff ? <p className="muted">{t('context.privacyWarning')}</p> : null}
        </div>
        <div className="context-preview">
          <p className="section-label">{t('context.preview')}</p>
          {preview.data ? (
            <p className="muted">{t('context.characters', { count: preview.data.characterCount.toLocaleString() })}</p>
          ) : null}
          <pre className="context-preview-body">
            {preview.data?.content ??
              (preview.isError
                ? messageFrom(preview.error, t('context.failed'))
                : preview.isPending
                  ? t('context.preparing')
                  : t('context.previewEmpty'))}
          </pre>
        </div>
      </div>
    </Dialog>
  )
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="radio-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UserFacingError ? error.message : fallback
}

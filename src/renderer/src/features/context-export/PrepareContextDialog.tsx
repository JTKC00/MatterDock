import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ContextFormat, ContextOptions, ContextPreset } from '@shared/types'
import { CONTEXT_PRESET_LABELS, defaultContextOptions, optionsForPreset } from '@shared/contextOptions'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogCloseButton } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { api, UserFacingError } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function PrepareContextDialog({
  open,
  matterId,
  onClose
}: {
  open: boolean
  matterId: string
  onClose: () => void
}) {
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
      if (!preview.data) throw new UserFacingError('That context could not be prepared.')
      await api.context.copy(preview.data.content)
    },
    onSuccess: () => toast.push('Copied'),
    onError: (error) => toast.push(message(error), 'error')
  })

  const save = useMutation({
    mutationFn: async () => {
      if (!preview.data) throw new UserFacingError('That context could not be prepared.')
      return api.context.save({
        suggestedName: preview.data.suggestedName,
        format: preview.data.format,
        content: preview.data.content
      })
    },
    onSuccess: (result) => {
      if (result.saved) toast.push('Context saved.')
    },
    onError: (error) => toast.push(message(error), 'error')
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
      title="Prepare Context"
      description="Prepare a clean copy of this Matter for another person or tool."
      actions={
        <>
          <DialogCloseButton />
          <Button onClick={() => copy.mutate()} disabled={copy.isPending || !preview.data}>
            Copy
          </Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !preview.data}>
            Save…
          </Button>
        </>
      }
    >
      <div className="context-layout">
        <div className="context-options">
          <Field label="Preset" htmlFor="context-preset">
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
              {(Object.keys(CONTEXT_PRESET_LABELS) as ContextPreset[]).map((value) => (
                <option key={value} value={value}>
                  {CONTEXT_PRESET_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <p className="section-label">Include</p>
          <Check label="Matter overview" checked={options.includeOverview} onChange={(value) => patch({ includeOverview: value })} />
          <Check label="Organisation" checked={options.includeOrganisation} onChange={(value) => patch({ includeOrganisation: value })} />
          <Check label="Contacts" checked={options.includeContacts} onChange={(value) => patch({ includeContacts: value })} />
          <Check label="Next Action" checked={options.includeNextAction} onChange={(value) => patch({ includeNextAction: value })} />
          <Check label="Open Actions" checked={options.includeOpenActions} onChange={(value) => patch({ includeOpenActions: value })} />
          <Check label="Waiting" checked={options.includeWaiting} onChange={(value) => patch({ includeWaiting: value })} />
          <Check label="Timeline" checked={options.includeTimeline} onChange={(value) => patch({ includeTimeline: value })} />
          <Check label="Documents" checked={options.includeDocuments} onChange={(value) => patch({ includeDocuments: value })} />
          <Check
            label="Include completed / cancelled work items"
            checked={options.includeClosedWork}
            onChange={(value) => patch({ includeClosedWork: value })}
          />
          {options.includeTimeline ? (
            <Field label="Timeline range" htmlFor="timeline-range">
              <select
                id="timeline-range"
                className="select"
                value={options.timelineRange}
                onChange={(event) => patch({ timelineRange: event.target.value as ContextOptions['timelineRange'] })}
              >
                <option value="all">All activity</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </Field>
          ) : null}
          <Check
            label="Include local file paths"
            checked={options.includeFilePaths}
            onChange={(value) => patch({ includeFilePaths: value })}
          />
          <p className="section-label">Privacy</p>
          <p className="muted">Redacts selected known fields. Review the preview before sharing.</p>
          <Check label="Redact contact names" checked={options.redactContactNames} onChange={(value) => patch({ redactContactNames: value })} />
          <Check
            label="Redact organisation names"
            checked={options.redactOrganisationNames}
            onChange={(value) => patch({ redactOrganisationNames: value })}
          />
          <Check label="Redact email addresses" checked={options.redactEmails} onChange={(value) => patch({ redactEmails: value })} />
          <Check label="Redact phone numbers" checked={options.redactPhones} onChange={(value) => patch({ redactPhones: value })} />
          <Check label="Redact Matter reference" checked={options.redactReference} onChange={(value) => patch({ redactReference: value })} />
          <Check label="Hide local file paths" checked={options.hideFilePaths} onChange={(value) => patch({ hideFilePaths: value })} />
          <Field label="Custom text to redact" htmlFor="custom-redact">
            <Textarea
              id="custom-redact"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="One item per line"
            />
          </Field>
          <p className="section-label">Format</p>
          {(['markdown', 'text', 'json'] as ContextFormat[]).map((format) => (
            <label key={format} className="radio-row">
              <input type="radio" name="context-format" checked={options.format === format} onChange={() => patch({ format })} />
              {format === 'markdown' ? 'Markdown' : format === 'text' ? 'Plain text' : 'JSON'}
            </label>
          ))}
          {privacyOff ? (
            <p className="muted">This export may contain personal or confidential information. Review the preview before sharing it.</p>
          ) : null}
        </div>
        <div className="context-preview">
          <p className="section-label">Preview</p>
          {preview.data ? <p className="muted">{preview.data.characterCount.toLocaleString()} characters</p> : null}
          <pre className="context-preview-body">
            {preview.data?.content ??
              (preview.isError
                ? message(preview.error)
                : preview.isPending
                  ? 'Preparing…'
                  : 'Preview will appear here.')}
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

function message(error: unknown): string {
  return error instanceof UserFacingError ? error.message : 'That context could not be prepared.'
}

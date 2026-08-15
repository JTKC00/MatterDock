import type { ContextOptions } from '@shared/types'
import type { MatterContextSnapshot } from './types'

type Rule = { from: string; to: string; kind: 'latin' | 'cjk' | 'email' }

function hasCjk(value: string): boolean {
  return /[\u3000-\u9fff]/.test(value)
}

function applyRules(text: string, rules: Rule[]): string {
  if (!text || rules.length === 0) return text
  const sorted = [...rules].sort((left, right) => right.from.length - left.from.length)
  const tokens: string[] = []
  let current = text
  for (const rule of sorted) {
    if (!rule.from) continue
    const index = tokens.length
    const token = `\uE000${index}\uE001`
    if (rule.kind === 'email') {
      const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      current = current.replace(new RegExp(escaped, 'gi'), token)
    } else if (rule.kind === 'cjk') {
      current = current.split(rule.from).join(token)
    } else {
      const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      current = current.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'gi'), token)
    }
    tokens.push(rule.to)
  }
  return current.replace(/\uE000(\d+)\uE001/g, (_match, raw) => tokens[Number(raw)] ?? '')
}

function walk(value: unknown, apply: (text: string) => string): unknown {
  if (typeof value === 'string') return apply(value)
  if (Array.isArray(value)) return value.map((item) => walk(item, apply))
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) next[key] = walk(item, apply)
    return next
  }
  return value
}

export function redactSnapshot(snapshot: MatterContextSnapshot, options: ContextOptions): MatterContextSnapshot {
  const rules: Rule[] = []
  const custom = [...new Set(options.customRedactions.map((item) => item.trim()).filter(Boolean))]
  for (const value of custom.sort((left, right) => right.length - left.length)) {
    rules.push({ from: value, to: '[Redacted]', kind: hasCjk(value) ? 'cjk' : 'latin' })
  }
  if (options.redactContactNames) {
    const names = [...new Set(snapshot.contacts.map((contact) => contact.name).filter(Boolean))]
    names.sort((left, right) => right.length - left.length)
    names.forEach((name, index) => {
      rules.push({ from: name, to: `[Contact ${index + 1}]`, kind: hasCjk(name) ? 'cjk' : 'latin' })
    })
  }
  if (options.redactOrganisationNames && snapshot.organisation) {
    const values = [snapshot.organisation.name, ...snapshot.organisation.aliases].filter(Boolean)
    const unique = [...new Set(values)].sort((left, right) => right.length - left.length)
    unique.forEach((value) => {
      rules.push({ from: value, to: '[Organisation 1]', kind: hasCjk(value) ? 'cjk' : 'latin' })
    })
  }
  if (options.redactEmails) {
    const emails = [...new Set(snapshot.contacts.map((contact) => contact.email).filter((value): value is string => Boolean(value)))]
    emails.sort((left, right) => right.length - left.length)
    emails.forEach((email, index) => {
      rules.push({ from: email, to: `[Email ${index + 1}]`, kind: 'email' })
    })
  }
  if (options.redactPhones) {
    const phones = [...new Set(snapshot.contacts.map((contact) => contact.phone).filter((value): value is string => Boolean(value)))]
    phones.sort((left, right) => right.length - left.length)
    phones.forEach((phone, index) => {
      rules.push({ from: phone, to: `[Phone ${index + 1}]`, kind: 'latin' })
    })
  }
  if (options.redactReference && snapshot.matter.reference) {
    rules.push({ from: snapshot.matter.reference, to: '[Matter Reference]', kind: 'latin' })
  }
  if (options.hideFilePaths) {
    for (const doc of snapshot.documents) {
      if (doc.path) rules.push({ from: doc.path, to: '[Local Path]', kind: 'cjk' })
    }
  }

  const apply = (text: string) => applyRules(text, rules)
  const redacted = walk(snapshot, apply) as MatterContextSnapshot

  if (!options.includeFilePaths) {
    redacted.documents = redacted.documents.map((doc) => ({ ...doc, path: null }))
  }
  return redacted
}

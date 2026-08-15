import type { ContextOptions } from '@shared/types'
import type { MatterContextSnapshot } from './types'

export type RedactionRule = { from: string; to: string; kind: 'latin' | 'cjk' | 'email' }

export type RedactionPlan = {
  rules: RedactionRule[]
}

function hasCjk(value: string): boolean {
  return /[\u3000-\u9fff]/.test(value)
}

function sameIdentity(left: string, right: string): boolean {
  if (hasCjk(left) || hasCjk(right)) return left === right
  return left.toLowerCase() === right.toLowerCase()
}

function identityKey(value: string, kind: 'latin' | 'cjk' | 'email'): string {
  if (kind === 'cjk') return `cjk:${value}`
  return `${kind}:${value.toLowerCase()}`
}

export function applyRules(text: string, rules: RedactionRule[]): string {
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

function uniqueInOrder(values: Array<string | null | undefined>, kind: 'latin' | 'cjk' | 'email'): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value) continue
    const key = identityKey(value, kind === 'email' ? 'email' : hasCjk(value) ? 'cjk' : kind)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function collectOrganisations(snapshot: MatterContextSnapshot): Array<{ name: string; aliases: string[] }> {
  const entities: Array<{ name: string; aliases: string[] }> = []

  const addEntity = (name: string | null | undefined, aliases: string[] = []) => {
    if (!name) return
    const extra = aliases.filter(Boolean)
    const existing = entities.find(
      (entity) =>
        sameIdentity(entity.name, name) ||
        entity.aliases.some((alias) => sameIdentity(alias, name)) ||
        extra.some((alias) => sameIdentity(entity.name, alias) || entity.aliases.some((item) => sameIdentity(item, alias)))
    )
    if (existing) {
      for (const alias of extra) {
        if (!sameIdentity(existing.name, alias) && !existing.aliases.some((item) => sameIdentity(item, alias))) {
          existing.aliases.push(alias)
        }
      }
      return
    }
    entities.push({
      name,
      aliases: extra.filter((alias) => !sameIdentity(alias, name))
    })
  }

  if (snapshot.organisation) addEntity(snapshot.organisation.name, snapshot.organisation.aliases)
  else addEntity(snapshot.matter.organisationName)
  for (const organisation of snapshot.privacySources?.organisations ?? []) {
    addEntity(organisation.name, organisation.aliases)
  }
  for (const contact of snapshot.contacts) addEntity(contact.organisationName)

  return entities
}

export function buildRedactionPlan(snapshot: MatterContextSnapshot, options: ContextOptions): RedactionPlan {
  const rules: RedactionRule[] = []
  const custom = uniqueInOrder(
    options.customRedactions.map((item) => item.trim()),
    'latin'
  )
  for (const value of custom) {
    rules.push({ from: value, to: '[Redacted]', kind: hasCjk(value) ? 'cjk' : 'latin' })
  }

  if (options.redactContactNames) {
    const linked = uniqueInOrder(
      snapshot.contacts.map((contact) => contact.name),
      'latin'
    )
    const extras = uniqueInOrder(
      [...snapshot.timeline.map((event) => event.contactName)].sort((left, right) =>
        (left ?? '').localeCompare(right ?? '', undefined, { sensitivity: 'base' })
      ),
      'latin'
    )
    const names = uniqueInOrder([...linked, ...extras], 'latin')
    names.forEach((name, index) => {
      rules.push({ from: name, to: `[Contact ${index + 1}]`, kind: hasCjk(name) ? 'cjk' : 'latin' })
    })
  }

  if (options.redactOrganisationNames) {
    collectOrganisations(snapshot).forEach((entity, index) => {
      const label = `[Organisation ${index + 1}]`
      rules.push({ from: entity.name, to: label, kind: hasCjk(entity.name) ? 'cjk' : 'latin' })
      for (const alias of entity.aliases) {
        rules.push({ from: alias, to: label, kind: hasCjk(alias) ? 'cjk' : 'latin' })
      }
    })
  }

  if (options.redactEmails) {
    uniqueInOrder(
      snapshot.contacts.map((contact) => contact.email),
      'email'
    ).forEach((email, index) => {
      rules.push({ from: email, to: `[Email ${index + 1}]`, kind: 'email' })
    })
  }

  if (options.redactPhones) {
    uniqueInOrder(
      snapshot.contacts.map((contact) => contact.phone),
      'latin'
    ).forEach((phone, index) => {
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

  return { rules }
}

export function applyRedactionPlan(
  snapshot: MatterContextSnapshot,
  plan: RedactionPlan,
  options: ContextOptions
): MatterContextSnapshot {
  const apply = (text: string) => applyRules(text, plan.rules)
  const redacted = walk(snapshot, apply) as MatterContextSnapshot
  if (!options.includeFilePaths) {
    redacted.documents = redacted.documents.map((doc) => ({ ...doc, path: null }))
  }
  delete redacted.privacySources
  return redacted
}

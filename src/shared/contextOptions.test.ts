import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultContextOptions, optionsForPreset } from './contextOptions'
import { contextOptionsSchema } from './schemas'

describe('context presets', () => {
  it('hides paths by default and leaves redaction off on the full preset', () => {
    expect(defaultContextOptions.hideFilePaths).toBe(true)
    expect(defaultContextOptions.includeFilePaths).toBe(false)
    expect(defaultContextOptions.includeClosedWork).toBe(false)
    expect(defaultContextOptions.redactContactNames).toBe(false)
    expect(contextOptionsSchema.parse(defaultContextOptions)).toMatchObject(defaultContextOptions)
  })

  it('turns timeline off for current work and enables privacy flags for the safe preset', () => {
    expect(optionsForPreset('current_work').includeTimeline).toBe(false)
    expect(optionsForPreset('current_work').contactsMinimal).toBe(true)
    expect(optionsForPreset('timeline').includeOpenActions).toBe(false)
    expect(optionsForPreset('timeline').includeWaiting).toBe(false)
    const safe = optionsForPreset('privacy_safe')
    expect(safe.redactContactNames).toBe(true)
    expect(safe.redactOrganisationNames).toBe(true)
    expect(safe.redactEmails).toBe(true)
    expect(safe.redactPhones).toBe(true)
    expect(safe.redactReference).toBe(true)
    expect(safe.hideFilePaths).toBe(true)
  })

  it('does not add AI or HTTP client dependencies', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)].join(' ')
    expect(names).not.toMatch(/openai|anthropic|@google\/genai|ollama|axios|langchain|openai-sdk/i)
  })
})

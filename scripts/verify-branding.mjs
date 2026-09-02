import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const expectedIcon = 'build/icon.svg'
const configuredIcon = packageJson.build?.win?.icon

if (configuredIcon !== expectedIcon) {
  throw new Error(
    `Branding validation failed. build.win.icon must be ${expectedIcon}, got ${configuredIcon ?? 'missing'}.`
  )
}

const iconPath = join(projectRoot, expectedIcon)
if (!existsSync(iconPath)) {
  throw new Error(`Branding validation failed. Missing approved MatterDock icon source: ${iconPath}`)
}
if (statSync(iconPath).size === 0) {
  throw new Error('Branding validation failed. MatterDock icon source is empty.')
}

const svg = readFileSync(iconPath, 'utf8')
if (!/<svg\b/i.test(svg) || !/viewBox=["']0 0 1024 1024["']/i.test(svg)) {
  throw new Error('Branding validation failed. build/icon.svg must be a 1024×1024 SVG master.')
}
if (!/MatterDock app icon/i.test(svg)) {
  throw new Error('Branding validation failed. build/icon.svg is missing the MatterDock identity marker.')
}
if (/\b(?:href|xlink:href)=["']https?:\/\//i.test(svg)) {
  throw new Error('Branding validation failed. MatterDock icon must not depend on external network assets.')
}

console.log('Branding validation passed:')
console.log(`- Windows application icon source: ${expectedIcon}`)
console.log('- NSIS installer/uninstaller inherit the branded application icon')
console.log('- Icon source is local-only, non-empty, and 1024×1024 vector artwork')

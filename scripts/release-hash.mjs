import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const fileName = `MatterDock-${packageJson.version}-Setup.exe`
const installerPath = join(projectRoot, 'release', fileName)

if (!existsSync(installerPath)) {
  throw new Error(`Cannot hash missing installer: ${installerPath}`)
}

const sha256 = createHash('sha256').update(readFileSync(installerPath)).digest('hex').toUpperCase()
console.log(`SHA256  ${fileName}  ${sha256}`)

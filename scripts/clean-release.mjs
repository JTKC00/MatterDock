import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const releaseRoot = join(projectRoot, 'release')

if (existsSync(releaseRoot)) {
  rmSync(releaseRoot, { recursive: true, force: true })
}

console.log(`Cleaned generated release directory: ${releaseRoot}`)

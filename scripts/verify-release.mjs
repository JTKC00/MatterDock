import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const releaseRoot = join(projectRoot, 'release')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const unpackedRoot = join(releaseRoot, 'win-unpacked')
const requiredFiles = [
  join(unpackedRoot, 'MatterDock.exe'),
  join(unpackedRoot, 'resources', 'app.asar'),
  join(unpackedRoot, 'resources', 'sql-wasm.wasm'),
  join(releaseRoot, `MatterDock-${version}-Setup.exe`)
]

const missing = requiredFiles.filter((path) => !existsSync(path))
if (missing.length > 0) {
  throw new Error(`Release validation failed. Missing:\n${missing.map((path) => `- ${path}`).join('\n')}`)
}

function walk(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const userDataFiles = walk(releaseRoot).filter((path) => /\.sqlite(?:-journal)?$/.test(path))
if (userDataFiles.length > 0) {
  throw new Error(
    `Release validation failed. User database files must not be shipped:\n${userDataFiles
      .map((path) => `- ${relative(releaseRoot, path)}`)
      .join('\n')}`
  )
}

const updateMetadataFiles = walk(releaseRoot).filter((path) =>
  /(?:^|\\)(?:app-update\.yml|latest\.yml|.*\.blockmap)$/.test(path)
)
if (updateMetadataFiles.length > 0) {
  throw new Error(
    `Release validation failed. Auto-update metadata must not be shipped:\n${updateMetadataFiles
      .map((path) => `- ${relative(releaseRoot, path)}`)
      .join('\n')}`
  )
}

const portableArtifacts = walk(releaseRoot).filter((path) =>
  /portable|\.zip$/i.test(relative(releaseRoot, path))
)
if (portableArtifacts.length > 0) {
  throw new Error(
    `Release validation failed. Portable artifacts are not permitted in installer-only releases:\n${portableArtifacts
      .map((path) => `- ${relative(releaseRoot, path)}`)
      .join('\n')}`
  )
}

const wasmSize = statSync(join(unpackedRoot, 'resources', 'sql-wasm.wasm')).size
if (wasmSize === 0) throw new Error('Release validation failed. sql-wasm.wasm is empty.')

console.log(`Release ${version} contains:`)
console.log(`- NSIS installer: ${join(releaseRoot, `MatterDock-${version}-Setup.exe`)}`)
console.log(`- Unpacked executable: ${join(unpackedRoot, 'MatterDock.exe')}`)
console.log('- No SQLite database or journal files')

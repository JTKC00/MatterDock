import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const releaseRoot = join(projectRoot, 'release')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const build = packageJson.build ?? {}
const version = packageJson.version

if (typeof version !== 'string' || version.trim().length === 0) {
  throw new Error('Release validation failed. package.json must contain a version.')
}

assertIdentity(packageJson, build)
assertWindowsTarget(build)

if (!existsSync(releaseRoot)) {
  throw new Error(`Release validation failed. Missing release directory: ${releaseRoot}`)
}

const unpackedRoot = join(releaseRoot, 'win-unpacked')
const installerName = `MatterDock-${version}-Setup.exe`
const requiredFiles = [
  join(unpackedRoot, 'MatterDock.exe'),
  join(unpackedRoot, 'resources', 'app.asar'),
  join(unpackedRoot, 'resources', 'sql-wasm.wasm'),
  join(releaseRoot, installerName)
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

function releasePath(path) {
  return relative(releaseRoot, path).replaceAll('\\', '/')
}

const releaseFiles = walk(releaseRoot)
const releaseRelativeFiles = releaseFiles.map(releasePath)

const userDatabaseFiles = releaseFiles.map(releasePath).filter(isUserDatabaseArtifact)
if (userDatabaseFiles.length > 0) {
  throw new Error(
    `Release validation failed. User database, journal, WAL, or SHM files must not be shipped:\n${userDatabaseFiles
      .map((path) => `- ${path}`)
      .join('\n')}`
  )
}

const updateMetadataFiles = releaseRelativeFiles.filter((path) =>
  /(?:^|\/)(?:app-update\.yml|latest(?:-[^/]+)?\.yml|.*\.blockmap)$/i.test(path)
)
if (updateMetadataFiles.length > 0) {
  throw new Error(
    `Release validation failed. Auto-update metadata must not be shipped:\n${updateMetadataFiles
      .map((path) => `- ${path}`)
      .join('\n')}`
  )
}

const portableArtifacts = releaseRelativeFiles.filter((path) => /portable|\.zip$/i.test(path))
if (portableArtifacts.length > 0) {
  throw new Error(
    `Release validation failed. Portable artifacts are not permitted in installer-only releases:\n${portableArtifacts
      .map((path) => `- ${path}`)
      .join('\n')}`
  )
}

const rootExecutables = readdirSync(releaseRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
  .map((entry) => entry.name)
const unexpectedRootExecutables = rootExecutables.filter((name) => name !== installerName)
if (unexpectedRootExecutables.length > 0) {
  throw new Error(
    `Release validation failed. Only the expected NSIS installer may be a root artifact:\n${unexpectedRootExecutables
      .map((name) => `- ${name}`)
      .join('\n')}`
  )
}

assertX64WindowsExecutable(join(unpackedRoot, 'MatterDock.exe'))
assertEmbeddedPackage(join(unpackedRoot, 'resources', 'app.asar'))

const wasmPath = join(unpackedRoot, 'resources', 'sql-wasm.wasm')
const wasmSize = statSync(wasmPath).size
if (wasmSize === 0) throw new Error('Release validation failed. sql-wasm.wasm is empty.')

console.log(`Release ${version} contains:`)
console.log(`- Product: ${build.productName} by ${packageJson.author} (${build.appId})`)
console.log(`- x64 NSIS installer: ${installerName}`)
console.log(`- Unpacked x64 executable: ${join(unpackedRoot, 'MatterDock.exe')}`)
console.log('- sql.js WASM resource is present and non-empty')
console.log('- No user SQLite database, journal, WAL, or SHM files')
console.log('- No auto-update metadata or Portable artifacts')

function assertIdentity(metadata, config) {
  const expected = {
    name: 'matterdock',
    author: 'Snugzap',
    appId: 'com.snugzap.matterdock',
    productName: 'MatterDock',
    executableName: 'MatterDock'
  }
  const actual = {
    name: metadata.name,
    author: metadata.author,
    appId: config.appId,
    productName: config.productName,
    executableName: config.executableName
  }
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Release validation failed. ${key} must be ${value}, got ${actual[key] ?? 'missing'}.`)
    }
  }

  if (config.publish !== null) {
    throw new Error('Release validation failed. Auto-update publishing must remain disabled (build.publish must be null).')
  }

  const nsis = config.nsis
  if (!nsis || typeof nsis !== 'object') {
    throw new Error('Release validation failed. NSIS configuration is missing.')
  }
  const nsisChecks = [
    ['nsis.artifactName', nsis.artifactName, 'MatterDock-${version}-Setup.${ext}'],
    ['nsis.uninstallDisplayName', nsis.uninstallDisplayName, 'MatterDock'],
    ['nsis.shortcutName', nsis.shortcutName, 'MatterDock'],
    ['nsis.createStartMenuShortcut', nsis.createStartMenuShortcut, true],
    ['nsis.createDesktopShortcut', nsis.createDesktopShortcut, true],
    ['nsis.deleteAppDataOnUninstall', nsis.deleteAppDataOnUninstall, false],
    ['nsis.differentialPackage', nsis.differentialPackage, false]
  ]
  for (const [key, actual, expectedValue] of nsisChecks) {
    if (actual !== expectedValue) {
      throw new Error(`Release validation failed. ${key} must be ${expectedValue}, got ${actual}.`)
    }
  }
}

function assertWindowsTarget(config) {
  const targets = Array.isArray(config.win?.target) ? config.win.target : []
  const valid =
    targets.length === 1 &&
    targets[0]?.target === 'nsis' &&
    Array.isArray(targets[0]?.arch) &&
    targets[0].arch.length === 1 &&
    targets[0].arch[0] === 'x64'
  if (!valid) {
    throw new Error('Release validation failed. Windows targets must be x64 NSIS Installer-only.')
  }
}

function isUserDatabaseArtifact(path) {
  return /(?:^|\/)[^/]*(?:\.(?:sqlite|sqlite3|db)(?:-(?:journal|wal|shm))?|-(?:journal|wal|shm))$/i.test(path)
}

function assertX64WindowsExecutable(path) {
  const bytes = readFileSync(path)
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error(`Release validation failed. ${path} is not a Windows PE executable.`)
  }
  const peOffset = bytes.readUInt32LE(0x3c)
  if (peOffset + 6 > bytes.length || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') {
    throw new Error(`Release validation failed. ${path} has no valid PE header.`)
  }
  const machine = bytes.readUInt16LE(peOffset + 4)
  if (machine !== 0x8664) {
    throw new Error(`Release validation failed. ${path} is not x64 (PE machine 0x${machine.toString(16)}).`)
  }
}

function assertEmbeddedPackage(asarPath) {
  const require = createRequire(import.meta.url)
  let asar
  try {
    asar = require('@electron/asar')
  } catch (error) {
    throw new Error('Release validation failed. @electron/asar is required to inspect app.asar.', { cause: error })
  }

  const entries = asar
    .listPackage(asarPath)
    .map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, ''))
  const embeddedDatabaseFiles = entries.filter(isUserDatabaseArtifact)
  if (embeddedDatabaseFiles.length > 0) {
    throw new Error(
      `Release validation failed. User database files are embedded in app.asar:\n${embeddedDatabaseFiles
        .map((path) => `- ${path}`)
        .join('\n')}`
    )
  }

  if (!entries.includes('package.json')) {
    throw new Error('Release validation failed. app.asar does not contain package.json.')
  }
  let embeddedPackage
  try {
    embeddedPackage = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'))
  } catch (error) {
    throw new Error('Release validation failed. app.asar package.json is unreadable.', { cause: error })
  }
  if (embeddedPackage.name !== packageJson.name || embeddedPackage.version !== version) {
    throw new Error(
      `Release validation failed. Embedded app identity is ${embeddedPackage.name ?? 'unknown'} ${embeddedPackage.version ?? 'unknown'}, expected ${packageJson.name} ${version}.`
    )
  }
}

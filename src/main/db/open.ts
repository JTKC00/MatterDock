import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { AppError, USER_ERRORS } from '@shared/errors'

const require = createRequire(import.meta.url)

let sqlPromise: Promise<SqlJsStatic> | null = null

export type SqlJsLoadOptions = {
  packaged?: boolean
  wasmPath?: string
}

function wasmCandidates(options?: SqlJsLoadOptions): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const resolved = (() => {
    try {
      return dirname(require.resolve('sql.js'))
    } catch {
      return null
    }
  })()

  if (options?.packaged) {
    return [options.wasmPath ?? join(process.resourcesPath, 'sql-wasm.wasm')]
  }

  return [
    options?.wasmPath,
    process.env.MATTERDOCK_SQL_WASM,
    process.resourcesPath ? join(process.resourcesPath, 'sql-wasm.wasm') : null,
    resolved ? join(resolved, 'sql-wasm.wasm') : null,
    join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    join(here, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
    join(here, '../../../node_modules/sql.js/dist/sql-wasm.wasm')
  ].filter((value): value is string => Boolean(value))
}

export async function loadSqlJs(options?: SqlJsLoadOptions): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const path = wasmCandidates(options).find((candidate) => existsSync(candidate))
      if (!path) {
        throw new AppError(USER_ERRORS.database, 'SQL_WASM_MISSING')
      }
      const wasmBinary = Uint8Array.from(readFileSync(path)).buffer
      return initSqlJs({ wasmBinary })
    })()
  }
  return sqlPromise
}

export async function openDatabase(filePath: string): Promise<Database> {
  const SQL = await loadSqlJs()
  if (existsSync(filePath)) {
    const fileBuffer = readFileSync(filePath)
    const db = new SQL.Database(fileBuffer)
    db.run('PRAGMA foreign_keys = ON')
    return db
  }
  mkdirSync(dirname(filePath), { recursive: true })
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  return db
}

export function persistDatabase(db: Database, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const exported = db.export()
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, Buffer.from(exported))
  renameSync(tempPath, filePath)
}

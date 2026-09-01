import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'

export type ApplicationResourcePaths = {
  preload: string
  renderer: string
  sqlWasm: string
}

export function applicationResourcePaths(mainDirectory: string, resourcesDirectory: string): ApplicationResourcePaths {
  return {
    preload: join(mainDirectory, '../preload/index.cjs'),
    renderer: join(mainDirectory, '../renderer/index.html'),
    sqlWasm: join(resourcesDirectory, 'sql-wasm.wasm')
  }
}

export function missingApplicationResources(
  paths: ApplicationResourcePaths,
  options: { requireSqlWasm: boolean },
  exists: (path: string) => boolean = existsSync
): string[] {
  const required = [
    ['preload', paths.preload],
    ['renderer', paths.renderer],
    ...(options.requireSqlWasm ? [['sql.js WASM', paths.sqlWasm]] : [])
  ] as const

  return required.filter(([, path]) => !exists(path)).map(([name, path]) => `${name}: ${path}`)
}

export function assertApplicationResources(
  paths: ApplicationResourcePaths,
  options: { requireSqlWasm: boolean }
): void {
  const missing = missingApplicationResources(paths, options)
  if (missing.length === 0) return

  throw new AppError(
    `MatterDock cannot start because required application resources are missing:\n${missing.join('\n')}`,
    'RESOURCE_MISSING'
  )
}

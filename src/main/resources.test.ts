import { describe, expect, it } from 'vitest'
import { applicationResourcePaths, assertApplicationResources, missingApplicationResources } from './resources'

describe('packaged application resources', () => {
  const paths = applicationResourcePaths(
    'C:\\Program Files\\MatterDock\\resources\\app.asar\\out\\main',
    'C:\\Program Files\\MatterDock\\resources'
  )

  it('resolves preload, renderer and WASM paths from the packaged layout', () => {
    expect(paths).toEqual({
      preload: 'C:\\Program Files\\MatterDock\\resources\\app.asar\\out\\preload\\index.cjs',
      renderer: 'C:\\Program Files\\MatterDock\\resources\\app.asar\\out\\renderer\\index.html',
      sqlWasm: 'C:\\Program Files\\MatterDock\\resources\\sql-wasm.wasm'
    })
  })

  it('reports missing required resources instead of allowing a silent startup failure', () => {
    const missing = missingApplicationResources(paths, { requireSqlWasm: true }, (path) => path === paths.renderer)
    expect(missing).toEqual([
      `preload: ${paths.preload}`,
      `sql.js WASM: ${paths.sqlWasm}`
    ])
    expect(() => assertApplicationResources(paths, { requireSqlWasm: true })).toThrow('required application resources')
  })

  it('does not require the packaged-only WASM copy during development', () => {
    expect(missingApplicationResources(paths, { requireSqlWasm: false }, () => true)).toEqual([])
  })
})

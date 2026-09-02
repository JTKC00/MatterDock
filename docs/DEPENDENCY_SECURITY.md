# MatterDock Dependency Security

## Baseline

Baseline was collected from the exact PR #9 merge head `4a50786f6688c456adfdf9922b86ec0739791284` after a clean `npm ci` on 2026-09-02. The npm registry request required Node's system CA in this environment; no `strict-ssl` setting was changed.

| Measure | Baseline |
|---|---:|
| Electron | `37.10.3` |
| electron-builder | `26.8.1` |
| electron-vite / Vite | `5.0.0` / `7.3.6` |
| Playwright | `1.62.1` |
| React | `19.2.8` |
| sql.js | `1.14.2` |
| Full `npm audit` total | 9 |
| Critical | 0 |
| High | 9 |
| Moderate | 0 |
| Low | 0 |
| Production `npm audit --omit=dev` total | 0 |
| Production critical / high / moderate / low | 0 / 0 / 0 / 0 |

The nine high count is the npm audit package-node count, not nine independent runtime vulnerabilities. The Electron entry aggregates multiple Electron advisories, while the remaining entries are transitive nodes in the Electron installer or electron-builder tree.

## Classification

| Package | Baseline version | Severity | Audit path / owner | Runtime / Build | Fixed by |
|---|---:|---|---|---|---|
| `electron` | `37.10.3` | high | direct dev dependency; Electron binary is the shipped desktop runtime | **Category A — runtime/shipped** | `electron@44.1.1` |
| `extract-zip` | `2.0.1` | high | `electron@37.10.3` → `extract-zip`; Electron install-time extractor | **Category B — build/dev-only** | Electron 44's `@electron-internal/extract-zip@1.0.5` |
| `app-builder-lib` | `26.8.1` | high | `electron-builder@26.8.1` → `app-builder-lib` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`app-builder-lib@26.16.0`) |
| `builder-util` | `26.8.1` | high | `electron-builder` → `builder-util` → `builder-util-runtime` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`builder-util@26.16.0`) |
| `builder-util-runtime` | `9.5.1` | high | `electron-builder` → `builder-util-runtime` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`builder-util-runtime@9.7.0`) |
| `dmg-builder` | `26.8.1` | high | `electron-builder` → `dmg-builder` → `app-builder-lib` / `builder-util` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`dmg-builder@26.16.0`) |
| `electron-builder` | `26.8.1` | high | direct dev dependency; package/build orchestration | **Category B — build/dev-only** | `electron-builder@26.16.0` |
| `electron-builder-squirrel-windows` | `26.8.1` | high | `app-builder-lib` → `electron-builder-squirrel-windows` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`electron-builder-squirrel-windows@26.16.0`) |
| `electron-publish` | `26.8.1` | high | `app-builder-lib` → `electron-publish` | **Category B — build/dev-only**; transitive owner `electron-builder` | `electron-builder@26.16.0` (`electron-publish@26.16.0`) |

The baseline advisories and ranges reported by npm were:

- `app-builder-lib` family: `GHSA-7g7r-gx96-252g`, affected through `26.14.0`, fixed from `26.15.0`.
- `builder-util-runtime`: `GHSA-p2f4-r6v6-j797`, affected below `9.7.0`.
- `electron`: Electron advisories affecting the `37.10.3` line, including high-severity findings for offscreen/window lifecycle, permission/IPC-related behavior, command-line switch injection, custom protocol cross-origin reads, context isolation, and sandboxed iframe popup handling.
- `extract-zip`: `GHSA-jmr9-qjv8-65gv`, affected through `2.0.1`.

`builder-util`, `dmg-builder`, `electron-builder`, `electron-builder-squirrel-windows`, and `electron-publish` were counted as high package nodes because npm propagated the two builder advisories through their dependency paths. They were not separate top-level owners and were remediated through the normal stable electron-builder update.

## Fixes applied

- Upgraded the direct dev dependency `electron` from `^37.10.3` to `^44.1.1`.
- Upgraded the direct dev dependency `electron-builder` from `^26.8.1` to `^26.16.0`.
- Kept `electron-vite@5.0.0`, `vite@7.3.6`, `@playwright/test@1.62.1`, React, and `sql.js` unchanged because they are already compatible with the target and are unrelated to the audit findings.
- Updated `package-lock.json` through a normal top-level install. No `overrides` entry was added, and no transitive dependency was forced independently.
- Added an explicit `install:electron` step because Electron 42 and later intentionally do not download the binary from an npm `postinstall` script. Unit-test, CI, packaging, and E2E scripts now invoke the local `install-electron` binary explicitly.
- Updated the `context:copy` IPC handler to await Electron 44's asynchronous `clipboard.writeText()` API.

No prerelease Electron or build-tool target was selected: Electron, electron-builder, electron-vite, Vite, and Playwright remain on stable release lines. The lockfile retains a few existing dev-only transitive prerelease nodes required by stable parents (for example `postject@1.0.0-alpha.6`, `gensync@1.0.0-beta.2`, and `@rolldown/pluginutils@1.0.0-beta.27`); they were present in the baseline and are not shipped in `app.asar`.

## Electron 37 to 44 compatibility audit

The 38–44 breaking-change notes were checked against MatterDock's actual main, preload, renderer, packaging, and E2E surfaces. Only one used API required a code change:

| Electron change area | MatterDock usage / evidence | Result |
|---|---|---|
| Renderer clipboard APIs become asynchronous and are no longer directly exposed as before | Main-process `context:copy` uses `clipboard.writeText()` in `src/main/ipc.ts`; renderer clipboard use is the browser API in the document UI | Main handler now awaits the Promise; no Node clipboard access is exposed to the renderer |
| Preload sandbox and `contextBridge` restrictions | `src/preload/index.ts` exposes a fixed `matterdock` object of typed invoke wrappers; it does not expose `ipcRenderer`, filesystem, SQLite, or Node globals | No compatibility rewrite or boundary expansion required |
| BrowserWindow security defaults and navigation/window APIs | `src/main/index.ts` creates one local window, denies `setWindowOpenHandler`, prevents `will-navigate`, and denies permission requests | Existing security boundary retained |
| Node/Chromium/runtime changes across Electron 38–44 | No MatterDock use of removed `webFrame` routing APIs, `net.request` frame destinations, PDF webContents APIs, cookie `showHidden`, quota APIs, or native modules was found | No speculative changes |
| Electron 42+ distribution change | Electron no longer downloads its binary from npm `postinstall` | Explicit `install:electron` is used by local package/E2E scripts and CI |
| Electron 44 platform support | MatterDock's Windows target is x64 NSIS only | Target is within Electron 44's supported 64-bit architecture set |

The test launcher's `--no-sandbox` argument is limited to the existing automated test harness. The production `BrowserWindow` configuration remains `sandbox: true`; no compatibility change disables it in the application.

## After modernization

| Measure | After |
|---|---:|
| Electron | `44.1.1` |
| electron-builder | `26.16.0` |
| electron-vite / Vite | `5.0.0` / `7.3.6` |
| Playwright | `1.62.1` |
| Full `npm audit` total | 0 |
| Critical / high / moderate / low | 0 / 0 / 0 / 0 |
| Production `npm audit --omit=dev` total | 0 |
| Production critical / high / moderate / low | 0 / 0 / 0 / 0 |

The post-update tree reports `@electron-internal/extract-zip@1.0.5` under Electron and `builder-util-runtime@9.7.0` under electron-builder. The vulnerable `extract-zip@2.0.1` and `builder-util-runtime@9.5.1` nodes are gone.

## Runtime/shipped dependency conclusion

The production tree is unchanged at the application boundary and remains audit-clean. `npm ls --omit=dev` contains the production dependencies used by the packaged app (`react`, `react-dom`, `sql.js`, `yauzl`, `yazl`, and the other application libraries), but not Electron's dev/install tree or electron-builder. Electron itself is handled separately as the shipped runtime binary and is now on `44.1.1`; the Electron 37 high findings are therefore remediated at the runtime source.

The build configuration packages `out/**/*`, the application `package.json`, and the explicitly copied sql.js WASM resource. The release validator separately rejects user database artifacts, auto-update metadata, and Portable artifacts. Packaged app inspection and the Windows CI artifact are the authoritative final checks for the shipped tree.

The local Electron 44.1.1 unpacked inspection completed on this branch found `out/main/index.js`, `out/preload/index.cjs`, and `out/renderer/index.html` in `app.asar` (6,104 entries), no Electron/build-tool package paths, no user SQLite artifacts, and a non-empty `resources/sql-wasm.wasm` (658,410 bytes). This is local packaging evidence; the exact-head GitHub CI artifact remains the release evidence for the PR.

## Residual findings

No high, critical, moderate, or low findings remain in either full `npm audit` or `npm audit --omit=dev` after the update. npm install still reports unrelated upstream deprecation warnings for old transitive packages such as `inflight`, `rimraf`, `glob`, and `boolean`; they are not findings in the current npm audit result and were not upgraded through an unrelated dependency sweep.

## Public Beta conclusion

The dependency/runtime security technical gate is cleared for this modernization slice: the shipped Electron runtime is `44.1.1`, the build toolchain is on stable electron-builder `26.16.0`, and both full and production audits report zero vulnerabilities. Public Beta still depends on the independent release gates documented in `docs/RELEASE_CHECKLIST.md`, including exact-head GitHub CI, packaged regression coverage, installer-only validation, and the truthful unsigned Authenticode status when signing secrets are unavailable.

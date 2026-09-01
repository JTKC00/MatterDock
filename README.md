# MatterDock

**MatterDock by Snugzap** — Keep every matter on track.

Local-first desktop workspace for matters, follow-ups and documents.

MatterDock helps you keep one administrative matter in one place: current status, timeline, follow-ups, waiting items, contacts, organisations, documents and the next action.

It is not a CRM, ERP, HRIS, task manager, document management system, or AI chatbot.

## Product

A **Matter** is one thing that needs ongoing handling — a government application, a contract dispute, an HR case, a supplier follow-up, a complaint. It has a history, people, organisations and documents.

```
Organisation → Contacts → Matters → Timeline / Tasks / Documents
```

- **Matter** — the thing you are handling
- **Timeline** — what has already happened
- **Task** — what you still need to do
- **Waiting** — you have acted, and are waiting on someone else
- **Next Action** — the single most important thing to do next

This repository currently ships through **Phase 9**: Matter Core, Timeline, Actions / Waiting / Next Action, Documents, Global Search, Prepare Context, Backup / Restore, Data Portability, English / Traditional Chinese (Hong Kong) interface languages, and hardened Windows distribution.

## Requirements

- Windows 10/11
- Node.js 22+ (developed on Node 24)
- npm 11+

Rust / Visual Studio C++ Build Tools are **not** required for this release. The desktop shell is Electron because this machine did not have a Tauri toolchain (Rust + MSVC).

## Setup

```bash
npm install
npm run dev
```

The development app opens a native window. Your data is stored locally and works offline.

If `npm run dev` shows `403 Restricted` / `outside of Vite serving allow list`, the project path contains a `~` (`C:\~\Development\MatterDock`). Vite 7 blocks those paths on Windows by default. This repo already sets `server.fs.strict: false` in `electron.vite.config.ts` for that reason.

### Other commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the desktop app in development |
| `npm run build` | Production build to `out/` |
| `npm run package:win:dir` | Build an unpacked x64 Windows application to `release/win-unpacked/` |
| `npm run test:e2e:packaged` | Build the unpacked Windows application and run its packaged-app smoke test |
| `npm run package:win` | Build the x64 NSIS installer only to `release/` |
| `npm run verify:release` | Validate the unpacked app, packaged WASM resource, and release artifacts |
| `npm run release:win` | Run the release checks, packaged smoke test, and Windows release build |
| `npx electron .` | Launch the production build |
| `npm run typecheck` | TypeScript (main + renderer) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Build, then Playwright Electron persistence test |

CI on `main` and pull requests runs typecheck, lint, unit tests, build, the Electron e2e, the packaged-app smoke test, and the Windows release build on `windows-latest`.

MatterDock distributes Windows releases as x64 NSIS installers only. Portable builds are not produced or published.
Windows CI accepts `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` repository secrets for Authenticode signing; a build without those secrets is unsigned and is not ready for broad public distribution.

## What works now

- Desktop shell with sidebar navigation
- **Matters** — list, create, detail, inline edit, archive / restore, and permanent deletion of archived Matters
- **Timeline** — notes, phone calls, emails, WhatsApp, meetings and letters on the Matter
- **Actions, Waiting and Next Action** — one clear next step per Matter
- **Today** — overdue, due today, and who you are waiting on
- **Waiting** — follow-up due, upcoming, and items without a date
- **Documents** — reference an original file or keep a managed workspace copy
- **Search** — find matters, people, activity and document metadata
- **Prepare Context** — preview, redact and export a Matter as Markdown, plain text or JSON
- **Backup** — portable MatterDock backup of the database and managed document copies
- **Restore** — validated whole-workspace restore with a pre-restore recovery snapshot
- **Data export** — open JSON, CSV and managed document files for use outside MatterDock
- **Organisations** — list, create, edit, detail, alias management
- **Contacts** — list, create, edit, detail, link to organisation and matter
- **Tags** — create on the fly, attach to a matter
- **Language** — English and 繁體中文（香港）, with live switching and a local preference outside backups
- Local SQLite persistence (survives quit and relaunch)
- `Ctrl+N` — New Matter
- `Ctrl+K` — Search
- `Ctrl+Shift+A` — Add Activity on Matter Detail

## Data

All core data stays on this computer.

- **Installed Windows builds:** `%APPDATA%\MatterDock\matterdock.sqlite` by Electron convention, outside the application installation directory
- **Development:** the same default path when launched normally, or `MATTERDOCK_USER_DATA` if set
- The NSIS uninstaller is configured not to delete MatterDock user data. Updates, reinstallations, and normal uninstall/reinstall cycles therefore leave the database, managed document copies, backups, recovery data, and local settings available for the next installation.
- **No account, no cloud, no telemetry, no AI API**

Demo seed data is loaded only for an unpackaged development run when the database is empty. Packaged applications never seed, even if a seed environment variable is present. Release artifacts contain no user database.

Override the data directory:

```bash
set MATTERDOCK_USER_DATA=C:\path\to\profile
npx electron .
```

Disable seed even in development:

```bash
set MATTERDOCK_DISABLE_SEED=1
npm run dev
```

## Architecture

```
src/
├── main/            Electron main process, SQLite, IPC
│   ├── db/          Versioned migrations + repositories
│   └── backup/      Portable backup, restore, data export
├── preload/         contextBridge API
├── shared/          Types, Zod schemas, alias normalization
└── renderer/        React UI
    └── src/
        ├── app/           Shell, sidebar
        ├── features/      matters, organisations, contacts, settings
        └── components/    Dialogs, fields, badges
```

- **Desktop:** Electron 37 + electron-vite
- **UI:** React 19, TypeScript, HashRouter
- **State:** TanStack Query over IPC
- **Validation:** Zod
- **Database:** SQLite via sql.js (WASM), versioned migrations, atomic file persist
- **Windows distribution:** electron-builder, x64 NSIS installer only; Portable builds are not produced or published; no auto-update service

Renderer never runs SQL. The main process owns the database.

## Domain rules worth knowing

- A matter can be created with only a **title**
- One matter can have many contacts; a contact can belong to many matters
- Archive hides a matter from the default list; it is not a prominent delete
- Permanent deletion is available only from an archived Matter and is irreversible. It removes the Matter-owned rows, work, timeline activity, and document metadata from the current workspace.
- MatterDock-managed document copies are quarantined and removed safely after the database deletion commits; referenced original files remain unchanged in their original locations.
- Organisation, Contact, and Tag records are preserved. Existing unrelated Matters and their records are preserved as well.
- Backups are historical snapshots: restoring a backup made before a permanent deletion can intentionally bring that historical Matter back. Backups are not rewritten by permanent deletion.
- Trash and soft-delete remain future work.
- An organisation cannot be deleted while matters still point at it
- A contact cannot be deleted while it is still linked to a matter
- Unlinking a contact removes the relationship only
- Documents never delete a user’s original file
- Search is local metadata only — not file contents, not AI

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Licence

UNLICENSED — MatterDock by Snugzap.

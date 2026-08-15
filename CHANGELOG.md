# Changelog

All notable changes to MatterDock are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-15

Foundation Sprint: Phase 1 (Foundation) + Phase 2 (Matter Core).

First runnable MatterDock desktop app. Local-first. Matter-centric. No cloud, no account, no AI.

### Added

#### Desktop shell
- Windows-first desktop app (Electron + React + TypeScript)
- Sidebar: Today, Matters, Waiting, Search, Organisations, Contacts, Settings
- Product empty states for Today, Waiting, Search and Settings
- Brand: **MatterDock by Snugzap** — *Keep every matter on track.*
- `Ctrl+N` opens New Matter

#### Database
- Local SQLite file (`matterdock.sqlite`) owned by the main process
- Versioned migration `1 / foundation` via `schema_migrations`
- Tables: `organisations`, `organisation_aliases`, `contacts`, `matters`, `matter_contacts`, `tags`, `matter_tags`
- Foreign keys, unique constraints and indexes
- Atomic persist (write temp file, then rename)
- Development-only seed when the database is empty (`eMPF` + `Lands Department` sample matters)
- Production databases are not auto-seeded

#### Matters
- List with title, organisation, status, reference, tags and relative updated time
- Filters: search, status (including Archived), tag, sort
- Create Matter modal — title required; organisation, reference, status and tags optional
- Inline organisation search / create while creating a matter
- Detail view: header, status, Next Action empty state, Timeline placeholder
- Inline / panel editing: status, priority, organisation, reference, contacts, tags
- Archive and restore
- Status: New, In Progress, Waiting, Scheduled, Completed, Archived
- Priority: low, normal, high, urgent (default normal)

#### Organisations
- List with canonical name, alias preview and active matter count
- Create, edit, detail
- Alias add / remove with trim, whitespace and case normalization
- Duplicate and blank aliases rejected
- Active matters vs completed / archived matters on the detail page
- Delete blocked while matters still reference the organisation

#### Contacts
- List, create, edit, detail
- Optional organisation, job title, phone, email, notes
- Email validated when provided
- Link / unlink to a matter, with optional role
- Search existing contact before creating a new one
- Related matters on the contact detail page
- Delete blocked while the contact is still linked to a matter

#### Quality
- Zod validation with product-facing error messages
- User-visible toasts on save / failure (changes are not silently dropped)
- Vitest coverage for normalization, schemas and SQLite repositories
- Playwright Electron e2e: create a full matter, quit, relaunch, confirm persistence

### Changed

- Preferred stack in the original brief was Tauri. This release uses Electron + sql.js (WASM SQLite) because the build machine had Node but no Rust toolchain and no MSVC / Visual Studio Build Tools.

### Not in this release

These were explicitly out of scope for the Foundation Sprint:

- Timeline events (notes, calls, emails, meetings, letters)
- Tasks, waiting engine, Next Action implementation, due dates, reminders
- Today / Waiting dashboards
- Documents and file attachments
- Global search, FTS5 UI, fuzzy matching
- AI, cloud sync, accounts, multi-user
- Integrations (Gmail, Outlook, Drive, …)
- Windows installer / packaged release

### Security / privacy

- Data stays on the local machine
- No telemetry, analytics, crash reporting or remote logging
- No network permission requests are granted
- Renderer runs with `contextIsolation` and a sandboxed CJS preload
- CSP is `default-src 'self'`

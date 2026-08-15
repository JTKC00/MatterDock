# Changelog

All notable changes to MatterDock are recorded here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.3.2] — 2026-08-15

Data Fidelity & Archive Lifecycle Patch.

### Fixed

- Archived Matters no longer surface open work items in Today or Waiting
- Restored Matters resume normal global work-item visibility
- Multi-line notes preserve line breaks
- Required date/time fields no longer silently fall back to current time

## [0.3.1] — 2026-08-15

Work Item Integrity & UX Patch.

### Fixed

- Next Action can be explicitly cleared from the work-item menu, and that clear survives relaunch
- Next Action replacement no longer happens from Edit or Create Save
- Waiting items cannot lose their waiting target during edit
- Today uses the correct attention reason (Overdue / Today / Urgent / High priority)
- Waiting Next Action shows follow-up status

### Changed

- Next Action lifecycle lives in the work-item **•••** menu (`Set` / `Clear`)
- Create dialogs only offer “Set as Next Action” when the matter has none
- `completeAction` only accepts actions; `resolveWaiting` only accepts waiting items

## [0.3.0] — 2026-08-15

Added — Tasks, Waiting & Next Action.

A Matter now answers “what should I do next?” and “who am I waiting on?” without becoming a generic todo list.

### Added

- Migration `4 / tasks_waiting_next_action` with a partial unique index: one open Next Action per Matter
- Actions: create, edit, due date, priority, complete, cancel, reopen
- Waiting: contact or free text, waiting since, follow-up date, resolve, cancel
- Contact deletion keeps `waiting_for_text` so the name still shows
- Matter Detail: Next Action, Open Items (Actions / Waiting), collapsed Completed / Closed, Timeline below
- Today: overdue / due today / waiting counts, Needs Attention, compact Waiting, Recent Matters
- Waiting page: Follow-up due, Upcoming, No follow-up date
- Local-day overdue and due-today helpers
- Durable writes through DatabaseStore

### Not in this release

Notifications, recurring tasks, assignees, Kanban, documents, search, AI, or automatic Matter status changes.

## [0.2.1] — 2026-08-15

Timeline UX fixes.

### Fixed

- Contact picker no longer keeps a stale selected contact when the typed name no longer matches that person.
- Timeline events always expose a compact **•••** menu for Edit and Delete, including short events with no “Show more”.

## [0.2.0] — 2026-08-15

Added — Matter Timeline.

A Matter now keeps a unified administrative history. Notes, calls, emails, WhatsApp messages, meetings and letters sit on one newest-first timeline.

### Added

- Migration `3 / matter_timeline`: `events` and `event_email_details`
- Matter Detail `+ Add Activity` for Note, Phone Call, Email, WhatsApp, Meeting and Letter
- Date grouping (Today / Yesterday / dated), compact event cards, expand for full body and email metadata
- Optional contact on an activity, with Matter contacts listed first
- Edit and delete (with confirmation). Create / edit / delete updates `matters.updated_at`
- Durable persistence through the existing DatabaseStore
- `Ctrl+Shift+A` opens Add Activity on Matter Detail

### Not in this release

Tasks, Waiting, Next Action, documents, email sync, WhatsApp import, system events, or automatic status changes.

## [0.1.1] — 2026-08-15

Foundation Hardening.

No new product surfaces. This release makes the existing Foundation trustworthy: a successful save is a durable disk write, archive remembers the previous status, and Matter search understands organisation aliases.

### Fixed

- Mutations now persist the SQLite file **before** IPC returns success. A disk write failure is returned as an error (`Changes could not be saved to disk.`) and the in-memory database is rolled back to the pre-mutation snapshot.
- Archive → Restore now restores the status the matter had before archive (Waiting stays Waiting, Scheduled stays Scheduled, and so on). Previously restore always became In Progress (or Completed if `completed_at` was set).
- Matter list search matches organisation aliases (canonical name still works). Searching `中電` or `clp` finds matters under CLP Power Hong Kong Limited.

### Added

- Migration `2 / archive_previous_status` adds `matters.status_before_archive`. Existing archived rows without that field fall back to `completed` when `completed_at` is set, otherwise `in_progress`.
- GitHub Actions quality gate on `windows-latest`: typecheck, lint, unit tests, build, and Electron e2e.

### Security

- Unchanged: `contextIsolation`, no `nodeIntegration`, sandboxed preload, denied permission requests, blocked external navigation, no telemetry or cloud.

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

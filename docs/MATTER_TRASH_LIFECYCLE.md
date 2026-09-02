# Matter Trash Lifecycle Contract

## Purpose

MatterDock Trash is a reversible lifecycle state for hiding unwanted Matters from normal workspace views without immediately destroying their data.

User-facing lifecycle:

`Live / Completed / Archived Matter → Move to Trash → Restore OR Delete permanently`

Trash is manual retention only in this slice. There is no automatic purge, Empty Trash, or bulk permanent deletion.

## Data model

Trash is **not** a Matter workflow status.

Do not add `trashed` to `MATTER_STATUSES` and do not widen the existing Matter `status` CHECK constraint.

Migration v6 adds:

```sql
ALTER TABLE matters ADD COLUMN trashed_at TEXT;
CREATE INDEX idx_matters_trashed_at ON matters(trashed_at);
```

`trashed_at IS NULL` means live workspace Matter.

`trashed_at IS NOT NULL` means Matter is in Trash.

The existing `status`, `archived_at`, `completed_at`, and `status_before_archive` remain unchanged while a Matter is in Trash.

This makes Restore exact:

- `in_progress → Trash → Restore` returns to `in_progress`.
- `waiting → Trash → Restore` returns to `waiting`.
- `completed → Trash → Restore` returns to `completed`.
- `archived → Trash → Restore` returns to the same archived state, preserving archive history.

No `status_before_trash` field is required.

## Move to Trash

Moving a Matter to Trash must:

1. Verify the Matter exists.
2. Set `trashed_at` to the current timestamp.
3. Update `updated_at` consistently with normal Matter mutations.
4. Leave Matter workflow/archive fields unchanged.
5. Leave all Matter-owned child rows unchanged.
6. Perform no filesystem operation.

The operation should be safely idempotent unless repository conventions require an explicit already-trashed error.

Suggested database primitive:

`moveMatterToTrash(db, id)`

Suggested public API:

`matters.moveToTrash(id)`

## Restore from Trash

Restoring must:

1. Verify the Matter exists.
2. Clear `trashed_at`.
3. Update `updated_at` consistently.
4. Leave workflow/archive/history fields unchanged.
5. Leave all child rows unchanged.
6. Perform no filesystem operation.

Suggested database primitive:

`restoreMatterFromTrash(db, id)`

Suggested public API:

`matters.restoreFromTrash(id)`

Archive Restore and Trash Restore must remain distinct APIs and UI concepts.

## Filesystem contract

Move to Trash and Restore must not delete, move, rename, quarantine, rewrite, or otherwise modify files.

For `storage_mode = reference`:

- document metadata remains;
- referenced original remains untouched.

For `storage_mode = copy`:

- document metadata remains;
- managed workspace directory remains active and unchanged.

Quarantine/deletion remains exclusive to final permanent deletion.

## Permanent deletion after Trash

PR #6 established the safe permanent-delete implementation:

`validate → quarantine managed copies → durable DB deletion/persist → best-effort quarantine cleanup`

This implementation must be reused.

After Trash lands, user-facing permanent deletion is allowed only for a Matter whose `trashed_at IS NOT NULL`.

The main-process permanent-delete service must reject non-trashed Matters with a safe explicit error such as `MATTER_DELETE_REQUIRES_TRASH`.

The low-level database `deleteMatterRecord` remains an internal primitive and does not need to encode UI lifecycle policy.

Permanent deletion from Trash keeps all existing PR #6 guarantees:

- Matter-owned rows cascade away;
- MatterDock managed copies are safely removed;
- referenced originals remain untouched;
- Organisation, Contact, and Tag records remain;
- failure recovery remains intact.

## Query scopes

Normal Matter queries must default to live scope:

`m.trashed_at IS NULL`

Trash queries must explicitly request Trash scope:

`m.trashed_at IS NOT NULL`

Use an explicit lifecycle query field such as:

```ts
scope?: 'live' | 'trash'
```

Do not overload `MatterStatus` with Trash.

`status: 'all'` still means all workflow statuses within the selected lifecycle scope.

## Live-workspace isolation

A trashed Matter stays in the database for Restore but must disappear from normal workspace surfaces.

Queries that expose Matters or Matter-owned records must exclude records belonging to trashed Matters, including as applicable:

- Matter list and status filters;
- Today / recent Matters;
- Waiting/task-derived Matter views;
- global search Matter hits;
- global search timeline/event hits;
- global search document hits;
- Organisation Matter relationships and counts;
- Contact Matter relationships and counts;
- Tag-derived Matter lists/counts;
- other live joins through `matters`.

Do not delete child rows to hide them. Restore must reveal the intact Matter and its data again.

## UI contract

### Normal Matter detail

Every non-trashed Matter may expose `Move to Trash` / `移至垃圾桶`.

This includes Active, Completed, and Archived Matters.

The old direct permanent-delete action on Archived Matter detail is removed.

Move-to-Trash uses an explicit confirmation naming the Matter and explains that it can be restored later.

After success:

- navigate back to Matters;
- show localized success feedback;
- live lists/search no longer show the Matter.

### Trash page

Add `/trash` and a sidebar entry `Trash` / `垃圾桶`, preferably before Settings.

Trash lists only trashed Matters and provides:

- Restore / `復原`;
- Delete permanently / `永久刪除`.

Restore returns the exact pre-Trash workflow/archive state.

Permanent Delete reuses the high-friction confirmation and safe deletion service from PR #6.

A separate Trash detail route is optional for this slice. Prefer a small, clear implementation over duplicating the full Matter detail UI.

### Direct stale links

A stale `/matters/:id` route for a trashed Matter must not expose the normal editable Matter detail.

Redirect to Trash or render a clear Trash state with only Trash-appropriate actions.

## Cache contract

Move, Restore, and Permanent Delete must invalidate/remove affected React Query caches so lifecycle changes are immediate without a full page reload.

Audit Matter, Today, Waiting, Search, Tag, Organisation, Contact, and Matter-owned detail caches.

## Backup contract

Trash state is ordinary workspace database state and is included in backup snapshots.

Managed copies for trashed Matters remain normal workspace copies and therefore remain part of existing backup behavior.

Restoring a historical backup restores whichever Trash state existed when that backup was created.

Existing backup archives are never rewritten when a Matter moves to/from Trash or is permanently deleted later.

## Retention

This slice implements manual Trash retention only.

Out of scope:

- automatic purge timers;
- scheduled retention jobs;
- Empty Trash;
- bulk restore/delete;
- secure erase;
- Trash quotas.

## Required safety tests

At minimum verify:

- v5 → v6 migration preserves existing Matter status/history and sets `trashed_at` null;
- Move/Restore preserve all child rows and files;
- Active-origin and Archived-origin restore exactly;
- all live query surfaces exclude Trash and recover after Restore;
- Trash query returns only trashed Matters;
- permanent delete rejects live/non-trashed Matter;
- permanent delete from Trash retains every PR #6 filesystem rollback/path-safety guarantee;
- EN and zh-HK E2E lifecycle;
- packaged Windows x64 NSIS validation remains green.

## Distribution guard

Windows remains x64 NSIS Installer-only.

Do not add Portable targets or artifacts.

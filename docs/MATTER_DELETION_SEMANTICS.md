# Matter Permanent Deletion Semantics

This document is the implementation contract for permanent Matter deletion in MatterDock.

## Scope

This slice adds an explicit irreversible deletion primitive for Matters. It does not add Trash or soft-delete state.

Trash (see `docs/MATTER_TRASH_LIFECYCLE.md`) now owns the user-facing lifecycle. Permanent deletion is allowed only for a Matter whose `trashed_at IS NOT NULL`:

`Live / Completed / Archived Matter → Move to Trash → Restore OR Delete permanently`

This document remains the filesystem and cascade contract for the final delete step. The main-process service rejects non-trashed Matters.

## Database cascade contract

The current schema already uses foreign-key cascades from `matters(id)` for Matter-owned rows, so no migration is required.

Deleting the Matter row must remove:

- `matter_contacts` links
- `matter_tags` links
- `events`
- `event_email_details` through their deleted events
- `tasks`
- `documents` metadata

Deleting a Matter must not delete shared/global records:

- Organisations
- Contacts
- Tags

The database primitive should be narrowly named (for example `deleteMatterRecord`) and should delete only the Matter row, relying on the existing foreign-key cascade model. A missing Matter must raise the existing Matter-not-found error.

## File safety contract

### Referenced originals

A document with `storage_mode = reference` is metadata pointing to a user-owned file outside MatterDock's managed workspace.

Permanent Matter deletion must never delete, move, rename, quarantine, truncate, or otherwise modify a referenced original file. Only its MatterDock metadata is removed by the database cascade.

### MatterDock managed copies

A document with `storage_mode = copy` has a managed workspace directory under MatterDock's documents root.

Permanent deletion must reuse the existing quarantine/recovery model used by document removal:

1. Collect all document records for the Matter before deleting the Matter row.
2. Quarantine every managed-copy directory belonging to that Matter.
3. If any pre-database quarantine step fails, restore any managed copies already quarantined and abort without deleting the Matter.
4. Delete the Matter row inside `DatabaseStore.mutate`, allowing existing foreign-key cascades to remove Matter-owned rows.
5. If database mutation or persistence fails, restore all quarantined managed copies and leave the Matter/data intact.
6. If database deletion succeeds, remove the quarantines best-effort.
7. If final quarantine cleanup fails, do not restore the Matter or an active managed copy. Leave stale quarantine state for existing recovery/cleanup handling and log the cleanup failure.

All destructive filesystem operations must continue to use the existing managed-root path-safety checks. Permanent Matter deletion must never target the documents root itself or arbitrary filesystem paths.

## API contract

Expose a deliberately explicit API such as:

`matters.deletePermanently(id)`

Do not expose a vague generic `delete()` whose irreversible semantics are unclear.

The main process must orchestrate filesystem quarantine/recovery and the transactional database deletion. Renderer code must not manipulate managed files directly.

## UI contract

Only Archived Matter detail exposes the destructive action in this slice.

English: `Delete permanently`

Traditional Chinese (Hong Kong): `永久刪除`

The confirmation dialog must:

- display the Matter title;
- explain that Matter-owned actions, waiting items, timeline activity, links/tags, and document metadata will be removed;
- explain that MatterDock-managed document copies will be deleted;
- explicitly state that referenced original files are not deleted;
- explicitly state that Organisation and Contact records are not deleted;
- state that the operation cannot be undone;
- use an explicit destructive confirmation label (`Delete permanently` / `永久刪除`);
- keep Cancel as the safe/default path;
- prevent duplicate submission while deletion is pending.

After success, navigate to the Matters list and show a localized success notification. On failure, remain on the Matter when possible and show a localized error without claiming that deletion succeeded.

## Backup semantics

Permanent deletion changes only the current workspace.

Existing backup archives are immutable historical snapshots. They must not be rewritten to remove a deleted Matter. Restoring an older backup may therefore restore a Matter that had later been permanently deleted.

## Explicitly out of scope

- Trash / soft-delete state
- retention windows / automatic purge
- bulk deletion
- secure erase / forensic wiping
- deleting Organisation, Contact, or Tag records as part of a Matter cascade
- rewriting existing backup archives
- cloud sync, auth, telemetry, AI, or unrelated redesign
- Portable Windows builds

Windows distribution remains x64 NSIS Installer-only.

## Required regression coverage

Database tests must prove that deleting one Matter removes all Matter-owned rows while preserving unrelated Matters and shared Organisation/Contact/Tag records.

Filesystem/service tests must prove that referenced originals survive unchanged, managed copies are removed on success, quarantines are restored on database/persistence failure, cleanup failure cannot resurrect an active orphan, multiple managed copies recover safely on partial pre-database failure, and path-safety guards remain intact.

IPC/UI/E2E tests must prove that active Matters do not expose direct permanent delete in this slice, archived Matters do, Cancel is safe, confirm deletes and navigates away, EN/zh-HK copy is present, and deleted Matters disappear from live list/search views.

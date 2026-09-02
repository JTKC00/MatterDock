# MatterDock v0.9.0 Release Checklist

Use this checklist for the x64 Windows installer candidate. The release candidate is installer-only; no Portable build or auto-update metadata is part of the distribution.

## Automated

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] `npm run test:e2e:packaged`
- [ ] `npm run package:win:dir`
- [ ] `npm run package:win`
- [ ] `npm run verify:release`
- [ ] `npm run release:hash`
- [ ] GitHub CI Quality gate is green

The packaged checks cover startup without demo seed data, persistence across relaunch, version visibility, Move to Trash, Restore, and permanent deletion from Trash. The release validator checks the unpacked x64 app, `sql.js` WASM, embedded app identity, absence of user database/journal/WAL/SHM files, absence of update metadata, and absence of Portable artifacts.

## Manual Windows acceptance

Status for this candidate: **NOT RUN — requires physical Windows interactive acceptance**.

- [ ] Install `MatterDock-0.9.0-Setup.exe` on a clean Windows x64 machine
- [ ] Launch from the installer and verify MatterDock / Snugzap identity
- [ ] Check English and zh-HK interface language
- [ ] Create and edit a Matter
- [ ] Verify Timeline
- [ ] Verify Tasks and Waiting
- [ ] Verify reference documents and managed document copies
- [ ] Verify Search
- [ ] Create and Restore a backup
- [ ] Move a Matter to Trash
- [ ] Restore a Matter from Trash
- [ ] Permanently Delete a Matter from Trash
- [ ] Quit and relaunch; verify persistence and deletion state
- [ ] Uninstall; verify `%APPDATA%\MatterDock` is not deleted
- [ ] Reinstall; verify the existing database, managed documents, and local preferences are reused
- [ ] Verify installer-only distribution and no Portable artifact

## Distribution evidence

- [ ] Installer filename is `MatterDock-0.9.0-Setup.exe`
- [ ] Record the `npm run release:hash` SHA-256 output
- [ ] Record `Get-AuthenticodeSignature` status for the installer
- [ ] If signing secrets are unavailable, record: **Unsigned — internal/beta testing only**

Signing is not inferred from a successful build. Broad public release remains gated on a valid Authenticode signature.

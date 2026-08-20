import { createRequire } from 'node:module'
import { createWriteStream, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { AppError, USER_ERRORS } from '@shared/errors'
import { archiveEntryDestination, classifyBackupEntry, identityKey } from './paths'

const require = createRequire(import.meta.url)
const yazl = require('yazl') as typeof import('yazl')
const yauzl = require('yauzl') as typeof import('yauzl')

export const BACKUP_ARCHIVE_LIMITS = {
  maxEntries: 20_000,
  maxTotalUncompressed: 32 * 1024 * 1024 * 1024,
  maxEntryUncompressed: 8 * 1024 * 1024 * 1024,
  maxCompressionRatio: 1000,
  minSizeForRatioCheck: 50 * 1024 * 1024
}

export type ZipSourceFile = {
  realPath: string
  archivePath: string
}

export type ZipEntryInfo = {
  fileName: string
  uncompressedSize: number
  compressedSize: number
  isDirectory: boolean
}

const UNIX_S_IFMT = 0o170000
const UNIX_S_IFLNK = 0o120000

export function isSymlinkZipEntry(entry: {
  versionMadeBy: number
  externalFileAttributes: number
}): boolean {
  const madeBy = entry.versionMadeBy >> 8
  if (madeBy !== 3) return false
  const mode = (entry.externalFileAttributes >> 16) & 0xffff
  return (mode & UNIX_S_IFMT) === UNIX_S_IFLNK
}

function assertEntryLimits(entry: {
  fileName: string
  uncompressedSize: number
  compressedSize: number
}, totals: { count: number; uncompressed: number }): void {
  if (totals.count > BACKUP_ARCHIVE_LIMITS.maxEntries) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ARCHIVE_LIMIT')
  }
  if (entry.uncompressedSize > BACKUP_ARCHIVE_LIMITS.maxEntryUncompressed) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ARCHIVE_LIMIT')
  }
  if (totals.uncompressed > BACKUP_ARCHIVE_LIMITS.maxTotalUncompressed) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ARCHIVE_LIMIT')
  }
  if (
    entry.compressedSize > 0 &&
    entry.uncompressedSize > BACKUP_ARCHIVE_LIMITS.minSizeForRatioCheck &&
    entry.uncompressedSize / entry.compressedSize > BACKUP_ARCHIVE_LIMITS.maxCompressionRatio
  ) {
    throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ARCHIVE_LIMIT')
  }
}

export async function writeZip(destinationPath: string, files: ZipSourceFile[]): Promise<void> {
  const zipfile = new yazl.ZipFile()
  const output = createWriteStream(destinationPath)
  const done = pipeline(zipfile.outputStream as unknown as Readable, output)
  for (const file of files) {
    zipfile.addFile(file.realPath, file.archivePath)
  }
  zipfile.end()
  await done
}

export async function listZipEntries(archivePath: string): Promise<ZipEntryInfo[]> {
  const zipfile = await yauzl.openPromise(archivePath, {
    lazyEntries: true,
    autoClose: false,
    validateEntrySizes: true,
    strictFileNames: true
  })
  try {
    const entries: ZipEntryInfo[] = []
    const seen = new Set<string>()
    const totals = { count: 0, uncompressed: 0 }
    for await (const entry of zipfile.eachEntry()) {
      if (entry.isEncrypted()) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ENCRYPTED')
      }
      if (isSymlinkZipEntry(entry)) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_SYMLINK')
      }
      const fileName = entry.fileName
      classifyBackupEntry(fileName)
      const key = identityKey(fileName)
      if (seen.has(key)) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_DUPLICATE_ENTRY')
      }
      seen.add(key)
      totals.count += 1
      totals.uncompressed += entry.uncompressedSize
      assertEntryLimits(entry, totals)
      entries.push({
        fileName,
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
        isDirectory: /\/$/.test(fileName)
      })
    }
    return entries
  } finally {
    zipfile.close()
  }
}

export async function extractBackupZip(archivePath: string, stagingRoot: string): Promise<ZipEntryInfo[]> {
  mkdirSync(stagingRoot, { recursive: true })
  const zipfile = await yauzl.openPromise(archivePath, {
    lazyEntries: true,
    autoClose: false,
    validateEntrySizes: true,
    strictFileNames: true
  })
  try {
    const entries: ZipEntryInfo[] = []
    const seen = new Set<string>()
    const totals = { count: 0, uncompressed: 0 }
    for await (const entry of zipfile.eachEntry()) {
      if (entry.isEncrypted()) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_ENCRYPTED')
      }
      if (isSymlinkZipEntry(entry)) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_SYMLINK')
      }
      const fileName = entry.fileName
      const role = classifyBackupEntry(fileName)
      const key = identityKey(fileName)
      if (seen.has(key)) {
        throw new AppError(USER_ERRORS.backupInvalid, 'BACKUP_DUPLICATE_ENTRY')
      }
      seen.add(key)
      totals.count += 1
      totals.uncompressed += entry.uncompressedSize
      assertEntryLimits(entry, totals)
      entries.push({
        fileName,
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize,
        isDirectory: /\/$/.test(fileName)
      })
      if (role === 'directory' || /\/$/.test(fileName)) {
        mkdirSync(archiveEntryDestination(stagingRoot, fileName), { recursive: true })
        continue
      }
      const destination = archiveEntryDestination(stagingRoot, fileName)
      mkdirSync(dirname(destination), { recursive: true })
      const readStream = await zipfile.openReadStreamPromise(entry)
      await pipeline(readStream, createWriteStream(destination))
      if (statSync(destination).size !== entry.uncompressedSize) {
        throw new AppError(USER_ERRORS.backupDamaged, 'BACKUP_SIZE_MISMATCH')
      }
    }
    return entries
  } finally {
    zipfile.close()
  }
}

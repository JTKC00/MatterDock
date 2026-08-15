import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'

const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QUARANTINE_PREFIX = '.removing-'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

export type FileMeta = {
  name: string
  extension: string | null
  mimeType: string | null
  size: number
  path: string
}

export function documentsRoot(userData: string): string {
  return join(userData, 'documents')
}

export function safeFileName(name: string): string {
  const cleaned = name
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      if (code < 32 || '<>:"/\\|?*'.includes(char)) return '_'
      return char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 0 ? cleaned : 'document'
}

export function extensionOf(name: string): string | null {
  const ext = extname(name).replace(/^\./, '').toLowerCase()
  return ext.length > 0 ? ext : null
}

export function mimeFromExtension(extension: string | null): string | null {
  if (!extension) return null
  return MIME_BY_EXT[extension.toLowerCase()] ?? null
}

export function readFileMeta(filePath: string): FileMeta {
  const resolved = resolve(filePath)
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new AppError(USER_ERRORS.fileUnavailable, 'FILE_UNAVAILABLE')
  }
  const stats = statSync(resolved)
  const name = basename(resolved)
  const extension = extensionOf(name)
  return {
    name,
    extension,
    mimeType: mimeFromExtension(extension),
    size: stats.size,
    path: resolved
  }
}

export function fileExists(filePath: string | null | undefined): boolean {
  if (!filePath) return false
  try {
    return existsSync(resolve(filePath)) && statSync(resolve(filePath)).isFile()
  } catch {
    return false
  }
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

export function isDocumentId(value: string): boolean {
  return DOCUMENT_ID.test(value)
}

export function assertDocumentId(value: string): string {
  if (!isDocumentId(value)) {
    throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
  }
  return value
}

export function quarantineName(documentId: string): string {
  return `${QUARANTINE_PREFIX}${assertDocumentId(documentId)}`
}

export function parseQuarantineName(name: string): string | null {
  if (!name.startsWith(QUARANTINE_PREFIX)) return null
  const id = name.slice(QUARANTINE_PREFIX.length)
  return isDocumentId(id) ? id : null
}

export function isInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolved = resolve(candidate)
  const rel = relative(resolvedRoot, resolved)
  if (!rel || rel === '') return true
  if (rel.startsWith('..') || isAbsolute(rel)) return false
  return !rel.split(/[/\\]/).includes('..')
}

export function isStrictlyInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolved = resolve(candidate)
  if (samePath(resolvedRoot, resolved)) return false
  return isInsideRoot(root, candidate)
}

export function assertInsideDocumentsRoot(root: string, candidate: string): string {
  const resolved = resolve(candidate)
  if (!isInsideRoot(root, resolved)) {
    throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
  }
  return resolved
}

export function assertStrictlyInsideDocumentsRoot(root: string, candidate: string): string {
  const resolved = resolve(candidate)
  if (!isStrictlyInsideRoot(root, resolved)) {
    throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
  }
  return resolved
}

export function copyIntoWorkspace(
  root: string,
  documentId: string,
  sourcePath: string
): { relativePath: string; meta: FileMeta } {
  assertDocumentId(documentId)
  const source = readFileMeta(sourcePath)
  const dir = assertStrictlyInsideDocumentsRoot(root, join(root, documentId))
  const fileName = safeFileName(source.name)
  const destination = assertStrictlyInsideDocumentsRoot(root, join(dir, fileName))
  mkdirSync(dir, { recursive: true })
  try {
    copyFileSync(source.path, destination)
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw new AppError(USER_ERRORS.fileCopyFailed, 'FILE_COPY_FAILED', { cause: error })
  }
  if (!existsSync(destination)) {
    rmSync(dir, { recursive: true, force: true })
    throw new AppError(USER_ERRORS.fileCopyFailed, 'FILE_COPY_FAILED')
  }
  return {
    relativePath: `${documentId}${sep}${fileName}`.replaceAll('\\', '/'),
    meta: { ...source, path: destination, size: statSync(destination).size }
  }
}

export function removeManagedDirectory(root: string, documentId: string): void {
  const dir = assertStrictlyInsideDocumentsRoot(root, join(root, assertDocumentId(documentId)))
  if (!existsSync(dir)) return
  rmSync(dir, { recursive: true, force: true })
}

export function removeQuarantineDirectory(root: string, documentId: string): void {
  const dir = assertStrictlyInsideDocumentsRoot(root, join(root, quarantineName(documentId)))
  if (!existsSync(dir)) return
  rmSync(dir, { recursive: true, force: true })
}

export function quarantineManagedDirectory(root: string, documentId: string): string | null {
  const dir = assertStrictlyInsideDocumentsRoot(root, join(root, assertDocumentId(documentId)))
  if (!existsSync(dir)) return null
  const trash = assertStrictlyInsideDocumentsRoot(root, join(root, quarantineName(documentId)))
  if (existsSync(trash)) rmSync(trash, { recursive: true, force: true })
  renameSync(dir, trash)
  return trash
}

export function restoreQuarantine(root: string, trash: string, originalDir: string): void {
  assertStrictlyInsideDocumentsRoot(root, trash)
  assertStrictlyInsideDocumentsRoot(root, originalDir)
  if (!existsSync(trash)) return
  if (existsSync(originalDir)) rmSync(originalDir, { recursive: true, force: true })
  renameSync(trash, originalDir)
}

export function listQuarantineDocumentIds(root: string): string[] {
  if (!existsSync(root)) return []
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => parseQuarantineName(entry.name))
      .filter((id): id is string => Boolean(id))
  } catch (error) {
    console.error('[matterdock] could not scan document quarantines', error)
    return []
  }
}

export function managedDirectoryPath(root: string, documentId: string): string {
  return assertStrictlyInsideDocumentsRoot(root, join(root, assertDocumentId(documentId)))
}

export function quarantineDirectoryPath(root: string, documentId: string): string {
  return assertStrictlyInsideDocumentsRoot(root, join(root, quarantineName(documentId)))
}

export function restoreQuarantineIfAbsent(root: string, documentId: string): 'restored' | 'collision' | 'missing' {
  const trash = quarantineDirectoryPath(root, documentId)
  const active = managedDirectoryPath(root, documentId)
  if (!existsSync(trash)) return 'missing'
  if (existsSync(active)) return 'collision'
  renameSync(trash, active)
  return 'restored'
}

export function absoluteManagedPath(root: string, managedPath: string | null): string | null {
  if (!managedPath) return null
  return assertInsideDocumentsRoot(root, join(root, managedPath))
}

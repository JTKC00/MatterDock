import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AppError, USER_ERRORS } from '@shared/errors'

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

export function isInsideRoot(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root)
  const resolved = resolve(candidate)
  const rel = relative(resolvedRoot, resolved)
  if (!rel || rel === '') return true
  if (rel.startsWith('..') || isAbsolute(rel)) return false
  return !rel.split(/[/\\]/).includes('..')
}

export function assertInsideDocumentsRoot(root: string, candidate: string): string {
  const resolved = resolve(candidate)
  if (!isInsideRoot(root, resolved)) {
    throw new AppError(USER_ERRORS.unsafeDocumentPath, 'UNSAFE_PATH')
  }
  return resolved
}

export function copyIntoWorkspace(
  root: string,
  documentId: string,
  sourcePath: string
): { relativePath: string; meta: FileMeta } {
  const source = readFileMeta(sourcePath)
  const dir = join(root, documentId)
  const fileName = safeFileName(source.name)
  const destination = join(dir, fileName)
  assertInsideDocumentsRoot(root, destination)
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
  const dir = assertInsideDocumentsRoot(root, join(root, documentId))
  if (!existsSync(dir)) return
  rmSync(dir, { recursive: true, force: true })
}

export function quarantineManagedDirectory(root: string, documentId: string): string | null {
  const dir = assertInsideDocumentsRoot(root, join(root, documentId))
  if (!existsSync(dir)) return null
  const trash = assertInsideDocumentsRoot(root, join(root, `.removing-${documentId}`))
  if (existsSync(trash)) rmSync(trash, { recursive: true, force: true })
  renameSync(dir, trash)
  return trash
}

export function restoreQuarantine(trash: string, originalDir: string): void {
  if (!existsSync(trash)) return
  if (existsSync(originalDir)) rmSync(originalDir, { recursive: true, force: true })
  renameSync(trash, originalDir)
}

export function absoluteManagedPath(root: string, managedPath: string | null): string | null {
  if (!managedPath) return null
  return assertInsideDocumentsRoot(root, join(root, managedPath))
}

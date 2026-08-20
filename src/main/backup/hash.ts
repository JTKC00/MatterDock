import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export function sha256Buffer(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

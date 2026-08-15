import type { Database } from 'sql.js'
import type { Tag } from '@shared/types'
import { tagNameSchema } from '@shared/schemas'
import { createId } from './ids'
import { mapTag, type TagRow } from './mappers'
import { all, get } from './sql'

export function listTags(db: Database): Tag[] {
  return all<TagRow>(db, 'SELECT id, name FROM tags ORDER BY name COLLATE NOCASE').map(mapTag)
}

export function ensureTag(db: Database, rawName: string): Tag {
  const name = tagNameSchema.parse(rawName)
  const existing = get<TagRow>(db, 'SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE', [name])
  if (existing) return mapTag(existing)
  const tag = { id: createId(), name }
  db.run('INSERT INTO tags (id, name) VALUES (?, ?)', [tag.id, tag.name])
  return tag
}

export function replaceMatterTags(db: Database, matterId: string, tagNames: string[]): Tag[] {
  db.run('DELETE FROM matter_tags WHERE matter_id = ?', [matterId])
  const tags: Tag[] = []
  const seen = new Set<string>()
  for (const raw of tagNames) {
    const tag = ensureTag(db, raw)
    const key = tag.name.toLocaleLowerCase('en')
    if (seen.has(key)) continue
    seen.add(key)
    db.run('INSERT INTO matter_tags (matter_id, tag_id) VALUES (?, ?)', [matterId, tag.id])
    tags.push(tag)
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name))
}

export function tagsForMatter(db: Database, matterId: string): Tag[] {
  return all<TagRow>(
    db,
    `SELECT t.id, t.name
     FROM tags t
     INNER JOIN matter_tags mt ON mt.tag_id = t.id
     WHERE mt.matter_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    [matterId]
  ).map(mapTag)
}

export function tagsByMatterIds(db: Database, matterIds: string[]): Map<string, Tag[]> {
  const map = new Map<string, Tag[]>()
  if (matterIds.length === 0) return map
  const placeholders = matterIds.map(() => '?').join(', ')
  const rows = all<TagRow & { matter_id: string }>(
    db,
    `SELECT mt.matter_id, t.id, t.name
     FROM matter_tags mt
     INNER JOIN tags t ON t.id = mt.tag_id
     WHERE mt.matter_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`,
    matterIds
  )
  for (const row of rows) {
    const list = map.get(row.matter_id) ?? []
    list.push(mapTag(row))
    map.set(row.matter_id, list)
  }
  return map
}

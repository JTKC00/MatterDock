export function selectedContactStillMatches(query: string, selectedName: string | null | undefined): boolean {
  if (!selectedName) return false
  return query.trim() === selectedName.trim()
}

type Translate = (key: string) => string
const errors = [
  ['RECYCLE_BIN_CHANGED', 'RECYCLE_BIN_CHANGED', 'changed'],
  ['RECYCLE_BIN_LOCATION_OCCUPIED', 'The original Skill location is already occupied', 'locationOccupied'],
  ['RECYCLE_BIN_SKILL_EXISTS', 'Skill already exists; cannot restore it', 'skillExists'],
  ['RECYCLE_BIN_ITEM_MISSING', 'recycle bin item not found', 'itemMissing'],
  ['RECYCLE_BIN_CONTENT_MISSING', 'recycle bin content is missing', 'contentMissing'],
  ['RECYCLE_BIN_SNAPSHOT_MISSING', 'recycle bin snapshot is unavailable', 'snapshotMissing'],
  ['RECYCLE_BIN_SNAPSHOT_INVALID', 'decode recycle bin snapshot', 'snapshotInvalid'],
] as const

export function formatRecycleBinError(error: unknown, operation: 'load' | 'restore' | 'delete' | 'clear', t: Translate): string {
  const message = error instanceof Error ? error.message : String(error)
  const match = errors.find(([code, legacy]) => message.includes(code) || message.includes(legacy))
  return t(`recycleBin.errors.${match?.[2] ?? `${operation}Failed`}`)
}

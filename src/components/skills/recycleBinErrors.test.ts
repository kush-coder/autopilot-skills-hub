import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { formatRecycleBinError } from './recycleBinErrors'

describe('recycle bin errors', () => {
  it.each(['zh', 'en', 'ko'])('translates occupied-location errors in %s', (language) => {
    const t = i18n.getFixedT(language)
    const message = formatRecycleBinError('RECYCLE_BIN_LOCATION_OCCUPIED', 'restore', t)
    expect(message).toBe(t('recycleBin.errors.locationOccupied'))
    expect(message).not.toContain('recycleBin.errors.')
    expect(formatRecycleBinError(new Error('The original Skill location is already occupied'), 'restore', t)).toBe(message)
  })
  it.each(['load', 'restore', 'delete'] as const)('localizes unknown %s errors without exposing raw backend text', (operation) => {
    const message = formatRecycleBinError('SQLite failure: internal path', operation, i18n.getFixedT('zh'))
    expect(message).not.toContain('SQLite')
    expect(message).toBe(i18n.getFixedT('zh')(`recycleBin.errors.${operation}Failed`))
  })
  it.each([
    ['zh', '未能清空回收站，请检查剩余项目后重试。'],
    ['en', 'Could not empty the recycle bin. Check the remaining items and try again.'],
    ['ko', '휴지통을 비우지 못했습니다. 남은 항목을 확인한 후 다시 시도하세요.'],
  ])('localizes unknown clear errors in %s', (language, expected) => {
    expect(formatRecycleBinError('SQLite failure: internal path', 'clear', i18n.getFixedT(language))).toBe(expected)
  })
  it.each([
    ['zh', '回收站内容已发生变化，请检查最新列表后重新确认。'],
    ['en', 'The recycle bin changed. Check the updated list and confirm again.'],
    ['ko', '휴지통 내용이 변경되었습니다. 최신 목록을 확인한 후 다시 확인하세요.'],
  ])('asks for renewed confirmation when the recycle bin changes in %s', (language, expected) => {
    expect(formatRecycleBinError('RECYCLE_BIN_CHANGED', 'clear', i18n.getFixedT(language))).toBe(expected)
  })
})

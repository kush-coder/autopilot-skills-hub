// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RecycleBinPage from './RecycleBinPage'

const entries = [{
  id: 'trash-1', skill_id: 'skill-1', skill_name: 'wechat-article',
  description: '撰写微信公众号文章', tags: ['写作', '内容'], deletion_source: 'manual',
  deleted_at: 1_700_000_000_000, expires_at: 1_702_592_000_000, enabled: true,
  source_type: 'local', source_ref: '/Users/example/project/skills/wechat-article',
  targets: [{ id: 'target-1', skill_id: 'skill-1', tool: 'claude-code', scope: 'global', project_path: null, target_path: '/tmp/claude/wechat-article', mode: 'copy', status: 'ok' }],
  trash_path: '/tmp/trash-1',
}]
const secondEntry = {
  ...entries[0],
  id: 'trash-2',
  skill_id: 'skill-2',
  skill_name: 'other-skill',
  description: 'Another deleted Skill',
  tags: [],
  targets: [],
  trash_path: '/tmp/trash-2',
}

afterEach(cleanup)

describe('RecycleBinPage', () => {
  it('shows saved metadata and restores the selected Skill', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'get_recycle_bin_items') return entries
      if (command === 'restore_recycle_bin_item') return undefined
      throw new Error(command)
    })
    const onChanged = vi.fn()
    render(<RecycleBinPage active installedTools={[{ id: 'claude-code', label: 'Claude Code' }]} isTauri invokeTauri={invoke} onChanged={onChanged} t={(key: string) => key} />)

    expect((await screen.findAllByText('wechat-article')).length).toBe(2)
    expect(screen.getAllByText('撰写微信公众号文章')).toHaveLength(2)
    expect(screen.getAllByText('写作')).toHaveLength(2)
    expect(screen.getByText('Claude Code')).toBeTruthy()
    expect(screen.getByText('recycleBin.column.deletedAt')).toBeTruthy()
    expect(screen.getByText('recycleBin.column.remaining')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.restore' }))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('restore_recycle_bin_item', { trashId: 'trash-1', targetIds: ['target-1'] })
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('closes details, expands the list, and opens a row again', async () => {
    const invoke = vi.fn(async () => entries)
    const { container } = render(<RecycleBinPage active installedTools={[{ id: 'claude-code', label: 'Claude Code' }]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key: string) => key} />)
    await screen.findByRole('complementary')
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.closeDetails' }))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(container.querySelector('.recycle-bin-workspace.without-detail')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'wechat' } })
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /wechat-article/ }))
    expect(screen.getByRole('complementary')).toBeTruthy()
  })

  it('opens the policy explanation and dismisses it with Escape or an outside click', () => {
    render(<RecycleBinPage active installedTools={[]} isTauri={false} invokeTauri={vi.fn()} onChanged={() => undefined} t={(key: string) => key} />)
    const trigger = screen.getByText('recycleBin.helpTitle')
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: 'recycleBin.helpTitle' })).toBeTruthy()
    expect(screen.getByText('recycleBin.helpCleanup')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'recycleBin.helpTitle' })).toBeNull()
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('region', { name: 'recycleBin.helpTitle' })).toBeNull()
  })

  it('excludes historical tools and restores only the tools shown on the card', async () => {
    const targets = [entries[0].targets[0], { ...entries[0].targets[0], id: 'old', tool: 'cursor' }]
    const invoke = vi.fn(async () => [{ ...entries[0], targets }])
    render(<RecycleBinPage active installedTools={[{ id: 'claude-code', label: 'Claude Code' }]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key, options) => key === 'recycleBin.toolsCount' ? `tools:${options?.count}` : key} />)
    await screen.findByText('Claude Code')
    expect(screen.queryByText('cursor')).toBeNull()
    expect(screen.getByText('tools:1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.restore' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('restore_recycle_bin_item', { trashId: 'trash-1', targetIds: ['target-1'] }))
  })

  it('shows actual device storage paths only after opening help', async () => {
    const locations = { manual_backup: '/device/data/recycle-bin', sync_backup: '/device/data/device-sync/trash', database: '/device/custom/skills.db' }
    const invoke = vi.fn(async (command: string) => command === 'get_recycle_bin_locations' ? locations : entries)
    render(<RecycleBinPage active installedTools={[]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key) => key} />)
    await screen.findByRole('complementary')
    expect(invoke).not.toHaveBeenCalledWith('get_recycle_bin_locations')
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.helpTitle' }))
    for (const path of [locations.manual_backup, locations.sync_backup]) expect(await screen.findByText(path)).toBeTruthy()
    expect(screen.queryByText(locations.database)).toBeNull()
    expect(invoke).toHaveBeenCalledWith('get_recycle_bin_locations')
  })

  it('permanently deletes an item only after confirmation', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'get_recycle_bin_items') return entries
      if (command === 'delete_recycle_bin_item') return undefined
      throw new Error(command)
    })
    render(<RecycleBinPage active installedTools={[{ id: 'claude-code', label: 'Claude Code' }]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key: string) => key} />)

    await screen.findAllByText('wechat-article')
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.deletePermanently' }))
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.confirmDelete' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete_recycle_bin_item', { trashId: 'trash-1' }))
  })

  it('requires the confirmation phrase before clearing the recycle bin', async () => {
    let currentEntries = [...entries, secondEntry]
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'get_recycle_bin_items') return currentEntries
      if (command === 'clear_recycle_bin') {
        if (JSON.stringify(args) !== JSON.stringify({ trashIds: ['trash-1', 'trash-2'] })) throw new Error('wrong snapshot')
        currentEntries = []
        return 2
      }
      throw new Error(command)
    })
    render(<RecycleBinPage active installedTools={[]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key, options) => key === 'recycleBin.clearConfirmHelp' ? `count:${options?.count}` : key} />)

    await screen.findAllByText('wechat-article')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'wechat' } })
    expect(screen.queryByText('other-skill')).toBeNull()
    const clearButton = screen.getByRole('button', { name: 'recycleBin.clearAll' })
    clearButton.focus()
    fireEvent.click(clearButton)
    expect(screen.getByText('count:2')).toBeTruthy()
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: 'recycleBin.confirmClear' })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'recycleBin.clearConfirmLabel' }), { target: { value: 'wrong' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'recycleBin.clearConfirmLabel' }), { target: { value: 'recycleBin.clearConfirmPhrase' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    await screen.findByText('recycleBin.noResults')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    expect(await screen.findByText('recycleBin.empty')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'recycleBin.title' }))
  })

  it('reloads the list and requires a new confirmation when the snapshot changes', async () => {
    let currentEntries = entries
    const invoke = vi.fn(async (command: string) => {
      if (command === 'get_recycle_bin_items') return currentEntries
      if (command === 'clear_recycle_bin') {
        currentEntries = [...entries, secondEntry]
        throw new Error('RECYCLE_BIN_CHANGED')
      }
      throw new Error(command)
    })
    render(<RecycleBinPage active installedTools={[]} isTauri invokeTauri={invoke} onChanged={() => undefined} t={(key) => key} />)

    await screen.findAllByText('wechat-article')
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.clearAll' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'recycleBin.clearConfirmLabel' }), { target: { value: 'recycleBin.clearConfirmPhrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'recycleBin.confirmClear' }))

    expect((await screen.findAllByText('other-skill')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

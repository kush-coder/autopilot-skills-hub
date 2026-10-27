// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import DeleteModal from './DeleteModal'
import BulkDeleteModal from './BulkDeleteModal'

afterEach(cleanup)

describe('Skill deletion confirmations', () => {
  it.each(['single', 'bulk'])('%s describes app recovery and requires explicit confirmation', (kind) => {
    const onConfirm = vi.fn()
    const onRequestClose = vi.fn()
    const props = { open: true, loading: false, onConfirm, onRequestClose, t: i18n.getFixedT('zh') }
    if (kind === 'single') render(<DeleteModal {...props} skillName="demo" />)
    else render(<BulkDeleteModal {...props} skillNames={['demo', 'second']} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText(/系统回收站/)).toBeNull()
    expect(screen.getByText(/删除后会移入 Skills Hub 本机回收站/)).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
    const cancel = screen.getByRole('button', { name: '取消' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRequestClose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('prevents dismissal while deleting', () => {
    const close = vi.fn()
    const { container } = render(<DeleteModal open loading skillName="demo" onRequestClose={close} onConfirm={vi.fn()} t={i18n.getFixedT('zh')} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(close).not.toHaveBeenCalled()
  })
})

import { memo } from 'react'
import ConfirmActionModal from './ConfirmActionModal'
import type { TFunction } from 'i18next'

type BulkDeleteModalProps = {
  open: boolean
  loading: boolean
  skillNames: string[]
  onRequestClose: () => void
  onConfirm: () => void
  t: TFunction
}

const BulkDeleteModal = ({
  open,
  loading,
  skillNames,
  onRequestClose,
  onConfirm,
  t,
}: BulkDeleteModalProps) => {
  return <ConfirmActionModal
    open={open} loading={loading} recoverable
    title={t('bulk.deleteTitle', { count: skillNames.length })} cancelLabel={t('cancel')} confirmLabel={t('bulk.deleteConfirm', { count: skillNames.length })}
    onRequestClose={onRequestClose} onConfirm={onConfirm}
    body={<>
      <p>{t('bulk.deleteBody')}</p><div className="bulk-delete-list">{skillNames.slice(0, 6).map((name, index) => <span key={`${name}-${index}`}>{name}</span>)}{skillNames.length > 6 ? <span>{t('bulk.moreSelected', { count: skillNames.length - 6 })}</span> : null}</div>
      <div className="delete-warning"><ul>
        {['warningRecycle', 'warningRemoveFromTools', 'warningKeepSource'].map((key) => <li key={key}>{t(`delete.${key}`)}</li>)}
      </ul></div>
    </>}
  />
}

export default memo(BulkDeleteModal)

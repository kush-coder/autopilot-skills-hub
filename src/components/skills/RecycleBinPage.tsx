import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  CircleHelp,
  FileText,
  LoaderCircle,
  Search,
  Tags,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatRecycleBinError } from './recycleBinErrors'
import ConfirmActionModal from './modals/ConfirmActionModal'
import { getFullySyncedTools } from './skillSyncStatus'
import type { RecycleBinItem, RecycleBinLocations, ToolOption } from './types'

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

type RecycleBinPageProps = {
  installedTools: ToolOption[]
  active: boolean
  isTauri: boolean
  invokeTauri: Invoke
  onChanged: (count?: number) => void
  t: (key: string, options?: Record<string, unknown>) => string
}

const DAY_MS = 86_400_000

const RecycleBinPage = ({ installedTools, active, isTauri, invokeTauri, onChanged, t }: RecycleBinPageProps) => {
  const [items, setItems] = useState<RecycleBinItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(true)
  const [locations, setLocations] = useState<RecycleBinLocations | null>(null)
  const [locationsFailed, setLocationsFailed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const helpButtonRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearConfirmation, setClearConfirmation] = useState('')
  const [clearIds, setClearIds] = useState<string[]>([])
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    if (!isTauri) return
    setLoading(true)
    try {
      const next = await invokeTauri('get_recycle_bin_items') as RecycleBinItem[]
      setItems(next)
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null)
      onChanged(next.length)
    } catch (error) {
      toast.error(formatRecycleBinError(error, 'load', t))
    } finally {
      setLoading(false)
    }
  }, [invokeTauri, isTauri, onChanged, t])

  useEffect(() => { if (active) void load() }, [active, load])


  useEffect(() => {
    if (!helpOpen || !active) return
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !helpRef.current?.contains(event.target)) setHelpOpen(false)
    }
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpOpen(false)
        helpButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismissOutside)
    window.addEventListener('keydown', dismissEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      window.removeEventListener('keydown', dismissEscape)
    }
  }, [active, helpOpen])

  useEffect(() => {
    if (!active || !helpOpen || !isTauri) return
    let cancelled = false
    void invokeTauri('get_recycle_bin_locations').then((value) => {
      if (!cancelled) { setLocations(value as RecycleBinLocations); setLocationsFailed(false) }
    }).catch(() => { if (!cancelled) setLocationsFailed(true) })
    return () => { cancelled = true }
  }, [active, helpOpen, isTauri, invokeTauri])

  const visible = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    if (!value) return items
    return items.filter((item) => [item.skill_name, item.description, ...item.tags]
      .some((text) => text?.toLocaleLowerCase().includes(value)))
  }, [items, query])
  const effectiveSelectedId = !detailOpen ? null : visible.some((item) => item.id === selectedId)
    ? selectedId
    : visible[0]?.id ?? null
  const selected = visible.find((item) => item.id === effectiveSelectedId) ?? null

  const selectedTools = selected ? installedTools.filter((tool) =>
    (['global', 'project'] as const).some((scope) =>
      getFullySyncedTools(selected, [tool], scope).length > 0)) : []
  const selectedTargets = selected ? selected.targets.filter((target) =>
    (target.scope === 'global' || target.scope === 'project') &&
    getFullySyncedTools(selected, selectedTools, target.scope).some((tool) => tool.id === target.tool)) : []

  const daysLeft = (item: RecycleBinItem) => Math.max(0, Math.ceil((item.expires_at - Date.now()) / DAY_MS))
  const formatDate = (value: number) => new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const restore = async () => {
    if (!selected) return
    setBusy(selected.id)
    try {
      await invokeTauri('restore_recycle_bin_item', { trashId: selected.id, targetIds: selectedTargets.map((target) => target.id) })
      toast.success(t('recycleBin.restored', { name: selected.skill_name }))
      await load()
      onChanged()
    } catch (error) {
      toast.error(formatRecycleBinError(error, 'restore', t))
    } finally { setBusy(null) }
  }

  const remove = async () => {
    if (!selected) return
    setBusy(selected.id)
    try {
      await invokeTauri('delete_recycle_bin_item', { trashId: selected.id })
      toast.success(t('recycleBin.deletedPermanently', { name: selected.skill_name }))
      setConfirmDelete(false)
      await load()
      onChanged()
    } catch (error) {
      toast.error(formatRecycleBinError(error, 'delete', t))
    } finally { setBusy(null) }
  }

  const clear = async () => {
    setClearing(true)
    try {
      const removed = await invokeTauri('clear_recycle_bin', { trashIds: clearIds }) as number
      toast.success(t('recycleBin.cleared', { count: removed }))
      setConfirmClear(false)
      setClearConfirmation('')
      setClearIds([])
    } catch (error) {
      toast.error(formatRecycleBinError(error, 'clear', t))
      setConfirmClear(false)
      setClearConfirmation('')
      setClearIds([])
    } finally {
      await load()
      onChanged()
      setClearing(false)
    }
  }

  if (!active) return null

  return <div className="recycle-bin-page">
    <header className="recycle-bin-header">
      <div className="recycle-bin-heading">
        <div className="recycle-bin-title-line"><h1 ref={titleRef} tabIndex={-1}>{t('recycleBin.title')}</h1><span className="recycle-bin-count">{t('recycleBin.count', { count: visible.length })}</span></div>
        <div className="recycle-bin-intro"><p>{t('recycleBin.subtitle')}</p>
      <div className="recycle-bin-help" ref={helpRef}>
        <button ref={helpButtonRef} className="recycle-bin-help-trigger" type="button" aria-expanded={helpOpen} aria-controls="recycle-bin-help-content" onClick={() => setHelpOpen((open) => !open)}><CircleHelp size={16} />{t('recycleBin.helpTitle')}</button>
        {helpOpen ? <div id="recycle-bin-help-content" className="recycle-bin-help-content" role="region" aria-label={t('recycleBin.helpTitle')}>
          {['Retention', 'Cleanup', 'Restore', 'Local'].map((topic) => <section key={topic}><strong>{t(`recycleBin.help${topic}Title`)}</strong><p>{t(`recycleBin.help${topic}`)}</p>{topic === 'Local' ? <div className="recycle-bin-locations">
            {locations ? <><dl>{(['manual_backup', 'sync_backup'] as const).map((key) => <div key={key}><dt>{t(`recycleBin.locations.${key}`)}</dt><dd>{locations[key]}</dd></div>)}</dl><p>{t('recycleBin.locations.hint')}</p></> : <p>{t(locationsFailed || !isTauri ? 'recycleBin.locations.unavailable' : 'recycleBin.locations.loading')}</p>}
          </div> : null}</section>)}
        </div> : null}
      </div>
        </div>
      </div>
      <div className="recycle-bin-header-tools">
        <div className="recycle-bin-header-actions">
          <label className="recycle-bin-search"><Search size={16} /><input aria-label={t('recycleBin.search')} type="search" value={query} placeholder={t('recycleBin.search')} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="btn btn-danger-ghost recycle-bin-clear" type="button" disabled={loading || clearing || items.length === 0} onClick={() => { setClearIds(items.map((item) => item.id)); setConfirmClear(true) }}><Trash2 size={15} />{t('recycleBin.clearAll')}</button>
        </div>
        <small>{t('recycleBin.newestFirst')}</small>
      </div>
    </header>

    <div className={`recycle-bin-workspace${selected ? '' : ' without-detail'}`}>
      <section className="recycle-bin-list" aria-label={t('recycleBin.title')}>
        <div className="recycle-bin-columns" aria-hidden="true">
          <span>{t('recycleBin.column.skill')}</span>
          <span>{t('recycleBin.column.source')}</span>
          <span>{t('recycleBin.column.deletedAt')}</span>
          <span>{t('recycleBin.column.remaining')}</span>
        </div>
        {loading ? <div className="recycle-bin-empty"><LoaderCircle className="spin" size={20} />{t('recycleBin.loading')}</div> : null}
        {!loading && !visible.length ? <div className="recycle-bin-empty"><Trash2 size={28} /><strong>{t(query ? 'recycleBin.noResults' : 'recycleBin.empty')}</strong><span>{t(query ? 'recycleBin.noResultsHelp' : 'recycleBin.emptyHelp')}</span></div> : null}
        {visible.map((item) => {
          const days = daysLeft(item)
          return <button key={item.id} type="button" className={`recycle-bin-row${effectiveSelectedId === item.id ? ' selected' : ''}`} onClick={() => { setSelectedId(item.id); setDetailOpen(true) }}>
            <span className="recycle-bin-row-main"><strong>{item.skill_name}</strong><small>{item.description || t('skillDescriptionEmpty')}</small>{item.tags.length ? <span>{item.tags.map((tag) => <i key={tag}>{tag}</i>)}</span> : null}</span>
            <span className="recycle-bin-cell recycle-bin-source">{t(`recycleBin.source.${item.deletion_source}`)}</span>
            <time className="recycle-bin-cell">{formatDate(item.deleted_at)}</time>
            <em className={`recycle-bin-days${days <= 7 ? ' expiring' : ''}`}>{t('recycleBin.daysLeft', { count: days })}</em>
          </button>
        })}
      </section>

      {selected ? <aside className="recycle-bin-detail" aria-label={t('recycleBin.restoreDetails')}>
        <div className="recycle-bin-detail-scroll">
          <div className="recycle-bin-detail-head"><strong>{selected.skill_name}</strong><button type="button" aria-label={t('recycleBin.closeDetails')} onClick={() => setDetailOpen(false)}><X size={16} /></button></div>
          <p className="recycle-bin-detail-description">{selected.description || t('skillDescriptionEmpty')}</p>
          {selected.tags.length ? <div className="recycle-bin-detail-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          <dl>
            <div><dt>{t('recycleBin.sourceLabel')}</dt><dd>{t(`recycleBin.source.${selected.deletion_source}`)}</dd></div>
            <div><dt>{t('recycleBin.deletedAt')}</dt><dd>{formatDate(selected.deleted_at)}</dd></div>
            <div><dt>{t('recycleBin.remaining')}</dt><dd className={daysLeft(selected) <= 7 ? 'recycle-bin-warning' : undefined}>{t('recycleBin.daysLeft', { count: daysLeft(selected) })}</dd></div>
            <div><dt>{t('recycleBin.originalSource')}</dt><dd title={selected.source_ref ?? undefined}>{selected.source_ref || t('recycleBin.managedCopy')}</dd></div>
            <div><dt>{t('recycleBin.previousState')}</dt><dd>{t(selected.enabled ? 'recycleBin.enabled' : 'recycleBin.disabled')}</dd></div>
          </dl>
          <section className="recycle-bin-restore-summary">
            <strong>{t('recycleBin.restoreIncludes')}</strong>
            <p>{t('recycleBin.restoreIncludesHelp')}</p>
            <ul>
              <li><FileText size={15} /><span>{t('recycleBin.filesAndDescription')}</span></li>
              <li><Tags size={15} /><span>{t('recycleBin.tagsCount', { count: selected.tags.length })}</span></li>
              <li><Wrench size={15} /><span>{t('recycleBin.toolsCount', { count: selectedTools.length })}</span></li>
            </ul>
          </section>
          {selectedTools.length ? <section className="recycle-bin-previous-targets"><strong>{t('recycleBin.previousTargets')}</strong><div className="recycle-bin-targets">{selectedTools.map((tool) => <span key={tool.id}><b>{tool.label}</b><small>{[...new Set(selectedTargets.filter((target) => target.tool === tool.id).map((target) => target.scope))].map((scope) => t(`scope.${scope}`)).join(' / ')}</small></span>)}</div></section> : null}
        </div>
        <div className="recycle-bin-detail-actions"><button className="btn btn-danger-ghost" type="button" disabled={busy === selected.id} onClick={() => setConfirmDelete(true)}>{t('recycleBin.deletePermanently')}</button><button className="btn btn-primary" type="button" disabled={busy === selected.id} onClick={() => void restore()}>{busy === selected.id ? <LoaderCircle className="spin" size={15} /> : <ArchiveRestore size={15} />}{t('recycleBin.restore')}</button></div>
      </aside> : null}
    </div>

    <ConfirmActionModal
      open={confirmDelete && Boolean(selected)} loading={Boolean(busy)}
      title={t('recycleBin.confirmTitle')}
      body={t('recycleBin.confirmHelp', { name: selected?.skill_name ?? '' })}
      cancelLabel={t('cancel')} confirmLabel={t('recycleBin.confirmDelete')}
      onRequestClose={() => setConfirmDelete(false)} onConfirm={() => void remove()}
    />
    <ConfirmActionModal
      open={confirmClear} loading={clearing}
      title={t('recycleBin.clearConfirmTitle')}
      body={<><p>{t('recycleBin.clearConfirmHelp', { count: clearIds.length })}</p><label className="recycle-bin-clear-confirm"><span>{t('recycleBin.clearConfirmInstruction', { phrase: t('recycleBin.clearConfirmPhrase') })}</span><input type="text" aria-label={t('recycleBin.clearConfirmLabel')} autoComplete="off" disabled={clearing} value={clearConfirmation} onChange={(event) => setClearConfirmation(event.target.value)} /></label></>}
      cancelLabel={t('cancel')} confirmLabel={t('recycleBin.confirmClear')}
      confirmDisabled={clearConfirmation !== t('recycleBin.clearConfirmPhrase')}
      returnFocusRef={titleRef}
      onRequestClose={() => { setConfirmClear(false); setClearConfirmation(''); setClearIds([]) }} onConfirm={() => void clear()}
    />
  </div>
}

export default RecycleBinPage

window.__ModuleLoader__.load({
  id: '@local/dsh-session-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useSyncExternalStore } = React
    const ID = 'local-session-manager'
    const EN = {
      title: 'Session manager', subtitle: 'Browse sessions. Stop in-use sessions and permanently delete their history.',
      search: 'Search title, ID or working directory', refresh: 'Refresh', all: 'All sessions', closed: 'Closed', live: 'In use', archived: 'Archived',
      selection: 'Selected', selectPage: 'Select this page', clear: 'Clear selection', remove: 'Delete selected', deleteOne: 'Delete', open: 'Open',
      empty: 'No matching sessions', loading: 'Loading…', total: 'sessions', previous: 'Previous', next: 'Next', page: 'Page',
      guard: 'In-use sessions can be stopped and permanently deleted after confirmation. Review child sessions and owned work first. Failure to stop preserves the logs.',
      child: 'Child session', noDirectory: 'No working directory', bytes: 'Log size',
      preview: 'Permanent deletion', previewBusy: 'Checking files and session status…',
      impact: 'This removes the selected session logs, all retained format generations, projection cache and workspace membership. It cannot be undone and does not use the recycle bin.',
      kept: 'Working-directory files, shared attachments, backups outside DSH and text copied into other sessions are not removed. This is logical deletion, not secure disk wiping.',
      descendants: 'Also include descendant sessions', added: 'Included descendant', files: 'files',
      phrase: 'To confirm, enter', cancel: 'Cancel', commit: 'Permanently delete', deleting: 'Deleting… Do not close DSH.',
      blocked: 'Deletion is blocked. Nothing has been deleted.', deleted: 'Deleted', result: 'Deletion result', partial: 'Incomplete deletion; review the errors below.',
      done: 'Done', error: 'Operation failed', expired: 'Preview expired. Cancel and create a new preview.',
      statusDeleted: 'Deleted', statusFailed: 'Failed', statusPartial: 'Partially deleted', statusSkipped: 'Not attempted',
      LIVE_SESSION: 'Session is in use. Enable stopping before permanent deletion.',
      DEPENDENT_SESSIONS: 'Contains child sessions. Include the descendants or select them together.',
      NOT_FOUND: 'Session no longer exists.', SESSION_CHANGED: 'Session changed. Refresh and preview again.',
      UNKNOWN_ARTIFACT: 'Unrecognized files in the session directory. No files were removed.',
      UNSAFE_PATH: 'Unsafe path or linked file. Deletion refused.',
      PLAN_EXPIRED: 'Preview expired. Create a new preview.', CONFIRMATION_REQUIRED: 'Confirmation phrase does not match.',
      INDEX_CLEANUP_FAILED: 'Logs were removed but search-index cleanup failed. Do not treat this as complete deletion.',
      cleaning: 'Cleaning cache and associations', cacheFiles: 'cache artifacts', retryIndex: 'Retry search-index cleanup', CACHE_UNSUPPORTED: 'The cache storage backend is unsupported; logs were preserved.', CACHE_LEGACY_RETAINED: 'A shared legacy cache is retained. Inspect or migrate it first; no stop or deletion was performed.', UNKNOWN_CACHE_ARTIFACT: 'Unrecognized files exist for this cache record. Deletion was refused.', CACHE_REMAINS: 'Cache data remains; logs were preserved.', WORKSPACE_REMAINS: 'Workspace associations remain; logs were preserved.', CACHE_GUARD_UNAVAILABLE: 'The cache write guard is unavailable. No logs were removed.',
      selectionLimit: 'Select at most 100 sessions per batch.',
      stopOne: 'Stop and delete', stopOption: 'Stop in-use sessions and their owned work before deletion', stopCommit: 'Stop and permanently delete', stopImpact: 'Stops turns, selected descendant agents, owned jobs and terminals, and pauses schedules. Partial stopping is not rolled back; preserved sessions may remain archived. Live log size is an estimate.',
      INDEX_DISABLED: 'Search is disabled but retained index artifacts exist. Enable search and preview again; no stop or deletion was performed.', UPDATE_REQUIRED: 'Restart DSH to load Session manager 1.2.0.', STOP_UNSUPPORTED: 'This lifecycle is unsupported. No stop or deletion was attempted.', ACTIVE_WORK: 'Session-owned work is active. Enable stopping before deletion.', ACTIVITY_REMAINS: 'Owned activity has not finished. Logs were preserved.', STOP_TIMEOUT: 'Stopping timed out. Logs were preserved; work may still be stopping.', STOP_FAILED: 'Session release failed. Logs were preserved.', SESSION_STOPPING: 'This session is still stopping.', CACHE_BARRIER_FAILED: 'Final cache writes failed. Logs were preserved.', stoppedOnly: 'Stopped; logs preserved', stopped: 'Stopped sessions', checking: 'Checking', stopping: 'Stopping activity', releasing: 'Releasing sessions', cache_barrier: 'Waiting for cache writes', locking: 'Acquiring write locks', deletingStage: 'Deleting files', failed: 'Operation failed',
    }
    const ZH = {
      title: '会话管理', subtitle: '浏览会话，手动停止使用中的会话并永久删除历史。',
      search: '搜索标题、会话 ID 或工作目录', refresh: '刷新', all: '全部会话', closed: '已关闭', live: '使用中', archived: '已归档',
      selection: '已选择', selectPage: '选择本页', clear: '取消选择', remove: '删除所选', deleteOne: '删除', open: '打开',
      empty: '没有匹配的会话', loading: '正在读取…', total: '个会话', previous: '上一页', next: '下一页', page: '页',
      guard: '使用中会话可在确认后停止并永久删除。请核对子会话和所属任务；停止失败时保留日志。',
      child: '子会话', noDirectory: '无工作目录', bytes: '日志大小',
      preview: '永久删除会话', previewBusy: '正在核对文件和会话状态…',
      impact: '将删除所选会话的日志、全部历史格式版本、投影缓存及工作区关联，无法撤销，不进入回收站。',
      kept: '保留工作目录中的文件、共享附件、DSH 之外的备份，以及已复制到其他会话中的文本。此操作不提供磁盘安全擦除。',
      descendants: '同时包含下级子会话', added: '包含的子会话', files: '个文件',
      phrase: '确认删除请输入', cancel: '取消', commit: '永久删除', deleting: '正在删除… 请勿关闭 DSH。',
      blocked: '存在保护项，暂不能删除。未删除任何会话。', deleted: '已删除', result: '删除结果', partial: '删除未完成，请查看下方错误。',
      done: '完成', error: '操作失败', expired: '预览已过期，请取消后重新预览。',
      statusDeleted: '已删除', statusFailed: '失败', statusPartial: '部分删除', statusSkipped: '未执行',
      LIVE_SESSION: '会话正在使用，请勾选先停止使用中会话。',
      DEPENDENT_SESSIONS: '包含未选中的子会话，请勾选包含子会话或一起选择。',
      NOT_FOUND: '会话已不存在。', SESSION_CHANGED: '会话发生变化，请刷新后重新预览。',
      UNKNOWN_ARTIFACT: '会话目录中有未识别文件，未执行删除。', UNSAFE_PATH: '路径或链接不安全，已拒绝删除。',
      PLAN_EXPIRED: '预览已过期，请重新预览。', CONFIRMATION_REQUIRED: '确认内容不匹配。',
      INDEX_CLEANUP_FAILED: '日志已移除，但搜索索引清理失败，不能视为完成彻底删除。',
      cleaning: '清理缓存和关联', cacheFiles: '个缓存文件', retryIndex: '重试搜索索引清理', CACHE_UNSUPPORTED: '缓存存储后端不受支持，已保留日志。', CACHE_LEGACY_RETAINED: '存在共享旧缓存，请先核查或迁移；未停止或删除会话。', UNKNOWN_CACHE_ARTIFACT: '此会话缓存有未识别文件，已拒绝删除。', CACHE_REMAINS: '仍有缓存数据，已保留日志。', WORKSPACE_REMAINS: '仍有工作区关联，已保留日志。', CACHE_GUARD_UNAVAILABLE: '缓存写入保护不可用，未删除日志。',
      selectionLimit: '每批最多选择 100 个会话。',
      stopOne: '停止并删除', stopOption: '删除前停止使用中会话及其所属活动', stopCommit: '停止并永久删除', stopImpact: '将停止对话、所选下级 Agent、所属后台任务和终端，并暂停定时任务。停止过程不自动回滚；失败后保留的会话可能已归档。使用中日志大小为预览估值。',
      INDEX_DISABLED: '搜索已禁用但存在旧索引，请先启用搜索后重新预览；未停止或删除会话。', UPDATE_REQUIRED: '请重启 DSH，加载会话管理 1.2.0。', STOP_UNSUPPORTED: '此会话生命周期不受支持，未停止或删除。', ACTIVE_WORK: '会话仍有活动，请勾选先停止。', ACTIVITY_REMAINS: '所属活动尚未结束，已保留日志。', STOP_TIMEOUT: '停止超时，已保留日志；活动可能仍在停止。', STOP_FAILED: '会话释放失败，已保留日志。', SESSION_STOPPING: '此会话仍在停止，请稍后刷新。', CACHE_BARRIER_FAILED: '最终缓存写回失败，已保留日志。', stoppedOnly: '已停止，保留日志', stopped: '已停止会话', checking: '核对会话', stopping: '停止活动', releasing: '释放会话', cache_barrier: '等待缓存写回', locking: '取得写锁', deletingStage: '删除文件', failed: '操作失败',
    }
    const CSS = `
.dsm-page{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5}
.dsm-content{max-width:1040px;margin:0 auto;padding:28px 32px 36px}.dsm-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.dsm-head h1{font-size:24px;line-height:1.35;font-weight:600;margin:0 0 6px}.dsm-muted{color:var(--dsw-alias-label-secondary)}.dsm-head p{margin:0}
.dsm-controls,.dsm-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dsm-controls{margin-bottom:14px}.dsm-input,.dsm-select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 11px;font:inherit;min-height:36px;box-sizing:border-box}.dsm-search{flex:1;min-width:190px}.dsm-input:focus-visible,.dsm-select:focus-visible,.dsm-button:focus-visible,.dsm-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-button{font:inherit;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 12px;min-height:34px;cursor:pointer;white-space:nowrap}.dsm-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}.dsm-button:disabled{opacity:.45;cursor:not-allowed}.dsm-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}.dsm-danger-fill{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-state-error-primary)}.dsm-danger-fill:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(.95)}
.dsm-note{padding:11px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;margin:14px 0}.dsm-alert{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}.dsm-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.dsm-count{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsm-list{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}.dsm-row{display:flex;gap:13px;align-items:flex-start;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.dsm-row:last-child{border-bottom:0}.dsm-row[data-selected=true]{background:var(--dsw-alias-bg-layer-2)}.dsm-check{width:16px;height:16px;margin:4px 0 0;accent-color:var(--dsw-alias-brand-primary);flex:none;cursor:pointer}.dsm-check:disabled{cursor:not-allowed}.dsm-info{flex:1;min-width:0}.dsm-title{font-weight:500;overflow-wrap:anywhere}.dsm-id{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dsm-details{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;gap:6px 14px;flex-wrap:wrap;margin-top:5px}.dsm-directory{overflow-wrap:anywhere}.dsm-badge{font-size:11px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;display:inline-block;margin-left:8px;color:var(--dsw-alias-label-secondary)}.dsm-live{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}.dsm-row-actions{display:flex;gap:7px}.dsm-row-actions .dsm-button{font-size:12px;padding:4px 9px;min-height:30px}.dsm-empty{text-align:center;padding:48px 16px;color:var(--dsw-alias-label-secondary)}.dsm-pagination{display:flex;align-items:center;justify-content:flex-end;gap:14px;padding-top:16px}
.dsm-modal{border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);padding:24px;max-width:600px;width:calc(100% - 56px);max-height:80vh;box-sizing:border-box;overflow:auto;font:inherit}.dsm-modal::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent)}.dsm-modal h2{font-size:19px;margin:0 0 12px;font-weight:600}.dsm-modal p{font-size:13px}.dsm-preview-list{max-height:220px;overflow:auto;margin:12px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;list-style:none;padding:0}.dsm-preview-list li{padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-wrap:anywhere;font-size:13px}.dsm-preview-list li:last-child{border-bottom:0}.dsm-modal-footer{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.dsm-confirm{display:block;margin-top:14px;font-size:13px}.dsm-confirm .dsm-input{display:block;width:100%;margin-top:7px}.dsm-children{display:flex;align-items:center;gap:9px;margin:14px 0;font-size:13px}.dsm-success{color:var(--dsw-alias-state-success-primary)}
@media(max-width:640px){.dsm-content{padding:18px 14px}.dsm-head{align-items:flex-start}.dsm-row{flex-wrap:wrap;padding:13px}.dsm-row-actions{margin-left:29px}.dsm-toolbar{align-items:flex-start;flex-direction:column}.dsm-select{width:100%}}
`
    function Icon({ size = 20 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M3 4h15v11h-8l-5 4v-4H3z' }), h('path', { d: 'M7 8h7M7 11h4M16 17h6M17 17v5h4v-5M18 15h2' }))
    }
    const sizeText = bytes => bytes == null ? '' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(ID, 'en', EN), 'session-manager.locale.en')
        ctx.effect(() => ctx.locale.register(ID, 'zh', ZH), 'session-manager.locale.zh')
        const t = ctx.locale.bind(ID)
        function useLocale() {
          useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot(), () => ctx.locale.getSnapshot())
        }
        async function api(args, signal) {
          const response = await fetch('/session-manager/api', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Dsh-Session-Manager': '1' }, body: JSON.stringify(args), signal })
          const value = await response.json()
          if (response.ok && value.version !== '1.2.0') {
            const error = new Error('Restart DSH to load Session manager 1.2.0.'); error.code = 'UPDATE_REQUIRED'; throw error
          }
          if (!response.ok || value.error) {
            const error = new Error(value.error?.message ?? `HTTP ${response.status}`)
            error.code = value.error?.code
            throw error
          }
          return value.data
        }
        function errorText(error) { return EN[error.code] ? t(error.code) : error.message }
        function Modal({ ids, initialStop = false, onClose, onDeleted }) {
          useLocale()
          const ref = useRef(null)
          const submitting = useRef(false)
          const [includeDescendants, setChildren] = useState(false)
          const [stopActive, setStop] = useState(initialStop)
          const [progress, setProgress] = useState(null)
          const [plan, setPlan] = useState(null)
          const [phrase, setPhrase] = useState('')
          const [busy, setBusy] = useState(false)
          const [checking, setChecking] = useState(true)
          const [error, setError] = useState('')
          const [result, setResult] = useState(null)
          useEffect(() => {
            const dialog = ref.current
            dialog.showModal()
            return () => { if (dialog.open) dialog.close() }
          }, [])
          useEffect(() => {
            const controller = new AbortController()
            setChecking(true); setPlan(null); setPhrase(''); setError('')
            api({ action: 'preview', sessionIds: ids, includeDescendants, stopActive }, controller.signal).then(value => { if (!controller.signal.aborted) { setPlan(value); setChecking(false) } }).catch(err => { if (!controller.signal.aborted) { setError(errorText(err)); setChecking(false) } })
            return () => controller.abort()
          }, [includeDescendants, stopActive, ids])
          useEffect(() => {
            if (!plan || busy || result) return
            const timer = setTimeout(() => { setPlan(null); setPhrase(''); setError(t('expired')) }, Math.max(0, plan.expiresAt - Date.now()))
            return () => clearTimeout(timer)
          }, [plan, busy, result])
          useEffect(() => {
            if (!busy) return
            const controller = new AbortController()
            let timer
            async function tick() {
              try { const value = await api({ action: 'status' }, controller.signal); if (!controller.signal.aborted) setProgress(value.operation) } catch {}
              if (!controller.signal.aborted) timer = setTimeout(tick, 750)
            }
            tick()
            return () => { controller.abort(); clearTimeout(timer) }
          }, [busy])
          function changeOption(setter, value) {
            setPlan(null); setPhrase(''); setChecking(true); setError(''); setter(value)
          }
          async function retryIndex() {
            if (submitting.current || busy) return
            submitting.current = true; setBusy(true); setError('')
            try {
              await api({ action: 'reconcile_index' })
              const warnings = result.warnings.filter(item => item.code !== 'INDEX_CLEANUP_FAILED')
              setResult({ ...result, warnings, complete: result.results.every(item => item.status === 'deleted') && !warnings.length })
            } catch (err) { setError(errorText(err)) }
            finally { submitting.current = false; setBusy(false) }
          }
          async function confirm() {
            if (submitting.current || busy || !plan?.canDelete || phrase !== plan.confirmationPhrase || Date.now() >= plan.expiresAt) return
            submitting.current = true
            const submittedPlanId = plan.planId
            setBusy(true); setError('')
            try {
              const value = await api({ action: 'commit', planId: plan.planId, confirmation: phrase })
              setResult(value)
              onDeleted(value)
            } catch (err) {
              let recovered = null
              try { const status = await api({ action: 'status' }); if (status.operation?.planId === submittedPlanId) recovered = status.operation.result } catch {}
              if (recovered) { setResult(recovered); onDeleted(recovered) }
              else { setError(errorText(err)); setPlan(null); onDeleted({ results: [] }) }
            }
            finally { submitting.current = false; setBusy(false) }
          }
          return h('dialog', { ref, className: 'dsm-modal', 'aria-labelledby': 'dsm-modal-title', onCancel: event => { event.preventDefault(); if (!busy) onClose() }, onClose: () => { if (!busy) onClose() } },
            h('h2', { id: 'dsm-modal-title' }, t(result ? 'result' : 'preview')),
            result ? h(React.Fragment, null,
              h('p', { className: result.complete ? 'dsm-success' : 'dsm-alert', role: 'status' }, result.complete ? `${t('deleted')} ${result.deleted}` : t('partial')),
              h('ul', { className: 'dsm-preview-list' }, result.results.map(item => h('li', { key: item.id }, h('div', null, item.id), h('div', { className: item.status === 'deleted' ? 'dsm-success' : 'dsm-alert' }, t(({ deleted: 'statusDeleted', failed: 'statusFailed', partial: 'statusPartial', not_attempted: 'statusSkipped', stopped_not_deleted: 'stoppedOnly' })[item.status]), item.code ? ` · ${EN[item.code] ? t(item.code) : item.message}` : '')))),
              result.stopped?.length ? h('p', { className: 'dsm-count' }, `${t('stopped')} ${result.stopped.length}`) : null,
               result.warnings.some(item => item.code === 'INDEX_CLEANUP_FAILED') ? h('button', { className: 'dsm-button', type: 'button', disabled: busy, onClick: retryIndex }, t('retryIndex')) : null,
                ...result.warnings.map((item, index) => h('p', { key: index, className: 'dsm-alert' }, EN[item.code] ? t(item.code) : item.message)))
            : h(React.Fragment, null,
              h('p', { className: 'dsm-alert' }, t('impact')),
              h('p', { className: 'dsm-muted' }, t('kept')),
              h('label', { className: 'dsm-children' }, h('input', { type: 'checkbox', className: 'dsm-check', checked: stopActive, disabled: busy, onChange: e => changeOption(setStop, e.target.checked) }), t('stopOption')),
               stopActive ? h('p', { className: 'dsm-alert' }, t('stopImpact')) : null,
               h('label', { className: 'dsm-children' }, h('input', { type: 'checkbox', className: 'dsm-check', checked: includeDescendants, disabled: busy, onChange: e => changeOption(setChildren, e.target.checked) }), t('descendants')),
              checking ? h('p', { role: 'status' }, t('previewBusy')) : null,
              plan ? h(React.Fragment, null,
                h('p', { className: 'dsm-count' }, `${plan.count} ${t('total')} · ${sizeText(plan.bytes)}`),
                h('ul', { className: 'dsm-preview-list' }, ...plan.items.map(item => h('li', { key: item.id }, h('div', null, item.title, item.added ? h('span', { className: 'dsm-badge' }, t('added')) : null), h('div', { className: 'dsm-id' }, item.id), h('div', { className: 'dsm-muted' }, `${item.files} ${t('files')} · ${item.cacheFiles ?? 0} ${t('cacheFiles')}${item.needsStop ? ` · ${t('stopping')}` : ''}`), ...(item.activity ?? []).map((group, i) => h('div', { key: i, className: 'dsm-id' }, `${group.kind}: ${(group.items ?? []).map(task => task.label ? `${task.label} (${task.id})` : task.id).join(', ')}${group.omitted ? ` (+${group.omitted})` : ''}`)))), ...plan.blockers.map(item => h('li', { key: item.id, className: 'dsm-alert' }, h('div', { className: 'dsm-id' }, item.id), EN[item.code] ? t(item.code) : item.message ?? item.code, item.children?.length ? h('div', { className: 'dsm-id' }, item.children.join(', ')) : null))),
                !plan.canDelete ? h('p', { className: 'dsm-alert', role: 'alert' }, t('blocked')) : h('label', { className: 'dsm-confirm' }, `${t('phrase')} ${plan.confirmationPhrase}`, h('input', { className: 'dsm-input', value: phrase, disabled: busy, autoComplete: 'off', spellCheck: false, onChange: e => setPhrase(e.target.value), placeholder: plan.confirmationPhrase }))) : null),
            error ? h('p', { className: 'dsm-alert', role: 'alert' }, `${t('error')} · ${error}`) : null,
            busy ? h('p', { role: 'status' }, t(progress?.stage === 'deleting' ? 'deletingStage' : progress?.stage ?? 'deleting'), progress?.id ? ` · ${progress.id}` : '', ` · ${t('deleting')}`) : null,
            h('div', { className: 'dsm-modal-footer' },
              h('button', { className: 'dsm-button', type: 'button', disabled: busy, autoFocus: true, onClick: onClose }, t(result ? 'done' : 'cancel')),
              !result ? h('button', { className: 'dsm-button dsm-danger-fill', type: 'button', disabled: checking || busy || !plan?.canDelete || phrase !== plan?.confirmationPhrase, onClick: confirm }, t(plan?.requiresStop ? 'stopCommit' : 'commit')) : null))
        }
        function Panel() {
          useLocale()
          const [query, setQuery] = useState('')
          const [state, setState] = useState('all')
          const [offset, setOffset] = useState(0)
          const [refresh, setRefresh] = useState(0)
          const [data, setData] = useState({ items: [], total: 0, totalAll: 0, hasMore: false })
          const [loading, setLoading] = useState(true)
          const [error, setError] = useState('')
          const [selected, setSelected] = useState(new Set())
          const [modalIds, setModalIds] = useState(null)
          useEffect(() => {
            const controller = new AbortController()
            setLoading(true); setError('')
            const timer = setTimeout(() => {
              api({ action: 'list', query, state, offset, limit: 50 }, controller.signal).then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false) } }).catch(err => { if (!controller.signal.aborted) { setError(errorText(err)); setLoading(false) } })
            }, query ? 200 : 0)
            return () => { clearTimeout(timer); controller.abort() }
          }, [query, state, offset, refresh])
          function toggle(id) {
            setSelected(previous => {
              const next = new Set(previous)
              if (next.has(id)) next.delete(id)
              else if (next.size < 100) next.add(id)
              return next
            })
          }
          function selectPage() { setSelected(previous => new Set([...previous, ...data.items.filter(item => item.deletable).map(item => item.id)].slice(0, 100))) }
          function afterDelete(result) {
            const removed = new Set(result.results.filter(item => item.status === 'deleted').map(item => item.id))
            setSelected(previous => new Set([...previous].filter(id => !removed.has(id))))
            setOffset(0); setRefresh(n => n + 1)
          }
          return h('section', { className: 'dsm-page', 'aria-label': t('title') },
            h('style', null, CSS),
            h('div', { className: 'dsm-content' },
              h('header', { className: 'dsm-head' }, h('div', null, h('h1', null, t('title'), h('span', { className: 'dsm-badge' }, 'v1.2.0')), h('p', { className: 'dsm-muted' }, t('subtitle'))), h('button', { type: 'button', className: 'dsm-button', disabled: loading, onClick: () => { setSelected(new Set()); setOffset(0); setRefresh(n => n + 1) } }, t('refresh'))),
              h('div', { className: 'dsm-controls' },
                h('input', { className: 'dsm-input dsm-search', type: 'search', value: query, maxLength: 512, placeholder: t('search'), 'aria-label': t('search'), onChange: e => { setQuery(e.target.value); setOffset(0); setSelected(new Set()) } }),
                h('select', { className: 'dsm-select', value: state, 'aria-label': t('all'), onChange: e => { setState(e.target.value); setOffset(0); setSelected(new Set()) } }, ['all', 'closed', 'live', 'archived'].map(key => h('option', { key, value: key }, t(key))))),
              h('div', { className: 'dsm-note' }, t('guard')),
              h('div', { className: 'dsm-toolbar' },
                h('div', { className: 'dsm-actions' }, h('span', { className: 'dsm-count', role: 'status' }, `${data.total} ${t('total')} · ${t('selection')} ${selected.size}/100`), h('button', { className: 'dsm-button', type: 'button', disabled: loading || !data.items.some(item => item.deletable), onClick: selectPage }, t('selectPage')), h('button', { className: 'dsm-button', type: 'button', disabled: !selected.size, onClick: () => setSelected(new Set()) }, t('clear'))),
                h('button', { className: 'dsm-button dsm-danger', type: 'button', disabled: loading || !selected.size, onClick: () => setModalIds([...selected]) }, `${t('remove')}${selected.size ? ` (${selected.size})` : ''}`)),
              error ? h('p', { className: 'dsm-alert', role: 'alert' }, `${t('error')} · ${error}`) : null,
              h('div', { className: 'dsm-list', 'aria-busy': loading }, loading ? h('div', { className: 'dsm-empty', role: 'status' }, t('loading')) : !data.items.length ? h('div', { className: 'dsm-empty' }, t('empty')) : data.items.map(item => h('div', { className: 'dsm-row', key: item.id, 'data-selected': selected.has(item.id) },
                h('input', { type: 'checkbox', className: 'dsm-check', checked: selected.has(item.id), disabled: !item.deletable || (!selected.has(item.id) && selected.size >= 100), 'aria-label': `${t('selection')} ${item.title} (${item.id})`, title: item.live ? t('LIVE_SESSION') : t('selectionLimit'), onChange: () => toggle(item.id) }),
                h('div', { className: 'dsm-info' }, h('div', { className: 'dsm-title' }, item.title, item.live ? h('span', { className: 'dsm-badge dsm-live' }, t('live')) : null, item.archived ? h('span', { className: 'dsm-badge' }, t('archived')) : null, item.parentId ? h('span', { className: 'dsm-badge', title: item.parentId }, t('child')) : null), h('div', { className: 'dsm-id' }, item.id), h('div', { className: 'dsm-details' }, h('span', { className: 'dsm-directory' }, item.cwd || t('noDirectory')), h('time', { dateTime: new Date(item.createdAt).toISOString() }, new Date(item.createdAt).toLocaleString(ctx.locale.getSnapshot().active === 'zh' ? 'zh-CN' : 'en-US')), item.sizeBytes != null ? h('span', null, sizeText(item.sizeBytes)) : null)),
                h('div', { className: 'dsm-row-actions' }, h('button', { className: 'dsm-button', type: 'button', onClick: () => ctx.uiWorkspace.openSession(item.id) }, t('open')), h('button', { className: 'dsm-button dsm-danger', type: 'button', disabled: !item.deletable, title: item.live && !item.stoppable ? t('STOP_UNSUPPORTED') : undefined, onClick: () => setModalIds([item.id]) }, t(item.live ? 'stopOne' : 'deleteOne')))))),
              h('footer', { className: 'dsm-pagination' }, h('button', { className: 'dsm-button', type: 'button', disabled: loading || offset === 0, onClick: () => setOffset(n => Math.max(0, n - 50)) }, t('previous')), h('span', { className: 'dsm-count' }, `${Math.floor(offset / 50) + 1} / ${Math.max(1, Math.ceil(data.total / 50))} ${t('page')}`), h('button', { className: 'dsm-button', type: 'button', disabled: loading || !data.hasMore, onClick: () => setOffset(n => n + 50) }, t('next')))),
            modalIds ? h(Modal, { ids: modalIds, initialStop: modalIds.some(id => data.items.some(item => item.id === id && item.live)), onClose: () => setModalIds(null), onDeleted: afterDelete }) : null)
        }
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: ID, order: 15, label: () => t('title') }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: ID }, Panel))
      },
    }
  },
})

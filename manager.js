import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, realpath, rm, rmdir } from 'node:fs/promises'
import path from 'node:path'

export const VERSION = '1.2.0'
const MAX_BATCH = 100
const TTL = 5 * 60 * 1000
const LOG = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/
const TEMP = /^session\.(?:migration|materialize)\.[A-Za-z0-9._-]+\.tmp$/

export class ManagerError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}
const fail = (code, message, details) => { throw new ManagerError(code, message, details) }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const identity = header => hash(Object.fromEntries(Object.entries(header).sort(([a], [b]) => a.localeCompare(b))))
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f\u200b\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 512)
const errorInfo = error => ({ code: error.code ?? 'FAILED', message: String(error.message ?? error), details: error.details ?? {} })

/** Concrete JSONL adapter, fail-closed on other backends. No client-controlled paths. */
export class SessionManager {
  constructor(services, options = {}) {
    Object.assign(this, services)
    this.now = options.now ?? Date.now
    this.plans = new Map()
    this.closed = false
    this.inFlight = new Set()
    this.busy = false
    this.operation = null
  }
  status() { return { version: VERSION, busy: this.busy, operation: this.operation } }
  progress(stage, id = null) { this.operation = { ...this.operation, stage, id, updatedAt: this.now() } }
  assertOpen() {
    if (this.closed) fail('UNAVAILABLE', 'Session manager is unloading.')
  }
  assertBackend() {
    this.assertOpen()
    if (this.persistence.name !== 'session-persistence-jsonl' || !path.isAbsolute(this.persistence.root ?? '')) {
      fail('UNSUPPORTED_BACKEND', 'Permanent deletion supports the inspected DSH JSONL backend only.')
    }
  }
  live(id) { return this.sessions.get(id) !== undefined }
  archivedIds() { return new Set(this.storage?.get('workspace')?.global.get().archivedSessionIds ?? []) }
  title(header) {
    const title = this.cache?.cachedSnapshot(header, ['title'])?.values?.title
    return typeof title === 'string' && title ? clean(title) : clean(header.id)
  }
  async records() {
    this.assertOpen()
    const stored = await this.persistence.list()
    const records = new Map(stored.map(item => [item.header.id, item]))
    for (const session of this.sessions.list()) {
      const old = records.get(session.id)
      records.set(session.id, { ...old, header: old?.header ?? session.header })
    }
    return [...records.values()].sort((a, b) => b.header.createdAt - a.header.createdAt || String(a.header.id).localeCompare(String(b.header.id)))
  }
  async list({ query = '', state = 'all', offset = 0, limit = 50 } = {}) {
    if (typeof query !== 'string' || query.length > 512) fail('INVALID_INPUT', 'Search is limited to 512 characters.')
    if (!['all', 'closed', 'live', 'archived'].includes(state)) fail('INVALID_INPUT', 'Unknown session filter.')
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('INVALID_INPUT', 'Invalid pagination.')
    const archived = this.archivedIds()
    const search = query.trim().toLocaleLowerCase()
    const all = (await this.records()).map(item => ({
      id: item.header.id,
      title: this.title(item.header),
      cwd: clean(item.header.cwd),
      createdAt: item.header.createdAt,
      parentId: item.header.parentSession ?? null,
      origin: item.header.origin ?? null,
      live: this.live(item.header.id),
      archived: archived.has(item.header.id),
      sizeBytes: item.sizeBytes ?? null,
      deletable: item.location?.kind === 'jsonl' && (!this.live(item.header.id) || this.lifecycle?.canRelease(item.header.id) === true),
      stoppable: this.lifecycle?.canRelease(item.header.id) === true,
      agentStatus: this.agents?.get(item.header.id)?.status ?? null,
    }))
    const filtered = all.filter(item => (state === 'all' || (state === 'closed' && !item.live) || (state === 'live' && item.live) || (state === 'archived' && item.archived)) && (!search || [item.title, item.id, item.cwd].some(value => value.toLocaleLowerCase().includes(search))))
    return { version: VERSION, items: filtered.slice(offset, offset + limit), total: filtered.length, totalAll: all.length, offset, limit, hasMore: offset + limit < filtered.length }
  }
  validateIds(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_BATCH || ids.some(id => typeof id !== 'string' || !id || id.length > 512 || /[\u0000-\u001f]/.test(id))) fail('INVALID_INPUT', 'Select 1 to 100 exact session IDs.')
    return [...new Set(ids)]
  }
  async directory(snapshot) {
    this.assertBackend()
    const source = snapshot.location?.kind === 'jsonl' ? snapshot.location.path : undefined
    if (typeof source !== 'string' || !path.isAbsolute(source) || !LOG.test(path.basename(source))) fail('UNSUPPORTED_LOCATION', 'Session has no recognized materialized JSONL log.')
    const root = path.resolve(this.persistence.root)
    const dir = path.dirname(source)
    const rel = path.relative(root, dir)
    if (!rel || path.isAbsolute(rel) || rel.startsWith('..') || rel.split(path.sep).length !== 2) fail('UNSAFE_PATH', 'Session directory is outside the configured two-level storage layout.')
    let cursor = root
    for (const segment of ['', ...rel.split(path.sep)]) {
      if (segment) cursor = path.join(cursor, segment)
      const info = await lstat(cursor)
      if (info.isSymbolicLink() || !info.isDirectory()) fail('UNSAFE_PATH', 'A session storage path is a link or not a directory.')
    }
    const rootReal = await realpath(root)
    const dirReal = await realpath(dir)
    const realRel = path.relative(rootReal, dirReal)
    if (path.isAbsolute(realRel) || realRel.startsWith('..') || realRel.split(path.sep).length !== 2) fail('UNSAFE_PATH', 'Resolved session storage path escaped its root.')
    return { dir, root }
  }
  async inventory(snapshot) {
    const { dir, root } = await this.directory(snapshot)
    const files = []
    for (const name of (await readdir(dir)).sort()) {
      const target = path.join(dir, name)
      const info = await lstat(target, { bigint: true })
      if (!info.isFile() || info.isSymbolicLink()) fail('UNSAFE_PATH', `Unexpected directory or link in session storage: ${name}`)
      if (name === 'session.lock') {
        if (info.size !== 0n || info.nlink !== 1n) fail('UNKNOWN_ARTIFACT', 'The lock anchor contains data or is hard-linked; nothing was deleted.')
        continue
      }
      if (!LOG.test(name) && !TEMP.test(name)) fail('UNKNOWN_ARTIFACT', `Unrecognized file in session storage: ${name}; nothing was deleted.`)
      if (info.nlink !== 1n) fail('UNSAFE_PATH', 'A session log has multiple hard links; permanent deletion cannot be guaranteed.')
      files.push({ name, size: String(info.size), ino: String(info.ino), mtime: String(info.mtimeNs), ctime: String(info.ctimeNs) })
    }
    if (!files.some(item => LOG.test(item.name))) fail('NOT_FOUND', 'No session log remains.')
    return { dir, root, files, fingerprint: hash(files), bytes: files.reduce((n, item) => n + Number(item.size), 0) }
  }
  async indexCleanupState() {
    const config = this.query?.config
    if (config?.openAt !== 'never') return 'reconcile'
    if (config.path === ':memory:') return 'disabled_no_artifact'
    if (typeof config.path !== 'string' || !path.isAbsolute(config.path)) fail('INDEX_DISABLED', 'Search is disabled and its retained index location cannot be verified. Nothing was stopped or deleted.')
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      try {
        await lstat(config.path + suffix)
        fail('INDEX_DISABLED', 'Search is disabled but retained index artifacts exist. Enable the search index and preview again before permanent deletion.')
      } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return 'disabled_no_artifact'
  }
  async preview({ sessionIds, includeDescendants = false, stopActive = false } = {}, principal = 'browser') {
    this.assertBackend()
    if (typeof includeDescendants !== 'boolean' || typeof stopActive !== 'boolean') fail('INVALID_INPUT', 'Deletion options must be boolean.')
    const requested = this.validateIds(sessionIds)
    const all = await this.records()
    const byId = new Map(all.map(item => [item.header.id, item]))
    const selected = new Set(requested)
    if (includeDescendants) {
      let changed
      do {
        changed = false
        for (const item of all) if (selected.has(item.header.parentSession) && !selected.has(item.header.id)) {
          selected.add(item.header.id); changed = true
          if (selected.size > MAX_BATCH) fail('BATCH_LIMIT', 'Including descendants exceeds the 100-session limit.')
        }
        for (const id of [...selected]) for (const child of this.lifecycle?.runtimeChildren(id) ?? []) if (!selected.has(child)) {
          selected.add(child); changed = true
          if (selected.size > MAX_BATCH) fail('BATCH_LIMIT', 'Including descendants exceeds the 100-session limit.')
        }
      } while (changed)
    }
    const entries = []
    const blockers = []
    try { this.lifecycle?.assertCacheGuard?.() } catch (error) { blockers.push({ id: 'projection-cache', ...errorInfo(error) }) }
    try { await this.indexCleanupState() } catch (error) { blockers.push({ id: 'search-index', ...errorInfo(error) }) }
    for (const id of selected) {
      const snapshot = byId.get(id)
      if (!snapshot) { blockers.push({ id, code: 'NOT_FOUND' }); continue }
      const live = this.live(id)
      const state = this.lifecycle ? await this.lifecycle.describe(id) : { session: this.sessions.get(id), agent: this.agents?.get(id), activity: [], needsStop: live, canStop: false }
      const children = [...new Set([...all.filter(item => item.header.parentSession === id).map(item => item.header.id), ...(this.lifecycle?.runtimeChildren(id) ?? []), ...state.activity.filter(item => item.kind === 'subagent').flatMap(item => (item.items ?? []).map(child => child.id))])].filter(child => !selected.has(child))
      if (children.length) { blockers.push({ id, code: 'DEPENDENT_SESSIONS', children }); continue }
      if (state.needsStop && !stopActive) { blockers.push({ id, code: live ? 'LIVE_SESSION' : 'ACTIVE_WORK' }); continue }
      if (state.needsStop && !state.canStop) { blockers.push({ id, code: state.unsupported ?? 'STOP_UNSUPPORTED' }); continue }
      try {
        const inventory = await this.inventory(snapshot)
        const cacheInventory = await this.cacheArtifacts?.inventory(id)
        entries.push({ id, title: this.title(snapshot.header), cwd: clean(snapshot.header.cwd), added: !requested.includes(id), snapshot, inventory, cacheInventory, headerIdentity: identity(snapshot.header), revision: snapshot.revision, live, needsStop: state.needsStop, activity: state.activity, session: state.session, agent: state.agent })
      } catch (error) { blockers.push({ id, ...errorInfo(error) }) }
    }
    for (const [key, plan] of this.plans) if (plan.expiresAt < this.now()) this.plans.delete(key)
    while (this.plans.size >= 16) this.plans.delete(this.plans.keys().next().value)
    const id = randomUUID()
    const requiresStop = entries.some(entry => entry.needsStop)
    const plan = { id, principal, entries, blockers, expiresAt: this.now() + TTL, requested, includeDescendants, stopActive, persistence: this.persistence, phrase: `${requiresStop ? 'STOP AND DELETE' : 'DELETE'} ${selected.size}` }
    this.plans.set(id, plan)
    return { version: VERSION, planId: id, expiresAt: plan.expiresAt, confirmationPhrase: plan.phrase, count: selected.size, bytes: entries.reduce((n, item) => n + item.inventory.bytes, 0), requiresStop, cacheBytes: entries.reduce((n, item) => n + (item.cacheInventory?.bytes ?? 0), 0), items: entries.map(({ id, title, cwd, added, inventory, cacheInventory, live, needsStop, activity }) => ({ id, title, cwd, added, live, needsStop, cacheFiles: cacheInventory?.files.length ?? 0, activity: activity.map(group => ({ kind: clean(group.kind), items: (group.items ?? []).slice(0, 100).map(item => ({ id: clean(item.id), label: clean(item.label) })), omitted: Math.max(0, (group.items?.length ?? 0) - 100) })), files: inventory.files.length })), blockers, canDelete: !blockers.length }
  }
  async commit({ planId, confirmation } = {}, principal) {
    this.assertOpen()
    const plan = this.plans.get(planId)
    if (!plan || plan.expiresAt < this.now()) fail('PLAN_EXPIRED', 'Deletion preview expired. Preview again.')
    if (principal !== 'browser' || plan.principal !== 'browser') fail('USER_ONLY', 'Permanent deletion requires a confirmation from the authenticated browser owner.')
    if (confirmation !== plan.phrase) fail('CONFIRMATION_REQUIRED', 'Enter the exact confirmation phrase.')
    if (plan.blockers.length) fail('BLOCKED', 'Resolve all blocked sessions before deletion.', { blockers: plan.blockers })
    if (this.busy) fail('BUSY', 'Another deletion is in progress.')
    this.plans.delete(planId)
    this.busy = true
    this.operation = { planId, count: plan.entries.length, startedAt: this.now() }
    this.progress('checking')
    const task = this.perform(plan)
    this.inFlight.add(task)
    try {
      const result = await task
      result.complete = result.complete && !result.warnings.length
      this.operation.result = result
      return result
    } finally { this.inFlight.delete(task); this.busy = false }
  }
  async reconcileIndex(principal) {
    this.assertOpen()
    if (principal !== 'browser') fail('USER_ONLY', 'Index cleanup requires the authenticated browser owner.')
    if (this.busy) fail('BUSY', 'Another session operation is in progress.')
    this.busy = true
    this.operation = { action: 'index_cleanup', count: 0, startedAt: this.now() }
    this.progress('cleaning')
    const task = (async () => {
      const state = await this.indexCleanupState()
      if (state === 'reconcile') {
        if (!this.query?.searchSessions) fail('INDEX_CLEANUP_FAILED', 'The search-index cleanup service is unavailable.')
        await this.query.searchSessions({ query: `dsh-session-manager-purge-${randomUUID()}`, limit: 1 })
      }
      return { version: VERSION, complete: true, indexCleanup: state }
    })()
    this.inFlight.add(task)
    try {
      const result = await task
      this.progress('done'); return result
    } catch (error) {
      this.progress('failed')
      if (error instanceof ManagerError) throw error
      fail('INDEX_CLEANUP_FAILED', String(error.message ?? error))
    } finally { this.inFlight.delete(task); this.busy = false }
  }
  async perform(plan) {
    const handles = []
    const results = []
    const warnings = []
    const ids = plan.entries.map(entry => entry.id)
    const unfence = this.lifecycle?.fence(ids)
    let stoppingStarted = false
    const stopped = []
    try {
      this.assertBackend()
      this.lifecycle?.assertCacheGuard?.()
      const indexState = await this.indexCleanupState()
      if (plan.persistence !== this.persistence) fail('SESSION_CHANGED', 'The persistence backend changed since preview.')
      const corpus = await this.records()
      const selected = new Set(ids)
      for (const entry of plan.entries) {
        const children = [...corpus.filter(item => item.header.parentSession === entry.id).map(item => item.header.id), ...(this.lifecycle?.runtimeChildren(entry.id) ?? [])].filter(id => !selected.has(id))
        if (children.length) fail('SESSION_CHANGED', 'New unselected children appeared; nothing was stopped or deleted.', { id: entry.id, children })
        const current = await this.persistence.stat(entry.id)
        if (!current || identity(current.header) !== entry.headerIdentity) fail('SESSION_CHANGED', 'Session identity changed since preview.', { id: entry.id })
        const inventory = await this.inventory(current)
        if (inventory.dir !== entry.inventory.dir || inventory.root !== entry.inventory.root) fail('SESSION_CHANGED', 'Session storage moved since preview.', { id: entry.id })
        if (entry.cacheInventory) {
          const cacheInventory = await this.cacheArtifacts.inventory(entry.id)
          if (cacheInventory.domain !== entry.cacheInventory.domain || cacheInventory.unit !== entry.cacheInventory.unit || cacheInventory.root !== entry.cacheInventory.root || cacheInventory.dir !== entry.cacheInventory.dir) fail('SESSION_CHANGED', 'Cache storage changed since preview.', { id: entry.id })
        }
        if (entry.needsStop) {
          if (!plan.stopActive || !this.lifecycle) fail('LIVE_SESSION', 'Stopping was not authorized.')
          const state = await this.lifecycle.describe(entry.id)
          if (state.session !== entry.session || state.agent !== entry.agent) fail('SESSION_CHANGED', 'The exact live session changed since preview.', { id: entry.id })
          if (!state.canStop) fail(state.unsupported ?? 'STOP_UNSUPPORTED', 'The session cannot be safely stopped.', { id: entry.id })
          const foreignChildren = state.activity.filter(item => item.kind === 'subagent').flatMap(item => item.items ?? []).filter(item => !selected.has(item.id))
          if (foreignChildren.length) fail('SESSION_CHANGED', 'Unselected subagent activity appeared.', { id: entry.id })
        } else {
          if (this.live(entry.id)) fail('LIVE_SESSION', 'An unapproved session became live. Nothing was stopped or deleted.', { id: entry.id })
          if (current.revision !== entry.revision || inventory.fingerprint !== entry.inventory.fingerprint) fail('SESSION_CHANGED', 'Files changed since preview. Nothing was stopped or deleted.', { id: entry.id })
          const state = await this.lifecycle?.describe(entry.id)
          if (state?.needsStop) fail(state.unsupported === 'SESSION_STOPPING' ? 'SESSION_STOPPING' : 'ACTIVE_WORK', 'Unapproved activity or unfinished teardown appeared. Nothing was stopped or deleted.', { id: entry.id })
        }
      }
      const stopEntries = plan.entries.filter(entry => entry.needsStop)
      if (stopEntries.length) {
        stoppingStarted = true
        await this.lifecycle.stop(stopEntries, (stage, id) => this.progress(stage, id))
        stopped.push(...stopEntries.map(entry => entry.id))
        // Authorized live writes and final turn/cache writebacks legitimately
        // change the log during stopping. Rebind ONLY those entries after release.
        for (const entry of stopEntries) {
          const current = await this.persistence.stat(entry.id)
          if (!current || identity(current.header) !== entry.headerIdentity) fail('SESSION_CHANGED', 'Session changed during stopping.', { id: entry.id })
          entry.snapshot = current; entry.revision = current.revision
          entry.inventory = await this.inventory(current)
        }
      }
      if (this.lifecycle) await this.lifecycle.quietCache(ids)
      this.progress('locking')
      // Acquire EVERY write lease before removing the first file. Contention fails the whole preflight.
      for (const entry of plan.entries) {
        if (this.live(entry.id)) fail('LIVE_SESSION', 'A selected session became live. Nothing was deleted.', { id: entry.id })
        const current = await this.persistence.stat(entry.id)
        if (!current || identity(current.header) !== entry.headerIdentity || current.revision !== entry.revision) fail('SESSION_CHANGED', 'A selected session changed since preview. Nothing was deleted.', { id: entry.id })
        const inventory = await this.inventory(current)
        if (inventory.fingerprint !== entry.inventory.fingerprint) fail('SESSION_CHANGED', 'Session files changed since preview. Nothing was deleted.', { id: entry.id })
        const handle = await this.persistence.open(entry.id, 'write')
        handles.push(handle)
        if (this.live(entry.id) || identity(handle.header) !== entry.headerIdentity) fail('SESSION_CHANGED', 'Session became live or changed while acquiring its lock.', { id: entry.id })
        // A historical write-open may publish a migrated successor. It is session-owned too.
        entry.lockedSnapshot = await this.persistence.stat(entry.id)
        entry.lockedInventory = await this.inventory(entry.lockedSnapshot)
      }
      const currentCorpus = await this.records()
      if (currentCorpus.some(item => selected.has(item.header.parentSession) && !selected.has(item.header.id))) fail('SESSION_CHANGED', 'A new child session appeared. Nothing was deleted.')
      const depth = entry => { let n = 0, cursor = entry, seen = new Set(); while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); cursor = plan.entries.find(item => item.id === cursor.snapshot.header.parentSession); if (cursor) n++ }; return n }
      for (const entry of [...plan.entries].sort((a, b) => depth(b) - depth(a))) {
        this.progress('deleting', entry.id)
        const removedFiles = []
        try {
          const checked = await this.inventory(entry.lockedSnapshot)
          if (checked.fingerprint !== entry.lockedInventory.fingerprint) fail('SESSION_CHANGED', 'Files changed while the write lock was held.')
          // Clean derived data BEFORE the first log removal. A cache/workspace
          // failure leaves discoverable history for a fresh preview and retry.
          this.progress('cleaning', entry.id)
          await this.cleanupDerived(entry)
          this.progress('deleting', entry.id)
          const sourceName = path.basename(entry.lockedSnapshot.location.path)
          const ordered = [...checked.files].sort((a, b) => Number(a.name === sourceName) - Number(b.name === sourceName))
          // No recursive deletion: each exact file was enumerated, confined and rechecked.
          for (const file of ordered) {
            const target = path.resolve(checked.dir, file.name)
            if (path.dirname(target) !== checked.dir) fail('UNSAFE_PATH', 'Unexpected file path.')
            const info = await lstat(target, { bigint: true })
            if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || String(info.ino) !== file.ino || String(info.size) !== file.size || String(info.mtimeNs) !== file.mtime || String(info.ctimeNs) !== file.ctime) fail('SESSION_CHANGED', 'A session artifact changed before removal.')
            await rm(target)
            removedFiles.push(file.name)
          }
          const remains = await this.persistence.stat(entry.id)
          if (remains !== undefined) fail('DELETE_INCOMPLETE', 'Persistence still lists the session.')
          // Windows has no filesystem write-lock inode. POSIX keeps its empty lock directory.
          if (process.platform === 'win32' && (await readdir(checked.dir)).length === 0) await rmdir(checked.dir)
          results.push({ id: entry.id, status: 'deleted', removedFiles: removedFiles.length })
        } catch (error) {
          results.push({ id: entry.id, status: removedFiles.length ? 'partial' : 'failed', removedFiles: removedFiles.length, ...errorInfo(error) })
          // Never continue a destructive batch after an unexpected partial failure.
          break
        }
      }
      for (const entry of plan.entries) if (!results.some(item => item.id === entry.id)) results.push({ id: entry.id, status: 'not_attempted' })
      if (results.some(item => item.removedFiles > 0) && this.query && indexState === 'reconcile') {
        try {
          // Public search reconciles removed persistent records and FTS documents on its own serialized chain.
          await this.query.searchSessions({ query: `dsh-session-manager-purge-${randomUUID()}`, limit: 1 })
        } catch (error) { warnings.push({ code: 'INDEX_CLEANUP_FAILED', message: String(error.message ?? error) }) }
      }
      this.progress('done')
      return { version: VERSION, indexCleanup: indexState, results, stopped, deleted: results.filter(item => item.status === 'deleted').length, warnings, complete: results.every(item => item.status === 'deleted') && !warnings.length }
    } catch (error) {
      this.progress('failed', error.details?.id)
      if (!stoppingStarted) throw error
      const stoppedIds = ids.filter(id => !this.live(id) && plan.entries.find(entry => entry.id === id)?.needsStop)
      return { version: VERSION, results: ids.map(id => ({ id, status: stoppedIds.includes(id) ? 'stopped_not_deleted' : 'not_attempted' })), stopped: stoppedIds, deleted: 0, complete: false, warnings: [{ ...errorInfo(error), logsDeleted: false, stoppingStarted: true }] }
    } finally {
      for (const handle of handles.reverse()) {
        try { await handle.close() } catch (error) { warnings.push({ code: 'LOCK_RELEASE_FAILED', message: String(error.message ?? error) }) }
      }
      this.lifecycle?.allowCache(ids.filter(id => !results.some(item => item.id === id && item.removedFiles > 0)))
      unfence?.()
    }
  }
  async cleanupDerived(entry) {
    const cacheTable = this.storage?.get('session_projcache')?.table('sessions')
    if (!cacheTable) fail('CACHE_UNSUPPORTED', 'Projection-cache storage is unavailable; logs were preserved.')
    await cacheTable.delete(entry.id)
    if (typeof cacheTable.get === 'function' && cacheTable.get(entry.id) !== undefined) fail('CACHE_REMAINS', 'Projection-cache data remains; logs were preserved.')
    if (this.cacheArtifacts) await this.cacheArtifacts.clean(entry.id, entry.cacheInventory)
    // sessionIds is a filtered view, not the persisted ownership account.
    // Always use the idempotent public detach on EVERY workspace.
    for (const workspace of this.workspaces?.list() ?? []) await workspace.detachSession(entry.id)
    await this.workspaces?.unarchiveSession(entry.id)
    await this.workspaces?.unpinSession(entry.id)
    const workspaceDomain = this.storage?.get('workspace')
    const global = workspaceDomain?.global.get()
    if (global?.archivedSessionIds?.includes(entry.id) || global?.pinnedSessionIds?.includes(entry.id)) fail('WORKSPACE_REMAINS', 'Workspace flags remain; logs were preserved.')
    const table = workspaceDomain?.table?.('workspaces')
    if (table?.entries && [...table.entries()].some(([, record]) => record.sessionIds.includes(entry.id))) fail('WORKSPACE_REMAINS', 'A persisted workspace association remains; logs were preserved.')
  }
  async dispose() {
    this.closed = true
    this.plans.clear()
    await Promise.allSettled(this.inFlight)
  }
}

export const toolParameters = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['list', 'prepare_delete'], description: 'List sessions, or preview a permanent deletion for the user to confirm in the sidebar.' },
    query: { type: 'string', description: 'Title, session ID or working-directory substring for list; at most 512 characters.' },
    state: { type: 'string', enum: ['all', 'closed', 'live', 'archived'], description: 'List filter; defaults to all.' },
    offset: { type: 'integer', minimum: 0, description: 'List offset; defaults to 0.' },
    limit: { type: 'integer', minimum: 1, maximum: 100, description: 'List page size; defaults to 50.' },
    sessionIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100, description: 'Exact IDs to preview for deletion; required for prepare_delete.' },
    includeDescendants: { type: 'boolean', description: 'Include child sessions in the preview; defaults to false.' },
    stopActive: { type: 'boolean', description: 'Preview stopping in-use sessions and their owned activity before deletion; defaults to false. Does not stop anything.' },
  },
  required: ['action'], additionalProperties: false,
}

export async function runTool(manager, args) {
  if (args.action === 'list') return manager.list(args)
  if (args.action === 'prepare_delete') return { status: 'confirmation_required', ...(await manager.preview(args, 'agent')), nextStep: 'Open Session manager in the left sidebar, select the sessions, preview the exact deletion and confirm there. Agent tools cannot grant deletion authority.' }
  fail('INVALID_INPUT', 'Unknown action.')
}

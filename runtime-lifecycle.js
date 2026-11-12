import { createHash } from 'node:crypto'
import { ManagerError } from './manager.js'

export const FACTORY_HASH = '3b24d7548827efbb33bd68bf3c1a3c72b0d18f5d363aec93a573f4a4dcccb8b5'
const ORIGINAL = Symbol.for('cordis.original')
const EFFECT = Symbol.for('cordis.effect')
const raw = value => value?.[ORIGINAL] ?? value
export const factoryFingerprint = fn => createHash('sha256').update(Function.prototype.toString.call(fn).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')).digest('hex')
const fail = (code, message, details = {}) => { throw new ManagerError(code, message, details) }
const running = job => ['running', 'stopping'].includes(job.status)

/** Explicitly approved, fail-closed bridge for the inspected 0.2.2-rc.1 factory.
 * Only the exact factory co-owner composite effect is callable. Never dispose
 * an Agent scope directly, detach registries, close a foreign writer, or unload
 * a provider. The factory's own composite drains the loop BEFORE its scope.
 */
export class RuntimeLifecycle {
  constructor(ctx, { factoryHash = FACTORY_HASH, timeoutMs = 30000 } = {}) {
    this.ctx = ctx
    this.factory = raw(ctx.agentLoop)
    this.cache = raw(ctx.sessionProjectionCache)
    this.timeoutMs = timeoutMs
    this.factoryHash = factoryHash
    this.fenced = new Set()
    this.cacheBlocked = new Set()
    this.cacheWrites = new Map()
    this.pending = new Map()
    this.disposers = []
    this.cacheGuardInstalled = false
  }
  compatible() {
    try {
      return factoryFingerprint(this.factory.initializeAgent) === this.factoryHash &&
        this.factory.ownership?.isActive() === true &&
        typeof this.cache?.put === 'function'
    } catch { return false }
  }
  canRelease(id) {
    if (this.pending.has(id)) return false
    try { this.resolveRelease(this.ctx.agents.get(id)); return true } catch { return false }
  }
  resolveRelease(agent) {
    if (!this.compatible()) fail('STOP_UNSUPPORTED', 'The installed Agent lifecycle does not match the inspected DSH 0.2.2-rc.1 implementation.')
    const exact = raw(agent)
    if (!exact) fail('STOP_UNSUPPORTED', 'The loaded session has no factory-owned Agent lifecycle.')
    if (raw(this.ctx.agents.get(exact.id)) !== exact || raw(this.ctx.sessions.get(exact.id)) !== raw(exact.session)) fail('SESSION_CHANGED', 'The exact live Agent changed.')
    const fiber = raw(this.factory.runtime?.ctx?.fiber)
    const scope = raw(exact.scope)
    const scopeMeta = scope?.rawDispose?.[EFFECT]
    if (!scopeMeta || raw(exact.loopCtx?.fiber) !== fiber || raw(exact.ctx?.fiber) !== raw(scope.ctx?.fiber)) fail('STOP_UNSUPPORTED', 'This Agent is not owned by the inspected factory.')
    const effects = fiber?._disposables
    if (!effects?.[Symbol.iterator]) fail('STOP_UNSUPPORTED', 'Factory co-owner effect inventory is unavailable.')
    const candidates = [...effects].filter(dispose => {
      const meta = dispose?.[EFFECT]
      return meta?.label === `agentLoop.scope(${exact.id})` && meta.children?.length === 1 && meta.children[0] === scopeMeta
    })
    if (candidates.length !== 1) fail('STOP_UNSUPPORTED', 'No unique exact factory lifecycle capability was found.')
    return candidates[0]
  }
  install() {
    this.disposers.push(this.ctx.on('agent/created', ({ agent }) => {
      if (this.fenced.has(agent.id) || this.fenced.has(agent.session.header.parentSession)) fail('SESSION_STOPPING', 'This session is being stopped and deleted.')
      if (this.ctx.agents.list().some(parent => this.fenced.has(parent.id) && this.ctx.agents.isOwnedBy(agent.id, parent))) fail('SESSION_STOPPING', 'This parent is being stopped and deleted.')
    }))
    this.disposers.push(this.ctx.on('agent/pre-step', async ({ agent }, next) => this.fenced.has(agent.id) ? { kind: 'reject' } : next()))
    // Observe all cache publications, including mandatory detach writebacks and
    // cold observations already retained by other consumers. Unrelated ids pass
    // through untouched. Suppression begins only AFTER final lifecycle teardown.
    const cache = this.cache
    if (typeof cache?.put !== 'function') return
    const original = cache.put
    const self = this
    function put(id, ...args) {
      if (self.cacheBlocked.has(id)) return Promise.resolve()
      const task = Promise.resolve(original.call(this, id, ...args))
      const pending = self.cacheWrites.get(id) ?? new Set()
      self.cacheWrites.set(id, pending)
      pending.add(task)
      const forget = () => { pending.delete(task); if (!pending.size) self.cacheWrites.delete(id) }
      task.then(forget, forget)
      return task
    }
    cache.put = put
    this.cacheGuardInstalled = true
    this.guardPut = put
    this.disposers.push(() => { if (cache.put === put) cache.put = original; this.cacheGuardInstalled = false })
  }
  async activity(id) {
    const activity = [...await this.ctx.waterfall('workspace/session-activity', { sessionId: id }, async () => [])]
    const agent = this.ctx.agents.get(id)
    const terminals = this.ctx.get('terminals')
    if (agent && terminals?.hasOwnerActivity(agent)) {
      const items = (terminals.list(agent) ?? []).map(terminal => ({ id: terminal.sessionId, label: terminal.name ?? terminal.type ?? '' }))
      if (!items.length) items.push({ id: 'pending-terminal-setup', label: 'Terminal setup or cleanup is pending' })
      activity.push({ kind: 'terminal', items })
    }
    return activity
  }
  async describe(id) {
    const session = this.ctx.sessions.get(id)
    const activity = await this.activity(id)
    const agent = this.ctx.agents.get(id)
    let unsupported = null
    if (session) {
      try { this.resolveRelease(agent) } catch (error) { unsupported = error.code ?? 'STOP_UNSUPPORTED' }
    }
    return { session, agent, activity, needsStop: !!session || !!activity.length || this.pending.has(id), canStop: !unsupported && this.compatible() && !this.pending.has(id), unsupported: this.pending.has(id) ? 'SESSION_STOPPING' : unsupported }
  }
  runtimeChildren(id) {
    const parent = this.ctx.agents.get(id)
    return parent ? this.ctx.agents.list().filter(child => this.ctx.agents.isOwnedBy(child.id, parent)).map(child => child.id) : []
  }
  fence(ids) {
    for (const id of ids) this.fenced.add(id)
    return () => { for (const id of ids) if (!this.pending.has(id)) this.fenced.delete(id) }
  }
  assertCacheGuard() {
    if (!this.cacheGuardInstalled || this.cache.put !== this.guardPut) fail('CACHE_GUARD_UNAVAILABLE', 'The projection-cache write guard is unavailable. No logs were deleted.')
  }
  async quietCache(ids) {
    this.assertCacheGuard()
    for (const id of ids) this.cacheBlocked.add(id)
    const writes = ids.flatMap(id => [...(this.cacheWrites.get(id) ?? [])])
    const results = await Promise.allSettled(writes)
    if (results.some(result => result.status === 'rejected')) fail('CACHE_BARRIER_FAILED', 'A final projection-cache write failed; no logs were deleted.')
  }
  allowCache(ids) { for (const id of ids) this.cacheBlocked.delete(id) }
  async stop(entries, report = () => {}) {
    const ids = entries.map(entry => entry.id)
    const task = this.stopOwned(entries, report)
    for (const id of ids) this.pending.set(id, task)
    const settled = () => { for (const id of ids) if (this.pending.get(id) === task) { this.pending.delete(id); this.fenced.delete(id); this.cacheBlocked.delete(id) } }
    // Timeout preserves ownership of the unfinished stop. It can only finish
    // stopping in the background; no continuation performs deletion later.
    let timedOut = false
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; reject(new ManagerError('STOP_TIMEOUT', 'Stopping did not finish within 30 seconds. Logs remain; teardown may still be running.', { sessionIds: ids })) }, this.timeoutMs)
    })
    try { await Promise.race([task, timeout]) }
    catch (error) { if (timedOut) task.then(settled, settled); throw error }
    finally {
      clearTimeout(timer)
      if (!timedOut) for (const id of ids) if (this.pending.get(id) === task) this.pending.delete(id)
    }
  }
  async stopOwned(entries, report) {
    const ctx = this.ctx
    const agents = entries.map(entry => entry.agent).filter(Boolean)
    // Resolve all exact co-owner capabilities BEFORE stopping the first session.
    const releases = new Map(agents.map(agent => [agent.id, this.resolveRelease(agent)]))
    for (const entry of entries) {
      report('stopping', entry.id)
      await ctx.workspaceRegistry.archiveSession(entry.id, { stopActivity: true })
      // The archive registry contains listener failures. Repeat the idempotent
      // stop requests through their declared parallel seam to surface failures.
      await ctx.parallel('workspace/session-stop', { sessionId: entry.id })
    }
    for (const agent of agents) agent.cancel({ kind: 'user' })
    const jobs = ctx.get('jobs')
    for (const entry of entries) for (const job of jobs?.list(entry.id) ?? []) {
      if (job.owner !== entry.id || !running(job)) continue
      jobs.kill(job.id, entry.id, 'User confirmed permanent session deletion')
      const result = await jobs.wait(job.id, this.timeoutMs, entry.id)
      if (running(result)) fail('STOP_TIMEOUT', 'An owned job has not settled.', { id: entry.id, jobId: job.id })
    }
    for (const agent of agents) await agent.whenIdle()
    const selected = new Set(entries.map(entry => entry.id))
    for (const entry of entries) {
      const activity = await this.activity(entry.id)
      const children = [...this.runtimeChildren(entry.id), ...activity.filter(item => item.kind === 'subagent').flatMap(item => (item.items ?? []).map(child => child.id))]
      if (children.some(id => !selected.has(id))) fail('SESSION_CHANGED', 'Unselected descendant activity appeared while stopping. Logs were preserved.', { id: entry.id })
    }
    const subagents = ctx.get('subagents')
    if (subagents && agents.length) {
      await subagents.drainDescendants(agents)
      for (const agent of agents) {
        const parent = ctx.agents.list().find(candidate => ctx.agents.isOwnedBy(agent.id, candidate))
        if (parent && !agents.includes(parent)) await subagents.drainChildren(parent, [agent.id])
      }
    }
    const terminals = ctx.get('terminals')
    for (const agent of agents) {
      if (ctx.agents.get(agent.id) !== agent) continue
      for (const terminal of terminals?.list(agent) ?? []) await terminals.kill(agent, terminal.sessionId, 'User confirmed permanent session deletion')
    }
    // Descendant drains may already have invoked the original owner handle.
    // Otherwise invoke the exact FACTORY composite, never the bare scope.
    for (const agent of [...agents].reverse()) {
      report('releasing', agent.id)
      if (ctx.agents.get(agent.id) === agent) await releases.get(agent.id)()
    }
    for (const entry of entries) {
      if (ctx.sessions.get(entry.id) || ctx.agents.get(entry.id)) fail('STOP_FAILED', 'The session remains attached after lifecycle teardown.', { id: entry.id })
      const remaining = await this.activity(entry.id)
      if (remaining.length) fail('ACTIVITY_REMAINS', 'Session-owned activity remains after stopping.', { id: entry.id, activity: remaining })
      const agent = entry.agent
      if (agent && terminals?.hasOwnerActivity(agent)) fail('ACTIVITY_REMAINS', 'An owned terminal is still closing.', { id: entry.id })
    }
    report('cache_barrier')
    await this.quietCache(entries.map(entry => entry.id))
  }
  async dispose() {
    await Promise.allSettled([...new Set(this.pending.values())])
    await Promise.allSettled([...this.cacheWrites.values()].flatMap(set => [...set]))
    for (const dispose of this.disposers.reverse()) await dispose()
    this.fenced.clear(); this.cacheBlocked.clear()
  }
}

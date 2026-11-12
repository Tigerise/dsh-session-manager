import { SessionManager, ManagerError, runTool, toolParameters, VERSION } from './manager.js'
import { RuntimeLifecycle } from './runtime-lifecycle.js'
import { CacheArtifacts } from './cache-artifacts.js'

export const name = 'local-session-manager'
export const inject = ['webServer', 'connection', 'sessions', 'sessionPersistence', 'sessionQuery', 'storageDomain', 'workspaceRegistry', 'sessionProjectionCache', 'tools', 'agents', 'agentLoop']
const API = '/session-manager/api'
const MAX_BODY = 65536

export function createHandler(ctx, manager) {
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(value))
    }
    try {
      const admission = ctx.connection.admit(req)
      if ('rejection' in admission) return send(admission.rejection, { error: { code: 'UNAUTHORIZED' } })
      if (admission.peer.id !== ctx.connection.browserPeer.id || admission.peer.principal.kind !== 'owner') return send(403, { error: { code: 'USER_ONLY' } })
      if (req.method !== 'POST') return send(405, { error: { code: 'METHOD_NOT_ALLOWED' } })
      if (req.headers['x-dsh-session-manager'] !== '1' || String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return send(403, { error: { code: 'INVALID_UI_REQUEST' } })
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY) return send(413, { error: { code: 'BODY_TOO_LARGE' } })
        chunks.push(chunk)
      }
      let args
      try { args = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ManagerError('INVALID_INPUT', 'Request must be JSON.') }
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ManagerError('INVALID_INPUT', 'Request must be a JSON object.')
      let data
      if (args.action === 'list') data = await manager.list(args)
      else if (args.action === 'status') data = manager.status()
      else if (args.action === 'preview') data = await manager.preview(args, 'browser')
      else if (args.action === 'commit') data = await manager.commit(args, 'browser')
      else if (args.action === 'reconcile_index') data = await manager.reconcileIndex('browser')
      else throw new ManagerError('INVALID_INPUT', 'Unknown operation.')
      send(200, { data, version: VERSION })
    } catch (error) {
      send(error instanceof ManagerError ? 409 : 500, { error: { code: error.code ?? 'FAILED', message: String(error.message ?? error), details: error.details ?? {} } })
    }
  }
}

export function apply(ctx) {
  const lifecycle = new RuntimeLifecycle(ctx)
  lifecycle.install()
  const manager = new SessionManager({
    lifecycle,
    cacheArtifacts: new CacheArtifacts(ctx),
    agents: ctx.agents,
    persistence: ctx.sessionPersistence,
    sessions: ctx.sessions,
    query: ctx.sessionQuery,
    storage: ctx.storageDomain,
    workspaces: ctx.workspaceRegistry,
    cache: ctx.sessionProjectionCache,
  })
  ctx.effect(() => async () => { await manager.dispose(); await lifecycle.dispose() }, 'session-manager.operations')
  ctx.effect(() => ctx.provide('localSessionManager', manager), 'session-manager.service')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API, handler: createHandler(ctx, manager) }), 'session-manager.route')
  ctx.effect(() => ctx.tools.register({
    name: 'dsh_session_manager',
    description: 'List DSH sessions or preview stopping and permanent deletion. Only the browser user can confirm stopping owned activity and irreversibly deleting session logs, retained versions and caches.',
    parameters: toolParameters,
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: args => runTool(manager, args),
  }), 'session-manager.tool')
}

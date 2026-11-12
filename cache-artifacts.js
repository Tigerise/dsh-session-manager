import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { ManagerError } from './manager.js'
const ORIGINAL = Symbol.for('cordis.original')
const raw = value => value?.[ORIGINAL] ?? value
const fail = (code, message) => { throw new ManagerError(code, message) }
const safeId = /^[A-Za-z0-9_-]+$/

/** Physical residue adapter for the inspected JSON per-record backend only.
 * The root and unit come from the registered backend, never an HTTP path.
 * Current, foreign-version, invalid-record backups and staged deletions all
 * belong to the exact id. Anonymous temps and shared legacy files do not.
 */
export class CacheArtifacts {
  constructor(ctx) { this.ctx = ctx }
  binding() {
    const facility = raw(this.ctx.storageDomain)
    const domain = raw(facility.get('session_projcache'))
    const route = facility.config?.routes?.session_projcache ?? facility.config?.backend
    if (route !== 'json' || !domain) fail('CACHE_UNSUPPORTED', 'Permanent cache cleanup requires the inspected JSON per-record backend.')
    const backend = raw(raw(this.ctx.get('storage'))?.backend?.get(route))
    const unit = raw(domain.unit)
    if (!path.isAbsolute(backend?.root ?? '') || backend.open?.get('session_projcache') !== unit ||
      unit?.descriptor?.name !== 'session_projcache' || unit.descriptor.layout !== 'per-record' ||
      unit.descriptor.tables?.length !== 1 || unit.descriptor.tables[0] !== 'sessions' ||
      path.resolve(unit.dir ?? '') !== path.resolve(backend.root, 'session_projcache') ||
      typeof domain.enqueue !== 'function') fail('CACHE_UNSUPPORTED', 'The cache storage binding cannot be verified.')
    return { backend, domain, unit, root: path.resolve(backend.root), dir: path.resolve(unit.dir, 'sessions') }
  }
  async inventory(id, binding = this.binding()) {
    if (!safeId.test(id)) fail('UNSAFE_PATH', 'Cache record id is not a safe path segment.')
    const { root, dir } = binding
    // Legacy bootstrap files contain several sessions. Do not delete or rewrite
    // a shared predecessor without a supported serialized migration interface.
    try {
      await lstat(path.join(root, 'session_projcache.json'))
      fail('CACHE_LEGACY_RETAINED', 'A shared legacy projection-cache file is retained. No sessions were stopped or deleted; migrate or inspect it before permanent deletion.')
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    let cursor = root
    for (const part of ['', 'session_projcache', 'sessions']) {
      if (part) cursor = path.join(cursor, part)
      let info
      try { info = await lstat(cursor) } catch (error) { if (error.code === 'ENOENT') return { ...binding, files: [], bytes: 0 }; throw error }
      if (!info.isDirectory() || info.isSymbolicLink()) fail('UNSAFE_PATH', 'Cache storage contains a linked or non-directory path.')
    }
    const relative = path.relative(await realpath(root), await realpath(dir))
    if (relative !== path.join('session_projcache', 'sessions')) fail('UNSAFE_PATH', 'Resolved cache storage escaped its exact backend root.')
    const stem = `${id}.json`
    const files = []
    for (const name of (await readdir(dir)).sort()) {
      if (name !== stem && !name.startsWith(stem + '.')) continue
      const suffix = name.slice(stem.length)
      if (suffix !== '' && suffix !== '.deleting' && !/^\.bak\.\d{12}$/.test(suffix)) fail('UNKNOWN_CACHE_ARTIFACT', `Unrecognized cache artifact for this exact session: ${name}`)
      const info = await lstat(path.join(dir, name), { bigint: true })
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail('UNSAFE_PATH', 'A cache artifact is linked or not a regular file.')
      files.push({ name, ino: String(info.ino), size: String(info.size), mtime: String(info.mtimeNs), ctime: String(info.ctimeNs) })
    }
    return { ...binding, files, bytes: files.reduce((n, file) => n + Number(file.size), 0) }
  }
  async clean(id, expected = this.binding()) {
    const current = this.binding()
    if (current.domain !== expected.domain || current.unit !== expected.unit || current.root !== expected.root || current.dir !== expected.dir) fail('SESSION_CHANGED', 'Projection-cache storage changed since preview.')
    // Stay on the domain's own write chain, including physical files ignored
    // by its in-memory table. The lifecycle cache fence must already be held.
    return current.domain.enqueue(async () => {
      const table = current.domain.table('sessions')
      if (table.get(id) !== undefined) fail('CACHE_REMAINS', 'The projection-cache record was not removed.')
      const checked = await this.inventory(id, current)
      for (const file of checked.files) {
        const target = path.resolve(checked.dir, file.name)
        if (path.dirname(target) !== checked.dir) fail('UNSAFE_PATH', 'Unexpected cache removal path.')
        const info = await lstat(target, { bigint: true })
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || String(info.ino) !== file.ino || String(info.size) !== file.size || String(info.mtimeNs) !== file.mtime || String(info.ctimeNs) !== file.ctime) fail('SESSION_CHANGED', 'A cache artifact changed before removal.')
        await rm(target)
      }
      if ((await this.inventory(id, current)).files.length) fail('CACHE_REMAINS', 'Projection-cache artifacts remain after cleanup.')
      return checked.files.length
    })
  }
}

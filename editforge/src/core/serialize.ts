import { dirname, relativePath, resolvePath } from './paths'
import { PROJECT_VERSION, type MediaAsset, type Project } from './types'

export const PROJECT_FORMAT = 'editforge-project'
export const PROJECT_EXT = 'efproj'

/** Convierte el proyecto en JSON. Las rutas de medios se guardan relativas al .efproj (y absolutas como respaldo). */
export function serializeProject(p: Project, projectPath: string): string {
  const dir = dirname(projectPath)
  const assets: Record<string, MediaAsset> = {}
  for (const [id, a] of Object.entries(p.assets)) {
    const { missing: _missing, ...rest } = a
    const rel = relativePath(dir, a.path)
    assets[id] = { ...rest, relPath: rel ?? undefined, duration: isFinite(a.duration) ? a.duration : -1 }
  }
  const out = { format: PROJECT_FORMAT, ...p, version: PROJECT_VERSION, assets }
  return JSON.stringify(out, null, 2)
}

export interface ParsedProject {
  project: Project
  /** Rutas candidatas por medio, en orden de preferencia (relativa resuelta, absoluta original). */
  candidates: Record<string, string[]>
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/** Migraciones: MIGRATIONS[n] lleva un proyecto de la versión n a la n+1. */
const MIGRATIONS: Record<number, Migration> = {}

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let v = typeof raw.version === 'number' ? raw.version : 1
  if (v > PROJECT_VERSION) {
    throw new Error(`El proyecto se creó con una versión más nueva de EditForge (formato v${v}).`)
  }
  while (v < PROJECT_VERSION) {
    const m = MIGRATIONS[v]
    if (!m) throw new Error(`No hay migración desde la versión ${v}`)
    raw = m(raw)
    v++
  }
  return { ...raw, version: PROJECT_VERSION }
}

export function parseProject(text: string, projectPath: string): ParsedProject {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('El archivo no es un proyecto válido (JSON incorrecto).')
  }
  if (raw.format !== PROJECT_FORMAT) throw new Error('El archivo no es un proyecto de EditForge.')
  const m = migrate(raw)
  const { format: _f, ...rest } = m
  const project = rest as unknown as Project
  if (!Array.isArray(project.tracks) || typeof project.settings !== 'object') {
    throw new Error('Proyecto dañado: faltan pistas o ajustes.')
  }
  project.markers ??= []
  const dir = dirname(projectPath)
  const candidates: Record<string, string[]> = {}
  for (const a of Object.values(project.assets ?? {})) {
    if (a.duration < 0) a.duration = Infinity
    const list: string[] = []
    if (a.relPath) list.push(resolvePath(dir, a.relPath))
    if (a.path && !list.includes(a.path)) list.push(a.path)
    candidates[a.id] = list
    a.path = list[0] ?? a.path
  }
  project.assets ??= {}
  return { project, candidates }
}

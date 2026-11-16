import type { Project } from './types'

/**
 * Patrón command para deshacer/rehacer. Cada comando es puro: recibe el
 * proyecto (inmutable) y devuelve uno nuevo. `undo` debe dejar el proyecto
 * exactamente como estaba antes de `do`.
 */
export interface Command {
  label: string
  do(p: Project): Project
  undo(p: Project): Project
  /** Si devuelve un comando, se fusiona con el anterior (p. ej. arrastres continuos). */
  merge?(prev: Command): Command | null
}

export interface History {
  past: Command[]
  future: Command[]
}

export const MAX_HISTORY = 300

export function emptyHistory(): History {
  return { past: [], future: [] }
}

export function execute(p: Project, h: History, cmd: Command): { project: Project; history: History } {
  const project = cmd.do(p)
  if (project === p) return { project: p, history: h } // operación sin efecto: no ensucia el historial
  const last = h.past[h.past.length - 1]
  const merged = last && cmd.merge ? cmd.merge(last) : null
  const past = merged ? [...h.past.slice(0, -1), merged] : [...h.past, cmd]
  if (past.length > MAX_HISTORY) past.shift()
  return { project, history: { past, future: [] } }
}

export function undo(p: Project, h: History): { project: Project; history: History } | null {
  const cmd = h.past[h.past.length - 1]
  if (!cmd) return null
  return { project: cmd.undo(p), history: { past: h.past.slice(0, -1), future: [cmd, ...h.future] } }
}

export function redo(p: Project, h: History): { project: Project; history: History } | null {
  const cmd = h.future[0]
  if (!cmd) return null
  return { project: cmd.do(p), history: { past: [...h.past, cmd], future: h.future.slice(1) } }
}

/** Comando genérico basado en dos estados (útil para operaciones de alto nivel). */
export function snapshotCommand(label: string, before: Project, after: Project): Command {
  return { label, do: () => after, undo: () => before }
}

/** Ventana en la que cambios consecutivos con la misma clave de fusión forman un solo paso. */
export const MERGE_WINDOW_MS = 1500

interface OpCommand extends Command {
  readonly mergeKey?: string
  readonly at: number
  readonly before: () => Project | null
}

/**
 * Comando a partir de una operación pura Project → Project. Guarda el estado
 * anterior y el resultado, así que deshacer/rehacer es O(1) y exacto
 * (el proyecto es inmutable y comparte estructura entre versiones).
 * Con `mergeKey`, los comandos seguidos con la misma clave (p. ej. arrastrar
 * el valor de una propiedad) se funden en un único paso de historial.
 */
export function opCommand(label: string, fn: (p: Project) => Project, mergeKey?: string): Command {
  let before: Project | null = null
  let after: Project | null = null
  const cmd: OpCommand = {
    label,
    mergeKey,
    at: Date.now(),
    before: () => before,
    do(p) {
      if (after && p === before) return after
      before = p
      after = fn(p)
      return after
    },
    undo(p) {
      return before ?? p
    },
    merge(prev) {
      const o = prev as Partial<OpCommand>
      if (!mergeKey || o.mergeKey !== mergeKey || !o.at || cmd.at - o.at > MERGE_WINDOW_MS || !o.before) return null
      const first = o.before()
      const last = after
      if (!first || !last) return null
      return { label, mergeKey, at: cmd.at, before: () => first, do: () => last, undo: () => first } as OpCommand
    }
  }
  return cmd
}

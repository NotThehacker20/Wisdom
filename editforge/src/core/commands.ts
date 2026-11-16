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

/**
 * Comando a partir de una operación pura Project → Project. Guarda el estado
 * anterior y el resultado, así que deshacer/rehacer es O(1) y exacto
 * (el proyecto es inmutable y comparte estructura entre versiones).
 */
export function opCommand(label: string, fn: (p: Project) => Project): Command {
  let before: Project | null = null
  let after: Project | null = null
  return {
    label,
    do(p) {
      if (after && p === before) return after
      before = p
      after = fn(p)
      return after
    },
    undo(p) {
      return before ?? p
    }
  }
}

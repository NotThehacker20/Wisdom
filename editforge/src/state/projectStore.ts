import { create } from 'zustand'
import { emptyHistory, execute, opCommand, redo, undo, type Command, type History } from '@/core/commands'
import { createProject } from '@/core/project'
import type { Project } from '@/core/types'

interface ProjectState {
  project: Project
  history: History
  /** Ruta del .efproj (null si nunca se guardó). */
  filePath: string | null
  /** Versión del proyecto que hay en disco: si coincide con `project`, no hay cambios pendientes. */
  savedProject: Project
  dispatch(cmd: Command | null): void
  /** Atajo: ejecuta una operación pura como comando deshacible. */
  apply(label: string, fn: (p: Project) => Project, mergeKey?: string): void
  /**
   * Gesto con vista previa en directo (arrastrar en el visor o en el graph
   * editor): `update` muestra el resultado sin tocar el historial y `end`
   * lo confirma como un único paso de deshacer (o lo descarta).
   */
  beginTransient(): { update(fn: (p: Project) => Project): void; end(label: string | null): void }
  undo(): void
  redo(): void
  load(p: Project, filePath: string | null): void
  markSaved(filePath: string): void
}

const initial = createProject()

export const useProject = create<ProjectState>((set, get) => ({
  project: initial,
  history: emptyHistory(),
  filePath: null,
  savedProject: initial,
  dispatch(cmd) {
    if (!cmd) return
    const { project, history } = get()
    set(execute(project, history, cmd))
  },
  apply(label, fn, mergeKey) {
    get().dispatch(opCommand(label, fn, mergeKey))
  },
  beginTransient() {
    const base = get().project
    let last: ((p: Project) => Project) | null = null
    return {
      update(fn) {
        last = fn
        set({ project: fn(base) })
      },
      end(label) {
        set({ project: base })
        if (label && last) get().apply(label, last)
      }
    }
  },
  undo() {
    const r = undo(get().project, get().history)
    if (r) set(r)
  },
  redo() {
    const r = redo(get().project, get().history)
    if (r) set(r)
  },
  load(p, filePath) {
    set({ project: p, history: emptyHistory(), filePath, savedProject: p })
  },
  markSaved(filePath) {
    set({ filePath, savedProject: get().project })
  }
}))

export const isDirty = (s: { project: Project; savedProject: Project }): boolean => s.project !== s.savedProject

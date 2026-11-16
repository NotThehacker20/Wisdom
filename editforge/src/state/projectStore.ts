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
  apply(label: string, fn: (p: Project) => Project): void
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
  apply(label, fn) {
    get().dispatch(opCommand(label, fn))
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

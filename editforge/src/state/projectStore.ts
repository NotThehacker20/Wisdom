import { create } from 'zustand'
import { emptyHistory, execute, redo, undo, type Command, type History } from '@/core/commands'
import { createProject } from '@/core/project'
import type { Project } from '@/core/types'

interface ProjectState {
  project: Project
  history: History
  dispatch(cmd: Command | null): void
  undo(): void
  redo(): void
  load(p: Project): void
}

export const useProject = create<ProjectState>((set, get) => ({
  project: createProject(),
  history: emptyHistory(),
  dispatch(cmd) {
    if (!cmd) return
    const { project, history } = get()
    set(execute(project, history, cmd))
  },
  undo() {
    const r = undo(get().project, get().history)
    if (r) set(r)
  },
  redo() {
    const r = redo(get().project, get().history)
    if (r) set(r)
  },
  load(p) {
    set({ project: p, history: emptyHistory() })
  }
}))

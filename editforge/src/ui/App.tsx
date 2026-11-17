import { useEffect } from 'react'
import { basename } from '@/core/paths'
import { ContextMenuHost } from './ContextMenu'
import { ExportDialog } from './ExportDialog'
import { useKeyboardShortcuts } from './shortcuts'
import { ShortcutsDialog } from './ShortcutsDialog'
import { loadSettings } from '@/state/settings'
import { initProxies } from '@/state/proxies'
import { Splitter } from './Splitter'
import { EffectsLibrary, TextLibrary } from './panels/EffectsLibrary'
import { GraphEditor } from './panels/GraphEditor'
import { Inspector } from './panels/Inspector'
import { MediaLibrary } from './panels/MediaLibrary'
import { Preview } from './panels/Preview'
import { Timeline } from './panels/Timeline'
import { importPaths, importViaDialog, pathsFromDrop } from '@/state/importMedia'
import { initProjectFileSync, newProject, openProject, saveProject } from '@/state/projectFile'
import { isDirty, useProject } from '@/state/projectStore'
import { useUi, type LeftTab } from '@/state/uiStore'

const LEFT_TABS: Array<[LeftTab, string]> = [
  ['media', 'Medios'],
  ['text', 'Texto'],
  ['effects', 'Efectos'],
  ['transitions', 'Transiciones']
]

function TopBar() {
  const filePath = useProject((s) => s.filePath)
  const dirty = useProject(isDirty)
  const canUndo = useProject((s) => s.history.past.length > 0)
  const canRedo = useProject((s) => s.history.future.length > 0)
  const undoLabel = useProject((s) => s.history.past[s.history.past.length - 1]?.label)
  const redoLabel = useProject((s) => s.history.future[0]?.label)
  const { undo, redo } = useProject()
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">◆</span> EditForge
      </div>
      <nav className="topbar-actions">
        <button className="btn" onClick={newProject} title="Nuevo proyecto (Ctrl+N)">
          Nuevo
        </button>
        <button className="btn" onClick={() => void openProject()} title="Abrir proyecto (Ctrl+O)">
          Abrir
        </button>
        <button className="btn" onClick={() => void saveProject()} title="Guardar (Ctrl+S) · Guardar como (Ctrl+Mayús+S)">
          Guardar
        </button>
        <span className="tool-sep" />
        <button className="btn" onClick={() => void importViaDialog()}>
          Importar
        </button>
        <span className="tool-sep" />
        <button className="btn" disabled={!canUndo} onClick={undo} title={`Deshacer${undoLabel ? `: ${undoLabel}` : ''} (Ctrl+Z)`}>
          ↶
        </button>
        <button className="btn" disabled={!canRedo} onClick={redo} title={`Rehacer${redoLabel ? `: ${redoLabel}` : ''} (Ctrl+Y)`}>
          ↷
        </button>
      </nav>
      <div className="project-name">
        {dirty && <span className="dirty-dot" title="Cambios sin guardar">●</span>}
        {filePath ? basename(filePath) : 'Sin título'}
      </div>
      <div className="topbar-right">
        <button className="btn" onClick={() => useUi.setState({ shortcutsOpen: true })} title="Atajos de teclado (Ctrl+,)">
          ⌨
        </button>
        <button className="btn primary" onClick={() => useUi.setState({ exportOpen: true })} title="Exportar (Ctrl+E)">
          Exportar
        </button>
      </div>
    </header>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useUi()
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function App() {
  const { layout, setLayout, leftTab, setLeftTab, bottomTab, setBottomTab } = useUi()
  useKeyboardShortcuts()
  useEffect(() => initProjectFileSync(), [])
  useEffect(() => {
    void loadSettings()
    initProxies()
  }, [])

  // Soltar archivos en cualquier parte de la ventana los importa.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      void importPaths(pathsFromDrop(e))
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div
      className="app"
      style={{
        gridTemplateColumns: `${layout.leftWidth}px 4px 1fr 4px ${layout.rightWidth}px`,
        gridTemplateRows: `40px 1fr 4px ${layout.bottomHeight}px`
      }}
    >
      <TopBar />
      <section className="panel panel-left">
        <div className="tabs">
          {LEFT_TABS.map(([id, label]) => (
            <button key={id} className={`tab ${leftTab === id ? 'active' : ''}`} onClick={() => setLeftTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {leftTab === 'media' ? <MediaLibrary /> : leftTab === 'text' ? <TextLibrary /> : <EffectsLibrary kind={leftTab} />}
        </div>
      </section>
      <Splitter dir="x" onDrag={(d) => setLayout({ leftWidth: Math.min(700, Math.max(200, layout.leftWidth + d)) })} />
      <section className="panel panel-center">
        <div className="tabs">
          <span className="tab active">Previsualización</span>
        </div>
        <div className="panel-body">
          <Preview />
        </div>
      </section>
      <Splitter dir="x" onDrag={(d) => setLayout({ rightWidth: Math.min(600, Math.max(220, layout.rightWidth - d)) })} />
      <section className="panel panel-right">
        <div className="tabs">
          <span className="tab active">Inspector</span>
        </div>
        <div className="panel-body">
          <Inspector />
        </div>
      </section>
      <div className="splitter-row">
        <Splitter dir="y" onDrag={(d) => setLayout({ bottomHeight: Math.min(800, Math.max(140, layout.bottomHeight - d)) })} />
      </div>
      <section className="panel panel-bottom">
        <div className="tabs">
          <button className={`tab ${bottomTab === 'timeline' ? 'active' : ''}`} onClick={() => setBottomTab('timeline')}>
            Timeline
          </button>
          <button className={`tab ${bottomTab === 'graph' ? 'active' : ''}`} onClick={() => setBottomTab('graph')}>
            Graph editor
          </button>
        </div>
        <div className="panel-body">{bottomTab === 'timeline' ? <Timeline /> : <GraphEditor />}</div>
      </section>
      <Toasts />
      <ContextMenuHost />
      <ExportDialog />
      <ShortcutsDialog />
    </div>
  )
}

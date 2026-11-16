import { useState } from 'react'
import { appendAssetCmd } from '@/core/ops'
import { formatDuration } from '@/core/time'
import type { MediaAsset } from '@/core/types'
import { useProject } from '@/state/projectStore'
import { importPaths, importViaDialog, pathsFromDrop } from '@/state/importMedia'
import { useUi } from '@/state/uiStore'
import { ASSET_DRAG_TYPE } from '../dnd'

function KindIcon({ kind }: { kind: MediaAsset['kind'] }) {
  return <span className={`kind-badge kind-${kind}`}>{kind === 'video' ? 'VID' : kind === 'image' ? 'IMG' : 'AUD'}</span>
}

export function MediaLibrary() {
  const assets = useProject((s) => s.project.assets)
  const dispatch = useProject((s) => s.dispatch)
  const { thumbnails, selectedAssetId, selectAsset, importing } = useUi()
  const [over, setOver] = useState(false)
  const list = Object.values(assets)

  const addToTimeline = (a: MediaAsset) => dispatch(appendAssetCmd(a, useProject.getState().project))

  return (
    <div
      className={`media-library ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        void importPaths(pathsFromDrop(e))
      }}
    >
      <div className="panel-toolbar">
        <button className="btn primary" onClick={() => void importViaDialog()}>
          + Importar
        </button>
        {importing > 0 && <span className="muted">Importando {importing}…</span>}
      </div>
      {list.length === 0 ? (
        <div className="empty-hint" onDoubleClick={() => void importViaDialog()}>
          <div className="empty-icon">⬇</div>
          Arrastra aquí vídeos, imágenes o audio
          <br />
          <span className="muted">o pulsa «Importar»</span>
        </div>
      ) : (
        <div className="media-grid">
          {list.map((a) => (
            <div
              key={a.id}
              className={`media-item ${selectedAssetId === a.id ? 'selected' : ''}`}
              onClick={() => selectAsset(a.id)}
              onDoubleClick={() => addToTimeline(a)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_DRAG_TYPE, a.id)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              title={`${a.name}\n${a.width}×${a.height}${a.fps ? ` · ${a.fps} fps` : ''}${a.codec ? ` · ${a.codec}` : ''}`}
            >
              <div className="media-thumb">
                {thumbnails[a.id] ? <img src={thumbnails[a.id]} alt="" draggable={false} /> : <div className="thumb-placeholder" />}
                <KindIcon kind={a.kind} />
                {a.missing && <span className="media-missing" title="Archivo no encontrado">⚠</span>}
                {a.kind !== 'image' && <span className="media-dur">{formatDuration(a.duration)}</span>}
                <button
                  className="media-add"
                  title="Añadir a la timeline"
                  onClick={(e) => {
                    e.stopPropagation()
                    addToTimeline(a)
                  }}
                >
                  +
                </button>
              </div>
              <div className="media-name">{a.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { create } from 'zustand'
import { PlaybackController } from '@/engine/PlaybackController'
import { analyzeAudio } from './audioAnalysis'
import { useProject } from './projectStore'
import { useUi } from './uiStore'

interface PlaybackState {
  time: number
  playing: boolean
}

export const usePlayback = create<PlaybackState>(() => ({ time: 0, playing: false }))

/** Controlador único del motor (vive fuera de React). */
export const playback = new PlaybackController({
  onTime: (time) => usePlayback.setState({ time }),
  onPlayingChange: (playing) => usePlayback.setState({ playing })
})

playback.setProject(useProject.getState().project)
useProject.subscribe((s) => playback.setProject(s.project))
playback.setQuality(useUi.getState().quality)
useUi.subscribe((s) => playback.setQuality(s.quality))

playback.audio.onDecoded = (asset, buffer) => analyzeAudio(asset, buffer)

playback.pool.onError = (asset, message) => useUi.getState().toast('error', `${asset.name}: ${message}`)

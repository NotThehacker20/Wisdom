declare module 'mp4box' {
  export interface MP4Sample {
    number: number
    track_id: number
    timescale: number
    offset: number
    size: number
    cts: number
    dts: number
    duration: number
    is_sync: boolean
  }
  export interface MP4VideoTrack {
    id: number
    codec: string
    timescale: number
    duration: number
    nb_samples: number
    movie_duration: number
    track_width: number
    track_height: number
    matrix: number[] | Int32Array
    video: { width: number; height: number }
  }
  export interface MP4AudioTrack {
    id: number
    codec: string
    audio: { sample_rate: number; channel_count: number }
  }
  export interface MP4Info {
    duration: number
    timescale: number
    isFragmented: boolean
    videoTracks: MP4VideoTrack[]
    audioTracks: MP4AudioTrack[]
  }
  export interface MP4Box {
    write(stream: DataStream): void
  }
  export interface MP4Trak {
    samples: MP4Sample[]
    mdia: { minf: { stbl: { stsd: { entries: Array<Record<string, MP4Box | undefined>> } } } }
  }
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number
  }
  export interface MP4File {
    onReady?: (info: MP4Info) => void
    onError?: (e: string) => void
    appendBuffer(buf: MP4ArrayBuffer): number
    flush(): void
    getTrackById(id: number): MP4Trak
  }
  export function createFile(): MP4File
  export class DataStream {
    static BIG_ENDIAN: boolean
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean)
    buffer: ArrayBuffer
  }
}

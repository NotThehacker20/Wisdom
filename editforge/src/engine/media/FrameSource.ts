export interface DecodedFrame {
  /** Lo que se sube a la textura: VideoFrame, HTMLVideoElement o ImageBitmap. */
  source: TexImageSource
  /** Dimensiones del fotograma tal y como se decodifica (antes de rotar). */
  width: number
  height: number
  /** Rotación de visualización en grados (0/90/180/270). */
  rotation: number
  /**
   * El fotograma sigue siendo válido después de pedir el siguiente a la misma
   * fuente (WebCodecs e imágenes). Necesario para mezclar dos fotogramas.
   */
  stable?: boolean
}

export interface FrameRequestOptions {
  /** Reproduciendo: se permite leer por adelantado y la fuente puede ir algo desfasada. */
  playing: boolean
}

/**
 * Fuente de fotogramas de un medio. `getFrame(t)` recibe el tiempo EN EL MEDIO
 * (segundos). El fotograma devuelto es válido hasta la siguiente llamada.
 */
export interface FrameSource {
  readonly backend: 'webcodecs' | 'html-video' | 'image'
  getFrame(t: number, opts: FrameRequestOptions): Promise<DecodedFrame | null>
  dispose(): void
}

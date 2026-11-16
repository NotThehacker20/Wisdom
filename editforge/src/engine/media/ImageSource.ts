import type { DecodedFrame, FrameSource } from './FrameSource'

export class ImageSource implements FrameSource {
  readonly backend = 'image' as const
  private constructor(private bitmap: ImageBitmap) {}

  static async create(url: string): Promise<ImageSource> {
    const blob = await (await fetch(url)).blob()
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image', premultiplyAlpha: 'premultiply' })
    return new ImageSource(bitmap)
  }

  async getFrame(): Promise<DecodedFrame | null> {
    return { source: this.bitmap, width: this.bitmap.width, height: this.bitmap.height, rotation: 0, stable: true }
  }

  dispose(): void {
    this.bitmap.close()
  }
}

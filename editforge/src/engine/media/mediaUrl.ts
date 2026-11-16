/** Convierte una ruta absoluta en una URL del esquema media:// (ver electron/main.ts). */
export function mediaUrl(path: string): string {
  return `media://local/${encodeURIComponent(path)}`
}

export async function fetchRange(url: string, start: number, endExclusive: number): Promise<ArrayBuffer> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${endExclusive - 1}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status} leyendo ${url}`)
  return res.arrayBuffer()
}

export async function fetchSize(url: string): Promise<number> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  const cr = res.headers.get('Content-Range')
  await res.body?.cancel()
  if (cr) return parseInt(cr.split('/')[1], 10)
  const len = res.headers.get('Content-Length')
  if (len) return parseInt(len, 10)
  throw new Error('No se pudo obtener el tamaño del archivo')
}

/**
 * Utilidades de rutas puras que funcionan igual con rutas de Windows
 * (C:\a\b, \\servidor\x) y POSIX (/a/b), sin depender de node:path.
 */

const isWin = (p: string): boolean => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\')

function split(p: string): { root: string; parts: string[] } {
  if (isWin(p)) {
    const norm = p.replace(/\//g, '\\')
    const root = norm.startsWith('\\\\') ? '\\\\' : norm.slice(0, 3).toUpperCase()
    const rest = norm.startsWith('\\\\') ? norm.slice(2) : norm.slice(3)
    return { root, parts: rest.split('\\').filter(Boolean) }
  }
  return { root: '/', parts: p.split('/').filter(Boolean) }
}

function join(root: string, parts: string[]): string {
  const sep = root === '/' ? '/' : '\\'
  return root + parts.join(sep)
}

function normalizeParts(parts: string[]): string[] {
  const out: string[] = []
  for (const s of parts) {
    if (s === '.' || s === '') continue
    if (s === '..') out.pop()
    else out.push(s)
  }
  return out
}

export function dirname(p: string): string {
  const { root, parts } = split(p)
  return join(root, parts.slice(0, -1))
}

export function basename(p: string): string {
  return split(p).parts.pop() ?? ''
}

/** Ruta relativa de `to` respecto a la carpeta `fromDir`, siempre con «/». null si están en unidades distintas. */
export function relativePath(fromDir: string, to: string): string | null {
  const a = split(fromDir)
  const b = split(to)
  if (a.root !== b.root) return null
  const win = a.root !== '/'
  const eq = (x: string, y: string) => (win ? x.toLowerCase() === y.toLowerCase() : x === y)
  const ap = normalizeParts(a.parts)
  const bp = normalizeParts(b.parts)
  let i = 0
  while (i < ap.length && i < bp.length && eq(ap[i], bp[i])) i++
  return [...ap.slice(i).map(() => '..'), ...bp.slice(i)].join('/') || '.'
}

/** Resuelve una ruta relativa («/» o «\») contra una carpeta, usando el separador de la carpeta. */
export function resolvePath(baseDir: string, rel: string): string {
  const { root, parts } = split(baseDir)
  return join(root, normalizeParts([...parts, ...rel.split(/[\\/]/)]))
}

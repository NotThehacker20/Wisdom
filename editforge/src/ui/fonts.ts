/** Fuentes habituales (respaldo si no se pueden listar las del sistema). */
export const FALLBACK_FONTS = [
  'Arial', 'Arial Black', 'Helvetica', 'Impact', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New',
  'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Montserrat', 'Roboto', 'Open Sans', 'Bebas Neue', 'Oswald', 'Poppins', 'DejaVu Sans', 'Liberation Sans'
]

let cached: string[] | null = null

/**
 * Familias de fuentes instaladas (Local Font Access API de Chromium). Necesita
 * un gesto del usuario la primera vez; si no está disponible, la lista de respaldo.
 */
export async function listSystemFonts(): Promise<string[]> {
  if (cached) return cached
  const q = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts
  if (q) {
    try {
      const fonts = await q()
      const fam = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
      if (fam.length) return (cached = fam)
    } catch {
      /* sin permiso: respaldo */
    }
  }
  return FALLBACK_FONTS
}

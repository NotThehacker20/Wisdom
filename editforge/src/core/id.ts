let counter = 0

/** Id corto, único dentro de la sesión y suficientemente aleatorio entre sesiones. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 0xffff
  const rand = Math.floor(Math.random() * 0xffffffff).toString(36)
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`
}

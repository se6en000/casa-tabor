import qrcode from 'qrcode-generator'

// Directions on the wall (canvas 13c): the route as a QR code his phone's camera opens in Google Maps.
// The squares only; the wall draws them in its own ink.

/** The dark squares of a QR code for `text`, row by row (error correction M: a phone reads it across the room). */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** One SVG path for the dark squares (1 unit each), so the code draws as a single shape. */
export function qrPath(modules: boolean[][]): string {
  return modules.flatMap((row, r) => row.map((dark, c) => (dark ? `M${c} ${r}h1v1h-1z` : ''))).join('')
}

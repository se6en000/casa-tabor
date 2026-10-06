// Photos and PDFs on their way to the server: a phone photo (often 4–10 MB) is drawn smaller first, so an import or
// an upload stays quick; a PDF goes as it is.

const MAX_SIDE = 1800

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size < 1_500_000 && file.type === 'image/jpeg') return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.86))
}

export async function fileToUpload(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === 'application/pdf') return { base64: toBase64(await file.arrayBuffer()), mimeType: 'application/pdf' }
  try {
    const blob = await shrink(file)
    return { base64: toBase64(await blob.arrayBuffer()), mimeType: blob.type || 'image/jpeg' }
  } catch {
    // A format the browser can't draw (HEIC on some browsers): send it as it is.
    return { base64: toBase64(await file.arrayBuffer()), mimeType: file.type || 'image/jpeg' }
  }
}

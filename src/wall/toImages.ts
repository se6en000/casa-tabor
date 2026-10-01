import { optimizeFileForVision } from '../utils/documentScanner'
import { readableFiles, type TypedImage } from './typeLine'

/** Pictures and PDFs, made small enough to send (the same as a scanned flyer). */
export async function toImages(files: File[]): Promise<TypedImage[]> {
  return Promise.all(readableFiles(files).map(async (file) => {
    const { base64, mimeType } = await optimizeFileForVision(file)
    return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType, name: file.name || 'Pasted picture' }
  }))
}

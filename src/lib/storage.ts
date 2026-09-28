import type { RuntimeEnv } from '../types'
import { safeFilename } from './http'

const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

export async function putImage(env: RuntimeEnv, image: File, folder: string) {
  const extension = allowedTypes.get(image.type)
  if (!extension) throw new Error('Only JPEG, PNG, and WebP images are allowed.')
  const maxBytes = Number(env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024)
  if (image.size > maxBytes) throw new Error(`Image must be smaller than ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  const bytes = new Uint8Array(await image.arrayBuffer())
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if ((extension === 'jpg' && !isJpeg) || (extension === 'png' && !isPng) || (extension === 'webp' && !isWebp)) throw new Error('The uploaded image content does not match its file type.')
  const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFilename(image.name || `upload.${extension}`)}`
  await env.PARISH_IMAGES.put(key, image.stream(), {
    httpMetadata: { contentType: image.type, cacheControl: 'private, no-store' },
    customMetadata: { originalName: image.name.slice(0, 120) },
  })
  return { key, url: undefined, contentType: image.type, size: image.size }
}

export async function deleteImage(env: RuntimeEnv, key: string | null | undefined) {
  if (key) await env.PARISH_IMAGES.delete(key)
}

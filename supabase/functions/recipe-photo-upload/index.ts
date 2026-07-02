import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'recipe-photos'

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function extensionFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('heic')) return 'heic'
  return 'jpg'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const recipeId = String(body?.recipe_id ?? '').trim()
    const fileBase64 = String(body?.file_base64 ?? '').trim()
    const mimeType = String(body?.mime_type ?? 'image/jpeg').trim() || 'image/jpeg'
    if (!recipeId) throw new Error('recipe_id is required')
    if (!fileBase64) throw new Error('file_base64 is required')
    if (!mimeType.toLowerCase().startsWith('image/')) throw new Error('mime_type must be an image')

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: buckets, error: listError } = await sb.storage.listBuckets()
    if (listError) throw new Error(`Could not list storage buckets: ${listError.message}`)
    const hasBucket = (buckets ?? []).some((bucket) => bucket.name === BUCKET)
    if (!hasBucket) {
      const { error: createError } = await sb.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: '15MB',
      })
      if (createError) throw new Error(`Could not create storage bucket: ${createError.message}`)
    }

    const ext = extensionFromMime(mimeType)
    const key = `${recipeId}/${Date.now()}-${crypto.randomUUID()}.${ext}`
    const bytes = decodeBase64(fileBase64)
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(key, bytes, {
      contentType: mimeType,
      upsert: false,
    })
    if (uploadError) throw new Error(`Could not upload photo: ${uploadError.message}`)
    const { data: publicData } = sb.storage.from(BUCKET).getPublicUrl(key)
    const url = String(publicData?.publicUrl ?? '').trim()
    if (!url) throw new Error('Could not resolve public URL')

    return new Response(JSON.stringify({ success: true, url }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message ?? 'recipe-photo-upload failed' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})


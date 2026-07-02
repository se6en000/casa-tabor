const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ImageSearchResult = {
  url: string
  title: string
  source: string
}

async function searchPexelsImages(query: string, limit: number): Promise<ImageSearchResult[]> {
  const apiKey = Deno.env.get('PEXELS_API_KEY') ?? ''
  if (!apiKey) {
    return []
  }
  const endpoint = new URL('https://api.pexels.com/v1/search')
  endpoint.searchParams.set('query', `${query} recipe food`)
  endpoint.searchParams.set('per_page', String(Math.max(1, Math.min(25, limit))))
  endpoint.searchParams.set('orientation', 'landscape')
  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: apiKey,
    },
  })
  if (!response.ok) {
    throw new Error(`Pexels image search failed (${response.status})`)
  }
  const payload = await response.json() as {
    photos?: Array<{ alt?: string; url?: string; src?: { large2x?: string; large?: string; landscape?: string } }>
  }
  return (payload.photos ?? [])
    .map((photo) => {
      const url = String(photo.src?.large2x ?? photo.src?.large ?? photo.src?.landscape ?? '').trim()
      if (!url) return null
      return {
        url,
        title: String(photo.alt ?? '').trim(),
        source: 'Pexels',
      } as ImageSearchResult
    })
    .filter((row): row is ImageSearchResult => row !== null)
}

async function searchUnsplashImages(query: string, limit: number): Promise<ImageSearchResult[]> {
  const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY') ?? ''
  if (!accessKey) {
    return []
  }
  const endpoint = new URL('https://api.unsplash.com/search/photos')
  endpoint.searchParams.set('query', `${query} recipe food`)
  endpoint.searchParams.set('per_page', String(Math.max(1, Math.min(30, limit))))
  endpoint.searchParams.set('orientation', 'landscape')
  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  })
  if (!response.ok) {
    throw new Error(`Unsplash image search failed (${response.status})`)
  }
  const payload = await response.json() as {
    results?: Array<{ alt_description?: string; description?: string; links?: { html?: string }; urls?: { regular?: string; full?: string } }>
  }
  return (payload.results ?? [])
    .map((item) => {
      const url = String(item.urls?.regular ?? item.urls?.full ?? '').trim()
      if (!url) return null
      return {
        url,
        title: String(item.alt_description ?? item.description ?? '').trim(),
        source: 'Unsplash',
      } as ImageSearchResult
    })
    .filter((row): row is ImageSearchResult => row !== null)
}

async function searchWikimediaImages(query: string, limit: number): Promise<ImageSearchResult[]> {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php')
  endpoint.searchParams.set('action', 'query')
  endpoint.searchParams.set('format', 'json')
  endpoint.searchParams.set('generator', 'search')
  endpoint.searchParams.set('gsrnamespace', '6')
  endpoint.searchParams.set('gsrlimit', String(Math.max(6, Math.min(20, limit + 8))))
  endpoint.searchParams.set('gsrsearch', `${query} food meal`)
  endpoint.searchParams.set('prop', 'imageinfo')
  endpoint.searchParams.set('iiprop', 'url')
  endpoint.searchParams.set('iiurlwidth', '1200')
  endpoint.searchParams.set('origin', '*')
  const response = await fetch(endpoint.toString())
  if (!response.ok) {
    throw new Error(`Wikimedia image search failed (${response.status})`)
  }
  const payload = await response.json() as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }> }
  }
  const pages = Object.values(payload.query?.pages ?? {})
  return pages
    .map((page) => {
      const info = page.imageinfo?.[0]
      const url = String(info?.thumburl ?? info?.url ?? '').trim()
      if (!url) return null
      return {
        url,
        title: String(page.title ?? '').replace(/^File:/i, ''),
        source: 'Wikimedia',
      } as ImageSearchResult
    })
    .filter((row): row is ImageSearchResult => row !== null)
    .slice(0, limit)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    const body = await req.json().catch(() => ({}))
    const query = String(body?.query ?? '').trim()
    const limitRaw = Number(body?.limit ?? 10)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.floor(limitRaw))) : 10
    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'query is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const deduped = new Map<string, ImageSearchResult>()
    const errors: string[] = []

    try {
      const pexelsResults = await searchPexelsImages(query, limit)
      for (const item of pexelsResults) {
        if (!deduped.has(item.url)) deduped.set(item.url, item)
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Pexels image search failed')
    }

    if (deduped.size < limit) {
      try {
        const unsplashResults = await searchUnsplashImages(query, limit)
        for (const item of unsplashResults) {
          if (!deduped.has(item.url)) deduped.set(item.url, item)
          if (deduped.size >= limit) break
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unsplash image search failed')
      }
    }

    if (deduped.size < limit) {
      try {
        const wikimediaResults = await searchWikimediaImages(query, limit)
        for (const item of wikimediaResults) {
          if (!deduped.has(item.url)) deduped.set(item.url, item)
          if (deduped.size >= limit) break
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Wikimedia image search failed')
      }
    }

    const results = Array.from(deduped.values()).slice(0, limit)
    return new Response(
      JSON.stringify({
        success: true,
        provider: results.some((row) => row.source === 'Pexels' || row.source === 'Unsplash') ? 'pexels+unsplash+fallback' : 'fallback',
        results,
        warnings: errors,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'recipe-image-search failed',
      }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } },
    )
  }
})

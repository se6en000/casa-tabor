import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  getPersonalArtworkValidationError,
  normalizeArtSourceConfig,
  PERSONAL_ARTWORK_BUCKET,
  type ArtSourceMode,
} from '../lib/artModeLibrary'

const ART_SOURCE_SETTING_KEY = 'art_mode_source_config'

export interface PersonalArtwork {
  id: string
  storagePath: string
  title: string
  imageUrl: string
  mimeType: string
  byteSize: number
  createdAt: string
}

interface PersonalArtworkRow {
  id: string
  storage_path: string
  title: string
  mime_type: string
  byte_size: number
  created_at: string
}

export const personalArtworkQueryKey = ['personal-artwork'] as const
export const artSourceConfigQueryKey = ['settings', ART_SOURCE_SETTING_KEY] as const

async function loadPersonalArtwork(): Promise<PersonalArtwork[]> {
  const { data, error } = await supabase
    .from('personal_artwork')
    .select('id, storage_path, title, mime_type, byte_size, created_at')
    .order('sort_order')
    .order('created_at')
  if (error) throw error

  return ((data ?? []) as PersonalArtworkRow[]).map(row => ({
    id: row.id,
    storagePath: row.storage_path,
    title: row.title,
    imageUrl: supabase.storage.from(PERSONAL_ARTWORK_BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  }))
}

async function loadArtSourceMode(): Promise<ArtSourceMode> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', ART_SOURCE_SETTING_KEY)
    .maybeSingle()
  if (error) throw error
  return normalizeArtSourceConfig(data?.value).sourceMode
}

export function usePersonalArtModeData() {
  const artworkQuery = useQuery({
    queryKey: personalArtworkQueryKey,
    queryFn: loadPersonalArtwork,
    staleTime: 30_000,
  })
  const sourceQuery = useQuery({
    queryKey: artSourceConfigQueryKey,
    queryFn: loadArtSourceMode,
    staleTime: 30_000,
  })

  return {
    artworks: artworkQuery.data ?? [],
    sourceMode: sourceQuery.data ?? 'casa',
    loading: artworkQuery.isLoading || sourceQuery.isLoading,
    error: artworkQuery.error ?? sourceQuery.error,
  }
}

export function usePersonalArtMode() {
  const queryClient = useQueryClient()
  const data = usePersonalArtModeData()

  const sourceMutation = useMutation({
    mutationFn: async (sourceMode: ArtSourceMode) => {
      const { error } = await supabase.from('settings').upsert(
        {
          key: ART_SOURCE_SETTING_KEY,
          value: { sourceMode },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      )
      if (error) throw error
      return sourceMode
    },
    onSuccess: sourceMode => {
      queryClient.setQueryData(artSourceConfigQueryKey, sourceMode)
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const validationError = getPersonalArtworkValidationError(file)
      if (validationError) throw new Error(validationError)

      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const storagePath = `${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from(PERSONAL_ARTWORK_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Personal artwork'
      const { error: insertError } = await supabase.from('personal_artwork').insert({
        storage_path: storagePath,
        title,
        mime_type: file.type,
        byte_size: file.size,
      })
      if (insertError) {
        const { error: cleanupError } = await supabase.storage.from(PERSONAL_ARTWORK_BUCKET).remove([storagePath])
        if (cleanupError) {
          throw new Error(`${insertError.message} Cleanup also failed: ${cleanupError.message}`)
        }
        throw insertError
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: personalArtworkQueryKey }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (artwork: PersonalArtwork) => {
      const { error: deleteRowError } = await supabase
        .from('personal_artwork')
        .delete()
        .eq('id', artwork.id)
      if (deleteRowError) throw deleteRowError

      const { error: deleteObjectError } = await supabase.storage
        .from(PERSONAL_ARTWORK_BUCKET)
        .remove([artwork.storagePath])
      if (deleteObjectError) {
        throw new Error(`Artwork was removed from Art Mode, but storage cleanup failed: ${deleteObjectError.message}`)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: personalArtworkQueryKey }),
  })

  return {
    ...data,
    setSourceMode: sourceMutation.mutateAsync,
    uploadArtwork: uploadMutation.mutateAsync,
    deleteArtwork: deleteMutation.mutateAsync,
    changingSource: sourceMutation.isPending,
    uploading: uploadMutation.isPending,
    deleting: deleteMutation.isPending,
  }
}

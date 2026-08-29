import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  getPersonalArtworkValidationError,
  normalizeArtSourceConfig,
  sanitizeArtworkTitle,
  PERSONAL_ARTWORK_BUCKET,
  type ArtSourceMode,
  type SignatureStyle,
  type SignaturePosition,
  type SignatureColor,
  type SignatureSize,
} from '../lib/artModeLibrary'

const ART_SOURCE_SETTING_KEY = 'art_mode_source_config'

export interface PersonalArtwork {
  id: string
  storagePath: string
  title: string
  artist?: string
  location?: string
  dateTaken?: string
  description?: string
  subjects?: string
  medium?: string
  funFact?: string
  imageUrl: string
  mimeType: string
  byteSize: number
  createdAt: string
  signatureEnabled?: boolean
  signatureText?: string
  signatureStyle?: SignatureStyle
  signaturePosition?: SignaturePosition
  signatureColor?: SignatureColor
  signatureSize?: SignatureSize
  signatureOpacity?: number
}

interface PersonalArtworkRow {
  id: string
  storage_path: string
  title: string
  artist?: string | null
  location?: string | null
  date_taken?: string | null
  description?: string | null
  subjects?: string | null
  medium?: string | null
  fun_fact?: string | null
  mime_type: string
  byte_size: number
  created_at: string
  signature_enabled?: boolean | null
  signature_text?: string | null
  signature_style?: string | null
  signature_position?: string | null
  signature_color?: string | null
  signature_size?: string | null
  signature_opacity?: number | null
}

export const personalArtworkQueryKey = ['personal-artwork'] as const
export const artSourceConfigQueryKey = ['settings', ART_SOURCE_SETTING_KEY] as const

async function loadPersonalArtwork(): Promise<PersonalArtwork[]> {
  let { data, error } = await supabase
    .from('personal_artwork')
    .select('id, storage_path, title, artist, location, date_taken, description, subjects, medium, fun_fact, mime_type, byte_size, created_at, signature_enabled, signature_text, signature_style, signature_position, signature_color, signature_size, signature_opacity')
    .order('sort_order')
    .order('created_at')

  if (error) {
    const fallback = await supabase
      .from('personal_artwork')
      .select('id, storage_path, title, artist, mime_type, byte_size, created_at')
      .order('sort_order')
      .order('created_at')
    if (fallback.error) throw fallback.error
    data = fallback.data as unknown as typeof data
  }

  return ((data ?? []) as PersonalArtworkRow[]).map(row => ({
    id: row.id,
    storagePath: row.storage_path,
    title: row.title,
    artist: row.artist?.trim() || undefined,
    location: row.location?.trim() || undefined,
    dateTaken: row.date_taken?.trim() || undefined,
    description: row.description?.trim() || undefined,
    subjects: row.subjects?.trim() || undefined,
    medium: row.medium?.trim() || undefined,
    funFact: row.fun_fact?.trim() || undefined,
    imageUrl: supabase.storage.from(PERSONAL_ARTWORK_BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    signatureEnabled: Boolean(row.signature_enabled),
    signatureText: row.signature_text?.trim() || undefined,
    signatureStyle: (row.signature_style as SignatureStyle) || 'fountain',
    signaturePosition: (row.signature_position as SignaturePosition) || 'bottom-right',
    signatureColor: (row.signature_color as SignatureColor) || 'auto',
    signatureSize: (row.signature_size as SignatureSize) || 'md',
    signatureOpacity: row.signature_opacity != null ? Number(row.signature_opacity) : 0.55,
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
    mutationFn: async ({ file, title, artist }: { file: File; title?: string; artist?: string }) => {
      const validationError = getPersonalArtworkValidationError(file)
      if (validationError) throw new Error(validationError)

      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const storagePath = `${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from(PERSONAL_ARTWORK_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const cleanTitle = (title ? title.trim() : sanitizeArtworkTitle(file.name)) || 'Personal artwork'
      const cleanArtist = artist?.trim() || null
      const { error: insertError } = await supabase.from('personal_artwork').insert({
        storage_path: storagePath,
        title: cleanTitle,
        artist: cleanArtist,
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

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      title,
      artist,
      location,
      dateTaken,
      description,
      subjects,
      medium,
      funFact,
      signatureEnabled,
      signatureText,
      signatureStyle,
      signaturePosition,
      signatureColor,
      signatureSize,
      signatureOpacity,
    }: {
      id: string
      title?: string
      artist?: string
      location?: string
      dateTaken?: string
      description?: string
      subjects?: string
      medium?: string
      funFact?: string
      signatureEnabled?: boolean
      signatureText?: string
      signatureStyle?: SignatureStyle
      signaturePosition?: SignaturePosition
      signatureColor?: SignatureColor
      signatureSize?: SignatureSize
      signatureOpacity?: number
    }) => {
      const cleanTitle = title !== undefined ? sanitizeArtworkTitle(title) : undefined
      const cleanArtist = artist !== undefined ? (artist.trim() || null) : undefined
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (cleanTitle !== undefined) updatePayload.title = cleanTitle
      if (cleanArtist !== undefined) updatePayload.artist = cleanArtist
      if (location !== undefined) updatePayload.location = location.trim() || null
      if (dateTaken !== undefined) updatePayload.date_taken = dateTaken.trim() || null
      if (description !== undefined) updatePayload.description = description.trim() || null
      if (subjects !== undefined) updatePayload.subjects = subjects.trim() || null
      if (medium !== undefined) updatePayload.medium = medium.trim() || null
      if (funFact !== undefined) updatePayload.fun_fact = funFact.trim() || null
      if (signatureEnabled !== undefined) updatePayload.signature_enabled = signatureEnabled
      if (signatureText !== undefined) updatePayload.signature_text = signatureText.trim() || null
      if (signatureStyle !== undefined) updatePayload.signature_style = signatureStyle
      if (signaturePosition !== undefined) updatePayload.signature_position = signaturePosition
      if (signatureColor !== undefined) updatePayload.signature_color = signatureColor
      if (signatureSize !== undefined) updatePayload.signature_size = signatureSize
      if (signatureOpacity !== undefined) updatePayload.signature_opacity = signatureOpacity

      const { error } = await supabase
        .from('personal_artwork')
        .update(updatePayload)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: personalArtworkQueryKey }),
  })

  const cropMutation = useMutation({
    mutationFn: async ({
      id,
      file,
      oldStoragePath,
      title,
      artist,
    }: {
      id: string
      file: File
      oldStoragePath?: string
      title?: string
      artist?: string
    }) => {
      const validationError = getPersonalArtworkValidationError(file)
      if (validationError) throw new Error(validationError)

      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const newStoragePath = `${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from(PERSONAL_ARTWORK_BUCKET)
        .upload(newStoragePath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError

      const updatePayload: {
        storage_path: string
        mime_type: string
        byte_size: number
        updated_at: string
        title?: string
        artist?: string | null
      } = {
        storage_path: newStoragePath,
        mime_type: file.type,
        byte_size: file.size,
        updated_at: new Date().toISOString(),
      }
      if (title !== undefined) updatePayload.title = title.trim() || 'Personal artwork'
      if (artist !== undefined) updatePayload.artist = artist.trim() || null

      const { error: updateError } = await supabase
        .from('personal_artwork')
        .update(updatePayload)
        .eq('id', id)

      if (updateError) {
        await supabase.storage.from(PERSONAL_ARTWORK_BUCKET).remove([newStoragePath])
        throw updateError
      }

      if (oldStoragePath && oldStoragePath !== newStoragePath) {
        await supabase.storage.from(PERSONAL_ARTWORK_BUCKET).remove([oldStoragePath]).catch(() => {})
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
    uploadArtwork: (file: File) => uploadMutation.mutateAsync({ file }),
    updateArtwork: updateMutation.mutateAsync,
    cropArtwork: cropMutation.mutateAsync,
    deleteArtwork: deleteMutation.mutateAsync,
    changingSource: sourceMutation.isPending,
    uploading: uploadMutation.isPending,
    updating: updateMutation.isPending,
    cropping: cropMutation.isPending,
    deleting: deleteMutation.isPending,
  }
}

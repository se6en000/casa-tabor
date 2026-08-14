import { createClient } from '@supabase/supabase-js'

const nodeProcess = typeof globalThis !== 'undefined'
  ? (globalThis as unknown as { process?: { env?: Record<string, string> } }).process
  : undefined

export const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  nodeProcess?.env?.VITE_SUPABASE_URL ||
  ''
export const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  nodeProcess?.env?.VITE_SUPABASE_ANON_KEY ||
  ''

if (!supabaseUrl || !supabaseAnonKey) {
  if (!nodeProcess || nodeProcess.env?.NODE_ENV !== 'test') {
    // Only throw in interactive runtime if env is missing
    console.warn('Missing Supabase environment variables — check .env.local')
  }
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key')
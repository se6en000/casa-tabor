import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const paths = ['.env.local', '.env']
  for (const p of paths) {
    const fullPath = resolve(p)
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          if (!process.env[key]) process.env[key] = val
        }
      }
    }
  }
}

loadEnv()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

const testCases = [
  {
    name: 'ai_drawer_debug_events (dedupe_key)',
    run: () => supabase.from('ai_drawer_debug_events').upsert(
      [{ dedupe_key: 'test_key_probe_1', event: 'probe' }],
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    )
  },
  {
    name: 'event_members (event_id,family_member_id)',
    run: () => supabase.from('event_members').upsert(
      [{ event_id: '00000000-0000-0000-0000-000000000000', family_member_id: '00000000-0000-0000-0000-000000000000', role: 'passenger' }],
      { onConflict: 'event_id,family_member_id' }
    )
  },
  {
    name: 'family_contact_relationships (family_member_id,contact_id,relationship)',
    run: () => supabase.from('family_contact_relationships').upsert(
      [{ family_member_id: '00000000-0000-0000-0000-000000000000', contact_id: '00000000-0000-0000-0000-000000000000', relationship: 'test' }],
      { onConflict: 'family_member_id,contact_id,relationship' }
    )
  },
  {
    name: 'gmail_processed_messages (family_member_id,gmail_message_id)',
    run: () => supabase.from('gmail_processed_messages').upsert(
      [{ family_member_id: '00000000-0000-0000-0000-000000000000', gmail_message_id: 'probe_msg_1' }],
      { onConflict: 'family_member_id,gmail_message_id' }
    )
  },
  {
    name: 'gmail_processed_messages (gmail_message_id,family_member_id)',
    run: () => supabase.from('gmail_processed_messages').upsert(
      [{ family_member_id: '00000000-0000-0000-0000-000000000000', gmail_message_id: 'probe_msg_1' }],
      { onConflict: 'gmail_message_id,family_member_id' }
    )
  },
  {
    name: 'push_subscriptions (endpoint)',
    run: () => supabase.from('push_subscriptions').upsert(
      [{ endpoint: 'https://probe.test/endpoint', p256dh: 'a', auth: 'b' }],
      { onConflict: 'endpoint' }
    )
  },
  {
    name: 'google_calendar_connections (google_email,calendar_id)',
    run: () => supabase.from('google_calendar_connections').upsert(
      [{ google_email: 'probe@test.com', calendar_id: 'probe_cal' }],
      { onConflict: 'google_email,calendar_id' }
    )
  },
  {
    name: 'household_graph_nodes (node_key)',
    run: () => supabase.from('household_graph_nodes').upsert(
      [{ node_key: 'probe_node', node_type: 'probe', label: 'probe' }],
      { onConflict: 'node_key' }
    )
  },
  {
    name: 'household_graph_edges (edge_type,from_node_id,to_node_id)',
    run: () => supabase.from('household_graph_edges').upsert(
      [{ edge_type: 'probe', from_node_id: '00000000-0000-0000-0000-000000000000', to_node_id: '00000000-0000-0000-0000-000000000000' }],
      { onConflict: 'edge_type,from_node_id,to_node_id' }
    )
  },
  {
    name: 'event_plan_overrides (event_id)',
    run: () => supabase.from('event_plan_overrides').upsert(
      [{ event_id: '00000000-0000-0000-0000-000000000000' }],
      { onConflict: 'event_id' }
    )
  },
  {
    name: 'event_enrichments (event_id)',
    run: () => supabase.from('event_enrichments').upsert(
      [{ event_id: '00000000-0000-0000-0000-000000000000' }],
      { onConflict: 'event_id' }
    )
  },
  {
    name: 'route_eta_cache (cache_key)',
    run: () => supabase.from('route_eta_cache').upsert(
      [{ cache_key: 'probe_key', origin_address: 'a', destination_address: 'b', distance_meters: 0, duration_seconds: 0, duration_in_traffic_seconds: 0 }],
      { onConflict: 'cache_key' }
    )
  },
  {
    name: 'family_data_documents (source_type,source_id)',
    run: () => supabase.from('family_data_documents').upsert(
      [{ source_type: 'event', source_id: 'probe_id', title: 'probe', raw_text: 'probe', redacted_text: 'probe', content_hash: 'probe' }],
      { onConflict: 'source_type,source_id' }
    )
  },
  {
    name: 'grocery_corrections (canonical_name_normalized)',
    run: () => supabase.from('grocery_corrections').upsert(
      [{ canonical_name_normalized: 'probe_item', original_name: 'probe' }],
      { onConflict: 'canonical_name_normalized' }
    )
  }
]

async function runAll() {
  console.log('Testing all upsert conflict targets...')
  for (const tc of testCases) {
    try {
      const res = await tc.run()
      if (res.error) {
        console.log(`❌ ${tc.name}: ERROR [${res.error.code}] ${res.error.message}`)
      } else {
        console.log(`✅ ${tc.name}: OK`)
      }
    } catch (err) {
      console.log(`❌ ${tc.name}: EXCEPTION ${err.message}`)
    }
  }
  // Cleanup test probe
  await supabase.from('ai_drawer_debug_events').delete().eq('dedupe_key', 'test_key_probe_1')
  await supabase.from('route_eta_cache').delete().eq('cache_key', 'probe_key')
  await supabase.from('family_data_documents').delete().eq('source_id', 'probe_id')
  await supabase.from('grocery_corrections').delete().eq('canonical_name_normalized', 'probe_item')
}

runAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

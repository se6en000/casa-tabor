import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, ANON_KEY } from './scripts/assistant-situations/world.mjs'
const sb = createClient(SUPABASE_URL, ANON_KEY)
const started = Date.now()
sb.channel('latency-probe')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (p) => {
    const saved = Date.parse(p.commit_timestamp)
    console.log(`${new Date().toLocaleTimeString('en-US', { hour12: false })} ${p.eventType} "${String(p.new?.title ?? '').slice(0, 40)}" arrived ${((Date.now() - saved) / 1000).toFixed(1)}s after the save`)
  })
  .subscribe((status, err) => console.log(`${new Date().toLocaleTimeString('en-US', { hour12: false })} channel: ${status}${err ? ' ' + err.message : ''}`))
setTimeout(() => { console.log('done'); process.exit(0) }, Number(process.argv[2] ?? 420) * 1000)

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = 'BCZWz_dMYnBkaJcwFy8u9vB6KkXXaWHGfsaeULb4tWOZo0hGSth4gWFtil8L86hjUOiRVnncAeKLlcFHU8xI6CQ'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const registered = useRef(false)

  useEffect(() => {
    if (registered.current) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    register()
    registered.current = true
  }, [])

  async function register() {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // Only request if not already granted
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

      const json = sub.toJSON()
      if (!json.keys) return

      // Detect device label
      const ua = navigator.userAgent
      const label = /iPhone|iPad/.test(ua)
        ? 'iPhone'
        : /Android/.test(ua)
        ? 'Android'
        : /Pi|Linux arm/.test(ua)
        ? 'Pi Kiosk'
        : 'Browser'

      // Upsert — endpoint is unique key so re-subscribing is idempotent
      await supabase.from('push_subscriptions').upsert(
        {
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          device_label: label,
        },
        { onConflict: 'endpoint' }
      )

      console.log('[Push] Subscribed —', label)
    } catch (err) {
      console.warn('[Push] Registration failed:', err)
    }
  }
}

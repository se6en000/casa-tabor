import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = 'BCZWz_dMYnBkaJcwFy8u9vB6KkXXaWHGfsaeULb4tWOZo0hGSth4gWFtil8L86hjUOiRVnncAeKLlcFHU8xI6CQ'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export async function subscribeDeviceToPush(): Promise<{
  ok: boolean
  permission: NotificationPermission | 'unsupported'
  error?: string
}> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, permission: 'unsupported', error: 'Web Push is not supported on this browser/environment.' }
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, permission, error: 'Notification permission was not granted.' }
    }

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const json = sub.toJSON()
    if (!json.keys) {
      return { ok: false, permission, error: 'Subscription missing encryption keys.' }
    }

    const ua = navigator.userAgent
    const label = /iPhone|iPad/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
      ? 'Android'
      : /Pi|Linux arm/.test(ua)
      ? 'Pi Kiosk'
      : 'Browser'

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
    return { ok: true, permission }
  } catch (err) {
    console.warn('[Push] Registration failed:', err)
    return { ok: false, permission: 'denied', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendDeviceTestPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        title: 'Casa Tabor: Test Alert',
        body: 'Push notifications are working on this device!',
        tag: `test-push-${Date.now()}`,
        actions: [
          { action: 'done', title: 'Complete' },
          { action: 'thumbs_down', title: 'Dismiss' },
        ],
        data: { url: '/' },
      },
    })
    if (error) throw error
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function usePushNotifications() {
  const registered = useRef(false)

  useEffect(() => {
    if (registered.current) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    subscribeDeviceToPush()
    registered.current = true
  }, [])
}

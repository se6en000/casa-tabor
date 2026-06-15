import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = 'BCZWz_dMYnBkaJcwFy8u9vB6KkXXaWHGfsaeULb4tWOZo0hGSth4gWFtil8L86hjUOiRVnncAeKLlcFHU8xI6CQ'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  )

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  const deviceLabel =
    /iPhone|iPad/.test(navigator.userAgent)
      ? 'iPhone'
      : /Android/.test(navigator.userAgent)
      ? 'Android'
      : /Pi|Linux arm/.test(navigator.userAgent)
      ? 'Pi Kiosk'
      : 'Browser'

  const refreshStatus = useCallback(async () => {
    if (!supported) return
    try {
      setPermission(Notification.permission)
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(Boolean(sub))
    } catch {
      setSubscribed(false)
    }
  }, [supported])

  const enablePush = useCallback(async () => {
    if (!supported) {
      setError('Push is not supported in this browser.')
      return false
    }
    setBusy(true)
    setError(null)

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      let currentPermission = Notification.permission
      if (currentPermission === 'default') {
        currentPermission = await Notification.requestPermission()
      }
      setPermission(currentPermission)
      if (currentPermission !== 'granted') {
        setSubscribed(false)
        return false
      }

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

      const json = sub.toJSON()
      if (!json.keys?.p256dh || !json.keys.auth) {
        throw new Error('Invalid push subscription keys.')
      }

      const { error: registerError } = await supabase.functions.invoke('register-push-subscription', {
        body: {
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          device_label: deviceLabel,
        },
      })
      if (registerError) throw registerError

      setSubscribed(true)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubscribed(false)
      return false
    } finally {
      setBusy(false)
    }
  }, [deviceLabel, supported])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  return {
    supported,
    permission,
    subscribed,
    busy,
    error,
    deviceLabel,
    enablePush,
    refreshStatus,
  }
}

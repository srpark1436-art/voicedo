import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotification() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [error, setError] = useState(null)

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  // 마운트 시 실제 구독 여부 확인
  useEffect(() => {
    if (!isSupported) return
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub)
      })
    })
  }, [isSupported])

  const subscribe = useCallback(async (username, notifyTime = '13:30') => {
    if (!isSupported) {
      setError('이 브라우저는 푸쉬 알림을 지원하지 않습니다.')
      return false
    }

    try {
      setError(null)

      // 알림 권한 요청 (사용자 제스처 내에서 호출됨)
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        setError('알림 권한이 거부되었습니다.')
        return false
      }

      // Service Worker 등록 확인
      const registration = await navigator.serviceWorker.ready

      // VAPID 공개키로 구독
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        setError('VAPID 공개키가 설정되지 않았습니다.')
        return false
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      // Supabase에 구독 정보 + 알림 시간 저장
      const { error: dbError } = await supabase
        .from('users')
        .update({ push_subscription: subscription.toJSON(), notify_time: notifyTime })
        .eq('username', username)

      if (dbError) throw dbError

      setIsSubscribed(true)
      return true
    } catch (err) {
      setError(`알림 설정 실패: ${err.message}`)
      return false
    }
  }, [isSupported])

  const unsubscribe = useCallback(async (username) => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }

      await supabase
        .from('users')
        .update({ push_subscription: null })
        .eq('username', username)

      setIsSubscribed(false)
    } catch (err) {
      setError(`알림 해제 실패: ${err.message}`)
    }
  }, [])

  return {
    isSupported,
    permission,
    isSubscribed,
    error,
    subscribe,
    unsubscribe,
  }
}

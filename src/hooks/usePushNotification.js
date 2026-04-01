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

export function usePushNotification(userId) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [error, setError] = useState(null)

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window

  // 마운트 시 구독 여부 확인 (브라우저 PushManager + DB 양쪽 체크)
  useEffect(() => {
    if (!userId) return

    // DB에서 push_subscription 확인 (localhost 등 브라우저 구독이 없어도 구독 상태 유지)
    supabase
      .from('users')
      .select('push_subscription')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.push_subscription) {
          setIsSubscribed(true)
          return
        }
        // DB에 없으면 브라우저 PushManager 재확인
        if (!isSupported) return
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            setIsSubscribed(!!sub)
          })
        })
      })
  }, [userId, isSupported])

  const subscribe = useCallback(async (_username, notifyTime = '13:30') => {
    console.log('[Push] subscribe 시작, isSupported:', isSupported, 'userId:', userId)
    if (!isSupported) {
      setError('이 브라우저는 푸쉬 알림을 지원하지 않습니다.')
      return false
    }

    try {
      setError(null)

      console.log('[Push] 알림 권한 요청...')
      const result = await Notification.requestPermission()
      setPermission(result)
      console.log('[Push] 알림 권한 결과:', result)

      if (result !== 'granted') {
        setError('알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.')
        return false
      }

      console.log('[Push] Service Worker 대기...')
      const registration = await navigator.serviceWorker.ready
      console.log('[Push] SW ready')

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        setError('VAPID 공개키가 설정되지 않았습니다.')
        return false
      }

      console.log('[Push] pushManager.subscribe...')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      console.log('[Push] 구독 성공:', JSON.stringify(subscription.toJSON()).slice(0, 100))

      console.log('[Push] DB 저장... userId:', userId)
      const { error: dbError } = await supabase
        .from('users')
        .update({ push_subscription: subscription.toJSON(), notify_time: notifyTime })
        .eq('id', userId)

      if (dbError) {
        console.error('[Push] DB 저장 실패:', dbError)
        throw dbError
      }
      console.log('[Push] DB 저장 완료')

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('[Push] subscribe 실패:', err)
      setError(`알림 설정 실패: ${err.message}`)
      return false
    }
  }, [isSupported, userId])

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }

      await supabase
        .from('users')
        .update({ push_subscription: null })
        .eq('id', userId)

      setIsSubscribed(false)
    } catch (err) {
      setError(`알림 해제 실패: ${err.message}`)
    }
  }, [userId])

  return {
    isSupported,
    permission,
    isSubscribed,
    error,
    subscribe,
    unsubscribe,
  }
}

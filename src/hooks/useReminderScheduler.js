import { useEffect, useRef } from 'react'
import { useTodoStore } from '../store/todoStore'

/**
 * 로컬 알림 스케줄러
 * reminder_at이 설정된 미완료 할일을 감시하고, 시간이 되면 브라우저 알림을 발송합니다.
 * 앱이 열려 있는 동안만 동작합니다 (백그라운드 알림은 Service Worker/pg_cron이 처리).
 */
export function useReminderScheduler() {
  const timersRef = useRef({})

  useEffect(() => {
    const checkReminders = () => {
      const { todos } = useTodoStore.getState()
      const now = Date.now()

      // 기존 타이머 정리
      Object.keys(timersRef.current).forEach((id) => {
        if (!todos.find((t) => t.id === id)) {
          clearTimeout(timersRef.current[id])
          delete timersRef.current[id]
        }
      })

      todos.forEach((todo) => {
        if (!todo.reminder_at || todo.is_completed) return
        if (timersRef.current[todo.id]) return // 이미 스케줄됨

        const reminderTime = new Date(todo.reminder_at).getTime()
        const delay = reminderTime - now

        if (delay <= 0) return // 이미 지남
        if (delay > 24 * 60 * 60 * 1000) return // 24시간 이상 → 다음 체크에서 처리

        timersRef.current[todo.id] = setTimeout(() => {
          fireNotification(todo)
          delete timersRef.current[todo.id]
        }, delay)
      })
    }

    // 초기 실행 + 1분마다 체크
    checkReminders()
    const interval = setInterval(checkReminders, 60 * 1000)

    // 할일 변경 구독
    const unsub = useTodoStore.subscribe(checkReminders)

    return () => {
      clearInterval(interval)
      unsub()
      Object.values(timersRef.current).forEach(clearTimeout)
      timersRef.current = {}
    }
  }, [])
}

function fireNotification(todo) {
  // 브라우저 Notification API
  if (Notification.permission === 'granted') {
    new Notification('VoiceDo 알림', {
      body: todo.content,
      icon: '/icons/icon-192x192.png',
      tag: `reminder-${todo.id}`,
    })
  }

  // 앱 내 알림 (TTS)
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(`알림: ${todo.content}`)
    utter.lang = 'ko-KR'
    utter.rate = 1.0
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }
}

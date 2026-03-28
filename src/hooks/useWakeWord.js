import { useEffect, useRef, useCallback } from 'react'

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

// 인식 패턴: "헬로 제니퍼", "Hello Jennifer", "하이 제니퍼", "안녕 제니퍼"
const WAKE_PATTERN = /헬+로\s*제+니+퍼|hello\s*jen+i+fer|하이\s*제+니+퍼|안녕\s*제+니+퍼|hi\s*jen+i+fer/i

/**
 * 항상-온 웨이크워드 감지 훅
 * enabled=true 동안 백그라운드에서 음성을 폴링하며 웨이크워드 감지 시 onWakeWord 호출
 * iOS Safari는 user gesture 없이 start() 불가 → 자동 무시됨
 */
export function useWakeWord({ onWakeWord, enabled = true }) {
  const recognitionRef = useRef(null)
  const enabledRef = useRef(enabled)
  const restartTimerRef = useRef(null)
  const onWakeWordRef = useRef(onWakeWord)

  enabledRef.current = enabled
  onWakeWordRef.current = onWakeWord

  const stop = useCallback(() => {
    clearTimeout(restartTimerRef.current)
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.onerror = null
      recognitionRef.current.onresult = null
      try { recognitionRef.current.abort() } catch (_) {}
      recognitionRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!SpeechRecognition || !enabledRef.current) return
    stop()

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 5

    recognition.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          const text = event.results[i][j].transcript
          if (WAKE_PATTERN.test(text)) {
            // 웨이크워드 인식 완전 종료 후 콜백 (브라우저 오디오 해제 대기 필요)
            stop()
            setTimeout(() => onWakeWordRef.current?.(), 500)
            return
          }
        }
      }
    }

    recognition.onend = () => {
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(start, 400)
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') return
      if (enabledRef.current) {
        // aborted / network 오류 시 재시도
        restartTimerRef.current = setTimeout(start, 1500)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (_) {
      // iOS 등 user gesture 없이 실패 시 조용히 무시
    }
  }, [stop])

  useEffect(() => {
    if (enabled) {
      // 다른 인식 인스턴스와 충돌 방지를 위해 살짝 딜레이
      restartTimerRef.current = setTimeout(start, 500)
    } else {
      stop()
    }
    return stop
  }, [enabled, start, stop])
}

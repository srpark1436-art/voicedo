import { useEffect, useRef, useCallback } from 'react'

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

// 인식 패턴: 다양한 변형 포함 (Web Speech가 한국어 모드에서 영어를 다양하게 인식)
const WAKE_PATTERN = /헬+로\s*제+니+퍼|hello\s*jen+i+fer|하이\s*제+니+퍼|안녕\s*제+니+퍼|hi\s*jen+i+fer|혤+로\s*제+니|헐+로\s*제+니|헬+로\s*재+니|헬+로\s*쩨+니|헬+로\s*지+니|hell+o\s*gen|제+니+퍼/i

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
    recognition.continuous = true       // 계속 듣기 (세션 끊김 최소화)
    recognition.interimResults = true   // 중간 결과로 빠른 감지
    recognition.maxAlternatives = 5

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          const text = event.results[i][j].transcript
          if (WAKE_PATTERN.test(text)) {
            stop()
            setTimeout(() => onWakeWordRef.current?.(), 50)
            return
          }
        }
      }
    }

    recognition.onend = () => {
      // continuous=true여도 브라우저가 종료할 수 있음 → 즉시 재시작
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(start, 150)
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') return
      if (e.error === 'no-speech') return // 무음 → onend에서 재시작
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(start, 800)
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

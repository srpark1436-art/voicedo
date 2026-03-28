import { useState, useRef, useCallback } from 'react'

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

export function useSpeechRecognition({ onResult, onEnd } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const hadErrorRef = useRef(false)  // onerror→onend 간 에러 전달용

  const isSupported = Boolean(SpeechRecognition)

  const start = useCallback(() => {
    if (!isSupported) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다.')
      return
    }

    setError(null)
    setTranscript('')
    setInterimTranscript('')

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (finalText) {
        setTranscript((prev) => prev + finalText)
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = (event) => {
      // aborted는 의도적 stop() 호출 시 발생 → 무시
      if (event.error === 'aborted') return
      hadErrorRef.current = true
      if (event.error === 'no-speech') {
        setError('음성이 감지되지 않았습니다. 다시 시도해주세요.')
      } else if (event.error === 'not-allowed') {
        setError('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
      } else {
        setError(`음성 인식 오류: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
      // 에러 발생 시 onEnd 호출 안 함 → speechError 효과가 재시도 처리
      if (!hadErrorRef.current) onEnd?.()
      hadErrorRef.current = false
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, onEnd])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [stop])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  }
}

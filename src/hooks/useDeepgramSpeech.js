import { useState, useRef, useCallback } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TOKEN_URL = `${SUPABASE_URL}/functions/v1/deepgram-token`

const MAX_RECORD_MS = 30000 // 최대 30초

// 브라우저별 지원 mimeType 감지
function getSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return null
}

// mimeType → Deepgram encoding 파라미터
function getEncodingParam(mimeType) {
  if (mimeType.includes('opus')) return 'opus'
  if (mimeType.includes('mp4')) return 'aac'
  if (mimeType.includes('ogg')) return 'opus'
  return 'linear16'
}

// API 키 캐시 (세션 동안 재사용)
let cachedApiKey = null

async function fetchApiKey() {
  if (cachedApiKey) return cachedApiKey
  const res = await fetch(TOKEN_URL)
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`)
  const data = await res.json()
  if (!data.key) throw new Error('No API key returned')
  cachedApiKey = data.key
  return data.key
}

/**
 * Deepgram Nova-2 WebSocket 스트리밍 기반 음성 인식 훅
 * useSpeechRecognition과 동일한 인터페이스
 * 브라우저 → Deepgram WebSocket 직접 연결 → 실시간 transcript
 */
export function useDeepgramSpeech({ onResult, onEnd } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)

  const wsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const maxTimerRef = useRef(null)
  const isRecordingRef = useRef(false)
  const hadErrorRef = useRef(false)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  const sessionIdRef = useRef(0)

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const cleanup = useCallback(() => {
    clearTimeout(maxTimerRef.current)
    maxTimerRef.current = null

    // MediaRecorder 정리
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (_) {}
    }
    mediaRecorderRef.current = null

    // WebSocket 정리
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          // Deepgram에 스트림 종료 신호
          wsRef.current.send(JSON.stringify({ type: 'CloseStream' }))
        }
        wsRef.current.close()
      } catch (_) {}
      wsRef.current = null
    }

    // 마이크 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    isRecordingRef.current = false
  }, [])

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다.')
      return
    }

    if (isRecordingRef.current) return

    const mySession = ++sessionIdRef.current

    setError(null)
    setTranscript('')
    setInterimTranscript('')
    hadErrorRef.current = false
    isRecordingRef.current = true

    try {
      // 1. API 키 가져오기
      const apiKey = await fetchApiKey()

      if (sessionIdRef.current !== mySession) return

      // 2. 마이크 스트림
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })

      if (sessionIdRef.current !== mySession) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream

      // 3. MediaRecorder 설정
      const mimeType = getSupportedMimeType() || 'audio/webm'
      let recorder
      try {
        recorder = new MediaRecorder(stream, { mimeType })
      } catch (_) {
        recorder = new MediaRecorder(stream)
      }

      // 4. Deepgram WebSocket 연결
      const wsUrl = new URL('wss://api.deepgram.com/v1/listen')
      wsUrl.searchParams.set('model', 'nova-2')
      wsUrl.searchParams.set('language', 'ko')
      wsUrl.searchParams.set('smart_format', 'true')
      wsUrl.searchParams.set('interim_results', 'true')
      wsUrl.searchParams.set('endpointing', '300')
      wsUrl.searchParams.set('vad_events', 'true')
      wsUrl.searchParams.set('encoding', getEncodingParam(mimeType))

      const ws = new WebSocket(wsUrl.toString(), ['token', apiKey])

      ws.onopen = () => {
        console.log('[Deepgram WS] 연결됨')
        setIsListening(true)
        setInterimTranscript('듣고 있어요...')

        // MediaRecorder → WebSocket으로 오디오 스트리밍
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data)
          }
        }

        mediaRecorderRef.current = recorder
        recorder.start(250) // 250ms마다 chunk 전송
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'Results') {
            const alt = msg.channel?.alternatives?.[0]
            if (!alt) return

            const text = alt.transcript || ''

            if (msg.is_final) {
              // 최종 결과 → transcript에 누적
              if (text) {
                setTranscript(prev => prev + (prev ? ' ' : '') + text)
              }
              setInterimTranscript('듣고 있어요...')
            } else {
              // 중간 결과 → interimTranscript에 표시
              if (text) {
                setInterimTranscript(text)
              }
            }
          }
        } catch (_) {}
      }

      ws.onerror = (e) => {
        console.error('[Deepgram WS] 에러:', e)
        if (!hadErrorRef.current) {
          setError('음성 인식 연결 오류')
          hadErrorRef.current = true
        }
      }

      ws.onclose = (e) => {
        console.log('[Deepgram WS] 종료:', e.code, e.reason)
        // 정상 종료가 아닌 경우에만 에러 처리
        if (e.code !== 1000 && e.code !== 1005 && isRecordingRef.current) {
          if (!hadErrorRef.current) {
            setError('음성 인식 연결이 끊어졌습니다')
            hadErrorRef.current = true
          }
        }
      }

      wsRef.current = ws

      // 5. 최대 녹음 시간 제한
      maxTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current && sessionIdRef.current === mySession) {
          isRecordingRef.current = false
          cleanup()
          setIsListening(false)
          setInterimTranscript('')
          if (!hadErrorRef.current) onEndRef.current?.()
        }
      }, MAX_RECORD_MS)

    } catch (err) {
      console.error('[Deepgram] start 에러:', err)
      if (err.name === 'NotAllowedError') {
        setError('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
      } else {
        setError(`음성 인식 시작 오류: ${err.message}`)
      }
      hadErrorRef.current = true
      isRecordingRef.current = false
      setIsListening(false)
    }
  }, [isSupported, cleanup])

  const stop = useCallback(() => {
    const wasRecording = isRecordingRef.current
    isRecordingRef.current = false

    cleanup()
    setIsListening(false)
    setInterimTranscript('')

    if (wasRecording && !hadErrorRef.current) {
      // WebSocket final 메시지 수신 대기 후 onEnd 호출
      setTimeout(() => onEndRef.current?.(), 300)
    }
  }, [cleanup])

  const reset = useCallback(() => {
    isRecordingRef.current = false
    sessionIdRef.current++
    cleanup()
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    setIsListening(false)
  }, [cleanup])

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

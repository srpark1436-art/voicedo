import { useState, useRef, useCallback } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/deepgram-stt`

// VAD 설정
const SILENCE_THRESHOLD = 0.015   // RMS 이하 = 무음
const SILENCE_DURATION = 1500     // 1.5초 무음 → 전송
const MAX_RECORD_MS = 30000       // 최대 30초
const VAD_INTERVAL = 100          // 100ms마다 체크

/**
 * Deepgram Nova-2 기반 음성 인식 훅
 * useSpeechRecognition과 동일한 인터페이스
 * MediaRecorder + VAD(Voice Activity Detection)으로 녹음 → Edge Function 경유 Deepgram 전송
 */
export function useDeepgramSpeech({ onResult, onEnd } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const vadTimerRef = useRef(null)
  const silenceStartRef = useRef(null)
  const maxTimerRef = useRef(null)
  const chunksRef = useRef([])
  const isRecordingRef = useRef(false)
  const hadErrorRef = useRef(false)
  const onEndRef = useRef(onEnd)
  onEndRef.current = onEnd

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  // 오디오 스트림 & 리소스 정리
  const cleanup = useCallback(() => {
    clearInterval(vadTimerRef.current)
    clearTimeout(maxTimerRef.current)
    vadTimerRef.current = null
    maxTimerRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (_) {}
    }
    mediaRecorderRef.current = null

    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch (_) {}
      audioCtxRef.current = null
    }
    analyserRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    isRecordingRef.current = false
  }, [])

  // 녹음된 오디오를 Edge Function에 전송
  const sendAudio = useCallback(async (chunks) => {
    if (!chunks.length) return

    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' })
    // 너무 작은 오디오 무시 (노이즈만 잡힌 경우)
    if (blob.size < 1000) return

    setInterimTranscript('인식 중...')

    try {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/webm',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: blob,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const text = data.transcript || ''

      if (text) {
        setTranscript(prev => prev + (prev ? ' ' : '') + text)
      }
    } catch (err) {
      console.error('Deepgram STT error:', err)
      // 세그먼트 전송 실패는 콘솔 경고만 (hook-level error 설정 시 App에서 무한 재시도 유발)
      // 마이크 권한 등 치명적 에러만 setError로 전파
    } finally {
      setInterimTranscript('')
    }
  }, [])

  // VAD: 주기적으로 볼륨 체크 → 무음 감지 시 녹음 세그먼트 전송
  const startVAD = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Float32Array(analyser.fftSize)
    silenceStartRef.current = null

    vadTimerRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(dataArray)
      // RMS 계산
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
      const rms = Math.sqrt(sum / dataArray.length)

      if (rms < SILENCE_THRESHOLD) {
        // 무음 시작
        if (!silenceStartRef.current) silenceStartRef.current = Date.now()
        else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION) {
          // 1.5초 무음 → 현재 세그먼트 전송
          silenceStartRef.current = null
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop() // onstop에서 sendAudio + 재시작
          }
        }
      } else {
        // 소리 감지 → 무음 타이머 리셋
        silenceStartRef.current = null
        setInterimTranscript('듣고 있어요...')
      }
    }, VAD_INTERVAL)
  }, [])

  // MediaRecorder 세그먼트 시작
  const startRecording = useCallback((stream) => {
    if (!isRecordingRef.current) return

    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      const chunks = [...chunksRef.current]
      chunksRef.current = []

      if (chunks.length > 0) {
        await sendAudio(chunks)
      }

      // 아직 listening 중이면 다음 세그먼트 시작
      if (isRecordingRef.current && streamRef.current) {
        startRecording(streamRef.current)
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start(250) // 250ms마다 chunk
  }, [sendAudio])

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다.')
      return
    }

    // 이미 녹음 중이면 중복 시작 방지
    if (isRecordingRef.current) return

    setError(null)
    setTranscript('')
    setInterimTranscript('')
    hadErrorRef.current = false
    isRecordingRef.current = true

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream

      // AudioContext + Analyser for VAD
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)

      audioCtxRef.current = audioCtx
      analyserRef.current = analyser

      setIsListening(true)
      setInterimTranscript('듣고 있어요...')

      // 녹음 시작
      startRecording(stream)

      // VAD 시작
      startVAD()

      // 최대 녹음 시간 제한
      maxTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          isRecordingRef.current = false
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          cleanup()
          setIsListening(false)
          setInterimTranscript('')
          if (!hadErrorRef.current) onEndRef.current?.()
        }
      }, MAX_RECORD_MS)
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
      } else {
        setError(`마이크 접근 오류: ${err.message}`)
      }
      isRecordingRef.current = false
      setIsListening(false)
    }
  }, [isSupported, cleanup, startRecording, startVAD])

  const stop = useCallback(() => {
    const wasRecording = isRecordingRef.current
    isRecordingRef.current = false

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // onstop 핸들러가 마지막 세그먼트 전송 후 onEnd 호출하지 않음
      // 여기서 직접 처리
      const recorder = mediaRecorderRef.current
      const originalOnstop = recorder.onstop
      recorder.onstop = async (e) => {
        const chunks = [...chunksRef.current]
        chunksRef.current = []
        if (chunks.length > 0) await sendAudio(chunks)
        cleanup()
        setIsListening(false)
        setInterimTranscript('')
        if (!hadErrorRef.current) onEndRef.current?.()
      }
      recorder.stop()
    } else {
      cleanup()
      setIsListening(false)
      setInterimTranscript('')
      if (wasRecording && !hadErrorRef.current) onEndRef.current?.()
    }
  }, [cleanup, sendAudio])

  const reset = useCallback(() => {
    isRecordingRef.current = false
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

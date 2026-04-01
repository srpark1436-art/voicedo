import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioPlaybackManager } from '../audio/audioPlayback'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TOKEN_URL = `${SUPABASE_URL}/functions/v1/gemini-token`

const GEMINI_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
const MODEL = 'models/gemini-3.1-flash-live-preview'

const SYSTEM_INSTRUCTION = `당신은 한국어 할일 관리 도우미 '제니퍼'입니다.
사용자가 음성으로 말하면, 반드시 process_user_speech 함수를 호출하여 사용자가 말한 원문을 전달하세요.
함수 호출 후에는 "네", "알겠습니다", "저장했습니다" 같은 짧은 확인 응답만 하세요.
절대 사용자의 말을 길게 반복하거나 부연 설명하지 마세요.`

const TOOLS = [{
  function_declarations: [{
    name: 'process_user_speech',
    description: '사용자가 음성으로 말한 내용을 처리합니다. 사용자가 말할 때마다 반드시 이 함수를 호출하세요.',
    parameters: {
      type: 'OBJECT',
      properties: {
        transcript: {
          type: 'STRING',
          description: '사용자가 말한 원문 텍스트 (그대로 받아적기)',
        },
        intent: {
          type: 'STRING',
          description: '감지된 사용자 의도',
          enum: ['add_todo', 'save', 'delete', 'cancel', 'query', 'filter', 'sort', 'complete', 'yes', 'no', 'other'],
        },
      },
      required: ['transcript'],
    },
  }],
}]

// API 키 캐시
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

// ArrayBuffer → base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Gemini Live API Hook
 * useSpeechRecognition + useSpeechSynthesis 통합 대체
 *
 * @param {Object} options
 * @param {Function} options.onEnd - 음성 인식 세션 종료 시 콜백
 */
export function useGeminiLive({ onEnd } = {}) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const wsRef = useRef(null)
  const audioCtxRef = useRef(null)
  const playbackRef = useRef(null)
  const workletNodeRef = useRef(null)
  const streamRef = useRef(null)
  const sessionIdRef = useRef(0)
  const isConnectedRef = useRef(false)
  const isRecordingRef = useRef(false)
  const hadErrorRef = useRef(false)
  const onEndRef = useRef(onEnd)
  const pendingOnEndRef = useRef(null)  // speak() onEnd 콜백
  const setupCompleteResolveRef = useRef(null)
  const isSpeakingModeRef = useRef(false) // speak() 중 transcript 업데이트 차단

  onEndRef.current = onEnd

  const isSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof AudioContext !== 'undefined'

  // ── AudioContext 초기화 (lazy)
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 })
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  // ── AudioPlaybackManager 초기화
  const getPlayback = useCallback(() => {
    if (!playbackRef.current) {
      const ctx = getAudioContext()
      playbackRef.current = new AudioPlaybackManager(ctx, 24000)
      playbackRef.current.onPlaybackEnd = () => {
        isSpeakingModeRef.current = false
        setIsSpeaking(false)
        const cb = pendingOnEndRef.current
        pendingOnEndRef.current = null
        cb?.()
      }
    }
    return playbackRef.current
  }, [getAudioContext])

  // ── WebSocket 연결
  const connect = useCallback(async () => {
    if (isConnectedRef.current && wsRef.current?.readyState === WebSocket.OPEN) return

    const apiKey = await fetchApiKey()
    const url = `${GEMINI_WS_URL}?key=${apiKey}`

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      wsRef.current = ws

      setupCompleteResolveRef.current = resolve

      ws.onopen = () => {
        console.log('[Gemini WS] 연결됨, setup 전송')
        ws.send(JSON.stringify({
          setup: {
            model: MODEL,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: 'Kore' },
                },
              },
            },
            system_instruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }],
            },
            tools: TOOLS,
          },
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          handleServerMessage(msg)
        } catch (e) {
          console.error('[Gemini WS] 메시지 파싱 오류:', e)
        }
      }

      ws.onerror = (e) => {
        console.error('[Gemini WS] 에러:', e)
        if (!hadErrorRef.current) {
          setError('Gemini 연결 오류')
          hadErrorRef.current = true
        }
        reject(e)
      }

      ws.onclose = (e) => {
        console.log('[Gemini WS] 종료:', e.code, e.reason)
        isConnectedRef.current = false
        if (e.code !== 1000 && e.code !== 1005 && isRecordingRef.current) {
          if (!hadErrorRef.current) {
            setError('Gemini 연결이 끊어졌습니다')
            hadErrorRef.current = true
          }
        }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 서버 메시지 핸들러
  const handleServerMessage = useCallback((msg) => {
    // Setup 완료
    if (msg.setupComplete) {
      console.log('[Gemini] setup 완료')
      isConnectedRef.current = true
      setupCompleteResolveRef.current?.()
      setupCompleteResolveRef.current = null
      return
    }

    const serverContent = msg.serverContent
    if (!serverContent) return

    const parts = serverContent.modelTurn?.parts || []
    for (const part of parts) {
      // 오디오 응답
      if (part.inlineData?.data) {
        setIsSpeaking(true)
        getPlayback().enqueue(part.inlineData.data)
      }

      // Function Call (process_user_speech)
      if (part.functionCall) {
        const { name, args } = part.functionCall
        if (name === 'process_user_speech' && args?.transcript) {
          const text = args.transcript
          console.log('[Gemini] transcript:', text, 'intent:', args.intent)
          // speak() 모드 중엔 TTS 텍스트가 transcript에 섞이지 않도록 차단
          if (!isSpeakingModeRef.current) {
            setTranscript(prev => prev + (prev ? ' ' : '') + text)
            setInterimTranscript('')
          }

          // Function call 응답 전송 (Gemini가 대화를 계속할 수 있도록)
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              tool_response: {
                function_responses: [{
                  id: part.functionCall.id || 'process_user_speech',
                  name: 'process_user_speech',
                  response: { result: 'ok' },
                }],
              },
            }))
          }
        }
      }
    }

    // Turn 완료
    if (serverContent.turnComplete) {
      const playback = getPlayback()
      if (playback._queue.length > 0 || playback._sources.length > 0) {
        playback.flush()
        // onPlaybackEnd가 나머지 처리
      } else {
        // 오디오 없이 turn이 완료된 경우
        setIsSpeaking(false)
        const cb = pendingOnEndRef.current
        pendingOnEndRef.current = null
        cb?.()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getPlayback])

  // ── 마이크 시작 (PCM 스트리밍)
  const startMic = useCallback(async () => {
    if (!isSupported) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다.')
      return
    }
    if (isRecordingRef.current) return

    const mySession = ++sessionIdRef.current
    isRecordingRef.current = true

    try {
      const ctx = getAudioContext()

      // AudioWorklet 등록
      try {
        await ctx.audioWorklet.addModule('/pcm-worklet-processor.js')
      } catch (_) {
        // 이미 등록되어 있으면 무시
      }

      if (sessionIdRef.current !== mySession) return

      // 마이크 스트림
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })

      if (sessionIdRef.current !== mySession) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream

      // AudioWorklet 연결: 마이크 → WorkletNode
      const source = ctx.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(ctx, 'pcm-worklet-processor')

      workletNode.port.onmessage = (event) => {
        const { pcmData } = event.data
        if (!pcmData || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

        const base64 = arrayBufferToBase64(pcmData)
        wsRef.current.send(JSON.stringify({
          realtime_input: {
            media_chunks: [{
              data: base64,
              mime_type: 'audio/pcm;rate=16000',
            }],
          },
        }))
      }

      // gain=0 노드로 오디오 그래프 유지 (destination 직접 연결 시 마이크 소리가 스피커로 출력됨)
      const silentGain = ctx.createGain()
      silentGain.gain.value = 0
      source.connect(workletNode)
      workletNode.connect(silentGain)
      silentGain.connect(ctx.destination)
      workletNodeRef.current = workletNode

      setIsListening(true)
      setInterimTranscript('듣고 있어요...')
      console.log('[Gemini] 마이크 스트리밍 시작')

    } catch (err) {
      console.error('[Gemini] 마이크 시작 오류:', err)
      if (err.name === 'NotAllowedError') {
        setError('마이크 권한이 필요합니다. 브라우저 설정에서 허용해주세요.')
      } else {
        setError(`음성 인식 시작 오류: ${err.message}`)
      }
      hadErrorRef.current = true
      isRecordingRef.current = false
      setIsListening(false)
    }
  }, [isSupported, getAudioContext])

  // ── 마이크 중지
  const stopMic = useCallback(() => {
    const wasRecording = isRecordingRef.current
    isRecordingRef.current = false

    // WorkletNode 해제
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect() } catch (_) {}
      workletNodeRef.current = null
    }

    // 마이크 스트림 해제
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    setIsListening(false)
    setInterimTranscript('')

    if (wasRecording && !hadErrorRef.current) {
      setTimeout(() => onEndRef.current?.(), 300)
    }
  }, [])

  // ── WebSocket 해제
  const disconnect = useCallback(() => {
    stopMic()

    if (playbackRef.current) {
      playbackRef.current.stop()
    }

    if (wsRef.current) {
      try { wsRef.current.close() } catch (_) {}
      wsRef.current = null
    }
    isConnectedRef.current = false
  }, [stopMic])

  // ── 공개 API: start (connect + startMic)
  const start = useCallback(async () => {
    setError(null)
    setTranscript('')
    setInterimTranscript('')
    hadErrorRef.current = false

    try {
      await connect()
      await startMic()
    } catch (err) {
      console.error('[Gemini] start 오류:', err)
      setError(`Gemini 시작 오류: ${err.message}`)
      hadErrorRef.current = true
    }
  }, [connect, startMic])

  // ── 공개 API: stop
  const stop = useCallback(() => {
    stopMic()
  }, [stopMic])

  // ── 공개 API: reset
  const reset = useCallback(() => {
    sessionIdRef.current++
    disconnect()
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    setIsListening(false)
    setIsSpeaking(false)
    pendingOnEndRef.current = null
  }, [disconnect])

  // ── 공개 API: speak (TTS)
  const speak = useCallback((text, options = {}) => {
    if (!text) return
    const { onEnd, rate = 1.0 } = options

    // 이전 재생 중지
    const playback = getPlayback()
    playback.stop()
    setIsSpeaking(false)

    // playback rate 설정
    playback.playbackRate = rate

    // onEnd 콜백 저장
    pendingOnEndRef.current = onEnd || null

    // WebSocket이 안 열려있으면 onEnd 즉시 호출
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[Gemini] speak: WebSocket 미연결, onEnd 즉시 호출')
      pendingOnEndRef.current = null
      onEnd?.()
      return
    }

    // TTS 모드 진입 — process_user_speech 함수 호출로 transcript가 오염되지 않도록
    isSpeakingModeRef.current = true

    // Gemini에게 텍스트를 말해달라고 요청
    wsRef.current.send(JSON.stringify({
      client_content: {
        turns: [{
          role: 'user',
          parts: [{ text: `다음을 자연스러운 한국어로 말해주세요: "${text}"` }],
        }],
        turn_complete: true,
      },
    }))

    setIsSpeaking(true)
  }, [getPlayback])

  // ── 공개 API: cancel (재생 중지)
  const cancel = useCallback(() => {
    if (playbackRef.current) {
      playbackRef.current.stop()
    }
    setIsSpeaking(false)
    pendingOnEndRef.current = null
  }, [])

  // ── 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      sessionIdRef.current++
      if (playbackRef.current) playbackRef.current.stop()
      if (workletNodeRef.current) try { workletNodeRef.current.disconnect() } catch (_) {}
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (wsRef.current) try { wsRef.current.close() } catch (_) {}
      if (audioCtxRef.current) try { audioCtxRef.current.close() } catch (_) {}
    }
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    isSpeaking,
    start,
    stop,
    reset,
    speak,
    cancel,
  }
}

import { useCallback, useRef } from 'react'

/**
 * 한국어 TTS 음성 품질 우선순위
 * 디바이스/브라우저별 최고 품질 음성을 선택
 */
const KO_VOICE_PRIORITY = [
  // iOS / macOS - Apple 뉴럴 음성 (가장 자연스러움)
  'Yuna',
  '수진',
  'Sora',
  // Android Chrome - Google 뉴럴 음성
  'Google 한국의',
  'Google Korean',
  // Windows - Microsoft 뉴럴 음성
  'Microsoft SunHi Online',
  'Microsoft SunHi',
  'Microsoft Heami Online',
  'Microsoft Heami',
  // 일반 폴백
  'ko-KR',
]

let cachedVoice = null
let audioUnlocked = false

/**
 * 모바일 브라우저에서 TTS 오디오 잠금 해제
 * 첫 번째 사용자 제스처(터치/클릭) 시 호출하면
 * 이후 프로그래밍 방식 speak() 호출도 소리가 남
 */
export function unlockTtsAudio() {
  if (audioUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return
  audioUnlocked = true
  // 빈 utterance를 speak → 브라우저가 오디오 출력 허용 상태로 전환
  const utter = new SpeechSynthesisUtterance('')
  utter.volume = 0
  utter.lang = 'ko-KR'
  window.speechSynthesis.speak(utter)
  // AudioContext도 함께 unlock (일부 브라우저 대응)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    ctx.resume()
  } catch (_) {}
}

function getBestKoreanVoice() {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  for (const name of KO_VOICE_PRIORITY) {
    const found = voices.find((v) =>
      v.name.includes(name) || (name === 'ko-KR' && v.lang.startsWith('ko'))
    )
    if (found) {
      cachedVoice = found
      return found
    }
  }
  return null
}

/**
 * Web Speech API SpeechSynthesis 래퍼
 * - 디바이스별 최고 품질 한국어 음성 자동 선택
 * - 음성 목록 비동기 로딩 대응
 */
export function useSpeechSynthesis() {
  const queueRef = useRef([]) // 음성 목록 로드 전 대기 큐

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const _speak = useCallback((text, options = {}) => {
    if (!isSupported || !text) return
    const { rate = 1.0, pitch = 1.0, volume = 1.0, onEnd } = options

    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'ko-KR'
      utter.rate = rate
      utter.pitch = pitch
      utter.volume = volume

      if (onEnd) {
        let called = false
        const fireOnce = () => { if (!called) { called = true; onEnd() } }
        utter.onend = fireOnce
        utter.onerror = fireOnce // TTS 실패 시에도 onEnd 보장
      }

      const voice = getBestKoreanVoice()
      if (voice) utter.voice = voice

      window.speechSynthesis.speak(utter)
    }

    // Chrome: cancel() 직후 speak() 무시 버그 방지
    // 재생 중일 때만 cancel → 50ms 대기, 아니면 즉시 speak
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
      setTimeout(doSpeak, 80)
    } else {
      doSpeak()
    }
  }, [isSupported])

  const speak = useCallback((text, options = {}) => {
    if (!isSupported || !text) return

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      // 음성 목록 이미 로드됨
      _speak(text, options)
    } else {
      // 아직 로드 안 됨 → 이벤트 대기
      const onVoicesChanged = () => {
        cachedVoice = null // 캐시 초기화 후 재선택
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
        _speak(text, options)
      }
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged)
      // 안전망: 1초 후에도 이벤트 없으면 그냥 실행
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
        _speak(text, options)
      }, 1000)
    }
  }, [_speak, isSupported])

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { speak, cancel, isSupported }
}

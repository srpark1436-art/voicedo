/**
 * Gemini Live API 오디오 응답 재생 매니저
 * base64 PCM 청크를 큐에 쌓고 순차적으로 재생
 */
export class AudioPlaybackManager {
  constructor(audioContext, sampleRate = 24000) {
    this.ctx = audioContext
    this.sampleRate = sampleRate
    this._queue = []           // AudioBuffer 큐
    this._isPlaying = false
    this._nextPlayTime = 0
    this._sources = []         // 현재 재생 중인 BufferSourceNode 목록
    this._onPlaybackEnd = null // 재생 완료 콜백
    this._pendingFlush = false
    this._playbackRate = 1.0
  }

  get isPlaying() { return this._isPlaying }

  set onPlaybackEnd(fn) { this._onPlaybackEnd = fn }

  set playbackRate(rate) { this._playbackRate = rate }

  /**
   * base64 인코딩된 PCM 청크를 큐에 추가
   * @param {string} base64Chunk - base64 인코딩된 PCM 16-bit 데이터
   */
  enqueue(base64Chunk) {
    const audioBuffer = this._decodeBase64Pcm(base64Chunk)
    if (!audioBuffer) return
    this._queue.push(audioBuffer)

    // 이미 flush 모드면 바로 스케줄링
    if (this._pendingFlush) {
      this._scheduleNext()
    }
  }

  /**
   * 큐의 모든 버퍼를 연속 재생 시작
   */
  flush() {
    this._pendingFlush = true
    if (!this._isPlaying) {
      this._nextPlayTime = this.ctx.currentTime
      this._isPlaying = true
    }
    this._scheduleNext()
  }

  /**
   * 모든 재생 중지 및 큐 클리어
   */
  stop() {
    this._pendingFlush = false
    this._isPlaying = false
    this._queue = []
    for (const src of this._sources) {
      try { src.stop() } catch (_) {}
    }
    this._sources = []
    this._nextPlayTime = 0
  }

  _scheduleNext() {
    while (this._queue.length > 0) {
      const buffer = this._queue.shift()
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = this._playbackRate
      source.connect(this.ctx.destination)

      const startTime = Math.max(this._nextPlayTime, this.ctx.currentTime)
      source.start(startTime)

      const duration = buffer.duration / this._playbackRate
      this._nextPlayTime = startTime + duration

      this._sources.push(source)
      source.onended = () => {
        this._sources = this._sources.filter(s => s !== source)
        // 큐도 비었고 재생 중인 소스도 없으면 → 재생 완료
        if (this._sources.length === 0 && this._queue.length === 0) {
          this._isPlaying = false
          this._pendingFlush = false
          this._onPlaybackEnd?.()
        }
      }
    }
  }

  /**
   * base64 PCM → AudioBuffer 변환
   * Gemini 출력: PCM 16-bit signed little-endian
   */
  _decodeBase64Pcm(base64) {
    try {
      const binaryStr = atob(base64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }

      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768
      }

      const audioBuffer = this.ctx.createBuffer(1, float32.length, this.sampleRate)
      audioBuffer.getChannelData(0).set(float32)
      return audioBuffer
    } catch (e) {
      console.error('[AudioPlayback] PCM 디코딩 오류:', e)
      return null
    }
  }
}

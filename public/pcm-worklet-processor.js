/**
 * AudioWorklet Processor: 마이크 입력 → PCM 16-bit 16kHz 변환
 * Gemini Live API가 요구하는 audio/pcm 포맷으로 실시간 변환
 */
class PcmWorkletProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channelData = input[0] // mono channel
    const ratio = sampleRate / 16000 // e.g., 24000/16000 = 1.5

    // nearest-neighbor 다운샘플링: 출력 인덱스 i → 입력 인덱스 floor(i * ratio)
    const outputLen = Math.floor(channelData.length / ratio)
    const int16Array = new Int16Array(outputLen)

    for (let i = 0; i < outputLen; i++) {
      const srcIndex = Math.floor(i * ratio)
      const sample = channelData[srcIndex]
      int16Array[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
    }

    this.port.postMessage({ pcmData: int16Array.buffer }, [int16Array.buffer])
    return true
  }
}

registerProcessor('pcm-worklet-processor', PcmWorkletProcessor)

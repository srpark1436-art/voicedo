import { supabase } from './supabase'

/**
 * 음성 인식 텍스트를 간결한 명사형 할일 문장으로 AI 정제 (Supabase Edge Function 경유)
 * 실패 시 원문 그대로 반환
 */
// AI 정제가 필요 없는 텍스트 판별
function needsCleaning(text) {
  if (text.length <= 20) return false // 짧은 텍스트는 그대로
  // 복잡한 음성 구문 패턴이 없으면 스킵
  const complexPatterns = /할\s*수\s*있도록|할\s*수\s*있게|하기\s*위해|있으므로|한\s*거|것으로|해야\s*해|해야겠어|저장해\s*줘|추가해\s*줘|확인해\s*줘|수정해\s*줘/
  return complexPatterns.test(text)
}

export async function cleanTodoContent(rawText) {
  if (!rawText) return rawText
  if (import.meta.env.DEV) return rawText // 개발 환경에서는 AI 정제 스킵
  if (!needsCleaning(rawText)) return rawText // API 호출 없이 반환

  try {
    const { data, error } = await supabase.functions.invoke('clean-todo', {
      body: { text: rawText },
    })
    if (error) {
      console.error('[clean-todo] error:', error)
      return rawText
    }
    console.log('[clean-todo] result:', data?.result)
    return data?.result || rawText
  } catch (e) {
    console.error('[clean-todo] exception:', e)
    return rawText
  }
}

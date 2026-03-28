import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let text = ''
  try {
    const body = await req.json()
    text = body.text || ''
  } catch {
    return new Response(JSON.stringify({ result: '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!text) {
    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // AI 전송 전 regex 전처리 — 자주 나오는 패턴 먼저 제거
  let preText = text
  preText = preText.replace(/\s*할\s*수\s*있도록.*/g, '')
  preText = preText.replace(/\s*할\s*수\s*있게.*/g, '')
  preText = preText.replace(/\s*하기\s*위해.*/g, '')
  preText = preText.replace(/\s*있으므로.*/g, '')
  preText = preText.replace(/다음\s*주\s*\S*?까지\s*/g, '')
  preText = preText.replace(/이번\s*주\s*\S*?까지\s*/g, '')
  preText = preText.replace(/(오늘|내일|모레)\s*까지\s*/g, '')
  preText = preText.replace(/\s*(한\s*거|것으로|해야\s*해)\s*/g, ' ')
  preText = preText.replace(/\s*(저장해\s*줘?|추가해\s*줘?|확인해\s*줘?|수정해\s*줘?|해\s*줘)\s*$/, '')
  preText = preText.replace(/\s{2,}/g, ' ').trim()
  console.log('[clean-todo] preText:', preText)

  // 전처리 후 20자 이하면 AI 호출 불필요
  if (preText.length <= 20) {
    return new Response(JSON.stringify({ result: preText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: `한국어 음성 텍스트를 짧은 할일 제목으로 변환합니다.
규칙: 핵심 동작+목적어만 명사형으로, 반드시 10자 이내, 결과만 출력.
제거: 저장해줘/추가해줘/확인해줘/해줘, ~할 수 있도록/~할 수 있게, ~한 거/~것으로/~해야 해, 날짜/기간 표현.

입력: 파스텔 티저 리포트 작성 완료할 수 있도록 해 줘
출력: 파스텔 티저 리포트 완성

입력: 주간 업무 일지 작성한 거 확인할 수 있도록 해 줘
출력: 주간 업무일지 확인

입력: 보고서 작성할 것으로 저장해줘
출력: 보고서 작성

입력: 회의 자료 준비할 수 있도록 추가해줘
출력: 회의 자료 준비

입력: 삼성생명 강의 자료 작성한 거 확인해줘
출력: 삼성생명 강의자료 확인`,
        messages: [
          {
            role: 'user',
            content: `입력: ${preText}`,
          },
          {
            role: 'assistant',
            content: '출력:',
          },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('[clean-todo] API error:', res.status, errBody)
      return new Response(JSON.stringify({ result: text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    const raw = data.content?.[0]?.text?.trim() || ''
    console.log('[clean-todo] raw AI output:', JSON.stringify(raw))
    const result = raw.replace(/^출력:\s*/i, '').trim() || text

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

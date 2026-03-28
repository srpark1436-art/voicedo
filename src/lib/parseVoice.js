import { addDays, format } from 'date-fns'

/**
 * 텍스트에서 우선순위 키워드 감지
 * @returns 'high' | 'low' | 'medium' | null (감지 안됨)
 */
export function parsePriority(text) {
  if (/높음|높게|높은\s*우선|높여|최우선|긴급|급해|시급|1순위/.test(text)) return 'high'
  if (/낮음|낮게|낮은\s*우선|낮춰|여유|나중에|3순위/.test(text)) return 'low'
  if (/보통|중간\s*우선|일반|2순위/.test(text)) return 'medium'
  return null
}

/**
 * 텍스트에서 날짜/마감일 키워드 감지
 * @returns 'yyyy-MM-dd' 형식 문자열 | null (감지 안됨)
 */
export function parseDeadline(text) {
  const today = new Date()
  const dayMap = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 }

  if (/오늘/.test(text)) return format(today, 'yyyy-MM-dd')
  if (/내일/.test(text)) return format(addDays(today, 1), 'yyyy-MM-dd')
  if (/모레/.test(text)) return format(addDays(today, 2), 'yyyy-MM-dd')

  // N일 후/뒤
  const daysLaterMatch = text.match(/(\d+)\s*일\s*(후|뒤)/)
  if (daysLaterMatch) return format(addDays(today, parseInt(daysLaterMatch[1])), 'yyyy-MM-dd')

  // 다음 주 [요일] → 다음 주 해당 요일 (구체적 요일 우선)
  const nextWeekDayMatch = text.match(/다음\s*주\s*(월|화|수|목|금|토|일)/)
  if (nextWeekDayMatch) {
    const target = dayMap[nextWeekDayMatch[1]]
    const curr = today.getDay()
    let diff = (target - curr + 7) % 7
    if (diff === 0) diff = 7
    return format(addDays(today, diff + 7), 'yyyy-MM-dd')
  }

  // 이번 주 [요일] → 이번 주 해당 요일
  const thisWeekDayMatch = text.match(/이번\s*주\s*(월|화|수|목|금|토|일)/)
  if (thisWeekDayMatch) {
    const target = dayMap[thisWeekDayMatch[1]]
    const curr = today.getDay()
    let diff = (target - curr + 7) % 7
    if (diff === 0) diff = 7
    return format(addDays(today, diff), 'yyyy-MM-dd')
  }

  // 이번 주 → 이번 주 금요일
  if (/이번\s*주/.test(text)) {
    const dow = today.getDay()
    const toFri = ((5 - dow + 7) % 7) || 7
    return format(addDays(today, toFri), 'yyyy-MM-dd')
  }

  // 다음 주 → 다음 주 금요일
  if (/다음\s*주/.test(text)) {
    const dow = today.getDay()
    const toFri = ((5 - dow + 7) % 7) || 7
    return format(addDays(today, toFri + 7), 'yyyy-MM-dd')
  }

  // 요일 단독 (월~일)
  const dayMatch = text.match(/(월|화|수|목|금|토|일)요일/)
  if (dayMatch) {
    const target = dayMap[dayMatch[1]]
    const curr = today.getDay()
    let diff = target - curr
    if (diff <= 0) diff += 7
    return format(addDays(today, diff), 'yyyy-MM-dd')
  }

  // M월 D일
  const mdMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (mdMatch) {
    const m = parseInt(mdMatch[1])
    const d = parseInt(mdMatch[2])
    const yr = today.getFullYear()
    const candidate = new Date(yr, m - 1, d)
    if (candidate < today) candidate.setFullYear(yr + 1)
    return format(candidate, 'yyyy-MM-dd')
  }

  // N일까지 (월 없이) → 이번 달 또는 다음 달 N일
  const dayOnlyMatch = text.match(/(\d{1,2})\s*일\s*까지/)
  if (dayOnlyMatch) {
    const d = parseInt(dayOnlyMatch[1])
    const yr = today.getFullYear()
    const m = today.getMonth()
    let candidate = new Date(yr, m, d)
    if (candidate <= today) candidate = new Date(yr, m + 1, d)
    return format(candidate, 'yyyy-MM-dd')
  }

  return null
}

/** 감지된 항목의 레이블 */
export const PRIORITY_LABELS = { high: '높음', medium: '보통', low: '낮음' }

/**
 * 음성 텍스트에서 우선순위·마감일 명령어 구문을 제거하고 깨끗한 할일 내용만 반환
 */
export function stripCommandPhrases(text) {
  let t = text

  // 우선순위 명령어 제거 ("해서" / "해줘" 모두 처리)
  t = t.replace(/\s*(높음|높은\s*우선\s*순위?|높게|높여|긴급|급해|시급|최우선|1순위)(\s*으로)?(\s*(변경|수정|바꿔|설정)(\s*해\s*[줘서]?)?)?/g, '')
  t = t.replace(/\s*(낮음|낮은\s*우선\s*순위?|낮게|낮춰|여유|나중에|3순위)(\s*으로)?(\s*(변경|수정|바꿔|설정)(\s*해\s*[줘서]?)?)?/g, '')
  t = t.replace(/\s*(보통|중간\s*우선\s*순위?|일반|2순위)(\s*으로)?(\s*(변경|수정|바꿔|설정)(\s*해\s*[줘서]?)?)?/g, '')
  t = t.replace(/\s*우선\s*순위\s*(를|을|은|는|이|가)?\s*(높음|낮음|보통|높게|낮게|중간)?\s*(으로)?\s*(변경|수정|바꿔|설정)?\s*(해\s*[줘서]?)?\s*/g, ' ')
  // 잔여 변경/수정/설정 동사 제거
  t = t.replace(/\s*(변경|수정|바꿔|설정)\s*해\s*[줘서]?\s*/g, '')

  // 마감일 표현 제거 — 조사(에/에는/까지/에서) 포함 또는 단독 모두 처리
  // 오늘/내일/모레
  t = t.replace(/\s*(오늘|내일|모레)(\s*(에는?|까지|에서))?(\s*(마감|변경|수정|바꿔|설정)(\s*해\s*줘?)?)?/g, '')
  // 다음 주 / 이번 주 + 요일 (조사 또는 단독)
  t = t.replace(/\s*(다음|이번)\s*주\s*(월|화|수|목|금|토|일)요일?(\s*(에는?|까지|에서))?\s*/g, '')
  // 다음 주 / 이번 주 단독 (요일 없이)
  t = t.replace(/\s*(다음|이번)\s*주(\s*(에는?|까지|에서))?(\s*(마감|변경|수정|바꿔|설정)(\s*해\s*줘?)?)?/g, '')
  // 요일 단독 (조사 또는 단독)
  t = t.replace(/\s*(월|화|수|목|금|토|일)요일?(\s*(에는?|까지|에서))?\s*/g, '')
  // M월 D일 (조사 또는 단독)
  t = t.replace(/\s*\d{1,2}월\s*\d{1,2}일(\s*(에는?|까지|에서))?(\s*(마감|변경|수정|바꿔|설정)(\s*해\s*줘?)?)?/g, '')
  // N일까지 / N일 후/뒤
  t = t.replace(/\s*\d{1,2}\s*일\s*(까지|후|뒤)/g, '')
  t = t.replace(/\s*\d+\s*일\s*(후|뒤)/g, '')
  t = t.replace(/\s*(마감일|날짜|마감)\s*(을|를|은|는|이|가)?\s*(오늘|내일|모레|이번\s*주|다음\s*주|\d{1,2}월\s*\d{1,2}일)?\s*(로|으로)?\s*(변경|설정|바꿔|수정)?\s*(해\s*줘?)?/g, '')

  // 저장 명령어 제거 (stripSaveCommand와 동일)
  t = t.replace(/\s*(저장해\s*줘?|저장하기|저장|확인|수정해\s*줘?|수정하기)\s*$/, '')

  // 목적절·어미 제거 — AI 전달 전 최대한 정리
  t = t.replace(/\s*할\s*수\s*있도록.*/g, '')
  t = t.replace(/\s*할\s*수\s*있게.*/g, '')
  t = t.replace(/\s*하기\s*위해.*/g, '')
  t = t.replace(/\s*있으므로.*/g, '')
  t = t.replace(/\s*해야\s*해\b.*/g, '')
  t = t.replace(/\s*해야겠어\b.*/g, '')
  t = t.replace(/\s*것으로\b.*/g, '')
  t = t.replace(/\s*([가-힣]+한)\s*거\b/g, '')
  // 연속 공백 정리
  return t.replace(/\s{2,}/g, ' ').trim()
}

/**
 * 최종 transcript에서 음성 명령어 감지 (문장 끝 기준)
 * @returns 'save' | 'delete' | 'cancel' | 'reset' | null
 */
export function detectVoiceCommand(text) {
  const t = text.trim()
  if (/저장해\s*줘?$|저장하기$|저장$|확인$|수정해\s*줘?$|수정하기$|수정$/.test(t)) return 'save'
  if (/삭제해\s*줘?$|지워\s*줘?$|삭제하기$|삭제$/.test(t)) return 'delete'
  if (/취소$|닫기$|그만$/.test(t)) return 'cancel'
  if (/다시$|초기화(\s*시켜\s*줘?|\s*해\s*줘?)?$|리셋$/.test(t)) return 'reset'
  return null
}

/**
 * 저장/수정 명령어 키워드를 텍스트 끝에서 제거
 */
export function stripSaveCommand(text) {
  return text.replace(/\s*(저장해\s*줘?|저장하기|저장|확인|수정해\s*줘?|수정하기|수정)\s*$/, '').trim()
}

/**
 * 음성에서 할일 조회 의도 감지
 * @returns { type, ... } | null
 * types: 'today'|'tomorrow'|'week'|'nextweek'|'month'|
 *        'specific_date'|'until_date'|'week_of_month'|'keyword'
 */
export function detectQueryIntent(text) {
  const t = text.trim()
  const isQuery = /알려\s*줘?|보여\s*줘?|읽어\s*줘?|뭐가\s*있|있어\??|알고\s*싶|뭐야|뭐예요|있나요|있어요|해야\s*할|검색해?\s*줘?|찾아\s*줘?/.test(t)
  if (!isQuery) return null

  const today = new Date()
  const yr = today.getFullYear()

  // 고정 범위
  if (/이번\s*주/.test(t)) return { type: 'week' }
  if (/다음\s*주/.test(t)) return { type: 'nextweek' }
  if (/이번\s*달|이번\s*월/.test(t)) return { type: 'month', year: yr, month: today.getMonth() + 1 }
  if (/다음\s*달|다음\s*월/.test(t)) {
    const nm = today.getMonth() + 2
    return { type: 'month', year: nm > 12 ? yr + 1 : yr, month: nm > 12 ? 1 : nm }
  }
  if (/오늘/.test(t)) return { type: 'today' }
  if (/내일/.test(t)) return { type: 'tomorrow' }

  // "M월 N일까지" → until_date
  const mdUntilMatch = t.match(/(\d{1,2})월\s*(\d{1,2})일\s*까지/)
  if (mdUntilMatch) {
    const candidate = new Date(yr, parseInt(mdUntilMatch[1]) - 1, parseInt(mdUntilMatch[2]))
    if (candidate < today) candidate.setFullYear(yr + 1)
    return { type: 'until_date', date: format(candidate, 'yyyy-MM-dd') }
  }

  // "N일까지" (월 없이) → until_date (이번 달 or 다음 달)
  const dOnlyUntilMatch = t.match(/(\d{1,2})\s*일\s*까지/)
  if (dOnlyUntilMatch) {
    const d = parseInt(dOnlyUntilMatch[1])
    let candidate = new Date(yr, today.getMonth(), d)
    if (candidate < today) candidate = new Date(yr, today.getMonth() + 1, d)
    return { type: 'until_date', date: format(candidate, 'yyyy-MM-dd') }
  }

  // "M월 첫째/둘째/셋째/넷째주"
  const weekOfMonthMatch = t.match(/(\d{1,2})월\s*(첫째|둘째|셋째|넷째)\s*주/)
  if (weekOfMonthMatch) {
    const m = parseInt(weekOfMonthMatch[1])
    const weekNum = { 첫째: 1, 둘째: 2, 셋째: 3, 넷째: 4 }[weekOfMonthMatch[2]]
    return { type: 'week_of_month', year: yr, month: m, weekNum }
  }

  // "M월 N일" (에/에는) → specific_date
  const mdMatch = t.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (mdMatch) {
    const candidate = new Date(yr, parseInt(mdMatch[1]) - 1, parseInt(mdMatch[2]))
    if (candidate < today) candidate.setFullYear(yr + 1)
    return { type: 'specific_date', date: format(candidate, 'yyyy-MM-dd') }
  }

  // "M월에" / "M월 할일" → month
  const monthMatch = t.match(/(\d{1,2})월/)
  if (monthMatch) {
    return { type: 'month', year: yr, month: parseInt(monthMatch[1]) }
  }

  // "XX 관련 할일 알려줘", "XX 할일 알려줘"
  const kwMatch = t.match(/^(.+?)\s*(관련|에\s*관한|관한)?\s*할\s*일/)
  if (kwMatch?.[1]) {
    const kw = kwMatch[1].replace(/\s*(모든?|전체|다|모두)\s*$/, '').trim()
    if (kw && !/^\d+$/.test(kw)) return { type: 'keyword', keyword: kw }
  }

  return null
}

/**
 * 긍정/부정 응답 감지
 * @returns 'yes' | 'no' | null
 */
export function detectYesNo(text) {
  const t = text.trim()
  // 'no' 먼저 검사 — "아니 됐어", "아니요 괜찮아요" 등 부정+긍정 혼합 시 부정 우선
  if (/아니[요오]?|괜찮[아으]|됐[어고]|안\s*들을게|닫아|취소|그만|싫[어다]|없[어다어요]|끝|종료|나가|닫[아어]|필요\s*없|안\s*[할볼]|볼\s*거\s*없|됐다|이제\s*됐|다\s*봤|안\s*봐도|넘어가|패스|다\s*됐/.test(t)) return 'no'
  if (/네|예|응|맞아|그래[요]?|좋아[요]?|읽어\s*줘?|들을게|들려\s*줘?|알려\s*줘?|부탁|해\s*줘|당연|물론|보여\s*줘?|말해\s*줘?|어/.test(t)) return 'yes'
  return null
}

/**
 * 하단 FAB 마이크 커맨드 모드: 네비게이션 음성 명령 감지
 * @returns { cmd: 'filter'|'search'|'add'|'cancel', value?, keyword? } | null
 */
export function detectNavCommand(text) {
  const t = text.trim()

  // 취소
  if (/취소$|그만$|닫기$/.test(t)) return { cmd: 'cancel' }

  // 할일 추가 ("할 일을 추가할게", "추가할게", "등록할게" 등 자연어 포함)
  if (/할\s*일\s*(을|를)?\s*(입력|추가|등록|만들|넣)|새\s*할\s*일|입력해\s*줘?$|추가해?\s*줘?$|등록해?\s*줘?$|추가할게|등록할게/.test(t)) return { cmd: 'add' }

  // 특정 할일 삭제: "XXX 삭제해줘", "XXX 지워줘"
  const deleteTodoMatch = t.match(/^(.+?)\s*(할\s*일\s*)?(을|를)?\s*(삭제해?\s*줘?|지워\s*줘?|삭제\s*해\s*줘?)$/)
  if (deleteTodoMatch) return { cmd: 'delete_todo', keyword: deleteTodoMatch[1].trim() }

  // 특정 할일 완료: "XXX 완료로 처리해줘", "XXX 완료해줘"
  const completeTodoMatch = t.match(/^(.+?)\s*(할\s*일\s*)?(을|를)?\s*(완료로?\s*처리해?\s*줘?|완료\s*처리해?\s*줘?|완료로?\s*변경해?\s*줘?|완료로?\s*해\s*줘?|완료\s*해\s*줘?)$/)
  if (completeTodoMatch) return { cmd: 'complete_todo', keyword: completeTodoMatch[1].trim() }

  // 검색: "XXX 검색해줘" → keyword 추출
  const searchMatch = t.match(/^(.+?)\s*(검색해?\s*줘?|찾아\s*줘?)$/)
  if (searchMatch) return { cmd: 'search', keyword: searchMatch[1].trim() }
  if (/검색|찾아/.test(t)) return { cmd: 'search', keyword: '' }

  // 정렬
  if (/우선\s*순위\s*(높은\s*순|순으로|순|높은|기준)/.test(t)) return { cmd: 'sort', value: 'priority' }
  if (/(최근|최신|새로운)\s*(등록)?\s*(순으로|순|기준)/.test(t)) return { cmd: 'sort', value: 'newest' }
  if (/(과거|오래된|오래|오래전)\s*(등록)?\s*(순으로|순|기준)/.test(t)) return { cmd: 'sort', value: 'oldest' }
  if (/(마감|데드라인)\s*(빠른|가까운|임박한)?\s*(순으로|순|기준)/.test(t)) return { cmd: 'sort', value: 'deadline' }

  // 필터
  if (/오늘/.test(t)) return { cmd: 'filter', value: 'today' }
  if (/완료/.test(t)) return { cmd: 'filter', value: 'completed' }
  if (/전체/.test(t)) return { cmd: 'filter', value: 'all' }

  return null
}

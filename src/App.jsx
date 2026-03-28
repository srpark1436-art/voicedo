import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useTodoStore } from './store/todoStore'
import { supabase } from './lib/supabase'
import VoiceButton from './components/VoiceButton'
import TodoList from './components/TodoList'
import DeadlinePicker from './components/DeadlinePicker'
import NotificationSetup from './components/NotificationSetup'
import CalendarView from './components/CalendarView'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useSpeechSynthesis, unlockTtsAudio } from './hooks/useSpeechSynthesis'
import { useWakeWord } from './hooks/useWakeWord'
import { parsePriority, parseDeadline, PRIORITY_LABELS, detectVoiceCommand, stripSaveCommand, detectNavCommand, stripCommandPhrases, detectQueryIntent, detectYesNo } from './lib/parseVoice'
import { cleanTodoContent } from './lib/cleanContent'

export default function App() {
  const {
    setUsername, setUserId, fetchTodos, clearUser,
    addTodo, updateTodo, deleteTodo, toggleComplete,
    setVoiceEditTodoId,
  } = useTodoStore()

  const [session, setSession] = useState(undefined) // undefined=로딩, null=비로그인, object=로그인

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showVoiceModal, setShowVoiceModal] = useState(false)
  const [editingTodoId, setEditingTodoId] = useState(null)
  const [isCommandMode, setIsCommandMode] = useState(false)
  const [cmdFeedback, setCmdFeedback] = useState(null) // { text, type: 'listening'|'done'|'error' }
  const [externalSearch, setExternalSearch] = useState(undefined)
  const [deadline, setDeadline] = useState(null)
  const [priority, setPriority] = useState('medium')
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [manualText, setManualText] = useState('')

  const [toast, setToast] = useState(null) // { text } — 하단 토스트 메시지
  const toastTimerRef = useRef(null)

  const showToastMsg = useCallback((text) => {
    clearTimeout(toastTimerRef.current)
    setToast({ text })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  const [sortBy, setSortBy] = useState('newest')

  const [queryResult, setQueryResult] = useState(null) // { todos, message } — 조회 결과 확인 대기
  const [awaitingContinue, setAwaitingContinue] = useState(false) // 계속 여부 확인 대기
  const [inputMode, setInputMode] = useState('voice') // 'voice' | 'text'
  const [editableTranscript, setEditableTranscript] = useState('')
  const [isManuallyEditing, setIsManuallyEditing] = useState(false)
  const [voiceDetected, setVoiceDetected] = useState({ priority: false, deadline: false })
  const [voiceCmdFeedback, setVoiceCmdFeedback] = useState(null)

  // ── Google 로그인 후 사용자 정보 설정 + 할일 로드
  const handleAuthUser = useCallback(async (user) => {
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
    setUserId(user.id)
    setUsername(displayName)
    await supabase.from('users').upsert({ id: user.id, username: displayName }, { onConflict: 'id' })
    fetchTodos()
  }, [setUserId, setUsername, fetchTodos])

  const modalStateRef = useRef({})
  modalStateRef.current = { editingTodoId, editableTranscript, deadline, priority, isManuallyEditing }

  const { speak, cancel: cancelSpeech } = useSpeechSynthesis()

  // 인식 세션 자연 종료 시 커맨드 모드 재시작 관리
  const intentionalStopRef = useRef(false)   // 의도적 stopListening 표시
  const cmdStateRef = useRef({})             // 커맨드 모드 현재 상태 (렌더 시마다 갱신)
  const startListeningRef = useRef(null)     // handleVoiceEnd에서 startListening 접근용

  const handleVoiceEnd = useCallback(() => {
    // 의도적 정지(명령 처리 후 stopListening)이면 재시작 안 함
    if (intentionalStopRef.current) { intentionalStopRef.current = false; return }
    const { isCommandMode: cmd } = cmdStateRef.current
    // 커맨드 모드에서 인식 세션이 자연 종료된 경우 → 조용히 재시작
    // (startListening 내부에서 transcript 초기화됨, resetSpeech 호출 금지 — stop()→onend 연쇄 방지)
    if (cmd) {
      setTimeout(() => startListeningRef.current?.(), 500)
    }
  }, [])

  const {
    isSupported: speechSupported, isListening, transcript, interimTranscript,
    error: speechError, start: startListening, stop: stopListening, reset: resetSpeech,
  } = useSpeechRecognition({ onEnd: handleVoiceEnd })

  // refs 최신 상태 동기화 (handleVoiceEnd 클로저에서 사용)
  cmdStateRef.current = { isCommandMode, awaitingContinue, queryResult }
  startListeningRef.current = startListening

  // ── 세션 확인 + 자동 로그인
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null)
      if (session?.user) handleAuthUser(session.user)
      else clearUser()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
      if (session?.user) handleAuthUser(session.user)
      else clearUser()
    })
    return () => subscription.unsubscribe()
  }, [handleAuthUser, clearUser])

  // ── 첫 사용자 제스처에서 TTS 오디오 잠금 해제 (웨이크워드 경로 대응)
  useEffect(() => {
    const unlock = () => {
      unlockTtsAudio()
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
    }
    document.addEventListener('touchstart', unlock, { once: true })
    document.addEventListener('click', unlock, { once: true })
    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
    }
  }, [])

  // ── voice → editableTranscript 동기화
  useEffect(() => {
    if (isManuallyEditing) return
    setEditableTranscript(transcript + interimTranscript)
  }, [transcript, interimTranscript, isManuallyEditing])

  // ── 우선순위 · 마감일 자동 감지 + 명령어 구문 제거
  useEffect(() => {
    const fullText = transcript + interimTranscript
    if (!fullText || !isListening || isManuallyEditing) return
    const dp = parsePriority(fullText)
    const dd = parseDeadline(fullText)
    if (dp || dd) {
      if (dp) { setPriority(dp); setVoiceDetected((v) => ({ ...v, priority: true })) }
      if (dd) { setDeadline(dd); setVoiceDetected((v) => ({ ...v, deadline: true })) }
      // 기존 입력 내용에서 명령어 구문만 제거 (내용 보존)
      setEditableTranscript((prev) => stripCommandPhrases(prev))
    }
  }, [transcript, interimTranscript, isListening, isManuallyEditing])

  // ── 모달 열릴 때 자동 음성 시작 (편집 모드 제외)
  useEffect(() => {
    if (!showVoiceModal || editingTodoId) return
    const timer = setTimeout(() => startListening(), 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVoiceModal])

  // ── 음성 인식 실패 시 재시도 안내 (음성 모달 + 커맨드 모드 공통)
  useEffect(() => {
    if (!speechError || speechError.includes('권한')) return
    let didRetry = false
    const tryRetry = () => {
      if (didRetry) return; didRetry = true
      startListening() // start() 내부에서 transcript 초기화됨
    }
    if (showVoiceModal && inputMode === 'voice' && !isManuallyEditing) {
      setEditableTranscript('')
      setIsManuallyEditing(false)
      speak('다시 한번 말씀해 주시겠어요?', { rate: 1.1, onEnd: () => setTimeout(tryRetry, 300) })
      setTimeout(tryRetry, 2500)
    } else if (isCommandMode) {
      speak('다시 한번 말씀해 주시겠어요?', { rate: 1.1, onEnd: () => setTimeout(tryRetry, 300) })
      setCmdFeedback({ text: '다시 한번 말씀해 주시겠어요?', type: 'listening' })
      setTimeout(tryRetry, 2500)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechError])

  // ── 음성 명령어 감지
  useEffect(() => {
    if (!transcript || !showVoiceModal) return
    const cmd = detectVoiceCommand(transcript.trim())
    if (!cmd) return
    const { editingTodoId, editableTranscript, deadline, priority, isManuallyEditing } = modalStateRef.current
    if (cmd === 'save') {
      const raw = isManuallyEditing ? editableTranscript : transcript.trim()
      const content = isManuallyEditing
        ? stripSaveCommand(raw)
        : stripCommandPhrases(stripSaveCommand(raw))
      if (!content) return

      // transcript에서 직접 파싱 (같은 문장에 명령+저장이 있을 때 state 타이밍 문제 해결)
      const t = transcript.trim()
      const detectedPriority = parsePriority(t)
      const detectedDeadline = parseDeadline(t)
      const finalPriority = detectedPriority || priority
      const finalDeadline = detectedDeadline || deadline

      stopListening(); setVoiceCmdFeedback('다듬는 중...')
      ;(async () => {
        const cleanedContent = await cleanTodoContent(content)
        if (editingTodoId) {
          updateTodo(editingTodoId, { content: cleanedContent, deadline: finalDeadline, priority: finalPriority })
          speak('수정했습니다')
        } else {
          addTodo({ content: cleanedContent, deadline: finalDeadline, priority: finalPriority })
          speak('저장했습니다')
        }
        setTimeout(() => closeVoiceModal(), 300)
      })()
      return
    }
    if (cmd === 'delete' && editingTodoId) {
      stopListening(); setVoiceCmdFeedback('삭제 중...')
      deleteTodo(editingTodoId)
      speak('삭제했습니다')
      setTimeout(() => closeVoiceModal(), 300)
      return
    }
    if (cmd === 'cancel') { closeVoiceModal(); return }
    if (cmd === 'reset') { resetSpeech(); setEditableTranscript(''); setIsManuallyEditing(false); setTimeout(() => startListening(), 200) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, showVoiceModal])

  // ── 할일 수정 모달 열기 (버튼 클릭 핸들러에서 직접 호출 → iOS 음성 즉시 시작)
  const openVoiceEditModal = (todo) => {
    resetSpeech()
    setEditableTranscript(todo.content); setIsManuallyEditing(true)
    setDeadline(todo.deadline || null); setPriority(todo.priority || 'medium')
    setVoiceDetected({ priority: false, deadline: false }); setVoiceCmdFeedback(null)
    setEditingTodoId(todo.id); setShowVoiceModal(true)
    startListening()
  }

  // ── 온라인/오프라인 감지
  useEffect(() => {
    const on = () => useTodoStore.getState().setOnline(true)
    const off = () => useTodoStore.getState().setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // ── 커맨드 모드: FAB 마이크 버튼 → 네비게이션 명령 대기
  const startCommandMode = () => {
    cancelSpeech() // 기존 TTS 완전 정리
    resetSpeech()
    setIsCommandMode(true)
    setCmdFeedback({ text: '무엇을 도와드릴까요?', type: 'listening' })
    let didStart = false
    const tryStart = () => {
      if (didStart) return
      didStart = true
      startListening()
    }
    // 웨이크워드 인식 → TTS 전환 시 브라우저 오디오 안정화 대기 (200ms)
    setTimeout(() => {
      speak('무엇을 도와드릴까요?', { rate: 1.1, onEnd: () => setTimeout(tryStart, 300) })
    }, 200)
    setTimeout(tryStart, 3000) // onEnd 미발화 fallback
  }

  const exitCommandMode = () => {
    intentionalStopRef.current = true; stopListening(); resetSpeech()
    setIsCommandMode(false); setCmdFeedback(null); setQueryResult(null); setAwaitingContinue(false)
  }

  // ── 웨이크워드 "헬로 제니퍼" → 커맨드 모드 자동 활성화
  useWakeWord({
    enabled: !isCommandMode && !showVoiceModal && session !== null,
    onWakeWord: startCommandMode,
  })

  // 응답 후 "계속할지" 묻는 단계 진입 — 이전 TTS onEnd에서 호출
  const enterContinuePhase = useCallback(() => {
    let didEnter = false
    const tryEnter = () => {
      if (didEnter) return
      didEnter = true
      resetSpeech() // 이전 transcript 초기화
      setAwaitingContinue(true)
      setCmdFeedback({ text: '확인할 내용이 더 있으신가요?', type: 'listening' })
      setTimeout(() => startListening(), 200)
    }
    speak('확인할 내용이 더 있으신가요?', { rate: 1.0, onEnd: tryEnter })
    setCmdFeedback({ text: '확인할 내용이 더 있으신가요?', type: 'done' })
    setTimeout(tryEnter, 4000) // onEnd 미발화 fallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, startListening, resetSpeech])

  // 조회 의도에 따라 todos 필터링
  const filterTodosByQuery = useCallback((intent) => {
    const { todos } = useTodoStore.getState()
    const todayDate = new Date()
    const today = todayDate.toISOString().split('T')[0]
    const ds = (d) => d.toISOString().split('T')[0]

    if (intent.type === 'today') return todos.filter(t => !t.is_completed && t.deadline === today)
    if (intent.type === 'tomorrow') {
      const d = new Date(todayDate); d.setDate(d.getDate() + 1)
      return todos.filter(t => !t.is_completed && t.deadline === ds(d))
    }
    if (intent.type === 'week') {
      const dow = todayDate.getDay()
      const mon = new Date(todayDate); mon.setDate(todayDate.getDate() - (dow === 0 ? 6 : dow - 1))
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return todos.filter(t => !t.is_completed && t.deadline && t.deadline >= ds(mon) && t.deadline <= ds(sun))
    }
    if (intent.type === 'nextweek') {
      const dow = todayDate.getDay()
      const nMon = new Date(todayDate); nMon.setDate(todayDate.getDate() + (dow === 0 ? 1 : 8 - dow))
      const nSun = new Date(nMon); nSun.setDate(nMon.getDate() + 6)
      return todos.filter(t => !t.is_completed && t.deadline && t.deadline >= ds(nMon) && t.deadline <= ds(nSun))
    }
    if (intent.type === 'specific_date') {
      return todos.filter(t => !t.is_completed && t.deadline === intent.date)
    }
    if (intent.type === 'until_date') {
      return todos.filter(t => !t.is_completed && t.deadline && t.deadline >= today && t.deadline <= intent.date)
    }
    if (intent.type === 'month') {
      const prefix = `${intent.year}-${String(intent.month).padStart(2, '0')}`
      return todos.filter(t => !t.is_completed && t.deadline?.startsWith(prefix))
    }
    if (intent.type === 'week_of_month') {
      const startDay = (intent.weekNum - 1) * 7 + 1
      const endDay = intent.weekNum * 7
      const s = ds(new Date(intent.year, intent.month - 1, startDay))
      const e = ds(new Date(intent.year, intent.month - 1, endDay))
      return todos.filter(t => !t.is_completed && t.deadline && t.deadline >= s && t.deadline <= e)
    }
    if (intent.type === 'keyword') {
      return todos.filter(t => t.content.toLowerCase().includes(intent.keyword.toLowerCase()))
    }
    return []
  }, [])

  // ── 커맨드 모드 음성 감지
  // queryResult, awaitingContinue는 ref에서 읽음 — deps에 넣으면 state 변경 시 이전 transcript로 재실행되어 무한 루프 발생
  useEffect(() => {
    if (!isCommandMode || !transcript) return
    const t = transcript.trim()
    const { awaitingContinue: awaitingCont, queryResult: qResult } = cmdStateRef.current

    // ── Phase 0: 계속 여부 확인 (Yes → 계속, No → 종료, 직접 명령 → 바로 처리)
    if (awaitingCont) {
      const yn = detectYesNo(t)
      if (!yn) {
        // yes/no 없이 직접 명령어가 감지되면 fall-through
        const hasDirectCmd = detectQueryIntent(t) || detectNavCommand(t)
        if (!hasDirectCmd) return  // 미인식 → 계속 대기 (no-speech 시 speechError가 처리)
        intentionalStopRef.current = true; stopListening(); setAwaitingContinue(false)
        // fall-through to Phase 1 below
      } else {
        intentionalStopRef.current = true; stopListening(); setAwaitingContinue(false)
        if (yn === 'yes') {
          let didContinue = false
          const tryContinue = () => {
            if (didContinue) return
            didContinue = true
            setCmdFeedback({ text: '무엇을 도와드릴까요?', type: 'listening' })
            setTimeout(() => startListening(), 200)
          }
          speak('음성 명령을 계속해주세요', { rate: 1.0, onEnd: tryContinue })
          setCmdFeedback({ text: '음성 명령을 계속해주세요', type: 'done' })
          setTimeout(tryContinue, 3000) // fallback
        } else {
          speak('알겠습니다', { onEnd: () => exitCommandMode() })
          setCmdFeedback({ text: '알겠습니다', type: 'done' })
          setTimeout(() => exitCommandMode(), 3000) // fallback
        }
        return
      }
    }

    // ── Phase 2: 조회 결과 확인 (Yes/No 대기)
    if (qResult) {
      const yn = detectYesNo(t)
      if (!yn) {
        // 새 명령 의도가 있으면 현재 queryResult 초기화 후 Phase 1으로 fall-through
        const hasNewCmd = detectQueryIntent(t) || detectNavCommand(t)
        if (!hasNewCmd) return  // 미인식 → 계속 대기 (no-speech 시 speechError가 처리)
        intentionalStopRef.current = true; stopListening(); setQueryResult(null)
        // fall-through to Phase 1 below
      } else {
        intentionalStopRef.current = true; stopListening(); setQueryResult(null)
        if (yn === 'yes') {
          const items = qResult.todos
          const readText = items.map((item, i) => {
            const dl = item.deadline ? `, 마감일 ${format(parseISO(item.deadline), 'M월 d일 EEEE', { locale: ko })}` : ''
            return `${i + 1}번, ${item.content}${dl}`
          }).join('. ')
          speak(readText, { rate: 0.9, onEnd: () => enterContinuePhase() })
          setCmdFeedback({ text: `${items.length}건 읽는 중...`, type: 'done' })
        } else {
          speak('알겠습니다', { onEnd: () => enterContinuePhase() })
          setCmdFeedback({ text: '알겠습니다', type: 'done' })
        }
        return
      }
    }

    // ── Phase 1-A: 조회 의도 감지 (알려줘, 보여줘 등)
    const queryIntent = detectQueryIntent(t)
    if (queryIntent) {
      const matched = filterTodosByQuery(queryIntent)
      const WEEK_NAMES = ['첫째', '둘째', '셋째', '넷째']
      const getTypeLabel = (qi) => {
        if (qi.type === 'today') return '오늘'
        if (qi.type === 'tomorrow') return '내일'
        if (qi.type === 'week') return '이번 주'
        if (qi.type === 'nextweek') return '다음 주'
        if (qi.type === 'keyword') return qi.keyword ? `"${qi.keyword}" 관련` : ''
        if (qi.type === 'specific_date') return format(parseISO(qi.date), 'M월 d일', { locale: ko })
        if (qi.type === 'until_date') return `${format(parseISO(qi.date), 'M월 d일', { locale: ko })}까지`
        if (qi.type === 'month') return `${qi.month}월`
        if (qi.type === 'week_of_month') return `${qi.month}월 ${WEEK_NAMES[qi.weekNum - 1]}주`
        return ''
      }
      const typeLabel = getTypeLabel(queryIntent)

      if (matched.length === 0) {
        const msg = `${typeLabel} 할일이 없습니다`
        intentionalStopRef.current = true; stopListening()
        speak(msg, { onEnd: () => enterContinuePhase() })
        setCmdFeedback({ text: msg, type: 'done' })
      } else {
        const msg = `${typeLabel} 할일이 총 ${matched.length}건 있습니다. 읽어드릴까요?`
        intentionalStopRef.current = true; stopListening()
        setQueryResult({ todos: matched, message: msg })
        setCmdFeedback({ text: msg, type: 'listening' })
        let didStartListen = false
        const tryListen = () => {
          if (didStartListen) return
          didStartListen = true
          startListening() // start() 내부에서 transcript 초기화됨
        }
        speak(msg, { onEnd: () => setTimeout(tryListen, 300) })
        setTimeout(tryListen, 4000) // onEnd 미발화 fallback
      }
      return
    }

    // ── Phase 1-B: 네비게이션 명령
    const nav = detectNavCommand(t)
    if (!nav) return

    if (nav.cmd === 'cancel') {
      speak('취소했어요')
      exitCommandMode(); return
    }
    if (nav.cmd === 'filter') {
      const labels = { all: '전체', today: '오늘 마감', completed: '완료' }
      const { todos } = useTodoStore.getState()
      const todayStr = new Date().toISOString().split('T')[0]
      const counts = {
        all: todos.filter((t) => !t.is_completed).length,
        today: todos.filter((t) => !t.is_completed && t.deadline === todayStr).length,
        completed: todos.filter((t) => t.is_completed).length,
      }
      const count = counts[nav.value]
      const resultMsg = count === 0
        ? `${labels[nav.value]} 할일이 없습니다`
        : `${labels[nav.value]} 할일이 ${count}개 있습니다`
      useTodoStore.getState().setFilter(nav.value)
      setExternalSearch(undefined)
      intentionalStopRef.current = true; stopListening()
      speak(resultMsg)
      setCmdFeedback({ text: resultMsg, type: 'done' })
      setTimeout(() => { setIsCommandMode(false); setCmdFeedback(null) }, 2000)
      return
    }
    if (nav.cmd === 'search') {
      if (!nav.keyword) {
        speak('검색어를 말씀하세요')
        setCmdFeedback({ text: '검색어를 말씀하세요', type: 'listening' })
        return
      }
      const { todos } = useTodoStore.getState()
      const count = todos.filter((t) => t.content.toLowerCase().includes(nav.keyword.toLowerCase())).length
      const resultMsg = count === 0
        ? `${nav.keyword} 관련 할일이 없습니다`
        : `${nav.keyword} 관련 할일이 ${count}개 있습니다`
      setExternalSearch(nav.keyword)
      intentionalStopRef.current = true; stopListening()
      speak(resultMsg)
      setCmdFeedback({ text: `"${nav.keyword}" — ${count}개`, type: 'done' })
      setTimeout(() => { setIsCommandMode(false); setCmdFeedback(null) }, 2000)
      return
    }
    if (nav.cmd === 'delete_todo') {
      const { todos } = useTodoStore.getState()
      const matched = todos.filter((t) => t.content.toLowerCase().includes(nav.keyword.toLowerCase()))
      intentionalStopRef.current = true; stopListening()
      if (matched.length === 0) {
        const msg = '해당 할일을 찾을 수 없습니다'
        speak(msg, { onEnd: () => enterContinuePhase() })
        setCmdFeedback({ text: msg, type: 'done' })
      } else {
        matched.forEach((t) => deleteTodo(t.id))
        const msg = matched.length === 1 ? '할일이 삭제되었습니다' : `${matched.length}개의 할일이 삭제되었습니다`
        speak(msg, { onEnd: () => enterContinuePhase() })
        setCmdFeedback({ text: msg, type: 'done' })
      }
      return
    }
    if (nav.cmd === 'complete_todo') {
      const { todos } = useTodoStore.getState()
      const matched = todos.filter((t) => !t.is_completed && t.content.toLowerCase().includes(nav.keyword.toLowerCase()))
      intentionalStopRef.current = true; stopListening()
      if (matched.length === 0) {
        const msg = '해당 할일을 찾을 수 없습니다'
        speak(msg, { onEnd: () => enterContinuePhase() })
        setCmdFeedback({ text: msg, type: 'done' })
      } else {
        matched.forEach((t) => toggleComplete(t.id))
        const msg = matched.length === 1 ? '할일이 완료되었습니다' : `${matched.length}개의 할일이 완료되었습니다`
        speak(msg, { onEnd: () => enterContinuePhase() })
        setCmdFeedback({ text: msg, type: 'done' })
      }
      return
    }
    if (nav.cmd === 'sort') {
      const sortLabels = { newest: '최근 등록 순', oldest: '과거 등록 순', deadline: '마감 빠른 순', priority: '우선순위 높은 순' }
      const resultMsg = `${sortLabels[nav.value]}으로 할일을 정렬했습니다`
      setSortBy(nav.value)
      intentionalStopRef.current = true; stopListening()
      speak(resultMsg)
      setCmdFeedback({ text: resultMsg, type: 'done' })
      setTimeout(() => { setIsCommandMode(false); setCmdFeedback(null) }, 2000)
      return
    }
    if (nav.cmd === 'add') {
      intentionalStopRef.current = true; stopListening(); resetSpeech()
      setIsCommandMode(false); setCmdFeedback(null)
      setShowVoiceModal(true)
      setEditableTranscript(''); setIsManuallyEditing(false)
      setDeadline(null); setPriority('medium'); setManualText('')
      setVoiceDetected({ priority: false, deadline: false })
      setVoiceCmdFeedback(null); setEditingTodoId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, isCommandMode])

  const openVoiceModal = () => {
    resetSpeech()
    setEditableTranscript(''); setIsManuallyEditing(false)
    setDeadline(null); setPriority('medium'); setManualText('')
    setVoiceDetected({ priority: false, deadline: false })
    setVoiceCmdFeedback(null); setEditingTodoId(null)
    setInputMode('voice')
    setShowVoiceModal(true)
    startListening()
  }

  const closeVoiceModal = () => {
    stopListening(); resetSpeech()
    setShowVoiceModal(false); setEditingTodoId(null)
    setEditableTranscript(''); setIsManuallyEditing(false)
    setVoiceCmdFeedback(null); setVoiceEditTodoId(null)
    setInputMode('voice')
  }

  const handleMicToggle = () => {
    if (isListening) { stopListening() }
    else { setIsManuallyEditing(false); startListening() }
  }

  const handleTranscriptEdit = (e) => {
    if (!isManuallyEditing) { stopListening(); setIsManuallyEditing(true) }
    setEditableTranscript(e.target.value)
  }

  const handleSave = async () => {
    const isVoiceMode = speechSupported && inputMode === 'voice'
    const raw = isVoiceMode ? editableTranscript.trim() : manualText.trim()
    const stripped = isVoiceMode ? stripCommandPhrases(raw) : raw
    if (!stripped) return
    setIsSaving(true)
    const content = await cleanTodoContent(stripped)
    if (editingTodoId) {
      await updateTodo(editingTodoId, { content, deadline, priority })
      speak('수정했습니다')
    } else {
      await addTodo({ content, deadline, priority })
      speak('저장했습니다')
    }
    setIsSaving(false)
    closeVoiceModal()
  }

  const currentText = (speechSupported && inputMode === 'voice') ? editableTranscript.trim() : manualText.trim()

  // ─── 로딩 화면 ───────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ─── 로그인 화면 ──────────────────────────────────────────────
  if (session === null) {
    return (
      <div className="relative min-h-screen flex flex-col items-center overflow-hidden bg-[#05060f]">

        {/* Spline 웨이브폼 — 전체 배경 */}
        <div className="absolute inset-0 overflow-hidden" style={{ bottom: '-60px' }}>
          <iframe
            src="https://my.spline.design/waveform-8HqNtPViyc9ykD1pAcBcbuHy/"
            frameBorder="0"
            width="100%"
            height="100%"
            style={{ border: 'none' }}
            title="VoiceDo waveform animation"
          />
        </div>
        {/* 터치 차단 오버레이 */}
        <div className="absolute inset-0 z-[1]" />

        {/* 하단 그라데이션 오버레이 — 텍스트 가독성 확보 */}
        <div className="absolute inset-x-0 bottom-0 h-[60%] z-[2] pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(5,6,15,0.95) 0%, rgba(5,6,15,0.7) 40%, transparent 100%)' }} />

        {/* 아이콘 + 타이틀 (중앙 상단) */}
        <div className="relative z-[3] flex flex-col items-center gap-7 animate-fade-up mb-auto mt-[28vh]">
          <div className="relative flex items-center justify-center animate-float">
            <div className="absolute w-20 h-20 rounded-[22px] bg-indigo-500/20 animate-ripple" />
            <div className="absolute w-20 h-20 rounded-[22px] bg-violet-400/15 animate-ripple-delay" />
            <div className="absolute w-32 h-32 rounded-full animate-glow-pulse"
              style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%)' }} />
            <div className="relative w-20 h-20 rounded-[22px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.5) 0%, rgba(124,58,237,0.4) 100%)',
                border: '1px solid rgba(165,180,252,0.3)',
                boxShadow: '0 0 50px rgba(99,102,241,0.55), 0 0 100px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}>
              <svg className="w-9 h-9 text-indigo-100" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"
                  stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="text-center space-y-2.5">
            <h1 className="text-[42px] font-black text-white tracking-tight leading-none">
              VoiceDo
            </h1>
            <p className="text-[14px] font-medium text-white/80">
              음성으로 할일을 관리하세요
            </p>
          </div>
        </div>

        {/* 로그인 버튼 (하단 고정) */}
        <div className="relative z-[3] w-full max-w-[260px] pb-[6vh] animate-fade-up-2">
          <button
            onClick={() => supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.origin },
            })}
            className="group relative w-full flex items-center justify-center gap-1.5 py-3 rounded-xl font-semibold text-[13px] text-white overflow-hidden active:scale-[0.97] transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              boxShadow: '0 4px 24px rgba(99,102,241,0.35), 0 0 0 1px rgba(165,180,252,0.15)',
            }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }} />
            <span className="relative">Google로 시작하기</span>
            <svg className="relative w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // ─── 메인 화면 ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <header className="bg-white sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <svg className="w-4.5 h-4.5 w-[18px] h-[18px] text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"
                  stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">VoiceDo</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                resetSpeech()
                setEditableTranscript(''); setIsManuallyEditing(false)
                setDeadline(null); setPriority('medium'); setManualText('')
                setVoiceDetected({ priority: false, deadline: false })
                setVoiceCmdFeedback(null); setEditingTodoId(null)
                setInputMode('text')
                setShowVoiceModal(true)
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-500"
              aria-label="할일 추가"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setShowNotifBanner((v) => !v)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                showNotifBanner
                  ? 'bg-indigo-100 text-indigo-600'
                  : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-500'
              }`}
              aria-label="알림 설정"
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(v => !v)}
                className="w-9 h-9 rounded-full overflow-hidden border-2 border-slate-200 hover:border-slate-300 transition-colors flex-shrink-0"
                aria-label="프로필 메뉴"
              >
                {session?.user?.user_metadata?.avatar_url ? (
                  <img
                    src={session.user.user_metadata.avatar_url}
                    alt="프로필"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="w-full h-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center">
                    {(session?.user?.user_metadata?.full_name?.[0] || session?.user?.email?.[0] || 'U').toUpperCase()}
                  </span>
                )}
              </button>
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 top-11 z-50 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {session?.user?.user_metadata?.full_name || '사용자'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {session?.user?.email || ''}
                      </p>
                    </div>
                    <button
                      onClick={() => { setShowProfileMenu(false); handleSignOut() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 pb-36 space-y-4">
        {showNotifBanner && (
          <NotificationSetup onClose={() => setShowNotifBanner(false)} />
        )}
        <TodoList
          onVoiceEdit={openVoiceEditModal}
          onComplete={(type) => showToastMsg(type === '복원' ? '할일이 복원되었습니다.' : '할 일이 완료되었습니다.')}
          externalSearch={externalSearch}
          onSearchChange={(v) => setExternalSearch(v || undefined)}
          onCalendarOpen={() => setShowCalendar(true)}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      </main>

      {/* 완료 토스트 */}
      {toast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-2 px-5 py-3 bg-slate-900/90 backdrop-blur-sm text-white text-[13px] font-semibold rounded-xl shadow-xl">
            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {toast.text}
          </div>
        </div>
      )}

      {/* 플로팅 액션 버튼 */}
      <div className="fixed bottom-8 left-0 right-0 flex flex-col items-center gap-2.5 z-20 pointer-events-none">

        {/* 커맨드 모드 피드백 UI */}
        {isCommandMode && (
          <div className="pointer-events-auto flex flex-col items-center gap-2 animate-fade-in">
            {/* 실시간 transcript */}
            {(transcript || interimTranscript) && (
              <div className="bg-slate-900/90 backdrop-blur-sm text-white text-[13px] font-medium px-4 py-2 rounded-full max-w-[260px] text-center truncate shadow-lg">
                {transcript || interimTranscript}
              </div>
            )}
            {/* 상태 피드백 */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold shadow-lg backdrop-blur-sm ${
              cmdFeedback?.type === 'done'
                ? 'bg-emerald-500 text-white'
                : 'bg-white/95 text-slate-700'
            }`}>
              {cmdFeedback?.type === 'listening' && (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-indigo-500 animate-dot-1" />
                  <span className="w-1 h-1 rounded-full bg-indigo-500 animate-dot-2" />
                  <span className="w-1 h-1 rounded-full bg-indigo-500 animate-dot-3" />
                </span>
              )}
              {cmdFeedback?.type === 'done' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span>{cmdFeedback?.text}</span>
            </div>
            {/* 사용 가능 명령어 힌트 */}
            {cmdFeedback?.type === 'listening' && !transcript && !interimTranscript && (
              <div className="flex flex-wrap justify-center gap-1.5 max-w-[280px]">
                {(queryResult || awaitingContinue)
                  ? ['네', '아니요'].map((hint) => (
                      <span key={hint} className="text-[10px] text-white/70 bg-slate-900/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10">
                        {hint}
                      </span>
                    ))
                  : ['오늘 할일 알려줘', '이번 주 할일', '삼성생명 할일', '할일 추가', '취소'].map((hint) => (
                      <span key={hint} className="text-[10px] text-white/70 bg-slate-900/60 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/10">
                        {hint}
                      </span>
                    ))
                }
              </div>
            )}
          </div>
        )}

        {!isCommandMode && (
          <span className="text-[11px] text-slate-500 font-medium bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 pointer-events-auto select-none">
            {speechSupported ? 'Hello Jenifer라고 불러주세요.' : '할일 추가'}
          </span>
        )}

        <div className="pointer-events-auto" onClick={isCommandMode ? exitCommandMode : undefined}>
          <VoiceButton
            isListening={isListening && !showVoiceModal}
            onClick={isCommandMode ? exitCommandMode : startCommandMode}
          />
        </div>
      </div>

      {/* 캘린더 뷰 */}
      {showCalendar && (
        <CalendarView onClose={() => setShowCalendar(false)} />
      )}

      {/* 음성 모달 (Bottom Sheet) */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-30 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-fade-in"
            onClick={closeVoiceModal}
          />

          <div className="relative w-full max-w-lg bg-white rounded-t-[28px] shadow-2xl animate-slide-up max-h-[92vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-6 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  editingTodoId
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {editingTodoId ? '수정 모드' : '새 할일'}
                </span>
                <h2 className="text-[15px] font-bold text-slate-900">
                  {editingTodoId ? '할일 수정 / 삭제' : (speechSupported ? '음성으로 추가' : '할일 추가')}
                </h2>
              </div>
              <button
                onClick={closeVoiceModal}
                className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* 입력 모드 선택 (음성 지원 시에만 표시) */}
              {speechSupported && (
                <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    onClick={() => { setInputMode('voice'); setIsManuallyEditing(false); if (!isListening) startListening() }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      inputMode === 'voice' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                    </svg>
                    음성 입력
                  </button>
                  <button
                    onClick={() => { setInputMode('text'); stopListening() }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      inputMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    텍스트 입력
                  </button>
                </div>
              )}

              {speechSupported && inputMode === 'text' ? (
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="할일을 입력하세요"
                  rows={3}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  autoFocus
                />
              ) : speechSupported ? (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={editableTranscript}
                      onChange={handleTranscriptEdit}
                      placeholder={isListening && !isManuallyEditing ? '말씀하세요...' : '내용을 입력하거나 마이크를 누르세요'}
                      rows={3}
                      className={`w-full px-4 py-3.5 rounded-2xl text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 resize-none transition-all ${
                        isListening && !isManuallyEditing
                          ? 'bg-indigo-50 border border-indigo-200 focus:ring-indigo-300'
                          : 'bg-slate-50 border border-slate-200 focus:ring-indigo-300'
                      }`}
                    />
                    {isListening && !isManuallyEditing && (
                      <div className="absolute top-3 right-3 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-dot-1" />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-dot-2" />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-dot-3" />
                      </div>
                    )}
                  </div>

                  {isListening && (
                    <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                      {editingTodoId
                        ? '"저장해줘" 저장  ·  "삭제해줘" 삭제  ·  "취소" 닫기  ·  "초기화 시켜줘" 초기화'
                        : '"저장해줘" 저장  ·  "취소" 닫기  ·  "초기화 시켜줘" 초기화'}
                    </p>
                  )}

                  {voiceCmdFeedback && (
                    <div className="flex items-center justify-center gap-2 py-2.5 bg-indigo-50 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                      <p className="text-sm text-indigo-700 font-semibold">{voiceCmdFeedback}</p>
                    </div>
                  )}

                  {(voiceDetected.priority || voiceDetected.deadline) && (
                    <div className="flex flex-wrap gap-1.5">
                      {voiceDetected.priority && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                          우선순위 감지: {PRIORITY_LABELS[priority]}
                        </span>
                      )}
                      {voiceDetected.deadline && deadline && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-100 px-2.5 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          마감 감지: {format(parseISO(deadline), 'M월 d일 (E)', { locale: ko })}
                        </span>
                      )}
                    </div>
                  )}

                  {speechError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{speechError}</p>
                  )}

                  <div className="flex justify-center pt-1">
                    <VoiceButton isListening={isListening} onClick={handleMicToggle} />
                  </div>
                </div>
              ) : !speechSupported ? (
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="할일을 입력하세요"
                  rows={3}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  autoFocus
                />
              ) : null}

              <div className="border-t border-slate-100" />

              {/* 우선순위 */}
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">우선순위</p>
                <div className="flex gap-2">
                  {[
                    { value: 'high',   label: '높음', on: 'bg-rose-500 text-white shadow-sm',    off: 'bg-rose-50 text-rose-600 border border-rose-100' },
                    { value: 'medium', label: '보통', on: 'bg-amber-500 text-white shadow-sm',   off: 'bg-amber-50 text-amber-600 border border-amber-100' },
                    { value: 'low',    label: '낮음', on: 'bg-emerald-500 text-white shadow-sm', off: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
                  ].map(({ value, label, on, off }) => (
                    <button
                      key={value}
                      onClick={() => setPriority(value)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${priority === value ? on : off}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 마감일 */}
              <DeadlinePicker value={deadline} onChange={setDeadline} />

              {/* 버튼 */}
              <div className="space-y-2.5 pt-1 pb-2">
                {editingTodoId && (
                  <button
                    onClick={() => { deleteTodo(editingTodoId); speak('삭제했습니다'); closeVoiceModal() }}
                    className="w-full py-3.5 rounded-lg font-semibold text-sm bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 active:scale-95 transition-all"
                  >
                    삭제하기
                  </button>
                )}

                <button
                  onClick={handleSave}
                  disabled={!currentText || isSaving}
                  className={`
                    w-full py-4 rounded-lg font-bold text-sm transition-all
                    ${currentText && !isSaving
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200/60 active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }
                  `}
                >
                  {isSaving ? '저장 중...' : editingTodoId ? '수정 완료' : '저장하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

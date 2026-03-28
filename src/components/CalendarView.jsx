import { useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, addWeeks, subWeeks,
  isSameDay, isSameMonth, isToday,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { useTodoStore } from '../store/todoStore'

const PRIORITY = {
  high:   { dot: 'bg-rose-400',    text: 'text-rose-600',    label: '높음', badge: 'bg-rose-50 text-rose-600 border-rose-100' },
  medium: { dot: 'bg-amber-400',   text: 'text-amber-600',   label: '보통', badge: 'bg-amber-50 text-amber-600 border-amber-100' },
  low:    { dot: 'bg-emerald-400', text: 'text-emerald-600', label: '낮음', badge: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function CalendarView({ onClose }) {
  const { todos } = useTodoStore()
  const [viewMode, setViewMode] = useState('week')
  const [current, setCurrent] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  const todosForDate = (dateStr) => todos.filter((t) => t.deadline === dateStr)
  const todosForSelected = todosForDate(format(selectedDate, 'yyyy-MM-dd'))
  const incompletedSelected = todosForSelected.filter((t) => !t.is_completed)
  const completedSelected = todosForSelected.filter((t) => t.is_completed)

  const buildMonthDays = () => {
    const start = startOfWeek(startOfMonth(current), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(current), { weekStartsOn: 0 })
    const days = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    return days
  }

  const buildWeekDays = () => {
    const start = startOfWeek(current, { weekStartsOn: 0 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }

  const monthDays = buildMonthDays()
  const weekDays = buildWeekDays()

  const goBack = () => viewMode === 'month' ? setCurrent(subMonths(current, 1)) : setCurrent(subWeeks(current, 1))
  const goForward = () => viewMode === 'month' ? setCurrent(addMonths(current, 1)) : setCurrent(addWeeks(current, 1))
  const goToday = () => { setCurrent(new Date()); setSelectedDate(new Date()) }

  const navTitle = viewMode === 'month'
    ? format(current, 'yyyy년 M월', { locale: ko })
    : (() => {
        const s = startOfWeek(current, { weekStartsOn: 0 })
        const e = endOfWeek(current, { weekStartsOn: 0 })
        return `${format(s, 'M.d')} – ${format(e, 'M.d')}`
      })()

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 animate-fade-in">

      {/* ── 헤더 */}
      <div className="bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] flex-shrink-0">
        <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* 월/주 네비게이션 */}
          <div className="flex items-center gap-1 flex-1">
            <button onClick={goBack} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToday}
              className="flex-1 text-center text-[15px] font-bold text-slate-800 hover:text-indigo-600 transition-colors"
            >
              {navTitle}
            </button>
            <button onClick={goForward} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 주간 / 월간 토글 */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
            {[['week', '주'], ['month', '월']].map(([m, l]) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all ${
                  viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 캘린더 그리드 */}
      <div className="bg-white flex-shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 px-3 pt-2 pb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-[11px] font-bold py-1 ${
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'
            }`}>{d}</div>
          ))}
        </div>

        {/* 월간 그리드 */}
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
            {monthDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const incomplete = todosForDate(dateStr).filter((t) => !t.is_completed)
              const isSelected = isSameDay(day, selectedDate)
              const isCurrentMonth = isSameMonth(day, current)
              const isTodayDate = isToday(day)
              const col = idx % 7

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className="flex flex-col items-center py-1.5 rounded-lg hover:bg-slate-50 transition-all active:scale-95"
                >
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-semibold mb-1 ${
                    isSelected
                      ? 'bg-indigo-500 text-white'
                      : isTodayDate
                        ? 'bg-indigo-100 text-indigo-600'
                        : isCurrentMonth
                          ? col === 0 ? 'text-rose-400' : col === 6 ? 'text-blue-400' : 'text-slate-700'
                          : 'text-slate-300'
                  }`}>
                    {format(day, 'd')}
                  </span>

                  {/* 할일 점 */}
                  <div className="flex gap-[2px] h-[6px] items-center">
                    {incomplete.slice(0, 3).map((t, i) => (
                      <span key={i} className={`w-1 h-1 rounded-full ${
                        isSelected ? 'bg-white/70' : PRIORITY[t.priority]?.dot || 'bg-slate-400'
                      }`} />
                    ))}
                    {incomplete.length > 3 && (
                      <span className={`text-[8px] font-bold ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                        ···
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 주간 그리드 */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-7 px-3 pb-4 gap-1">
            {weekDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const incomplete = todosForDate(dateStr).filter((t) => !t.is_completed)
              const isSelected = isSameDay(day, selectedDate)
              const isTodayDate = isToday(day)

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className="flex flex-col items-center py-2.5 rounded-xl hover:bg-slate-100 transition-all active:scale-95"
                >
                  <span className={`w-9 h-9 flex items-center justify-center rounded-full text-[15px] font-bold ${
                    isSelected ? 'bg-indigo-500 text-white' : isTodayDate ? 'bg-indigo-100 text-indigo-600' : idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-blue-400' : 'text-slate-700'
                  }`}>
                    {format(day, 'd')}
                  </span>
                  {incomplete.length > 0 ? (
                    <span className={`mt-1 text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center leading-5 ${
                      isSelected ? 'bg-indigo-400 text-white' : 'bg-indigo-100 text-indigo-600'
                    }`}>
                      {incomplete.length}
                    </span>
                  ) : (
                    <span className="mt-1.5 h-5" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 선택된 날짜 할일 목록 */}
      <div className="flex-1 overflow-y-auto">
        {/* 날짜 타이틀 */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-slate-800">
              {format(selectedDate, 'M월 d일 (E)', { locale: ko })}
            </span>
            {isToday(selectedDate) && (
              <span className="text-[11px] font-semibold text-white bg-indigo-500 px-2 py-0.5 rounded-full">오늘</span>
            )}
          </div>
          <span className="text-[12px] font-semibold text-slate-400">
            미완료 {incompletedSelected.length}개
            {completedSelected.length > 0 && ` · 완료 ${completedSelected.length}개`}
          </span>
        </div>

        <div className="px-4 pb-10 flex flex-col gap-2">
          {todosForSelected.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-[13px] font-semibold text-slate-400">이 날 마감 할일 없어요</p>
            </div>
          ) : (
            <>
              {/* 미완료 */}
              {incompletedSelected.map((todo) => {
                const p = PRIORITY[todo.priority] || PRIORITY.medium
                return (
                  <div key={todo.id} className="bg-white rounded-xl px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-slate-100 flex items-start gap-3">
                    <span className={`mt-[5px] w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-slate-800 leading-snug break-words">{todo.content}</p>
                      <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.badge}`}>
                        {p.label}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* 완료된 항목 */}
              {completedSelected.length > 0 && (
                <>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-2 px-1">완료됨</p>
                  {completedSelected.map((todo) => (
                    <div key={todo.id} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 flex items-start gap-3 opacity-60">
                      <svg className="mt-0.5 w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-[13px] font-medium text-slate-500 line-through leading-snug break-words">{todo.content}</p>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

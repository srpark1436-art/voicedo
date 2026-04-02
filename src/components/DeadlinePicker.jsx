import { useState } from 'react'
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, isSameDay, isSameMonth, isBefore, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

const QUICK_OPTIONS = [
  { label: '오늘', days: 0 },
  { label: '내일', days: 1 },
  { label: '모레', days: 2 },
  { label: '이번 주', days: 7 },
]

const TIME_PRESETS = [
  { label: '오전 9시', value: '09:00' },
  { label: '낮 12시', value: '12:00' },
  { label: '오후 3시', value: '15:00' },
  { label: '오후 6시', value: '18:00' },
  { label: '오후 7시', value: '19:00' },
  { label: '밤 9시', value: '21:00' },
]

function CalendarPopup({ value, onChange, onClose }) {
  const today = new Date()
  const selected = value ? parseISO(value) : null
  const [viewMonth, setViewMonth] = useState(selected || today)

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = []
  let d = calStart
  while (d <= calEnd) { days.push(d); d = addDays(d, 1) }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm bg-white rounded-t-2xl shadow-2xl px-4 pt-5 pb-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewMonth(addMonths(viewMonth, -1))} className="p-2 rounded-full hover:bg-slate-100">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base font-bold text-slate-800">
            {format(viewMonth, 'yyyy년 M월', { locale: ko })}
          </h3>
          <button onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="p-2 rounded-full hover:bg-slate-100">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {dayNames.map((n, i) => (
            <div key={n} className={`text-center text-[11px] font-semibold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
              {n}
            </div>
          ))}
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd')
            const isToday = isSameDay(day, today)
            const isSelected = selected && isSameDay(day, selected)
            const isCurrentMonth = isSameMonth(day, viewMonth)
            const isPast = isBefore(day, today) && !isToday
            const dayOfWeek = day.getDay()

            return (
              <button
                key={dayStr}
                disabled={isPast}
                onClick={() => { onChange(dayStr); onClose() }}
                className={`
                  relative h-10 rounded-xl text-sm font-medium transition-all
                  ${!isCurrentMonth ? 'text-slate-200' : ''}
                  ${isPast ? 'text-slate-200 cursor-not-allowed' : ''}
                  ${isCurrentMonth && !isPast && !isSelected ? (
                    dayOfWeek === 0 ? 'text-red-500 hover:bg-red-50' :
                    dayOfWeek === 6 ? 'text-blue-500 hover:bg-blue-50' :
                    'text-slate-700 hover:bg-indigo-50'
                  ) : ''}
                  ${isSelected ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200' : ''}
                  ${isToday && !isSelected ? 'ring-2 ring-indigo-300 ring-inset' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>

        {/* 닫기 */}
        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  )
}

function TimePopup({ value, onChange, onClose }) {
  const [hour, setHour] = useState(() => value ? parseInt(value.split(':')[0]) : 9)
  const [minute, setMinute] = useState(() => value ? parseInt(value.split(':')[1]) : 0)

  const applyTime = (h, m) => {
    const tv = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    onChange(tv)
    onClose()
  }

  const formatTimeLabel = (h, m) => {
    const period = h < 12 ? '오전' : '오후'
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${period} ${displayH}시${m > 0 ? ` ${m}분` : ''}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm bg-white rounded-t-2xl shadow-2xl px-4 pt-5 pb-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-800 mb-4 text-center">시간 선택</h3>

        {/* 빠른 선택 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {TIME_PRESETS.map(({ label, value: tv }) => (
            <button
              key={tv}
              onClick={() => { onChange(tv); onClose() }}
              className={`
                py-2.5 rounded-xl text-xs font-semibold transition-all text-center
                ${value === tv
                  ? 'bg-violet-500 text-white shadow-md shadow-violet-200'
                  : 'bg-violet-50 text-violet-600 hover:bg-violet-100 active:scale-95'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 직접 선택: 시/분 스크롤 */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex flex-col items-center">
            <button onClick={() => setHour((h) => (h + 1) % 24)} className="p-1.5 rounded-full hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <div className="w-16 h-12 flex items-center justify-center bg-slate-50 rounded-xl text-2xl font-bold text-slate-800">
              {String(hour).padStart(2, '0')}
            </div>
            <button onClick={() => setHour((h) => (h - 1 + 24) % 24)} className="p-1.5 rounded-full hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>

          <span className="text-2xl font-bold text-slate-300 pb-0.5">:</span>

          <div className="flex flex-col items-center">
            <button onClick={() => setMinute((m) => (m + 5) % 60)} className="p-1.5 rounded-full hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <div className="w-16 h-12 flex items-center justify-center bg-slate-50 rounded-xl text-2xl font-bold text-slate-800">
              {String(minute).padStart(2, '0')}
            </div>
            <button onClick={() => setMinute((m) => (m - 5 + 60) % 60)} className="p-1.5 rounded-full hover:bg-slate-100">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>

          <div className="ml-2 text-sm font-semibold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-lg">
            {formatTimeLabel(hour, minute)}
          </div>
        </div>

        {/* 확인/취소 */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => applyTime(hour, minute)}
            className="flex-1 py-2.5 bg-violet-500 text-white rounded-xl text-sm font-semibold hover:bg-violet-600 active:scale-95 transition-all shadow-sm"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeadlinePicker({ value, onChange, timeValue, onTimeChange }) {
  const today = new Date()
  const [showCalendar, setShowCalendar] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)

  const handleQuick = (days) => {
    onChange(format(addDays(today, days), 'yyyy-MM-dd'))
  }

  const handleClear = () => {
    onChange(null)
    onTimeChange?.(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">마감일 설정</p>

      {/* 빠른 날짜 선택 */}
      <div className="grid grid-cols-4 gap-2">
        {QUICK_OPTIONS.map(({ label, days }) => {
          const dateStr = format(addDays(today, days), 'yyyy-MM-dd')
          const isSelected = value === dateStr
          return (
            <button
              key={label}
              onClick={() => handleQuick(days)}
              className={`
                py-2 rounded-lg text-xs font-semibold transition-colors text-center
                ${isSelected
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700'
                }
              `}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 달력에서 날짜 선택 */}
      <button
        type="button"
        onClick={() => setShowCalendar(true)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
      >
        <svg className="w-[18px] h-[18px] text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>
          {value
            ? format(new Date(value + 'T00:00:00'), 'yyyy년 M월 d일 (E)', { locale: ko })
            : '달력에서 날짜 선택'}
        </span>
      </button>

      {/* 시간 선택 (날짜 선택 후 표시) */}
      {value && (
        <button
          type="button"
          onClick={() => setShowTimePicker(true)}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 border rounded-xl text-sm transition-colors ${
            timeValue
              ? 'border-violet-200 bg-violet-50/50 text-violet-700'
              : 'border-slate-200 text-slate-500 hover:border-violet-300 hover:bg-violet-50/30'
          }`}
        >
          <svg className="w-[18px] h-[18px] text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={timeValue ? 'font-medium' : ''}>
            {timeValue ? `${parseInt(timeValue.split(':')[0]) < 12 ? '오전' : '오후'} ${parseInt(timeValue.split(':')[0]) === 0 ? 12 : parseInt(timeValue.split(':')[0]) > 12 ? parseInt(timeValue.split(':')[0]) - 12 : parseInt(timeValue.split(':')[0])}시${parseInt(timeValue.split(':')[1]) > 0 ? ` ${parseInt(timeValue.split(':')[1])}분` : ''}` : '시간 선택 (선택사항)'}
          </span>
          {timeValue && (
            <span
              onClick={(e) => { e.stopPropagation(); onTimeChange?.(null) }}
              className="ml-auto text-violet-400 hover:text-red-400 text-base font-bold px-1"
            >
              ✕
            </span>
          )}
        </button>
      )}

      {/* 선택 결과 요약 */}
      {value && (
        <div className="flex items-center justify-between bg-indigo-50/60 rounded-xl px-3 py-2">
          <p className="text-xs text-indigo-700 font-semibold">
            {format(new Date(value + 'T00:00:00'), 'M월 d일 (E)', { locale: ko })}
            {timeValue && (
              <span className="text-violet-600 ml-1">{timeValue}</span>
            )}
          </p>
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            삭제
          </button>
        </div>
      )}

      {/* 캘린더 팝업 */}
      {showCalendar && (
        <CalendarPopup
          value={value}
          onChange={onChange}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {/* 시간 선택 팝업 */}
      {showTimePicker && (
        <TimePopup
          value={timeValue}
          onChange={onTimeChange}
          onClose={() => setShowTimePicker(false)}
        />
      )}
    </div>
  )
}

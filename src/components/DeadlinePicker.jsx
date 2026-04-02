import { useRef } from 'react'
import { format, addDays } from 'date-fns'
import { ko } from 'date-fns/locale'

const QUICK_OPTIONS = [
  { label: '오늘', days: 0 },
  { label: '내일', days: 1 },
  { label: '모레', days: 2 },
  { label: '이번 주', days: 7 },
]

export default function DeadlinePicker({ value, onChange }) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const dateInputRef = useRef(null)

  const handleQuick = (days) => {
    const date = format(addDays(today, days), 'yyyy-MM-dd')
    onChange(date)
  }

  const handleClear = () => onChange(null)

  const openDatePicker = () => {
    dateInputRef.current?.showPicker?.()
    dateInputRef.current?.focus()
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">마감일 설정</p>

      {/* 빠른 선택 버튼 */}
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

      {/* 날짜 직접 선택 버튼 */}
      <div className="relative">
        <button
          type="button"
          onClick={openDatePicker}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
        >
          <svg className="w-[18px] h-[18px] text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={value ? 'text-slate-800 font-medium' : 'text-slate-400'}>
            {value
              ? format(new Date(value), 'yyyy년 M월 d일 (E)', { locale: ko })
              : '달력에서 날짜 선택'}
          </span>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={value || ''}
          min={todayStr}
          onChange={(e) => onChange(e.target.value || null)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          tabIndex={-1}
        />
      </div>

      {value && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-indigo-600 font-medium">
            마감일: {format(new Date(value), 'M월 d일 (E)', { locale: ko })}
          </p>
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  )
}

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

  const handleQuick = (days) => {
    const date = format(addDays(today, days), 'yyyy-MM-dd')
    onChange(date)
  }

  const handleClear = () => onChange(null)

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">마감일 설정</p>

      {/* 빠른 선택 버튼 */}
      <div className="flex flex-wrap gap-2">
        {QUICK_OPTIONS.map(({ label, days }) => {
          const dateStr = format(addDays(today, days), 'yyyy-MM-dd')
          const isSelected = value === dateStr
          return (
            <button
              key={label}
              onClick={() => handleQuick(days)}
              className={`
                px-3 py-1.5 rounded-full text-sm font-medium transition-colors
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
        {value && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            없음
          </button>
        )}
      </div>

      {/* 날짜 직접 입력 */}
      <input
        type="date"
        value={value || ''}
        min={todayStr}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {value && (
        <p className="text-xs text-indigo-600 font-medium">
          마감일: {format(new Date(value), 'M월 d일 (E)', { locale: ko })}
        </p>
      )}
    </div>
  )
}

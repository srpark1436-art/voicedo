import { useState, useEffect } from 'react'
import { useTodoStore } from '../store/todoStore'
import TodoItem from './TodoItem'

const SORT_OPTIONS = [
  { value: 'newest',   label: '최근 등록 순' },
  { value: 'oldest',   label: '과거 등록 순' },
  { value: 'deadline', label: '마감 빠른 순' },
  { value: 'priority', label: '우선순위 순' },
]

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

function sortTodos(todos, sortBy) {
  return [...todos].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
    if (sortBy === 'deadline') {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    }
    if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
    return new Date(b.created_at) - new Date(a.created_at) // newest (default)
  })
}

export default function TodoList({ onVoiceEdit, onComplete, externalSearch, onSearchChange, onCalendarOpen, sortBy, onSortChange }) {
  const { filter, setFilter, todos } = useTodoStore()
  const [internalSearch, setInternalSearch] = useState('')
  const [showSortMenu, setShowSortMenu] = useState(false)

  useEffect(() => {
    if (externalSearch !== undefined) setInternalSearch(externalSearch)
  }, [externalSearch])

  const searchQuery = internalSearch
  const setSearchQuery = (v) => {
    setInternalSearch(v)
    onSearchChange?.(v)
  }

  const todayStr = new Date().toISOString().split('T')[0]

  const allTodos = todos.filter((t) => !t.is_completed)
  const todayTodos = todos.filter((t) => !t.is_completed && t.deadline === todayStr)
  const completedTodos = todos.filter((t) => t.is_completed)

  const FILTERS = [
    { value: 'all',       label: '전체',  count: allTodos.length },
    { value: 'today',     label: '오늘',  count: todayTodos.length },
    { value: 'completed', label: '완료',  count: completedTodos.length },
  ]

  const filtered = (() => {
    switch (filter) {
      case 'today':     return todayTodos
      case 'completed': return completedTodos
      default:          return allTodos
    }
  })()

  const searched = searchQuery.trim()
    ? filtered.filter((t) => t.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : filtered

  const displayTodos = sortTodos(searched, sortBy)

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label

  return (
    <div className="flex flex-col gap-3">
      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="할일 검색..."
            className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-[15px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 정렬 드롭다운 */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowSortMenu((v) => !v)}
            className="h-full flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[13.5px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            {currentSortLabel}
          </button>

          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[130px]">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onSortChange?.(opt.value); setShowSortMenu(false) }}
                    className={`w-full px-4 py-2.5 text-left text-[13.5px] font-semibold transition-colors flex items-center justify-between ${
                      sortBy === opt.value
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.value && (
                      <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 필터 탭 + 캘린더 */}
      <div className="flex items-center gap-2">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1 flex-1">
          {FILTERS.map(({ value, label, count }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`
                flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200
                flex items-center justify-center gap-1.5
                ${filter === value
                  ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                  : 'text-slate-500 hover:text-slate-700'
                }
              `}
            >
              {label}
              <span className={`
                text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center
                ${filter === value ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}
              `}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* 캘린더 버튼 */}
        <button
          onClick={onCalendarOpen}
          className="w-[42px] h-[42px] flex-shrink-0 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white rounded-xl flex items-center justify-center shadow-[0_2px_8px_rgba(99,102,241,0.35)] transition-all"
          aria-label="캘린더 보기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* 할일 목록 */}
      <div className="flex flex-col gap-2.5">
        {displayTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {searchQuery
                ? `"${searchQuery}" 검색 결과 없음`
                : filter === 'all' ? '할일이 없습니다'
                : filter === 'today' ? '오늘 마감 할일 없음'
                : '완료된 할일 없음'}
            </p>
            {!searchQuery && filter === 'all' && (
              <p className="text-xs mt-1.5 text-slate-400">아래 마이크 버튼을 눌러 추가하세요</p>
            )}
          </div>
        ) : (
          displayTodos.map((todo) => <TodoItem key={todo.id} todo={todo} onVoiceEdit={onVoiceEdit} onComplete={onComplete} />)
        )}
      </div>
    </div>
  )
}

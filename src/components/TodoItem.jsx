import { useState } from 'react'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useTodoStore } from '../store/todoStore'

const PRIORITY = {
  high:   { label: '높음', dot: 'bg-rose-500',    text: 'text-rose-600',    border: 'border-l-rose-400' },
  medium: { label: '보통', dot: 'bg-amber-400',   text: 'text-amber-600',   border: 'border-l-amber-300' },
  low:    { label: '낮음', dot: 'bg-emerald-400', text: 'text-emerald-600',  border: 'border-l-emerald-300' },
}

export default function TodoItem({ todo, onVoiceEdit, onComplete }) {
  const { toggleComplete, deleteTodo, updateTodo } = useTodoStore()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(todo.content)

  const p = PRIORITY[todo.priority] || PRIORITY.medium
  const isOverdue = todo.deadline && !todo.is_completed && isPast(parseISO(todo.deadline + 'T23:59:59'))
  const isDueToday = todo.deadline && isToday(parseISO(todo.deadline))

  const handleDelete = () => {
    if (showConfirm) { deleteTodo(todo.id) }
    else { setShowConfirm(true); setTimeout(() => setShowConfirm(false), 3000) }
  }

  const handleEditSave = async () => {
    const content = editContent.trim()
    if (content && content !== todo.content) await updateTodo(todo.id, { content })
    setIsEditing(false)
  }

  const handleEditCancel = () => {
    setEditContent(todo.content)
    setIsEditing(false)
  }

  const leftBorder = isOverdue ? 'border-l-red-500' : isDueToday ? 'border-l-amber-500' : p.border

  return (
    <div className={`
      bg-white rounded-xl border-l-[3px] ${leftBorder}
      transition-all duration-200 animate-fade-in
      ${todo.is_completed
        ? 'opacity-50 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
        : 'shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]'
      }
    `}>
      <div className="px-4 py-3.5 flex items-start gap-3">

        {/* 완료 체크 */}
        <button
          onClick={() => { toggleComplete(todo.id); if (!todo.is_completed) onComplete?.('완료'); else onComplete?.('복원') }}
          className={`
            mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
            transition-all duration-200
            ${todo.is_completed
              ? 'bg-indigo-500 border-indigo-500'
              : 'border-slate-300 hover:border-indigo-400'
            }
          `}
          aria-label={todo.is_completed ? '완료 취소' : '완료'}
        >
          {todo.is_completed && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* 내용 */}
        <div
          className={`flex-1 min-w-0 ${!isEditing ? 'cursor-pointer' : ''}`}
          onClick={!isEditing ? () => onVoiceEdit?.(todo) : undefined}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave() }
                  if (e.key === 'Escape') handleEditCancel()
                }}
                rows={2}
                autoFocus
                className="w-full px-3 py-2 text-sm text-slate-800 bg-indigo-50 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditSave}
                  className="flex-1 py-1.5 text-xs bg-indigo-500 text-white rounded-lg font-semibold active:scale-95 transition-all"
                >
                  저장
                </button>
                <button
                  onClick={handleEditCancel}
                  className="flex-1 py-1.5 text-xs bg-slate-100 text-slate-500 rounded-lg font-medium active:scale-95 transition-all"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className={`text-[15px] font-medium leading-snug break-words ${
                todo.is_completed ? 'line-through text-slate-400' : 'text-slate-800'
              }`}>
                {todo.content}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                <span className={`flex items-center gap-1 text-[13.5px] font-semibold ${p.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${p.dot} flex-shrink-0`} />
                  {p.label}
                </span>

                {todo.deadline && (
                  <span className={`flex items-center gap-1 text-[13.5px] font-medium ${
                    isOverdue ? 'text-red-500' : isDueToday ? 'text-amber-600' : 'text-slate-400'
                  }`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {isOverdue ? '마감 초과 · ' : isDueToday ? '오늘 마감 · ' : ''}
                    {format(parseISO(todo.deadline), 'M/d (E)', { locale: ko })}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* 액션 버튼 */}
        {!isEditing && (
          <div className="flex items-center gap-0 flex-shrink-0 ml-auto -mr-2">
            <button
              onClick={() => { setEditContent(todo.content); setIsEditing(true) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors"
              aria-label="수정"
            >
              <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            <button
              onClick={handleDelete}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                showConfirm ? 'bg-red-500 text-white' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
              }`}
              aria-label={showConfirm ? '삭제 확인' : '삭제'}
            >
              {showConfirm ? (
                <svg className="w-[19px] h-[19px]" fill="none" viewBox="0 0 24 24">
                  <path d="M5 13l4 4L19 7" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="w-[19px] h-[19px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {showConfirm && (
        <p className="px-4 pb-2.5 text-[11px] text-red-400 text-right">한 번 더 누르면 삭제됩니다</p>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { usePushNotification } from '../hooks/usePushNotification'
import { useTodoStore } from '../store/todoStore'
import { supabase } from '../lib/supabase'

// 07:00 ~ 22:30, 30분 간격
function buildTimeOptions() {
  const options = []
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const value = `${hh}:${mm}`
      const period = h < 12 ? '오전' : '오후'
      const displayH = h <= 12 ? h : h - 12
      const label = m === 0 ? `${period} ${displayH}시` : `${period} ${displayH}시 30분`
      options.push({ value, label })
    }
  }
  return options
}

const TIME_OPTIONS = buildTimeOptions()

export default function NotificationSetup({ onClose }) {
  const { username, userId } = useTodoStore()
  const { isSupported, permission, isSubscribed, error, subscribe, unsubscribe } = usePushNotification()
  const [notifyTime, setNotifyTime] = useState('13:30')
  const [saving, setSaving] = useState(false)

  // 현재 저장된 알림 시간 불러오기
  useEffect(() => {
    if (!userId) return
    supabase
      .from('users')
      .select('notify_time')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.notify_time) setNotifyTime(data.notify_time)
      })
  }, [userId])

  const handleTimeChange = useCallback(async (value) => {
    setNotifyTime(value)
    setSaving(true)
    await supabase
      .from('users')
      .update({ notify_time: value })
      .eq('id', userId)
    setSaving(false)
  }, [userId])

  if (!isSupported) {
    return (
      <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">푸쉬 알림 미지원</p>
          <p className="text-xs text-amber-600 mt-0.5">iOS는 홈 화면에 추가 후 앱 모드에서 사용하세요 (iOS 16.4+)</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-amber-400 hover:text-amber-600 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  if (isSubscribed) {
    const currentLabel = TIME_OPTIONS.find(o => o.value === notifyTime)?.label ?? notifyTime
    return (
      <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="flex-1 text-sm font-medium text-emerald-700">마감일 알림 설정됨</p>
          <button
            onClick={() => unsubscribe(username)}
            className="text-xs text-emerald-600 hover:text-red-500 transition-colors font-medium"
          >
            해제
          </button>
          {onClose && (
            <button onClick={onClose} className="text-emerald-300 hover:text-emerald-500 ml-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 알림 시간 설정 */}
        <div className="bg-white/70 rounded-xl px-3 py-2.5 flex items-center gap-3">
          <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-slate-600 flex-1">알림 시간</span>
          <div className="relative">
            <select
              value={notifyTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="text-xs font-semibold text-emerald-700 bg-transparent pr-5 appearance-none focus:outline-none cursor-pointer"
            >
              {TIME_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <svg className="w-3 h-3 text-emerald-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {saving && <span className="text-[10px] text-emerald-400">저장 중...</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-indigo-900">마감일 알림 받기</p>
          <p className="text-xs text-indigo-600 mt-0.5">오늘 마감 업무를 지정한 시간에 알려드립니다</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-indigo-300 hover:text-indigo-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 알림 시간 선택 (구독 전 미리 설정) */}
      <div className="bg-white/70 rounded-xl px-3 py-2.5 flex items-center gap-3">
        <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-slate-600 flex-1">알림 시간</span>
        <div className="relative">
          <select
            value={notifyTime}
            onChange={(e) => setNotifyTime(e.target.value)}
            className="text-xs font-semibold text-indigo-700 bg-transparent pr-5 appearance-none focus:outline-none cursor-pointer"
          >
            {TIME_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <svg className="w-3 h-3 text-indigo-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

      <div className="bg-white/70 rounded-xl p-3 text-xs text-slate-600 space-y-0.5">
        <p className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide">iOS 안내</p>
        <p>Safari → 공유 → 홈 화면에 추가 후 앱 모드로 실행 필요</p>
      </div>

      <button
        onClick={() => subscribe(username, notifyTime)}
        className="w-full py-3 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 active:scale-95 transition-all shadow-sm"
      >
        알림 허용
      </button>
    </div>
  )
}

export default function VoiceButton({ isListening, onClick, disabled }) {
  return (
    <div className="relative flex items-center justify-center">
      {isListening && (
        <>
          <div className="absolute w-20 h-20 rounded-full bg-rose-400/20 animate-ping" />
          <div className="absolute w-24 h-24 rounded-full bg-rose-400/10 animate-pulse" />
        </>
      )}

      <button
        onClick={onClick}
        disabled={disabled}
        className={`
          relative z-10 w-16 h-16 rounded-full flex items-center justify-center
          transition-all duration-200 active:scale-90
          ${isListening
            ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_8px_24px_-4px_rgba(244,63,94,0.55)]'
            : 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_8px_24px_-4px_rgba(99,102,241,0.55)]'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-label={isListening ? '음성 인식 중지' : '음성 인식 시작'}
      >
        {isListening ? (
          <div className="flex items-center gap-[3px] h-6 px-1">
            {['animate-wave-1','animate-wave-2','animate-wave-3','animate-wave-4','animate-wave-5'].map((anim) => (
              <span
                key={anim}
                className={`block w-[3px] h-full bg-white/90 rounded-full origin-center ${anim}`}
              />
            ))}
          </div>
        ) : (
          <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
            <path
              d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"
              stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}

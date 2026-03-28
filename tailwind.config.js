/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.25)' },
        },
        ripple: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'ripple-delay': {
          '0%': { transform: 'scale(1)', opacity: '0.4' },
          '100%': { transform: 'scale(2.0)', opacity: '0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'dot-pulse': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'float': 'float 3.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3.5s ease-in-out infinite',
        'ripple': 'ripple 2.4s ease-out infinite',
        'ripple-delay': 'ripple-delay 2.4s ease-out infinite 1.2s',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'fade-up-1': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both',
        'fade-up-2': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s both',
        'fade-up-3': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.4s both',
        'wave-1': 'wave 0.85s ease-in-out infinite',
        'wave-2': 'wave 0.85s ease-in-out infinite 0.12s',
        'wave-3': 'wave 0.85s ease-in-out infinite 0.24s',
        'wave-4': 'wave 0.85s ease-in-out infinite 0.36s',
        'wave-5': 'wave 0.85s ease-in-out infinite 0.48s',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.32,0.72,0,1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'dot-1': 'dot-pulse 1.2s ease-in-out infinite',
        'dot-2': 'dot-pulse 1.2s ease-in-out infinite 0.4s',
        'dot-3': 'dot-pulse 1.2s ease-in-out infinite 0.8s',
      },
    },
  },
  plugins: [],
}

# VoiceDo — Claude Code 프로젝트 지침서

## 프로젝트 개요
음성으로 할일을 실시간 입력하고, 팀원별 데이터를 Supabase에 저장·관리하는 모바일 웹 앱.
- 플랫폼: Mobile-first PWA (iOS Safari / Android Chrome)
- 인증: 사용자명(닉네임) 입력 방식 (별도 로그인 없음)
- 음성: Web Speech API (브라우저 내장, 무료, 실시간)
- 알림: 데드라인 당일 오후 1시 30분 KST 미완료 업무 푸쉬 알림

---

## 기술 스택

### 프론트엔드
| 구분 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | React 18 + Vite | 컴포넌트 기반, 빠른 빌드 |
| 스타일링 | Tailwind CSS v3 | 모바일 우선 유틸리티 클래스 |
| PWA | vite-plugin-pwa | Service Worker 자동 생성 |
| 상태관리 | Zustand | 경량 상태관리, 로컬 캐싱 |
| 날짜처리 | date-fns | 데드라인 계산, 알림 시각 산출 |

### 백엔드 / 인프라
| 구분 | 서비스 | 비고 |
|------|--------|------|
| DB | Supabase PostgreSQL | REST API + Realtime |
| 푸쉬 알림 | Supabase Edge Function + Web Push | VAPID 키 방식, Deno 런타임 |
| 스케줄러 | pg_cron (Supabase) | 매일 04:30 UTC → 알림 트리거 |
| 호스팅 | Vercel 또는 Netlify | HTTPS 필수 (Service Worker 요건) |

---

## 환경 변수

### 로컬 (.env)
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_VAPID_PUBLIC_KEY=BH...
```

### Supabase Secrets (Edge Function용)
```
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:admin@example.com
```

VAPID 키 생성 명령어:
```bash
npx web-push generate-vapid-keys
```

---

## 디렉토리 구조

```
voicedo/
├── public/
│   ├── sw.js                      # Service Worker (푸쉬 수신)
│   └── icons/                     # PWA 아이콘 (192x192, 512x512)
├── src/
│   ├── components/
│   │   ├── VoiceButton.jsx        # 마이크 버튼 + 파형 애니메이션
│   │   ├── TodoItem.jsx           # 할일 카드 (완료/삭제/편집)
│   │   ├── TodoList.jsx           # 목록 렌더링
│   │   ├── DeadlinePicker.jsx     # 날짜 선택 UI
│   │   └── NotificationSetup.jsx  # 푸쉬 권한 요청 배너
│   ├── hooks/
│   │   ├── useSpeechRecognition.js  # Web Speech API 래퍼
│   │   └── usePushNotification.js   # 구독 관리
│   ├── lib/
│   │   └── supabase.js            # Supabase 클라이언트
│   ├── store/
│   │   └── todoStore.js           # Zustand 상태
│   └── App.jsx
├── supabase/
│   ├── schema.sql                 # 테이블 + RLS 정책
│   └── functions/
│       └── send-reminders/
│           └── index.ts           # Edge Function (푸쉬 발송)
├── CLAUDE.md
├── .env
└── .env.example
```

---

## Supabase 데이터베이스 스키마

### users 테이블
```sql
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         text UNIQUE NOT NULL,
  push_subscription jsonb,
  created_at       timestamptz DEFAULT now()
);
```

### todos 테이블
```sql
CREATE TABLE todos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  username     text NOT NULL,
  content      text NOT NULL,
  deadline     date,
  is_completed boolean DEFAULT false,
  priority     text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  created_at   timestamptz DEFAULT now(),
  notified_at  timestamptz
);
```

### RLS 정책
```sql
-- RLS 활성화
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- todos: username 기반 격리
CREATE POLICY "user_isolation" ON todos
  USING (username = current_setting('app.username', true));

-- users: 본인 레코드만 접근
CREATE POLICY "user_self" ON users
  USING (username = current_setting('app.username', true));
```

---

## 푸쉬 알림 아키텍처

### 발송 흐름
1. 브라우저: `Notification.requestPermission()` 요청 (사용자 버튼 클릭 시)
2. 브라우저: `pushManager.subscribe({ applicationServerKey: VAPID 공개키 })` 구독
3. 앱 → Supabase: `push_subscription` JSON을 users 테이블에 저장
4. pg_cron: 매일 04:30 UTC (한국 13:30 KST) → Edge Function 호출
5. Edge Function: `deadline = TODAY AND is_completed = false AND notified_at IS NULL` 조회
6. Edge Function: web-push로 각 사용자에게 푸쉬 발송
7. Service Worker: push 이벤트 수신 → `showNotification()` 표시

### pg_cron 등록 SQL
```sql
SELECT cron.schedule(
  'send-deadline-reminders',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://xxxx.supabase.co/functions/v1/send-reminders',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Edge Function 구조 (send-reminders/index.ts)
```typescript
import { createClient } from "@supabase/supabase-js"
import webpush from "npm:web-push"

webpush.setVapidDetails(
  Deno.env.get("VAPID_EMAIL")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
)

const today = new Date().toISOString().split("T")[0]

// 오늘 마감 & 미완료 todos 조회
const { data: todos } = await supabase
  .from("todos")
  .select("*, users(push_subscription)")
  .eq("deadline", today)
  .eq("is_completed", false)
  .is("notified_at", null)

// 사용자별 그룹핑 후 푸쉬 발송
for (const [userId, items] of grouped) {
  await webpush.sendNotification(subscription, JSON.stringify({
    title: "VoiceDo 마감 알림",
    body: `오늘 마감 ${items.length}개 업무가 남아있어요!`
  }))
  // notified_at 업데이트 (중복 방지)
  await supabase.from("todos")
    .update({ notified_at: new Date().toISOString() })
    .in("id", items.map(i => i.id))
}
```

### Service Worker (public/sw.js)
```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "VoiceDo", {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: "/" }
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

---

## 핵심 구현 포인트 & 주의사항

| 항목 | 지침 |
|------|------|
| Web Speech API | `typeof window.SpeechRecognition === 'undefined'` 체크 후 텍스트 입력 fallback 렌더링 |
| iOS Safari 음성 | 반드시 user gesture(터치) 이벤트 내에서 `.start()` 호출 — 자동 시작 불가 |
| iOS 푸쉬 알림 | iOS 16.4+ PWA 모드(홈 화면 추가)에서만 동작 — 앱 첫 실행 시 설치 안내 배너 표시 필수 |
| PWA manifest | `display: standalone`, `start_url: /`, `theme_color`, 아이콘 192×192 & 512×512 필수 |
| VAPID 공개키 | `pushManager.subscribe`의 `applicationServerKey`는 `urlBase64ToUint8Array()` 변환 후 전달 |
| 알림 권한 타이밍 | 앱 시작 즉시 요청 금지 — 사용자가 알림 설정 버튼 클릭 시 요청 |
| Supabase RLS | anon key 사용 시 RLS 필수 활성화. `set_config`로 `app.username` 전달 또는 username 컬럼 직접 필터 |
| 오프라인 지원 | Service Worker로 assets 캐싱. 오프라인 시 Zustand에 저장 → 온라인 복귀 시 Supabase sync |
| HTTPS 필수 | Service Worker & Push API 모두 보안 출처 요구. 로컬 개발은 localhost 허용 |

---

## 화면 플로우

| 화면 | 기능 |
|------|------|
| ① 이름 입력 | 사용자명 입력 → localStorage 저장 → Supabase users upsert |
| ② 메인 (할일 목록) | 음성 버튼, 할일 카드 리스트, 필터(전체/오늘/완료) |
| ③ 음성 입력 모달 | 마이크 활성화 → 실시간 텍스트 표시 → 데드라인 선택 → 저장 |
| ④ 알림 설정 | 푸쉬 권한 요청 → 구독 → Supabase 저장 |

---

## 개발 순서 (단계별 진행)

1. **Vite + React PWA 프로젝트 스캐폴딩**
   ```bash
   npm create vite@latest voicedo -- --template react
   cd voicedo
   npm install
   npm install @supabase/supabase-js zustand date-fns
   npm install -D tailwindcss vite-plugin-pwa
   ```

2. **Supabase 테이블 SQL 및 RLS 정책** (`supabase/schema.sql` 작성 후 대시보드 SQL Editor에서 실행)

3. **`useSpeechRecognition` 훅** (연속 인식, 한국어, fallback 포함)

4. **Supabase CRUD 함수** (todos 테이블 — 생성/조회/완료/삭제)

5. **DeadlinePicker 컴포넌트** + 음성→저장 플로우

6. **`usePushNotification` 훅** + `public/sw.js` Service Worker

7. **Edge Function** (`supabase/functions/send-reminders/index.ts`)

8. **pg_cron 잡 등록 SQL** (Supabase SQL Editor에서 실행)

9. **모바일 UI 통합** + PWA 빌드 검증 (`npm run build && npm run preview`)

10. **Vercel 배포** (환경 변수 등록 후 `vercel --prod`)

---

## 브라우저 호환성

| 기능 | iOS Safari | Android Chrome | 비고 |
|------|-----------|----------------|------|
| Web Speech API | ✅ 14.5+ | ✅ | iOS: 터치 이벤트 내 호출 필수 |
| Web Push | ✅ 16.4+ | ✅ | iOS: PWA 모드에서만 동작 |
| Service Worker | ✅ | ✅ | HTTPS 필수 |
| Web Speech (Firefox) | ❌ | ❌ | 텍스트 입력 fallback 제공 |

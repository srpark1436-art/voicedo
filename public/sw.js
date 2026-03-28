// VoiceDo Service Worker
// Workbox가 빌드 시 이 배열에 자동으로 에셋 목록을 주입합니다
const PRECACHE_MANIFEST = self.__WB_MANIFEST || []
// 캐시 이름 — precache 목록 길이로 자동 버전 관리 (코드 변경 시 갱신)
const CACHE_NAME = 'voicedo-v' + PRECACHE_MANIFEST.length

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  ...PRECACHE_MANIFEST.map((entry) => entry.url),
]

// 설치: 핵심 에셋 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  )
  self.skipWaiting()
})

// 활성화: 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

// Fetch: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// 푸쉬 알림 수신
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'VoiceDo', {
      body: data.body ?? '마감 업무가 있어요!',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [200, 100, 200],
      data: { url: '/' },
      actions: [
        { action: 'open', title: '앱 열기' },
        { action: 'close', title: '닫기' },
      ],
    })
  )
})

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data?.url ?? '/')
      }
    })
  )
})

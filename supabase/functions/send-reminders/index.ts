import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// @ts-ignore
import webpush from "npm:web-push"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

webpush.setVapidDetails(
  Deno.env.get("VAPID_EMAIL")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
)

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // 현재 KST 시각 (UTC+9)
    const nowUtc = new Date()
    const kstOffset = 9 * 60
    const kstMs = nowUtc.getTime() + kstOffset * 60 * 1000
    const kst = new Date(kstMs)
    const currentHH = String(kst.getUTCHours()).padStart(2, "0")
    const currentMM = kst.getUTCMinutes() < 30 ? "00" : "30"
    const currentTime = `${currentHH}:${currentMM}` // e.g. "13:30"

    const today = nowUtc.toISOString().split("T")[0]

    // 오늘 마감 & 미완료 & 알림 시간이 현재 시각인 사용자 필터
    const { data: todos, error } = await supabase
      .from("todos")
      .select("*, users!inner(push_subscription, notify_time)")
      .eq("deadline", today)
      .eq("is_completed", false)
      .is("notified_at", null)
      .eq("users.notify_time", currentTime)

    if (error) throw error
    if (!todos || todos.length === 0) {
      return new Response(JSON.stringify({ message: `알림 대상 없음 (${currentTime} KST)` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 사용자별 그룹핑
    const grouped = new Map<string, typeof todos>()
    for (const todo of todos) {
      const key = todo.user_id
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(todo)
    }

    const results: string[] = []

    for (const [, items] of grouped) {
      const subscription = items[0]?.users?.push_subscription
      if (!subscription) continue

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title: "VoiceDo 마감 알림",
            body: `오늘 마감 ${items.length}개 업무가 남아있어요!`,
          })
        )

        await supabase
          .from("todos")
          .update({ notified_at: new Date().toISOString() })
          .in("id", items.map((i) => i.id))

        results.push(`발송 완료: ${items[0].username} (${items.length}개)`)
      } catch (pushError) {
        results.push(`발송 실패: ${items[0].username} - ${pushError}`)
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

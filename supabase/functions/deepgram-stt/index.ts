const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get("DEEPGRAM_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "DEEPGRAM_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 클라이언트에서 audio blob을 직접 POST body로 전달
    const contentType = req.headers.get("content-type") || "audio/webm"
    const audioBody = await req.arrayBuffer()

    if (!audioBody || audioBody.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "No audio data received" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Deepgram Nova-2 REST API 호출
    const dgUrl = new URL("https://api.deepgram.com/v1/listen")
    dgUrl.searchParams.set("model", "nova-2")
    dgUrl.searchParams.set("language", "ko")
    dgUrl.searchParams.set("smart_format", "true")
    dgUrl.searchParams.set("punctuate", "true")

    const dgRes = await fetch(dgUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: audioBody,
    })

    if (!dgRes.ok) {
      const errText = await dgRes.text()
      return new Response(
        JSON.stringify({ error: `Deepgram error: ${dgRes.status} ${errText}` }),
        { status: dgRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const dgData = await dgRes.json()
    const transcript =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ""

    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

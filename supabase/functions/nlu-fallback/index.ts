import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { nluSchema, nluSystemPrompt } from "../../shared/nluSchema.ts"

// Basic CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transcript, language } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from environment variables")
    }

    if (!transcript) {
      throw new Error("Missing 'transcript' in request body")
    }

    // Call Gemini API using standard fetch
    // Using gemini-1.5-pro since it supports structured outputs natively via responseSchema
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`
    
    const payload = {
      system_instruction: {
        parts: [{ text: nluSystemPrompt }]
      },
      contents: [{
        parts: [{ text: `Parse this utterance: "${transcript}". Detected language: ${language || 'en'}` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: nluSchema
      }
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error("Gemini API error:", errorText)
      throw new Error("Gemini API call failed")
    }

    const data = await res.json()
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!resultText) {
      throw new Error("No content returned from Gemini")
    }

    const parsedData = JSON.parse(resultText)

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("Error in nlu-fallback:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

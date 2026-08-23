// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { history } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from environment variables")
    }

    if (!history || !Array.isArray(history)) {
      throw new Error("Missing or invalid 'history' array in request body")
    }

    const systemPrompt = `You are a smart shopping assistant.
The user wants suggestions for what they should add to their shopping list.
You will be provided with their recent purchase history.
Look at the items they have bought recently and suggest 3 to 5 items they might be running low on or might want to buy.
Do NOT suggest items that they just bought today. Suggest common staples if their history is empty.
Return a structured JSON list of suggestions.
Output format exactly like this:
{
  "suggestions": [
    {"item_name": "milk", "reason": "You usually buy milk frequently."},
    {"item_name": "bread", "reason": "A common staple you might need."}
  ]
}
`;

    // Using gemini-3.5-flash since it supports structured outputs
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`
    
    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: `User purchase history: ${JSON.stringify(history)}. Generate suggestions.` }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
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
      throw new Error(`Gemini API call failed: ${errorText}`)
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
    const err = error as Error;
    console.error("Error in suggest-items:", err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

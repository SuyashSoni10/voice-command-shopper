export interface NluResult {
  intent: string;
  entities: {
    item_name?: string | null;
    quantity?: number | null;
    unit?: string | null;
    brand?: string | null;
    price_min?: number | null;
    price_max?: number | null;
  };
  confidence: number;
  detected_language: string;
}

export function parseFastPath(transcript: string, language: string): NluResult | null {
  // Fast path currently only targets English. 
  // Other languages immediately fall back to the LLM.
  if (!language.startsWith('en')) {
    return null;
  }

  const normalized = transcript.toLowerCase().trim().replace(/[.,!]/g, '');

  // 1. Clear list
  if (['clear my list', 'clear list', 'start over'].includes(normalized)) {
    return {
      intent: 'CLEAR_LIST',
      entities: {},
      confidence: 1.0,
      detected_language: language,
    };
  }

  // 2. Remove simple item
  // Matches "remove milk", "take off milk", "remove milk from my list"
  const removeMatch = normalized.match(/^(?:remove|delete|take off) (.*?)(?: from my list)?$/);
  if (removeMatch && removeMatch[1]) {
    const itemStr = removeMatch[1];
    
    // Safety check: if it contains conjunctions or is too long, fallback to LLM
    if (itemStr.includes(' and ') || itemStr.includes(' or ') || itemStr.includes(' put ') || itemStr.length > 30) {
      return null;
    }

    return {
      intent: 'REMOVE_ITEM',
      entities: { item_name: itemStr },
      confidence: 1.0,
      detected_language: language,
    };
  }

  // 3. Add simple item with optional quantity
  // Matches "add 5 apples", "buy milk", "get 2 bottles of water"
  const addMatch = normalized.match(/^(?:add|buy|get|i need) (?:(\d+)\s+)?(?:(bottles? of|cans? of|boxes? of|gallons? of|packs? of|bags? of|liters? of|grams? of|kg? of)\s+)?(.*?)$/);
  if (addMatch && addMatch[3]) {
    const qtyStr = addMatch[1];
    const unitStr = addMatch[2];
    const itemStr = addMatch[3];
    
    // Safety check - if it's too complex or has "under", "cheap" (search intents), fallback
    if (itemStr.includes('under') || itemStr.includes('find') || itemStr.includes(' and ') || itemStr.length > 30) {
      return null;
    }

    return {
      intent: 'ADD_ITEM',
      entities: {
        item_name: itemStr,
        quantity: qtyStr ? parseInt(qtyStr, 10) : 1,
        unit: unitStr ? unitStr.replace(' of', '').trim() : null,
      },
      confidence: 1.0,
      detected_language: language,
    };
  }

  // 4. Suggestions
  if (['what am i running low on', 'any suggestions', 'suggestions', 'what should i buy'].includes(normalized)) {
    return {
      intent: 'GET_SUGGESTIONS',
      entities: {},
      confidence: 1.0,
      detected_language: language,
    };
  }

  // If no fast-path rule matched perfectly, return null to trigger LLM fallback
  return null;
}

export async function processCommand(transcript: string, language: string, supabaseUrl: string, supabaseKey: string): Promise<NluResult> {
  // 1. Fast path (regex/keyword)
  const fastResult = parseFastPath(transcript, language);
  if (fastResult) {
    console.log('[NLU] Fast-path matched:', fastResult);
    return fastResult;
  }

  console.log('[NLU] Fast-path missed, falling back to Gemini Edge Function...');

  // 2. LLM Fallback via Supabase Edge Function
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/nlu-fallback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}` // Uses Anon Key for invoking
      },
      body: JSON.stringify({ transcript, language })
    });

    if (!response.ok) {
      throw new Error(`Edge function returned ${response.status}`);
    }

    const data: NluResult = await response.json();
    console.log('[NLU] Gemini Fallback parsed:', data);
    return data;
  } catch (error) {
    console.error('[NLU] Fallback failed:', error);
    // If the network or API fails, return a safe fallback rather than crashing
    return {
      intent: 'UNKNOWN',
      entities: {},
      confidence: 0,
      detected_language: language
    };
  }
}

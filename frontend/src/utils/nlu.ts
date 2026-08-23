// ─── Shared NLU types (frontend-side, mirrors nluSchema.ts) ───

export interface NluAction {
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
}

export interface NluResponse {
  actions: NluAction[];
  detected_language: string;
}

/** Lightweight representation of a list item for LLM context */
interface ListContext {
  name: string;
  quantity?: number;
  unit?: string;
}

export function parseFastPath(transcript: string, language: string): NluResponse | null {
  // Fast path currently only targets English. 
  // Other languages immediately fall back to the LLM.
  if (!language.startsWith('en')) {
    return null;
  }

  const normalized = transcript.toLowerCase().trim().replace(/[.,!]/g, '');

  // 1. Clear list
  if (normalized.includes('clear my list') || 
      normalized.includes('clear list') || 
      normalized.includes('clear the list') || 
      normalized.includes('start over') || 
      normalized.includes('delete everything')) {
    return {
      actions: [{ intent: 'CLEAR_LIST', entities: {}, confidence: 1.0 }],
      detected_language: language,
    };
  }

  // 2. Remove simple item
  // Matches "remove milk", "take off milk", "please remove milk from my list"
  const removeMatch = normalized.match(/^(?:(?:can you |please |i want to |i need to )?(?:remove|delete|take off|drop)) (.*?)(?: from my list)?$/);
  if (removeMatch && removeMatch[1]) {
    const itemStr = removeMatch[1];
    
    // Safety check: if it contains conjunctions, numbers (digits or words), or is too long, fallback to LLM
    const numberWords = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'half', 'dozen', 'couple', 'some'];
    if (itemStr.includes(' and ') || itemStr.includes(' or ') || itemStr.includes(' put ') || /\d/.test(itemStr) || numberWords.some(w => itemStr.toLowerCase().includes(w)) || itemStr.length > 30) {
      return null;
    }

    return {
      actions: [{ intent: 'REMOVE_ITEM', entities: { item_name: itemStr }, confidence: 1.0 }],
      detected_language: language,
    };
  }

  // 3. Add simple item with optional quantity
  // Matches "add 5 apples", "buy milk", "i want to buy apples", "please add water"
  const addMatch = normalized.match(/^(?:(?:i want to |i need to |can you |please )?(?:add|buy|get)|i need|i want) (?:(\d+)\s+)?(?:(bottles? of|cans? of|boxes? of|gallons? of|packs? of|bags? of|liters? of|grams? of|kg? of)\s+)?(.*?)$/);
  if (addMatch && addMatch[3]) {
    const qtyStr = addMatch[1];
    const unitStr = addMatch[2];
    const itemStr = addMatch[3];
    
    // Safety check - if it's too complex, has multiple items, or fractional phrases, fallback
    const fallbackKeywords = ['under', 'find', ' and ', ' or ', 'half', 'dozen', 'couple', 'some'];
    if (fallbackKeywords.some(kw => itemStr.includes(kw)) || itemStr.length > 30 || itemStr.split(' ').length > 3) {
      return null;
    }

    return {
      actions: [{
        intent: 'ADD_ITEM',
        entities: {
          item_name: itemStr,
          quantity: qtyStr ? parseInt(qtyStr, 10) : (itemStr.endsWith('s') ? null : 1),
          unit: unitStr ? unitStr.replace(' of', '').trim() : null,
        },
        confidence: 1.0,
      }],
      detected_language: language,
    };
  }

  // 4. Suggestions
  if (normalized.includes('what am i running low on') || 
      normalized.includes('any suggestions') || 
      normalized === 'suggestions' || 
      normalized.includes('what should i buy') ||
      normalized.includes('what else do i need')) {
    return {
      actions: [{ intent: 'GET_SUGGESTIONS', entities: {}, confidence: 1.0 }],
      detected_language: language,
    };
  }

  // If no fast-path rule matched perfectly, return null to trigger LLM fallback
  return null;
}

export async function processCommand(
  transcript: string,
  language: string,
  supabaseUrl: string,
  supabaseKey: string,
  currentList: ListContext[] = []
): Promise<NluResponse> {
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
      body: JSON.stringify({ transcript, language, currentList })
    });

    if (!response.ok) {
      throw new Error(`Edge function returned ${response.status}`);
    }

    const data: NluResponse = await response.json();
    console.log('[NLU] Gemini Fallback parsed:', data);
    return data;
  } catch (error) {
    console.error('[NLU] Fallback failed:', error);
    // If the network or API fails, return a safe fallback rather than crashing
    return {
      actions: [{ intent: 'UNKNOWN', entities: {}, confidence: 0 }],
      detected_language: language
    };
  }
}

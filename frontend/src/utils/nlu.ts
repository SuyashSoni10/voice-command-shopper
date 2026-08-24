export interface NluAction {
  intent: string;
  entities: {
    item_name?: string | null;
    quantity?: number | null;
    unit?: string | null;
    brand?: string | null;
    category?: string | null;
    rejected?: boolean | null;
    rejection_reason?: string | null;
  };
  confidence: number;
}

export interface NluResponse {
  actions: NluAction[];
  detected_language: string;
}

interface ListContext {
  name: string;
  quantity?: number;
  unit?: string;
}

export async function processCommand(
  transcript: string,
  language: string,
  currentList: ListContext[] = []
): Promise<NluResponse> {
  console.log('[NLU] Sending command to Python backend...', { transcript, language });

  try {
    const response = await fetch('http://localhost:8000/api/nlu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, language, currentList }),
    });

    if (!response.ok) {
      throw new Error(`Python backend returned ${response.status}`);
    }

    const data: NluResponse = await response.json();
    console.log('[NLU] Python backend parsed:', data);
    return data;
  } catch (error) {
    console.error('[NLU] Backend failed:', error);
    return {
      actions: [{ intent: 'UNKNOWN', entities: {}, confidence: 0 }],
      detected_language: language,
    };
  }
}

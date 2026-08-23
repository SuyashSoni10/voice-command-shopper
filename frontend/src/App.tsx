import React, { useState } from 'react';
import './App.css';
import { VoiceInput } from './components/VoiceInput';
import { processCommand, type NluResult } from './utils/nlu';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function App() {
  const [lastCommand, setLastCommand] = useState<{ text: string; lang: string } | null>(null);
  const [nluResult, setNluResult] = useState<NluResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCommand = React.useCallback(async (command: string, language: string) => {
    setLastCommand({ text: command, lang: language });
    setIsProcessing(true);
    setNluResult(null);

    // Confidence gating: if confidence is low, handle it (Phase 4 will do actual CRUD)
    const result = await processCommand(command, language, SUPABASE_URL, SUPABASE_ANON_KEY);
    
    setNluResult(result);
    setIsProcessing(false);
  }, []);

  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1>🛒 Voice Shopping Assistant</h1>
        <p>Tap the microphone and say something like "Add milk" or "Find apples under $5".</p>
      </header>

      <section>
        <VoiceInput onCommand={handleCommand} />
      </section>

      {isProcessing && (
        <div style={{ marginTop: '20px', textAlign: 'center', fontStyle: 'italic', color: '#666' }}>
          🤔 Thinking... (Parsing intent)
        </div>
      )}

      {nluResult && !isProcessing && (
        <section style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>NLU Result:</h3>
          <p><strong>Intent:</strong> {nluResult.intent}</p>
          <p><strong>Entities:</strong></p>
          <pre style={{ backgroundColor: '#e0e0e0', padding: '10px', borderRadius: '4px', overflowX: 'auto' }}>
            {JSON.stringify(nluResult.entities, null, 2)}
          </pre>
          <p><strong>Confidence:</strong> {nluResult.confidence}</p>
          
          {nluResult.confidence < 0.6 && (
             <div style={{ padding: '10px', marginTop: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px' }}>
               Sorry, I didn't catch that — did you mean to add or remove something?
             </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;

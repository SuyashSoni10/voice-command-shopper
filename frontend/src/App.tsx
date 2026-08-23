import React, { useState } from 'react';
import './App.css';
import { VoiceInput } from './components/VoiceInput';
import { ShoppingList } from './components/ShoppingList';
import { processCommand, type NluResponse, type NluAction } from './utils/nlu';
import { useShoppingList } from './hooks/useShoppingList';
import { supabase } from './lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

interface Suggestion {
  item_name: string;
  reason: string;
}

function App() {
  const [lastCommand, setLastCommand] = useState<{ text: string; lang: string } | null>(null);
  const [nluResponse, setNluResponse] = useState<NluResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const { items, loading, error, addItem, removeItem, togglePurchased, clearList, checkoutPurchasedItems } = useShoppingList();

  /** Execute a single parsed NLU action against the database */
  const executeAction = async (action: NluAction): Promise<void> => {
    if (action.confidence < 0.6) return;

    switch (action.intent) {
      case 'ADD_ITEM':
        await addItem(action.entities as any);
        break;
      case 'REMOVE_ITEM':
        if (action.entities?.item_name) {
          await removeItem(action.entities.item_name as string, action.entities.quantity as number | undefined);
        }
        break;
      case 'UPDATE_QUANTITY':
        if (action.entities?.item_name && action.entities?.quantity != null) {
          // UPDATE_QUANTITY sets the quantity to an absolute value
          // We find the item and update it directly
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: matched } = await supabase
              .from('shopping_list_items')
              .select('id')
              .eq('user_id', user.id)
              .ilike('name', `%${action.entities.item_name}%`)
              .limit(1);

            if (matched && matched.length > 0) {
              await supabase
                .from('shopping_list_items')
                .update({ quantity: action.entities.quantity })
                .eq('id', matched[0].id);
            }
          }
        }
        break;
      case 'CLEAR_LIST':
        await clearList();
        break;
      case 'GET_SUGGESTIONS': {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: history } = await supabase
            .from('purchase_history')
            .select('item_name, added_at')
            .eq('user_id', user.id)
            .order('added_at', { ascending: false })
            .limit(20);
            
          const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-items`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ history: history || [] })
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.suggestions) {
              setSuggestions(data.suggestions);
            }
          } else {
            console.error("Failed to fetch suggestions", await res.text());
          }
        }
        break;
      }
    }
  };

  const handleCommand = React.useCallback(async (command: string, language: string) => {
    setLastCommand({ text: command, lang: language });
    setIsProcessing(true);
    setNluResponse(null);
    setSuggestions(null);

    // Build lightweight list context for the LLM
    const currentList = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    }));

    const result = await processCommand(command, language, SUPABASE_URL, SUPABASE_ANON_KEY, currentList);
    
    // Execute ALL actions sequentially
    if (result && result.actions && result.actions.length > 0) {
      try {
        for (const action of result.actions) {
          await executeAction(action);
        }
      } catch (e) {
        console.error("Failed to execute actions against DB:", e);
      }
    }
    
    setNluResponse(result);
    setIsProcessing(false);
  }, [addItem, removeItem, clearList, items]);

  return (
    <main style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1>🛒 Voice Shopping Assistant</h1>
        <p>Tap the microphone and say something like "Add milk" or "What should I buy?".</p>
      </header>

      <section>
        <VoiceInput onCommand={handleCommand} />
      </section>

      {lastCommand && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
          <strong>You said:</strong> "{lastCommand.text}"
        </div>
      )}

      {isProcessing && (
        <div style={{ marginTop: '20px', textAlign: 'center', fontStyle: 'italic', color: '#666' }}>
          🤔 Thinking...
        </div>
      )}

      {suggestions && (
        <section style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fdf3e5', borderRadius: '8px', border: '1px solid #ffcc80' }}>
          <h3 style={{ marginTop: 0, color: '#e65100' }}>💡 Suggestions</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {suggestions.map((sug, i) => (
              <li key={i} style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #ffe0b2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '18px' }}>{sug.item_name}</strong>
                    <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>{sug.reason}</p>
                  </div>
                  <button 
                    onClick={() => addItem({ item_name: sug.item_name })}
                    style={{ backgroundColor: '#ff9800', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: '30px' }}>
        <ShoppingList 
          items={items} 
          loading={loading} 
          error={error} 
          onToggle={togglePurchased} 
          onDelete={removeItem} 
          onCheckout={checkoutPurchasedItems}
        />
      </section>

      {/* Debug view for the NLU result - helpful during development */}
      {nluResponse && !isProcessing && (
        <section style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3>Debug: Last NLU Result ({nluResponse.actions.length} action{nluResponse.actions.length !== 1 ? 's' : ''})</h3>
          {nluResponse.actions.map((action, i) => (
            <div key={i} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
              <p><strong>Action {i + 1}:</strong> {action.intent}</p>
              <pre style={{ backgroundColor: '#e0e0e0', padding: '10px', borderRadius: '4px', overflowX: 'auto', margin: '5px 0' }}>
                {JSON.stringify(action.entities, null, 2)}
              </pre>
              <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>Confidence: {action.confidence}</p>
              
              {action.confidence < 0.6 && (
                <div style={{ padding: '10px', marginTop: '10px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px' }}>
                  Low confidence — skipped execution.
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default App;

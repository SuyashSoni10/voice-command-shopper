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
  const [debugOpen, setDebugOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { items, loading, error, addItem, removeItem, togglePurchased, clearList, checkoutPurchasedItems } = useShoppingList();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  /** Execute a single parsed NLU action against the database */
  const executeAction = async (action: NluAction): Promise<void> => {
    if (action.confidence < 0.6) return;

    switch (action.intent) {
      case 'ADD_ITEM':
        await addItem(action.entities as any);
        showToast(`Added ${action.entities.item_name}`);
        break;
      case 'REMOVE_ITEM':
        if (action.entities?.item_name) {
          await removeItem(action.entities.item_name as string, action.entities.quantity as number | undefined);
          showToast(`Removed ${action.entities.item_name}`);
        }
        break;
      case 'UPDATE_QUANTITY':
        if (action.entities?.item_name && action.entities?.quantity != null) {
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
              showToast(`Updated ${action.entities.item_name} → ${action.entities.quantity}`);
            }
          }
        }
        break;
      case 'CLEAR_LIST':
        await clearList();
        showToast('List cleared');
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

    const currentList = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    }));

    const result = await processCommand(command, language, SUPABASE_URL, SUPABASE_ANON_KEY, currentList);
    
    if (result && result.actions && result.actions.length > 0) {
      try {
        for (const action of result.actions) {
          await executeAction(action);
        }
      } catch (e) {
        console.error("Failed to execute actions:", e);
      }
    }
    
    setNluResponse(result);
    setIsProcessing(false);
  }, [addItem, removeItem, clearList, items]);

  return (
    <main className="app">
      <header className="header">
        <h1 className="header__title">
          <span className="header__title-icon">🛒</span>
          Voice Shopper
        </h1>
        <p className="header__subtitle">Speak to manage your shopping list</p>
      </header>

      <VoiceInput onCommand={handleCommand} isProcessing={isProcessing} />

      {lastCommand && (
        <div className="transcript">
          <span className="transcript__label">You said</span>
          "{lastCommand.text}"
        </div>
      )}

      {isProcessing && (
        <div className="processing">Processing...</div>
      )}

      {suggestions && (
        <section className="suggestions">
          <div className="suggestions__header">
            <span>💡</span> Suggestions
          </div>
          <ul className="suggestions__list">
            {suggestions.map((sug, i) => (
              <li key={i} className="suggestions__item">
                <div>
                  <div className="suggestions__item-name">{sug.item_name}</div>
                  <div className="suggestions__item-reason">{sug.reason}</div>
                </div>
                <button 
                  className="suggestions__add-btn"
                  onClick={() => addItem({ item_name: sug.item_name })}
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="list-section">
        <ShoppingList 
          items={items} 
          loading={loading} 
          error={error} 
          onToggle={togglePurchased} 
          onDelete={removeItem} 
          onCheckout={checkoutPurchasedItems}
        />
      </section>

      {nluResponse && !isProcessing && (
        <div className="debug">
          <button className="debug__toggle" onClick={() => setDebugOpen(!debugOpen)}>
            Debug ({nluResponse.actions.length} action{nluResponse.actions.length !== 1 ? 's' : ''})
            <span>{debugOpen ? '▲' : '▼'}</span>
          </button>
          {debugOpen && (
            <div className="debug__content">
              {nluResponse.actions.map((action, i) => (
                <div key={i} className="debug__action">
                  <div className="debug__intent">{action.intent}</div>
                  <pre className="debug__entities">{JSON.stringify(action.entities, null, 2)}</pre>
                  <div className="debug__confidence">Confidence: {action.confidence}</div>
                  {action.confidence < 0.6 && (
                    <div className="debug__low-conf">Low confidence — skipped.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

export default App;

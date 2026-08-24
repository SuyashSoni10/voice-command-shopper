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
  const [quantityPrompt, setQuantityPrompt] = useState<{ itemName: string, resolve: (qty: number | null) => void } | null>(null);
  const [confirmAbsurdPrompt, setConfirmAbsurdPrompt] = useState<{ itemName: string, resolve: (add: boolean) => void } | null>(null);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  const { items, loading, error, addItem, removeItem, togglePurchased, clearList, checkoutPurchasedItems } = useShoppingList();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  /** Execute a single parsed NLU action against the database */
  const executeAction = async (action: NluAction): Promise<void> => {
    if (action.confidence < 0.6) return;

    switch (action.intent) {
      case 'ADD_ITEM': {
        let qtyToAdd = action.entities.quantity;
        const itemName = action.entities.item_name;
        
        // 1. Catalog Validation for Absurd Inputs
        if (itemName) {
          const { data: catalogMatches } = await supabase
            .from('product_catalog')
            .select('id')
            .ilike('name', `%${itemName}%`)
            .limit(1);

          if (!catalogMatches || catalogMatches.length === 0) {
            const shouldAdd = await new Promise<boolean>((resolve) => {
              setConfirmAbsurdPrompt({ itemName, resolve });
            });
            setConfirmAbsurdPrompt(null);
            
            if (!shouldAdd) {
              showToast(`Cancelled adding ${itemName}`);
              break;
            }
          }
        }

        // 2. Quantity Resolution
        if (qtyToAdd == null && itemName) {
          qtyToAdd = await new Promise<number | null>((resolve) => {
            setQuantityPrompt({ itemName: action.entities.item_name!, resolve });
          });
          setQuantityPrompt(null);
        }

        if (qtyToAdd === null) {
          // User cancelled the prompt
          showToast(`Cancelled adding ${action.entities.item_name}`);
          break;
        }
        
        const finalEntities = { ...action.entities, quantity: qtyToAdd };
        await addItem(finalEntities as any);
        showToast(`Added ${finalEntities.item_name}`);
        break;
      }
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
      case 'GET_SUBSTITUTES': {
        const substituteFor = action.entities?.item_name;
        if (!substituteFor) break;
        const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ substitute_for: substituteFor })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions) {
            setSuggestions(data.suggestions);
          }
        }
        break;
      }
      case 'SEARCH_ITEM': {
        const { item_name, price_min, price_max, brand } = action.entities;
        
        let query = supabase.from('product_catalog').select('*');
        
        if (item_name) query = query.ilike('name', `%${item_name}%`);
        if (brand) query = query.ilike('brand', `%${brand}%`);
        if (price_min != null) query = query.gte('price', price_min);
        if (price_max != null) query = query.lte('price', price_max);
        
        const { data } = await query.limit(10);
        
        if (data && data.length > 0) {
          setSearchResults(data);
        } else {
          showToast(`No items found matching your search.`);
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

      {quantityPrompt && (
        <div className="qty-prompt-overlay">
          <div className="qty-prompt-modal">
            <button 
              className="qty-prompt-close" 
              onClick={() => quantityPrompt.resolve(null)}
              aria-label="Cancel"
            >
              ✕
            </button>
            <h3>How many {quantityPrompt.itemName}?</h3>
            <p>You didn't specify a quantity.</p>
            <div className="qty-prompt-buttons">
              {[1, 2, 6, 12].map(num => (
                <button key={num} onClick={() => quantityPrompt.resolve(num)}>
                  {num}
                </button>
              ))}
            </div>
            <form 
              className="qty-prompt-custom" 
              onSubmit={e => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('qty') as HTMLInputElement;
                const val = parseInt(input.value, 10);
                if (val > 0) quantityPrompt.resolve(val);
              }}
            >
              <input type="number" name="qty" placeholder="Custom" min="1" required />
              <button type="submit">Add</button>
            </form>
          </div>
        </div>
      )}

      {confirmAbsurdPrompt && (
        <div className="qty-prompt-overlay">
          <div className="qty-prompt-modal">
            <button 
              className="qty-prompt-close" 
              onClick={() => confirmAbsurdPrompt.resolve(false)}
              aria-label="Cancel"
            >
              ✕
            </button>
            <h3>Item not found!</h3>
            <p>I couldn't find <strong>"{confirmAbsurdPrompt.itemName}"</strong> in the store catalog. Are you sure you want to add this?</p>
            <div className="qty-prompt-buttons" style={{ marginTop: '1rem' }}>
              <button onClick={() => confirmAbsurdPrompt.resolve(false)} style={{ background: '#f87171' }}>No, cancel</button>
              <button onClick={() => confirmAbsurdPrompt.resolve(true)} style={{ background: 'var(--primary)' }}>Yes, add it</button>
            </div>
          </div>
        </div>
      )}

      {searchResults && (
        <div className="qty-prompt-overlay">
          <div className="qty-prompt-modal" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <button 
              className="qty-prompt-close" 
              onClick={() => setSearchResults(null)}
              aria-label="Close"
            >
              ✕
            </button>
            <h3>Search Results</h3>
            <ul className="suggestions__list" style={{ marginTop: '1rem' }}>
              {searchResults.map((prod) => (
                <li key={prod.id} className="suggestions__item">
                  <div>
                    <div className="suggestions__item-name" style={{ textTransform: 'capitalize' }}>{prod.name}</div>
                    <div className="suggestions__item-reason">${prod.price.toFixed(2)} • {prod.brand || 'Generic'}</div>
                  </div>
                  <button 
                    className="suggestions__add-btn"
                    onClick={() => {
                      addItem({ item_name: prod.name });
                      setSearchResults(null);
                      showToast(`Added ${prod.name}`);
                    }}
                  >
                    + Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
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

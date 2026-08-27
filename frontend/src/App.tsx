'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, CircleHelp, Mic, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'

type Item = { id: string | number; name: string; quantity: number; unit: string; category?: string; purchased_at?: string | null; added_at?: string }
type Toast = { id: number; message: string; tone: 'success' | 'error' }

function SuggestionRow({ suggestion, onAdd }: { suggestion: string, onAdd: (name: string, qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="suggestion-quick-add">
      <span className="suggestion-name">{suggestion}</span>
      <input type="number" min="1" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} className="suggestion-qty-input" />
      <button className="suggestion-add-button" onClick={() => onAdd(suggestion, qty)}>Add</button>
    </div>
  );
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const categoryOrder = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Other']

function formatQuantity(item: Item) {
  return `${item.quantity} ${item.unit || ''}`.trim();
}

const unitOptions = [
  { value: 'auto', label: 'Auto-detect unit' },
  { value: 'piece', label: 'pieces' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'l' },
  { value: 'ml', label: 'ml' },
  { value: 'bottle', label: 'bottles' },
  { value: 'pack', label: 'packs' },
  { value: 'box', label: 'boxes' },
  { value: 'can', label: 'cans' }
];

export default function Page() {
  const [items, setItems] = useState<Item[]>([])
  const [suggestions, setSuggestions] = useState<{ name: string, score: number }[]>([])
  const [itemSuggestions, setItemSuggestions] = useState<Record<string, string[]>>({})
  const [itemSuggestionsOpen, setItemSuggestionsOpen] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'offline'>('synced')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualQty, setManualQty] = useState('1')
  const [manualUnit, setManualUnit] = useState('auto')
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false)
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')
  const toastId = useRef(0)

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [itemsRes, suggestRes] = await Promise.all([
        fetch(`${API}/api/items`),
        fetch(`${API}/api/suggest`)
      ])

      if (!itemsRes.ok || !suggestRes.ok) throw new Error('Unable to load data')
      setItems(await itemsRes.json())
      setSuggestions(await suggestRes.json())
      setSyncStatus('synced')
    } catch {
      setSyncStatus('offline')
      notify('Could not connect to your shopping list.', 'error')
    } finally { setLoading(false) }
  }, [notify])

  useEffect(() => { refresh() }, [refresh])

  const grouped = useMemo(() => {
    const groups = new Map<string, Item[]>()
    items.forEach((item) => {
      const key = item.category || 'Other'
      groups.set(key, [...(groups.get(key) || []), item])
    })
    return [...groups.entries()].sort(([a], [b]) => (categoryOrder.indexOf(a) + 1 || 99) - (categoryOrder.indexOf(b) + 1 || 99))
  }, [items])

  const addItem = async (itemName: string, quantity: number, unit: string | null = null) => {
    const response = await fetch(`${API}/api/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: itemName, quantity, unit }) })
    if (!response.ok) throw new Error('Add failed')
    const data = await response.json()
    notify(`Added ${quantity} ${unit || ''} of ${itemName}`.trim().replace(/\s+/g, ' '))
    if (data.follow_ups && data.follow_ups.length > 0) {
      setItemSuggestions(prev => ({ ...prev, [data.item.id]: data.follow_ups }))
      setItemSuggestionsOpen(prev => ({ ...prev, [data.item.id]: true }))
    }
    await refresh()
  }

  const processTranscript = async (text: string) => {
    if (!text.trim()) return
    try {
      const response = await fetch(`${API}/api/nlu`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text, language: 'en' }) })
      if (!response.ok) throw new Error('Voice command failed')
      const result = await response.json()
      for (const action of result.actions || []) {
        const entity = action.entities || {}
        if (action.intent === 'ADD_ITEM') await addItem(entity.item_name, entity.quantity || 1, entity.unit || null)
        if (action.intent === 'REMOVE_ITEM') {
          await fetch(`${API}/api/items/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: entity.item_name, quantity: entity.quantity || null, unit: entity.unit || null }) })
          notify(`Removed ${entity.item_name}`); await refresh()
        }
        if (action.intent === 'UPDATE_ITEM') {
          await fetch(`${API}/api/items/update`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: entity.item_name, quantity: entity.quantity || 1, unit: entity.unit || null }) })
          notify(`Updated ${entity.item_name}`); await refresh()
        }
        if (action.intent === 'CLEAR_LIST') await clearList()
      }
    } catch { notify('I could not understand that command.', 'error') }
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { notify('Voice input is not supported in this browser.', 'error'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = true
    recognition.onstart = () => { setListening(true); setTranscript('Listening...'); transcriptRef.current = '' }
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results).map((result: any) => result[0].transcript).join('')
      setTranscript(text)
      transcriptRef.current = text
    }
    recognition.onerror = () => { setListening(false); setTranscript(''); notify('Microphone access was unavailable.', 'error') }
    recognition.onend = () => {
      setListening(false);
      const current = transcriptRef.current;
      if (current && current !== 'Listening...') {
        processTranscript(current);
      }
      transcriptRef.current = '';
    }
    recognitionRef.current = recognition; recognition.start()
  }

  const toggle = async (item: Item) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, purchased_at: entry.purchased_at ? null : new Date().toISOString() } : entry))
    try { await fetch(`${API}/api/items/${item.id}/toggle`, { method: 'PATCH' }) } catch { notify('Could not update item.', 'error'); refresh() }
  }

  const remove = async (item: Item) => {
    try { await fetch(`${API}/api/items/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: item.name, quantity: item.quantity, unit: item.unit }) }); notify(`Removed ${item.name}`); refresh() } catch { notify('Could not remove item.', 'error') }
  }

  async function clearList() {
    try { await fetch(`${API}/api/items/clear`, { method: 'DELETE' }); setItems([]); notify('Shopping list cleared') } catch { notify('Could not clear list.', 'error') }
  }

  const submitManual = async (event: React.FormEvent) => { event.preventDefault(); if (!manualName.trim()) return; try { await addItem(manualName.trim(), Number(manualQty) || 1, manualUnit === 'auto' ? null : manualUnit); setManualName(''); setManualQty('1'); setManualUnit('auto'); setManualOpen(false) } catch { notify('Could not add item.', 'error') } }

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar"><div className="brand"><div className="brand-mark"><Check size={18} strokeWidth={3} /></div><span>LISTEN<span className="brand-dot">.</span></span></div><div className="header-actions"><button className="icon-button" aria-label="More options" onClick={() => setAboutOpen(true)}><MoreHorizontal size={19} /></button><button className="clear-button" onClick={clearList}><Trash2 size={15} /> Clear list</button></div></header>
    <section className="content"><div className="eyebrow"><span className="eyebrow-line" /> YOUR SHOPPING LIST <span className="eyebrow-line" /></div><div className="title-row"><div><h1>Things to get</h1><p>{items.length} {items.length === 1 ? 'item' : 'items'} on your list <span className={`status-dot ${syncStatus}`} aria-label={syncStatus === 'synced' ? 'Synced' : 'Offline'} /> {syncStatus === 'synced' ? 'synced just now' : 'sync unavailable'}</p></div><button className="add-button" onClick={() => setManualOpen(true)}><Plus size={18} /> Add item</button></div>
      {suggestions.length > 0 && <div className="suggestions-track">
        {suggestions.map((s) => (
          <button key={s.name} className="suggestion-chip" onClick={() => addItem(s.name, 1)}>
            <Plus size={14} strokeWidth={2.5} /> {s.name}
          </button>
        ))}
      </div>}
      {loading ? <div className="empty-state"><div className="loader" />Loading your list...</div> : grouped.length === 0 ? <div className="empty-state"><div className="empty-icon"><Check size={24} /></div><h2>Your list is clear</h2><p>Tap the microphone and say what you need.</p></div> : <div className="list-groups">{grouped.map(([category, group]) => <section className="category" key={category}><div className="category-heading"><span>{category}</span><span className="category-count">{group.length}</span></div><div className="item-stack">{group.map((item) => <article className={`item-card ${item.purchased_at ? 'purchased' : ''}`} key={item.id}><div className="item-card-main"><button className="check-button" aria-label={`Mark ${item.name} ${item.purchased_at ? 'not purchased' : 'purchased'}`} onClick={() => toggle(item)}>{item.purchased_at && <Check size={15} strokeWidth={3} />}</button><div className="item-copy"><span className="item-name">{item.name}</span><span className="item-added">Added {item.added_at ? new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'today'}</span></div><span className="quantity-pill">{formatQuantity(item)}</span>{itemSuggestions[item.id] && <button className="icon-button" aria-label="Toggle suggestions" onClick={() => setItemSuggestionsOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}><ChevronDown size={18} style={{ transform: itemSuggestionsOpen[item.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /></button>}<button className="delete-button" aria-label={`Remove ${item.name}`} onClick={() => remove(item)}><Trash2 size={17} /></button></div>{itemSuggestions[item.id] && itemSuggestionsOpen[item.id] && <div className="item-suggestions-dropdown"><p className="suggestions-title">Suggested additions:</p><div className="suggestions-list">{itemSuggestions[item.id].map(suggestion => <SuggestionRow key={suggestion} suggestion={suggestion} onAdd={addItem} />)}</div></div>}</article>)}</div></section>)}</div>}
    </section>
    <div className="voice-dock"><div className={`transcript ${transcript ? 'visible' : ''}`}>{transcript || 'Tap to speak'}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', width: '100%', maxWidth: '320px', pointerEvents: 'none' }}><div /><button className={`mic-button ${listening ? 'is-listening' : ''}`} onClick={listening ? () => recognitionRef.current?.stop() : startListening} aria-label={listening ? 'Stop listening' : 'Start voice input'}><span className="mic-ring ring-one" /><span className="mic-ring ring-two" /><Mic size={29} strokeWidth={2.2} /></button><div style={{ display: 'flex', paddingLeft: '20px', pointerEvents: 'auto' }}><button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="Voice command help"><CircleHelp size={22} /></button></div></div><p className="voice-hint">{listening ? 'Listening for your command' : 'Say “add apples” or “remove milk”'}</p></div>
    {manualOpen && <div className="modal-backdrop" onClick={() => setManualOpen(false)}><form className="modal" onSubmit={submitManual} onClick={(event) => { event.stopPropagation(); setUnitDropdownOpen(false); }}><button type="button" className="modal-close" onClick={() => setManualOpen(false)}><X size={18} /></button><span className="modal-label">ADD AN ITEM</span><h2>What do you need?</h2><input autoFocus value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="e.g. oat milk" /><div className="modal-row"><input type="number" min="1" step="any" value={manualQty} onChange={(event) => setManualQty(event.target.value)} /><div className="custom-select-wrapper"><button type="button" className={`custom-select-trigger ${unitDropdownOpen ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setUnitDropdownOpen(!unitDropdownOpen); }}><span>{unitOptions.find(o => o.value === manualUnit)?.label || 'Auto-detect unit'}</span><ChevronDown size={14} style={{ transform: unitDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} /></button>{unitDropdownOpen && <div className="custom-select-dropdown">{unitOptions.map(opt => <button type="button" key={opt.value} className={`custom-select-option ${manualUnit === opt.value ? 'selected' : ''}`} onClick={() => { setManualUnit(opt.value); setUnitDropdownOpen(false); }}>{opt.label}</button>)}</div>}</div></div><button className="modal-submit" type="submit">Add to list <Plus size={16} strokeWidth={3} /></button></form></div>}
    {helpOpen && (
      <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setHelpOpen(false)}><X size={18} /></button>
          <span className="modal-label">VOICE COMMANDS</span>
          <h2 style={{ marginBottom: '16px' }}>What you can say</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px', color: 'var(--muted-foreground)' }}>
            <div><strong style={{ color: 'var(--foreground)' }}>Add Items:</strong><br />"Add 2 kg of potatoes"<br />"Get a dozen eggs"</div>
            <div><strong style={{ color: 'var(--foreground)' }}>Remove Items:</strong><br />"Remove the milk"<br />"Take off eggs"</div>
            <div><strong style={{ color: 'var(--foreground)' }}>Update Items:</strong><br />"Increase apples to 5"<br />"Reduce milk to 1 liter"</div>
            <div><strong style={{ color: 'var(--foreground)' }}>Swap Items:</strong><br />"Swap apples for bananas"<br />"Instead of milk, get water"</div>
            <div><strong style={{ color: 'var(--foreground)' }}>Clear List:</strong><br />"Clear my list"</div>
            <div><strong style={{ color: 'var(--foreground)' }}>Mix and Match:</strong><br />"Add 5 apples and swap milk for oat milk"</div>
          </div>
        </div>
      </div>
    )}
    {aboutOpen && (
      <div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setAboutOpen(false)}><X size={18} /></button>
          <h2>About Developer</h2>
          <p style={{ color: 'var(--muted-foreground)', marginBottom: '16px', lineHeight: 1.5, fontSize: '13px' }}>
            Voice-Based Online Shopper is an intelligent, zero-latency shopping assistant built by <strong>Suyash Soni</strong>. It features a custom Local NLU Engine that understands complex conversational voice commands without relying on slow cloud LLMs.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <a href="https://github.com/SuyashSoni10" target="_blank" rel="noreferrer" className="modal-submit" style={{ textDecoration: 'none', background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
              Developer Profile
            </a>
            <a href="https://github.com/SuyashSoni10/voice-command-shopper" target="_blank" rel="noreferrer" className="modal-submit" style={{ textDecoration: 'none' }}>
              GitHub Repo
            </a>
          </div>
        </div>
      </div>
    )}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}>{toast.tone === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}{toast.message}</div>)}</div>
  </main>
}

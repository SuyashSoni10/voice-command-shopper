'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, CircleHelp, Mic, MoreHorizontal, Plus, Trash2, X } from 'lucide-react'

type Item = { id: string | number; name: string; quantity: number; unit: string; category?: string; purchased_at?: string | null; added_at?: string }
type Toast = { id: number; message: string; tone: 'success' | 'error' }

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const categoryOrder = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Other']

function formatQuantity(item: Item) {
  return `${item.quantity} ${item.unit || 'pieces'}`
}

export default function Page() {
  const [items, setItems] = useState<Item[]>([])
  const [suggestions, setSuggestions] = useState<{name: string, score: number}[]>([])
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'offline'>('synced')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualQty, setManualQty] = useState('1')
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

  const addItem = async (itemName: string, quantity: number, unit = 'pieces') => {
    const response = await fetch(`${API}/api/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: itemName, quantity, unit }) })
    if (!response.ok) throw new Error('Add failed')
    notify(`Added ${quantity} ${unit} of ${itemName}`)
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
        if (action.intent === 'ADD_ITEM') await addItem(entity.item_name, entity.quantity || 1, entity.unit || 'pieces')
        if (action.intent === 'REMOVE_ITEM') {
          await fetch(`${API}/api/items/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_name: entity.item_name, quantity: entity.quantity || 1, unit: entity.unit || 'pieces' }) })
          notify(`Removed ${entity.item_name}`); await refresh()
        }
        if (action.intent === 'CLEAR_LIST') await clearList()
      }
    } catch { notify('I could not understand that command.', 'error') }
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { notify('Voice input is not supported in this browser.', 'error'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = false
    recognition.onstart = () => { setListening(true); setTranscript('Listening...'); transcriptRef.current = '' }
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results).map((result: any) => result[0].transcript).join('')
      setTranscript(text)
      transcriptRef.current = text
    }
    recognition.onerror = () => { setListening(false); setTranscript('') ; notify('Microphone access was unavailable.', 'error') }
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

  const submitManual = async (event: React.FormEvent) => { event.preventDefault(); if (!manualName.trim()) return; try { await addItem(manualName.trim(), Number(manualQty) || 1); setManualName(''); setManualOpen(false) } catch { notify('Could not add item.', 'error') } }

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar"><div className="brand"><div className="brand-mark"><Check size={18} strokeWidth={3} /></div><span>LISTEN<span className="brand-dot">.</span></span></div><div className="header-actions"><button className="icon-button" aria-label="More options"><MoreHorizontal size={19} /></button><button className="clear-button" onClick={clearList}><Trash2 size={15} /> Clear list</button></div></header>
    <section className="content"><div className="eyebrow"><span className="eyebrow-line" /> YOUR SHOPPING LIST <span className="eyebrow-line" /></div><div className="title-row"><div><h1>Things to get</h1><p>{items.length} {items.length === 1 ? 'item' : 'items'} on your list <span className={`status-dot ${syncStatus}`} aria-label={syncStatus === 'synced' ? 'Synced' : 'Offline'} /> {syncStatus === 'synced' ? 'synced just now' : 'sync unavailable'}</p></div><button className="add-button" onClick={() => setManualOpen(true)}><Plus size={18} /> Add item</button></div>
      {suggestions.length > 0 && <div className="suggestions-track">
        {suggestions.map((s) => (
          <button key={s.name} className="suggestion-chip" onClick={() => addItem(s.name, 1)}>
            <Plus size={14} strokeWidth={2.5} /> {s.name}
          </button>
        ))}
      </div>}
      {loading ? <div className="empty-state"><div className="loader" />Loading your list...</div> : grouped.length === 0 ? <div className="empty-state"><div className="empty-icon"><Check size={24} /></div><h2>Your list is clear</h2><p>Tap the microphone and say what you need.</p></div> : <div className="list-groups">{grouped.map(([category, group]) => <section className="category" key={category}><div className="category-heading"><span>{category}</span><span className="category-count">{group.length}</span></div><div className="item-stack">{group.map((item) => <article className={`item-card ${item.purchased_at ? 'purchased' : ''}`} key={item.id}><button className="check-button" aria-label={`Mark ${item.name} ${item.purchased_at ? 'not purchased' : 'purchased'}`} onClick={() => toggle(item)}>{item.purchased_at && <Check size={15} strokeWidth={3} />}</button><div className="item-copy"><span className="item-name">{item.name}</span><span className="item-added">Added {item.added_at ? new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'today'}</span></div><span className="quantity-pill">{formatQuantity(item)}</span><button className="delete-button" aria-label={`Remove ${item.name}`} onClick={() => remove(item)}><Trash2 size={17} /></button></article>)}</div></section>)}</div>}
    </section>
    <div className="voice-dock"><div className={`transcript ${transcript ? 'visible' : ''}`}>{transcript || 'Tap to speak'}</div><button className={`mic-button ${listening ? 'is-listening' : ''}`} onClick={listening ? () => recognitionRef.current?.stop() : startListening} aria-label={listening ? 'Stop listening' : 'Start voice input'}><span className="mic-ring ring-one" /><span className="mic-ring ring-two" /><Mic size={29} strokeWidth={2.2} /></button><p className="voice-hint">{listening ? 'Listening for your command' : 'Say “add apples” or “remove milk”'}</p></div>
    {manualOpen && <div className="modal-backdrop" onClick={() => setManualOpen(false)}><form className="modal" onSubmit={submitManual} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setManualOpen(false)}><X size={18} /></button><span className="modal-label">ADD AN ITEM</span><h2>What do you need?</h2><input autoFocus value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="e.g. oat milk" /><div className="modal-row"><input type="number" min="1" value={manualQty} onChange={(event) => setManualQty(event.target.value)} /><span>pieces</span></div><button className="modal-submit" type="submit">Add to list <ChevronDown size={16} /></button></form></div>}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}>{toast.tone === 'success' ? <Check size={16} /> : <CircleHelp size={16} />}{toast.message}</div>)}</div>
  </main>
}

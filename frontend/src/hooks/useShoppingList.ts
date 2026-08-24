import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:8000';

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  purchased_at: string | null;
  added_at: string;
}

export function useShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/items`);
      if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
      const data = await res.json();
      setItems(data as ShoppingListItem[]);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = useCallback(async (item: { item_name: string; quantity?: number; unit?: string }) => {
    try {
      const res = await fetch(`${API}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to add item');
      }
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
      throw err; // re-throw so App.tsx can catch it
    }
  }, [fetchItems]);

  const removeItem = useCallback(async (itemName: string, quantity?: number | null, unit?: string | null) => {
    try {
      const res = await fetch(`${API}/api/items/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: itemName, quantity, unit }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to remove item');
      }
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchItems]);

  const togglePurchased = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/api/items/${id}/toggle`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to toggle item');
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchItems]);

  const clearList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/items/clear`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear list');
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchItems]);

  return { items, loading, error, addItem, removeItem, togglePurchased, clearList, fetchItems };
}

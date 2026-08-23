import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  is_purchased: boolean;
  created_at: string;
}

export function useShoppingList() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data as ShoppingListItem[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    // Set up realtime subscription
    const channel = supabase
      .channel('shopping_list_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        (payload) => {
          console.log('Realtime update:', payload);
          fetchItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  const addItem = useCallback(async (item: { item_name: string; quantity?: number; unit?: string }) => {
    try {
      const { error } = await supabase.from('shopping_list_items').insert([{
        name: item.item_name,
        quantity: item.quantity || null,
        unit: item.unit || null,
        is_purchased: false
      }]);
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const removeItem = useCallback(async (itemName: string) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .ilike('name', `%${itemName}%`);
        
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const togglePurchased = useCallback(async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({ is_purchased: !currentStatus })
        .eq('id', id);
        
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const clearList = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to delete all
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  return { items, loading, error, addItem, removeItem, togglePurchased, clearList, fetchItems };
}

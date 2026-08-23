import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ShoppingListItem {
  id: string;
  user_id: string;
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
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      let userId = session?.user?.id;
      if (!userId) {
        // Sign in anonymously if not already signed in
        const { data: authData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
        userId = authData.user?.id;
      }

      if (!userId) throw new Error('Could not establish user session');

      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .order('added_at', { ascending: false });

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('shopping_list_items').insert([{
        user_id: user.id,
        name: item.item_name,
        quantity: item.quantity || 1,
        unit: item.unit || null,
        purchased_at: null
      }]);
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const removeItem = useCallback(async (itemName: string, quantityToRemove?: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (quantityToRemove) {
        // 1. Fetch the item to check its current quantity
        const { data: existingItems, error: fetchError } = await supabase
          .from('shopping_list_items')
          .select('id, quantity')
          .eq('user_id', user.id)
          .ilike('name', `%${itemName}%`);
          
        if (fetchError) throw fetchError;
        
        if (existingItems && existingItems.length > 0) {
          const item = existingItems[0];
          const newQuantity = (item.quantity || 1) - quantityToRemove;
          
          if (newQuantity > 0) {
            // Update quantity
            const { error: updateError } = await supabase
              .from('shopping_list_items')
              .update({ quantity: newQuantity })
              .eq('id', item.id);
            if (updateError) throw updateError;
            return; // Exit here, don't delete
          }
          // If newQuantity <= 0, fall through to delete
        }
      }

      // Delete fully if no quantity specified or newQuantity <= 0
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('user_id', user.id)
        .ilike('name', `%${itemName}%`);
        
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const togglePurchased = useCallback(async (id: string, currentPurchasedAt: string | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('shopping_list_items')
        .update({ purchased_at: currentPurchasedAt ? null : new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id);
        
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const clearList = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .eq('user_id', user.id); // deletes all items for this user
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const checkoutPurchasedItems = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get all purchased items
      const { data: purchasedItems, error: fetchError } = await supabase
        .from('shopping_list_items')
        .select('id, name')
        .eq('user_id', user.id)
        .not('purchased_at', 'is', null);

      if (fetchError) throw fetchError;
      if (!purchasedItems || purchasedItems.length === 0) return;

      // 2. Insert into purchase_history
      const historyItems = purchasedItems.map(item => ({
        user_id: user.id,
        item_name: item.name
      }));

      const { error: insertError } = await supabase
        .from('purchase_history')
        .insert(historyItems);
      
      if (insertError) throw insertError;

      // 3. Delete from shopping_list_items
      const idsToDelete = purchasedItems.map(item => item.id);
      const { error: deleteError } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) throw deleteError;

    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  return { items, loading, error, addItem, removeItem, togglePurchased, clearList, checkoutPurchasedItems, fetchItems };
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface StoreProfile {
  id: string;
  business_name: string;
  description: string | null;
  logo_url: string | null;
}

export function useStoreProfile() {
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('store_profile')
      .select('*')
      .limit(1)
      .single();
    
    if (data) {
      setProfile(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const updateProfile = async (updates: Partial<StoreProfile>) => {
    if (profile?.id) {
      const { data } = await supabase
        .from('store_profile')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single();
      if (data) setProfile(data);
    } else {
      const { data } = await supabase
        .from('store_profile')
        .insert([{ business_name: updates.business_name || 'My Store', ...updates }])
        .select()
        .single();
      if (data) setProfile(data);
    }
  };

  return { profile, loading, updateProfile };
}

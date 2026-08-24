import { useState, useEffect } from 'react';

const API = 'http://localhost:8000';

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
    try {
      const res = await fetch(`${API}/api/profile`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const updateProfile = async (updates: Partial<StoreProfile>) => {
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
  };

  return { profile, loading, updateProfile };
}

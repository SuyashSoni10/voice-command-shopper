import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStoreProfile } from '../hooks/useStoreProfile';

interface AdminProps {
  onClose: () => void;
}

export function Admin({ onClose }: AdminProps) {
  const { profile, loading: profileLoading, updateProfile } = useStoreProfile();
  
  // Profile state
  const [businessName, setBusinessName] = useState(profile?.business_name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [profileMsg, setProfileMsg] = useState('');

  // Product state
  const [prodName, setProdName] = useState('');
  const [prodBrand, setProdBrand] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodMsg, setProdMsg] = useState('');

  // Sync profile when loaded
  React.useEffect(() => {
    if (profile) {
      setBusinessName(profile.business_name);
      setDescription(profile.description || '');
    }
  }, [profile]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('Saving...');
    await updateProfile({ business_name: businessName, description });
    setProfileMsg('Saved!');
    setTimeout(() => setProfileMsg(''), 2000);
  };

  const handleProductAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdMsg('Adding...');
    
    const { error } = await supabase.from('product_catalog').insert([{
      name: prodName,
      brand: prodBrand,
      category: prodCategory,
      price: parseFloat(prodPrice),
      source: 'manual'
    }]);

    if (error) {
      setProdMsg(`Error: ${error.message}`);
    } else {
      setProdMsg('Product added successfully!');
      setProdName('');
      setProdBrand('');
      setProdCategory('');
      setProdPrice('');
    }
    setTimeout(() => setProdMsg(''), 3000);
  };

  return (
    <div className="qty-prompt-overlay" style={{ zIndex: 100 }}>
      <div className="qty-prompt-modal" style={{ maxHeight: '90vh', overflowY: 'auto', width: '90%', maxWidth: '500px' }}>
        <button className="qty-prompt-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Owner Portal</h2>
        
        <section style={{ marginBottom: '2rem', textAlign: 'left' }}>
          <h3>Store Profile</h3>
          {profileLoading ? <p>Loading...</p> : (
            <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Business Name</label>
                <input 
                  type="text" 
                  value={businessName} 
                  onChange={e => setBusinessName(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Description (Optional)</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', minHeight: '60px' }}
                />
              </div>
              <button type="submit" style={{ background: 'var(--primary)', color: 'white', padding: '0.5rem', borderRadius: '4px' }}>Save Profile</button>
              {profileMsg && <p style={{ color: 'green', fontSize: '0.875rem' }}>{profileMsg}</p>}
            </form>
          )}
        </section>

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '2rem 0' }} />

        <section style={{ textAlign: 'left' }}>
          <h3>Add Product to Catalog</h3>
          <form onSubmit={handleProductAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Product Name</label>
              <input 
                type="text" 
                value={prodName} 
                onChange={e => setProdName(e.target.value)} 
                required 
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Brand (Optional)</label>
              <input 
                type="text" 
                value={prodBrand} 
                onChange={e => setProdBrand(e.target.value)} 
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Category (Optional)</label>
              <input 
                type="text" 
                value={prodCategory} 
                onChange={e => setProdCategory(e.target.value)} 
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Price ($)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={prodPrice} 
                onChange={e => setProdPrice(e.target.value)} 
                required 
                style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
            <button type="submit" style={{ background: '#10b981', color: 'white', padding: '0.5rem', borderRadius: '4px' }}>+ Add Product</button>
            {prodMsg && <p style={{ color: prodMsg.includes('Error') ? 'red' : 'green', fontSize: '0.875rem' }}>{prodMsg}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
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

  return (
    <div className="qty-prompt-overlay" style={{ zIndex: 100 }}>
      <div className="qty-prompt-modal" style={{ maxHeight: '90vh', overflowY: 'auto', width: '90%', maxWidth: '500px', padding: '0' }}>
        
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
          <button className="qty-prompt-close" onClick={onClose} aria-label="Close">✕</button>
          <h2 style={{ color: 'var(--primary, var(--purple-600))', margin: 0 }}>Owner Portal</h2>
        </div>

        <div style={{ padding: '24px' }}>
          <section style={{ textAlign: 'left' }}>
            {profileLoading ? <p>Loading...</p> : (
              <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                <button type="submit" style={{ background: 'var(--primary, var(--purple-600))', color: 'white', padding: '0.5rem', borderRadius: '4px', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Save Profile</button>
                {profileMsg && <p style={{ color: 'green', fontSize: '0.875rem' }}>{profileMsg}</p>}
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

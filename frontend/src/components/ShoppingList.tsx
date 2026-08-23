import React from 'react';
import { type ShoppingListItem } from '../hooks/useShoppingList';

interface ShoppingListProps {
  items: ShoppingListItem[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string, currentStatus: boolean) => void;
  onDelete: (name: string) => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ items, loading, error, onToggle, onDelete }) => {
  if (loading && items.length === 0) {
    return <div style={{ textAlign: 'center', padding: '20px' }}>Loading list...</div>;
  }

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error loading list: {error}</div>;
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#888', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#555' }}>Your list is empty</h3>
        <p style={{ margin: 0 }}>Tap the mic and say "Add milk" to get started.</p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li 
          key={item.id} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '15px', 
            borderBottom: '1px solid #eee',
            backgroundColor: item.is_purchased ? '#f9f9f9' : 'white',
            transition: 'background-color 0.2s',
            borderRadius: '8px',
            marginBottom: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <input 
            type="checkbox" 
            checked={item.is_purchased}
            onChange={() => onToggle(item.id, item.is_purchased)}
            style={{ marginRight: '15px', width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4CAF50' }}
          />
          <div style={{ flex: 1, textDecoration: item.is_purchased ? 'line-through' : 'none', color: item.is_purchased ? '#aaa' : '#333' }}>
            <span style={{ fontSize: '18px', fontWeight: '500' }}>{item.name}</span>
            {(item.quantity || item.unit) && (
              <span style={{ marginLeft: '10px', fontSize: '14px', color: '#666' }}>
                ({item.quantity} {item.unit})
              </span>
            )}
            {item.category && (
              <span style={{ marginLeft: '10px', fontSize: '12px', backgroundColor: '#e0e0e0', padding: '2px 6px', borderRadius: '4px' }}>
                {item.category}
              </span>
            )}
          </div>
          <button 
            onClick={() => onDelete(item.name)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#ff5252', 
              cursor: 'pointer', 
              fontSize: '24px',
              padding: '0 10px',
              lineHeight: '1'
            }}
            aria-label="Delete item"
            title="Delete"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
};

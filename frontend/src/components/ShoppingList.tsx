import React from 'react';
import type { ShoppingListItem } from '../hooks/useShoppingList';

interface ShoppingListProps {
  items: ShoppingListItem[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string) => void;
  onDelete: (name: string) => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ items, loading, error, onToggle, onDelete }) => {
  if (loading && items.length === 0) {
    return <div className="list-loading">Loading...</div>;
  }

  if (error) {
    // We still render the list below, but we can show an error banner if we want
    // Actually, App.tsx shows toasts for errors, so we can just ignore it here or show a non-blocking banner
  }

  if (items.length === 0) {
    return (
      <div className="list-empty">
        <div className="list-empty__title">No items yet</div>
        <div className="list-empty__hint">Say "Add milk" to get started</div>
      </div>
    );
  }

  return (
    <div>
      <ul className="list">
        {items.map((item) => (
          <li 
            key={item.id} 
            className={`list-item ${item.purchased_at ? 'list-item--purchased' : ''}`}
          >
            <input 
              className="list-item__checkbox"
              type="checkbox" 
              checked={!!item.purchased_at}
              onChange={() => onToggle(item.id)}
            />
            <div className="list-item__info">
              <span className="list-item__name">{item.name}</span>
              {item.category && item.category !== 'uncategorized' && (
                <span className="list-item__category">{item.category}</span>
              )}
            </div>
            {(item.quantity || item.unit) && (
              <span className="list-item__qty">
                {item.quantity}{item.unit ? ` ${item.unit}` : ''}
              </span>
            )}
            <button 
              className="list-item__delete"
              onClick={() => onDelete(item.name)}
              aria-label="Delete"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

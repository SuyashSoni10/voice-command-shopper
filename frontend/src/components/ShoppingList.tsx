import React from 'react';
import type { ShoppingListItem } from '../hooks/useShoppingList';

interface ShoppingListProps {
  items: ShoppingListItem[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string, currentPurchasedAt: string | null) => void;
  onDelete: (name: string) => void;
  onCheckout: () => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ items, loading, error, onToggle, onDelete, onCheckout }) => {
  if (loading && items.length === 0) {
    return <div className="list-loading">Loading...</div>;
  }

  if (error) {
    return <div className="list-error">{error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="list-empty">
        <div className="list-empty__title">No items yet</div>
        <div className="list-empty__hint">Say "Add milk" to get started</div>
      </div>
    );
  }

  const hasPurchasedItems = items.some(item => item.purchased_at !== null);

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
              onChange={() => onToggle(item.id, item.purchased_at)}
            />
            <div className="list-item__info">
              <span className="list-item__name">{item.name}</span>
              {item.category && item.category !== 'other' && (
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
      
      {hasPurchasedItems && (
        <button className="checkout-btn" onClick={onCheckout}>
          Checkout purchased items
        </button>
      )}
    </div>
  );
};

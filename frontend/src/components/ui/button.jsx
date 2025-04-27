import React from 'react';

export function Button({ children, ...props }) {
  return (
    <button {...props} style={{ padding: '8px 16px', margin: '4px', borderRadius: '4px', cursor: 'pointer' }}>
      {children}
    </button>
  );
}

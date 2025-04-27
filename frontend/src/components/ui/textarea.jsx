import React from 'react';

export function Textarea(props) {
  return (
    <textarea {...props} style={{ padding: '8px', borderRadius: '4px', fontFamily: 'monospace' }} />
  );
}

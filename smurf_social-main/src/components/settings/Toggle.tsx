import React from 'react';

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

const Toggle: React.FC<ToggleProps> = ({ enabled, onToggle, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    disabled={disabled}
    onClick={onToggle}
    className={`
      w-11 h-6 rounded-full p-0.5 transition-all duration-300
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2
      ${enabled ? 'btn-gradient shadow-accent' : 'bg-bg-tertiary'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    `}
  >
    <div
      className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300
        ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
    />
  </button>
);

export default React.memo(Toggle);

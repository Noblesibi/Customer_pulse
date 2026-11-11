import React from 'react';

/**
 * Universal NeST CustomerPulse LoadingSpinner
 * Matches the crescent arc animation design requested by the user.
 * 
 * Props:
 * - size: 'xs' (16px), 'sm' (20px), 'md' (32px - default), 'lg' (40px), 'xl' (48px)
 * - text: Optional status text displayed below the spinner
 * - fullPage: Centers within a large container/viewport
 * - color: 'primary' (default: NeST digital deep blue #223670) or 'white' or custom hex
 * - className: Additional CSS classes for the container
 */
export default function LoadingSpinner({
  size = 'md',
  text = '',
  className = '',
  fullPage = false,
  color = 'primary'
}) {
  const sizeMap = {
    xs: { dim: 'w-4 h-4', border: 'border-[2px]' },
    sm: { dim: 'w-5 h-5', border: 'border-[2px]' },
    md: { dim: 'w-8 h-8', border: 'border-[2.5px]' },
    lg: { dim: 'w-10 h-10', border: 'border-[3px]' },
    xl: { dim: 'w-12 h-12', border: 'border-[3px]' },
  };

  const selected = sizeMap[size] || sizeMap.md;
  const topColor = color === 'white' ? '#ffffff' : color === 'primary' ? '#223670' : color;

  const spinner = (
    <div
      className={`rounded-full ${selected.dim} ${selected.border} animate-spin shrink-0`}
      style={{
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderTopColor: topColor,
        animation: 'spin 0.85s linear infinite'
      }}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullPage) {
    return (
      <div className={`w-full min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 ${className}`}>
        {spinner}
        {text && (
          <p className="text-xs sm:text-sm font-semibold text-slate-500">
            {text}
          </p>
        )}
      </div>
    );
  }

  if (text) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2.5 ${className}`}>
        {spinner}
        <p className="text-xs font-semibold text-slate-500">{text}</p>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      {spinner}
    </div>
  );
}

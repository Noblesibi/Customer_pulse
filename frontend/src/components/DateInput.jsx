import React, { useState, useEffect, useRef } from 'react';
import { Calendar } from 'lucide-react';

/**
 * Converts ISO "YYYY-MM-DD" to display "DD-MM-YYYY".
 */
function isoToDisplay(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Parses a manually typed "DD-MM-YYYY" (or "DD/MM/YYYY") string into valid ISO "YYYY-MM-DD".
 * Returns null if incomplete or not a real calendar date.
 */
function displayToIso(display, minYear = 1900, maxYear = 2100) {
  const m = String(display || '').trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (yyyy < minYear || yyyy > maxYear) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Auto-formats raw numeric/slash input into "DD-MM-YYYY" while preserving natural backspace.
 */
function formatTypedDate(raw, prev) {
  // Allow user to backspace over a hyphen cleanly
  if (prev && raw.length < prev.length) {
    return raw.replace(/[^\d-/]/g, '').replace(/\//g, '-').slice(0, 10);
  }
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/**
 * Reusable CustomerPulse DateInput:
 * - Supports effortless manual typing in DD-MM-YYYY format (independent of browser OS locale)
 * - Supports clicking the calendar icon to open the native date picker
 * - Emits standard ISO "YYYY-MM-DD" via onChange(isoString) (or "" when cleared)
 */
export default function DateInput({
  value = '',
  onChange,
  onBlur,
  placeholder = 'DD-MM-YYYY',
  className = '',
  min = '1900-01-01',
  max = '2100-12-31',
  disabled = false,
  id,
  name,
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const hiddenDateRef = useRef(null);

  const minYear = parseInt(String(min).slice(0, 4), 10) || 1900;
  const maxYear = parseInt(String(max).slice(0, 4), 10) || 2100;

  // Sync external value changes (e.g., form reset or calendar pick)
  useEffect(() => {
    const formatted = isoToDisplay(value);
    setText(prev => {
      const prevIso = displayToIso(prev, minYear, maxYear);
      if (value && prevIso === value) return prev;
      return formatted;
    });
    if (!value || isoToDisplay(value)) {
      setInvalid(false);
    }
  }, [value, minYear, maxYear]);

  const handleTextChange = (e) => {
    const nextText = formatTypedDate(e.target.value, text);
    setText(nextText);

    if (!nextText.trim()) {
      setInvalid(false);
      onChange?.('');
      return;
    }

    if (nextText.length === 10) {
      const iso = displayToIso(nextText, minYear, maxYear);
      if (iso) {
        setInvalid(false);
        onChange?.(iso);
      } else {
        setInvalid(true);
      }
    } else {
      setInvalid(false);
    }
  };

  const handleTextBlur = (e) => {
    if (text.trim()) {
      const iso = displayToIso(text, minYear, maxYear);
      if (iso) {
        setInvalid(false);
        if (iso !== value) onChange?.(iso);
      } else {
        setInvalid(true);
      }
    } else {
      setInvalid(false);
    }
    onBlur?.(e);
  };

  const handlePickerChange = (e) => {
    const iso = e.target.value || '';
    setText(isoToDisplay(iso));
    setInvalid(false);
    onChange?.(iso);
  };

  const openPicker = () => {
    if (disabled) return;
    const el = hiddenDateRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        autoComplete="off"
        className={`${className} pr-10 ${invalid ? '!border-rose-500 !ring-rose-200' : ''}`}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        title="Open calendar picker"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-40"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <input
        ref={hiddenDateRef}
        type="date"
        value={value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        min={min}
        max={max}
        onChange={handlePickerChange}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      {invalid && (
        <p className="text-[11px] text-rose-600 font-medium mt-1">
          Enter a valid date in DD-MM-YYYY format (e.g. 25-11-2026)
        </p>
      )}
    </div>
  );
}

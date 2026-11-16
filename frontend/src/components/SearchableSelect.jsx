import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  getOptionValue = (opt) => opt?.id || opt?.value,
  getOptionLabel = (opt) => opt?.name || opt?.label || '',
  getOptionSublabel = (opt) => opt?.sublabel || opt?.designation || opt?.industry || '',
  placeholder = 'Search & select...',
  icon: Icon = null,
  disabled = false,
  emptyMessage = 'No options found',
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Find currently selected option
  const selectedOption = (options || []).find(opt => {
    const val = getOptionValue(opt);
    return val !== undefined && val !== null && String(val) === String(value);
  });

  // Sync search input with selected option label when closed or changed
  useEffect(() => {
    if (selectedOption) {
      setSearchTerm(getOptionLabel(selectedOption));
    } else if (!value) {
      setSearchTerm('');
    }
  }, [value, selectedOption]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        // Reset search term back to selected label if closed without selecting
        if (selectedOption) {
          setSearchTerm(getOptionLabel(selectedOption));
        } else if (!value) {
          setSearchTerm('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption, value]);

  // Filter options based on search query
  const isSelectedLabel = selectedOption && searchTerm.trim().toLowerCase() === (getOptionLabel(selectedOption) || '').trim().toLowerCase();

  const filteredOptions = (options || []).filter(opt => {
    // If search term matches the selected option label, show all options for easy browsing/selection
    if (!searchTerm.trim() || isSelectedLabel) return true;
    const rawQ = searchTerm.trim().toLowerCase();
    const q = rawQ.startsWith('@') ? rawQ.slice(1).trim() : rawQ;
    if (!q) return true;
    const label = (getOptionLabel(opt) || '').toLowerCase();
    const sublabel = (getOptionSublabel(opt) || '').toLowerCase();
    return label.includes(q) || sublabel.includes(q);
  });

  const handleSelect = (opt) => {
    const optVal = getOptionValue(opt);
    onChange(optVal, opt);
    setSearchTerm(getOptionLabel(opt));
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
    setSearchTerm('');
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleInputFocus = () => {
    if (disabled) return;
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    // If cleared by user typing backspace to empty
    if (!e.target.value.trim() && value) {
      onChange('', null);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div
        className={`relative flex items-center bg-white border rounded-xl transition-all cursor-text ${isOpen ? 'border-primary ring-2 ring-primary/10 shadow-sm' : 'border-slate-300 hover:border-slate-400'
          } ${disabled ? 'opacity-60 pointer-events-none bg-slate-50' : ''}`}
        onClick={() => {
          if (!disabled && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
            setIsOpen(true);
          }
        }}
      >
        {Icon && (
          <div className="pl-3.5 pr-1 text-slate-400 shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-transparent px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none"
        />

        {/* Clear Button */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Dropdown Chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) {
              const next = !isOpen;
              setIsOpen(next);
              if (next && inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
              }
            }
          }}
          className="pr-3 text-slate-400 shrink-0 cursor-pointer"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
        </button>
      </div>

      {/* Scrollable Dropdown Menu */}
      {isOpen && (
        <div
          style={{ zIndex: 1000 }}
          className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Scrollable List Container */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 custom-scrollbar p-1">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 font-medium">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const optVal = getOptionValue(opt);
                const isSelected = String(optVal) === String(value);
                const label = getOptionLabel(opt);
                const sublabel = getOptionSublabel(opt);

                return (
                  <button
                    key={optVal || idx}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Prevent input blur before click registers
                      handleSelect(opt);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${isSelected
                        ? 'bg-blue-50 text-blue-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-xs truncate font-semibold text-slate-800">
                        {label}
                      </span>
                      {sublabel && (
                        <span className="text-[10px] text-slate-400 truncate mt-0.5">
                          {sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

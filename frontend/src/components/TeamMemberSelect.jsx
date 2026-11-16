import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

export default function TeamMemberSelect({
  value,
  onChange,
  staffList = [],
  currentUserId = null,
  placeholder = "Type @name to search and assign team member...",
  required = false
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Available staff members (excluding self if currentUserId provided)
  const availableStaff = (staffList || []).filter(s => !currentUserId || s.uid !== currentUserId);

  // Find currently selected staff member object
  const selectedStaff = availableStaff.find(s => s.uid === value);

  // Sync input text when selected staff changes externally
  useEffect(() => {
    if (selectedStaff) {
      setSearchTerm(`@${selectedStaff.name}`);
    } else if (!value) {
      setSearchTerm('');
    }
  }, [value, selectedStaff?.name]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter staff based on search input
  const filteredStaff = (() => {
    if (!searchTerm) return availableStaff;
    const cleanQuery = searchTerm.trim().toLowerCase().replace(/^@/, '');
    if (!cleanQuery) return availableStaff;
    return availableStaff.filter(s =>
      (s.name || '').toLowerCase().includes(cleanQuery) ||
      (s.email || '').toLowerCase().includes(cleanQuery) ||
      (s.role || s.position || s.jobRole || '').toLowerCase().includes(cleanQuery) ||
      (s.department || '').toLowerCase().includes(cleanQuery)
    );
  })();

  const handleSelect = (staff) => {
    onChange(staff.uid, staff);
    setSearchTerm(`@${staff.name}`);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', null);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input container matching reference screenshot */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={searchTerm}
          required={required && !value}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (!e.target.value.trim()) {
              onChange('', null);
            }
          }}
          placeholder={placeholder}
          className="w-full bg-[#f8fafc] border border-slate-300 focus:border-blue-500 focus:bg-white rounded-2xl px-4 py-3 text-xs text-black font-semibold placeholder:text-slate-400 placeholder:font-medium outline-none transition-all"
        />

        {/* Clear Icon Button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3.5 p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown Menu with clean static background (no black hover) */}
      {isOpen && (
        <div className="absolute z-[100] w-full top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
          {filteredStaff.length === 0 ? (
            <div className="p-3.5 text-xs text-slate-400 text-center font-medium">
              No team members match "{searchTerm}"
            </div>
          ) : (
            filteredStaff.map((s) => {
              const isSelected = s.uid === value;
              const roleDisplay = s.position || s.jobRole || s.role;

              return (
                <button
                  key={s.uid}
                  type="button"
                  onClick={() => handleSelect(s)}
                  style={{
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#1d4ed8' : '#000000'
                  }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer border-b border-slate-100 last:border-0 outline-none"
                >
                  <div className="flex flex-col text-left py-0.5">
                    <span className="font-bold text-black text-xs sm:text-sm leading-snug">{s.name}</span>
                    {roleDisplay && (
                      <span className="font-bold text-slate-700 text-xs mt-0.5 leading-snug">
                        {roleDisplay}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

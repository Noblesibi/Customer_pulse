/**
 * Centralized Backend Date Utility for CustomerPulse
 * Follows system / server local time for formatting.
 * Rules:
 * 1. Date format: DD-MM-YYYY
 * 2. Time format: HH:mm (24-hour)
 * 3. Combined format: DD-MM-YYYY, HH:mm
 */

export function toUtcIsoString(input) {
  if (!input) return new Date().toISOString();
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function getSystemDateString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(dateObj);
  } catch {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

export function getSystemTimeString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    return formatter.format(dateObj);
  } catch {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hh}:${min}`;
  }
}

export function formatSystemDate(input) {
  if (!input) return '—';
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(input.trim())) {
    return input.trim();
  }
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [yyyy, mm, dd] = input.trim().split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function formatSystemTime(input) {
  if (!input) return '';
  if (input instanceof Date) {
    return `${String(input.getHours()).padStart(2, '0')}:${String(input.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof input === 'string') {
    const s = input.trim();
    const ampmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const isPm = ampmMatch[3].toLowerCase() === 'pm';
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }
  return String(input);
}

export function formatSystemDateTime(input) {
  if (!input) return '—';
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(input.trim())) {
    return input.trim();
  }
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [yyyy, mm, dd] = input.trim().split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const dd = String(map.day).padStart(2, '0');
    const mm = String(map.month).padStart(2, '0');
    const yyyy = map.year;
    let hh = map.hour || '00';
    if (hh === '24') hh = '00';
    const min = String(map.minute).padStart(2, '0');
    return `${dd}-${mm}-${yyyy}, ${hh}:${min}`;
  } catch (err) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy}, ${hh}:${min}`;
  }
}

// Aliases for backward compatibility
export const getKolkataDateString = getSystemDateString;
export const getKolkataTimeString = getSystemTimeString;
export const formatKolkataDate = formatSystemDate;
export const formatKolkataTime = formatSystemTime;
export const formatKolkataDateTime = formatSystemDateTime;

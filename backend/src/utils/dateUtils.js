/**
 * Centralized Backend Date Utility for CustomerPulse
 * Follows system / server local time for formatting.
 */

export function toUtcIsoString(input) {
  if (!input) return new Date().toISOString();
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function getSystemDateString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getSystemTimeString(d = new Date()) {
  const dateObj = d instanceof Date ? d : new Date(d);
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export function formatSystemDateTime(input) {
  if (!input) return '—';
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(input.trim())) {
    return input.trim();
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const dd = String(map.day).padStart(2, '0');
    const mm = String(map.month).padStart(2, '0');
    const yyyy = map.year;
    const hh = String(map.hour).padStart(2, '0');
    const min = String(map.minute).padStart(2, '0');
    const ampm = (map.dayPeriod || (d.getHours() >= 12 ? 'pm' : 'am')).toLowerCase();
    return `${dd}-${mm}-${yyyy}, ${hh}:${min} ${ampm}`;
  } catch (err) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${dd}-${mm}-${yyyy}, ${String(hours).padStart(2, '0')}:${min} ${ampm}`;
  }
}

// Aliases for backward compatibility
export const getKolkataDateString = getSystemDateString;
export const getKolkataTimeString = getSystemTimeString;
export const formatKolkataDateTime = formatSystemDateTime;

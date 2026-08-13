/**
 * Standardized Date and Time Formatter for CustomerPulse
 * 
 * Follows System / Server Timezone
 * Rules:
 * 1. Date format: DD-MM-YYYY (e.g. 07-08-2026)
 * 2. Time format: 12-hour hh:mm am/pm (e.g. 07:35 pm)
 * 3. Combined format: DD-MM-YYYY, hh:mm am/pm
 */

// Helper to pad single digits with leading zero
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Extracts system local date and time parts from any Date / ISO / timestamp input
 */
const getSystemParts = (input) => {
  if (!input) return null;

  // Handles DD-MM-YYYY input strings directly
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(input.trim())) {
    return { dateFormatted: input.trim() };
  }

  // Handles YYYY-MM-DD string without time component
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const [yyyy, mm, dd] = input.trim().split('-');
    return { dateFormatted: `${dd}-${mm}-${yyyy}` };
  }

  // Handles strings formatted like "DD-MM-YYYY, hh:mm am/pm"
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4},\s*\d{1,2}:\d{2}\s*(am|pm)$/i.test(input.trim())) {
    const clean = input.trim();
    const parts = clean.split(',');
    return {
      dateFormatted: parts[0].trim(),
      timeFormatted: parts[1].trim(),
      combined: clean
    };
  }

  let dateObj = input;

  if (typeof input === 'string') {
    let str = input.trim();

    // Check if string explicitly specifies UTC ('Z') or offset (+05:30 / -07:00)
    if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
      dateObj = new Date(str);
    } else {
      // Local string without UTC marker (e.g. "2026-08-07 14:38:00" or "2026-08-07T14:38:00")
      if (/^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}/.test(str)) {
        const [dPart, tPart] = str.replace(' ', 'T').split('T');
        const [yyyy, mm, dd] = dPart.split('-');
        const timeSub = tPart.substring(0, 5);
        const [hStr, minStr] = timeSub.split(':');
        let hours = parseInt(hStr, 10);
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12 || 12;

        const dateFormatted = `${dd}-${mm}-${yyyy}`;
        const timeFormatted = `${pad2(hours)}:${minStr} ${ampm}`;
        const combined = `${dateFormatted}, ${timeFormatted}`;
        return { dateFormatted, timeFormatted, combined };
      }
      dateObj = new Date(str);
    }
  }

  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  if (isNaN(d.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
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

    const dd = map.day ? String(map.day).padStart(2, '0') : '01';
    const mm = map.month ? String(map.month).padStart(2, '0') : '01';
    const yyyy = map.year || String(d.getFullYear());
    let hh = map.hour || '12';
    const min = map.minute ? String(map.minute).padStart(2, '0') : '00';
    const ampm = (map.dayPeriod || (d.getHours() >= 12 ? 'pm' : 'am')).toLowerCase();

    const dateFormatted = `${dd}-${mm}-${yyyy}`;
    const timeFormatted = `${hh}:${min} ${ampm}`;
    const combined = `${dateFormatted}, ${timeFormatted}`;

    return { dateFormatted, timeFormatted, combined };
  } catch (err) {
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const minutes = pad2(d.getMinutes());
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return {
      dateFormatted: `${dd}-${mm}-${yyyy}`,
      timeFormatted: `${pad2(hours)}:${minutes} ${ampm}`,
      combined: `${dd}-${mm}-${yyyy}, ${pad2(hours)}:${minutes} ${ampm}`
    };
  }
};

/**
 * Format a Date object or parseable date input to DD-MM-YYYY in System Local Time
 * @param {string|Date|number} input 
 * @returns {string} e.g. "07-08-2026"
 */
export const formatDate = (input) => {
  if (!input) return '—';
  const parts = getSystemParts(input);
  return parts?.dateFormatted || '—';
};

/**
 * Format a time input to 12-hour format: hh:mm am/pm in System Local Time
 * @param {string|Date} input - e.g. "14:30", "08:49:00", or ISO Date
 * @returns {string} e.g. "07:35 pm"
 */
export const formatTime = (input) => {
  if (!input) return '';
  if (input instanceof Date || (typeof input === 'string' && input.includes('T'))) {
    const parts = getSystemParts(input);
    return parts?.timeFormatted || '';
  }
  if (typeof input === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(input.trim())) {
    const parts = input.trim().split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].substring(0, 2);
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${pad2(hours)}:${minutes} ${ampm}`;
  }
  const parts = getSystemParts(input);
  return parts?.timeFormatted || '';
};

/**
 * Returns current system date string (YYYY-MM-DD)
 */
export const getCurrentSystemDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * Returns current 24-hour system time string (HH:mm)
 */
export const getCurrentSystemTime = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const getCurrentKolkataDate = getCurrentSystemDate;
export const getCurrentKolkataTime = getCurrentSystemTime;

/**
 * Format date and time together: DD-MM-YYYY, hh:mm am/pm in System Local Time
 * @param {string|Date} dateStr - Date string (YYYY-MM-DD) or ISO timestamp
 * @param {string} [timeStr] - Time string (HH:mm)
 * @param {string|Date} [timestampStr] - Fallback ISO timestamp
 * @returns {string} e.g. "07-08-2026, 07:35 pm"
 */
export const formatDateTime = (dateStr, timeStr, timestampStr) => {
  // 1. Prioritize explicit dateStr and timeStr (system/mail logged date & time)
  if (dateStr && timeStr && typeof dateStr === 'string' && typeof timeStr === 'string' && dateStr !== '—' && timeStr.trim()) {
    const dateFormatted = formatDate(dateStr);
    const timeFormatted = formatTime(timeStr);
    if (dateFormatted !== '—' && timeFormatted) {
      return `${dateFormatted}, ${timeFormatted}`;
    }
  }

  // 2. Check if dateStr is a date string without T (e.g. YYYY-MM-DD)
  if (dateStr && typeof dateStr === 'string' && dateStr !== '—' && !dateStr.includes('T')) {
    const dateFormatted = formatDate(dateStr);
    const timeFormatted = timeStr ? formatTime(timeStr) : '';
    if (dateFormatted !== '—') {
      return timeFormatted ? `${dateFormatted}, ${timeFormatted}` : dateFormatted;
    }
  }

  // 3. Fallback to ISO timestamp string (contains 'T') or Date object
  const isoCandidate = [timestampStr, dateStr, timeStr].find(
    s => s && (s instanceof Date || (typeof s === 'string' && s.includes('T')))
  );

  if (isoCandidate) {
    const parts = getSystemParts(isoCandidate);
    if (parts?.combined) return parts.combined;
    if (parts?.dateFormatted) return parts.dateFormatted;
  }

  // 4. Final fallbacks
  for (const item of [timestampStr, dateStr, timeStr]) {
    if (item && item !== '—') {
      const parts = getSystemParts(item);
      if (parts?.combined) return parts.combined;
      if (parts?.dateFormatted) return parts.dateFormatted;
    }
  }

  return '—';
};

/**
 * Formats a notification date to DD-MM-YYYY, hh:mm am/pm in System Local Time
 * @param {Object|string} notif 
 * @returns {string}
 */
export const formatNotificationTime = (notif) => {
  if (!notif) {
    const parts = getSystemParts(new Date().toISOString());
    return parts?.combined || '—';
  }
  
  if (typeof notif === 'object') {
    if (notif.date && notif.time) {
      return formatDateTime(notif.date, notif.time, notif.timestamp || notif.createdAt || notif.created_at);
    }
    const rawDate = notif.timestamp || notif.createdAt || notif.created_at || notif.date || notif.scheduledAt;
    if (rawDate) {
      const parts = getSystemParts(rawDate);
      if (parts?.combined) return parts.combined;
      if (parts?.dateFormatted) return parts.dateFormatted;
    }
  }

  const parts = getSystemParts(notif);
  return parts?.combined || parts?.dateFormatted || '—';
};

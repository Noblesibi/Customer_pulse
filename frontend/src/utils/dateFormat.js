/**
 * Standardized Date and Time Formatter for CustomerPulse
 * 
 * Rules:
 * 1. Date format: DD-MM-YYYY (e.g. 29-10-2026)
 * 2. Time format: HH:mm (24-hour e.g. 14:35)
 * 3. Combined format: DD-MM-YYYY, HH:mm (e.g. 29-10-2026, 14:35)
 */

// Helper to pad single digits with leading zero
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Normalizes any time representation to 24-hour "HH:mm"
 * e.g. "7:35 pm" -> "19:35", "07:35 am" -> "07:35", "14:30:00" -> "14:30"
 * @param {string|Date|number} input 
 * @returns {string} e.g. "14:35"
 */
export const formatTime = (input) => {
  if (!input) return '';

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    return `${pad2(input.getHours())}:${pad2(input.getMinutes())}`;
  }

  if (typeof input === 'number') {
    const d = new Date(input);
    if (isNaN(d.getTime())) return '';
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  if (typeof input === 'string') {
    const str = input.trim();
    if (!str || str === '—') return '';

    // "hh:mm am/pm" or "h:mm am/pm"
    const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2];
      const isPm = ampmMatch[3].toLowerCase() === 'pm';
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      return `${pad2(hours)}:${minutes}`;
    }

    // "HH:mm" or "HH:mm:ss"
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      return `${pad2(hours)}:${minutes}`;
    }

    // String contains 'T' or space with date (e.g. "2026-10-29 14:30:00" or ISO)
    if (str.includes('T') || /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(str)) {
      const d = new Date(str.includes('T') ? str : str.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        try {
          const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          const parts = formatter.formatToParts(d);
          const map = {};
          parts.forEach(p => { map[p.type] = p.value; });
          let hh = map.hour || '00';
          if (hh === '24') hh = '00';
          return `${String(hh).padStart(2, '0')}:${map.minute ? String(map.minute).padStart(2, '0') : '00'}`;
        } catch {
          return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        }
      }
    }
  }

  const parts = getSystemParts(input);
  return parts?.timeFormatted || '';
};

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

  // Handles strings formatted like "DD-MM-YYYY, HH:mm" or "DD-MM-YYYY, hh:mm am/pm"
  if (typeof input === 'string' && /^\d{2}-\d{2}-\d{4},\s*.+$/i.test(input.trim())) {
    const clean = input.trim();
    const parts = clean.split(',');
    const dFormatted = parts[0].trim();
    const tFormatted = formatTime(parts[1]?.trim());
    return {
      dateFormatted: dFormatted,
      timeFormatted: tFormatted,
      combined: tFormatted ? `${dFormatted}, ${tFormatted}` : dFormatted
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
        const tFormatted = formatTime(tPart);
        const dateFormatted = `${dd}-${mm}-${yyyy}`;
        const combined = tFormatted ? `${dateFormatted}, ${tFormatted}` : dateFormatted;
        return { dateFormatted, timeFormatted: tFormatted, combined };
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
      hour12: false
    });

    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });

    const dd = map.day ? String(map.day).padStart(2, '0') : '01';
    const mm = map.month ? String(map.month).padStart(2, '0') : '01';
    const yyyy = map.year || String(d.getFullYear());
    let hh = map.hour || '00';
    if (hh === '24') hh = '00';
    const min = map.minute ? String(map.minute).padStart(2, '0') : '00';

    const dateFormatted = `${dd}-${mm}-${yyyy}`;
    const timeFormatted = `${String(hh).padStart(2, '0')}:${min}`;
    const combined = `${dateFormatted}, ${timeFormatted}`;

    return { dateFormatted, timeFormatted, combined };
  } catch (err) {
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const hours = pad2(d.getHours());
    const minutes = pad2(d.getMinutes());
    return {
      dateFormatted: `${dd}-${mm}-${yyyy}`,
      timeFormatted: `${hours}:${minutes}`,
      combined: `${dd}-${mm}-${yyyy}, ${hours}:${minutes}`
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
 * Returns current system date string (YYYY-MM-DD) for HTML inputs
 */
export const getCurrentSystemDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * Returns current formatted date string (DD-MM-YYYY)
 */
export const getCurrentFormattedDate = () => {
  const d = new Date();
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
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
 * Format date and time together: DD-MM-YYYY, HH:mm in System Local Time
 * @param {string|Date|Object} dateStr - Date string (YYYY-MM-DD), ISO timestamp, or activity item object
 * @param {string} [timeStr] - Time string (HH:mm)
 * @param {string|Date} [timestampStr] - Fallback ISO timestamp
 * @returns {string} e.g. "07-08-2026, 19:35"
 */
export const formatDateTime = (dateStr, timeStr, timestampStr) => {
  // 0. Support passing an object directly: formatDateTime(item)
  if (dateStr && typeof dateStr === 'object' && !(dateStr instanceof Date)) {
    const item = dateStr;
    const d = item.date || item.dueDate;
    const t = item.time;
    const ts = item.timestamp || item.createdAt;
    return formatDateTime(d, t, ts);
  }

  // 1. If timestampStr (or dateStr) has a UTC ISO timestamp (with 'Z' or offset), convert it using getSystemParts which uses Asia/Kolkata timezone
  const isoUtcCandidate = [timestampStr, dateStr].find(
    s => typeof s === 'string' && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s))
  );
  if (isoUtcCandidate) {
    const parts = getSystemParts(isoUtcCandidate);
    if (parts?.combined) return parts.combined;
  }

  // 2. Prioritize explicit dateStr and timeStr (system/mail logged date & time)
  if (dateStr && timeStr && typeof dateStr === 'string' && typeof timeStr === 'string' && dateStr !== '—' && timeStr.trim()) {
    const dateFormatted = formatDate(dateStr);
    const timeFormatted = formatTime(timeStr);
    if (dateFormatted !== '—' && timeFormatted) {
      return `${dateFormatted}, ${timeFormatted}`;
    }
    if (dateFormatted !== '—') return dateFormatted;
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
 * Formats a notification date to DD-MM-YYYY, HH:mm in System Local Time
 * @param {Object|string} notif 
 * @returns {string} e.g. "07-08-2026, 19:35"
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

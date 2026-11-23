import { StatusPresensi } from '../types';

/**
 * Parses user input into a standardized 24-hour HH:mm string.
 * Examples:
 * - 630 -> 06:30
 * - 0630 -> 06:30
 * - 6.30 / 6,30 / 6:30 -> 06:30
 * - 7 -> 07:00
 * - 715 -> 07:15
 * - 1330 -> 13:30
 * - 999 / 2500 / 6099 -> invalid
 */
export function parseAndFormat24hTime(raw: string): { formatted: string; isValid: boolean; error?: string } {
  if (!raw || !raw.trim()) {
    return { formatted: '', isValid: true };
  }

  const trimmed = raw.trim();

  // Handle Date strings from Google Sheets e.g. "Sat Dec 30 1899 06:30:00 GMT..." or ISO "1899-12-30T06:30:00.000Z"
  if (trimmed.length > 8 || trimmed.includes('GMT') || trimmed.includes('Dec') || trimmed.includes('Jan') || trimmed.includes('1899') || trimmed.includes('T')) {
    const timeMatch = trimmed.match(/(?:^|\s|T)(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return {
          formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          isValid: true
        };
      }
    }
  }

  const cleaned = trimmed.replace(/[.,]/g, ':');

  // Case 1: Pure digits (no colons)
  if (/^\d+$/.test(cleaned)) {
    const len = cleaned.length;

    // 1 or 2 digits e.g. "7" -> "07:00", "13" -> "13:00"
    if (len === 1 || len === 2) {
      const hours = parseInt(cleaned, 10);
      if (hours >= 0 && hours <= 23) {
        return {
          formatted: `${String(hours).padStart(2, '0')}:00`,
          isValid: true
        };
      }
    }
    // 3 digits e.g. "630" -> "06:30", "715" -> "07:15"
    else if (len === 3) {
      const hours = parseInt(cleaned.substring(0, 1), 10);
      const minutes = parseInt(cleaned.substring(1, 3), 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return {
          formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          isValid: true
        };
      }
    }
    // 4 digits e.g. "0630" -> "06:30", "1330" -> "13:30"
    else if (len === 4) {
      const hours = parseInt(cleaned.substring(0, 2), 10);
      const minutes = parseInt(cleaned.substring(2, 4), 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return {
          formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          isValid: true
        };
      }
    }

    return {
      formatted: raw,
      isValid: false,
      error: 'Jam tidak valid (Gunakan 00:00 - 23:59, contoh: 630, 0715, 1330)'
    };
  }

  // Case 2: Contains colon e.g. "6:30", "06:30", "13:05", "07:25:00"
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return {
          formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          isValid: true
        };
      }
    }
  }

  return {
    formatted: raw,
    isValid: false,
    error: 'Format jam tidak valid (contoh: 06:30, 630, 13:30)'
  };
}

/**
 * Converts HH:mm string to minutes from midnight (0..1439).
 */
export function timeToMinutes(timeStr: string): number | null {
  if (!timeStr || timeStr === '-') return null;
  const parsed = parseAndFormat24hTime(timeStr);
  if (!parsed.isValid || !parsed.formatted) return null;
  const [h, m] = parsed.formatted.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Converts minutes from midnight to HH:mm 24-hour string.
 */
export function minutesToTime(minutes: number): string {
  if (isNaN(minutes) || minutes < 0) return '00:00';
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Auto status evaluation with 24h parsed values.
 */
export function evaluateStatus24h(jamDatangStr: string, thresholdStr: string = '07:30'): StatusPresensi {
  if (!jamDatangStr || jamDatangStr === '-') return 'Tepat Waktu';

  const arrivalMin = timeToMinutes(jamDatangStr);
  const threshMin = timeToMinutes(thresholdStr) ?? 450; // 07:30 default = 450 min

  if (arrivalMin === null) return 'Tepat Waktu';

  return arrivalMin > threshMin ? 'Terlambat' : 'Tepat Waktu';
}

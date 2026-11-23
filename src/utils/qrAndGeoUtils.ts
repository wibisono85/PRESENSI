/**
 * Utility for QR Code generation, parsing, GPS Geofencing, Audio feedback, and Device Locking.
 */
import { MasterGuruStaf } from '../types';

export const DEFAULT_SCHOOL_COORDS = {
  latitude: -8.009330,
  longitude: 114.421731,
  radiusMeters: 100,
  secret: 'SMP-NA-PRESENSI-2026'
};

/**
 * Normalizes coordinate values against locale corruption (e.g. -80095497 or comma separators).
 * Checks valid geographic ranges:
 * - Latitude: -11 to 6 (Indonesia)
 * - Longitude: 95 to 141 (Indonesia)
 */
export function normalizeCoordinate(
  raw: any,
  type: 'lat' | 'lng',
  fallback: number
): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }

  const str = String(raw).trim().replace(',', '.');
  const val = parseFloat(str);

  if (isNaN(val)) {
    return fallback;
  }

  const inRange = (num: number): boolean => {
    return type === 'lat' ? num >= -11 && num <= 6 : num >= 95 && num <= 141;
  };

  if (inRange(val)) {
    return val;
  }

  // Coba bagi dengan 10, 100, ... sampai 10^9, dan ambil pembagian pertama yang jatuh di dalam rentang
  for (let exp = 1; exp <= 9; exp++) {
    const candidate = val / Math.pow(10, exp);
    if (inRange(candidate)) {
      return candidate;
    }
  }

  return fallback;
}

/**
 * Calculates geographical distance between two lat/lng coordinates in meters using the Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Generates or retrieves the standard QR code string for a teacher/staff member.
 */
export function getTeacherQrCode(teacher: MasterGuruStaf): string {
  if (teacher.kodeUnik && teacher.kodeUnik.trim()) {
    return teacher.kodeUnik.trim();
  }
  const cleanNum = String(teacher.no || 1).padStart(3, '0');
  return `NA-GURU-${cleanNum}`;
}

/**
 * Generates the direct URL encoded in QR codes for scanning via Google Search Lens / Phone Camera.
 * When a teacher scans this with Google Lens, it directly opens the browser to confirm attendance!
 */
export function getTeacherDirectUrl(teacher: MasterGuruStaf, customOrigin?: string): string {
  let base = customOrigin;
  if (!base && typeof window !== 'undefined') {
    base = window.location.origin + window.location.pathname;
  }
  if (!base) base = '';
  const cleanBase = base.replace(/\/+$/, '');
  const code = getTeacherQrCode(teacher);
  return `${cleanBase}?action=presensi&kode=${encodeURIComponent(code)}&nama=${encodeURIComponent(teacher.nama)}`;
}

/**
 * Generates direct URL for School Gate poster scannable with Google Lens.
 */
export function getSchoolGateDirectUrl(secret: string = DEFAULT_SCHOOL_COORDS.secret, customOrigin?: string): string {
  let base = customOrigin;
  if (!base && typeof window !== 'undefined') {
    base = window.location.origin + window.location.pathname;
  }
  if (!base) base = '';
  const cleanBase = base.replace(/\/+$/, '');
  const token = secret || DEFAULT_SCHOOL_COORDS.secret;
  return `${cleanBase}?action=gerbang&token=${encodeURIComponent(token)}`;
}

/**
 * Normalizes teacher name by stripping academic and religious degrees for robust matching.
 * e.g. "Ahmad Zaini, M.Pd" and "Ahmad Zaini, S.Pd.I, M.Pd" both reduce to "ahmadzaini"
 */
export function cleanTeacherName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(s\.pd\.i|s\.pd|m\.pd|s\.kom|s\.mat|ss|s\.fil|drs|dr|ust|h|hj|sh|se|ba)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Finds a teacher from master list based on a scanned QR text, URL or code.
 */
export function findTeacherByQrCode(
  scannedText: string,
  masterList: MasterGuruStaf[]
): MasterGuruStaf | undefined {
  if (!scannedText) return undefined;
  const trimmed = scannedText.trim();

  // 1. Try parsing if it is a full URL (e.g. from Google Lens / QR with URL)
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('?')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.app/${trimmed.startsWith('?') ? trimmed : '?' + trimmed}`);
      const kodeParam = url.searchParams.get('kode');
      const namaParam = url.searchParams.get('nama') || url.searchParams.get('guru');

      if (kodeParam) {
        const match = masterList.find(m => getTeacherQrCode(m).toLowerCase() === kodeParam.toLowerCase());
        if (match) return match;
      }
      if (namaParam) {
        const match = masterList.find(m => m.nama.trim().toLowerCase() === namaParam.trim().toLowerCase()) ||
          masterList.find(m => cleanTeacherName(m.nama) === cleanTeacherName(namaParam));
        if (match) return match;
      }
    }
  } catch (e) {
    // Not a valid URL, continue
  }

  // 2. Try matching JSON format
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.kodeUnik) {
      const match = masterList.find(m => getTeacherQrCode(m).toLowerCase() === parsed.kodeUnik.toLowerCase());
      if (match) return match;
    }
    if (parsed.nama) {
      const match = masterList.find(m => m.nama.trim().toLowerCase() === parsed.nama.trim().toLowerCase()) ||
        masterList.find(m => cleanTeacherName(m.nama) === cleanTeacherName(parsed.nama));
      if (match) return match;
    }
  } catch (e) {
    // Not JSON
  }

  // 3. Try direct matching kodeUnik or generated code
  const matchByCode = masterList.find(m => {
    const code = getTeacherQrCode(m).toLowerCase();
    return code === trimmed.toLowerCase();
  });
  if (matchByCode) return matchByCode;

  // 4. Try matching full name (exact then degree-tolerant)
  const matchByName = masterList.find(m => m.nama.trim().toLowerCase() === trimmed.toLowerCase()) ||
    masterList.find(m => cleanTeacherName(m.nama) === cleanTeacherName(trimmed));
  if (matchByName) return matchByName;

  // 5. Try matching partial code inside text
  const matchBySubstring = masterList.find(m => {
    const code = getTeacherQrCode(m);
    return trimmed.includes(code);
  });
  if (matchBySubstring) return matchBySubstring;

  return undefined;
}

/**
 * Creates the encoded content for the Official School QR Poster.
 */
export function getSchoolQrContent(secret: string = DEFAULT_SCHOOL_COORDS.secret): string {
  return getSchoolGateDirectUrl(secret);
}

/**
 * Validates whether the scanned code belongs to the official school QR poster.
 */
export function validateSchoolQr(scannedText: string, expectedSecret: string): boolean {
  if (!scannedText) return false;
  const trimmed = scannedText.trim();
  const secret = expectedSecret || DEFAULT_SCHOOL_COORDS.secret;

  // Direct string match
  if (trimmed === secret) return true;

  // URL match
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('token=')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.app/?${trimmed}`);
      const token = url.searchParams.get('token');
      if (token === secret) return true;
    }
  } catch (e) {
    // Not URL
  }

  try {
    const json = JSON.parse(trimmed);
    if (json.type === 'SMP_NA_GATE_QR' || json.secret === secret || json.school?.includes('SMP Nurul Abror')) {
      return true;
    }
  } catch (e) {
    // Not JSON
  }

  if (trimmed.includes('SMP-NA') || trimmed.includes(secret)) {
    return true;
  }

  return false;
}

/**
 * Plays a pleasant audio chime when presensi is successfully scanned.
 */
export function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // 1st note (C6 ~ 1046 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);

    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.log('Audio playback error (ignored):', e);
  }
}

/**
 * Plays a soft alert tone on scan failure or rejected geofence.
 */
export function playErrorBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.log('Audio error:', e);
  }
}

/**
 * Device Lock / Anti-Titip Absen helper:
 * Verifies if this device was already used by another teacher today.
 */
const DEVICE_LOCK_KEY_PREFIX = 'smp_na_device_lock_';

export function checkDeviceLock(
  todayISO: string,
  teacherNama: string
): { allowed: boolean; lockedToName?: string } {
  const key = `${DEVICE_LOCK_KEY_PREFIX}${todayISO}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    return { allowed: true };
  }

  const cleanCurrent = teacherNama.trim().toLowerCase();
  const cleanStored = stored.trim().toLowerCase();

  if (cleanCurrent === cleanStored) {
    return { allowed: true, lockedToName: stored };
  }

  return { allowed: false, lockedToName: stored };
}

export function recordDeviceLock(todayISO: string, teacherNama: string): void {
  const key = `${DEVICE_LOCK_KEY_PREFIX}${todayISO}`;
  localStorage.setItem(key, teacherNama.trim());
}

/**
 * Saved active profile on this mobile phone (so teacher doesn't have to select name every morning).
 */
const SAVED_PROFILE_KEY = 'smp_na_my_teacher_profile';

export function getSavedTeacherProfile(): string {
  return localStorage.getItem(SAVED_PROFILE_KEY) || '';
}

export function saveTeacherProfile(nama: string): void {
  localStorage.setItem(SAVED_PROFILE_KEY, nama.trim());
}

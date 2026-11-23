import { HariSekolah, JadwalSlot, MasterGuruStaf, StatusPresensi } from '../types';
import { evaluateStatus24h } from './timeUtils';
import { buildMapelString } from './jadwalEngine';

export const DAYS_ID: HariSekolah[] = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Returns YYYY-MM-DD for a given Date object or today.
 */
export function formatDateISO(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns HH:mm for a given Date object or now.
 */
export function formatTimeHHMM(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Returns YYYY-MM-DD HH:mm:ss for timestamp.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const isoDate = formatDateISO(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${isoDate} ${hh}:${mm}:${ss}`;
}

/**
 * Gets the Indonesian day name for a YYYY-MM-DD date string or Date object.
 */
export function getHariFromDate(dateInput: string | Date): HariSekolah {
  let dateObj: Date;
  if (typeof dateInput === 'string') {
    // Parse YYYY-MM-DD cleanly without timezone shift
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      dateObj = new Date(dateInput);
    }
  } else {
    dateObj = dateInput;
  }

  const dayIndex = dateObj.getDay(); // 0 is Sunday (Ahad), 6 is Saturday (Sabtu)
  return DAYS_ID[dayIndex];
}

/**
 * Gets a human-readable long date format in Indonesian, e.g. "Sabtu, 10 Agustus 2026"
 */
export function formatLongDateIndonesian(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const dateObj = new Date(year, month, day);
  const hari = DAYS_ID[dateObj.getDay()];

  const bulanIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return `${hari}, ${day} ${bulanIndo[month]} ${year}`;
}

/**
 * Extracts the subject taught by a teacher/staff on a given day.
 */
export function getMapelHariIni(guru: MasterGuruStaf, hari: HariSekolah, jadwal?: JadwalSlot[]): string {
  if (hari === 'Jumat') {
    return 'Libur Sekolah (Hari Jumat)';
  }
  return buildMapelString(guru, hari, jadwal);
}

/**
 * Auto determines status (Tepat Waktu vs Terlambat) based on arrival time vs threshold (default 07:30).
 * Handles flexible formats (colon 07:25, dot 07.25, single digits 715) safely via minute-based calculation.
 */
export function determineAutoStatus(jamDatang: string, threshold: string = '07:30'): StatusPresensi {
  return evaluateStatus24h(jamDatang, threshold);
}

/**
 * Filters master list of teachers and staff based on active day schedule.
 * - Non "Guru Mata Pelajaran" (structural staff) are ALWAYS shown every day.
 * - "Guru Mata Pelajaran" are ONLY shown if they have a teaching schedule on the given day.
 * - If showAll is true, returns the entire list unfiltered.
 */
export function filterTeachersForDay(
  masterList: MasterGuruStaf[],
  hari: HariSekolah,
  showAll: boolean = false
): MasterGuruStaf[] {
  if (showAll) return masterList;

  return masterList.filter((m) => {
    if (!m.nama || !m.nama.trim()) return false;
    
    // Check if jabatan is strictly "Guru Mata Pelajaran" (case-insensitive)
    const normalizedJabatan = (m.jabatan || '').trim().toLowerCase();
    const isGuruMapelOnly = normalizedJabatan === 'guru mata pelajaran';

    // Structural staff (not just Guru Mapel) are always included
    if (!isGuruMapelOnly) {
      return true;
    }

    // For Guru Mata Pelajaran, check their teaching schedule for the day
    const mapel = getMapelHariIni(m, hari);
    return Boolean(mapel && mapel !== '-' && !mapel.toLowerCase().includes('libur'));
  });
}

/**
 * Checks if a day is Friday.
 */
export function isJumat(hari: HariSekolah): boolean {
  return hari === 'Jumat';
}

/**
 * Gets date range for current week (Ahad/Sabtu to today).
 */
export function getThisWeekRangeISO(): { startDate: string; endDate: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday
  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek); // Start of week (Sunday/Ahad)
  
  return {
    startDate: formatDateISO(start),
    endDate: formatDateISO(now)
  };
}

/**
 * Gets date range for current month (1st to last day of current month).
 */
export function getThisMonthRangeISO(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    startDate: formatDateISO(firstDay),
    endDate: formatDateISO(lastDay)
  };
}

/**
 * Gets date range for previous month.
 */
export function getLastMonthRangeISO(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  return {
    startDate: formatDateISO(firstDay),
    endDate: formatDateISO(lastDay)
  };
}


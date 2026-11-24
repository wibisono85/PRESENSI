import { MasterGuruStaf, HariSekolah, StatusPresensi, AppSettings, JadwalSlot, AttendanceRuleMode } from '../types';
import { timeToMinutes, minutesToTime, evaluateStatus24h } from './timeUtils';
import { buildMapelString, isJadwalTidakDitemukan, cariKodeGuru, slotsDariOfficial } from './jadwalEngine';

export const KODE_MAPEL_MAP: Record<string, string> = {
  'A': 'PKN',
  'B': 'Bahasa Indonesia',
  'C': 'Bahasa Inggris',
  'D': 'IPA',
  'E': 'Matematika',
  'F': 'IPS',
  'G': 'TIK',
  'H': 'Prakarya',
  'I': 'Tata Busana',
  'J': 'Fiqh',
  'K': 'Akhlak',
  'L': 'Tauhid',
  'M': 'Tarikh'
};

export function splitRespectingParens(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(' || char === '[' || char === '{') {
      parenDepth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      if (parenDepth > 0) parenDepth--;
      current += char;
    } else if ((char === ',' || char === ';' || char === '|') && parenDepth === 0) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

export function formatNamaKelas(rawKelas: string): string {
  if (!rawKelas) return '-';
  const clean = rawKelas.trim();
  // Handle multiple classes separated by comma or ampersand
  if (clean.includes(',') || clean.includes('&') || clean.toLowerCase().includes('dan')) {
    return clean
      .split(/[,&]+|\bdan\b/i)
      .map(c => formatNamaKelas(c.trim()))
      .filter(Boolean)
      .join(', ');
  }

  const k = clean.toUpperCase().replace(/^KELAS\s*/i, '').trim();
  // Check 8 / VIII first before 7 / VII because VII is substring prefix of VIII!
  if (k.startsWith('8') || k.startsWith('VIII')) {
    const suffix = k.replace(/^VIII\s*|^8\s*/, '').trim();
    return 'Kelas 8' + suffix;
  }
  if (k.startsWith('9') || k.startsWith('IX')) {
    const suffix = k.replace(/^IX\s*|^9\s*/, '').trim();
    return 'Kelas 9' + suffix;
  }
  if (k.startsWith('7') || k.startsWith('VII')) {
    const suffix = k.replace(/^VII\s*|^7\s*/, '').trim();
    return 'Kelas 7' + suffix;
  }
  return clean.toUpperCase().startsWith('KELAS') ? clean : 'Kelas ' + clean;
}

export function getNamaMapelFromKode(kode: string): string {
  if (!kode) return '-';
  const clean = kode.trim();
  const upper = clean.toUpperCase();

  if (upper === '22K' || upper === 'K' || upper === 'AKHLAK') return 'Akhlak';
  if (upper === 'L' || upper === 'TAUHID') return 'Tauhid';
  if (upper === 'D' || upper === 'IPA') return 'IPA';
  if (upper === 'A' || upper === 'PKN') return 'PKN';
  if (upper === 'B' || upper === 'BAHASA INDONESIA' || upper === 'B. INDO' || upper === 'BINDO') return 'Bahasa Indonesia';
  if (upper === 'C' || upper === 'BAHASA INGGRIS' || upper === 'B. INGGRIS' || upper === 'BING') return 'Bahasa Inggris';
  if (upper === 'E' || upper === 'MATEMATIKA') return 'Matematika';
  if (upper === 'F' || upper === 'IPS') return 'IPS';
  if (upper === 'G' || upper === 'TIK') return 'TIK';
  if (upper === 'H' || upper === 'PRAKARYA') return 'Prakarya';
  if (upper === 'I' || upper === 'TATA BUSANA') return 'Tata Busana';
  if (upper === 'J' || upper === 'FIQH' || upper === 'FIQIH') return 'Fiqih';
  if (upper === 'M' || upper === 'TARIKH') return 'Tarikh';

  if (upper.endsWith('K')) return 'Akhlak';
  if (upper.endsWith('L')) return 'Tauhid';

  return KODE_MAPEL_MAP[upper] || clean;
}

export interface ParsedSesiPelajaran {
  sesiKe: 'Sesi 1 (Jam I-II)' | 'Sesi 2 (Jam III-IV)' | 'Sesi 3 (Jam V-VI)';
  labelJam: string; // e.g. "Jam I-II", "Jam III-IV", "Jam V-VI"
  jamMulai: string; // "07:30", "08:30", "10:00"
  jamSelesai: string; // "08:30", "09:30", "11:00"
  kodeMapel: string; // e.g. "K"
  namaMapel: string; // e.g. "Akhlak"
  kelas: string; // e.g. "VII D"
  rawText: string;
}

/**
 * Standard timetable periods at SMP Nurul Abror Al-Robbaniyin (3 Sesi Inti per hari)
 */
export const TIGA_SESI_TIMINGS = [
  { sesi: 1, label: 'Jam I-II', start: '07:30', end: '08:30', waktu: '07.30 - 08.30' },
  { sesi: 2, label: 'Jam III-IV', start: '08:30', end: '09:30', waktu: '08.30 - 09.30' },
  { sesi: 3, label: 'Jam V-VI', start: '10:00', end: '11:00', waktu: '10.00 - 11.00' },
];

export interface TeacherDailyScheduleEvaluation {
  hasTeachingSchedule: boolean;
  isStaffOnly: boolean;
  mapelHariIni: string; // Format rapi diringkas 3 sesi
  ringkasanSesiText: string; // e.g. "Jam III-IV: Akhlak (Kelas VII D)"
  jamSatuKelas: string | null; // e.g. "Kelas VIII C" jika ada Jam 1, atau null
  jamSatuKeterangan: string; // e.g. "Jam I-II di Kelas VIII C (07:30)" atau "Tidak mengajar Jam 1 (Mulai Jam III-IV di VII D)"
  firstScheduleTime: string | null; // e.g. "08:30"
  startJamKe: number | null; // 1, 3, 5, etc.
  thresholdTime: string; // Schedule-based threshold
  sesiList: ParsedSesiPelajaran[];
  keteranganJadwal: string;
}

/**
 * Normalizes schedule string into standardized 3 sessions (Jam I-II, Jam III-IV, Jam V-VI)
 * Expands cryptic codes like "Jam 3-4: K (7D)" -> "Jam III-IV: Akhlak (Kelas VII D)"
 * Also gracefully handles simplified database inputs like "Tauhid (7A, 7B)" without breaking!
 */
export function parseAndFormatTigaSesi(rawSchedule: string): {
  formattedText: string;
  sesiList: ParsedSesiPelajaran[];
  earliestJamKe: number | null;
  earliestTime: string | null;
  jamSatuKelas: string | null;
} {
  const trimmed = (rawSchedule || '').trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'libur') {
    return {
      formattedText: '-',
      sesiList: [],
      earliestJamKe: null,
      earliestTime: null,
      jamSatuKelas: null
    };
  }

  const sesiList: ParsedSesiPelajaran[] = [];
  let earliestJamKe: number | null = null;
  let earliestTime: string | null = null;
  let jamSatuKelas: string | null = null;

  // Split safely without breaking commas inside parentheses
  const parts = splitRespectingParens(trimmed);

  for (const part of parts) {
    // Pattern 1: Matches "Jam 1-2: K (7D)", "Jam 3-4: Tauhid (7A, 7B)", "1-2: D (7A)"
    const matchWithJam = part.match(/(?:Jam\s*)?([0-9IVX]+(?:[-–][0-9IVX]+)?)\s*:\s*([A-Za-z0-9\s.]+?)\s*\(([^)]+)\)/i);

    // Pattern 2: Matches "Tauhid (7A, 7B)", "Akhlak (7D)", "22K (7D)", "L (7A)" without "Jam" prefix
    const matchWithoutJam = !matchWithJam ? part.match(/^([A-Za-z0-9\s.]+?)\s*\(([^)]+)\)$/i) : null;

    if (matchWithJam) {
      const jamStr = matchWithJam[1].trim().toUpperCase();
      const mapelRaw = matchWithJam[2].trim();
      const kelasRaw = matchWithJam[3].trim();
      const mapelNama = getNamaMapelFromKode(mapelRaw);

      // Check if multiple classes are given in one parenthesized block (e.g. 7A, 7B)
      const subClasses = kelasRaw.split(/[,&]+|\bdan\b/i).map(c => c.trim()).filter(Boolean);

      let sesiKe: ParsedSesiPelajaran['sesiKe'] = 'Sesi 1 (Jam I-II)';
      let labelJam = 'Jam I-II';
      let jamMulai = '07:30';
      let jamSelesai = '08:30';
      let numJam = 1;

      if (jamStr.includes('3') || jamStr.includes('4') || jamStr.includes('III') || jamStr.includes('IV')) {
        sesiKe = 'Sesi 2 (Jam III-IV)';
        labelJam = 'Jam III-IV';
        jamMulai = '08:30';
        jamSelesai = '09:30';
        numJam = 3;
      } else if (jamStr.includes('5') || jamStr.includes('6') || jamStr.includes('7') || jamStr.includes('V') || jamStr.includes('VI') || jamStr.includes('VII')) {
        sesiKe = 'Sesi 3 (Jam V-VI)';
        labelJam = 'Jam V-VI';
        jamMulai = '10:00';
        jamSelesai = '11:00';
        numJam = 5;
      } else {
        sesiKe = 'Sesi 1 (Jam I-II)';
        labelJam = 'Jam I-II';
        jamMulai = '07:30';
        jamSelesai = '08:30';
        numJam = 1;
      }

      // If user provided multiple classes for a multi-hour block (e.g. Jam 3-4: Tauhid (7A, 7B)):
      if (subClasses.length >= 2 && (numJam === 3 || numJam === 1)) {
        // Unpack into Sesi 2 (08:30) and Sesi 3 (10:00)
        const c1 = formatNamaKelas(subClasses[0]);
        const c2 = formatNamaKelas(subClasses[1]);

        if (numJam === 1) {
          if (!jamSatuKelas) jamSatuKelas = c1;
          if (earliestJamKe === null || 1 < earliestJamKe) {
            earliestJamKe = 1;
            earliestTime = '07:30';
          }
          sesiList.push({
            sesiKe: 'Sesi 1 (Jam I-II)',
            labelJam: 'Jam I-II',
            jamMulai: '07:30',
            jamSelesai: '08:30',
            kodeMapel: mapelRaw,
            namaMapel: mapelNama,
            kelas: c1,
            rawText: part
          });
          sesiList.push({
            sesiKe: 'Sesi 2 (Jam III-IV)',
            labelJam: 'Jam III-IV',
            jamMulai: '08:30',
            jamSelesai: '09:30',
            kodeMapel: mapelRaw,
            namaMapel: mapelNama,
            kelas: c2,
            rawText: part
          });
        } else {
          // numJam === 3
          if (earliestJamKe === null || 3 < earliestJamKe) {
            earliestJamKe = 3;
            earliestTime = '08:30';
          }
          sesiList.push({
            sesiKe: 'Sesi 2 (Jam III-IV)',
            labelJam: 'Jam III-IV',
            jamMulai: '08:30',
            jamSelesai: '09:30',
            kodeMapel: mapelRaw,
            namaMapel: mapelNama,
            kelas: c1,
            rawText: part
          });
          sesiList.push({
            sesiKe: 'Sesi 3 (Jam V-VI)',
            labelJam: 'Jam V-VI',
            jamMulai: '10:00',
            jamSelesai: '11:00',
            kodeMapel: mapelRaw,
            namaMapel: mapelNama,
            kelas: c2,
            rawText: part
          });
        }
      } else {
        const kelasFormatted = formatNamaKelas(kelasRaw);
        if (earliestJamKe === null || numJam < earliestJamKe) {
          earliestJamKe = numJam;
          earliestTime = jamMulai;
        }
        if (numJam === 1 && !jamSatuKelas) {
          jamSatuKelas = kelasFormatted;
        }
        sesiList.push({
          sesiKe,
          labelJam,
          jamMulai,
          jamSelesai,
          kodeMapel: mapelRaw,
          namaMapel: mapelNama,
          kelas: kelasFormatted,
          rawText: part
        });
      }
    } else if (matchWithoutJam) {
      // Pattern 2: e.g. "Tauhid (7A, 7B)" or "Akhlak (7D)" or "22K (7D)"
      const mapelRaw = matchWithoutJam[1].trim();
      const kelasRaw = matchWithoutJam[2].trim();
      const mapelNama = getNamaMapelFromKode(mapelRaw);
      const subClasses = kelasRaw.split(/[,&]+|\bdan\b/i).map(c => c.trim()).filter(Boolean);

      if (subClasses.length >= 2) {
        // Teacher teaching 2 classes in a day (e.g. Ustadz Ainur Rofiqi Tauhid 7A & 7B)
        const c1 = formatNamaKelas(subClasses[0]);
        const c2 = formatNamaKelas(subClasses[1]);

        if (earliestJamKe === null || 3 < earliestJamKe) {
          earliestJamKe = 3;
          earliestTime = '08:30';
        }

        sesiList.push({
          sesiKe: 'Sesi 2 (Jam III-IV)',
          labelJam: 'Jam III-IV',
          jamMulai: '08:30',
          jamSelesai: '09:30',
          kodeMapel: mapelRaw,
          namaMapel: mapelNama,
          kelas: c1,
          rawText: part
        });

        sesiList.push({
          sesiKe: 'Sesi 3 (Jam V-VI)',
          labelJam: 'Jam V-VI',
          jamMulai: '10:00',
          jamSelesai: '11:00',
          kodeMapel: mapelRaw,
          namaMapel: mapelNama,
          kelas: c2,
          rawText: part
        });
      } else {
        // Single class e.g. "Akhlak (7D)" or "22K (7D)"
        const singleClass = formatNamaKelas(subClasses[0] || kelasRaw);
        // Default to Sesi 2 (08:30 WIB) if not specified, typical for single session
        if (earliestJamKe === null || 3 < earliestJamKe) {
          earliestJamKe = 3;
          earliestTime = '08:30';
        }

        sesiList.push({
          sesiKe: 'Sesi 2 (Jam III-IV)',
          labelJam: 'Jam III-IV',
          jamMulai: '08:30',
          jamSelesai: '09:30',
          kodeMapel: mapelRaw,
          namaMapel: mapelNama,
          kelas: singleClass,
          rawText: part
        });
      }
    } else {
      // Pattern 3: Natural language e.g. "jam I-II kelas 8b mapel fiqih", "jam 1-2 kelas 8b fiqih", "jam V-VI kelas 7b fiqih"
      const p = part.trim();
      let labelJam = 'Jam I-II';
      let jamMulai = '07:30';
      let jamSelesai = '08:30';
      let sesiKe: ParsedSesiPelajaran['sesiKe'] = 'Sesi 1 (Jam I-II)';
      let numJam = 1;

      if (/\b(?:jam\s*)?(?:3[-–]4|III[-–]IV|ke[-– ]?[34])\b/i.test(p) || /(?:^|\s)[34](?:[-–][34])?(?::|\s)/i.test(p)) {
        labelJam = 'Jam III-IV';
        jamMulai = '08:30';
        jamSelesai = '09:30';
        sesiKe = 'Sesi 2 (Jam III-IV)';
        numJam = 3;
      } else if (/\b(?:jam\s*)?(?:5[-–]6|6[-–]7|V[-–]VI|VI[-–]VII|ke[-– ]?[567])\b/i.test(p) || /(?:^|\s)[567](?:[-–][567])?(?::|\s)/i.test(p)) {
        labelJam = 'Jam V-VI';
        jamMulai = '10:00';
        jamSelesai = '11:00';
        sesiKe = 'Sesi 3 (Jam V-VI)';
        numJam = 5;
      } else {
        labelJam = 'Jam I-II';
        jamMulai = '07:30';
        jamSelesai = '08:30';
        sesiKe = 'Sesi 1 (Jam I-II)';
        numJam = 1;
      }

      // Detect class
      let rawKelas = '';
      const parenMatch = p.match(/\((?:kelas\s*)?([^)]+)\)/i);
      if (parenMatch) {
        rawKelas = parenMatch[1].trim();
      } else {
        const kelasWordMatch = p.match(/\bkelas\s*([0-9IVX]+(?:\s*[a-zA-Z])?)\b/i);
        if (kelasWordMatch) {
          rawKelas = kelasWordMatch[1].trim();
        } else {
          const classCodeMatch = p.match(/\b([789]|VII|VIII|IX)\s*([A-Ha-h])\b/i);
          if (classCodeMatch) {
            rawKelas = classCodeMatch[1] + classCodeMatch[2];
          }
        }
      }

      // Detect subject (mapel)
      let rawMapel = '';
      const mapelWordMatch = p.match(/\bmapel\s*(?::\s*)?([a-zA-Z\s.]+?)(?:\s+kelas|\s*\(|$)/i);
      if (mapelWordMatch) {
        rawMapel = mapelWordMatch[1].trim();
      } else {
        const colonMatch = p.match(/:\s*([A-Za-z0-9\s.]+?)\s*(?:\(|$)/);
        if (colonMatch) {
          rawMapel = colonMatch[1].trim();
        } else {
          const knownSubjects = [
            ['fiqih', 'Fiqih'], ['fiqh', 'Fiqih'], ['akhlak', 'Akhlak'], ['tauhid', 'Tauhid'],
            ['tarikh', 'Tarikh'], ['ipa', 'IPA'], ['matematika', 'Matematika'],
            ['bahasa indonesia', 'Bahasa Indonesia'], ['bahasa inggris', 'Bahasa Inggris'],
            ['ips', 'IPS'], ['pkn', 'PKN'], ['tik', 'TIK'], ['prakarya', 'Prakarya'], ['tata busana', 'Tata Busana']
          ];
          for (const [k, v] of knownSubjects) {
            if (p.toLowerCase().includes(k)) {
              rawMapel = v;
              break;
            }
          }
        }
      }

      const mapelNama = rawMapel ? getNamaMapelFromKode(rawMapel) : p.replace(/[()]/g, '').trim();
      const kelasFormatted = rawKelas ? formatNamaKelas(rawKelas) : 'Aktif';

      if (rawKelas || rawMapel) {
        if (earliestJamKe === null || numJam < earliestJamKe) {
          earliestJamKe = numJam;
          earliestTime = jamMulai;
        }
        if (numJam === 1 && !jamSatuKelas && kelasFormatted !== 'Aktif') {
          jamSatuKelas = kelasFormatted;
        }

        sesiList.push({
          sesiKe,
          labelJam,
          jamMulai,
          jamSelesai,
          kodeMapel: rawMapel || '-',
          namaMapel: mapelNama,
          kelas: kelasFormatted,
          rawText: part
        });
      } else {
        // Ultimate Fallback: clean trailing/leading unmatched parens
        const cleanedPart = p.replace(/[()]/g, '').trim();
        sesiList.push({
          sesiKe: 'Sesi 1 (Jam I-II)',
          labelJam: 'Jadwal',
          jamMulai: '07:30',
          jamSelesai: '08:30',
          kodeMapel: '-',
          namaMapel: cleanedPart,
          kelas: 'Aktif',
          rawText: part
        });
      }
    }
  }

  // Format into clean concise summary
  let formattedText = '';
  if (sesiList.length > 0 && sesiList[0].namaMapel !== '-') {
    formattedText = sesiList.map(s => `${s.labelJam}: ${s.namaMapel} (${s.kelas})`).join(' | ');
  } else {
    formattedText = trimmed;
  }

  return {
    formattedText,
    sesiList,
    earliestJamKe,
    earliestTime,
    jamSatuKelas
  };
}

export type EvaluatedPeran = 'Guru' | 'Staf' | 'Guru+Staf' | 'Guru BK' | 'Guru BK+Mengajar';

const STRUCTURAL_OR_STAFF_KEYWORDS = [
  'kepala sekolah',
  'wakil kepala',
  'wakasek',
  'waka',
  'kurikulum',
  'kesiswaan',
  'humas',
  'sarpras',
  'bendahara',
  'tata usaha',
  'subag',
  'staf',
  'staff',
  'operator',
  'satpam',
  'keamanan',
  'penjaga',
  'kebersihan',
  'teknisi',
  'perpustakaan',
  'pustakawan'
];

export function isGuruBkJabatan(jabatan?: string): boolean {
  const j = (jabatan || '').trim().toLowerCase();
  return (
    /\bbk\b/.test(j) ||
    j.includes('bimbingan konseling') ||
    j.includes('bimbingan & konseling') ||
    j.includes('konselor')
  );
}

export function isStructuralOrStaffJabatan(jabatan?: string): boolean {
  const j = (jabatan || '').trim().toLowerCase();
  if (!j) return false;
  if (STRUCTURAL_OR_STAFF_KEYWORDS.some((kw) => j.includes(kw))) {
    return true;
  }
  if (/\btu\b/.test(j) || /\bops\b/.test(j)) {
    return true;
  }
  return false;
}

export function getTeacherAttendanceOverride(
  teacher: MasterGuruStaf | string,
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): AttendanceRuleMode | undefined {
  if (!attendanceRuleOverrides) return undefined;
  const rawName = typeof teacher === 'string' ? teacher : teacher.nama;
  const key = (rawName || '').trim().toLowerCase();
  if (!key) return undefined;
  if (attendanceRuleOverrides[key]) return attendanceRuleOverrides[key];
  for (const [k, v] of Object.entries(attendanceRuleOverrides)) {
    if (k.trim().toLowerCase() === key) return v;
  }
  return undefined;
}

export interface ResolvedAttendanceRule {
  peran: EvaluatedPeran;
  ruleMode: AttendanceRuleMode;
  isGuruBk: boolean;
  isExplicitOverride: boolean;
  hasSlotInJadwal: boolean;
}

export function resolveTeacherAttendanceRule(
  teacher: MasterGuruStaf,
  jadwal?: JadwalSlot[],
  peranOverride?: string,
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): ResolvedAttendanceRule {
  const kodeGuru = cariKodeGuru(teacher);
  let hasSlotInJadwal = false;
  if (kodeGuru !== null) {
    const slots = jadwal && jadwal.length > 0 ? jadwal : slotsDariOfficial();
    hasSlotInJadwal = slots.some((s) => s.kodeGuru === kodeGuru);
  }

  const isBk =
    isGuruBkJabatan(teacher.jabatan) ||
    (teacher.peran || '').toLowerCase().includes('bk') ||
    (peranOverride || '').toLowerCase().includes('bk');

  // 1. Explicit per-person override from AppSettings ("Pengaturan Wajib Hadir")
  const appOverride = getTeacherAttendanceOverride(teacher, attendanceRuleOverrides);
  if (appOverride === 'sesuai_jadwal') {
    return {
      peran: isBk ? 'Guru BK' : 'Guru',
      ruleMode: 'sesuai_jadwal',
      isGuruBk: isBk,
      isExplicitOverride: true,
      hasSlotInJadwal
    };
  }
  if (appOverride === 'wajib_harian') {
    return {
      peran: isBk ? 'Guru BK' : 'Staf',
      ruleMode: 'wajib_harian',
      isGuruBk: isBk,
      isExplicitOverride: true,
      hasSlotInJadwal
    };
  }
  if (appOverride === 'ganda') {
    return {
      peran: isBk ? 'Guru BK+Mengajar' : 'Guru+Staf',
      ruleMode: 'ganda',
      isGuruBk: isBk,
      isExplicitOverride: true,
      hasSlotInJadwal
    };
  }

  // 2. Explicit peranOverride parameter or teacher.peran column from Master_Guru_Staf
  const rawPeran = (peranOverride || teacher.peran || '').trim();
  if (rawPeran === 'Guru') {
    return {
      peran: isBk ? 'Guru BK' : 'Guru',
      ruleMode: 'sesuai_jadwal',
      isGuruBk: isBk,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }
  if (rawPeran === 'Guru BK') {
    return {
      peran: 'Guru BK',
      ruleMode: 'wajib_harian',
      isGuruBk: true,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }
  if (rawPeran === 'Guru BK+Mengajar') {
    return {
      peran: 'Guru BK+Mengajar',
      ruleMode: 'ganda',
      isGuruBk: true,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }
  if (rawPeran === 'Staf') {
    return {
      peran: isBk ? 'Guru BK' : 'Staf',
      ruleMode: 'wajib_harian',
      isGuruBk: isBk,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }
  if (rawPeran === 'Guru+Staf') {
    return {
      peran: isBk ? 'Guru BK+Mengajar' : 'Guru+Staf',
      ruleMode: 'ganda',
      isGuruBk: isBk,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }

  // 3. Automatic smart resolution
  if (isBk) {
    if (hasSlotInJadwal) {
      return {
        peran: 'Guru BK+Mengajar',
        ruleMode: 'ganda',
        isGuruBk: true,
        isExplicitOverride: false,
        hasSlotInJadwal
      };
    }
    return {
      peran: 'Guru BK',
      ruleMode: 'wajib_harian',
      isGuruBk: true,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }

  if (hasSlotInJadwal) {
    if (isStructuralOrStaffJabatan(teacher.jabatan)) {
      return {
        peran: 'Guru+Staf',
        ruleMode: 'ganda',
        isGuruBk: false,
        isExplicitOverride: false,
        hasSlotInJadwal
      };
    }
    // Regular subject teachers (including Wali Kelas) follow their teaching schedule
    return {
      peran: 'Guru',
      ruleMode: 'sesuai_jadwal',
      isGuruBk: false,
      isExplicitOverride: false,
      hasSlotInJadwal
    };
  }

  return {
    peran: 'Staf',
    ruleMode: 'wajib_harian',
    isGuruBk: false,
    isExplicitOverride: false,
    hasSlotInJadwal: false
  };
}

/**
 * Resolves teacher role label:
 * 'Guru' | 'Staf' | 'Guru+Staf' | 'Guru BK' | 'Guru BK+Mengajar'
 */
export function determineTeacherPeran(
  teacher: MasterGuruStaf,
  jadwal?: JadwalSlot[],
  peranOverride?: string,
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): EvaluatedPeran {
  return resolveTeacherAttendanceRule(teacher, jadwal, peranOverride, attendanceRuleOverrides).peran;
}

export function getDefaultAlpaStatus(
  teacher: MasterGuruStaf,
  jadwal?: JadwalSlot[],
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): StatusPresensi {
  const rule = resolveTeacherAttendanceRule(teacher, jadwal, undefined, attendanceRuleOverrides);
  if (rule.ruleMode === 'sesuai_jadwal') {
    return 'Alpa (Jadwal Mengajar)';
  }
  return rule.isGuruBk ? 'Alpa (Wajib Hadir Guru BK)' : 'Alpa (Wajib Hadir Staf)';
}

/**
 * Checks whether a teacher/staff is required to attend on a given day:
 * - Jumat: libur sekolah (false)
 * - wajib_harian & ganda: always required on school days (true)
 * - sesuai_jadwal: only required if having teaching sessions that day, or guruTanpaJadwalWajibHadir = true
 */
export function isTeacherWajibHadir(
  teacher: MasterGuruStaf,
  hari: HariSekolah,
  jadwal?: JadwalSlot[],
  guruTanpaJadwalWajibHadir: boolean = false,
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): boolean {
  if (hari === 'Jumat') return false;
  const rule = resolveTeacherAttendanceRule(teacher, jadwal, undefined, attendanceRuleOverrides);
  if (rule.ruleMode === 'wajib_harian' || rule.ruleMode === 'ganda') {
    return true;
  }
  const scheduleEval = evaluateTeacherScheduleForDay(teacher, hari, '07:25', jadwal, attendanceRuleOverrides);
  if (scheduleEval.hasTeachingSchedule && scheduleEval.sesiList.length > 0) {
    return true;
  }
  return Boolean(guruTanpaJadwalWajibHadir);
}

/**
 * Evaluates a teacher's schedule for a specific day of the week
 */
export function evaluateTeacherScheduleForDay(
  teacher: MasterGuruStaf,
  hari: HariSekolah,
  defaultThreshold: string = '07:25',
  jadwal?: JadwalSlot[],
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): TeacherDailyScheduleEvaluation {
  const rule = resolveTeacherAttendanceRule(teacher, jadwal, undefined, attendanceRuleOverrides);
  const isDailyNonTeaching = rule.ruleMode !== 'sesuai_jadwal';

  if (isJadwalTidakDitemukan(teacher)) {
    return {
      hasTeachingSchedule: false,
      isStaffOnly: isDailyNonTeaching && !rule.isGuruBk,
      mapelHariIni: 'Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)',
      ringkasanSesiText: 'Jadwal belum terhubung',
      jamSatuKelas: null,
      jamSatuKeterangan: 'Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)',
      firstScheduleTime: null,
      startJamKe: null,
      thresholdTime: defaultThreshold,
      sesiList: [],
      keteranganJadwal: 'Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)'
    };
  }

  const mapelRaw = buildMapelString(teacher, hari, jadwal);
  const trimmed = (mapelRaw || '').trim();
  const hasTeachingSchedule = trimmed !== '' && trimmed !== '-' && trimmed.toLowerCase() !== 'libur';

  if (!hasTeachingSchedule) {
    if (rule.isGuruBk && rule.ruleMode !== 'sesuai_jadwal') {
      return {
        hasTeachingSchedule: false,
        isStaffOnly: false,
        mapelHariIni: 'Tugas Bimbingan & Konseling (Guru BK)',
        ringkasanSesiText: 'Jam Kerja Harian Guru BK',
        jamSatuKelas: null,
        jamSatuKeterangan: 'Wajib hadir harian sekolah sebagai Guru BK',
        firstScheduleTime: null,
        startJamKe: null,
        thresholdTime: defaultThreshold,
        sesiList: [],
        keteranganJadwal: 'Kehadiran Harian Guru BK'
      };
    }

    const isStaff = rule.ruleMode === 'wajib_harian' && !rule.isGuruBk;
    return {
      hasTeachingSchedule: false,
      isStaffOnly: isStaff,
      mapelHariIni: isStaff ? 'Tugas Kantor / Operasional Sekolah' : 'Tidak Ada Jam Mengajar Hari Ini',
      ringkasanSesiText: isStaff ? 'Jam Kerja Staf Sekolah' : 'Libur Jam Mengajar',
      jamSatuKelas: null,
      jamSatuKeterangan: isStaff
        ? 'Wajib hadir pagi kantor sekolah'
        : rule.ruleMode === 'ganda'
        ? 'Wajib hadir harian sekolah (tidak ada jadwal kelas)'
        : 'Tidak ada jadwal jam ke-1 di kelas',
      firstScheduleTime: null,
      startJamKe: null,
      thresholdTime: defaultThreshold,
      sesiList: [],
      keteranganJadwal: isStaff ? 'Kehadiran Kantor Sekolah' : 'Tidak ada jadwal mengajar di kelas hari ini'
    };
  }

  const parsed = parseAndFormatTigaSesi(trimmed);
  const effectiveThreshold = parsed.earliestTime || defaultThreshold;

  let jamSatuKeterangan = '';
  if (parsed.jamSatuKelas) {
    jamSatuKeterangan = `Jam I-II: Mengajar di ${parsed.jamSatuKelas} (Mulai 07:30 WIB)`;
  } else if (parsed.earliestJamKe && parsed.earliestJamKe >= 3) {
    const firstSesi = parsed.sesiList[0];
    jamSatuKeterangan = `Tidak ada Jam I-II • Mulai ${firstSesi?.labelJam || 'Jam III'} di ${firstSesi?.kelas || '-'} (${parsed.earliestTime} WIB)`;
  } else {
    jamSatuKeterangan = 'Jadwal mengajar aktif';
  }

  let keteranganJadwal = '';
  if (parsed.earliestJamKe && parsed.earliestJamKe >= 3) {
    const firstSesi = parsed.sesiList[0];
    keteranganJadwal = `Mulai ${firstSesi?.labelJam || 'Jam III-IV'} (${parsed.earliestTime} WIB) - ${firstSesi?.kelas || ''}`;
  } else if (parsed.jamSatuKelas) {
    keteranganJadwal = `Mulai Jam I-II di ${parsed.jamSatuKelas} (07:30 WIB)`;
  } else {
    keteranganJadwal = `Jadwal Mengajar Aktif (${effectiveThreshold} WIB)`;
  }

  return {
    hasTeachingSchedule: true,
    isStaffOnly: false,
    mapelHariIni: parsed.formattedText,
    ringkasanSesiText: parsed.formattedText,
    jamSatuKelas: parsed.jamSatuKelas,
    jamSatuKeterangan,
    firstScheduleTime: parsed.earliestTime,
    startJamKe: parsed.earliestJamKe,
    thresholdTime: effectiveThreshold,
    sesiList: parsed.sesiList,
    keteranganJadwal
  };
}

export interface AttendanceEvaluationResult {
  status: StatusPresensi;
  statusKepalaSekolah: StatusPresensi;
  statusJadwalMengajar: StatusPresensi;
  thresholdSekolah: string;
  thresholdJadwal: string;
  thresholdUsed: string;
  isScheduleBased: boolean;
  keterangan: string;
  ringkasanSesi: string;
  jamSatuInfo: string;

  peran: EvaluatedPeran;
  ruleMode: AttendanceRuleMode;
  isGuruBk: boolean;
  wajibHadir: boolean;
  batasStaf: string | null;
  statusStaf: string | null;
  batasMengajar: string | null;
  statusMengajar: string | null;
}

/**
 * Attendance Evaluator supporting:
 * - 'sesuai_jadwal' (Guru & personel terjadwal): batasMengajar = jam mulai sesi pertama - guruToleransiMenit
 * - 'wajib_harian' (Staf, Guru BK harian, atau guru wajib hadir harian): batasStaf = settings.jamMasukThreshold (default 07:25)
 * - 'ganda' (Guru+Staf & Guru BK+Mengajar): DUA penilaian terpisah (batas harian 07:25 & jam mengajar)
 */
export function evaluateTeacherAttendanceStatus(
  jamDatangStr: string,
  teacher: MasterGuruStaf,
  hari: HariSekolah,
  schoolThreshold: string = '07:25',
  kebijakan: 'instruksi_kepala_sekolah' | 'sesuai_jadwal_mengajar' = 'instruksi_kepala_sekolah',
  jadwal?: JadwalSlot[],
  guruToleransiMenit: number = 0,
  guruTanpaJadwalWajibHadir: boolean = false,
  peranOverride?: string,
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>
): AttendanceEvaluationResult {
  const rule = resolveTeacherAttendanceRule(teacher, jadwal, peranOverride, attendanceRuleOverrides);
  const { peran, ruleMode, isGuruBk } = rule;
  const scheduleEval = evaluateTeacherScheduleForDay(teacher, hari, schoolThreshold, jadwal, attendanceRuleOverrides);
  const hasTeachingToday = scheduleEval.hasTeachingSchedule && scheduleEval.sesiList.length > 0;
  const effectiveSchoolThreshold = schoolThreshold || '07:25';

  // 1. Batas & Status Harian (Staf / Guru BK / Wajib Harian)
  let batasStaf: string | null = null;
  let statusStaf: string | null = null;

  if (ruleMode === 'wajib_harian' || ruleMode === 'ganda') {
    batasStaf = effectiveSchoolThreshold;
    statusStaf = evaluateStatus24h(jamDatangStr, batasStaf);
  }

  // 2. Batas & Status Mengajar
  let batasMengajar: string | null = null;
  let statusMengajar: string | null = null;

  if (hasTeachingToday && (ruleMode === 'sesuai_jadwal' || ruleMode === 'ganda')) {
    const firstScheduleTime = scheduleEval.firstScheduleTime || '07:30';
    const startMins = timeToMinutes(firstScheduleTime) ?? 450;
    const toleransi = Math.max(0, guruToleransiMenit || 0);
    const batasMins = Math.max(0, startMins - toleransi);
    batasMengajar = minutesToTime(batasMins);
    statusMengajar = evaluateStatus24h(jamDatangStr, batasMengajar);
  }

  // 3. Wajib Hadir
  let wajibHadir = true;
  if (ruleMode === 'sesuai_jadwal') {
    wajibHadir = hasTeachingToday ? true : Boolean(guruTanpaJadwalWajibHadir);
  } else {
    wajibHadir = true;
  }

  // 4. Status Umum (StatusPresensi)
  let status: StatusPresensi = 'Tepat Waktu';
  if (ruleMode === 'wajib_harian') {
    status = statusStaf === 'Terlambat' ? 'Terlambat' : 'Tepat Waktu';
  } else if (ruleMode === 'sesuai_jadwal') {
    if (hasTeachingToday) {
      status = statusMengajar === 'Terlambat' ? 'Terlambat' : 'Tepat Waktu';
    } else if (guruTanpaJadwalWajibHadir) {
      status = evaluateStatus24h(jamDatangStr, effectiveSchoolThreshold);
    } else {
      status = 'Tepat Waktu';
    }
  } else {
    // ganda
    if (hasTeachingToday) {
      status = statusStaf === 'Terlambat' || statusMengajar === 'Terlambat' ? 'Terlambat' : 'Tepat Waktu';
    } else {
      status = statusStaf === 'Terlambat' ? 'Terlambat' : 'Tepat Waktu';
    }
  }

  // Label peran harian (agar Guru BK tidak disebut "sbg Staf")
  const dailyRoleLabel = isGuruBk
    ? 'sbg Guru BK'
    : isStructuralOrStaffJabatan(teacher.jabatan)
    ? 'sbg Staf'
    : 'Wajib Harian';

  // 5. Keterangan Rinci
  let keterangan = '';
  if (ruleMode === 'ganda') {
    const stafKet =
      statusStaf === 'Terlambat'
        ? `Terlambat ${dailyRoleLabel} (${jamDatangStr} > ${batasStaf})`
        : `Tepat Waktu ${dailyRoleLabel} (${jamDatangStr} <= ${batasStaf})`;
    if (hasTeachingToday && batasMengajar) {
      const firstSesi = scheduleEval.sesiList[0];
      const sesiLabel = firstSesi ? `${firstSesi.labelJam} ${firstSesi.jamMulai}` : batasMengajar;
      const ajarKet =
        statusMengajar === 'Terlambat'
          ? `Terlambat mengajar (${jamDatangStr} > ${batasMengajar} ${sesiLabel})`
          : `Tepat Waktu mengajar (${sesiLabel})`;
      keterangan = `${stafKet} • ${ajarKet}`;
    } else {
      keterangan = `${stafKet} • Tidak ada jadwal mengajar hari ini`;
    }
  } else if (ruleMode === 'sesuai_jadwal') {
    if (hasTeachingToday && batasMengajar) {
      const firstSesi = scheduleEval.sesiList[0];
      const sesiLabel = firstSesi ? `${firstSesi.labelJam} ${firstSesi.jamMulai}` : batasMengajar;
      const tolText =
        guruToleransiMenit && guruToleransiMenit > 0
          ? ` (Toleransi ${guruToleransiMenit}m, Batas: ${batasMengajar})`
          : '';
      keterangan =
        statusMengajar === 'Terlambat'
          ? `Terlambat mengajar (${jamDatangStr} > ${batasMengajar} • ${sesiLabel})`
          : `Tepat Waktu mengajar (${sesiLabel}${tolText})`;
    } else {
      if (!guruTanpaJadwalWajibHadir) {
        keterangan = isGuruBk ? 'Hadir sbg Guru BK (tanpa jadwal mengajar kelas)' : 'Hadir (tanpa jadwal mengajar)';
      } else {
        keterangan =
          status === 'Terlambat'
            ? `Terlambat (${jamDatangStr} > ${effectiveSchoolThreshold}) • Tanpa jadwal mengajar (Wajib hadir)`
            : `Tepat Waktu (${jamDatangStr} <= ${effectiveSchoolThreshold}) • Tanpa jadwal mengajar`;
      }
    }
  } else {
    // wajib_harian
    keterangan =
      statusStaf === 'Terlambat'
        ? `Terlambat ${dailyRoleLabel} (${jamDatangStr} > ${batasStaf})`
        : `Tepat Waktu ${dailyRoleLabel} (${jamDatangStr} <= ${batasStaf})`;
  }

  // 6. Backward Compatibility Mappings
  const statusKepalaSekolah: StatusPresensi = (statusStaf as StatusPresensi) || status;
  const statusJadwalMengajar: StatusPresensi = (statusMengajar as StatusPresensi) || status;
  const thresholdSekolah = batasStaf || effectiveSchoolThreshold;
  const thresholdJadwal = batasMengajar || scheduleEval.thresholdTime || effectiveSchoolThreshold;
  const thresholdUsed =
    ruleMode === 'sesuai_jadwal'
      ? batasMengajar || effectiveSchoolThreshold
      : batasStaf || effectiveSchoolThreshold;
  const isScheduleBased = ruleMode === 'sesuai_jadwal' || (ruleMode === 'ganda' && hasTeachingToday);

  return {
    status,
    statusKepalaSekolah,
    statusJadwalMengajar,
    thresholdSekolah,
    thresholdJadwal,
    thresholdUsed,
    isScheduleBased,
    keterangan,
    ringkasanSesi: scheduleEval.ringkasanSesiText,
    jamSatuInfo: scheduleEval.jamSatuKeterangan,
    peran,
    ruleMode,
    isGuruBk,
    wajibHadir,
    batasStaf,
    statusStaf,
    batasMengajar,
    statusMengajar
  };
}


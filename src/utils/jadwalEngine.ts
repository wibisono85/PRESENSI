import { JadwalSlot, MasterGuruStaf } from '../types';
import { KODE_GURU } from '../data/kodeGuru';
import { OFFICIAL_CLASS_SCHEDULES, ClassSchedule, ClassScheduleSession } from '../data/officialClassSchedules';

export const STORAGE_KEY_JADWAL = 'smp_nurul_abror_jadwal_slots_v1';

/**
 * Normalizes a name string for strict matching against official teacher roster:
 * - Lowercase
 * - Removes honorifics and academic titles: S.Pd, M.Pd, S.Pd.I, M.Pd.I, S.Kom, S.Mat, S.Fil, SS., S.E., A.Md., Dr., Drs., Dra., Ust., Ustadz, H., HJ.
 * - Removes punctuation (dots, commas, quotes, hyphens, slashes, brackets)
 * - Collapses consecutive spaces
 */
export function normalizeTeacherNameStrict(name?: string | null): string {
  if (!name) return '';
  let s = name.toLowerCase();
  const titles = [
    /\bs\.pd\.i\b/g,
    /\bm\.pd\.i\b/g,
    /\bs\.pd\b/g,
    /\bm\.pd\b/g,
    /\bs\.kom\b/g,
    /\bs\.mat\b/g,
    /\bs\.fil\b/g,
    /\bss\b/g,
    /\bs\.e\b/g,
    /\ba\.md\b/g,
    /\bdrs\b/g,
    /\bdra\b/g,
    /\bdr\b/g,
    /\bust\b/g,
    /\bustadz\b/g,
    /\bhj\b/g,
    /\bh\b/g,
  ];
  for (const t of titles) {
    s = s.replace(t, ' ');
  }
  s = s.replace(/[\.,'"`\-\/\\()]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// Pre-compute normalized map of KODE_GURU for high-performance lookup
const normalizedKodeGuruMap: Map<number, string> = new Map();
for (const [kodeStr, name] of Object.entries(KODE_GURU)) {
  normalizedKodeGuruMap.set(Number(kodeStr), normalizeTeacherNameStrict(name));
}

/**
 * Resolves teacher code (1..32) strictly:
 * 1. Uses teacher.kodeGuru if provided (positive integer).
 * 2. If not, matches normalized name strictly against KODE_GURU.
 * 3. Returns null if no unique definite match is found (NEVER GUESSES).
 */
export function cariKodeGuru(
  teacher?: { nama?: string; kodeGuru?: number } | null
): number | null {
  if (!teacher) return null;
  if (
    typeof teacher.kodeGuru === 'number' &&
    teacher.kodeGuru > 0 &&
    !isNaN(teacher.kodeGuru)
  ) {
    return teacher.kodeGuru;
  }
  const norm = normalizeTeacherNameStrict(teacher.nama);
  if (!norm) return null;

  let matchedKode: number | null = null;
  let matchCount = 0;
  for (const [kode, normName] of normalizedKodeGuruMap.entries()) {
    if (normName === norm) {
      matchedKode = kode;
      matchCount++;
    }
  }

  return matchCount === 1 ? matchedKode : null;
}

/**
 * Formats class name compactly without spaces:
 * "IX D" -> "9D", "VII B" -> "7B", "VIII A" -> "8A"
 */
export function formatClassCompact(cls?: string | null): string {
  if (!cls) return '';
  let c = cls.trim().replace(/\s+/g, '');
  // Order matters: match VIII before VII
  c = c.replace(/^VIII/i, '8');
  c = c.replace(/^VII/i, '7');
  c = c.replace(/^IX/i, '9');
  return c.toUpperCase();
}

/**
 * Formats subject title to proper casing:
 * Preserves standard abbreviations (IPA, IPS, TIK, PKN, PPKN, BK)
 * Standardizes "FIQH" / "FIQIH" -> "Fiqih"
 * Title Cases words e.g. "Matematika", "Bahasa Indonesia"
 */
export function toTitleCaseMapel(mapel?: string | null): string {
  if (!mapel) return '';
  const upper = mapel.trim().toUpperCase();
  if (['IPA', 'IPS', 'TIK', 'PKN', 'PPKN', 'BK', 'PJOK', 'SBK'].includes(upper)) {
    return upper;
  }
  if (upper === 'FIQH') {
    return 'Fiqih';
  }
  return mapel
    .trim()
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getSessionOrder(sesi?: string | null): number {
  const s = (sesi || '').toLowerCase();
  if (s.includes('i-ii') || s.includes('1-2') || s.includes('1 - 2') || s.includes('i - ii')) return 1;
  if (s.includes('iii-iv') || s.includes('3-4') || s.includes('3 - 4') || s.includes('iii - iv')) return 2;
  if (s.includes('v-vi') || s.includes('5-6') || s.includes('5 - 6') || s.includes('v - vi')) return 3;
  return 99;
}

export function normalizeSessionLabel(sesi?: string | null): string {
  const ord = getSessionOrder(sesi);
  if (ord === 1) return 'Jam I-II';
  if (ord === 2) return 'Jam III-IV';
  if (ord === 3) return 'Jam V-VI';
  return sesi || '';
}

let cachedOfficialSlots: JadwalSlot[] | null = null;

/**
 * Transforms OFFICIAL_CLASS_SCHEDULES into JadwalSlot[]:
 * Matches namaGuru to kodeGuru via KODE_GURU.
 * Keeps class string like "IX D" as-is.
 * Sesi "Jam I-II", "Jam III-IV", "Jam V-VI" with 07:30-08:30, 08:30-09:30, 10:00-11:00.
 */
export function slotsDariOfficial(): JadwalSlot[] {
  if (cachedOfficialSlots && cachedOfficialSlots.length > 0) {
    return cachedOfficialSlots;
  }

  const slots: JadwalSlot[] = [];
  for (const c of OFFICIAL_CLASS_SCHEDULES) {
    for (const [day, sessList] of Object.entries(c.jadwal)) {
      for (const sess of sessList) {
        if (!sess.guru) continue;
        const kode = cariKodeGuru({ nama: sess.guru });
        let jamMulai = '07:30';
        let jamSelesai = '08:30';
        const ord = getSessionOrder(sess.jam);
        if (ord === 2) {
          jamMulai = '08:30';
          jamSelesai = '09:30';
        } else if (ord === 3) {
          jamMulai = '10:00';
          jamSelesai = '11:00';
        }

        slots.push({
          tahunAjaran: '2026/2027',
          semester: 'Ganjil',
          hari: day,
          sesi: sess.jam,
          jamMulai,
          jamSelesai,
          kelas: c.kelas,
          kodeGuru: kode || 0,
          namaGuru: sess.guru,
          kodeMapel: sess.mapel,
          namaMapel: sess.mapel
        });
      }
    }
  }

  cachedOfficialSlots = slots;
  return slots;
}

/**
 * Checks whether a teacher has no linked teaching schedule because their kodeGuru is missing or unlinked.
 */
export function isJadwalTidakDitemukan(
  teacher?: { nama: string; kodeGuru?: number; jabatan?: string; peran?: string } | null
): boolean {
  if (!teacher) return false;
  const jab = (teacher.jabatan || '').toLowerCase();
  const peran = (teacher.peran || '').toLowerCase();
  const isPureStaff =
    peran === 'staf' ||
    peran === 'guru bk' ||
    (!jab.includes('guru') &&
      (jab.includes('tu') ||
        jab.includes('satpam') ||
        jab.includes('kebersihan') ||
        jab.includes('laboran') ||
        jab.includes('teknisi') ||
        jab.includes('bendahara') ||
        jab.includes('operator')));

  if (isPureStaff) return false;

  const kode = cariKodeGuru(teacher);
  const isBkJabatan =
    /\bbk\b/.test(jab) ||
    jab.includes('bimbingan konseling') ||
    jab.includes('bimbingan & konseling') ||
    jab.includes('konselor');
  if (isBkJabatan && kode === null && peran !== 'guru' && peran !== 'guru+staf' && peran !== 'guru bk+mengajar') {
    return false;
  }

  return kode === null;
}

/**
 * Retrieves cached JadwalSlot[] from localStorage, falling back to official slots.
 */
export function getLocalJadwal(): JadwalSlot[] {
  if (typeof window === 'undefined') return slotsDariOfficial();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JADWAL);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Gagal membaca cache jadwal lokal:', e);
  }
  return slotsDariOfficial();
}

/**
 * Persists JadwalSlot[] to localStorage.
 */
export function saveLocalJadwal(slots: JadwalSlot[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_JADWAL, JSON.stringify(slots));
  } catch (e) {
    console.warn('Gagal menyimpan cache jadwal lokal:', e);
  }
}

/**
 * Resolves the active term (Tahun Ajaran & Semester):
 * - If activeYear and activeSem are provided, uses them.
 * - Else uses the first term found in the schedule data.
 * - Falls back to null if no valid term is found.
 */
export function getActiveTerm(
  jadwal?: JadwalSlot[],
  activeYear?: string,
  activeSem?: string
): { tahunAjaran: string; semester: string } | null {
  const y = (activeYear || '').trim();
  const s = (activeSem || '').trim();
  if (y && s) {
    return { tahunAjaran: y, semester: s };
  }
  if (jadwal && Array.isArray(jadwal) && jadwal.length > 0) {
    for (const slot of jadwal) {
      if (slot.tahunAjaran && slot.semester) {
        return {
          tahunAjaran: slot.tahunAjaran.trim(),
          semester: slot.semester.trim()
        };
      }
    }
  }
  return null;
}

/**
 * Filters schedule slots strictly to the active term.
 * If term is not set, uses the first term in data; if data is empty, falls back to official slots.
 */
export function filterActiveTermSlots(
  jadwal?: JadwalSlot[],
  activeYear?: string,
  activeSem?: string
): JadwalSlot[] {
  const source = jadwal && Array.isArray(jadwal) && jadwal.length > 0 ? jadwal : getLocalJadwal();
  if (!source || source.length === 0) {
    return slotsDariOfficial();
  }

  const term = getActiveTerm(source, activeYear, activeSem);
  if (!term) {
    return slotsDariOfficial();
  }

  const filtered = source.filter((slot) => {
    return (
      (slot.tahunAjaran || '').trim().toLowerCase() === term.tahunAjaran.toLowerCase() &&
      (slot.semester || '').trim().toLowerCase() === term.semester.toLowerCase()
    );
  });

  return filtered.length > 0 ? filtered : slotsDariOfficial();
}

export const KELOMPOK_PUTRA = [
  'VII A',
  'VII B',
  'VIII A',
  'VIII B',
  'IX A',
  'IX B',
  'IX C',
  'IX D'
];

export const KELOMPOK_PUTRI = [
  'VII C',
  'VII D',
  'VIII C',
  'VIII D',
  'IX E',
  'IX F',
  'IX G',
  'IX H'
];

export const ALL_ROSTER_CLASSES = [...KELOMPOK_PUTRA, ...KELOMPOK_PUTRI];

export function getSessionTimeRange(sesi?: string | null): string {
  const ord = getSessionOrder(sesi);
  if (ord === 1) return '07.30 - 08.30';
  if (ord === 2) return '08.30 - 09.30';
  if (ord === 3) return '10.00 - 11.00';
  return '07.30 - 08.30';
}

/**
 * Helper that converts JadwalSlot[] into ClassSchedule[] format for JadwalPelajaranView:
 * Kelompok Putra: VII A, VII B, VIII A, VIII B, IX A, IX B, IX C, IX D
 * Kelompok Putri: VII C, VII D, VIII C, VIII D, IX E, IX F, IX G, IX H
 * Strictly uses active term slots.
 */
export function jadwalToClassSchedules(
  jadwal: JadwalSlot[],
  activeYear?: string,
  activeSem?: string
): ClassSchedule[] {
  if (!jadwal || !Array.isArray(jadwal) || jadwal.length === 0) {
    return OFFICIAL_CLASS_SCHEDULES;
  }

  const activeSlots = filterActiveTermSlots(jadwal, activeYear, activeSem);
  if (!activeSlots || activeSlots.length === 0) {
    return OFFICIAL_CLASS_SCHEDULES;
  }

  const waliMap = new Map<string, string>();
  for (const c of OFFICIAL_CLASS_SCHEDULES) {
    waliMap.set(c.kelas, c.waliKelas);
  }

  const days: Array<'Sabtu' | 'Ahad' | 'Senin' | 'Selasa' | 'Rabu' | 'Kamis'> = [
    'Sabtu',
    'Ahad',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis'
  ];

  return ALL_ROSTER_CLASSES.map((kelas) => {
    const tipe: 'Putra' | 'Putri' = KELOMPOK_PUTRA.includes(kelas) ? 'Putra' : 'Putri';
    const waliKelas = waliMap.get(kelas) || '-';

    const jadwalHari: {
      Sabtu: ClassScheduleSession[];
      Ahad: ClassScheduleSession[];
      Senin: ClassScheduleSession[];
      Selasa: ClassScheduleSession[];
      Rabu: ClassScheduleSession[];
      Kamis: ClassScheduleSession[];
    } = {
      Sabtu: [],
      Ahad: [],
      Senin: [],
      Selasa: [],
      Rabu: [],
      Kamis: []
    };

    for (const d of days) {
      const daySlots = activeSlots.filter((s) => {
        const matchClass =
          (s.kelas || '').trim().toUpperCase() === kelas.toUpperCase() ||
          formatClassCompact(s.kelas) === formatClassCompact(kelas);
        const matchDay = (s.hari || '').trim().toLowerCase() === d.toLowerCase();
        return matchClass && matchDay;
      });

      daySlots.sort((a, b) => getSessionOrder(a.sesi) - getSessionOrder(b.sesi));

      jadwalHari[d] = daySlots.map((s) => {
        const waktuStr =
          s.jamMulai && s.jamSelesai
            ? `${s.jamMulai.replace(':', '.')} - ${s.jamSelesai.replace(':', '.')}`
            : getSessionTimeRange(s.sesi);

        return {
          jam: normalizeSessionLabel(s.sesi),
          waktu: waktuStr,
          mapel: toTitleCaseMapel(s.namaMapel || s.kodeMapel),
          guru: s.namaGuru || '-'
        };
      });
    }

    return {
      kelas,
      tipe,
      waliKelas,
      jadwal: jadwalHari
    };
  });
}

/**
 * Builds schedule string for a given teacher on a given day using the active term:
 * Orders sessions: Jam I-II, III-IV, V-VI.
 * Output format: "Jam I-II: Matematika (9D), Jam III-IV: Matematika (7B)".
 * Returns "-" if no slots on that day or if cariKodeGuru is null.
 */
export function buildMapelString(
  teacher?: MasterGuruStaf | { nama: string; kodeGuru?: number; jabatan?: string } | null,
  hari?: string | null,
  jadwal?: JadwalSlot[],
  activeYear?: string,
  activeSem?: string
): string {
  if (!teacher || !hari) return '-';
  const kode = cariKodeGuru(teacher);
  if (kode === null) {
    return '-';
  }

  const sourceSlots: JadwalSlot[] = filterActiveTermSlots(jadwal, activeYear, activeSem);

  const dayClean = hari.trim().toLowerCase();
  const matching = sourceSlots.filter((s) => {
    return s.kodeGuru === kode && (s.hari || '').trim().toLowerCase() === dayClean;
  });

  if (matching.length === 0) return '-';

  matching.sort((a, b) => getSessionOrder(a.sesi) - getSessionOrder(b.sesi));

  return matching
    .map((s) => {
      const sesiLabel = normalizeSessionLabel(s.sesi);
      const mapelLabel = toTitleCaseMapel(s.namaMapel || s.kodeMapel);
      const kelasLabel = formatClassCompact(s.kelas);
      return `${sesiLabel}: ${mapelLabel} (${kelasLabel})`;
    })
    .join(', ');
}

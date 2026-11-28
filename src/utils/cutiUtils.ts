import { AttendanceRuleMode, DataCutiRecord, HariSekolah, JadwalSlot, LogPresensi, MasterGuruStaf, SubstituteAssignment } from '../types';
import { getHariFromDate, isJumat, formatLongDateIndonesian, formatTimestamp, getMapelHariIni } from './dateUtils';
import {
  determineTeacherPeran,
  evaluateTeacherScheduleForDay,
  isTeacherWajibHadir,
  ParsedSesiPelajaran,
  TeacherDailyScheduleEvaluation
} from './scheduleTimeEvaluator';
import { cleanTeacherName } from './qrAndGeoUtils';

export interface JenisCutiOption {
  id: string;
  label: string;
  shortLabel: string;
  defaultDays: number;
  description: string;
  badgeColor: string;
}

export const JENIS_CUTI_OPTIONS: JenisCutiOption[] = [
  {
    id: 'melahirkan',
    label: 'Cuti Melahirkan / Hamil',
    shortLabel: 'Cuti Melahirkan',
    defaultDays: 90,
    description: 'Persalinan & masa pemulihan/nifas bagi guru/staf perempuan (umumnya s.d. 3 bulan).',
    badgeColor: 'bg-pink-100 text-pink-800 border-pink-300'
  },
  {
    id: 'ibadah',
    label: 'Cuti Ibadah (Umroh / Haji)',
    shortLabel: 'Cuti Umroh/Haji',
    defaultDays: 12,
    description: 'Menunaikan ibadah Umroh (±9–14 hari) atau ibadah Haji (±40 hari).',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  },
  {
    id: 'menikah',
    label: 'Cuti Menikah / Acara Keluarga Inti',
    shortLabel: 'Cuti Menikah',
    defaultDays: 3,
    description: 'Pernikahan pegawai atau anggota keluarga inti (anak/saudara kandung).',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300'
  },
  {
    id: 'berduka',
    label: 'Cuti Berduka / Musibah Keluarga',
    shortLabel: 'Cuti Berduka',
    defaultDays: 3,
    description: 'Keluarga inti meninggal dunia atau musibah keluarga mendesak.',
    badgeColor: 'bg-slate-200 text-slate-800 border-slate-300'
  },
  {
    id: 'sakit_panjang',
    label: 'Cuti Sakit Berkepanjangan / Pemulihan',
    shortLabel: 'Cuti Pemulihan',
    defaultDays: 7,
    description: 'Rawat inap, pemulihan pasca operasi, atau sakit berkepanjangan dengan surat dokter.',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300'
  },
  {
    id: 'tahunan',
    label: 'Cuti Tahunan',
    shortLabel: 'Cuti Tahunan',
    defaultDays: 3,
    description: 'Hak cuti tahunan bagi guru tetap atau tenaga kependidikan/staf sekolah.',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300'
  },
  {
    id: 'khusus',
    label: 'Cuti Alasan Penting / Khusus',
    shortLabel: 'Cuti Khusus',
    defaultDays: 2,
    description: 'Keperluan penting lainnya atas persetujuan resmi Kepala Sekolah/Yayasan.',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300'
  }
];

export interface SchoolDateEntry {
  tanggal: string; // YYYY-MM-DD
  hari: HariSekolah;
}

/**
 * Adds calendar days to a YYYY-MM-DD string safely without UTC shift.
 */
export function addCalendarDaysISO(startDateISO: string, daysToAdd: number): string {
  const parts = startDateISO.split('-');
  if (parts.length !== 3) return startDateISO;
  const d = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10) + daysToAdd
  );
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Generates all non-Friday school dates between startDateISO and endDateISO (inclusive),
 * capped at maxCalendarDays (default 180) to avoid accidental runaway loops.
 */
export function enumerateSchoolDatesInRange(
  startDateISO: string,
  endDateISO: string,
  maxCalendarDays: number = 180
): {
  valid: boolean;
  error?: string;
  totalCalendarDays: number;
  skippedFridays: number;
  schoolDates: SchoolDateEntry[];
} {
  if (!startDateISO || !endDateISO) {
    return {
      valid: false,
      error: 'Tanggal mulai dan tanggal selesai wajib diisi.',
      totalCalendarDays: 0,
      skippedFridays: 0,
      schoolDates: []
    };
  }

  const sParts = startDateISO.split('-').map((n) => parseInt(n, 10));
  const eParts = endDateISO.split('-').map((n) => parseInt(n, 10));
  if (sParts.length !== 3 || eParts.length !== 3 || sParts.some(isNaN) || eParts.some(isNaN)) {
    return {
      valid: false,
      error: 'Format tanggal tidak valid.',
      totalCalendarDays: 0,
      skippedFridays: 0,
      schoolDates: []
    };
  }

  const startObj = new Date(sParts[0], sParts[1] - 1, sParts[2]);
  const endObj = new Date(eParts[0], eParts[1] - 1, eParts[2]);

  if (endObj.getTime() < startObj.getTime()) {
    return {
      valid: false,
      error: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.',
      totalCalendarDays: 0,
      skippedFridays: 0,
      schoolDates: []
    };
  }

  const diffDays = Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays > maxCalendarDays) {
    return {
      valid: false,
      error: `Rentang cuti maksimal ${maxCalendarDays} hari kalender per pengajuan (${diffDays} hari dipilih).`,
      totalCalendarDays: diffDays,
      skippedFridays: 0,
      schoolDates: []
    };
  }

  const schoolDates: SchoolDateEntry[] = [];
  let skippedFridays = 0;

  for (let i = 0; i < diffDays; i++) {
    const cur = new Date(sParts[0], sParts[1] - 1, sParts[2] + i);
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    const hari = getHariFromDate(cur);

    if (isJumat(hari)) {
      skippedFridays++;
    } else {
      schoolDates.push({ tanggal: iso, hari });
    }
  }

  return {
    valid: true,
    totalCalendarDays: diffDays,
    skippedFridays,
    schoolDates
  };
}

/**
 * Formats structured Cuti details cleanly into a single string for Google Sheets Log_Presensi column Keterangan.
 */
export function formatCutiKeterangan(params: {
  jenisCutiLabel: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  jumlahHariEfektif: number;
  guruPengganti?: string;
  nomorSurat?: string;
  catatan?: string;
}): string {
  const parts: string[] = [];
  const label = (params.jenisCutiLabel || 'Cuti').trim();
  parts.push(`[${label}]`);

  if (params.tanggalMulai && params.tanggalSelesai && params.tanggalMulai !== params.tanggalSelesai) {
    parts.push(
      `Periode ${formatLongDateIndonesian(params.tanggalMulai)} s/d ${formatLongDateIndonesian(params.tanggalSelesai)} (${params.jumlahHariEfektif} hari efektif)`
    );
  }

  if (params.guruPengganti && params.guruPengganti.trim()) {
    parts.push(`Pengganti/Tugas: ${params.guruPengganti.trim()}`);
  }

  if (params.nomorSurat && params.nomorSurat.trim()) {
    parts.push(`Surat: ${params.nomorSurat.trim()}`);
  }

  if (params.catatan && params.catatan.trim()) {
    parts.push(`Ket: ${params.catatan.trim()}`);
  }

  return parts.join(' • ');
}

/**
 * Generates missing daily Log_Presensi entries ('Cuti') from summary Data_Cuti records.
 * Only creates entries for dates where existingLogs does NOT already contain a log for that teacher & date.
 */
export function buildMissingDailyCutiLogs(params: {
  cutiRecords: DataCutiRecord[];
  existingLogs: LogPresensi[];
  masterList: MasterGuruStaf[];
  threshold: string;
  jadwalList?: JadwalSlot[];
  guruTanpaJadwalWajibHadir?: boolean;
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>;
}): LogPresensi[] {
  const { cutiRecords, existingLogs, masterList, threshold, jadwalList, guruTanpaJadwalWajibHadir, attendanceRuleOverrides } = params;
  if (!cutiRecords || cutiRecords.length === 0) return [];

  const existingKeys = new Set<string>();
  for (const l of existingLogs) {
    if (!l.nama || !l.tanggal) continue;
    const hasRealClockIn = Boolean(l.jamDatang && l.jamDatang !== '-');
    const isBlankDefaultedRow = !hasRealClockIn && l.status === 'Tepat Waktu' && !(l.keterangan || '').trim();
    if (!isBlankDefaultedRow) {
      existingKeys.add(`${l.nama.trim().toLowerCase()}|${l.tanggal.trim()}`);
    }
  }

  const masterByName = new Map<string, MasterGuruStaf>();
  for (const m of masterList) {
    if (m.nama) {
      masterByName.set(m.nama.trim().toLowerCase(), m);
    }
  }

  const missingLogs: LogPresensi[] = [];
  const nowTs = formatTimestamp();

  for (const rec of cutiRecords) {
    if (!rec.nama || !rec.tanggalMulai) continue;
    const statusNorm = String(rec.statusPengajuan || '').trim().toLowerCase();
    if (statusNorm === 'dibatalkan') continue;
    if (statusNorm === 'dicabut' && rec.jumlahHariEfektif === 0) continue;

    const endDate = rec.tanggalSelesai || rec.tanggalMulai;
    const range = enumerateSchoolDatesInRange(rec.tanggalMulai, endDate, 180);
    if (!range.valid || range.schoolDates.length === 0) continue;

    const normName = rec.nama.trim().toLowerCase();
    const teacher = masterByName.get(normName);

    let targetDates = range.schoolDates;
    if (rec.cakupan === 'wajib_hadir' && teacher) {
      const wajibOnly = range.schoolDates.filter((d) =>
        isTeacherWajibHadir(teacher, d.hari, jadwalList, guruTanpaJadwalWajibHadir, attendanceRuleOverrides)
      );
      if (wajibOnly.length > 0) {
        targetDates = wajibOnly;
      }
    }

    const peranGuru = rec.peran && rec.peran !== '-'
      ? rec.peran
      : teacher
      ? determineTeacherPeran(teacher, jadwalList, undefined, attendanceRuleOverrides)
      : 'Guru';

    const keterangan = formatCutiKeterangan({
      jenisCutiLabel: rec.jenisCuti || 'Cuti',
      tanggalMulai: rec.tanggalMulai,
      tanggalSelesai: endDate,
      jumlahHariEfektif: rec.jumlahHariEfektif || targetDates.length,
      guruPengganti: rec.guruPengganti && rec.guruPengganti !== '-' ? rec.guruPengganti : '',
      nomorSurat: rec.nomorSurat && rec.nomorSurat !== '-' ? rec.nomorSurat : '',
      catatan: rec.catatan && rec.catatan !== '-' ? rec.catatan : ''
    });

    for (const d of targetDates) {
      const key = `${normName}|${d.tanggal}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      let mapelOnDate = '-';
      if (teacher) {
        const schedEval = evaluateTeacherScheduleForDay(teacher, d.hari, threshold, jadwalList, attendanceRuleOverrides);
        mapelOnDate = schedEval.hasTeachingSchedule
          ? schedEval.mapelHariIni
          : getMapelHariIni(teacher, d.hari, jadwalList);
      }

      missingLogs.push({
        id: `CUTI-${Date.now()}-${missingLogs.length}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: rec.waktuPengajuan || nowTs,
        tanggal: d.tanggal,
        hari: d.hari,
        nama: teacher?.nama || rec.nama,
        jabatan: teacher?.jabatan || rec.jabatan || '-',
        mapelHariIni: mapelOnDate,
        jamDatang: '-',
        status: 'Cuti',
        keterangan,
        metodePresensi: 'Manual',
        peran: peranGuru
      });
    }
  }

  return missingLogs;
}

/**
 * Checks whether a DataCutiRecord is currently active on targetDateISO.
 */
export function isCutiRecordActiveOnDate(rec: DataCutiRecord, targetDateISO: string): boolean {
  if (!rec || !rec.nama || !rec.tanggalMulai) return false;
  const st = String(rec.statusPengajuan || 'Aktif').trim().toLowerCase();
  if (st !== 'aktif' && st !== '') return false;
  const end = (rec.tanggalSelesai || rec.tanggalMulai).trim();
  return targetDateISO >= rec.tanggalMulai.trim() && targetDateISO <= end;
}

function isSameTeacherName(a: string, b: string): boolean {
  const na = (a || '').trim().toLowerCase();
  const nb = (b || '').trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = cleanTeacherName(a);
  const cb = cleanTeacherName(b);
  return Boolean(ca && cb && ca === cb);
}

/**
 * Finds an active Cuti record covering `nama` on `targetDateISO`.
 * Falls back to `existingLogs` (`status === 'Cuti'`) if not explicitly ended/revoked in `cutiList`.
 */
export function findActiveCutiForTeacher(
  nama: string,
  targetDateISO: string,
  cutiList: DataCutiRecord[] = [],
  existingLogs: LogPresensi[] = []
): DataCutiRecord | null {
  if (!nama || !targetDateISO) return null;

  const activeMatch = cutiList.find(
    (c) => isSameTeacherName(c.nama, nama) && isCutiRecordActiveOnDate(c, targetDateISO)
  );
  if (activeMatch) return activeMatch;

  // Check if explicitly revoked/ended covering this date so we don't resurrect it from stale logs
  const explicitlyEnded = cutiList.some((c) => {
    if (!isSameTeacherName(c.nama, nama)) return false;
    const st = String(c.statusPengajuan || '').trim().toLowerCase();
    if (st === 'aktif' || st === '') return false;
    const end = (c.tanggalSelesai || c.tanggalMulai).trim();
    return targetDateISO >= (c.tanggalMulai || '').trim() && targetDateISO <= end;
  });
  if (explicitlyEnded) return null;

  const logCuti = existingLogs.find(
    (l) => isSameTeacherName(l.nama, nama) && l.tanggal === targetDateISO && l.status === 'Cuti'
  );
  if (logCuti) {
    const ket = (logCuti.keterangan || '').trim();
    const jenisMatch = ket.match(/^\[([^\]]+)\]/);
    const penggantiMatch = ket.match(/Pengganti\/Tugas:\s*([^•]+)/i);
    const suratMatch = ket.match(/Surat:\s*([^•]+)/i);
    return {
      id: `LOG-CUTI-${logCuti.id}`,
      waktuPengajuan: logCuti.timestamp || `${targetDateISO} 07:00:00`,
      nama: logCuti.nama,
      jabatan: logCuti.jabatan || '-',
      peran: logCuti.peran || 'Guru',
      jenisCuti: jenisMatch ? jenisMatch[1].trim() : 'Cuti',
      tanggalMulai: targetDateISO,
      tanggalSelesai: targetDateISO,
      jumlahHariEfektif: 1,
      cakupan: 'harian',
      guruPengganti: penggantiMatch ? penggantiMatch[1].trim() : '-',
      nomorSurat: suratMatch ? suratMatch[1].trim() : '-',
      catatan: ket || '-',
      statusPengajuan: 'Aktif'
    };
  }

  return null;
}

export interface ParsedSubstituteEntry {
  name: string;
  masterTeacher?: MasterGuruStaf;
  classNote?: string;
}

const NON_PERSON_REPLACEMENTS = /^(?:-|tugas\s*lks|lks|tugas\s*mandiri|mandiri|tugas\s*kelas|tidak\s*ada|belum\s*ada|tanpa\s*pengganti|kosong|none)$/i;

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTrailingDegrees(name: string): string {
  return name
    .replace(/,\s*(?:S\.[A-Za-z.]+|M\.[A-Za-z.]+|A\.Md(?:\.[A-Za-z]+)?|Drs?\.?|Ph\.D|Lc\.?|SE|SH|SS|BA|MM)\b.*$/i, '')
    .trim();
}

/**
 * Parses `guruPengganti` strings safely without splitting on academic degrees (e.g. "NURUL QOMARIYAH, S.Pd"),
 * while supporting multiple internal teachers with class notes ("ANISATUT TOYYIBAH KELAS 9, FATIMAH CITRA HANDAYANI KELAS 8")
 * as well as external substitute names ("Muhammad Mustafa Wibisono").
 */
export function parseGuruPenggantiList(
  rawPengganti: string,
  masterList: MasterGuruStaf[]
): ParsedSubstituteEntry[] {
  const raw = (rawPengganti || '').trim();
  if (!raw || NON_PERSON_REPLACEMENTS.test(raw)) return [];

  const results: ParsedSubstituteEntry[] = [];
  const seenKeys = new Set<string>();
  let working = ` ${raw} `;

  // 1. Match known teachers from Master_Guru_Staf longest-first
  const sortedMasters = [...masterList].sort((a, b) => (b.nama || '').length - (a.nama || '').length);
  for (const m of sortedMasters) {
    if (!m.nama || !m.nama.trim()) continue;
    const baseName = stripTrailingDegrees(m.nama);
    const candidates = [m.nama.trim()];
    if (baseName && baseName.length >= 4 && baseName.toLowerCase() !== m.nama.trim().toLowerCase()) {
      candidates.push(baseName);
    }

    for (const cand of candidates) {
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9])(${escapeRegExp(cand)})(?:\\s+(KELAS\\s+[0-9A-Za-z-]+(?:\\s*(?:&|dan|s\\/d|-)\\s*[0-9A-Za-z-]+)?))?(?=$|[^A-Za-z0-9])`,
        'i'
      );
      const match = working.match(pattern);
      if (match) {
        const normKey = cleanTeacherName(m.nama) || m.nama.trim().toLowerCase();
        if (!seenKeys.has(normKey)) {
          seenKeys.add(normKey);
          results.push({
            name: m.nama,
            masterTeacher: m,
            classNote: match[3] ? match[3].trim() : undefined
          });
        }
        working = working.replace(pattern, '$1 | ');
        break;
      }
    }
  }

  // 2. Parse remaining external names cleanly (preserving ", S.Pd" / ", M.Pd" suffixes)
  const segments = working
    .split(/[;|/\n]+|,(?!\s*(?:S\.|M\.|Drs?\.?|H\.|Hj\.|A\.Md|Lc|Ph\.D|Pd|Ag|Kom|Mat|SE|SH|MM|BA|SS|Fil))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let seg of segments) {
    // Extract optional inline "(KELAS ...)" or trailing "KELAS ..."
    let classNote: string | undefined;
    const kelasMatch = seg.match(/\b(KELAS\s+[0-9A-Za-z-]+(?:\s*(?:&|dan|s\/d|-)\s*[0-9A-Za-z-]+)?)\b/i);
    if (kelasMatch) {
      classNote = kelasMatch[1].trim();
      seg = seg.replace(kelasMatch[0], '').trim();
    }
    seg = seg.replace(/^[\s,.\-–—•()]+|[\s,.\-–—•()]+$/g, '').trim();
    if (!seg || seg.length < 3) continue;
    if (NON_PERSON_REPLACEMENTS.test(seg)) continue;
    if (/^(tugas|lks|mandiri|kelas\s*[0-9a-z-]*)$/i.test(seg)) continue;

    // Double-check against masterList by cleanTeacherName
    const cleanSeg = cleanTeacherName(seg);
    const fallbackMaster = masterList.find((m) => cleanTeacherName(m.nama) === cleanSeg);
    const key = cleanSeg || seg.toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push({
        name: fallbackMaster ? fallbackMaster.nama : seg,
        masterTeacher: fallbackMaster,
        classNote
      });
    }
  }

  return results;
}

/**
 * Builds an attendance roster for `targetDateISO`:
 * - Clones permanent `masterList` and enriches internal substitutes with `substitutingFor` metadata
 * - Dynamically appends virtual `MasterGuruStaf` entries (`isTempSubstitute: true`) for active external substitutes
 *   so they can check in at Kios/HP/Input Presensi ONLY during the active Cuti range.
 */
export function buildEffectiveAttendanceRoster(
  masterList: MasterGuruStaf[],
  cutiList: DataCutiRecord[] = [],
  targetDateISO: string,
  _jadwalList?: JadwalSlot[]
): MasterGuruStaf[] {
  const cloned: MasterGuruStaf[] = masterList.map((m) => ({
    ...m,
    substitutingFor: m.substitutingFor ? [...m.substitutingFor] : undefined
  }));

  if (!cutiList || cutiList.length === 0 || !targetDateISO) {
    return cloned;
  }

  const masterByKey = new Map<string, MasterGuruStaf>();
  for (const m of cloned) {
    const key = cleanTeacherName(m.nama) || m.nama.trim().toLowerCase();
    masterByKey.set(key, m);
  }

  const tempSubsMap = new Map<string, MasterGuruStaf>();
  let tempCounter = 1;

  const activeCutis = cutiList.filter((rec) => isCutiRecordActiveOnDate(rec, targetDateISO));

  for (const rec of activeCutis) {
    const parsedSubs = parseGuruPenggantiList(rec.guruPengganti, cloned);
    if (parsedSubs.length === 0) continue;

    const guruCuti = masterByKey.get(cleanTeacherName(rec.nama) || rec.nama.trim().toLowerCase());

    for (const sub of parsedSubs) {
      const assignment: SubstituteAssignment = {
        cutiId: rec.id,
        guruCutiNama: rec.nama,
        guruCutiJabatan: rec.jabatan,
        jenisCuti: rec.jenisCuti,
        tanggalMulai: rec.tanggalMulai,
        tanggalSelesai: rec.tanggalSelesai || rec.tanggalMulai,
        catatan: rec.catatan,
        classNote: sub.classNote
      };

      const subKey = cleanTeacherName(sub.name) || sub.name.trim().toLowerCase();
      const existingMaster = sub.masterTeacher
        ? masterByKey.get(cleanTeacherName(sub.masterTeacher.nama) || sub.masterTeacher.nama.trim().toLowerCase())
        : masterByKey.get(subKey);

      if (existingMaster) {
        if (!existingMaster.substitutingFor) existingMaster.substitutingFor = [];
        const dup = existingMaster.substitutingFor.some((a) => a.cutiId === assignment.cutiId);
        if (!dup) {
          existingMaster.substitutingFor.push(assignment);
        }
      } else {
        let tempEntry = tempSubsMap.get(subKey);
        if (!tempEntry) {
          const slug = sub.name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 18);
          tempEntry = {
            no: 900 + tempCounter,
            nama: sub.name,
            jabatan: `Guru Pengganti Sementara (${rec.nama})`,
            kodeUnik: `SUB-${String(tempCounter).padStart(2, '0')}-${slug || 'PENGGANTI'}`,
            kodeGuru: guruCuti?.kodeGuru,
            peran: 'Guru',
            mapelSabtu: guruCuti?.mapelSabtu || '-',
            mapelAhad: guruCuti?.mapelAhad || '-',
            mapelSenin: guruCuti?.mapelSenin || '-',
            mapelSelasa: guruCuti?.mapelSelasa || '-',
            mapelRabu: guruCuti?.mapelRabu || '-',
            mapelKamis: guruCuti?.mapelKamis || '-',
            isTempSubstitute: true,
            substitutingFor: [assignment]
          };
          tempCounter++;
          tempSubsMap.set(subKey, tempEntry);
        } else {
          if (!tempEntry.substitutingFor) tempEntry.substitutingFor = [];
          if (!tempEntry.substitutingFor.some((a) => a.cutiId === assignment.cutiId)) {
            tempEntry.substitutingFor.push(assignment);
            const names = tempEntry.substitutingFor.map((a) => a.guruCutiNama).join(', ');
            tempEntry.jabatan = `Guru Pengganti Sementara (${names})`;
          }
        }
      }
    }
  }

  return [...cloned, ...Array.from(tempSubsMap.values())];
}

/**
 * Formats substitute teacher context note for attendance logs (`keterangan`).
 */
export function formatSubstituteAttendanceNote(teacher?: MasterGuruStaf | null): string {
  if (!teacher?.substitutingFor || teacher.substitutingFor.length === 0) return '';
  const items = teacher.substitutingFor.map(
    (s) => `${s.guruCutiNama}${s.classNote ? ` (${s.classNote})` : ''}`
  );
  return `[Pengganti Sementara: ${items.join(', ')}]`;
}

export interface SubstitutedScheduleGroup {
  assignment: SubstituteAssignment;
  guruCuti?: MasterGuruStaf;
  scheduleEval: TeacherDailyScheduleEvaluation;
  matchedSesiList: ParsedSesiPelajaran[];
  isClassFiltered: boolean;
}

function normalizeClassTokensForMatch(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/\bVIII\b/g, '8')
    .replace(/\bVII\b/g, '7')
    .replace(/\bIX\b/g, '9')
    .replace(/\bKELAS\b/g, ' ')
    .split(/[\s,&;/|+-]+|\bDAN\b|\bS\/D\b/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function doesSesiMatchClassNote(sesiKelas: string, classNote?: string): boolean {
  if (!classNote || !classNote.trim()) return true;
  const noteTokens = normalizeClassTokensForMatch(classNote);
  if (noteTokens.length === 0) return true;

  const normKelas = (sesiKelas || '')
    .toUpperCase()
    .replace(/\bVIII\b/g, '8')
    .replace(/\bVII\b/g, '7')
    .replace(/\bIX\b/g, '9')
    .replace(/\bKELAS\b/g, ' ')
    .replace(/\s+/g, '');

  if (!normKelas || normKelas === '-') return false;

  return noteTokens.some((tok) => {
    if (/^[789]$/.test(tok)) {
      // Grade-only match (e.g. "9" matches "9A", "9B", "8A,9D")
      return new RegExp(`(^|[^0-9])${tok}`).test(normKelas);
    }
    return normKelas.includes(tok);
  });
}

/**
 * Resolves the teaching schedule(s) of the teacher(s) on leave (`substitutingFor`) for a given school day.
 * Supports both internal substitutes (who also have their own schedule) and external temporary substitutes.
 */
export function getSubstitutedSchedulesForDay(params: {
  teacher?: MasterGuruStaf | null;
  masterList: MasterGuruStaf[];
  hari: HariSekolah;
  threshold: string;
  jadwalList?: JadwalSlot[];
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>;
}): SubstitutedScheduleGroup[] {
  const { teacher, masterList, hari, threshold, jadwalList, attendanceRuleOverrides } = params;
  if (!teacher?.substitutingFor || teacher.substitutingFor.length === 0) return [];

  const groups: SubstitutedScheduleGroup[] = [];

  for (const assignment of teacher.substitutingFor) {
    const guruCuti = masterList.find(
      (m) => !m.isTempSubstitute && isSameTeacherName(m.nama, assignment.guruCutiNama)
    );
    if (!guruCuti) continue;

    const scheduleEval = evaluateTeacherScheduleForDay(
      guruCuti,
      hari,
      threshold,
      jadwalList,
      attendanceRuleOverrides
    );

    let matchedSesiList = scheduleEval.sesiList;
    let isClassFiltered = false;

    if (assignment.classNote && scheduleEval.sesiList.length > 0) {
      const filtered = scheduleEval.sesiList.filter((s) =>
        doesSesiMatchClassNote(s.kelas, assignment.classNote)
      );
      if (filtered.length > 0) {
        matchedSesiList = filtered;
        isClassFiltered = filtered.length < scheduleEval.sesiList.length;
      }
    }

    groups.push({
      assignment,
      guruCuti,
      scheduleEval,
      matchedSesiList,
      isClassFiltered
    });
  }

  return groups;
}

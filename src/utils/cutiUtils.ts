import { DataCutiRecord, HariSekolah, JadwalSlot, LogPresensi, MasterGuruStaf } from '../types';
import { getHariFromDate, isJumat, formatLongDateIndonesian, formatTimestamp, getMapelHariIni } from './dateUtils';
import { determineTeacherPeran, evaluateTeacherScheduleForDay, isTeacherWajibHadir } from './scheduleTimeEvaluator';

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
}): LogPresensi[] {
  const { cutiRecords, existingLogs, masterList, threshold, jadwalList, guruTanpaJadwalWajibHadir } = params;
  if (!cutiRecords || cutiRecords.length === 0) return [];

  const existingKeys = new Set<string>();
  for (const l of existingLogs) {
    if (!l.nama || !l.tanggal) continue;
    existingKeys.add(`${l.nama.trim().toLowerCase()}|${l.tanggal.trim()}`);
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
    if (String(rec.statusPengajuan || '').trim().toLowerCase() === 'dibatalkan') continue;

    const endDate = rec.tanggalSelesai || rec.tanggalMulai;
    const range = enumerateSchoolDatesInRange(rec.tanggalMulai, endDate, 180);
    if (!range.valid || range.schoolDates.length === 0) continue;

    const normName = rec.nama.trim().toLowerCase();
    const teacher = masterByName.get(normName);

    let targetDates = range.schoolDates;
    if (rec.cakupan === 'wajib_hadir' && teacher) {
      const wajibOnly = range.schoolDates.filter((d) =>
        isTeacherWajibHadir(teacher, d.hari, jadwalList, guruTanpaJadwalWajibHadir)
      );
      if (wajibOnly.length > 0) {
        targetDates = wajibOnly;
      }
    }

    const peranGuru = rec.peran && rec.peran !== '-'
      ? rec.peran
      : teacher
      ? determineTeacherPeran(teacher, jadwalList)
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
        const schedEval = evaluateTeacherScheduleForDay(teacher, d.hari, threshold, jadwalList);
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


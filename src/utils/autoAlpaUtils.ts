import {
  AppSettings,
  DataCutiRecord,
  HariSekolah,
  JadwalSlot,
  LogPresensi,
  MasterGuruStaf,
  StatusPresensi
} from '../types';
import { formatDateISO, getHariFromDate, isJumat } from './dateUtils';
import {
  evaluateTeacherScheduleForDay,
  getDefaultAlpaStatus,
  isTeacherWajibHadir,
  resolveTeacherAttendanceRule
} from './scheduleTimeEvaluator';
import { minutesToTime, timeToMinutes } from './timeUtils';

export interface AutoAlpaDeadlineInfo {
  wajibHadir: boolean;
  jamMasukSeharusnya: string | null;
  deadlineMinutes: number | null;
  deadlineTime: string | null;
  alpaStatus: StatusPresensi;
  peran: string;
  ringkasanSesi: string;
  hasTeachingToday: boolean;
  batasStaf: string | null;
  batasMengajar: string | null;
  graceMenit: number;
}

/**
 * Menghitung batas waktu maksimal presensi sebelum sistem mencatat status Tidak Hadir / Alpa otomatis.
 * Default: 90 menit setelah jam masuk masing-masing (Staf/Guru BK -> jamMasukThreshold + 90m, Guru Mapel -> jadwal sesi pertama + 90m).
 */
export function computeTeacherAutoAlpaDeadline(
  teacher: MasterGuruStaf,
  hari: HariSekolah,
  settings: AppSettings,
  jadwalList?: JadwalSlot[]
): AutoAlpaDeadlineInfo {
  const threshold = settings.jamMasukThreshold || '07:25';
  const rule = resolveTeacherAttendanceRule(
    teacher,
    jadwalList,
    undefined,
    settings.attendanceRuleOverrides
  );
  const scheduleEval = evaluateTeacherScheduleForDay(
    teacher,
    hari,
    threshold,
    jadwalList,
    settings.attendanceRuleOverrides
  );
  const hasTeachingToday = scheduleEval.hasTeachingSchedule && scheduleEval.sesiList.length > 0;
  const wajibHadir = isTeacherWajibHadir(
    teacher,
    hari,
    jadwalList,
    settings.guruTanpaJadwalWajibHadir,
    settings.attendanceRuleOverrides
  );
  const alpaStatus = getDefaultAlpaStatus(teacher, jadwalList, settings.attendanceRuleOverrides);
  const graceMenit = Math.max(15, Number(settings.autoAlpaGraceMenit ?? 90) || 90);

  if (!wajibHadir || isJumat(hari)) {
    return {
      wajibHadir: false,
      jamMasukSeharusnya: null,
      deadlineMinutes: null,
      deadlineTime: null,
      alpaStatus,
      peran: rule.peran,
      ringkasanSesi: scheduleEval.ringkasanSesiText || '-',
      hasTeachingToday,
      batasStaf: null,
      batasMengajar: null,
      graceMenit
    };
  }

  const batasStaf = rule.ruleMode === 'wajib_harian' || rule.ruleMode === 'ganda' ? threshold : null;
  let batasMengajar: string | null = null;
  if (hasTeachingToday && (rule.ruleMode === 'sesuai_jadwal' || rule.ruleMode === 'ganda')) {
    const firstTime = scheduleEval.firstScheduleTime || '07:30';
    const startMins = timeToMinutes(firstTime) ?? 450;
    const toleransi = Math.max(0, settings.guruToleransiMenit || 0);
    batasMengajar = minutesToTime(Math.max(0, startMins - toleransi));
  }

  let jamMasukSeharusnya = threshold;
  if (rule.ruleMode === 'sesuai_jadwal') {
    jamMasukSeharusnya = batasMengajar || threshold;
  } else if (rule.ruleMode === 'ganda' && batasMengajar) {
    const stafM = timeToMinutes(threshold) ?? 445;
    const ajarM = timeToMinutes(batasMengajar) ?? stafM;
    jamMasukSeharusnya = minutesToTime(Math.min(stafM, ajarM));
  }

  const entryMins = timeToMinutes(jamMasukSeharusnya) ?? 445;
  let deadlineMinutes = entryMins + graceMenit;

  if (settings.autoAlpaCutoffMode === 'batas_akhir_tetap' && settings.autoAlpaBatasAkhirJam) {
    const fixedMins = timeToMinutes(settings.autoAlpaBatasAkhirJam);
    if (fixedMins !== null) {
      // Untuk guru yang jam mengajarnya dimulai lebih siang, tetap beri ruang minimal sampai jam masuk + grace agar tidak di-Alpa sebelum kelas dimulai
      deadlineMinutes =
        rule.ruleMode === 'sesuai_jadwal'
          ? Math.max(fixedMins, entryMins + graceMenit)
          : Math.max(fixedMins, entryMins + 30);
    }
  }

  return {
    wajibHadir: true,
    jamMasukSeharusnya,
    deadlineMinutes,
    deadlineTime: minutesToTime(deadlineMinutes),
    alpaStatus,
    peran: rule.peran,
    ringkasanSesi: scheduleEval.ringkasanSesiText || '-',
    hasTeachingToday,
    batasStaf,
    batasMengajar,
    graceMenit
  };
}

function isCoveredByActiveCuti(
  nama: string,
  tanggal: string,
  cutiList: DataCutiRecord[]
): boolean {
  const norm = nama.trim().toLowerCase();
  for (const c of cutiList) {
    if (!c || (c.statusPengajuan && c.statusPengajuan !== 'Aktif')) continue;
    if (c.nama.trim().toLowerCase() !== norm) continue;
    const start = (c.tanggalMulai || '').trim();
    const end = (c.tanggalSelesai || start).trim();
    if (start && tanggal >= start && tanggal <= end) {
      return true;
    }
  }
  return false;
}

function getRecentSchoolDates(startIso: string, endIso: string, maxDays: number = 7): string[] {
  const dates: string[] = [];
  if (!startIso || !endIso || startIso > endIso) return dates;

  const endParts = endIso.split('-').map((n) => parseInt(n, 10));
  const cur = new Date(endParts[0], endParts[1] - 1, endParts[2]);

  for (let i = 0; i < maxDays; i++) {
    const iso = formatDateISO(cur);
    if (iso < startIso) break;
    const hari = getHariFromDate(iso);
    if (!isJumat(hari)) {
      dates.push(iso);
    }
    cur.setDate(cur.getDate() - 1);
  }

  return dates.sort((a, b) => a.localeCompare(b));
}

export function computeMissingAutoAlpaLogs(params: {
  masterList: MasterGuruStaf[];
  existingLogs: LogPresensi[];
  cutiList: DataCutiRecord[];
  settings: AppSettings;
  jadwalList?: JadwalSlot[];
  targetDates?: string[];
  now?: Date;
  bypassTodayTimeCheck?: boolean;
}): LogPresensi[] {
  const {
    masterList,
    existingLogs,
    cutiList,
    settings,
    jadwalList,
    targetDates,
    now = new Date(),
    bypassTodayTimeCheck = false
  } = params;

  if (!masterList || masterList.length === 0) return [];

  const todayISO = formatDateISO(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startDate = (settings.autoAlpaMulaiTanggal || todayISO).trim();

  const datesToCheck =
    targetDates && targetDates.length > 0
      ? targetDates.filter((d) => d && d <= todayISO)
      : getRecentSchoolDates(startDate, todayISO, 7);

  if (datesToCheck.length === 0) return [];

  // Index existing logs by nama_tanggal
  const existingKeys = new Set<string>();
  for (const l of existingLogs) {
    if (!l.nama || !l.tanggal) continue;
    existingKeys.add(`${l.nama.trim().toLowerCase()}_${l.tanggal.trim()}`);
  }

  const generated: LogPresensi[] = [];

  for (const tanggal of datesToCheck) {
    const hari = getHariFromDate(tanggal);
    if (isJumat(hari)) continue;
    if (tanggal > todayISO) continue;

    const isToday = tanggal === todayISO;

    for (const teacher of masterList) {
      if (!teacher.nama || !teacher.nama.trim()) continue;
      const key = `${teacher.nama.trim().toLowerCase()}_${tanggal}`;
      if (existingKeys.has(key)) continue;
      if (isCoveredByActiveCuti(teacher.nama, tanggal, cutiList)) continue;

      const info = computeTeacherAutoAlpaDeadline(teacher, hari, settings, jadwalList);
      if (!info.wajibHadir || info.deadlineMinutes === null || !info.deadlineTime) continue;

      if (isToday && !bypassTodayTimeCheck && nowMinutes <= info.deadlineMinutes) {
        continue;
      }

      const slug = teacher.nama
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);

      const modeNote =
        settings.autoAlpaCutoffMode === 'batas_akhir_tetap' && settings.autoAlpaBatasAkhirJam
          ? `batas akhir kedatangan ${info.deadlineTime} WIB`
          : `batas maksimal ${info.deadlineTime} WIB (+${info.graceMenit} menit dari jam masuk ${info.jamMasukSeharusnya} WIB)`;

      const statusStafVal =
        info.batasStaf ? 'Alpa' : '-';
      const statusMengajarVal =
        info.batasMengajar ? 'Alpa' : '-';

      generated.push({
        id: `AUTO-ALPA-${tanggal}-${slug}`,
        timestamp: `${tanggal} ${info.deadlineTime}:00`,
        tanggal,
        hari,
        nama: teacher.nama,
        jabatan: teacher.jabatan || '-',
        mapelHariIni: info.ringkasanSesi || '-',
        jamDatang: '-',
        status: info.alpaStatus,
        keterangan: `[Otomatis Sistem: Tidak Hadir] Tidak mengisi presensi hingga ${modeNote}.`,
        metodePresensi: 'Manual',
        peran: info.peran,
        batasStaf: info.batasStaf || undefined,
        statusStaf: statusStafVal,
        batasMengajar: info.batasMengajar || undefined,
        statusMengajar: statusMengajarVal
      });

      existingKeys.add(key);
    }
  }

  return generated;
}

export interface SpAttendanceBreakdown {
  periodeLabel: string;
  totalLogs: number;
  totalWajibHadir: number;
  hadirCount: number;
  tepatWaktuCount: number;
  terlambatCount: number;
  alpaCount: number;
  izinSakitCount: number;
  dinasLuarCount: number;
  cutiCount: number;
  pctHadir: number | null;
  pctLabel: string;
  summaryLine: string;
  rincianText: string;
  violationLines: string[];
}

export function analyzeTeacherSpAttendance(params: {
  nama: string;
  logs: LogPresensi[];
  monthPrefix?: string; // e.g. '2026-11' or '' for all
  periodeLabel?: string;
}): SpAttendanceBreakdown {
  const { nama, logs, monthPrefix = '', periodeLabel = 'Periode Berjalan' } = params;
  const norm = nama.trim().toLowerCase();

  const filtered = logs
    .filter((l) => {
      if (!l.nama || l.nama.trim().toLowerCase() !== norm) return false;
      if (monthPrefix && !(l.tanggal || '').startsWith(monthPrefix)) return false;
      return true;
    })
    .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));

  const cutiCount = filtered.filter((l) => l.status === 'Cuti').length;
  const tepatWaktuCount = filtered.filter((l) => l.status === 'Tepat Waktu').length;
  const dinasLuarCount = filtered.filter((l) => l.status === 'Dinas Luar').length;
  const terlambatLogs = filtered.filter((l) => l.status === 'Terlambat');
  const alpaLogs = filtered.filter((l) => (l.status || '').startsWith('Alpa'));
  const izinSakitCount = filtered.filter((l) => l.status === 'Izin' || l.status === 'Sakit').length;

  const totalWajibHadir = Math.max(0, filtered.length - cutiCount);
  const hadirCount = tepatWaktuCount + terlambatLogs.length + dinasLuarCount;
  const pctHadir = totalWajibHadir > 0 ? Math.round((hadirCount / totalWajibHadir) * 100) : null;
  const pctLabel = pctHadir !== null ? `${pctHadir}%` : '-';

  const violationLines: string[] = [];

  for (const a of alpaLogs) {
    const isAuto = (a.keterangan || '').includes('Otomatis Sistem');
    const detail = a.keterangan ? a.keterangan.replace(/^\[Otomatis Sistem:\s*Tidak Hadir\]\s*/i, '').trim() : 'Tanpa keterangan hadir/izin';
    violationLines.push(
      `${a.hari || ''} ${a.tanggal} — ${a.status}${isAuto ? ' [Auto >90m]' : ''}: ${detail}`
    );
  }

  for (const t of terlambatLogs) {
    const batasInfo = t.batasMengajar || t.batasStaf;
    const batasTxt = batasInfo ? `, batas ${batasInfo} WIB` : '';
    const ketTxt = t.keterangan ? ` (${t.keterangan})` : '';
    violationLines.push(
      `${t.hari || ''} ${t.tanggal} — Terlambat: Hadir pukul ${t.jamDatang || '-'} WIB${batasTxt}${ketTxt}`
    );
  }

  const cutiNote =
    cutiCount > 0 ? ` • Cuti Resmi: ${cutiCount} hr (dikecualikan/non-pelanggaran)` : '';

  const summaryLine =
    totalWajibHadir > 0
      ? `Rekap ${periodeLabel}: Hadir ${hadirCount}/${totalWajibHadir} hari wajib (${pctLabel}) | Tepat Waktu: ${tepatWaktuCount}, Terlambat: ${terlambatLogs.length}, Tidak Hadir/Alpa: ${alpaLogs.length}, Izin/Sakit: ${izinSakitCount}${cutiNote}.`
      : cutiCount > 0
      ? `Rekap ${periodeLabel}: Sedang Cuti Resmi (${cutiCount} hari — tidak termasuk pelanggaran).`
      : `Rekap ${periodeLabel}: Belum ada catatan log presensi di periode ini.`;

  const maxListed = violationLines.slice(0, 12);
  const extraCount = violationLines.length - maxListed.length;
  const detailBullets =
    maxListed.length > 0
      ? maxListed.map((line) => `• ${line}`).join('\n') +
        (extraCount > 0 ? `\n• ...dan ${extraCount} catatan pelanggaran lainnya.` : '')
      : '• Tidak ditemukan catatan Terlambat / Alpa pada periode ini (isi manual jika terkait ketidakhadiran rapat/agenda khusus).';

  return {
    periodeLabel,
    totalLogs: filtered.length,
    totalWajibHadir,
    hadirCount,
    tepatWaktuCount,
    terlambatCount: terlambatLogs.length,
    alpaCount: alpaLogs.length,
    izinSakitCount,
    dinasLuarCount,
    cutiCount,
    pctHadir,
    pctLabel,
    summaryLine,
    rincianText: `${summaryLine}\n${detailBullets}`,
    violationLines
  };
}

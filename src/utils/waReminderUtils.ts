import {
  AppSettings,
  DataCutiRecord,
  HariSekolah,
  JadwalSlot,
  LogPresensi,
  MasterGuruStaf
} from '../types';
import { buildEffectiveAttendanceRoster, isCutiRecordActiveOnDate } from './cutiUtils';
import { formatLongDateIndonesian, getHariFromDate, isJumat } from './dateUtils';
import { computeTeacherAutoAlpaDeadline } from './autoAlpaUtils';
import { evaluateTeacherScheduleForDay, isTeacherWajibHadir } from './scheduleTimeEvaluator';
import { timeToMinutes } from './timeUtils';

export interface BelumAbsenWaItem {
  nama: string;
  jabatan: string;
  peran: string;
  isTempSubstitute: boolean;
  substituteForText?: string;
  jamMasukSeharusnya: string | null;
  deadlineTime: string | null;
  hasTeachingToday: boolean;
  ringkasanJadwal: string;
  kategori: 'segera_alpa' | 'jadwal_siang' | 'pengganti';
}

export interface BelumAbsenWaSummary {
  tanggal: string;
  hari: HariSekolah;
  isHoliday: boolean;
  reminderJam: string;
  totalBelumAbsen: number;
  segeraAlpaList: BelumAbsenWaItem[];
  jadwalSiangList: BelumAbsenWaItem[];
  penggantiList: BelumAbsenWaItem[];
  cutiCount: number;
  hadirCount: number;
}

export function computeBelumAbsenWaSummary(params: {
  masterList: MasterGuruStaf[];
  logs: LogPresensi[];
  cutiList: DataCutiRecord[];
  settings: AppSettings;
  jadwalList?: JadwalSlot[];
  tanggal: string;
}): BelumAbsenWaSummary {
  const { masterList, logs, cutiList, settings, jadwalList, tanggal } = params;
  const hari = getHariFromDate(tanggal) as HariSekolah;
  const reminderJam = (settings.waReminderJam || '08:30').trim();
  const reminderMins = timeToMinutes(reminderJam) ?? 510; // 08:30

  if (isJumat(hari)) {
    return {
      tanggal,
      hari,
      isHoliday: true,
      reminderJam,
      totalBelumAbsen: 0,
      segeraAlpaList: [],
      jadwalSiangList: [],
      penggantiList: [],
      cutiCount: 0,
      hadirCount: 0
    };
  }

  const effectiveRoster = buildEffectiveAttendanceRoster(masterList, cutiList, tanggal, jadwalList);
  const recordedNames = new Set(
    logs.filter((l) => l.tanggal === tanggal && l.nama).map((l) => l.nama.trim().toLowerCase())
  );
  const activeCutiNames = new Set(
    cutiList.filter((c) => isCutiRecordActiveOnDate(c, tanggal)).map((c) => c.nama.trim().toLowerCase())
  );

  const cutiCount = logs.filter((l) => l.tanggal === tanggal && l.status === 'Cuti').length;
  const hadirCount = logs.filter((l) => l.tanggal === tanggal && l.status !== 'Cuti').length;

  const segeraAlpaList: BelumAbsenWaItem[] = [];
  const jadwalSiangList: BelumAbsenWaItem[] = [];
  const penggantiList: BelumAbsenWaItem[] = [];

  for (const m of effectiveRoster) {
    if (!m.nama || !m.nama.trim()) continue;
    const norm = m.nama.trim().toLowerCase();
    if (recordedNames.has(norm) || activeCutiNames.has(norm)) continue;

    if (m.isTempSubstitute) {
      const subText = (m.substitutingFor || [])
        .map((s) => `${s.guruCutiNama}${s.classNote ? ` (${s.classNote})` : ''}`)
        .join(', ');
      penggantiList.push({
        nama: m.nama,
        jabatan: m.jabatan,
        peran: 'Pengganti Sementara',
        isTempSubstitute: true,
        substituteForText: subText || undefined,
        jamMasukSeharusnya: settings.jamMasukThreshold || '07:25',
        deadlineTime: null,
        hasTeachingToday: true,
        ringkasanJadwal: subText ? `Menggantikan ${subText}` : 'Guru Pengganti Sementara',
        kategori: 'pengganti'
      });
      continue;
    }

    const wajibHadir = isTeacherWajibHadir(
      m,
      hari,
      jadwalList,
      settings.guruTanpaJadwalWajibHadir,
      settings.attendanceRuleOverrides
    );
    if (!wajibHadir) continue;

    const deadlineInfo = computeTeacherAutoAlpaDeadline(m, hari, settings, jadwalList);
    const scheduleEval = evaluateTeacherScheduleForDay(
      m,
      hari,
      settings.jamMasukThreshold || '07:25',
      jadwalList,
      settings.attendanceRuleOverrides
    );

    const entryMins = deadlineInfo.jamMasukSeharusnya
      ? timeToMinutes(deadlineInfo.jamMasukSeharusnya) ?? 445
      : 445;

    // Jika jam masuk <= jam pengingat (mis. 08:30: Staf 07:25, Jam I-II 07:30, Jam III-IV 08:30),
    // guru/staf tersebut masuk prioritas pengingat sebelum batas Auto-Alpa
    const isUrgent = entryMins <= reminderMins;

    const item: BelumAbsenWaItem = {
      nama: m.nama,
      jabatan: m.jabatan,
      peran: deadlineInfo.peran,
      isTempSubstitute: false,
      jamMasukSeharusnya: deadlineInfo.jamMasukSeharusnya,
      deadlineTime: deadlineInfo.deadlineTime,
      hasTeachingToday: scheduleEval.hasTeachingSchedule,
      ringkasanJadwal:
        scheduleEval.hasTeachingSchedule && scheduleEval.ringkasanSesiText !== '-'
          ? scheduleEval.ringkasanSesiText
          : deadlineInfo.peran === 'Guru BK'
          ? 'Wajib Hadir Guru BK'
          : 'Wajib Hadir Harian',
      kategori: isUrgent ? 'segera_alpa' : 'jadwal_siang'
    };

    if (isUrgent) {
      segeraAlpaList.push(item);
    } else {
      jadwalSiangList.push(item);
    }
  }

  return {
    tanggal,
    hari,
    isHoliday: false,
    reminderJam,
    totalBelumAbsen: segeraAlpaList.length + jadwalSiangList.length + penggantiList.length,
    segeraAlpaList,
    jadwalSiangList,
    penggantiList,
    cutiCount,
    hadirCount
  };
}

export function buildBelumAbsenWaMessage(params: {
  summary: BelumAbsenWaSummary;
  appPublicUrl?: string;
  graceMenit?: number;
}): string {
  const { summary, appPublicUrl, graceMenit = 90 } = params;
  const tglLabel = formatLongDateIndonesian(summary.tanggal);

  if (summary.isHoliday) {
    return `Hari ${summary.hari} (${tglLabel}) adalah hari libur sekolah. Tidak ada pengingat presensi.`;
  }

  if (summary.totalBelumAbsen === 0) {
    return [
      `Assalamu'alaikum Wr. Wb.`,
      `*INFO PRESENSI PKL. ${summary.reminderJam} WIB*`,
      `SMP Nurul Abror Al-Robbaniyin`,
      `Hari/Tgl: ${summary.hari}, ${tglLabel}`,
      ``,
      `Alhamdulillah, seluruh guru & staf yang wajib hadir hari ini sudah tercatat presensi.`,
      `Terima kasih. Wassalamu'alaikum Wr. Wb.`
    ].join('\n');
  }

  const lines: string[] = [
    `Assalamu'alaikum Wr. Wb.`,
    `*PENGINGAT PRESENSI GURU & STAF (PKL. ${summary.reminderJam} WIB)*`,
    `SMP Nurul Abror Al-Robbaniyin`,
    `Hari/Tgl: ${summary.hari}, ${tglLabel}`,
    ``
  ];

  if (summary.segeraAlpaList.length > 0) {
    lines.push(
      `⚠️ *Belum Presensi — Segera Sebelum Batas Auto-Alpa (+${graceMenit} mnt):*`
    );
    summary.segeraAlpaList.forEach((item, idx) => {
      const batas = item.deadlineTime ? ` | Tutup Auto: *${item.deadlineTime} WIB*` : '';
      const info = item.hasTeachingToday ? item.ringkasanJadwal : item.peran;
      lines.push(`${idx + 1}. *${item.nama}* (${info}${batas})`);
    });
    lines.push('');
  }

  if (summary.jadwalSiangList.length > 0) {
    lines.push(`🕒 *Pengingat Jadwal Mengajar Siang Hari Ini:*`);
    summary.jadwalSiangList.forEach((item, idx) => {
      const masuk = item.jamMasukSeharusnya ? `Masuk ${item.jamMasukSeharusnya} WIB` : '';
      const batas = item.deadlineTime ? `, Tutup Auto ${item.deadlineTime} WIB` : '';
      lines.push(`${idx + 1}. *${item.nama}* — ${item.ringkasanJadwal} (${masuk}${batas})`);
    });
    lines.push('');
  }

  if (summary.penggantiList.length > 0) {
    lines.push(`🔄 *Guru Pengganti Sementara Belum Presensi:*`);
    summary.penggantiList.forEach((item, idx) => {
      lines.push(`${idx + 1}. *${item.nama}* (${item.ringkasanJadwal})`);
    });
    lines.push('');
  }

  lines.push(
    `Mohon segera melakukan presensi di sekolah agar tidak tercatat *Tidak Hadir / Alpa* secara otomatis oleh sistem.`
  );
  lines.push(
    `Jika berhalangan (*Izin / Sakit / Dinas Luar*), silakan ajukan langsung dari rumah melalui Presensi Mandiri (tanpa GPS) & cantumkan tugas untuk siswa.`
  );

  if (appPublicUrl && appPublicUrl.trim()) {
    lines.push(`🔗 Link Presensi: ${appPublicUrl.trim()}`);
  }

  lines.push('');
  lines.push(`Terima kasih atas perhatiannya. Wassalamu'alaikum Wr. Wb.`);

  return lines.join('\n');
}

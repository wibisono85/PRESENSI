import React, { useState, useMemo } from 'react';
import {
  LogPresensi,
  MasterGuruStaf,
  StatusPresensi,
  AppSettings,
  JadwalSlot,
  HariSekolah
} from '../types';
import {
  formatDateISO,
  formatLongDateIndonesian,
  getHariFromDate
} from '../utils/dateUtils';
import { timeToMinutes, minutesToTime } from '../utils/timeUtils';
import { evaluateTeacherAttendanceStatus } from '../utils/scheduleTimeEvaluator';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Maximize2,
  Minimize2,
  Calendar,
  Filter,
  ArrowUpDown,
  FileSpreadsheet,
  Award,
  AlertCircle,
  Info,
  ShieldAlert,
  Sparkles,
  X,
  BellRing,
  UserCheck,
  UserX
} from 'lucide-react';

interface DashboardViewProps {
  logs: LogPresensi[];
  masterList: MasterGuruStaf[];
  settings?: AppSettings;
  jadwalList?: JadwalSlot[];
}

type PeriodPreset = 'today' | 'week' | 'month' | 'custom';

const STATUS_COLORS: Record<StatusPresensi, string> = {
  'Tepat Waktu': '#10B981', // Emerald-500
  'Terlambat': '#F59E0B',   // Amber-500
  'Izin': '#3B82F6',        // Blue-500
  'Sakit': '#6366F1',       // Indigo-500
  'Cuti': '#14B8A6',        // Teal-500
  'Alpa': '#EF4444',        // Red-500
  'Alpa (Jadwal Mengajar)': '#DC2626', // Red-600
  'Alpa (Wajib Hadir Staf)': '#B91C1C', // Red-700
  'Alpa (Wajib Hadir Guru BK)': '#991B1B', // Red-800
  'Dinas Luar': '#8B5CF6'   // Purple-500
};

export const DashboardView: React.FC<DashboardViewProps> = ({ logs, masterList, settings, jadwalList }) => {
  // Period filter states
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('month');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // 1st day of month
    return formatDateISO(d);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(formatDateISO());

  // Presentation Mode Toggle
  const [isPresenting, setIsPresenting] = useState<boolean>(false);

  // Sorting state for leaderboard
  const [sortField, setSortField] = useState<string>('terlambat');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Late/Alpa threshold alert setting
  const [alertThreshold, setAlertThreshold] = useState<number>(3);

  // Teladan score modal visibility
  const [showScoreInfoModal, setShowScoreInfoModal] = useState<boolean>(false);

  // Top candidates count for Teladan leaderboard
  const [topTeladanCount, setTopTeladanCount] = useState<number>(5);

  // Expanded card state for details viewing
  const [expandedQuotaKeys, setExpandedQuotaKeys] = useState<Record<string, boolean>>({});
  const [expandedPembinaanKeys, setExpandedPembinaanKeys] = useState<Record<string, boolean>>({});

  // Compute active date range based on preset
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const todayStr = formatDateISO(now);

    if (periodPreset === 'today') {
      return { startDate: todayStr, endDate: todayStr };
    } else if (periodPreset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { startDate: formatDateISO(d), endDate: todayStr };
    } else if (periodPreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: formatDateISO(start), endDate: formatDateISO(end) };
    } else {
      return { startDate: customStartDate, endDate: customEndDate };
    }
  }, [periodPreset, customStartDate, customEndDate]);

  // Filtered Logs by date range
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => l.tanggal >= startDate && l.tanggal <= endDate);
  }, [logs, startDate, endDate]);

  // Overall Statistics Cards
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    let tepatWaktu = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let cuti = 0;
    let alpa = 0;
    let dinasLuar = 0;

    for (const l of filteredLogs) {
      if (l.status === 'Tepat Waktu') tepatWaktu++;
      else if (l.status === 'Terlambat') terlambat++;
      else if (l.status === 'Izin') izin++;
      else if (l.status === 'Sakit') sakit++;
      else if (l.status === 'Cuti') cuti++;
      else if (l.status.includes('Alpa')) alpa++;
      else if (l.status === 'Dinas Luar') dinasLuar++;
    }

    const tepatWaktuPct = total > 0 ? Math.round((tepatWaktu / total) * 100) : 0;
    const terlambatPct = total > 0 ? Math.round((terlambat / total) * 100) : 0;

    return {
      total,
      tepatWaktu,
      tepatWaktuPct,
      terlambat,
      terlambatPct,
      izin,
      sakit,
      cuti,
      alpa,
      dinasLuar
    };
  }, [filteredLogs]);

  const masterMap = useMemo(() => {
    return new Map(masterList.map((m) => [m.nama.trim().toLowerCase(), m]));
  }, [masterList]);

  const getLogThresholdMins = (log: LogPresensi): number => {
    if (log.batasMengajar && log.peran === 'Guru') {
      const m = timeToMinutes(log.batasMengajar);
      if (m !== null) return m;
    }
    if (log.batasStaf && (log.peran === 'Staf' || log.peran === 'Guru BK')) {
      const m = timeToMinutes(log.batasStaf);
      if (m !== null) return m;
    }
    const key = (log.nama || '').trim().toLowerCase();
    const teacher = masterMap.get(key);
    if (teacher) {
      const evalRes = evaluateTeacherAttendanceStatus(
        log.jamDatang || '07:00',
        teacher,
        (log.hari as HariSekolah) || getHariFromDate(log.tanggal),
        settings?.jamMasukThreshold || '07:25',
        settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
        jadwalList,
        settings?.guruToleransiMenit || 0,
        settings?.guruTanpaJadwalWajibHadir || false,
        undefined,
        settings?.attendanceRuleOverrides
      );
      const used = log.batasMengajar || log.batasStaf || evalRes.thresholdUsed;
      const m = timeToMinutes(used);
      if (m !== null) return m;
    }
    return settings?.jamMasukThreshold ? (timeToMinutes(settings.jamMasukThreshold) || 445) : 445;
  };

  // 1. FITUR 1 - Leaderboard "Guru & Staf Teladan" (Reward Candidates)
  const teladanData = useMemo(() => {
    const map = new Map<string, {
      nama: string;
      jabatan: string;
      tepatWaktu: number;
      terlambat: number;
      cuti: number;
      alpa: number;
      totalWorkingDays: number;
      arrivalMinutesList: number[];
      arrivalDiffs: number[];
    }>();

    for (const m of masterList) {
      const key = (m.nama || '').trim().toLowerCase();
      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan,
        tepatWaktu: 0,
        terlambat: 0,
        cuti: 0,
        alpa: 0,
        totalWorkingDays: 0,
        arrivalMinutesList: [],
        arrivalDiffs: []
      });
    }

    for (const log of filteredLogs) {
      const key = (log.nama || '').trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: log.nama.trim(),
          jabatan: log.jabatan || '-',
          tepatWaktu: 0,
          terlambat: 0,
          cuti: 0,
          alpa: 0,
          totalWorkingDays: 0,
          arrivalMinutesList: [],
          arrivalDiffs: []
        });
      }
      const item = map.get(key)!;
      item.totalWorkingDays++;
      if (log.status === 'Tepat Waktu') item.tepatWaktu++;
      else if (log.status === 'Terlambat') item.terlambat++;
      else if (log.status === 'Cuti') item.cuti++;
      else if (log.status === 'Alpa' || log.status.includes('Alpa')) item.alpa++;

      if (log.jamDatang && log.jamDatang !== '-') {
        const mins = timeToMinutes(log.jamDatang);
        if (mins !== null) {
          const personThresh = getLogThresholdMins(log);
          const diff = personThresh - mins;
          item.arrivalMinutesList.push(mins);
          item.arrivalDiffs.push(diff);
        }
      }
    }

    const candidates: Array<{
      nama: string;
      jabatan: string;
      tepatWaktu: number;
      totalWorkingDays: number;
      pctTepatWaktu: number;
      avgArrivalMins: number | null;
      avgArrivalStr: string;
      score: number;
      isDisqualified: boolean;
      disqualifyReason?: string;
    }> = [];

    for (const item of map.values()) {
      const isDisqualified = item.alpa > 0;
      const disqualifyReason = isDisqualified ? `Mempunyai ${item.alpa}x catatan Alpa` : undefined;
      const attendedCount = item.tepatWaktu + item.terlambat;
      const effectiveDays = Math.max(0, item.totalWorkingDays - item.cuti);

      const totalDays = effectiveDays || 1;
      const pctTepatWaktu = effectiveDays > 0 ? Math.round((item.tepatWaktu / totalDays) * 100) : 0;

      let avgArrivalMins: number | null = null;
      let avgArrivalStr = '-';
      let arrivalScore = 70;

      if (item.arrivalDiffs.length > 0) {
        const sum = item.arrivalMinutesList.reduce((a, b) => a + b, 0);
        avgArrivalMins = Math.round(sum / item.arrivalMinutesList.length);
        avgArrivalStr = minutesToTime(avgArrivalMins);

        // Diff relative to person's role threshold
        // Earlier arrival = higher score (06:30 = 100)
        const avgDiff = item.arrivalDiffs.reduce((a, b) => a + b, 0) / item.arrivalDiffs.length;
        arrivalScore = Math.max(0, Math.min(100, Math.round(70 + avgDiff * 0.5)));
      }

      let finalScore = Math.round((pctTepatWaktu * 0.7) + (arrivalScore * 0.3));
      if (isDisqualified || attendedCount === 0) {
        finalScore = 0;
      }

      candidates.push({
        nama: item.nama,
        jabatan: item.jabatan,
        tepatWaktu: item.tepatWaktu,
        totalWorkingDays: effectiveDays,
        pctTepatWaktu,
        avgArrivalMins,
        avgArrivalStr,
        score: finalScore,
        isDisqualified,
        disqualifyReason
      });
    }

    // Filter eligible candidates with physical attendance, sorted by score desc
    const eligible = candidates
      .filter((c) => !c.isDisqualified && c.totalWorkingDays > 0 && c.score > 0)
      .sort((a, b) => b.score - a.score || b.pctTepatWaktu - a.pctTepatWaktu || (a.avgArrivalMins || 9999) - (b.avgArrivalMins || 9999));

    return eligible;
  }, [filteredLogs, masterList, settings, jadwalList, masterMap]);

  // 2. FITUR 1 - Panel "Perlu Pembinaan / Perhatian" (Teguran Candidates)
  const pembinaanData = useMemo(() => {
    const map = new Map<string, {
      nama: string;
      jabatan: string;
      terlambat: number;
      alpa: number;
      lateDiffMinutesList: number[];
      logDetails: Array<{ tanggal: string; status: string; jamDatang: string; keterangan: string }>;
    }>();

    for (const m of masterList) {
      const key = (m.nama || '').trim().toLowerCase();
      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan,
        terlambat: 0,
        alpa: 0,
        lateDiffMinutesList: [],
        logDetails: []
      });
    }

    for (const log of filteredLogs) {
      const key = (log.nama || '').trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: log.nama.trim(),
          jabatan: log.jabatan || '-',
          terlambat: 0,
          alpa: 0,
          lateDiffMinutesList: [],
          logDetails: []
        });
      }
      const item = map.get(key)!;
      if (log.status === 'Terlambat') {
        item.terlambat++;
        if (log.jamDatang && log.jamDatang !== '-') {
          const mins = timeToMinutes(log.jamDatang);
          if (mins !== null) {
            const personThresh = getLogThresholdMins(log);
            if (mins > personThresh) {
              item.lateDiffMinutesList.push(mins - personThresh);
            }
          }
        }
        item.logDetails.push({
          tanggal: log.tanggal,
          status: log.status,
          jamDatang: log.jamDatang || '-',
          keterangan: log.keterangan || ''
        });
      } else if (log.status === 'Alpa' || log.status.includes('Alpa')) {
        item.alpa++;
        item.logDetails.push({
          tanggal: log.tanggal,
          status: log.status,
          jamDatang: '-',
          keterangan: log.keterangan || 'Alpa (Tanpa Keterangan)'
        });
      }
    }

    const list: Array<{
      nama: string;
      jabatan: string;
      terlambat: number;
      alpa: number;
      avgLateDiff: number;
      severityScore: number;
      badgeColor: 'red' | 'yellow';
      detailsText: string;
      logDetails: Array<{ tanggal: string; status: string; jamDatang: string; keterangan: string }>;
    }> = [];

    for (const item of map.values()) {
      if (item.terlambat >= alertThreshold || item.alpa > 0) {
        let avgLateDiff = 0;
        if (item.lateDiffMinutesList.length > 0) {
          avgLateDiff = Math.round(
            item.lateDiffMinutesList.reduce((a, b) => a + b, 0) / item.lateDiffMinutesList.length
          );
        }

        const severityScore = (item.alpa * 5) + (item.terlambat * 2);
        const isRed = item.alpa >= 2 || item.terlambat >= (alertThreshold + 2);
        const badgeColor = isRed ? 'red' : 'yellow';

        const detailParts: string[] = [];
        if (item.terlambat > 0) {
          detailParts.push(`Terlambat ${item.terlambat}x${avgLateDiff > 0 ? ` (rata-rata ${avgLateDiff} mnt)` : ''}`);
        }
        if (item.alpa > 0) {
          detailParts.push(`Alpa ${item.alpa}x`);
        }

        list.push({
          nama: item.nama,
          jabatan: item.jabatan,
          terlambat: item.terlambat,
          alpa: item.alpa,
          avgLateDiff,
          severityScore,
          badgeColor,
          detailsText: detailParts.join(', '),
          logDetails: item.logDetails
        });
      }
    }

    list.sort((a, b) => b.severityScore - a.severityScore);
    return list;
  }, [filteredLogs, masterList, settings, alertThreshold]);

  // 3. FITUR 2 - Panel "Pengingat Kuota Kehadiran"
  const quotaReminderData = useMemo(() => {
    const limits: Record<string, number> = {
      Izin: settings?.quotaIzin ?? 3,
      Sakit: settings?.quotaSakit ?? 5,
      Alpa: settings?.quotaAlpa ?? 1,
      'Dinas Luar': settings?.quotaDinasLuar ?? 5
    };

    const map = new Map<string, {
      nama: string;
      jabatan: string;
      counts: Record<string, number>;
      logDetails: Array<{ tanggal: string; status: string; jamDatang: string; keterangan: string }>;
    }>();

    for (const m of masterList) {
      const key = (m.nama || '').trim().toLowerCase();
      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan,
        counts: { Izin: 0, Sakit: 0, Alpa: 0, 'Dinas Luar': 0 },
        logDetails: []
      });
    }

    // Process filteredLogs (follows active date filter range selected in top header!)
    for (const log of filteredLogs) {
      const key = (log.nama || '').trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: log.nama.trim(),
          jabatan: log.jabatan || '-',
          counts: { Izin: 0, Sakit: 0, Alpa: 0, 'Dinas Luar': 0 },
          logDetails: []
        });
      }
      const item = map.get(key)!;
      const stKey = log.status.includes('Alpa') ? 'Alpa' : log.status;
      if (item.counts[stKey] !== undefined) {
        item.counts[stKey]++;
        item.logDetails.push({
          tanggal: log.tanggal,
          status: log.status,
          jamDatang: log.jamDatang || '-',
          keterangan: log.keterangan || ''
        });
      }
    }

    const warnings: Array<{
      nama: string;
      jabatan: string;
      counts: Record<string, number>;
      totalCount: number;
      status: 'exceeded' | 'approaching' | 'recorded';
      message: string;
      logDetails: Array<{ tanggal: string; status: string; jamDatang: string; keterangan: string }>;
    }> = [];

    for (const item of map.values()) {
      const totalCount = item.counts.Izin + item.counts.Sakit + item.counts.Alpa + item.counts['Dinas Luar'];
      if (totalCount === 0) continue;

      let isExceeded = false;
      let isApproaching = false;
      const warningParts: string[] = [];

      for (const [cat, limitVal] of Object.entries(limits)) {
        const c = item.counts[cat] || 0;
        if (c === 0) continue;

        if (limitVal > 0 && c > limitVal) {
          isExceeded = true;
          warningParts.push(`${cat} ${c}/${limitVal} (Melebihi ${c - limitVal}x)`);
        } else if (limitVal > 0 && c === limitVal) {
          isExceeded = true;
          warningParts.push(`${cat} ${c}/${limitVal} (Kuota Habis)`);
        } else if (limitVal > 1 && c === limitVal - 1) {
          isApproaching = true;
          warningParts.push(`${cat} ${c}/${limitVal} (Sisa 1x)`);
        } else {
          warningParts.push(`${cat} ${c}x`);
        }
      }

      const statusTag: 'exceeded' | 'approaching' | 'recorded' = isExceeded
        ? 'exceeded'
        : isApproaching
        ? 'approaching'
        : 'recorded';

      warnings.push({
        nama: item.nama,
        jabatan: item.jabatan,
        counts: item.counts,
        totalCount,
        status: statusTag,
        message: warningParts.join(', '),
        logDetails: item.logDetails
      });
    }

    warnings.sort((a, b) => {
      const priority = (w: typeof a) => (w.status === 'exceeded' ? 3 : w.status === 'approaching' ? 2 : 1);
      return priority(b) - priority(a);
    });

    const cutiMap = new Map<string, { nama: string; jabatan: string; count: number; latestKet: string }>();
    for (const log of filteredLogs) {
      if (log.status === 'Cuti') {
        const key = (log.nama || '').trim().toLowerCase();
        const prev = cutiMap.get(key);
        if (prev) {
          prev.count++;
          if (log.keterangan) prev.latestKet = log.keterangan;
        } else {
          cutiMap.set(key, {
            nama: log.nama.trim(),
            jabatan: log.jabatan || '-',
            count: 1,
            latestKet: log.keterangan || 'Cuti Resmi'
          });
        }
      }
    }

    return {
      startDate,
      endDate,
      warnings,
      cutiSummary: Array.from(cutiMap.values()).sort((a, b) => b.count - a.count),
      exceededCount: warnings.filter((w) => w.status === 'exceeded').length,
      approachingCount: warnings.filter((w) => w.status === 'approaching').length
    };
  }, [filteredLogs, masterList, settings, startDate, endDate]);

  // Bar Chart Data: Daily breakdown by status
  const barChartData = useMemo(() => {
    const dateMap = new Map<string, Record<StatusPresensi, number>>();

    for (const log of filteredLogs) {
      if (!dateMap.has(log.tanggal)) {
        dateMap.set(log.tanggal, {
          'Tepat Waktu': 0,
          'Terlambat': 0,
          'Izin': 0,
          'Sakit': 0,
          'Cuti': 0,
          'Alpa': 0,
          'Alpa (Jadwal Mengajar)': 0,
          'Alpa (Wajib Hadir Staf)': 0,
          'Alpa (Wajib Hadir Guru BK)': 0,
          'Dinas Luar': 0
        });
      }
      const record = dateMap.get(log.tanggal)!;
      if (record[log.status] !== undefined) {
        record[log.status]++;
      }
    }

    const sortedDates = Array.from(dateMap.keys()).sort();
    return sortedDates.map((dateStr) => {
      const parts = dateStr.split('-');
      const formattedLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
      const counts = dateMap.get(dateStr)!;
      return {
        date: dateStr,
        displayDate: formattedLabel,
        hari: getHariFromDate(dateStr),
        ...counts
      };
    });
  }, [filteredLogs]);

  // Donut / Pie Chart Data
  const pieChartData = useMemo(() => {
    const rawData = [
      { name: 'Tepat Waktu', value: stats.tepatWaktu, color: STATUS_COLORS['Tepat Waktu'] },
      { name: 'Terlambat', value: stats.terlambat, color: STATUS_COLORS['Terlambat'] },
      { name: 'Izin', value: stats.izin, color: STATUS_COLORS['Izin'] },
      { name: 'Sakit', value: stats.sakit, color: STATUS_COLORS['Sakit'] },
      { name: 'Cuti', value: stats.cuti, color: STATUS_COLORS['Cuti'] },
      { name: 'Alpa', value: stats.alpa, color: STATUS_COLORS['Alpa'] },
      { name: 'Dinas Luar', value: stats.dinasLuar, color: STATUS_COLORS['Dinas Luar'] }
    ];
    return rawData.filter((item) => item.value > 0);
  }, [stats]);

  // Line Chart Data: Average Arrival Time per Day
  const lineChartData = useMemo(() => {
    const dateMap = new Map<string, { totalMinutes: number; count: number }>();

    for (const log of filteredLogs) {
      if (log.jamDatang && log.jamDatang !== '-') {
        const mins = timeToMinutes(log.jamDatang);
        if (mins !== null) {
          if (!dateMap.has(log.tanggal)) {
            dateMap.set(log.tanggal, { totalMinutes: 0, count: 0 });
          }
          const item = dateMap.get(log.tanggal)!;
          item.totalMinutes += mins;
          item.count++;
        }
      }
    }

    const sortedDates = Array.from(dateMap.keys()).sort();
    return sortedDates.map((dateStr) => {
      const item = dateMap.get(dateStr)!;
      const avgMins = Math.round(item.totalMinutes / item.count);
      const parts = dateStr.split('-');
      const formattedLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
      return {
        date: dateStr,
        displayDate: formattedLabel,
        avgMinutes: avgMins,
        avgTimeStr: minutesToTime(avgMins)
      };
    });
  }, [filteredLogs]);

  // Leaderboard / Rekap per Orang
  const leaderboardData = useMemo(() => {
    const map = new Map<
      string,
      {
        nama: string;
        jabatan: string;
        tepatWaktu: number;
        terlambat: number;
        izin: number;
        sakit: number;
        cuti: number;
        alpa: number;
        dinasLuar: number;
        totalHadir: number;
      }
    >();

    for (const m of masterList) {
      const key = (m.nama || '').trim().toLowerCase();
      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan,
        tepatWaktu: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        cuti: 0,
        alpa: 0,
        dinasLuar: 0,
        totalHadir: 0
      });
    }

    for (const log of filteredLogs) {
      const key = (log.nama || '').trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: log.nama.trim(),
          jabatan: log.jabatan || '-',
          tepatWaktu: 0,
          terlambat: 0,
          izin: 0,
          sakit: 0,
          cuti: 0,
          alpa: 0,
          dinasLuar: 0,
          totalHadir: 0
        });
      }
      const entry = map.get(key)!;
      entry.totalHadir++;
      if (log.status === 'Tepat Waktu') entry.tepatWaktu++;
      else if (log.status === 'Terlambat') entry.terlambat++;
      else if (log.status === 'Izin') entry.izin++;
      else if (log.status === 'Sakit') entry.sakit++;
      else if (log.status === 'Cuti') entry.cuti++;
      else if (log.status === 'Alpa' || log.status.includes('Alpa')) entry.alpa++;
      else if (log.status === 'Dinas Luar') entry.dinasLuar++;
    }

    const list = Array.from(map.values());

    list.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (typeof valA === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
    });

    return list;
  }, [filteredLogs, masterList, sortField, sortOrder]);

  // 4. FITUR ANALISIS JABATAN GANDA (Bendahara / Staf + Guru Mapel)
  const jabatanGandaAnalysis = useMemo(() => {
    const structuralKeywords = [
      'bendahara', 'ops', 'kesiswaan', 'kurikulum', 'kepala sekolah',
      'kepala', 'tu', 'tata usaha', 'subag', 'sarpras', 'humas', 'bk'
    ];

    const map = new Map<string, {
      nama: string;
      jabatan: string;
      isStruktural: boolean;
      tepatWaktu: number;
      terlambat: number;
      izin: number;
      sakit: number;
      cuti: number;
      alpa: number;
      dinasLuar: number;
    }>();

    for (const m of masterList) {
      const key = (m.nama || '').trim().toLowerCase();
      const jabLower = (m.jabatan || '').toLowerCase();
      const isStruktural = structuralKeywords.some((kw) => jabLower.includes(kw));

      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan || 'Guru',
        isStruktural,
        tepatWaktu: 0,
        terlambat: 0,
        izin: 0,
        sakit: 0,
        cuti: 0,
        alpa: 0,
        dinasLuar: 0
      });
    }

    for (const log of filteredLogs) {
      const key = (log.nama || '').trim().toLowerCase();
      if (!map.has(key)) {
        const jabLower = (log.jabatan || '').toLowerCase();
        const isStruktural = structuralKeywords.some((kw) => jabLower.includes(kw));
        map.set(key, {
          nama: log.nama.trim(),
          jabatan: log.jabatan || 'Guru',
          isStruktural,
          tepatWaktu: 0,
          terlambat: 0,
          izin: 0,
          sakit: 0,
          cuti: 0,
          alpa: 0,
          dinasLuar: 0
        });
      }
      const item = map.get(key)!;
      const statusTrim = (log.status || 'Tepat Waktu').trim();
      if (statusTrim === 'Tepat Waktu') item.tepatWaktu++;
      else if (statusTrim === 'Terlambat') item.terlambat++;
      else if (statusTrim === 'Izin') item.izin++;
      else if (statusTrim === 'Sakit') item.sakit++;
      else if (statusTrim === 'Cuti') item.cuti++;
      else if (statusTrim.includes('Alpa')) item.alpa++;
      else if (statusTrim === 'Dinas Luar') item.dinasLuar++;
    }

    const list = Array.from(map.values()).map((item) => {
      const totalHadir = item.tepatWaktu + item.terlambat + item.izin + item.sakit + item.cuti + item.alpa + item.dinasLuar;
      let statusKepatuhan = '';
      let advice = '';

      if (item.isStruktural) {
        statusKepatuhan = 'Jabatan Struktural / Staf (Wajib Presensi Harian)';
        advice = 'Memiliki kewajiban hadir harian sekolah (Bendahara/Staf). Jika berhalangan, tercatat sebagai Izin, Cuti Resmi, atau Dinas Luar.';
      } else {
        statusKepatuhan = 'Guru Murni (Presensi Sesuai Jadwal Mengajar)';
        advice = 'Presensi dihitung berdasarkan jam mengajar.';
      }

      return {
        ...item,
        totalHadir,
        statusKepatuhan,
        advice
      };
    });

    return list;
  }, [masterList, filteredLogs]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 ${isPresenting ? 'fixed inset-0 z-50 bg-slate-900 overflow-y-auto p-6 text-white' : ''}`}>
      {/* Top Header Controls Bar */}
      <div className={`rounded-2xl shadow-sm border p-4 sm:p-5 transition-colors ${
        isPresenting ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Badge */}
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#2F5597]" />
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">
                Dashboard &amp; Analisis Kebijakan Presensi
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Visualisasi keandalan, leaderboard teladan, pembinaan kedisiplinan, dan pengingat kuota kehadiran.
            </p>
          </div>

          {/* Action Buttons & Period Presets */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Filter Buttons */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-600">
              <button
                onClick={() => setPeriodPreset('today')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodPreset === 'today'
                    ? 'bg-[#2F5597] text-white shadow'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Hari Ini
              </button>
              <button
                onClick={() => setPeriodPreset('week')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodPreset === 'week'
                    ? 'bg-[#2F5597] text-white shadow'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Minggu Ini
              </button>
              <button
                onClick={() => setPeriodPreset('month')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodPreset === 'month'
                    ? 'bg-[#2F5597] text-white shadow'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Bulan Ini
              </button>
              <button
                onClick={() => setPeriodPreset('custom')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  periodPreset === 'custom'
                    ? 'bg-[#2F5597] text-white shadow'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom Date Picker */}
            {periodPreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md font-medium text-slate-800 dark:text-white"
                />
                <span className="text-slate-400">&ndash;</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md font-medium text-slate-800 dark:text-white"
                />
              </div>
            )}

            {/* Presentation Mode Button */}
            <button
              onClick={() => setIsPresenting(!isPresenting)}
              className="px-3.5 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
              title="Mode Rapat Full-Screen"
            >
              {isPresenting ? (
                <>
                  <Minimize2 className="w-4 h-4 text-yellow-400" />
                  <span>Tutup Mode Rapat</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-yellow-400" />
                  <span>Mode Presentasi</span>
                </>
              )}
            </button>

            {/* Print / Download Report */}
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Printer className="w-4 h-4 text-yellow-300" />
              <span>Cetak / Unduh Laporan</span>
            </button>
          </div>
        </div>

        {/* Date Active Range Display */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#2F5597]" />
            <span>
              Periode Aktif: <strong>{formatLongDateIndonesian(startDate)}</strong> &mdash; <strong>{formatLongDateIndonesian(endDate)}</strong>
            </span>
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Total Record Terfilter: {filteredLogs.length} data
          </span>
        </div>
      </div>

      {/* FITUR 2 — PANEL PENGINGAT KUOTA KEHADIRAN */}
      <div className={`rounded-2xl shadow-sm border p-5 transition-all ${
        quotaReminderData.warnings.length > 0
          ? 'bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border-amber-300 dark:bg-slate-800 dark:border-amber-700'
          : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/60 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>Pengingat Kuota Kehadiran (Izin, Sakit, Alpa, Dinas)</span>
                {quotaReminderData.warnings.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-extrabold bg-rose-600 text-white rounded-full">
                    {quotaReminderData.warnings.length} Catatan
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Diakumulasi mengikuti Periode Terfilter: <strong>{formatLongDateIndonesian(startDate)}</strong> s/d <strong>{formatLongDateIndonesian(endDate)}</strong>.
              </p>
            </div>
          </div>

          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shrink-0">
            Batas Kuota: Izin ({settings?.quotaIzin ?? 3}x) | Sakit ({settings?.quotaSakit ?? 5}x) | Alpa ({settings?.quotaAlpa ?? 1}x) | Dinas ({settings?.quotaDinasLuar ?? 5}x)
          </div>
        </div>

        {quotaReminderData.warnings.length === 0 ? (
          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-xs">
            <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>
              <strong>Aman!</strong> Seluruh guru &amp; staf berada di bawah batas kuota ketidakhadiran untuk periode terfilter ini.
            </span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quotaReminderData.warnings.map((w, idx) => {
              const isExpanded = !!expandedQuotaKeys[w.nama];
              return (
                <div
                  key={`${w.nama}-${idx}`}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                    w.status === 'exceeded'
                      ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                      : w.status === 'approaching'
                      ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                      : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div>
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 font-bold ${
                        w.status === 'exceeded' ? 'bg-rose-500 text-white' : w.status === 'approaching' ? 'bg-amber-500 text-white' : 'bg-slate-500 text-white'
                      }`}>
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <strong className="text-xs font-bold truncate">{w.nama}</strong>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                            w.status === 'exceeded' ? 'bg-rose-600 text-white' : w.status === 'approaching' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
                          }`}>
                            {w.status === 'exceeded' ? 'Melebihi' : w.status === 'approaching' ? 'Mendekati' : 'Tercatat'}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-80 truncate">{w.jabatan}</p>
                        <p className="text-xs font-black mt-1 leading-snug">{w.message}</p>
                      </div>
                    </div>

                    {/* Category Breakdown Chips */}
                    <div className="mt-2.5 flex flex-wrap gap-1 text-[10px] font-bold">
                      {w.counts.Izin > 0 && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">Izin: {w.counts.Izin}x</span>}
                      {w.counts.Sakit > 0 && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded">Sakit: {w.counts.Sakit}x</span>}
                      {w.counts.Alpa > 0 && <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded">Alpa: {w.counts.Alpa}x</span>}
                      {w.counts['Dinas Luar'] > 0 && <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded">Dinas: {w.counts['Dinas Luar']}x</span>}
                    </div>
                  </div>

                  {/* Expandable Detail Log & Keterangan */}
                  {w.logDetails.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
                      <button
                        onClick={() => setExpandedQuotaKeys(prev => ({ ...prev, [w.nama]: !prev[w.nama] }))}
                        className="text-[11px] font-bold text-[#2F5597] dark:text-blue-300 hover:underline flex items-center justify-between w-full"
                      >
                        <span>{isExpanded ? 'Sembunyikan Rincian Log' : `Lihat Detail ${w.logDetails.length} Log & Keterangan`}</span>
                        <span>{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto text-[11px] bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                          {w.logDetails.map((det, dIdx) => (
                            <div key={dIdx} className="pb-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                                <span>📅 {formatLongDateIndonesian(det.tanggal)}</span>
                                <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                                  det.status === 'Alpa' ? 'bg-rose-100 text-rose-800 font-extrabold' :
                                  det.status === 'Izin' || det.status === 'Sakit' ? 'bg-blue-100 text-blue-800' :
                                  'bg-purple-100 text-purple-800'
                                }`}>{det.status}</span>
                              </div>
                              <p className="text-[10px] text-slate-600 dark:text-slate-400 italic mt-0.5">
                                Keterangan: "{det.keterangan || '-'}"
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Non-punitive Cuti Resmi info strip */}
        {quotaReminderData.cutiSummary.length > 0 && (
          <div className="mt-4 pt-3 border-t border-amber-200/70 dark:border-slate-700">
            <div className="text-xs font-extrabold text-teal-900 dark:text-teal-300 uppercase tracking-wider mb-2">
              Tercatat Cuti Resmi pada Periode Ini ({quotaReminderData.cutiSummary.length} Orang &mdash; tidak dihitung sebagai pelanggaran kuota)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {quotaReminderData.cutiSummary.map((c, cIdx) => (
                <div
                  key={`quota-cuti-${c.nama}-${cIdx}`}
                  className="p-2.5 bg-teal-50/90 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-slate-900 dark:text-white truncate">{c.nama}</strong>
                    <span className="px-2 py-0.5 bg-teal-600 text-white rounded text-[10px] font-extrabold shrink-0">
                      {c.count} hari
                    </span>
                  </div>
                  <p className="text-[10.5px] text-teal-800 dark:text-teal-300 mt-0.5 line-clamp-2">{c.latestKet}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FITUR 1 — GRID TWO PANELS: GURU TELADAN & PERLU PEMBINAAN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL A: GURU & STAF TELADAN (REWARD) */}
        <div className={`rounded-2xl shadow-sm border p-6 flex flex-col justify-between ${
          isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 rounded-xl">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                    <span>Guru &amp; Staf Teladan</span>
                    <span className="text-xs font-extrabold px-2 py-0.5 bg-amber-500 text-white rounded-full">
                      Kandidat Reward
                    </span>
                  </h3>
                  <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
                    Peringkat keteladanan berdasarkan kedisiplinan &amp; jam hadir.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowScoreInfoModal(true)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                  title="Lihat Formula Perhitungan Skor"
                >
                  <Info className="w-4 h-4 text-[#2F5597]" />
                  <span className="hidden sm:inline">Info Skor</span>
                </button>

                <select
                  value={topTeladanCount}
                  onChange={(e) => setTopTeladanCount(Number(e.target.value))}
                  className="px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                >
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                </select>
              </div>
            </div>

            {teladanData.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                Belum ada data kandidat teladan pada periode terpilih (atau seluruh staf memiliki catatan Alpa).
              </div>
            ) : (
              <div className="space-y-3">
                {teladanData.slice(0, topTeladanCount).map((c, idx) => {
                  let badge = `${idx + 1}`;
                  let badgeBg = 'bg-slate-100 text-slate-700';
                  if (idx === 0) { badge = '🥇'; badgeBg = 'bg-amber-100 border border-amber-300 text-amber-800'; }
                  else if (idx === 1) { badge = '🥈'; badgeBg = 'bg-slate-200 border border-slate-300 text-slate-800'; }
                  else if (idx === 2) { badge = '🥉'; badgeBg = 'bg-orange-100 border border-orange-300 text-orange-800'; }

                  return (
                    <div
                      key={`teladan-${c.nama}-${idx}`}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-750 flex items-center justify-between gap-3 hover:bg-white transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${badgeBg}`}>
                          {badge}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {c.nama}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {c.jabatan}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              Tepat Waktu: <strong>{c.pctTepatWaktu}%</strong> ({c.tepatWaktu}/{c.totalWorkingDays} hari)
                            </span>
                            <span>&bull;</span>
                            <span className="text-blue-700 dark:text-blue-400">
                              Rata-rata: <strong>{c.avgArrivalStr} WIB</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Skor Gabungan
                        </span>
                        <span className="text-lg font-black text-[#2F5597] dark:text-blue-300">
                          {c.score} <span className="text-xs font-normal text-slate-400">/100</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PANEL B: PERLU PEMBINAAN / PERHATIAN (TEGURAN) */}
        <div className={`rounded-2xl shadow-sm border p-6 flex flex-col justify-between ${
          isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 rounded-xl">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                    <span>Perlu Pembinaan &amp; Evaluasi</span>
                    {pembinaanData.length > 0 && (
                      <span className="text-xs font-extrabold px-2 py-0.5 bg-rose-600 text-white rounded-full">
                        {pembinaanData.length} Orang
                      </span>
                    )}
                  </h3>
                  <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
                    Kandidat teguran kedisiplinan (Terlambat &ge; {alertThreshold}x atau ada Alpa).
                  </p>
                </div>
              </div>

              {/* Alert threshold modifier */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Batas Telat:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(parseInt(e.target.value) || 1)}
                  className="w-11 px-1.5 py-0.5 bg-slate-50 border border-slate-300 rounded text-center font-bold text-slate-800"
                />
                <span>x</span>
              </div>
            </div>

            {pembinaanData.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 dark:text-emerald-400 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                Tidak ada guru/staf yang memerlukan pembinaan khusus pada periode ini. Kedisiplinan sangat baik!
              </div>
            ) : (
              <div className="space-y-3">
                {pembinaanData.map((p, idx) => {
                  const isExpanded = !!expandedPembinaanKeys[p.nama];
                  return (
                    <div
                      key={`pembinaan-${p.nama}-${idx}`}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                        p.badgeColor === 'red'
                          ? 'bg-rose-50/80 border-rose-300 dark:bg-rose-950/30 dark:border-rose-800'
                          : 'bg-amber-50/80 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            p.badgeColor === 'red' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {p.nama}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {p.jabatan}
                            </p>
                            <p className={`text-xs font-extrabold mt-0.5 ${
                              p.badgeColor === 'red' ? 'text-rose-800 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'
                            }`}>
                              {p.detailsText}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md ${
                            p.badgeColor === 'red'
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-500 text-slate-900'
                          }`}>
                            {p.badgeColor === 'red' ? 'Perhatian Tinggi' : 'Peringatan'}
                          </span>
                        </div>
                      </div>

                      {/* Expandable Log Details */}
                      {p.logDetails.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
                          <button
                            onClick={() => setExpandedPembinaanKeys(prev => ({ ...prev, [p.nama]: !prev[p.nama] }))}
                            className="text-[11px] font-bold text-[#2F5597] dark:text-blue-300 hover:underline flex items-center justify-between w-full"
                          >
                            <span>{isExpanded ? 'Sembunyikan Rincian Log' : `Lihat Rincian ${p.logDetails.length} Catatan Terlambat/Alpa`}</span>
                            <span>{isExpanded ? '▲' : '▼'}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto text-[11px] bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
                              {p.logDetails.map((det, dIdx) => (
                                <div key={dIdx} className="pb-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                  <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                                    <span>📅 {formatLongDateIndonesian(det.tanggal)}</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                                      det.status === 'Alpa' ? 'bg-rose-100 text-rose-800 font-extrabold' : 'bg-amber-100 text-amber-800 font-bold'
                                    }`}>
                                      {det.status} {det.jamDatang !== '-' ? `(${det.jamDatang})` : ''}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-600 dark:text-slate-400 italic mt-0.5">
                                    Keterangan: "{det.keterangan || '-'}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overall Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Presence */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:bg-slate-800 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Records</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white">{stats.total}</span>
            <span className="text-xs font-medium text-slate-500">Entri</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1">Sesuai Filter Periode</span>
        </div>

        {/* Tepat Waktu */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Tepat Waktu</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-emerald-900 dark:text-emerald-200">{stats.tepatWaktu}</span>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{stats.tepatWaktuPct}%</span>
          </div>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">&le; Batas Peran &amp; Jadwal</span>
        </div>

        {/* Terlambat */}
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Terlambat</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-amber-900 dark:text-amber-200">{stats.terlambat}</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{stats.terlambatPct}%</span>
          </div>
          <span className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">&gt; Batas Peran &amp; Jadwal</span>
        </div>

        {/* Izin */}
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">Izin</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-blue-900 dark:text-blue-200">{stats.izin}</span>
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Hari</span>
          </div>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 mt-1">Izin Resmi</span>
        </div>

        {/* Sakit */}
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">Sakit</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-indigo-900 dark:text-indigo-200">{stats.sakit}</span>
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">Hari</span>
          </div>
          <span className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-1">Keterangan Dokter</span>
        </div>

        {/* Cuti */}
        <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/70 dark:bg-teal-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">Cuti</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-teal-900 dark:text-teal-200">{stats.cuti}</span>
            <span className="text-xs font-medium text-teal-700 dark:text-teal-400">Hari</span>
          </div>
          <span className="text-[11px] text-teal-700 dark:text-teal-400 mt-1">Melahirkan/Umroh/dll</span>
        </div>

        {/* Alpa */}
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">Alpa</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-rose-900 dark:text-rose-200">{stats.alpa}</span>
            <span className="text-xs font-medium text-rose-700 dark:text-rose-400">Hari</span>
          </div>
          <span className="text-[11px] text-rose-700 dark:text-rose-400 mt-1">Tanpa Keterangan</span>
        </div>
      </div>

      {/* Charts Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Daily Bar Chart */}
        <div className={`lg:col-span-2 rounded-2xl shadow-sm border p-6 flex flex-col ${
          isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#2F5597]" />
                <span>Grafik Kehadiran Harian Per Status</span>
              </h3>
              <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
                Jumlah kehadiran per tanggal dipecah berdasarkan komposisi status
              </p>
            </div>
          </div>

          <div className="h-72 w-full mt-2">
            {barChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium">
                Belum ada data presensi pada rentang tanggal terpilih.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: isPresenting ? '#1e293b' : '#ffffff',
                      borderColor: '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: isPresenting ? '#ffffff' : '#0f172a'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="Tepat Waktu" stackId="a" fill={STATUS_COLORS['Tepat Waktu']} />
                  <Bar dataKey="Terlambat" stackId="a" fill={STATUS_COLORS['Terlambat']} />
                  <Bar dataKey="Izin" stackId="a" fill={STATUS_COLORS['Izin']} />
                  <Bar dataKey="Sakit" stackId="a" fill={STATUS_COLORS['Sakit']} />
                  <Bar dataKey="Cuti" stackId="a" fill={STATUS_COLORS['Cuti']} />
                  <Bar dataKey="Alpa" stackId="a" fill={STATUS_COLORS['Alpa']} />
                  <Bar dataKey="Dinas Luar" stackId="a" fill={STATUS_COLORS['Dinas Luar']} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Donut Chart */}
        <div className={`rounded-2xl shadow-sm border p-6 flex flex-col ${
          isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <PieIcon className="w-5 h-5 text-[#2F5597]" />
                <span>Proporsi Status Kehadiran</span>
              </h3>
              <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
                Persentase keseluruhan per kategori
              </p>
            </div>
          </div>

          <div className="h-72 w-full flex items-center justify-center">
            {pieChartData.length === 0 ? (
              <div className="text-slate-400 text-xs font-medium">Tidak ada data untuk grafik.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Chart 3: Average Arrival Time Trend */}
      <div className={`rounded-2xl shadow-sm border p-6 ${
        isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#2F5597]" />
              <span>Tren Rata-Rata Jam Datang Guru &amp; Staf</span>
            </h3>
            <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
              Melihat apakah secara umum guru/staf makin pagi atau makin siang dari hari ke hari
            </p>
          </div>
        </div>

        <div className="h-64 w-full">
          {lineChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs font-medium">
              Belum ada data jam datang untuk tren.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={['dataMin - 15', 'dataMax + 15']}
                  tickFormatter={(val) => minutesToTime(val)}
                />
                <RechartsTooltip
                  formatter={(val: any) => [minutesToTime(Number(val)) + ' WIB', 'Rata-Rata Jam Datang']}
                  labelFormatter={(lbl) => `Tanggal: ${lbl}`}
                />
                <Line
                  type="monotone"
                  dataKey="avgMinutes"
                  name="Jam Datang Rata-Rata"
                  stroke="#2F5597"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#F59E0B' }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Leaderboard & Rekap Tabel Per Orang */}
      <div className={`rounded-2xl shadow-sm border p-6 ${
        isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700 mb-4">
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Tabel Rekapitulasi Presensi Lengkap per Guru / Staf</span>
            </h3>
            <p className={`text-xs ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
              Rincian seluruh individu pada periode terpilih. Klik judul kolom untuk sorting.
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`uppercase tracking-wider font-bold border-b ${
                isPresenting ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th
                  onClick={() => handleSort('nama')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <div className="flex items-center gap-1">
                    <span>Nama Guru / Staf</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('jabatan')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <div className="flex items-center gap-1">
                    <span>Jabatan</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tepatWaktu')}
                  className="py-3 px-3 text-center cursor-pointer text-emerald-700 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Tepat Waktu</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('terlambat')}
                  className="py-3 px-3 text-center cursor-pointer text-amber-700 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Terlambat</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('izin')}
                  className="py-3 px-3 text-center cursor-pointer text-blue-700 dark:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Izin</span>
                </th>
                <th
                  onClick={() => handleSort('sakit')}
                  className="py-3 px-3 text-center cursor-pointer text-indigo-700 dark:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Sakit</span>
                </th>
                <th
                  onClick={() => handleSort('cuti')}
                  className="py-3 px-3 text-center cursor-pointer text-teal-700 dark:text-teal-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Cuti</span>
                </th>
                <th
                  onClick={() => handleSort('alpa')}
                  className="py-3 px-3 text-center cursor-pointer text-rose-700 dark:text-rose-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Alpa</span>
                </th>
                <th
                  onClick={() => handleSort('dinasLuar')}
                  className="py-3 px-3 text-center cursor-pointer text-purple-700 dark:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Dinas Luar</span>
                </th>
                <th
                  onClick={() => handleSort('totalHadir')}
                  className="py-3 px-3 text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  <span>Total Entri</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {leaderboardData.map((row, idx) => {
                const isWarning = row.terlambat >= alertThreshold || row.alpa > 0;

                return (
                  <tr
                    key={`leaderboard-${row.nama}-${idx}`}
                    className={`transition-colors ${
                      isWarning
                        ? 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/70 font-medium'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-750'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-white">
                      <div className="flex items-center gap-2">
                        <span>{row.nama}</span>
                        {isWarning && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-500 text-white rounded">
                            Perhatian ({row.terlambat}x Telat{row.alpa > 0 ? `, ${row.alpa}x Alpa` : ''})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{row.jabatan}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-700 dark:text-emerald-400">
                      {row.tepatWaktu}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-amber-700 dark:text-amber-400">
                      {row.terlambat}
                    </td>
                    <td className="py-2.5 px-3 text-center text-blue-700 dark:text-blue-400 font-semibold">
                      {row.izin}
                    </td>
                    <td className="py-2.5 px-3 text-center text-indigo-700 dark:text-indigo-400 font-semibold">
                      {row.sakit}
                    </td>
                    <td className="py-2.5 px-3 text-center text-teal-700 dark:text-teal-400 font-semibold">
                      {row.cuti}
                    </td>
                    <td className="py-2.5 px-3 text-center text-rose-700 dark:text-rose-400 font-semibold">
                      {row.alpa}
                    </td>
                    <td className="py-2.5 px-3 text-center text-purple-700 dark:text-purple-400 font-semibold">
                      {row.dinasLuar}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                      {row.totalHadir}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KONSULTASI & ANALISIS KEBIJAKAN JABATAN GANDA (BENDAHARA / STAF + GURU MAPEL) */}
      <div className={`rounded-2xl shadow-sm border p-6 space-y-4 ${
        isPresenting ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span>Analisis Kebijakan Jabatan Ganda (Staf vs Guru Murni)</span>
                <span className="text-xs font-extrabold px-2 py-0.5 bg-indigo-600 text-white rounded-full">
                  Konsultasi &amp; Presisi Kebijakan
                </span>
              </h3>
            </div>
            <p className={`text-xs mt-1 ${isPresenting ? 'text-slate-400' : 'text-slate-500'}`}>
              Panduan transparansi dan keadilan perhitungan untuk guru yang merangkap Jabatan Struktural (Bendahara, OPS, Kesiswaan, Kurikulum, dll.).
            </p>
          </div>
        </div>

        {/* GUIDANCE BOX / REKOMENDASI KEBIJAKAN SEKOLAH */}
        <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Rekomendasi Kebijakan Sekolah (Prinsip Keadilan Presensi):
          </h4>
          <ul className="text-xs text-indigo-950 dark:text-indigo-100 space-y-2 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">&bull;</span>
              <span>
                <strong>Jabatan Struktural / Staf (Bendahara, OPS, Kesiswaan, TU, DLL):</strong> Berperan sebagai pegawai operasional harian sekolah. Memiliki kewajiban hadir <u>setiap hari kerja sekolah</u>. Walaupun pada hari tertentu <em>tidak ada jadwal mengajar</em>, tugas administrasi/kebendaharaan tetap berjalan.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">&bull;</span>
              <span>
                <strong>Bila Berhalangan Hadir di Hari Tanpa Mengajar:</strong> Pegawai yang menjabat Bendahara/Staf WAJIB mencatatkan status <strong>"Izin"</strong> atau <strong>"Dinas Luar"</strong> (bukan menganggapnya sebagai "Libur tanpa presensi"). Hal ini menjaga transparansi dan akuntabilitas keuangan/layanan sekolah.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">&bull;</span>
              <span>
                <strong>Guru Murni (Tanpa Jabatan Struktural):</strong> Kewajiban hadir dihitung presisi berdasarkan <strong>Jadwal Mengajar Harian</strong> (`mapelHariIni !== '-'`).
              </span>
            </li>
          </ul>
        </div>

        {/* SUMMARY TABLE FOR JABATAN GANDA */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">No</th>
                <th className="py-2.5 px-3">Nama Guru / Staf</th>
                <th className="py-2.5 px-3">Jabatan</th>
                <th className="py-2.5 px-3">Kategori Mandat</th>
                <th className="py-2.5 px-3 text-center">Tepat Waktu</th>
                <th className="py-2.5 px-3 text-center">Terlambat</th>
                <th className="py-2.5 px-3 text-center">Izin / Sakit</th>
                <th className="py-2.5 px-3 text-center">Cuti</th>
                <th className="py-2.5 px-3 text-center">Alpa</th>
                <th className="py-2.5 px-3">Ketentuan Kebijakan Presensi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-750">
              {jabatanGandaAnalysis.map((row, idx) => (
                <tr key={`jg-${row.nama}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors">
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-white">{row.nama}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{row.jabatan}</td>
                  <td className="py-2.5 px-3">
                    {row.isStruktural ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-200">
                        Struktur &amp; Staf (Dobel Jabatan)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-700 dark:text-slate-300">
                        Guru Murni
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-700 dark:text-emerald-400">{row.tepatWaktu}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-amber-700 dark:text-amber-400">{row.terlambat}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-blue-700 dark:text-blue-400">{row.izin + row.sakit}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-teal-700 dark:text-teal-400">{row.cuti}</td>
                  <td className="py-2.5 px-3 text-center font-semibold text-rose-700 dark:text-rose-400">{row.alpa}</td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-300 max-w-xs">{row.advice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL INFO CARA PERHITUNGAN SKOR TELADAN */}
      {showScoreInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 text-[#2F5597] dark:text-blue-300">
                <Award className="w-6 h-6 text-amber-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Formula Perhitungan Skor Teladan
                </h3>
              </div>
              <button
                onClick={() => setShowScoreInfoModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                Peringkat <strong>Guru &amp; Staf Teladan</strong> dihitung secara objektif menggunakan gabungan 2 komponen utama untuk memberikan apresiasi bagi keandalan kehadiran:
              </p>

              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-2 border border-slate-200 dark:border-slate-600 font-medium">
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 bg-emerald-500 text-white font-bold text-[10px] rounded shrink-0 mt-0.5">
                    Bobot 70%
                  </span>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Persentase Tepat Waktu:</strong>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Rasio jumlah kehadiran tepat waktu sesuai batas jam perannya (Batas Staf {settings?.jamMasukThreshold || '07:25'} WIB / Jam Sesi Mengajar Pertama) dibanding total hari kerja aktif pada periode tersebut.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                  <span className="px-1.5 py-0.5 bg-blue-500 text-white font-bold text-[10px] rounded shrink-0 mt-0.5">
                    Bobot 30%
                  </span>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Rata-Rata Jam Datang:</strong>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Guru/staf yang rata-rata datang lebih pagi (misal 06:30 WIB) mendapatkan nilai tambahan lebih tinggi daripada yang datang mepet jam masuk.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-900 dark:text-rose-100 font-medium">
                <strong className="text-rose-700 dark:text-rose-300 block mb-1">
                  &bull; Syarat Mutlak Diskualifikasi:
                </strong>
                Siapa pun yang memiliki <strong>minimal 1 (satu) kali catatan Alpa</strong> dalam periode tersebut otomatis gugur / tidak masuk dalam kandidat Guru Teladan, berapapun skor jam datangnya.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowScoreInfoModal(false)}
                className="px-4 py-2 bg-[#2F5597] text-white text-xs font-bold rounded-xl hover:bg-[#234278]"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Formal Layout for Principal (Hidden during normal view, visible when printing) */}
      <div className="hidden print:block p-8 bg-white text-black font-sans">
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-center justify-center gap-4">
            <img
              src="./assets/aistudio/LOGO_SMP_ca9ab34f.png"
              alt="Logo SMP Nurul Abror Al-Robbaniyin"
              className="w-14 h-14 object-contain shrink-0"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold uppercase tracking-wide">SMP NURUL ABROR AL-ROBBANIYIN</h1>
              <h2 className="text-lg font-semibold mt-1">LAPORAN REKAPITULASI PRESENSI &amp; EVALUASI KEHADIRAN GURU &amp; STAF</h2>
              <p className="text-sm mt-1">
                Periode Laporan: <strong>{formatLongDateIndonesian(startDate)}</strong> &mdash; <strong>{formatLongDateIndonesian(endDate)}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-5 gap-3 mb-6 text-center text-xs">
          <div className="p-3 border rounded">
            <div className="font-bold">Total Kehadiran</div>
            <div className="text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border rounded">
            <div className="font-bold">Tepat Waktu</div>
            <div className="text-xl font-bold text-emerald-700">{stats.tepatWaktu} ({stats.tepatWaktuPct}%)</div>
          </div>
          <div className="p-3 border rounded">
            <div className="font-bold">Terlambat</div>
            <div className="text-xl font-bold text-amber-700">{stats.terlambat} ({stats.terlambatPct}%)</div>
          </div>
          <div className="p-3 border rounded">
            <div className="font-bold">Cuti Resmi</div>
            <div className="text-xl font-bold text-teal-700">{stats.cuti}</div>
          </div>
          <div className="p-3 border rounded">
            <div className="font-bold">Izin / Sakit / Alpa</div>
            <div className="text-xl font-bold text-rose-700">{stats.izin + stats.sakit + stats.alpa}</div>
          </div>
        </div>

        {/* Guru Teladan Section in Print */}
        {teladanData.length > 0 && (
          <div className="mb-6 border p-4 rounded">
            <h3 className="font-bold text-sm uppercase mb-2 text-emerald-800">
              KANDIDAT GURU &amp; STAF TELADAN (GURU REWARD)
            </h3>
            <table className="w-full text-left text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 font-bold border-b">
                  <th className="p-1.5 border">No</th>
                  <th className="p-1.5 border">Nama Staf</th>
                  <th className="p-1.5 border">Jabatan</th>
                  <th className="p-1.5 border text-center">% Tepat Waktu</th>
                  <th className="p-1.5 border text-center">Rata-Rata Jam Datang</th>
                  <th className="p-1.5 border text-center">Skor Akhir</th>
                </tr>
              </thead>
              <tbody>
                {teladanData.slice(0, 5).map((t, i) => (
                  <tr key={`print-teladan-${t.nama}-${i}`} className="border-b">
                    <td className="p-1.5 border text-center">{i + 1}</td>
                    <td className="p-1.5 border font-bold">{t.nama}</td>
                    <td className="p-1.5 border">{t.jabatan}</td>
                    <td className="p-1.5 border text-center font-bold text-emerald-800">{t.pctTepatWaktu}%</td>
                    <td className="p-1.5 border text-center">{t.avgArrivalStr} WIB</td>
                    <td className="p-1.5 border text-center font-black">{t.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pembinaan Section in Print */}
        {pembinaanData.length > 0 && (
          <div className="mb-6 border border-rose-300 p-4 rounded bg-rose-50/30">
            <h3 className="font-bold text-sm uppercase mb-2 text-rose-800">
              DAFTAR STAF MEMERLUKAN PEMBINAAN KEDISIPLINAN
            </h3>
            <table className="w-full text-left text-xs border border-rose-300">
              <thead>
                <tr className="bg-rose-100 font-bold border-b">
                  <th className="p-1.5 border">No</th>
                  <th className="p-1.5 border">Nama Staf</th>
                  <th className="p-1.5 border">Jabatan</th>
                  <th className="p-1.5 border">Catatan Pelanggaran</th>
                </tr>
              </thead>
              <tbody>
                {pembinaanData.map((p, i) => (
                  <tr key={`print-pembinaan-${p.nama}-${i}`} className="border-b">
                    <td className="p-1.5 border text-center">{i + 1}</td>
                    <td className="p-1.5 border font-bold">{p.nama}</td>
                    <td className="p-1.5 border">{p.jabatan}</td>
                    <td className="p-1.5 border font-bold text-rose-800">{p.detailsText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Complete */}
        <table className="w-full text-left text-xs border border-slate-400 border-collapse mb-8">
          <thead>
            <tr className="bg-slate-200 font-bold border-b border-slate-400">
              <th className="p-2 border border-slate-400">No</th>
              <th className="p-2 border border-slate-400">Nama Guru / Staf</th>
              <th className="p-2 border border-slate-400">Jabatan</th>
              <th className="p-2 border border-slate-400 text-center">Tepat Waktu</th>
              <th className="p-2 border border-slate-400 text-center">Terlambat</th>
              <th className="p-2 border border-slate-400 text-center">Izin</th>
              <th className="p-2 border border-slate-400 text-center">Sakit</th>
              <th className="p-2 border border-slate-400 text-center">Cuti</th>
              <th className="p-2 border border-slate-400 text-center">Alpa</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardData.map((r, i) => (
              <tr key={`print-leaderboard-${r.nama}-${i}`} className="border-b border-slate-300">
                <td className="p-2 border border-slate-300 text-center">{i + 1}</td>
                <td className="p-2 border border-slate-300 font-bold">{r.nama}</td>
                <td className="p-2 border border-slate-300">{r.jabatan}</td>
                <td className="p-2 border border-slate-300 text-center font-bold text-emerald-800">{r.tepatWaktu}</td>
                <td className="p-2 border border-slate-300 text-center font-bold text-amber-800">{r.terlambat}</td>
                <td className="p-2 border border-slate-300 text-center">{r.izin}</td>
                <td className="p-2 border border-slate-300 text-center">{r.sakit}</td>
                <td className="p-2 border border-slate-300 text-center text-teal-800 font-semibold">{r.cuti}</td>
                <td className="p-2 border border-slate-300 text-center font-bold text-rose-800">{r.alpa}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between text-xs mt-12 pt-8 border-t border-slate-300">
          <div className="text-center">
            <p>Mengetahui,</p>
            <p className="font-bold mt-12">Kepala SMP Nurul Abror Al-Robbaniyin</p>
          </div>
          <div className="text-center">
            <p>Banyuwangi, {formatLongDateIndonesian(formatDateISO())}</p>
            <p className="font-bold mt-12">Petugas Presensi Kehadiran</p>
          </div>
        </div>
      </div>
    </div>
  );
};

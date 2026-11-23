import React, { useState, useMemo } from 'react';
import { LogPresensi, StatusPresensi, MasterGuruStaf } from '../types';
import {
  formatDateISO,
  formatLongDateIndonesian,
  getThisWeekRangeISO,
  getThisMonthRangeISO,
  getLastMonthRangeISO
} from '../utils/dateUtils';
import {
  Search,
  Calendar,
  Filter,
  Download,
  ExternalLink,
  Trash2,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  FileSpreadsheet,
  Printer,
  Users,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  CalendarRange
} from 'lucide-react';

interface RekapRiwayatProps {
  logs: LogPresensi[];
  masterList?: MasterGuruStaf[];
  sheetUrl: string;
  onRefresh: () => void;
  onDeleteLog: (id: string) => Promise<void>;
  isRefreshing: boolean;
}

export type PeriodType = 'harian' | 'minggu_ini' | 'bulan_ini' | 'bulan_lalu' | 'custom' | 'semua';
export type RekapViewMode = 'gabungan' | 'staf' | 'guru';
export type RekapTab = 'transaksi' | 'pelanggaran';

export const RekapRiwayat: React.FC<RekapRiwayatProps> = ({
  logs,
  masterList,
  sheetUrl,
  onRefresh,
  onDeleteLog,
  isRefreshing
}) => {
  // Period filter states
  const [periodType, setPeriodType] = useState<PeriodType>('harian');
  const [startDate, setStartDate] = useState<string>(formatDateISO());
  const [endDate, setEndDate] = useState<string>(formatDateISO());

  // View mode & Tab states
  const [viewMode, setViewMode] = useState<RekapViewMode>('gabungan');
  const [rekapTab, setRekapTab] = useState<RekapTab>('transaksi');
  const [onlyViolations, setOnlyViolations] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('semua');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Handle Preset Period Switch
  const handlePeriodChange = (type: PeriodType) => {
    setPeriodType(type);
    const today = formatDateISO();
    if (type === 'harian') {
      setStartDate(today);
      setEndDate(today);
    } else if (type === 'minggu_ini') {
      const range = getThisWeekRangeISO();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    } else if (type === 'bulan_ini') {
      const range = getThisMonthRangeISO();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    } else if (type === 'bulan_lalu') {
      const range = getLastMonthRangeISO();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  // Human readable period label
  const periodLabel = useMemo(() => {
    if (periodType === 'semua') {
      return 'Seluruh Riwayat Terdaftar';
    }
    if (startDate === endDate) {
      return formatLongDateIndonesian(startDate);
    }
    return `${formatLongDateIndonesian(startDate)} s/d ${formatLongDateIndonesian(endDate)}`;
  }, [periodType, startDate, endDate]);

  // Filtered Logs logic (supports multi-day range & active viewMode)
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Date Range filter
      if (periodType !== 'semua') {
        if (startDate && log.tanggal < startDate) return false;
        if (endDate && log.tanggal > endDate) return false;
      }

      // View Mode filter
      // "Sebagai Staf": hitung dari log.statusStaf ('Tepat Waktu'/'Terlambat'); log yang statusStaf-nya kosong/tidak berlaku diabaikan dari tampilan ini.
      if (viewMode === 'staf') {
        if (!log.statusStaf || log.statusStaf.trim() === '' || log.statusStaf === '-') {
          return false;
        }
      }

      // "Sebagai Guru (Mengajar)": hitung dari log.statusMengajar; log yang statusMengajar-nya kosong/tidak berlaku diabaikan.
      if (viewMode === 'guru') {
        if (!log.statusMengajar || log.statusMengajar.trim() === '' || log.statusMengajar === '-') {
          return false;
        }
      }

      // Effective status in selected view mode
      const effectiveStatus = viewMode === 'staf'
        ? log.statusStaf
        : viewMode === 'guru'
        ? log.statusMengajar
        : log.status;

      // Status filter
      if (selectedStatus !== 'semua' && effectiveStatus !== selectedStatus) {
        return false;
      }

      // Search query filter (nama / jabatan / keterangan / peran)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = log.nama.toLowerCase().includes(q);
        const matchesJabatan = log.jabatan.toLowerCase().includes(q);
        const matchesKet = (log.keterangan || '').toLowerCase().includes(q);
        const matchesPeran = (log.peran || '').toLowerCase().includes(q);
        if (!matchesName && !matchesJabatan && !matchesKet && !matchesPeran) return false;
      }
      return true;
    });
  }, [logs, periodType, startDate, endDate, viewMode, selectedStatus, searchQuery]);

  // Statistics summaries based on currently filtered data and view mode
  const stats = useMemo(() => {
    let tepat = 0;
    let telat = 0;
    let izinDinas = 0;
    let cuti = 0;
    let sakitAlpa = 0;

    filteredLogs.forEach((l) => {
      const effStatus = viewMode === 'staf'
        ? (l.statusStaf || l.status)
        : viewMode === 'guru'
        ? (l.statusMengajar || l.status)
        : l.status;

      if (effStatus === 'Tepat Waktu') tepat++;
      else if (effStatus === 'Terlambat') telat++;
      else if (effStatus === 'Cuti') cuti++;
      else if (effStatus === 'Izin' || effStatus === 'Dinas Luar') izinDinas++;
      else if (effStatus === 'Sakit' || effStatus.includes('Alpa')) sakitAlpa++;
    });

    return { total: filteredLogs.length, tepat, telat, izinDinas, cuti, sakitAlpa };
  }, [filteredLogs, viewMode]);

  // Logs filtered by date range only for the Monthly Violation Report
  const periodLogs = useMemo(() => {
    return logs.filter((log) => {
      if (periodType !== 'semua') {
        if (startDate && log.tanggal < startDate) return false;
        if (endDate && log.tanggal > endDate) return false;
      }
      return true;
    });
  }, [logs, periodType, startDate, endDate]);

  // Rekap Bulanan Pelanggaran per individu
  const pelanggaranReport = useMemo(() => {
    const map = new Map<string, {
      nama: string;
      jabatan: string;
      peran: string;
      hadirDates: Set<string>;
      cutiDates: Set<string>;
      problemDates: Set<string>;
      terlambatStaf: number;
      terlambatMengajar: number;
      terlambatLegacy: number;
      alpaStaf: number;
      alpaMengajar: number;
      alpaUmum: number;
    }>();

    // Inisialisasi seluruh guru & staf resmi jika masterList tersedia
    if (masterList && masterList.length > 0) {
      masterList.forEach((m) => {
        const key = m.nama.trim().toLowerCase();
        map.set(key, {
          nama: m.nama.trim(),
          jabatan: m.jabatan || '-',
          peran: m.peran || (m.jabatan.toLowerCase().includes('guru') ? 'Guru' : 'Staf'),
          hadirDates: new Set<string>(),
          cutiDates: new Set<string>(),
          problemDates: new Set<string>(),
          terlambatStaf: 0,
          terlambatMengajar: 0,
          terlambatLegacy: 0,
          alpaStaf: 0,
          alpaMengajar: 0,
          alpaUmum: 0
        });
      });
    }

    periodLogs.forEach((l) => {
      const key = l.nama.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: l.nama.trim(),
          jabatan: l.jabatan || '-',
          peran: l.peran || '-',
          hadirDates: new Set<string>(),
          cutiDates: new Set<string>(),
          problemDates: new Set<string>(),
          terlambatStaf: 0,
          terlambatMengajar: 0,
          terlambatLegacy: 0,
          alpaStaf: 0,
          alpaMengajar: 0,
          alpaUmum: 0
        });
      }
      const item = map.get(key)!;
      if (l.peran && (item.peran === '-' || !item.peran)) {
        item.peran = l.peran;
      }

      const dateStr = l.tanggal;
      if (l.status === 'Cuti') {
        item.cutiDates.add(dateStr);
      }
      const isPresent = Boolean(l.jamDatang && l.jamDatang !== '-' && !l.status.includes('Alpa'));
      if (isPresent) {
        item.hadirDates.add(dateStr);
      }

      let hasProblemOnThisLog = false;

      // 1. Terlambat sebagai Staf
      if (l.statusStaf === 'Terlambat') {
        item.terlambatStaf++;
        hasProblemOnThisLog = true;
      }

      // 2. Terlambat Mengajar
      if (l.statusMengajar === 'Terlambat') {
        item.terlambatMengajar++;
        hasProblemOnThisLog = true;
      }

      // 3. Terlambat Legacy (tanpa snapshot statusStaf & statusMengajar)
      const isLegacy = (!l.statusStaf || l.statusStaf === '-') && (!l.statusMengajar || l.statusMengajar === '-');
      if (isLegacy && l.status === 'Terlambat') {
        item.terlambatLegacy++;
        hasProblemOnThisLog = true;
      }

      // 4. Alpa (Wajib Hadir Staf)
      if (l.status === 'Alpa (Wajib Hadir Staf)') {
        item.alpaStaf++;
        hasProblemOnThisLog = true;
      }

      // 5. Alpa (Jadwal Mengajar)
      if (l.status === 'Alpa (Jadwal Mengajar)') {
        item.alpaMengajar++;
        hasProblemOnThisLog = true;
      }

      // 6. Alpa Umum
      if (l.status === 'Alpa' || (l.status.includes('Alpa') && l.status !== 'Alpa (Wajib Hadir Staf)' && l.status !== 'Alpa (Jadwal Mengajar)')) {
        item.alpaUmum++;
        hasProblemOnThisLog = true;
      }

      // "Total Hari Bermasalah" = jumlah tanggal UNIK yang memiliki minimal satu keterlambatan atau alpa.
      // Keterlambatan sebagai Staf DAN keterlambatan Mengajar pada hari yang sama dihitung terpisah di kolomnya masing-masing, tetapi hanya 1 hari pada Total Hari Bermasalah.
      if (hasProblemOnThisLog) {
        item.problemDates.add(dateStr);
      }
    });

    const rows = Array.from(map.values()).map((item) => ({
      nama: item.nama,
      jabatan: item.jabatan,
      peran: item.peran,
      hariHadir: item.hadirDates.size,
      hariCuti: item.cutiDates.size,
      terlambatStaf: item.terlambatStaf,
      terlambatMengajar: item.terlambatMengajar,
      terlambatLegacy: item.terlambatLegacy,
      alpaStaf: item.alpaStaf,
      alpaMengajar: item.alpaMengajar,
      alpaUmum: item.alpaUmum,
      totalHariBermasalah: item.problemDates.size
    }));

    // Urutkan dari Total Hari Bermasalah terbanyak, lalu nama
    rows.sort((a, b) => b.totalHariBermasalah - a.totalHariBermasalah || b.hariHadir - a.hariHadir || a.nama.localeCompare(b.nama));
    return rows;
  }, [masterList, periodLogs]);

  const hasLegacyLates = useMemo(() => {
    return pelanggaranReport.some((r) => r.terlambatLegacy > 0);
  }, [pelanggaranReport]);

  const filteredPelanggaranReport = useMemo(() => {
    let list = pelanggaranReport;
    if (onlyViolations) {
      list = list.filter((r) => r.totalHariBermasalah > 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.nama.toLowerCase().includes(q) ||
          r.jabatan.toLowerCase().includes(q) ||
          r.peran.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pelanggaranReport, onlyViolations, searchQuery]);

  // Aggregated per-person data for printable formal report
  const aggregatedReport = useMemo(() => {
    const map = new Map<string, {
      nama: string;
      jabatan: string;
      tepatWaktu: number;
      terlambat: number;
      izinDetails: string[];
      sakitDetails: string[];
      cutiDetails: string[];
      alpaMengajar: number;
      alpaStaf: number;
      alpaUmum: number;
      dinasDetails: string[];
      total: number;
    }>();

    filteredLogs.forEach((l) => {
      const key = l.nama.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          nama: l.nama.trim(),
          jabatan: l.jabatan || '-',
          tepatWaktu: 0,
          terlambat: 0,
          izinDetails: [],
          sakitDetails: [],
          cutiDetails: [],
          alpaMengajar: 0,
          alpaStaf: 0,
          alpaUmum: 0,
          dinasDetails: [],
          total: 0
        });
      }
      const item = map.get(key)!;
      item.total++;
      if (l.status === 'Tepat Waktu') item.tepatWaktu++;
      else if (l.status === 'Terlambat') item.terlambat++;
      else if (l.status === 'Izin') {
        item.izinDetails.push(`${formatLongDateIndonesian(l.tanggal)}${l.keterangan ? ` (${l.keterangan})` : ''}`);
      } else if (l.status === 'Sakit') {
        item.sakitDetails.push(`${formatLongDateIndonesian(l.tanggal)}${l.keterangan ? ` (${l.keterangan})` : ''}`);
      } else if (l.status === 'Cuti') {
        item.cutiDetails.push(`${formatLongDateIndonesian(l.tanggal)}${l.keterangan ? ` (${l.keterangan})` : ''}`);
      } else if (l.status === 'Alpa (Jadwal Mengajar)') item.alpaMengajar++;
      else if (l.status === 'Alpa (Wajib Hadir Staf)') item.alpaStaf++;
      else if (l.status.includes('Alpa')) item.alpaUmum++;
      else if (l.status === 'Dinas Luar') {
        item.dinasDetails.push(`${formatLongDateIndonesian(l.tanggal)}${l.keterangan ? ` (${l.keterangan})` : ''}`);
      }
    });

    return Array.from(map.values());
  }, [filteredLogs]);

  // Status Badge Helper
  const getStatusBadge = (status: StatusPresensi) => {
    switch (status) {
      case 'Tepat Waktu':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            Tepat Waktu
          </span>
        );
      case 'Terlambat':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Terlambat
          </span>
        );
      case 'Cuti':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
            <CalendarRange className="w-3.5 h-3.5 text-teal-600" />
            Cuti
          </span>
        );
      case 'Izin':
      case 'Dinas Luar':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300">
            <AlertCircle className="w-3.5 h-3.5 text-sky-600" />
            {status}
          </span>
        );
      case 'Sakit':
      case 'Alpa':
      case 'Alpa (Jadwal Mengajar)':
      case 'Alpa (Wajib Hadir Staf)':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            {status}
          </span>
        );
      default:
        return status;
    }
  };

  // CSV Export Detail Log
  const exportDetailCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['No', 'Timestamp', 'Tanggal', 'Hari', 'Nama Pegawai', 'Jabatan', 'Mapel Hari Ini', 'Jam Datang', 'Status Kehadiran', 'Keterangan / Alasan'];
    const rows = filteredLogs.map((l, idx) => [
      `"${idx + 1}"`,
      `"${l.timestamp}"`,
      `"${l.tanggal}"`,
      `"${l.hari}"`,
      `"${l.nama.replace(/"/g, '""')}"`,
      `"${l.jabatan.replace(/"/g, '""')}"`,
      `"${l.mapelHariIni.replace(/"/g, '""')}"`,
      `"${l.jamDatang}"`,
      `"${l.status}"`,
      `"${(l.keterangan || '-').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateRangeStr = startDate === endDate ? startDate : `${startDate}_sd_${endDate}`;
    link.setAttribute('download', `Detail_Log_Presensi_${dateRangeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export Rekap Per Pegawai (Terperinci dengan Rincian Izin, Sakit, Dinas & Alpa)
  const exportRekapCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      'No',
      'Nama Pegawai',
      'Jabatan',
      'Tepat Waktu',
      'Terlambat',
      'Jumlah Izin',
      'Rincian Tanggal & Alasan Izin',
      'Jumlah Sakit',
      'Rincian Tanggal & Alasan Sakit',
      'Jumlah Cuti',
      'Rincian Tanggal & Jenis Cuti',
      'Alpa (Jadwal Mengajar)',
      'Alpa (Wajib Hadir Staf)',
      'Alpa (Lainnya)',
      'Jumlah Dinas Luar',
      'Rincian Tanggal & Tugas Dinas',
      'Total Presensi'
    ];

    const rows = aggregatedReport.map((item, idx) => [
      `"${idx + 1}"`,
      `"${item.nama.replace(/"/g, '""')}"`,
      `"${item.jabatan.replace(/"/g, '""')}"`,
      `"${item.tepatWaktu}"`,
      `"${item.terlambat}"`,
      `"${item.izinDetails.length}"`,
      `"${(item.izinDetails.join('; ') || '-').replace(/"/g, '""')}"`,
      `"${item.sakitDetails.length}"`,
      `"${(item.sakitDetails.join('; ') || '-').replace(/"/g, '""')}"`,
      `"${item.cutiDetails.length}"`,
      `"${(item.cutiDetails.join('; ') || '-').replace(/"/g, '""')}"`,
      `"${item.alpaMengajar}"`,
      `"${item.alpaStaf}"`,
      `"${item.alpaUmum}"`,
      `"${item.dinasDetails.length}"`,
      `"${(item.dinasDetails.join('; ') || '-').replace(/"/g, '""')}"`,
      `"${item.total}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateRangeStr = startDate === endDate ? startDate : `${startDate}_sd_${endDate}`;
    link.setAttribute('download', `Rekap_Kolektif_Per_Pegawai_${dateRangeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export Rekap Bulanan Pelanggaran
  const exportPelanggaranCSV = () => {
    if (filteredPelanggaranReport.length === 0) return;

    const headers = [
      'No',
      'Nama Guru / Staf',
      'Jabatan Struktural',
      'Peran Presensi',
      'Hari Hadir',
      'Terlambat sebagai Staf',
      'Terlambat Mengajar',
      ...(hasLegacyLates ? ['Terlambat (data lama)'] : []),
      'Alpa (Wajib Hadir Staf)',
      'Alpa (Jadwal Mengajar)',
      'Alpa (Umum)',
      'Total Hari Bermasalah'
    ];

    const rows = filteredPelanggaranReport.map((r, idx) => {
      const row = [
        `"${idx + 1}"`,
        `"${r.nama.replace(/"/g, '""')}"`,
        `"${r.jabatan.replace(/"/g, '""')}"`,
        `"${r.peran.replace(/"/g, '""')}"`,
        `"${r.hariHadir}"`,
        `"${r.terlambatStaf}"`,
        `"${r.terlambatMengajar}"`
      ];
      if (hasLegacyLates) {
        row.push(`"${r.terlambatLegacy}"`);
      }
      row.push(
        `"${r.alpaStaf}"`,
        `"${r.alpaMengajar}"`,
        `"${r.alpaUmum}"`,
        `"${r.totalHariBermasalah}"`
      );
      return row;
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateRangeStr = startDate === endDate ? startDate : `${startDate}_sd_${endDate}`;
    link.setAttribute('download', `Rekap_Bulanan_Pelanggaran_${dateRangeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Rekap Presensi &amp; Pelanggaran</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Periode Laporan: <strong className="text-slate-700">{periodLabel}</strong> ({filteredLogs.length} Log Presensi)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          {rekapTab === 'pelanggaran' ? (
            <button
              onClick={exportPelanggaranCSV}
              className="px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
              title="Unduh laporan rekap pelanggaran & hari bermasalah (CSV)"
            >
              <Download className="w-3.5 h-3.5 text-rose-200" />
              <span>Unduh Rekap Pelanggaran (CSV)</span>
            </button>
          ) : (
            <>
              <button
                onClick={exportDetailCSV}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                title="Unduh seluruh baris transaksi log presensi"
              >
                <Download className="w-3.5 h-3.5 text-blue-300" />
                <span>Unduh Log Detail (CSV)</span>
              </button>

              <button
                onClick={exportRekapCSV}
                className="px-3 py-2 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                title="Unduh ringkasan per pegawai dengan rincian tanggal & keterangan Izin/Sakit/Alpa"
              >
                <Download className="w-3.5 h-3.5 text-amber-300" />
                <span>Unduh Rekap Kolektif (CSV)</span>
              </button>
            </>
          )}

          <button
            onClick={() => window.print()}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            title="Cetak Laporan PDF Resmi A4"
          >
            <Printer className="w-3.5 h-3.5 text-white" />
            <span>Cetak PDF Laporan Resmi</span>
          </button>

          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Primary Tab Switcher: Riwayat Log Presensi vs Rekap Bulanan Pelanggaran */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 print:hidden">
        <button
          onClick={() => setRekapTab('transaksi')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
            rekapTab === 'transaksi'
              ? 'bg-[#2F5597] text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Riwayat Log Presensi</span>
          <span className={`ml-1 text-[11px] px-2 py-0.5 rounded-full font-extrabold ${
            rekapTab === 'transaksi' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {filteredLogs.length}
          </span>
        </button>

        <button
          onClick={() => setRekapTab('pelanggaran')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
            rekapTab === 'pelanggaran'
              ? 'bg-rose-700 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-rose-300" />
          <span>Rekap Bulanan Pelanggaran</span>
          <span className={`ml-1 text-[11px] px-2 py-0.5 rounded-full font-extrabold ${
            rekapTab === 'pelanggaran' ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {pelanggaranReport.filter((p) => p.totalHariBermasalah > 0).length} Orang Bermasalah
          </span>
        </button>
      </div>

      {/* TAB 1: RIWAYAT LOG PRESENSI DENGAN PEMILIH TAMPILAN GABUNGAN / STAF / GURU */}
      {rekapTab === 'transaksi' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Pemilih Tampilan di Atas Rekap */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2F5597]"></span>
                  <span>Pemilih Tampilan Rekap:</span>
                </div>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  {viewMode === 'gabungan' && (
                    <span><strong>Gabungan:</strong> Perilaku standar. Seluruh catatan log presensi dihitung memakai status utama; data riwayat lama tetap dihitung apa adanya.</span>
                  )}
                  {viewMode === 'staf' && (
                    <span><strong>Sebagai Staf:</strong> Dihitung dari snapshot status staf (Tepat Waktu / Terlambat) batas jam 07:25. Log yang status staf-nya tidak berlaku diabaikan.</span>
                  )}
                  {viewMode === 'guru' && (
                    <span><strong>Sebagai Guru (Mengajar):</strong> Dihitung dari status jam mengajar pertama per hari. Log guru yang tidak berlaku/tidak mengajar diabaikan.</span>
                  )}
                </p>
              </div>

              {/* Segmented Buttons */}
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                <button
                  onClick={() => setViewMode('gabungan')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'gabungan'
                      ? 'bg-white text-[#2F5597] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Gabungan
                </button>
                <button
                  onClick={() => setViewMode('staf')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'staf'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sebagai Staf
                </button>
                <button
                  onClick={() => setViewMode('guru')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'guru'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sebagai Guru (Mengajar)
                </button>
              </div>
            </div>
          </div>

          {/* Stats Summary Cards (Mengikuti Tampilan Terpilih) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-bold uppercase">Total Log ({viewMode})</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{stats.total}</div>
            </div>
            <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 shadow-sm">
              <div className="text-xs text-emerald-700 font-bold uppercase">Tepat Waktu</div>
              <div className="text-2xl font-black text-emerald-800 mt-1">{stats.tepat}</div>
            </div>
            <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-sm">
              <div className="text-xs text-amber-700 font-bold uppercase">Terlambat</div>
              <div className="text-2xl font-black text-amber-800 mt-1">{stats.telat}</div>
            </div>
            <div className="bg-sky-50 p-3.5 rounded-2xl border border-sky-200 shadow-sm">
              <div className="text-xs text-sky-700 font-bold uppercase">Izin / Dinas</div>
              <div className="text-2xl font-black text-sky-800 mt-1">{stats.izinDinas}</div>
            </div>
            <div className="bg-teal-50 p-3.5 rounded-2xl border border-teal-200 shadow-sm">
              <div className="text-xs text-teal-700 font-bold uppercase">Cuti</div>
              <div className="text-2xl font-black text-teal-800 mt-1">{stats.cuti}</div>
            </div>
            <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 shadow-sm">
              <div className="text-xs text-rose-700 font-bold uppercase">Sakit / Alpa</div>
              <div className="text-2xl font-black text-rose-800 mt-1">{stats.sakitAlpa}</div>
            </div>
          </div>

          {/* Multi-Option Date Range & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
            {/* Preset Period Pills */}
            <div>
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1 mb-2">
                <Calendar className="w-3.5 h-3.5 text-[#2F5597]" />
                <span>Pilih Rentang Waktu Laporan:</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => handlePeriodChange('harian')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'harian'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Harian (1 Hari)
                </button>
                <button
                  onClick={() => handlePeriodChange('minggu_ini')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'minggu_ini'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Minggu Ini
                </button>
                <button
                  onClick={() => handlePeriodChange('bulan_ini')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'bulan_ini'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  onClick={() => handlePeriodChange('bulan_lalu')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'bulan_lalu'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Bulan Lalu
                </button>
                <button
                  onClick={() => handlePeriodChange('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'custom'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Rentang Custom...
                </button>
                <button
                  onClick={() => handlePeriodChange('semua')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'semua'
                      ? 'bg-[#2F5597] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Semua Waktu
                </button>
              </div>
            </div>

            {/* Inputs for Date Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
              {periodType !== 'semua' && (
                <>
                  <div className="space-y-1">
                    <label htmlFor="filter-start-date" className="text-xs font-bold text-slate-600">
                      Tanggal Mulai
                    </label>
                    <input
                      type="date"
                      id="filter-start-date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (periodType !== 'custom') setPeriodType('custom');
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#2F5597]"
                    />
                  </div>

                  {periodType !== 'harian' && (
                    <div className="space-y-1">
                      <label htmlFor="filter-end-date" className="text-xs font-bold text-slate-600">
                        Tanggal Selesai
                      </label>
                      <input
                        type="date"
                        id="filter-end-date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          if (periodType !== 'custom') setPeriodType('custom');
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#2F5597]"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Search Query */}
              <div className="space-y-1">
                <label htmlFor="filter-pencarian" className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5 text-[#2F5597]" />
                  <span>Cari Nama / Jabatan</span>
                </label>
                <input
                  type="text"
                  id="filter-pencarian"
                  placeholder="Ketik nama atau jabatan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#2F5597]"
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-1">
                <label htmlFor="filter-status" className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-[#2F5597]" />
                  <span>Filter Status</span>
                </label>
                <select
                  id="filter-status"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#2F5597]"
                >
                  <option value="semua">Semua Status</option>
                  <option value="Tepat Waktu">Tepat Waktu</option>
                  <option value="Terlambat">Terlambat</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Cuti">Cuti</option>
                  <option value="Dinas Luar">Dinas Luar</option>
                  <option value="Alpa (Jadwal Mengajar)">Alpa (Jadwal Mengajar)</option>
                  <option value="Alpa (Wajib Hadir Staf)">Alpa (Wajib Hadir Staf)</option>
                  <option value="Alpa">Alpa (Umum)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {deleteConfirmId && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4 print:hidden">
              <div className="text-xs sm:text-sm text-rose-900 font-semibold">
                Apakah Anda yakin ingin menghapus catatan presensi ini?
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    onDeleteLog(deleteConfirmId);
                    setDeleteConfirmId(null);
                  }}
                  className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700"
                >
                  Hapus
                </button>
              </div>
            </div>
          )}

          {/* Desktop Table & Mobile Cards (Mengikuti Tampilan Terpilih) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="font-bold text-slate-700">Belum ada data presensi</div>
                <p className="text-xs text-slate-500">
                  Tidak ditemukan catatan presensi yang cocok dengan rentang waktu atau mode tampilan "{viewMode}".
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700 border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">No</th>
                        <th className="px-4 py-3">Tanggal / Hari</th>
                        <th className="px-4 py-3">Nama Pegawai</th>
                        <th className="px-4 py-3">Jabatan &amp; Peran</th>
                        <th className="px-4 py-3">Mapel Hari Ini</th>
                        <th className="px-4 py-3">Jam Datang</th>
                        <th className="px-4 py-3">
                          {viewMode === 'staf'
                            ? 'Status Staf'
                            : viewMode === 'guru'
                            ? 'Status Mengajar'
                            : 'Status Kehadiran'}
                        </th>
                        <th className="px-4 py-3">Keterangan</th>
                        <th className="px-4 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredLogs.map((log, idx) => {
                        const isLegacy = (!log.statusStaf || log.statusStaf === '-') && (!log.statusMengajar || log.statusMengajar === '-');
                        return (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{log.tanggal}</div>
                              <div className="text-[11px] text-slate-500">{log.hari}</div>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{log.nama}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              <div>{log.jabatan}</div>
                              {log.peran && (
                                <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                                  log.peran === 'Guru'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : log.peran === 'Guru+Staf'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}>
                                  {log.peran}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {log.mapelHariIni !== '-' ? (
                                <span className="font-medium text-blue-900">{log.mapelHariIni}</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">
                              <div>{log.jamDatang}</div>
                              {viewMode === 'staf' && log.batasStaf && (
                                <div className="text-[10px] text-slate-400 font-normal">Batas: {log.batasStaf}</div>
                              )}
                              {viewMode === 'guru' && log.batasMengajar && (
                                <div className="text-[10px] text-slate-400 font-normal">Batas: {log.batasMengajar}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {viewMode === 'staf' ? (
                                <div>
                                  {getStatusBadge((log.statusStaf || log.status) as StatusPresensi)}
                                  {log.batasStaf && (
                                    <div className="text-[10.5px] text-slate-400 font-medium mt-0.5">Batas Staf: {log.batasStaf}</div>
                                  )}
                                </div>
                              ) : viewMode === 'guru' ? (
                                <div>
                                  {getStatusBadge((log.statusMengajar || log.status) as StatusPresensi)}
                                  {log.batasMengajar && (
                                    <div className="text-[10.5px] text-slate-400 font-medium mt-0.5">Batas Mengajar: {log.batasMengajar}</div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    {getStatusBadge(log.status)}
                                    {isLegacy && (
                                      <span className="text-[9.5px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 font-semibold" title="Catatan lama tanpa snapshot evaluasi staf & guru">
                                        data lama
                                      </span>
                                    )}
                                  </div>
                                  {(log.statusStaf || log.statusMengajar) && (
                                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                                      {log.statusStaf && (
                                        <span>Staf: <strong className={log.statusStaf === 'Terlambat' ? 'text-amber-600' : 'text-emerald-600'}>{log.statusStaf}</strong></span>
                                      )}
                                      {log.statusStaf && log.statusMengajar && <span>•</span>}
                                      {log.statusMengajar && (
                                        <span>Guru: <strong className={log.statusMengajar === 'Terlambat' ? 'text-amber-600' : 'text-emerald-600'}>{log.statusMengajar}</strong></span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{log.keterangan || '-'}</td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => setDeleteConfirmId(log.id)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus baris ini"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredLogs.map((log) => {
                    const isLegacy = (!log.statusStaf || log.statusStaf === '-') && (!log.statusMengajar || log.statusMengajar === '-');
                    const activeStatus = viewMode === 'staf'
                      ? (log.statusStaf || log.status)
                      : viewMode === 'guru'
                      ? (log.statusMengajar || log.status)
                      : log.status;

                    return (
                      <div key={log.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{log.nama}</h4>
                            <div className="text-xs text-slate-500 font-medium">{log.jabatan} {log.peran && `• ${log.peran}`}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {getStatusBadge(activeStatus as StatusPresensi)}
                            {viewMode === 'gabungan' && isLegacy && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 font-semibold">
                                data lama
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Hari/Tanggal</span>
                            <span className="font-semibold text-slate-700">{log.hari}, {log.tanggal}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Jam Datang</span>
                            <span className="font-bold text-slate-900">{log.jamDatang}</span>
                            {viewMode === 'staf' && log.batasStaf && (
                              <span className="text-[10px] text-slate-400 block font-normal">Batas: {log.batasStaf}</span>
                            )}
                            {viewMode === 'guru' && log.batasMengajar && (
                              <span className="text-[10px] text-slate-400 block font-normal">Batas: {log.batasMengajar}</span>
                            )}
                          </div>
                          <div className="col-span-2 border-t border-slate-200/60 pt-1.5 mt-0.5">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Mapel Hari Ini</span>
                            <span className="font-medium text-slate-800">{log.mapelHariIni}</span>
                          </div>
                          {viewMode === 'gabungan' && (log.statusStaf || log.statusMengajar) && (
                            <div className="col-span-2 border-t border-slate-200/60 pt-1.5 text-[10.5px] text-slate-600">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Rincian Evaluasi</span>
                              <div className="flex flex-wrap gap-2 mt-0.5">
                                {log.statusStaf && (
                                  <span>Staf: <strong className={log.statusStaf === 'Terlambat' ? 'text-amber-700' : 'text-emerald-700'}>{log.statusStaf}</strong></span>
                                )}
                                {log.statusMengajar && (
                                  <span>Mengajar: <strong className={log.statusMengajar === 'Terlambat' ? 'text-amber-700' : 'text-emerald-700'}>{log.statusMengajar}</strong></span>
                                )}
                              </div>
                            </div>
                          )}
                          {log.keterangan && (
                            <div className="col-span-2 border-t border-slate-200/60 pt-1.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold">Keterangan</span>
                              <span className="text-slate-700">{log.keterangan}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => setDeleteConfirmId(log.id)}
                            className="text-xs text-rose-600 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REKAP BULANAN PELANGGARAN */}
      {rekapTab === 'pelanggaran' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Header Banner & Penjelasan */}
          <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 p-4 rounded-2xl border border-rose-200 shadow-sm space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900 font-extrabold text-sm sm:text-base">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Rekap Bulanan Pelanggaran Kedisiplinan &amp; Keterlambatan</span>
              </div>
              <span className="text-xs font-bold text-rose-800 bg-white/80 px-2.5 py-1 rounded-lg border border-rose-200 shadow-2xs">
                Periode: {periodLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Merekapitulasi keterlambatan staf dan keterlambatan mengajar secara terpisah per individu.
              Kolom <strong>Total Hari Bermasalah</strong> menghitung jumlah <em>tanggal unik</em> yang memiliki minimal 1 keterlambatan atau alpa (jika terlambat staf dan mengajar pada hari yang sama, tetap dihitung 1 hari).
            </p>
          </div>

          {/* KPI Pelanggaran Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:hidden">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-bold uppercase">Total Guru &amp; Staf</div>
              <div className="text-2xl font-black text-slate-800 mt-1">{pelanggaranReport.length}</div>
            </div>
            <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 shadow-sm">
              <div className="text-xs text-rose-700 font-bold uppercase">Pegawai Bermasalah</div>
              <div className="text-2xl font-black text-rose-800 mt-1">
                {pelanggaranReport.filter((r) => r.totalHariBermasalah > 0).length}
              </div>
            </div>
            <div className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200 shadow-sm">
              <div className="text-xs text-indigo-700 font-bold uppercase">Kasus Telat Staf</div>
              <div className="text-2xl font-black text-indigo-800 mt-1">
                {pelanggaranReport.reduce((acc, r) => acc + r.terlambatStaf, 0)}
              </div>
            </div>
            <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 shadow-sm">
              <div className="text-xs text-amber-700 font-bold uppercase">Kasus Telat Mengajar</div>
              <div className="text-2xl font-black text-amber-800 mt-1">
                {pelanggaranReport.reduce((acc, r) => acc + r.terlambatMengajar, 0)}
              </div>
            </div>
            <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 shadow-sm col-span-2 sm:col-span-1">
              <div className="text-xs text-red-700 font-bold uppercase">Total Kasus Alpa</div>
              <div className="text-2xl font-black text-red-800 mt-1">
                {pelanggaranReport.reduce((acc, r) => acc + r.alpaStaf + r.alpaMengajar + r.alpaUmum, 0)}
              </div>
            </div>
          </div>

          {/* Filter & Kontrol Rekap Pelanggaran */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
            <div>
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1 mb-2">
                <Calendar className="w-3.5 h-3.5 text-[#2F5597]" />
                <span>Pilih Bulan / Periode Rekap:</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => handlePeriodChange('bulan_ini')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'bulan_ini'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  onClick={() => handlePeriodChange('bulan_lalu')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'bulan_lalu'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Bulan Lalu
                </button>
                <button
                  onClick={() => handlePeriodChange('minggu_ini')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'minggu_ini'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Minggu Ini
                </button>
                <button
                  onClick={() => handlePeriodChange('harian')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'harian'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  onClick={() => handlePeriodChange('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'custom'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Rentang Custom...
                </button>
                <button
                  onClick={() => handlePeriodChange('semua')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    periodType === 'semua'
                      ? 'bg-rose-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Semua Waktu
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Cari nama pegawai, jabatan, atau peran..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-rose-600"
                />
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={onlyViolations}
                    onChange={(e) => setOnlyViolations(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                  />
                  <span>Hanya yang ada Pelanggaran ({pelanggaranReport.filter((r) => r.totalHariBermasalah > 0).length})</span>
                </label>

                <button
                  onClick={exportPelanggaranCSV}
                  className="px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="Unduh file Excel / CSV Rekap Pelanggaran"
                >
                  <Download className="w-3.5 h-3.5 text-rose-200" />
                  <span>Unduh CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabel Rekap Pelanggaran Bulanan (Desktop) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
            {filteredPelanggaranReport.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <div className="font-bold text-slate-800">Tidak ada data pelanggaran</div>
                <p className="text-xs text-slate-500">
                  {onlyViolations
                    ? 'Semua guru dan staf berdisiplin penuh tanpa keterlambatan maupun alpa pada periode ini!'
                    : 'Tidak ada pegawai yang sesuai dengan pencarian aktif.'}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 text-center">No</th>
                        <th className="px-4 py-3">Nama Pegawai</th>
                        <th className="px-4 py-3">Jabatan</th>
                        <th className="px-3 py-3 text-center">Peran</th>
                        <th className="px-3 py-3 text-center">Hari Hadir</th>
                        <th className="px-3 py-3 text-center text-indigo-900 bg-indigo-50/50">
                          Terlambat Staf
                        </th>
                        <th className="px-3 py-3 text-center text-amber-900 bg-amber-50/50">
                          Terlambat Mengajar
                        </th>
                        {hasLegacyLates && (
                          <th className="px-3 py-3 text-center text-slate-700 bg-slate-100" title="Keterlambatan pada data riwayat lama sebelum snapshot multi-peran">
                            Terlambat (data lama)
                          </th>
                        )}
                        <th className="px-3 py-3 text-center text-rose-900 bg-rose-50/50">
                          Alpa (Wajib Hadir Staf)
                        </th>
                        <th className="px-3 py-3 text-center text-red-900 bg-red-50/50">
                          Alpa (Jadwal Mengajar)
                        </th>
                        <th className="px-4 py-3 text-center text-rose-950 font-black bg-rose-100/60">
                          Total Hari Bermasalah
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {filteredPelanggaranReport.map((row, idx) => {
                        const hasProblem = row.totalHariBermasalah > 0;
                        return (
                          <tr
                            key={`pelanggaran-row-${row.nama}-${idx}`}
                            className={`transition-colors ${
                              hasProblem ? 'hover:bg-rose-50/40 bg-white' : 'hover:bg-slate-50 bg-slate-50/30'
                            }`}
                          >
                            <td className="px-4 py-3 text-center font-semibold text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                              {row.nama}
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {row.jabatan}
                            </td>
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                row.peran === 'Guru'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : row.peran === 'Guru+Staf'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {row.peran}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center font-bold text-emerald-800">
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                                {row.hariHadir} hari
                              </span>
                              {row.hariCuti > 0 && (
                                <span className="block text-[10px] text-teal-700 font-semibold mt-0.5">
                                  ({row.hariCuti} hari cuti)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center font-bold">
                              {row.terlambatStaf > 0 ? (
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-md font-extrabold">
                                  {row.terlambatStaf}x
                                </span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center font-bold">
                              {row.terlambatMengajar > 0 ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-extrabold">
                                  {row.terlambatMengajar}x
                                </span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            {hasLegacyLates && (
                              <td className="px-3 py-3 text-center font-bold bg-slate-50">
                                {row.terlambatLegacy > 0 ? (
                                  <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-md font-bold text-[11px]">
                                    {row.terlambatLegacy}x
                                  </span>
                                ) : (
                                  <span className="text-slate-300">0</span>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-3 text-center font-bold">
                              {row.alpaStaf > 0 ? (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-900 border border-rose-300 rounded-md font-extrabold">
                                  {row.alpaStaf}x
                                </span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center font-bold">
                              {row.alpaMengajar > 0 ? (
                                <span className="px-2 py-0.5 bg-red-100 text-red-900 border border-red-300 rounded-md font-extrabold">
                                  {row.alpaMengajar}x
                                </span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-extrabold">
                              {row.totalHariBermasalah > 0 ? (
                                <span className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-black shadow-xs inline-flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>{row.totalHariBermasalah} Hari</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>0 (Disiplin)</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards for Rekap Pelanggaran */}
                <div className="lg:hidden divide-y divide-slate-200">
                  {filteredPelanggaranReport.map((row, idx) => (
                    <div key={`mobile-pelanggaran-${row.nama}-${idx}`} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{row.nama}</h4>
                          <div className="text-xs text-slate-500 font-medium">
                            {row.jabatan} • <span className="font-bold text-slate-700">{row.peran}</span>
                          </div>
                        </div>

                        {row.totalHariBermasalah > 0 ? (
                          <span className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-black shrink-0 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>{row.totalHariBermasalah} Hari Bermasalah</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-bold shrink-0">
                            0 (Disiplin)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Hari Hadir</span>
                          <span className="font-bold text-emerald-700">{row.hariHadir} hari</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Telat Staf</span>
                          <span className={row.terlambatStaf > 0 ? 'font-black text-indigo-700' : 'text-slate-400'}>
                            {row.terlambatStaf}x
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Telat Mengajar</span>
                          <span className={row.terlambatMengajar > 0 ? 'font-black text-amber-700' : 'text-slate-400'}>
                            {row.terlambatMengajar}x
                          </span>
                        </div>
                        {hasLegacyLates && (
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Telat Data Lama</span>
                            <span className={row.terlambatLegacy > 0 ? 'font-bold text-slate-700' : 'text-slate-400'}>
                              {row.terlambatLegacy}x
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Alpa Staf</span>
                          <span className={row.alpaStaf > 0 ? 'font-black text-rose-700' : 'text-slate-400'}>
                            {row.alpaStaf}x
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Alpa Mengajar</span>
                          <span className={row.alpaMengajar > 0 ? 'font-black text-red-700' : 'text-slate-400'}>
                            {row.alpaMengajar}x
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Printable Formal A4 Report Layout (Visible only when printing) */}
      <div className="hidden print:block bg-white text-slate-900 font-sans leading-relaxed text-xs p-4">
        {/* Printable CSS Page Styles */}
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 12mm 12mm 15mm 12mm;
            }
            body {
              background-color: #ffffff !important;
              color: #000000 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-page-break-before {
              page-break-before: always;
              break-before: page;
            }
            .print-avoid-break {
              page-break-inside: avoid;
              break-inside: avoid;
            }
          }
        `}</style>

        {/* Kop Surat Resmi Sekolah */}
        <div className="text-center border-b-4 border-double border-slate-900 pb-3 mb-5 print-avoid-break">
          <div className="text-[11px] font-bold tracking-widest text-slate-600 uppercase">YAYASAN AL-ROBBANIYIN BANYUWANGI</div>
          <h1 className="text-xl font-black uppercase tracking-wide text-slate-900 mt-0.5">SMP NURUL ABROR AL-ROBBANIYIN</h1>
          <p className="text-[10px] text-slate-600 mt-0.5">
            Jl. Raya Alasbuluh No. 01 Wongsorejo, Kabupaten Banyuwangi, Jawa Timur 68453
          </p>
          <div className="mt-3 pt-2 border-t border-slate-300">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
              LAPORAN REKAPITULASI RESMI PRESENSI GURU &amp; STAF
            </h2>
            <p className="text-xs font-semibold text-slate-700 mt-1">
              Periode Laporan: <span className="underline font-bold">{periodLabel}</span>
            </p>
          </div>
        </div>

        {/* Ringkasan Statistik KPI Box */}
        <div className="grid grid-cols-6 gap-2 text-center text-[10px] font-bold mb-5 print-avoid-break">
          <div className="p-2 border border-slate-400 rounded bg-slate-50">
            <div className="text-slate-600">Total Log Presensi</div>
            <div className="text-base font-black text-slate-900 mt-0.5">{stats.total}</div>
          </div>
          <div className="p-2 border border-emerald-400 rounded bg-emerald-50">
            <div className="text-emerald-800">Tepat Waktu</div>
            <div className="text-base font-black text-emerald-900 mt-0.5">{stats.tepat}</div>
          </div>
          <div className="p-2 border border-amber-400 rounded bg-amber-50">
            <div className="text-amber-800">Terlambat</div>
            <div className="text-base font-black text-amber-900 mt-0.5">{stats.telat}</div>
          </div>
          <div className="p-2 border border-sky-400 rounded bg-sky-50">
            <div className="text-sky-800">Izin &amp; Dinas Luar</div>
            <div className="text-base font-black text-sky-900 mt-0.5">{stats.izinDinas}</div>
          </div>
          <div className="p-2 border border-teal-400 rounded bg-teal-50">
            <div className="text-teal-800">Cuti Resmi</div>
            <div className="text-base font-black text-teal-900 mt-0.5">{stats.cuti}</div>
          </div>
          <div className="p-2 border border-rose-400 rounded bg-rose-50">
            <div className="text-rose-800">Sakit &amp; Alpa</div>
            <div className="text-base font-black text-rose-900 mt-0.5">{stats.sakitAlpa}</div>
          </div>
        </div>

        {/* BAGIAN 1: TABEL REKAPITULASI KOLEKTIF PER PEGAWAI */}
        <div className="mb-6 print-avoid-break">
          <h3 className="font-bold text-xs uppercase mb-1.5 text-slate-900 border-b border-slate-400 pb-0.5">
            1. Tabel Rekapitulasi Kolektif Per Pegawai &amp; Rincian Alasan Ketidakhadiran
          </h3>
          <table className="w-full text-left text-[10px] border border-slate-400 border-collapse">
            <thead>
              <tr className="bg-slate-200 font-bold border-b border-slate-400 text-slate-900">
                <th className="p-1.5 border border-slate-400 text-center w-6">No</th>
                <th className="p-1.5 border border-slate-400">Nama Pegawai</th>
                <th className="p-1.5 border border-slate-400">Jabatan</th>
                <th className="p-1.5 border border-slate-400 text-center">Tepat</th>
                <th className="p-1.5 border border-slate-400 text-center">Telat</th>
                <th className="p-1.5 border border-slate-400 text-center">Izin</th>
                <th className="p-1.5 border border-slate-400 text-center">Sakit</th>
                <th className="p-1.5 border border-slate-400 text-center">Cuti</th>
                <th className="p-1.5 border border-slate-400 text-center">Alpa (Mengajar)</th>
                <th className="p-1.5 border border-slate-400 text-center">Alpa (Staf)</th>
                <th className="p-1.5 border border-slate-400 text-center">Dinas</th>
                <th className="p-1.5 border border-slate-400">Rincian Tanggal &amp; Keterangan (Izin/Sakit/Cuti/Dinas)</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedReport.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-3 text-center italic text-slate-500">
                    Tidak ada data rekapan untuk periode ini.
                  </td>
                </tr>
              ) : (
                aggregatedReport.map((row, idx) => {
                  const combinedDetails = [
                    ...row.izinDetails.map((d) => `[Izin] ${d}`),
                    ...row.sakitDetails.map((d) => `[Sakit] ${d}`),
                    ...row.cutiDetails.map((d) => `[Cuti] ${d}`),
                    ...row.dinasDetails.map((d) => `[Dinas] ${d}`)
                  ];

                  return (
                    <tr key={`print-agg-${idx}`} className="border-b border-slate-300">
                      <td className="p-1 border border-slate-300 text-center">{idx + 1}</td>
                      <td className="p-1 border border-slate-300 font-bold">{row.nama}</td>
                      <td className="p-1 border border-slate-300 text-slate-700">{row.jabatan}</td>
                      <td className="p-1 border border-slate-300 text-center font-bold text-emerald-800">{row.tepatWaktu}</td>
                      <td className="p-1 border border-slate-300 text-center font-bold text-amber-800">{row.terlambat}</td>
                      <td className="p-1 border border-slate-300 text-center font-semibold text-blue-800">{row.izinDetails.length}</td>
                      <td className="p-1 border border-slate-300 text-center font-semibold text-indigo-800">{row.sakitDetails.length}</td>
                      <td className="p-1 border border-slate-300 text-center font-semibold text-teal-800">{row.cutiDetails.length}</td>
                      <td className="p-1 border border-slate-300 text-center font-bold text-rose-800">{row.alpaMengajar}</td>
                      <td className="p-1 border border-slate-300 text-center font-bold text-rose-900">{row.alpaStaf}</td>
                      <td className="p-1 border border-slate-300 text-center font-semibold text-purple-800">{row.dinasDetails.length}</td>
                      <td className="p-1 border border-slate-300 text-[9px] leading-tight">
                        {combinedDetails.length > 0 ? combinedDetails.join('; ') : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* BAGIAN 2: RINCIAN SELURUH TRANSAKSI LOG PRESENSI HARIAN (Halaman 2 / Lanjutan) */}
        <div className="mt-8 print-page-break-before">
          <div className="border-b-2 border-slate-900 pb-2 mb-3">
            <h3 className="font-black text-xs uppercase tracking-wider text-slate-900">
              2. Rincian Transaksi Log Presensi Harian Terperinci
            </h3>
            <p className="text-[10px] text-slate-600">
              Menampilkan seluruh catatan transaksi masuk, keterlambatan, dan perizinan harian ({filteredLogs.length} Baris).
            </p>
          </div>

          <table className="w-full text-left text-[9px] border border-slate-400 border-collapse">
            <thead>
              <tr className="bg-slate-200 font-bold border-b border-slate-400 text-slate-900">
                <th className="p-1 border border-slate-400 text-center w-5">No</th>
                <th className="p-1 border border-slate-400 w-24">Tanggal &amp; Hari</th>
                <th className="p-1 border border-slate-400">Nama Pegawai</th>
                <th className="p-1 border border-slate-400">Jabatan</th>
                <th className="p-1 border border-slate-400">Mapel Hari Ini</th>
                <th className="p-1 border border-slate-400 text-center w-12">Jam</th>
                <th className="p-1 border border-slate-400 w-24">Status Kehadiran</th>
                <th className="p-1 border border-slate-400">Keterangan / Alasan</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-3 text-center italic text-slate-500">
                    Tidak ada transaksi log harian.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={`print-log-${log.id}`} className="border-b border-slate-300 print-avoid-break">
                    <td className="p-1 border border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-1 border border-slate-300 font-medium whitespace-nowrap">{log.hari}, {log.tanggal}</td>
                    <td className="p-1 border border-slate-300 font-bold whitespace-nowrap">{log.nama}</td>
                    <td className="p-1 border border-slate-300 text-slate-700">{log.jabatan}</td>
                    <td className="p-1 border border-slate-300 text-slate-700">{log.mapelHariIni}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold">{log.jamDatang}</td>
                    <td className="p-1 border border-slate-300 font-semibold">{log.status}</td>
                    <td className="p-1 border border-slate-300">{log.keterangan || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* BAGIAN 3: LEMBAR PENGESAHAN TANDA TANGAN */}
        <div className="flex justify-between items-start text-xs pt-8 mt-6 border-t border-slate-400 print-avoid-break">
          <div className="text-center w-64">
            <p className="font-semibold text-slate-700">Mengetahui,</p>
            <p className="font-bold text-slate-900 mt-1">Kepala SMP Nurul Abror Al-Robbaniyin</p>
            <div className="h-16"></div>
            <p className="font-bold underline text-slate-900">Ahmad Erfan, S.Pd</p>
            <p className="text-[10px] text-slate-600">NIP. -</p>
          </div>

          <div className="text-center w-64">
            <p className="text-slate-700 font-medium">Banyuwangi, {formatLongDateIndonesian(formatDateISO())}</p>
            <p className="font-bold text-slate-900 mt-1">Petugas Presensi Kehadiran</p>
            <div className="h-16"></div>
            <p className="font-bold underline text-slate-900">Tim Admin Presensi</p>
            <p className="text-[10px] text-slate-600">SMP Nurul Abror Al-Robbaniyin</p>
          </div>
        </div>
      </div>
    </div>
  );
};

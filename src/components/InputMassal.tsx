import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Save,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  Zap,
  RotateCcw,
  RefreshCw,
  FileSpreadsheet,
  Edit3
} from 'lucide-react';
import { MasterGuruStaf, LogPresensi, StatusPresensi, HariSekolah, AppSettings, JadwalSlot } from '../types';
import {
  formatDateISO,
  getHariFromDate,
  formatLongDateIndonesian,
  getMapelHariIni,
  filterTeachersForDay,
  formatTimestamp,
  isJumat
} from '../utils/dateUtils';
import { evaluateStatus24h, parseAndFormat24hTime } from '../utils/timeUtils';
import { evaluateTeacherScheduleForDay, evaluateTeacherAttendanceStatus, isTeacherWajibHadir } from '../utils/scheduleTimeEvaluator';
import { Time24hInput } from './Time24hInput';

interface InputMassalProps {
  masterList: MasterGuruStaf[];
  existingLogs: LogPresensi[];
  threshold: string;
  onBatchSave: (
    logsToSave: LogPresensi[]
  ) => Promise<{ success: boolean; message: string; updated?: number; inserted?: number }>;
  onRefreshData?: () => Promise<void>;
  settings?: AppSettings;
  jadwalList?: JadwalSlot[];
}

interface RowState {
  jamDatang: string;
  status: StatusPresensi | '';
  keterangan: string;
  existingLogId?: string;
  isModified: boolean;
}

const STATUS_OPTIONS: StatusPresensi[] = [
  'Tepat Waktu',
  'Terlambat',
  'Izin',
  'Sakit',
  'Cuti',
  'Alpa (Jadwal Mengajar)',
  'Alpa (Wajib Hadir Staf)',
  'Alpa (Wajib Hadir Guru BK)',
  'Alpa',
  'Dinas Luar'
];

export const InputMassal: React.FC<InputMassalProps> = ({
  masterList,
  existingLogs,
  threshold,
  onBatchSave,
  onRefreshData,
  settings,
  jadwalList
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(formatDateISO());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJabatan, setSelectedJabatan] = useState<string>('Semua');
  const [showAllUnscheduled, setShowAllUnscheduled] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [rowStateMap, setRowStateMap] = useState<Map<string, RowState>>(new Map());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    inserted?: number;
    updated?: number;
  } | null>(null);

  // Derive day of week from selected date
  const selectedHari = useMemo<HariSekolah>(() => {
    return getHariFromDate(selectedDate);
  }, [selectedDate]);

  const isHoliday = isJumat(selectedHari);

  // Fetch latest data from Google Sheets whenever selectedDate changes
  useEffect(() => {
    if (onRefreshData) {
      setIsRefreshing(true);
      onRefreshData().finally(() => setIsRefreshing(false));
    }
  }, [selectedDate]);

  // Initialize or update table state whenever date or existingLogs change
  useEffect(() => {
    const newMap = new Map<string, RowState>();

    // Index existing logs by teacher name (lowercase) for the selected date
    const logsForDate = existingLogs.filter((l) => l.tanggal === selectedDate);
    const logByNamaMap = new Map<string, LogPresensi>();
    for (const log of logsForDate) {
      logByNamaMap.set(log.nama.trim().toLowerCase(), log);
    }

    for (const guru of masterList) {
      const key = guru.nama.trim().toLowerCase();
      const existing = logByNamaMap.get(key);

      if (existing) {
        let cleanJam = existing.jamDatang === '-' ? '' : (existing.jamDatang || '');
        if (cleanJam) {
          const parsed = parseAndFormat24hTime(cleanJam);
          if (parsed.isValid && parsed.formatted) {
            cleanJam = parsed.formatted;
          }
        }

        let currentStatus = existing.status;
        // Auto re-evaluate status against teacher's schedule & rule if status is Tepat Waktu or Terlambat
        if (cleanJam && (currentStatus === 'Tepat Waktu' || currentStatus === 'Terlambat')) {
          currentStatus = evaluateTeacherAttendanceStatus(
            cleanJam,
            guru,
            selectedHari,
            threshold,
            settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
            jadwalList,
            settings?.guruToleransiMenit || 0,
            settings?.guruTanpaJadwalWajibHadir || false,
            undefined,
            settings?.attendanceRuleOverrides
          ).status;
        }

        newMap.set(guru.nama, {
          jamDatang: cleanJam,
          status: currentStatus,
          keterangan: existing.keterangan || '',
          existingLogId: existing.id,
          isModified: false
        });
      } else {
        newMap.set(guru.nama, {
          jamDatang: '',
          status: '',
          keterangan: '',
          existingLogId: undefined,
          isModified: false
        });
      }
    }

    setRowStateMap(newMap);
    setSaveFeedback(null);
  }, [selectedDate, existingLogs, masterList, threshold]);

  // Unique Jabatan list for filter dropdown
  const jabatanOptions = useMemo(() => {
    const set = new Set<string>();
    masterList.forEach((m) => {
      if (m.jabatan) set.add(m.jabatan);
    });
    return Array.from(set).sort();
  }, [masterList]);

  const teacherByName = useMemo(() => {
    const map = new Map<string, MasterGuruStaf>();
    masterList.forEach((m) => map.set(m.nama, m));
    return map;
  }, [masterList]);

  // Filtered master list based on search, jabatan, and daily schedule
  const filteredList = useMemo(() => {
    const teachersOnDay = showAllUnscheduled
      ? masterList
      : masterList.filter((m) =>
          isTeacherWajibHadir(m, selectedHari, jadwalList, settings?.guruTanpaJadwalWajibHadir, settings?.attendanceRuleOverrides)
        );
    return teachersOnDay.filter((m) => {
      const matchSearch =
        m.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.jabatan.toLowerCase().includes(searchQuery.toLowerCase());
      const matchJabatan = selectedJabatan === 'Semua' || m.jabatan === selectedJabatan;
      return matchSearch && matchJabatan;
    });
  }, [masterList, selectedHari, showAllUnscheduled, searchQuery, selectedJabatan, jadwalList, settings]);

  // Handle Jam Datang inline change
  const handleJamDatangChange = (nama: string, newTime: string) => {
    const guru = teacherByName.get(nama);
    setRowStateMap((prev) => {
      const next = new Map<string, RowState>(prev);
      const current = next.get(nama) || { jamDatang: '', status: '', keterangan: '', isModified: false };
      
      let nextStatus = current.status;
      // Auto-calculate status if status was unselected or was auto Tepat Waktu / Terlambat
      if (newTime && (!current.status || current.status === 'Tepat Waktu' || current.status === 'Terlambat')) {
        nextStatus = guru
          ? evaluateTeacherAttendanceStatus(
              newTime,
              guru,
              selectedHari,
              threshold,
              settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
              jadwalList,
              settings?.guruToleransiMenit || 0,
              settings?.guruTanpaJadwalWajibHadir || false,
              undefined,
              settings?.attendanceRuleOverrides
            ).status
          : evaluateStatus24h(newTime, threshold);
      }

      next.set(nama, {
        ...current,
        jamDatang: newTime,
        status: nextStatus,
        isModified: true
      });
      return next;
    });
  };

  // Handle Status inline change
  const handleStatusChange = (nama: string, newStatus: StatusPresensi | '') => {
    setRowStateMap((prev) => {
      const next = new Map<string, RowState>(prev);
      const current = next.get(nama) || { jamDatang: '', status: '', keterangan: '', isModified: false };
      
      let nextJam = current.jamDatang;
      if (['Cuti', 'Izin', 'Sakit', 'Alpa', 'Alpa (Jadwal Mengajar)', 'Alpa (Wajib Hadir Staf)', 'Alpa (Wajib Hadir Guru BK)', 'Dinas Luar'].includes(newStatus)) {
        nextJam = ''; // or empty time
      }

      next.set(nama, {
        ...current,
        status: newStatus,
        jamDatang: nextJam,
        isModified: true
      });
      return next;
    });
  };

  // Handle Keterangan inline change
  const handleKeteranganChange = (nama: string, newKet: string) => {
    setRowStateMap((prev) => {
      const next = new Map<string, RowState>(prev);
      const current = next.get(nama) || { jamDatang: '', status: '', keterangan: '', isModified: false };
      next.set(nama, {
        ...current,
        keterangan: newKet,
        isModified: true
      });
      return next;
    });
  };

  // Quick Action: Fill all visible, unfilled rows with "Tepat Waktu" at 07:00
  const handleQuickFillOnTime = () => {
    setRowStateMap((prev) => {
      const next = new Map<string, RowState>(prev);
      for (const guru of filteredList) {
        const current = next.get(guru.nama) || { jamDatang: '', status: '', keterangan: '', isModified: false };
        if (!current.jamDatang && !current.status) {
          next.set(guru.nama, {
            ...current,
            jamDatang: '07:00',
            status: 'Tepat Waktu',
            isModified: true
          });
        }
      }
      return next;
    });
  };

  // Reset form for current date
  const handleResetCurrentDate = () => {
    if (window.confirm('Kosongkan semua isian di tabel untuk tanggal ini?')) {
      const resetMap = new Map<string, RowState>();
      masterList.forEach((m) => {
        resetMap.set(m.nama, {
          jamDatang: '',
          status: '',
          keterangan: '',
          isModified: true
        });
      });
      setRowStateMap(resetMap);
    }
  };

  // Count filled / modified entries
  const filledCount = useMemo(() => {
    let count = 0;
    rowStateMap.forEach((val) => {
      if (val.jamDatang.trim() !== '' || val.status !== '') {
        count++;
      }
    });
    return count;
  }, [rowStateMap]);

  // Submit Batch Upsert - ONLY modified / newly edited rows!
  const handleSaveAll = async () => {
    if (isHoliday) {
      alert('Presensi tidak dapat disimpan untuk Hari Jumat (Sekolah Libur).');
      return;
    }

    // Refresh latest logs from Google Sheets before building payload to map accurate IDs
    if (onRefreshData) {
      setIsRefreshing(true);
      await onRefreshData();
      setIsRefreshing(false);
    }

    const logsToSave: LogPresensi[] = [];

    // Re-index latest existing logs by teacher name
    const latestLogsForDate = existingLogs.filter((l) => l.tanggal === selectedDate);
    const latestLogByNamaMap = new Map<string, LogPresensi>();
    for (const log of latestLogsForDate) {
      latestLogByNamaMap.set(log.nama.trim().toLowerCase(), log);
    }

    masterList.forEach((guru) => {
      const state = rowStateMap.get(guru.nama);
      if (!state) return;

      // CRITICAL FIX: Only include rows that have been edited / filled in this session (isModified)
      if (!state.isModified) return;

      // Skip rows that have neither jamDatang nor status
      if (!state.jamDatang.trim() && !state.status) return;

      const finalJam = state.jamDatang.trim() || '-';
      const scheduleEval = evaluateTeacherScheduleForDay(guru, selectedHari, threshold, jadwalList, settings?.attendanceRuleOverrides);
      const mapel = scheduleEval.hasTeachingSchedule ? scheduleEval.mapelHariIni : getMapelHariIni(guru, selectedHari, jadwalList);

      let finalStatus: StatusPresensi = state.status || 'Tepat Waktu';
      let peranVal: string | undefined = undefined;
      let batasStafVal: string | undefined = undefined;
      let statusStafVal: string | undefined = undefined;
      let batasMengajarVal: string | undefined = undefined;
      let statusMengajarVal: string | undefined = undefined;

      const isManual = state.status === 'Cuti' || state.status === 'Izin' || state.status === 'Sakit' || state.status === 'Alpa' || state.status === 'Dinas Luar' || (state.status && state.status.includes('Alpa'));

      if (!isManual && finalJam !== '-') {
        const evalRes = evaluateTeacherAttendanceStatus(
          finalJam,
          guru,
          selectedHari,
          threshold,
          settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
          jadwalList,
          settings?.guruToleransiMenit || 0,
          settings?.guruTanpaJadwalWajibHadir || false,
          undefined,
          settings?.attendanceRuleOverrides
        );
        finalStatus = state.status || evalRes.status;
        peranVal = evalRes.peran;
        batasStafVal = evalRes.batasStaf || undefined;
        statusStafVal = evalRes.statusStaf || undefined;
        batasMengajarVal = evalRes.batasMengajar || undefined;
        statusMengajarVal = evalRes.statusMengajar || undefined;
      } else if (!state.status) {
        finalStatus = evaluateStatus24h(finalJam, threshold);
      }

      // Match against fresh existingLogId if present
      const freshExisting = latestLogByNamaMap.get(guru.nama.trim().toLowerCase());
      const targetId = freshExisting?.id || state.existingLogId || `ID-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      logsToSave.push({
        id: targetId,
        timestamp: formatTimestamp(),
        tanggal: selectedDate,
        hari: selectedHari,
        nama: guru.nama,
        jabatan: guru.jabatan,
        mapelHariIni: mapel,
        jamDatang: finalJam,
        status: finalStatus,
        keterangan: state.keterangan.trim(),
        peran: peranVal,
        batasStaf: batasStafVal,
        statusStaf: statusStafVal,
        batasMengajar: batasMengajarVal,
        statusMengajar: statusMengajarVal
      });
    });

    if (logsToSave.length === 0) {
      setSaveFeedback({
        type: 'info',
        message: 'Tidak ada baris yang diubah atau diisi baru pada sesi ini untuk disimpan.'
      });
      return;
    }

    setIsSaving(true);
    setSaveFeedback(null);

    const result = await onBatchSave(logsToSave);

    setIsSaving(false);
    if (result.success) {
      const ins = result.inserted || 0;
      const upd = result.updated || 0;
      setSaveFeedback({
        type: 'success',
        message: `Ringkasan Simpan: ${ins} data baru ditambahkan, ${upd} data diperbarui ke Google Sheets.`,
        inserted: ins,
        updated: upd
      });

      // Reset isModified flags for successfully saved entries
      setRowStateMap((prev) => {
        const next = new Map<string, RowState>(prev);
        logsToSave.forEach((saved) => {
          const current = next.get(saved.nama);
          if (current) {
            next.set(saved.nama, {
              ...current,
              existingLogId: saved.id,
              isModified: false
            });
          }
        });
        return next;
      });
    } else {
      setSaveFeedback({
        type: 'error',
        message: result.message
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Date Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-[#2F5597]" />
              <span>Input Massal &amp; Koreksi Presensi Harian</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Isi atau edit presensi seluruh guru/staf dalam satu tabel sekaligus (cocok untuk presensi susulan/lampau &amp; koreksi).
            </p>
          </div>

          {/* Date Picker Control & Refresh Button */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shrink-0">
            <div className="text-right">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Pilih Tanggal Presensi:
              </label>
              <span className="text-xs font-semibold text-[#2F5597]">
                {formatLongDateIndonesian(selectedDate)}
              </span>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F5597] shadow-sm cursor-pointer"
            />
            {onRefreshData && (
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  await onRefreshData();
                  setIsRefreshing(false);
                }}
                disabled={isRefreshing}
                className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                title="Muat Ulang Data Terkini dari Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#2F5597] ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Memuat...' : 'Sync Sheet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Friday Warning Banner */}
        {isHoliday && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <strong className="font-bold text-sm block">Hari Jumat (Sekolah Libur)</strong>
              <span>SMP Nurul Abror Al-Robbaniyin tidak melangsungkan kegiatan belajar mengajar pada hari Jumat. Data presensi tidak dapat dicatat untuk tanggal ini.</span>
            </div>
          </div>
        )}

        {/* Controls Bar: Search & Quick Fill */}
        <div className="mt-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
            {/* Search Name */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama atau jabatan..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>

            {/* Filter Jabatan */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedJabatan}
                onChange={(e) => setSelectedJabatan(e.target.value)}
                className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
              >
                <option value="Semua">Semua Jabatan ({masterList.length})</option>
                {jabatanOptions.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Helper Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleQuickFillOnTime}
              disabled={isHoliday}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Isi jam 07:00 & Tepat Waktu untuk yang belum terisi di tampilan"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Isi Otomatis (07:00 Tepat Waktu)</span>
            </button>

            <button
              onClick={handleResetCurrentDate}
              disabled={isHoliday}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kosongkan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Feedback Toast / Banner */}
      {saveFeedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-start gap-3 shadow-sm ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : saveFeedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {saveFeedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-bold">{saveFeedback.message}</p>
            {saveFeedback.inserted !== undefined && (
              <p className="text-xs mt-0.5 opacity-90">
                Rincian: {saveFeedback.inserted} data baru ditambahkan, {saveFeedback.updated} data diperbarui di Google Sheets.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Banner Clarification: Ketentuan Status Alpa & Wajib Hadir */}
      <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-950">
        <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Panduan Ketentuan Status "Alpa" &amp; Kewajiban Hadir Presensi</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-700 pt-1">
          <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200">
            <strong className="text-amber-900 block mb-1">1. Jabatan Struktural / Staf (Bendahara, OPS, Kesiswaan, TU, DLL):</strong>
            <span>Memiliki <u>Kewajiban Hadir Harian Sekolah</u>. Apabila berhalangan tanpa keterangan/surat (meskipun tidak ada jadwal mengajar), WAJIB diisi <strong>Alpa (Tidak Hadir Wajib)</strong> atau Izin/Dinas.</span>
          </div>
          <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200">
            <strong className="text-amber-900 block mb-1">2. Guru Murni (Tanpa Jabatan Staf):</strong>
            <span>Memiliki kewajiban hadir presensi pada hari yang memiliki <strong>Jadwal Mengajar</strong> (<code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">Mapel Hari Ini !== '-'</code>).</span>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Table Header Info */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-semibold text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span>Menampilkan <strong>{filteredList.length}</strong> orang</span>
            <span className="text-slate-300">|</span>
            <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              {filledCount} Terisi / Siap Simpan
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 px-2.5 py-1 rounded-lg">
              <input
                type="checkbox"
                checked={showAllUnscheduled}
                onChange={(e) => setShowAllUnscheduled(e.target.checked)}
                className="rounded border-slate-300 text-[#2F5597] focus:ring-[#2F5597]"
              />
              <span>Tampilkan semua (termasuk tanpa jadwal hari ini)</span>
            </label>
            <div className="text-slate-500 font-mono text-[11px] hidden md:block">
              Hari: <strong className="text-slate-800">{selectedHari}</strong>
            </div>
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider font-bold border-b border-slate-200">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4 min-w-[200px]">Nama Guru / Staf</th>
                <th className="py-3 px-4 min-w-[140px]">Jabatan</th>
                <th className="py-3 px-4 min-w-[160px]">Mapel Hari Ini ({selectedHari})</th>
                <th className="py-3 px-4 w-36">Jam Datang</th>
                <th className="py-3 px-4 w-44">Status Kehadiran</th>
                <th className="py-3 px-4 min-w-[180px]">Keterangan (Opsional)</th>
                <th className="py-3 px-4 w-28 text-center">Status Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                    Tidak ditemukan data guru/staf yang sesuai dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredList.map((m, index) => {
                  const state = rowStateMap.get(m.nama) || {
                    jamDatang: '',
                    status: '',
                    keterangan: '',
                    isModified: false
                  };

                  const scheduleEval = evaluateTeacherScheduleForDay(m, selectedHari, threshold, jadwalList, settings?.attendanceRuleOverrides);
                  const mapelHariIni = scheduleEval.hasTeachingSchedule ? scheduleEval.mapelHariIni : getMapelHariIni(m, selectedHari, jadwalList);
                  const isRegistered = !!state.existingLogId;

                  return (
                    <tr
                      key={`massal-${m.no || index}-${m.nama}-${index}`}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isRegistered ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* Nama */}
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{m.nama}</span>
                        </div>
                      </td>

                      {/* Jabatan */}
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {m.jabatan || '-'}
                        </span>
                      </td>

                      {/* Mapel Hari Ini */}
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {scheduleEval.sesiList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {scheduleEval.sesiList.map((s, sIdx) => (
                              <span
                                key={sIdx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-900 border border-blue-200"
                              >
                                <span className="font-mono text-[10px] text-blue-700 font-bold">{s.labelJam}:</span>
                                <span>{s.namaMapel}</span>
                                <span className="font-bold text-slate-700">({s.kelas})</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">{mapelHariIni}</span>
                        )}
                      </td>

                      {/* Jam Datang (Inline Input) */}
                      <td className="py-3 px-4">
                        <Time24hInput
                          size="sm"
                          disabled={isHoliday}
                          value={state.jamDatang}
                          placeholder="07:00 / 630"
                          onChange={(formatted) => handleJamDatangChange(m.nama, formatted)}
                        />
                      </td>

                      {/* Status (Inline Select) */}
                      <td className="py-3 px-4">
                        <select
                          disabled={isHoliday}
                          value={state.status}
                          onChange={(e) =>
                            handleStatusChange(m.nama, e.target.value as StatusPresensi | '')
                          }
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#2F5597] disabled:bg-slate-100 ${
                            state.status === 'Tepat Waktu'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : state.status === 'Terlambat'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : state.status === 'Cuti'
                              ? 'bg-teal-50 text-teal-800 border-teal-300'
                              : state.status === 'Izin' || state.status === 'Sakit'
                              ? 'bg-blue-50 text-blue-800 border-blue-300'
                              : state.status && state.status.includes('Alpa')
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : state.status === 'Dinas Luar'
                              ? 'bg-purple-50 text-purple-800 border-purple-300'
                              : 'bg-white text-slate-500 border-slate-300'
                          }`}
                        >
                          <option value="">-- Pilih Status --</option>
                          {STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Keterangan (Inline Text) */}
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          disabled={isHoliday}
                          value={state.keterangan}
                          onChange={(e) => handleKeteranganChange(m.nama, e.target.value)}
                          placeholder="Catatan/alasan..."
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F5597] disabled:bg-slate-100"
                        />
                      </td>

                      {/* Status Data (Registered / New / Unfilled) */}
                      <td className="py-3 px-4 text-center">
                        {isRegistered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <Edit3 className="w-3 h-3" />
                            <span>Ada di Sheets</span>
                          </span>
                        ) : state.jamDatang || state.status ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <UserCheck className="w-3 h-3" />
                            <span>Siap Simpan</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Belum Diisi</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Save Action Bar */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Ringkasan: </span>
            <span>
              {filledCount} orang akan disimpan ke Google Sheets (kombinasi Nama + Tanggal akan di-upsert otomatis).
            </span>
          </div>

          <button
            id="btn-simpan-semua-massal"
            onClick={handleSaveAll}
            disabled={isSaving || isHoliday || filledCount === 0}
            className="w-full sm:w-auto px-6 py-3 bg-[#2F5597] hover:bg-[#234278] disabled:bg-slate-300 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all shrink-0"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menyimpan ke Google Sheets...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-yellow-300" />
                <span>Simpan Semua Perubahan ({filledCount} Baris)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

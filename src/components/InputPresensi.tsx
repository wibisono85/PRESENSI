import React, { useState, useMemo } from 'react';
import { MasterGuruStaf, LogPresensi, StatusPresensi, HariSekolah, AppSettings, JadwalSlot, DataCutiRecord } from '../types';
import {
  formatDateISO,
  formatTimeHHMM,
  formatTimestamp,
  getHariFromDate,
  getMapelHariIni,
  formatLongDateIndonesian,
  isJumat
} from '../utils/dateUtils';
import { evaluateStatus24h } from '../utils/timeUtils';
import {
  evaluateTeacherAttendanceStatus,
  evaluateTeacherScheduleForDay,
  isTeacherWajibHadir,
  determineTeacherPeran
} from '../utils/scheduleTimeEvaluator';
import {
  JENIS_CUTI_OPTIONS,
  addCalendarDaysISO,
  enumerateSchoolDatesInRange,
  formatCutiKeterangan
} from '../utils/cutiUtils';
import { deriveCutiFromLogs } from '../utils/googleAppsScript';
import { Time24hInput } from './Time24hInput';
import {
  Clock,
  User,
  Briefcase,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Send,
  Calendar,
  FileText,
  Search,
  CalendarRange,
  Sparkles,
  Users,
  Info,
  Database,
  Trash2,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

type InputMode = 'quick' | 'manual' | 'cuti';

interface InputPresensiProps {
  masterList: MasterGuruStaf[];
  existingLogs: LogPresensi[];
  cutiList?: DataCutiRecord[];
  hasRemoteCutiSheet?: boolean;
  threshold: string;
  onSubmit: (log: LogPresensi) => Promise<{ success: boolean; message: string }>;
  onBatchSave?: (
    logsToSave: LogPresensi[]
  ) => Promise<{ success: boolean; message: string; updated?: number; inserted?: number }>;
  onSaveCuti?: (
    record: DataCutiRecord
  ) => Promise<{ success: boolean; syncedToSheet: boolean; needsScriptUpdate?: boolean; message: string }>;
  onDeleteCuti?: (
    record: DataCutiRecord,
    alsoDeleteLogs?: boolean
  ) => Promise<{ success: boolean; message: string }>;
  onSyncAllCuti?: (
    records: DataCutiRecord[]
  ) => Promise<{ success: boolean; syncedToSheet: boolean; needsScriptUpdate?: boolean; message: string }>;
  onNavigateToSetup?: () => void;
  preselectedTeacher?: string;
  initialMode?: InputMode;
  onClearPreselection?: () => void;
  settings?: AppSettings;
  jadwalList?: JadwalSlot[];
}

export const InputPresensi: React.FC<InputPresensiProps> = ({
  masterList,
  existingLogs,
  cutiList = [],
  hasRemoteCutiSheet = false,
  threshold,
  onSubmit,
  onBatchSave,
  onSaveCuti,
  onDeleteCuti,
  onSyncAllCuti,
  onNavigateToSetup,
  preselectedTeacher,
  initialMode = 'quick',
  onClearPreselection,
  settings,
  jadwalList
}) => {
  // Primary Mode State
  const [inputMode, setInputMode] = useState<InputMode>(initialMode);

  // Form state (Quick & Manual)
  const [selectedTanggal, setSelectedTanggal] = useState<string>(formatDateISO());
  const [selectedNama, setSelectedNama] = useState<string>(preselectedTeacher || '');
  const [customJam, setCustomJam] = useState<string>(formatTimeHHMM());
  const [selectedStatus, setSelectedStatus] = useState<StatusPresensi>('Tepat Waktu');
  const [keterangan, setKeterangan] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllTeachers, setShowAllTeachers] = useState<boolean>(false);

  // Cuti (Leave) Form State
  const [cutiJenisId, setCutiJenisId] = useState<string>('melahirkan');
  const [cutiCustomJenis, setCutiCustomJenis] = useState<string>('');
  const [cutiStartDate, setCutiStartDate] = useState<string>(formatDateISO());
  const [cutiEndDate, setCutiEndDate] = useState<string>(formatDateISO());
  const [cutiGuruPengganti, setCutiGuruPengganti] = useState<string>('');
  const [cutiNomorSurat, setCutiNomorSurat] = useState<string>('');
  const [cutiCatatan, setCutiCatatan] = useState<string>('');
  const [cutiScope, setCutiScope] = useState<'wajib_hadir' | 'semua_hari_sekolah'>('wajib_hadir');
  const [cutiConflictPolicy, setCutiConflictPolicy] = useState<'skip' | 'overwrite'>('skip');

  // UI status state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSyncingCuti, setIsSyncingCuti] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<LogPresensi | null>(null);
  const [confirmDeleteCutiId, setConfirmDeleteCutiId] = useState<string | null>(null);
  const [deletingCutiId, setDeletingCutiId] = useState<string | null>(null);
  const [needsScriptUpdateNotice, setNeedsScriptUpdateNotice] = useState<boolean>(false);

  // Sync if preselectedTeacher or initialMode prop changes
  React.useEffect(() => {
    if (preselectedTeacher) {
      setSelectedNama(preselectedTeacher);
      setToastMessage(null);
    }
  }, [preselectedTeacher]);

  React.useEffect(() => {
    if (initialMode) {
      setInputMode(initialMode);
    }
  }, [initialMode]);

  // Derived current day name & mapel
  const activeHari: HariSekolah = useMemo(() => {
    return getHariFromDate(selectedTanggal);
  }, [selectedTanggal]);

  // Teachers filtered according to schedule on active Hari (in Cuti mode, always allow picking any registered teacher/staff)
  const baseTeachersOnDay = useMemo(() => {
    if (inputMode === 'cuti' || showAllTeachers) return masterList;
    return masterList.filter((m) => isTeacherWajibHadir(m, activeHari, jadwalList, settings?.guruTanpaJadwalWajibHadir));
  }, [masterList, activeHari, showAllTeachers, jadwalList, settings, inputMode]);

  const selectedPersonData = useMemo(() => {
    return masterList.find((m) => m.nama === selectedNama) || null;
  }, [masterList, selectedNama]);

  const scheduleEvalResult = useMemo(() => {
    if (!selectedPersonData) return null;
    return evaluateTeacherScheduleForDay(selectedPersonData, activeHari, threshold, jadwalList);
  }, [selectedPersonData, activeHari, threshold, jadwalList]);

  const mapelHariIni = useMemo(() => {
    if (!selectedPersonData || !scheduleEvalResult) return '-';
    return scheduleEvalResult.hasTeachingSchedule
      ? scheduleEvalResult.mapelHariIni
      : getMapelHariIni(selectedPersonData, activeHari, jadwalList);
  }, [selectedPersonData, activeHari, scheduleEvalResult, jadwalList]);

  // Filter master list based on search query
  const filteredMasterList = useMemo(() => {
    if (!searchQuery.trim()) return baseTeachersOnDay;
    const q = searchQuery.toLowerCase();
    return baseTeachersOnDay.filter(
      (m) => m.nama.toLowerCase().includes(q) || m.jabatan.toLowerCase().includes(q)
    );
  }, [baseTeachersOnDay, searchQuery]);

  // Active Cuti preset object
  const selectedCutiPreset = useMemo(() => {
    return JENIS_CUTI_OPTIONS.find((opt) => opt.id === cutiJenisId) || JENIS_CUTI_OPTIONS[0];
  }, [cutiJenisId]);

  const activeCutiLabel = useMemo(() => {
    if (cutiJenisId === 'khusus' && cutiCustomJenis.trim()) {
      return `Cuti Khusus: ${cutiCustomJenis.trim()}`;
    }
    return selectedCutiPreset.label;
  }, [cutiJenisId, cutiCustomJenis, selectedCutiPreset]);

  // Preview multi-day Cuti dates & conflicts
  const cutiPlan = useMemo(() => {
    const rangeResult = enumerateSchoolDatesInRange(cutiStartDate, cutiEndDate, 180);
    if (!rangeResult.valid) {
      return {
        ...rangeResult,
        wajibDates: [] as typeof rangeResult.schoolDates,
        targetDates: [] as typeof rangeResult.schoolDates,
        conflictingDates: [] as LogPresensi[],
        finalSaveDates: [] as typeof rangeResult.schoolDates,
        teacherPeran: selectedPersonData ? determineTeacherPeran(selectedPersonData, jadwalList) : 'Guru'
      };
    }

    const teacherPeran = selectedPersonData ? determineTeacherPeran(selectedPersonData, jadwalList) : 'Guru';

    const wajibDates = selectedPersonData
      ? rangeResult.schoolDates.filter((d) =>
          isTeacherWajibHadir(selectedPersonData, d.hari, jadwalList, settings?.guruTanpaJadwalWajibHadir)
        )
      : rangeResult.schoolDates;

    const targetDates =
      cutiScope === 'wajib_hadir' && selectedPersonData
        ? wajibDates
        : rangeResult.schoolDates;

    const existingByDate = new Map<string, LogPresensi>();
    if (selectedPersonData) {
      const targetName = selectedPersonData.nama.trim().toLowerCase();
      existingLogs.forEach((l) => {
        if (l.nama.trim().toLowerCase() === targetName) {
          existingByDate.set(l.tanggal, l);
        }
      });
    }

    const conflictingDates: LogPresensi[] = [];
    const finalSaveDates: typeof rangeResult.schoolDates = [];

    for (const d of targetDates) {
      const conflict = existingByDate.get(d.tanggal);
      if (conflict) {
        conflictingDates.push(conflict);
        if (cutiConflictPolicy === 'overwrite') {
          finalSaveDates.push(d);
        }
      } else {
        finalSaveDates.push(d);
      }
    }

    return {
      ...rangeResult,
      wajibDates,
      targetDates,
      conflictingDates,
      finalSaveDates,
      teacherPeran
    };
  }, [
    cutiStartDate,
    cutiEndDate,
    cutiScope,
    cutiConflictPolicy,
    selectedPersonData,
    jadwalList,
    settings,
    existingLogs
  ]);

  const cutiKeteranganPreview = useMemo(() => {
    return formatCutiKeterangan({
      jenisCutiLabel: activeCutiLabel,
      tanggalMulai: cutiStartDate,
      tanggalSelesai: cutiEndDate,
      jumlahHariEfektif: cutiPlan.targetDates.length,
      guruPengganti: cutiGuruPengganti,
      nomorSurat: cutiNomorSurat,
      catatan: cutiCatatan
    });
  }, [
    activeCutiLabel,
    cutiStartDate,
    cutiEndDate,
    cutiPlan.targetDates.length,
    cutiGuruPengganti,
    cutiNomorSurat,
    cutiCatatan
  ]);

  // Combined Cuti records: explicit Data_Cuti + fallback derived from Log_Presensi (status === 'Cuti')
  const combinedCutiRecords = useMemo(() => {
    const derived = deriveCutiFromLogs(existingLogs, masterList);
    if (cutiList.length === 0) return derived;

    const merged = [...cutiList];
    for (const d of derived) {
      const targetName = d.nama.trim().toLowerCase();
      const alreadyCovered = cutiList.some(
        (c) =>
          c.nama.trim().toLowerCase() === targetName &&
          c.tanggalMulai <= d.tanggalSelesai &&
          c.tanggalSelesai >= d.tanggalMulai
      );
      if (!alreadyCovered) {
        merged.push(d);
      }
    }
    return merged.sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai));
  }, [cutiList, existingLogs, masterList]);

  // Handle Quick Submission ("Catat Jam Datang Sekarang")
  const handleQuickSubmit = async () => {
    if (!selectedNama) {
      setToastMessage({ type: 'error', text: 'Silakan pilih nama guru/staf terlebih dahulu.' });
      return;
    }

    if (isJumat(activeHari)) {
      setToastMessage({ type: 'error', text: 'Presensi tidak dapat dicatat pada hari Jumat (Sekolah Libur).' });
      return;
    }

    const currentJam = formatTimeHHMM();
    const evalResult = selectedPersonData
      ? evaluateTeacherAttendanceStatus(
          currentJam,
          selectedPersonData,
          activeHari,
          threshold,
          settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
          jadwalList,
          settings?.guruToleransiMenit || 0,
          settings?.guruTanpaJadwalWajibHadir || false
        )
      : { status: evaluateStatus24h(currentJam, threshold), isScheduleBased: false, thresholdUsed: threshold };
    const autoStatus = evalResult.status;

    const existingEntry = existingLogs.find(
      (l) => l.nama === selectedNama && l.tanggal === selectedTanggal
    );

    if (existingEntry && !duplicateWarning) {
      setDuplicateWarning(existingEntry);
      return;
    }

    await executeSave(currentJam, autoStatus, keterangan);
  };

  // Handle Manual Submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedNama) {
      setToastMessage({ type: 'error', text: 'Silakan pilih nama guru/staf terlebih dahulu.' });
      return;
    }

    if (isJumat(activeHari)) {
      setToastMessage({ type: 'error', text: 'Presensi tidak dapat dicatat pada hari Jumat (Sekolah Libur).' });
      return;
    }

    const existingEntry = existingLogs.find(
      (l) => l.nama === selectedNama && l.tanggal === selectedTanggal
    );

    if (existingEntry && !duplicateWarning) {
      setDuplicateWarning(existingEntry);
      return;
    }

    const isAbsence =
      selectedStatus === 'Cuti' ||
      selectedStatus === 'Izin' ||
      selectedStatus === 'Sakit' ||
      selectedStatus === 'Alpa' ||
      selectedStatus === 'Dinas Luar' ||
      selectedStatus.includes('Alpa');

    let finalKet = keterangan.trim();
    if (selectedStatus === 'Cuti' && !finalKet) {
      finalKet = `[${selectedCutiPreset.label}]`;
    } else if (selectedStatus === 'Cuti' && !finalKet.startsWith('[')) {
      finalKet = `[${selectedCutiPreset.label}] • ${finalKet}`;
    }

    await executeSave(isAbsence ? '-' : customJam || '-', selectedStatus, finalKet);
  };

  const executeSave = async (jam: string, status: StatusPresensi, ket: string) => {
    if (!selectedPersonData) return;

    setIsSubmitting(true);
    setToastMessage(null);

    let peranVal: string | undefined = undefined;
    let batasStafVal: string | undefined = undefined;
    let statusStafVal: string | undefined = undefined;
    let batasMengajarVal: string | undefined = undefined;
    let statusMengajarVal: string | undefined = undefined;

    const isManualAbsence =
      status === 'Cuti' ||
      status === 'Izin' ||
      status === 'Sakit' ||
      status === 'Alpa' ||
      status === 'Dinas Luar' ||
      status.includes('Alpa');

    if (!isManualAbsence && jam && jam !== '-') {
      const evalRes = evaluateTeacherAttendanceStatus(
        jam,
        selectedPersonData,
        activeHari,
        threshold,
        settings?.kebijakanKehadiran || 'instruksi_kepala_sekolah',
        jadwalList,
        settings?.guruToleransiMenit || 0,
        settings?.guruTanpaJadwalWajibHadir || false
      );
      peranVal = evalRes.peran;
      batasStafVal = evalRes.batasStaf || undefined;
      statusStafVal = evalRes.statusStaf || undefined;
      batasMengajarVal = evalRes.batasMengajar || undefined;
      statusMengajarVal = evalRes.statusMengajar || undefined;
    }

    const now = new Date();
    const newLog: LogPresensi = {
      id: `LOG-${Date.now()}`,
      timestamp: formatTimestamp(now),
      tanggal: selectedTanggal,
      hari: activeHari,
      nama: selectedPersonData.nama,
      jabatan: selectedPersonData.jabatan,
      mapelHariIni: mapelHariIni,
      jamDatang: isManualAbsence ? '-' : jam,
      status: status,
      keterangan: ket.trim(),
      peran: peranVal,
      batasStaf: batasStafVal,
      statusStaf: statusStafVal,
      batasMengajar: batasMengajarVal,
      statusMengajar: statusMengajarVal
    };

    const result = await onSubmit(newLog);

    if (result.success && status === 'Cuti' && onSaveCuti) {
      const cutiRec: DataCutiRecord = {
        id: `CUTI-REC-${Date.now()}`,
        waktuPengajuan: now.toISOString().replace('T', ' ').substring(0, 19),
        nama: selectedPersonData.nama,
        jabatan: selectedPersonData.jabatan,
        peran: determineTeacherPeran(selectedPersonData, jadwalList),
        jenisCuti: selectedCutiPreset.label,
        tanggalMulai: selectedTanggal,
        tanggalSelesai: selectedTanggal,
        jumlahHariEfektif: 1,
        cakupan: 'harian',
        guruPengganti: '-',
        nomorSurat: '-',
        catatan: ket.trim() || '-',
        statusPengajuan: 'Aktif'
      };
      const cutiSync = await onSaveCuti(cutiRec);
      if (cutiSync.needsScriptUpdate) {
        setNeedsScriptUpdateNotice(true);
      }
    }

    setIsSubmitting(false);
    setDuplicateWarning(null);

    if (result.success) {
      setToastMessage({ type: 'success', text: result.message });
      setSelectedNama('');
      setKeterangan('');
      setCustomJam(formatTimeHHMM());
      setSearchQuery('');
      if (onClearPreselection) onClearPreselection();
    } else {
      setToastMessage({ type: 'error', text: result.message });
    }
  };

  // Handle Multi-Day Cuti Submission
  const handleCutiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setToastMessage(null);

    if (!selectedPersonData) {
      setToastMessage({ type: 'error', text: 'Silakan pilih nama guru/staf yang akan mengajukan cuti terlebih dahulu.' });
      return;
    }

    if (!cutiPlan.valid) {
      setToastMessage({ type: 'error', text: cutiPlan.error || 'Rentang tanggal cuti tidak valid.' });
      return;
    }

    if (cutiPlan.finalSaveDates.length === 0) {
      setToastMessage({
        type: 'error',
        text:
          cutiPlan.conflictingDates.length > 0
            ? 'Semua hari efektif pada rentang tanggal ini sudah memiliki catatan presensi. Pilih opsi "Timpa dengan status Cuti" bila ingin memperbarui.'
            : 'Tidak ada hari efektif sekolah (selain hari Jumat / tanpa jadwal) pada rentang tanggal yang dipilih.'
      });
      return;
    }

    setIsSubmitting(true);

    const existingByDate = new Map<string, LogPresensi>();
    const targetName = selectedPersonData.nama.trim().toLowerCase();
    existingLogs.forEach((l) => {
      if (l.nama.trim().toLowerCase() === targetName) {
        existingByDate.set(l.tanggal, l);
      }
    });

    const nowTs = formatTimestamp();
    const peranGuru = determineTeacherPeran(selectedPersonData, jadwalList);

    const logsToSave: LogPresensi[] = cutiPlan.finalSaveDates.map((d, idx) => {
      const existing = existingByDate.get(d.tanggal);
      const schedEval = evaluateTeacherScheduleForDay(selectedPersonData, d.hari, threshold, jadwalList);
      const mapelOnDate = schedEval.hasTeachingSchedule
        ? schedEval.mapelHariIni
        : getMapelHariIni(selectedPersonData, d.hari, jadwalList);

      return {
        id: existing?.id || `CUTI-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: nowTs,
        tanggal: d.tanggal,
        hari: d.hari,
        nama: selectedPersonData.nama,
        jabatan: selectedPersonData.jabatan,
        mapelHariIni: mapelOnDate,
        jamDatang: '-',
        status: 'Cuti',
        keterangan: cutiKeteranganPreview,
        metodePresensi: 'Manual',
        peran: peranGuru
      };
    });

    let result: { success: boolean; message: string; inserted?: number; updated?: number };
    if (onBatchSave) {
      result = await onBatchSave(logsToSave);
    } else if (logsToSave.length === 1) {
      result = await onSubmit(logsToSave[0]);
    } else {
      result = { success: false, message: 'Handler simpan massal tidak tersedia.' };
    }

    let cutiSheetNote = '';
    if (result.success && onSaveCuti) {
      const cutiRecord: DataCutiRecord = {
        id: `CUTI-REC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        waktuPengajuan: nowTs,
        nama: selectedPersonData.nama,
        jabatan: selectedPersonData.jabatan,
        peran: peranGuru,
        jenisCuti: activeCutiLabel,
        tanggalMulai: cutiStartDate,
        tanggalSelesai: cutiEndDate,
        jumlahHariEfektif: logsToSave.length,
        cakupan: cutiScope,
        guruPengganti: cutiGuruPengganti.trim() || '-',
        nomorSurat: cutiNomorSurat.trim() || '-',
        catatan: cutiCatatan.trim() || '-',
        statusPengajuan: 'Aktif'
      };
      const cutiRes = await onSaveCuti(cutiRecord);
      if (!settings?.webAppUrl) {
        cutiSheetNote = ' (Tersimpan LOKAL di browser karena URL Web App belum diatur di Pengaturan Sheets).';
      } else if (cutiRes.syncedToSheet) {
        cutiSheetNote = ' Tercatat di Google Sheets: tab Data_Cuti & Log_Presensi.';
        setNeedsScriptUpdateNotice(false);
      } else if (cutiRes.needsScriptUpdate) {
        cutiSheetNote = ' Tercatat di Log_Presensi, namun tab Data_Cuti butuh update & Deploy New Version pada Code.gs.';
        setNeedsScriptUpdateNotice(true);
      } else {
        cutiSheetNote = ` Catatan Data_Cuti tersimpan lokal (${cutiRes.message}).`;
      }
    }

    setIsSubmitting(false);

    if (result.success) {
      const summaryDetail =
        result.inserted !== undefined || result.updated !== undefined
          ? ` (${result.inserted || 0} hari baru ditambahkan, ${result.updated || 0} diperbarui)`
          : ` (${logsToSave.length} hari efektif)`;
      setToastMessage({
        type: 'success',
        text: `Cuti "${activeCutiLabel}" untuk ${selectedPersonData.nama} berhasil dicatat${summaryDetail}.${cutiSheetNote}`
      });
      setSelectedNama('');
      setCutiGuruPengganti('');
      setCutiNomorSurat('');
      setCutiCatatan('');
      setCutiCustomJenis('');
      setSearchQuery('');
      if (onClearPreselection) onClearPreselection();
    } else {
      setToastMessage({ type: 'error', text: result.message });
    }
  };

  const handleSyncAllCutiClick = async () => {
    if (!onSyncAllCuti || combinedCutiRecords.length === 0) return;
    setIsSyncingCuti(true);
    setToastMessage(null);
    const res = await onSyncAllCuti(combinedCutiRecords);
    setIsSyncingCuti(false);
    if (res.needsScriptUpdate) {
      setNeedsScriptUpdateNotice(true);
    } else if (res.syncedToSheet) {
      setNeedsScriptUpdateNotice(false);
    }
    setToastMessage({
      type: res.success && res.syncedToSheet ? 'success' : 'error',
      text: res.message
    });
  };

  const handleConfirmDeleteCuti = async (rec: DataCutiRecord) => {
    if (!onDeleteCuti) return;
    setDeletingCutiId(rec.id);
    const res = await onDeleteCuti(rec, true);
    setDeletingCutiId(null);
    setConfirmDeleteCutiId(null);
    setToastMessage({
      type: res.success ? 'success' : 'error',
      text: res.message
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Date Header Card (Shown in Quick & Manual modes; Cuti mode has its own Date Range card below) */}
      {inputMode !== 'cuti' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#2F5597] uppercase tracking-wider">
                <Calendar className="w-4 h-4 text-[#2F5597]" />
                <span>Tanggal Presensi</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                {formatLongDateIndonesian(selectedTanggal)}
              </h2>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                id="tanggal-presensi"
                value={selectedTanggal}
                onChange={(e) => {
                  setSelectedTanggal(e.target.value);
                  setToastMessage(null);
                  setDuplicateWarning(null);
                }}
                className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-700 font-medium focus:ring-2 focus:ring-[#2F5597] focus:outline-none"
              />
            </div>
          </div>

          {/* Friday Warning */}
          {isJumat(activeHari) && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-xs sm:text-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sekolah Libur pada Hari Jumat!</span>
                <p className="text-rose-700 mt-0.5">
                  SMP Nurul Abror Al-Robbaniyin tidak menyelenggarakan kegiatan belajar mengajar pada hari Jumat.
                  Silakan pilih tanggal lain untuk mencatat kehadiran.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-teal-50 via-emerald-50/70 to-white rounded-2xl shadow-sm border border-teal-200 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-teal-600 text-white rounded-xl shadow-xs shrink-0">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-teal-950 tracking-tight">
                Pencatatan Cuti Guru &amp; Staf (1 Hari / Rentang Tanggal)
              </h2>
              <p className="text-xs text-teal-800 mt-0.5 leading-relaxed">
                Catat cuti melahirkan, ibadah Umroh/Haji, menikah, berduka, pemulihan sakit, atau cuti khusus sekaligus untuk beberapa hari. Hari Jumat (libur sekolah) dilewati otomatis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl shadow-sm border flex items-center justify-between gap-3 text-sm animate-in fade-in duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-black/5"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Duplicate Entry Confirmation Modal */}
      {duplicateWarning && inputMode !== 'cuti' && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3 text-amber-900">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-amber-950">Konfirmasi Dobel Input</h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-1">
                <span className="font-semibold">{duplicateWarning.nama}</span> sudah tercatat presensi pada{' '}
                <span className="font-semibold">{formatLongDateIndonesian(duplicateWarning.tanggal)}</span>{' '}
                jam <span className="font-semibold">{duplicateWarning.jamDatang}</span> (Status:{' '}
                <span className="font-semibold">{duplicateWarning.status}</span>).
              </p>
              <p className="text-xs text-amber-800 mt-1 font-medium">
                Apakah Anda ingin menyimpan catatan ini lagi sebagai entri tambahan?
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-amber-200">
            <button
              onClick={() => setDuplicateWarning(null)}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              onClick={() => {
                if (inputMode === 'manual') {
                  const isAbs =
                    selectedStatus === 'Cuti' ||
                    selectedStatus === 'Izin' ||
                    selectedStatus === 'Sakit' ||
                    selectedStatus === 'Alpa' ||
                    selectedStatus === 'Dinas Luar' ||
                    selectedStatus.includes('Alpa');
                  executeSave(isAbs ? '-' : customJam || '-', selectedStatus, keterangan);
                } else {
                  executeSave(formatTimeHHMM(), evaluateStatus24h(formatTimeHHMM(), threshold), keterangan);
                }
              }}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-sm"
            >
              Tetap Simpan Entri Baru
            </button>
          </div>
        </div>
      )}

      {/* Primary Input Form */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 space-y-6">
        {/* Mode Switcher Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setInputMode('quick');
              setToastMessage(null);
            }}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              inputMode === 'quick'
                ? 'bg-[#2F5597] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Tombol Cepat (Hadir)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInputMode('manual');
              setToastMessage(null);
            }}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              inputMode === 'manual'
                ? 'bg-[#2F5597] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Edit Jam / Status Manual</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInputMode('cuti');
              setToastMessage(null);
              setDuplicateWarning(null);
            }}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              inputMode === 'cuti'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-teal-800 hover:bg-teal-50'
            }`}
          >
            <CalendarRange className="w-4 h-4 shrink-0" />
            <span>Input Cuti (Multi-Hari)</span>
          </button>
        </div>

        {/* Step 1: Select Name */}
        <div className="space-y-2">
          <label id="label-pilih-nama" htmlFor="input-pilih-nama" className="block text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <User className="w-4 h-4 text-[#2F5597]" />
            <span>Pilih Nama Guru / Staf <span className="text-rose-500">*</span></span>
          </label>

          {/* Search filter input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Cari nama atau jabatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
            />
          </div>

          {/* Toggle Schedule Filter (only in Quick/Manual; Cuti mode shows all) */}
          {inputMode !== 'cuti' && (
            <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-medium hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={showAllTeachers}
                  onChange={(e) => setShowAllTeachers(e.target.checked)}
                  className="rounded border-slate-300 text-[#2F5597] focus:ring-[#2F5597]"
                />
                <span>Tampilkan semua (termasuk yang tidak ada jadwal hari ini)</span>
              </label>
              <span className="text-[11px] font-semibold text-[#2F5597] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {baseTeachersOnDay.length} orang aktif {activeHari}
              </span>
            </div>
          )}

          <select
            id="input-pilih-nama"
            value={selectedNama}
            onChange={(e) => {
              setSelectedNama(e.target.value);
              setToastMessage(null);
              setDuplicateWarning(null);
            }}
            disabled={inputMode !== 'cuti' && isJumat(activeHari)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-base text-slate-800 font-semibold focus:ring-2 focus:ring-[#2F5597] focus:outline-none disabled:opacity-50"
          >
            <option value="">-- Pilih Guru atau Staf --</option>
            {filteredMasterList.map((m, idx) => (
              <option key={`presensi-teacher-${m.no}-${m.nama}-${idx}`} value={m.nama}>
                {m.nama} ({m.jabatan})
              </option>
            ))}
          </select>
        </div>

        {/* Person Info Card (Auto-filled) */}
        {selectedPersonData && (
          <div className="bg-gradient-to-r from-blue-50/70 to-slate-50 border border-blue-200/80 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#2F5597] shrink-0" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jabatan:</span>
                <span className="text-sm font-bold text-slate-800">{selectedPersonData.jabatan}</span>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white border border-blue-200 text-[#2F5597] w-fit">
                Peran: {determineTeacherPeran(selectedPersonData, jadwalList)}
              </span>
            </div>

            {inputMode !== 'cuti' && (
              <div className="flex items-start gap-2 border-t border-blue-100 pt-2.5">
                <BookOpen className="w-4 h-4 text-[#2F5597] shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Mapel Hari Ini ({activeHari}):
                  </span>
                  <div className="mt-1">
                    {mapelHariIni === '-' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                        Tidak ada jadwal mengajar hari ini
                      </span>
                    ) : scheduleEvalResult?.sesiList && scheduleEvalResult.sesiList.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {scheduleEvalResult.sesiList.map((s, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200"
                          >
                            <span className="px-1.5 py-0.5 rounded bg-[#2F5597] text-white text-[10px] font-mono font-bold">
                              {s.labelJam}
                            </span>
                            <span>{s.namaMapel}</span>
                            <span className="text-blue-700">({s.kelas})</span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {s.jamMulai}-{s.jamSelesai}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs sm:text-sm font-bold bg-blue-100 text-[#2F5597]">
                        {mapelHariIni}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODE 1: QUICK BUTTON */}
        {inputMode === 'quick' && (
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <button
              type="button"
              id="btn-catat-sekarang"
              disabled={!selectedNama || isSubmitting || isJumat(activeHari)}
              onClick={handleQuickSubmit}
              className="w-full py-4 px-6 bg-[#2F5597] hover:bg-[#244378] text-white font-bold text-base sm:text-lg rounded-2xl shadow-md transition-all flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock className="w-6 h-6 text-yellow-300 animate-pulse" />
              <span>Catat Jam Datang Sekarang ({formatTimeHHMM()})</span>
            </button>
            <p className="text-xs text-center text-slate-500">
              Status otomatis: <span className="font-semibold text-emerald-700">Tepat Waktu</span> (sebelum {threshold}) atau <span className="font-semibold text-amber-700">Terlambat</span> (setelah {threshold}).
            </p>
          </div>
        )}

        {/* MODE 2: CUSTOM MANUAL FORM */}
        {inputMode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Custom Time */}
              <div>
                <label htmlFor="input-jam-datang" className="block text-xs font-bold text-slate-700 mb-1">
                  Jam Datang (24 Jam)
                </label>
                <Time24hInput
                  id="input-jam-datang"
                  value={customJam}
                  disabled={selectedStatus === 'Cuti' || selectedStatus === 'Izin' || selectedStatus === 'Sakit' || selectedStatus === 'Dinas Luar' || selectedStatus.includes('Alpa')}
                  onChange={(formatted, isValid) => {
                    setCustomJam(formatted);
                    if (isValid && formatted) {
                      const autoStatus = evaluateStatus24h(formatted, threshold);
                      setSelectedStatus(autoStatus);
                    }
                  }}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Ketik angka misal 630 &rarr; 06:30. Otomatis dikosongkan untuk status Izin/Sakit/Cuti/Alpa.
                </span>
              </div>

              {/* Status Dropdown */}
              <div>
                <label htmlFor="input-status" className="block text-xs font-bold text-slate-700 mb-1">
                  Status Kehadiran
                </label>
                <select
                  id="input-status"
                  value={selectedStatus}
                  onChange={(e) => {
                    const nextSt = e.target.value as StatusPresensi;
                    setSelectedStatus(nextSt);
                    if (['Cuti', 'Izin', 'Sakit', 'Dinas Luar', 'Alpa', 'Alpa (Jadwal Mengajar)', 'Alpa (Wajib Hadir Staf)'].includes(nextSt)) {
                      setCustomJam('');
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#2F5597]"
                >
                  <option value="Tepat Waktu">Tepat Waktu</option>
                  <option value="Terlambat">Terlambat</option>
                  <option value="Izin">Izin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Cuti">Cuti (Melahirkan, Umroh, Tahunan, Khusus)</option>
                  <option value="Dinas Luar">Dinas Luar</option>
                  <option value="Alpa (Jadwal Mengajar)">Alpa (Jadwal Mengajar - Guru)</option>
                  <option value="Alpa (Wajib Hadir Staf)">Alpa (Wajib Hadir Staf/Struktural)</option>
                  <option value="Alpa">Alpa (Umum)</option>
                </select>
              </div>
            </div>

            {/* Extra Cuti Quick-Pick when Cuti selected in Manual Mode */}
            {selectedStatus === 'Cuti' && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-teal-900">
                    Pilih Jenis Cuti (1 Hari):
                  </label>
                  <button
                    type="button"
                    onClick={() => setInputMode('cuti')}
                    className="text-[11px] font-bold text-teal-700 hover:underline"
                  >
                    Butuh input Cuti lebih dari 1 hari (misal Melahirkan / Umroh)? Buka Form Multi-Hari &rarr;
                  </button>
                </div>
                <select
                  value={cutiJenisId}
                  onChange={(e) => setCutiJenisId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-xs font-semibold text-slate-800"
                >
                  {JENIS_CUTI_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Keterangan */}
            <div>
              <label htmlFor="input-keterangan" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                <span>Keterangan / Alasan (Opsional)</span>
              </label>
              <input
                type="text"
                id="input-keterangan"
                placeholder={
                  selectedStatus === 'Cuti'
                    ? 'Misal: Guru pengganti Ust. Ahmad, Surat izin Kepala Sekolah'
                    : 'Misal: Sakit demam, Izin acara keluarga, Dinas luar MGMP'
                }
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>

            {/* Submit Manual */}
            <button
              type="submit"
              id="btn-simpan-manual"
              disabled={!selectedNama || isSubmitting || isJumat(activeHari)}
              className="w-full py-3 px-4 bg-[#2F5597] hover:bg-[#244378] text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Simpan Presensi Manual</span>
            </button>
          </form>
        )}

        {/* MODE 3: DEDICATED MULTI-DAY CUTI FORM */}
        {inputMode === 'cuti' && (
          <form onSubmit={handleCutiSubmit} className="space-y-5 bg-teal-50/40 p-4 sm:p-5 rounded-2xl border border-teal-200">
            {/* Jenis Cuti */}
            <div className="space-y-2">
              <label htmlFor="cuti-jenis" className="block text-xs font-bold text-teal-950 uppercase tracking-wider">
                1. Jenis / Kategori Cuti Sekolah <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {JENIS_CUTI_OPTIONS.map((opt) => {
                  const isActive = cutiJenisId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCutiJenisId(opt.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs">{opt.label}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          ~{opt.defaultDays} hari
                        </span>
                      </div>
                      <p className={`text-[11px] mt-1 leading-snug ${isActive ? 'text-teal-50' : 'text-slate-500'}`}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {cutiJenisId === 'khusus' && (
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Sebutkan alasan cuti khusus (misal: Pendampingan keluarga operasi, Wisuda anak, dll)..."
                    value={cutiCustomJenis}
                    onChange={(e) => setCutiCustomJenis(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-teal-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              )}
            </div>

            {/* Rentang Tanggal Cuti */}
            <div className="space-y-2 pt-2 border-t border-teal-200/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-bold text-teal-950 uppercase tracking-wider">
                  2. Rentang Tanggal Cuti <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const baseStart = cutiStartDate || formatDateISO();
                    const endISO = addCalendarDaysISO(baseStart, Math.max(0, selectedCutiPreset.defaultDays - 1));
                    setCutiStartDate(baseStart);
                    setCutiEndDate(endISO);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg text-[11px] font-bold transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-teal-600" />
                  <span>Isi Estimasi {selectedCutiPreset.shortLabel} ({selectedCutiPreset.defaultDays} Hari Kalender)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cuti-start-date" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tanggal Mulai Cuti
                  </label>
                  <input
                    type="date"
                    id="cuti-start-date"
                    value={cutiStartDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setCutiStartDate(nextStart);
                      if (cutiEndDate < nextStart) {
                        setCutiEndDate(nextStart);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label htmlFor="cuti-end-date" className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tanggal Selesai Cuti
                  </label>
                  <input
                    type="date"
                    id="cuti-end-date"
                    value={cutiEndDate}
                    min={cutiStartDate}
                    onChange={(e) => setCutiEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              {/* Scope & Conflict Options */}
              <div className="bg-white rounded-xl border border-teal-200 p-3 space-y-3 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block mb-1.5">
                    Cakupan Pencatatan Hari Sekolah:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${
                      cutiScope === 'wajib_hadir' ? 'bg-teal-50 border-teal-400' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="cuti-scope"
                        checked={cutiScope === 'wajib_hadir'}
                        onChange={() => setCutiScope('wajib_hadir')}
                        className="mt-0.5 text-teal-600 focus:ring-teal-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block">Sesuai Hari Wajib Hadir</span>
                        <span className="text-[10.5px] text-slate-500">
                          Hanya hari yang ada jadwal mengajar / wajib hadir staf ({cutiPlan.wajibDates.length} hari).
                        </span>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${
                      cutiScope === 'semua_hari_sekolah' ? 'bg-teal-50 border-teal-400' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="cuti-scope"
                        checked={cutiScope === 'semua_hari_sekolah'}
                        onChange={() => setCutiScope('semua_hari_sekolah')}
                        className="mt-0.5 text-teal-600 focus:ring-teal-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block">Semua Hari Sekolah (Sabtu–Kamis)</span>
                        <span className="text-[10.5px] text-slate-500">
                          Seluruh hari aktif kecuali Jumat ({cutiPlan.schoolDates.length} hari).
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {cutiPlan.conflictingDates.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center gap-1.5 text-amber-800 font-bold mb-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        Ditemukan {cutiPlan.conflictingDates.length} tanggal yang sudah punya catatan presensi:
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                        <input
                          type="radio"
                          name="cuti-conflict"
                          checked={cutiConflictPolicy === 'skip'}
                          onChange={() => setCutiConflictPolicy('skip')}
                          className="text-teal-600"
                        />
                        <span>Lewati tanggal yang sudah terisi</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-amber-800">
                        <input
                          type="radio"
                          name="cuti-conflict"
                          checked={cutiConflictPolicy === 'overwrite'}
                          onChange={() => setCutiConflictPolicy('overwrite')}
                          className="text-amber-600"
                        />
                        <span>Timpa dengan status Cuti</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Summary Bar */}
                {cutiPlan.valid ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">
                      Kalender: {cutiPlan.totalCalendarDays} hari
                    </span>
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded font-semibold">
                      Jumat Libur Dilewati: {cutiPlan.skippedFridays} hari
                    </span>
                    <span className="px-2 py-0.5 bg-teal-100 text-teal-900 rounded font-extrabold">
                      Akan Disimpan: {cutiPlan.finalSaveDates.length} hari efektif
                    </span>
                  </div>
                ) : (
                  <div className="text-rose-700 font-bold text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{cutiPlan.error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Detail Pengganti & Surat */}
            <div className="space-y-3 pt-2 border-t border-teal-200/70">
              <label className="block text-xs font-bold text-teal-950 uppercase tracking-wider">
                3. Informasi Pengganti Mengajar &amp; Administrasi Surat (Opsional)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cuti-pengganti" className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-teal-700" />
                    <span>Guru Pengganti / Titip Tugas Kelas</span>
                  </label>
                  <input
                    type="text"
                    id="cuti-pengganti"
                    placeholder="Misal: Ust. Ahmad (VII A-D) / Tugas LKS"
                    value={cutiGuruPengganti}
                    onChange={(e) => setCutiGuruPengganti(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label htmlFor="cuti-nomor-surat" className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-teal-700" />
                    <span>Nomor Surat / Persetujuan Kepala Sekolah</span>
                  </label>
                  <input
                    type="text"
                    id="cuti-nomor-surat"
                    placeholder="Misal: Disetujui Kepsek / 012/CUTI/XI/2026"
                    value={cutiNomorSurat}
                    onChange={(e) => setCutiNomorSurat(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cuti-catatan" className="block text-[11px] font-bold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  id="cuti-catatan"
                  placeholder="Misal: Melahirkan anak ke-2, Umroh bersama keluarga, dll."
                  value={cutiCatatan}
                  onChange={(e) => setCutiCatatan(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* Preview Keterangan */}
              <div className="p-3 bg-white border border-teal-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-teal-900 block">Pratinjau Catatan di Log Presensi:</span>
                  <span className="font-mono text-[10.5px] text-slate-700 break-words">{cutiKeteranganPreview}</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              id="btn-simpan-cuti"
              disabled={!selectedPersonData || isSubmitting || !cutiPlan.valid || cutiPlan.finalSaveDates.length === 0}
              className="w-full py-3.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CalendarRange className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Menyimpan Data Cuti...'
                  : `Simpan Cuti (${cutiPlan.finalSaveDates.length} Hari Efektif)`}
              </span>
            </button>
          </form>
        )}
      </div>

      {/* Database Storage Info & Recorded Leave History (Shown in Cuti Mode) */}
      {inputMode === 'cuti' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-50 text-teal-700 rounded-xl border border-teal-200">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-800">
                  Daftar &amp; Riwayat Cuti Tercatat ({combinedCutiRecords.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tersimpan di Google Sheets pada tab <code className="font-mono font-bold text-teal-800 bg-teal-50 px-1 rounded">Data_Cuti</code> (ringkasan) &amp; <code className="font-mono font-bold text-slate-700 bg-slate-100 px-1 rounded">Log_Presensi</code> (status harian).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {settings?.webAppUrl && onSyncAllCuti && combinedCutiRecords.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncAllCutiClick}
                  disabled={isSyncingCuti}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCuti ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCuti ? 'Menyinkronkan...' : 'Sinkronkan Data_Cuti & Log_Presensi'}</span>
                </button>
              )}

              {settings?.sheetUrl && (
                <a
                  href={settings.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold shrink-0 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Google Sheet</span>
                </a>
              )}
            </div>
          </div>

          {/* Code.gs update notice if connected to older Apps Script */}
          {settings?.webAppUrl && (!hasRemoteCutiSheet || needsScriptUpdateNotice) && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Tab Data_Cuti Belum Aktif / Belum Deploy Versi Baru</span>
                  <span className="text-[11px] text-amber-800 leading-relaxed block mt-0.5">
                    Jika Anda sudah menempel kode <code className="font-mono font-bold">Code.gs</code> terbaru, pastikan Anda sudah melakukan <strong>Deploy &gt; Manage deployments &gt; Edit (ikon pensil) &gt; Versi: New version &gt; Deploy</strong> (bukan hanya klik Save), lalu klik tombol <strong>Sinkronkan Data_Cuti &amp; Log_Presensi</strong> di atas.
                  </span>
                </div>
              </div>
              {onNavigateToSetup && (
                <button
                  type="button"
                  onClick={onNavigateToSetup}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] shrink-0 transition"
                >
                  Buka Code.gs &rarr;
                </button>
              )}
            </div>
          )}

          {!settings?.webAppUrl && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Mode Lokal/Demo: URL Google Apps Script belum diisi di menu <strong>Pengaturan Sheets</strong>, sehingga data sementara tersimpan di browser ini.
              </span>
            </div>
          )}

          {settings?.webAppUrl &&
            hasRemoteCutiSheet &&
            combinedCutiRecords.some((rec) => {
              const norm = rec.nama.trim().toLowerCase();
              return !existingLogs.some(
                (l) =>
                  l.status === 'Cuti' &&
                  l.nama.trim().toLowerCase() === norm &&
                  l.tanggal >= rec.tanggalMulai &&
                  l.tanggal <= rec.tanggalSelesai
              );
            }) && (
              <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl flex items-start gap-2.5 text-xs text-sky-900">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Ada catatan cuti di Data_Cuti yang belum memiliki baris harian di Log_Presensi</span>
                  <span className="text-[11px] text-sky-800 block mt-0.5">
                    Klik tombol <strong>Sinkronkan Data_Cuti &amp; Log_Presensi</strong> di atas untuk otomatis membuatkan catatan harian berstatus <strong>Cuti</strong> ke sheet <code className="font-mono font-bold">Log_Presensi</code>.
                  </span>
                </div>
              </div>
            )}

          {combinedCutiRecords.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Belum ada catatan cuti guru atau staf yang tersimpan.
            </div>
          ) : (
            <div className="space-y-2.5">
              {combinedCutiRecords.map((rec) => {
                const isConfirming = confirmDeleteCutiId === rec.id;
                const isDeleting = deletingCutiId === rec.id;
                const normRecName = rec.nama.trim().toLowerCase();
                const isSyncedToRemoteSheet =
                  Boolean(settings?.webAppUrl) &&
                  hasRemoteCutiSheet &&
                  cutiList.some(
                    (c) =>
                      c.id === rec.id ||
                      (c.nama.trim().toLowerCase() === normRecName &&
                        c.tanggalMulai === rec.tanggalMulai &&
                        c.tanggalSelesai === rec.tanggalSelesai)
                  );
                const syncedLogCount = existingLogs.filter(
                  (l) =>
                    l.status === 'Cuti' &&
                    l.nama.trim().toLowerCase() === normRecName &&
                    l.tanggal >= rec.tanggalMulai &&
                    l.tanggal <= rec.tanggalSelesai
                ).length;
                return (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{rec.nama}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                          {rec.jenisCuti}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/70 text-slate-700">
                          {rec.jumlahHariEfektif} hari efektif
                        </span>
                        {settings?.webAppUrl ? (
                          <>
                            {isSyncedToRemoteSheet ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Tersinkron di Data_Cuti
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Belum di sheet Data_Cuti
                              </span>
                            )}
                            {syncedLogCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                                Log_Presensi: {syncedLogCount} hari
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Belum di Log_Presensi
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Tersimpan Lokal
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-slate-800">
                          {rec.tanggalMulai === rec.tanggalSelesai
                            ? formatLongDateIndonesian(rec.tanggalMulai)
                            : `${formatLongDateIndonesian(rec.tanggalMulai)} s/d ${formatLongDateIndonesian(rec.tanggalSelesai)}`}
                        </span>
                        {rec.guruPengganti && rec.guruPengganti !== '-' && (
                          <span className="text-teal-800">
                            Pengganti: <strong>{rec.guruPengganti}</strong>
                          </span>
                        )}
                        {rec.nomorSurat && rec.nomorSurat !== '-' && (
                          <span className="text-slate-600">
                            Surat: <strong>{rec.nomorSurat}</strong>
                          </span>
                        )}
                      </div>

                      {rec.catatan && rec.catatan !== '-' && (
                        <p className="text-[11px] text-slate-500 italic">{rec.catatan}</p>
                      )}
                    </div>

                    {onDeleteCuti && (
                      <div className="flex items-center gap-2 shrink-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg">
                            <span className="text-[11px] font-bold text-rose-800">Hapus cuti &amp; log hariannya?</span>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleConfirmDeleteCuti(rec)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold disabled:opacity-50"
                            >
                              {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteCutiId(null)}
                              className="px-2 py-1 bg-white border border-slate-300 text-slate-700 rounded text-[10px] font-bold"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCutiId(rec.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition"
                            title="Hapus catatan cuti ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

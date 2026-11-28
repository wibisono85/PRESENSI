import React, { useState, useEffect } from 'react';
import {
  MasterGuruStaf,
  LogPresensi,
  AppSettings,
  StatusPresensi,
  HariSekolah,
  JadwalSlot,
  DataCutiRecord
} from '../types';
import {
  calculateDistanceMeters,
  validateSchoolQr,
  findTeacherByQrCode,
  cleanTeacherName,
  playSuccessChime,
  playErrorBeep,
  checkDeviceLock,
  recordDeviceLock,
  saveTeacherProfile,
  DEFAULT_SCHOOL_COORDS,
  normalizeCoordinate
} from '../utils/qrAndGeoUtils';
import { getHariFromDate, formatDateISO, formatTimeHHMM, formatLongDateIndonesian } from '../utils/dateUtils';
import { evaluateStatus24h, parseAndFormat24hTime, timeToMinutes, minutesToTime } from '../utils/timeUtils';
import { evaluateTeacherAttendanceStatus, evaluateTeacherScheduleForDay, determineTeacherPeran, isTeacherWajibHadir, resolveTeacherAttendanceRule, isGuruBkJabatan } from '../utils/scheduleTimeEvaluator';
import { computeTeacherAutoAlpaDeadline } from '../utils/autoAlpaUtils';
import { findActiveCutiForTeacher, formatSubstituteAttendanceNote, getSubstitutedSchedulesForDay } from '../utils/cutiUtils';
import { getMasterDataSourceLabel, getRawMapelByDay, verifyPinRemote, DEFAULT_WHATSAPP_GROUP_URL } from '../utils/googleAppsScript';
import { buildMapelString, isJadwalTidakDitemukan } from '../utils/jadwalEngine';
import { QrCameraScanner } from './QrCameraScanner';
import { TeacherIdCard } from './TeacherIdCard';
import { JadwalPelajaranView } from './JadwalPelajaranView';
import {
  Camera,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  UserCheck,
  QrCode,
  Globe,
  CreditCard,
  X,
  Navigation,
  Sliders,
  Key,
  Check,
  ExternalLink,
  BookOpen,
  CalendarDays,
  ChevronUp,
  Send,
  Copy,
  MessageSquare,
  FileText
} from 'lucide-react';

interface MobileSelfPresensiProps {
  masterList: MasterGuruStaf[];
  existingLogs: LogPresensi[];
  cutiList?: DataCutiRecord[];
  settings: AppSettings;
  isAdmin?: boolean;
  selectedTeacherName: string;
  onSelectTeacherName: (nama: string) => void;
  onSaveLog: (log: LogPresensi) => Promise<{ success: boolean; message: string; id?: string }>;
  onSaveSettings?: (settings: Partial<AppSettings>) => Promise<void>;
  onOpenGpsSettings?: () => void;
  jadwalList?: JadwalSlot[];
}

export const MobileSelfPresensi: React.FC<MobileSelfPresensiProps> = ({
  masterList,
  existingLogs,
  cutiList = [],
  settings,
  isAdmin = false,
  selectedTeacherName,
  onSelectTeacherName,
  onSaveLog,
  onSaveSettings,
  onOpenGpsSettings,
  jadwalList
}) => {
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'locating' | 'success' | 'error' | 'denied'>('locating');
  const [geoErrorMsg, setGeoErrorMsg] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [scannedViaGoogleLens, setScannedViaGoogleLens] = useState<string | null>(null);
  const [showMyIdCard, setShowMyIdCard] = useState<boolean>(false);
  const [showClassSchedulesModal, setShowClassSchedulesModal] = useState<boolean>(false);
  const [showGpsDetails, setShowGpsDetails] = useState<boolean>(false);
  const [pinPromptAction, setPinPromptAction] = useState<'reset_school' | 'use_current_gps' | 'toggle_gps' | null>(null);
  const [inputAdminPin, setInputAdminPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isGpsActionLoading, setIsGpsActionLoading] = useState<boolean>(false);
  const [gpsActionSuccess, setGpsActionSuccess] = useState<string>('');
  const [resultModal, setResultModal] = useState<{
    status: 'success' | 'error' | 'warning';
    title: string;
    message: string;
    jam?: string;
    statusPresensi?: StatusPresensi;
  } | null>(null);

  const todayISO = formatDateISO();
  const hariIni = getHariFromDate(todayISO) as HariSekolah;
  const [viewingHari, setViewingHari] = useState<HariSekolah>(hariIni);
  const [showWeeklySchedule, setShowWeeklySchedule] = useState<boolean>(false);

  // Remote Izin / Sakit / Dinas Luar (tanpa GPS) state
  const [showAbsenceModal, setShowAbsenceModal] = useState<boolean>(false);
  const [absenceType, setAbsenceType] = useState<'Izin' | 'Sakit' | 'Dinas Luar'>('Izin');
  const [absenceReason, setAbsenceReason] = useState<string>('');
  const [absenceTask, setAbsenceTask] = useState<string>('');
  const [absenceError, setAbsenceError] = useState<string>('');
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState<boolean>(false);
  const [absenceSavedLog, setAbsenceSavedLog] = useState<LogPresensi | null>(null);
  const [waCopied, setWaCopied] = useState<boolean>(false);

  // Sync viewingHari if hariIni changes
  useEffect(() => {
    setViewingHari(hariIni);
  }, [hariIni]);

  // 1. Check URL parameters on mount (when opened via Google Lens / Phone Camera QR scan)
  useEffect(() => {
    if (typeof window === 'undefined' || masterList.length === 0) return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const kodeParam = urlParams.get('kode');
      const namaParam = urlParams.get('nama') || urlParams.get('guru');

      let matched: MasterGuruStaf | undefined = undefined;

      if (kodeParam || namaParam) {
        matched = findTeacherByQrCode(window.location.href, masterList);
      }

      if (matched) {
        onSelectTeacherName(matched.nama);
        saveTeacherProfile(matched.nama);
        setScannedViaGoogleLens(matched.nama);
      }
    } catch (e) {
      console.log('Error parsing URL params:', e);
    }
  }, [masterList, onSelectTeacherName]);

  // Live digital clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const hhmm = formatTimeHHMM(d);
      const ss = String(d.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${hhmm}:${ss}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Selected teacher details with title-tolerant matching (e.g. Ahmad Zaini, M.Pd vs Ahmad Zaini, S.Pd.I, M.Pd)
  const teacher =
    masterList.find(m => m.nama === selectedTeacherName) ||
    masterList.find(m => cleanTeacherName(m.nama) === cleanTeacherName(selectedTeacherName));

  // Today's schedule for teacher
  const mapelHariIni = teacher ? buildMapelString(teacher, hariIni, jadwalList) : '-';

  // Active schedule evaluation & customized threshold for this teacher today
  const ruleInfo = teacher
    ? resolveTeacherAttendanceRule(teacher, jadwalList, undefined, settings.attendanceRuleOverrides)
    : null;
  const scheduleEval = teacher
    ? evaluateTeacherScheduleForDay(teacher, hariIni, settings.jamMasukThreshold || '07:25', jadwalList, settings.attendanceRuleOverrides)
    : null;
  const autoAlpaInfo = teacher
    ? computeTeacherAutoAlpaDeadline(teacher, hariIni, settings, jadwalList)
    : null;

  const schoolThresholdDefault = settings.jamMasukThreshold || '07:25';
  const hasTeachingTodayMain = Boolean(scheduleEval?.hasTeachingSchedule && scheduleEval.sesiList.length > 0);
  const personalBatasGuru = scheduleEval?.firstScheduleTime
    ? minutesToTime(Math.max(0, (timeToMinutes(scheduleEval.firstScheduleTime) ?? 450) - (settings.guruToleransiMenit || 0)))
    : null;

  const activeThreshold = (() => {
    if (!teacher || !ruleInfo) return schoolThresholdDefault;
    if (ruleInfo.ruleMode === 'sesuai_jadwal') {
      if (hasTeachingTodayMain && personalBatasGuru) return personalBatasGuru;
      return schoolThresholdDefault;
    }
    return schoolThresholdDefault;
  })();

  // Schedule evaluation for the day currently being viewed/inspected in the UI
  const viewingScheduleEval = teacher
    ? evaluateTeacherScheduleForDay(teacher, viewingHari, schoolThresholdDefault, jadwalList, settings.attendanceRuleOverrides)
    : null;

  // Substituted teacher schedules for the day being viewed (for both internal & external substitutes)
  const substitutedSchedulesForViewingDay = teacher
    ? getSubstitutedSchedulesForDay({
        teacher,
        masterList,
        hari: viewingHari,
        threshold: schoolThresholdDefault,
        jadwalList,
        attendanceRuleOverrides: settings.attendanceRuleOverrides
      })
    : [];

  // Today's attendance log & active Cuti check for this teacher
  const todayLog = existingLogs.find(
    l => l.nama.trim().toLowerCase() === selectedTeacherName.trim().toLowerCase() && l.tanggal === todayISO
  );
  const activeCutiToday = teacher
    ? findActiveCutiForTeacher(teacher.nama, todayISO, cutiList, existingLogs)
    : null;

  const expectedEval = todayLog && teacher
    ? evaluateTeacherAttendanceStatus(
        todayLog.jamDatang,
        teacher,
        hariIni,
        schoolThresholdDefault,
        settings.kebijakanKehadiran || 'instruksi_kepala_sekolah',
        jadwalList,
        settings.guruToleransiMenit || 0,
        settings.guruTanpaJadwalWajibHadir || false,
        undefined,
        settings.attendanceRuleOverrides
      )
    : null;
  const expectedStatusForTodayLog = expectedEval?.status || null;
  const effectiveTodayThreshold = expectedEval?.thresholdUsed || activeThreshold;
  const isStatusMismatched = Boolean(
    todayLog &&
    todayLog.status === 'Terlambat' &&
    expectedStatusForTodayLog === 'Tepat Waktu'
  );

  // Teacher's live quota usage for current period (Bulanan / Semester)
  const teacherQuotaSummary = (() => {
    const maxIzin = settings.quotaIzin ?? 3;
    const maxSakit = settings.quotaSakit ?? 5;
    const maxDinas = settings.quotaDinasLuar ?? 5;
    const maxAlpa = settings.quotaAlpa ?? 1;
    const periodeMode = settings.quotaPeriode || 'Bulanan';
    const currentMonth = todayISO.slice(0, 7);
    const periodStart = periodeMode === 'Bulanan'
      ? `${currentMonth}-01`
      : (settings.quotaTanggalMulai || `${todayISO.slice(0, 4)}-07-01`);
    const periodEnd = periodeMode === 'Bulanan' ? `${currentMonth}-31` : todayISO;
    const periodLabel = periodeMode === 'Bulanan'
      ? new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      : 'Semester Berjalan';

    let izin = 0;
    let sakit = 0;
    let dinas = 0;
    let alpa = 0;

    if (teacher) {
      const targetClean = cleanTeacherName(teacher.nama);
      for (const l of existingLogs) {
        if (!l.tanggal || l.tanggal < periodStart || l.tanggal > periodEnd) continue;
        const lClean = cleanTeacherName(l.nama);
        if (lClean !== targetClean && l.nama.trim().toLowerCase() !== teacher.nama.trim().toLowerCase()) continue;
        if (l.status === 'Izin') izin++;
        else if (l.status === 'Sakit') sakit++;
        else if (l.status === 'Dinas Luar') dinas++;
        else if ((l.status || '').includes('Alpa')) alpa++;
      }
    }

    return {
      periodeMode,
      periodLabel,
      izin,
      sakit,
      dinas,
      alpa,
      maxIzin,
      maxSakit,
      maxDinas,
      maxAlpa
    };
  })();

  // Today's teaching sessions (own + substituted classes) for absence task box
  const todaySubstitutedGroups = teacher
    ? getSubstitutedSchedulesForDay({
        teacher,
        masterList,
        hari: hariIni,
        threshold: schoolThresholdDefault,
        jadwalList,
        attendanceRuleOverrides: settings.attendanceRuleOverrides
      })
    : [];

  const todayTeachingSessions = (() => {
    if (!teacher) return [] as Array<{ labelJam: string; namaMapel: string; kelas: string; jamMulai: string; jamSelesai: string; guruCutiNama?: string }>;
    const own = !teacher.isTempSubstitute && scheduleEval?.sesiList ? scheduleEval.sesiList : [];
    const sub = todaySubstitutedGroups.flatMap((g) =>
      g.matchedSesiList.map((s) => ({ ...s, guruCutiNama: g.assignment.guruCutiNama }))
    );
    return [...own, ...sub];
  })();

  const hasAnyTeachingToday = todayTeachingSessions.length > 0;
  const todayScheduleSummaryText = hasAnyTeachingToday
    ? todayTeachingSessions
        .map((s) => `${s.labelJam} ${s.namaMapel} (${s.kelas})${s.guruCutiNama ? ` [Pengganti ${s.guruCutiNama}]` : ''}`)
        .join(', ')
    : 'Tidak ada jam mengajar tatap muka';

  const waGroupUrl = settings.whatsappGroupUrl || DEFAULT_WHATSAPP_GROUP_URL;

  const parseAbsenceKeterangan = (rawKet?: string): { reason: string; task: string } => {
    const cleaned = (rawKet || '').replace(/\[Pengajuan Mandiri Dari Rumah\]/gi, '').trim();
    const parts = cleaned.split(/\s*\|\s*Tugas Siswa:\s*/i);
    return {
      reason: (parts[0] || '').trim(),
      task: (parts[1] || '').trim()
    };
  };

  const buildAbsenceWaMessage = (params: {
    status: string;
    reason: string;
    task?: string;
    jadwalText?: string;
  }) => {
    if (!teacher) return '';
    const tglLabel = formatLongDateIndonesian(todayISO);
    const lines = [
      `Assalamu'alaikum Wr. Wb.`,
      `*LAPORAN KETIDAKHADIRAN GURU / STAF*`,
      `SMP Nurul Abror Al-Robbaniyin`,
      ``,
      `• Nama: *${teacher.nama}*`,
      `• Jabatan: ${teacher.jabatan}`,
      `• Hari/Tanggal: ${hariIni}, ${tglLabel}`,
      `• Status: *${params.status}*`,
      `• Keterangan/Alasan: ${params.reason || '-'}`,
      `• Jadwal Mengajar: ${params.jadwalText || todayScheduleSummaryText}`,
      `• Tugas untuk Siswa: ${params.task && params.task.trim() ? params.task.trim() : '-'}`,
      `• Info Kuota (${teacherQuotaSummary.periodLabel}): Izin ${teacherQuotaSummary.izin}/${teacherQuotaSummary.maxIzin} | Sakit ${teacherQuotaSummary.sakit}/${teacherQuotaSummary.maxSakit} | Dinas ${teacherQuotaSummary.dinas}/${teacherQuotaSummary.maxDinas} | Alpa ${teacherQuotaSummary.alpa}/${teacherQuotaSummary.maxAlpa}`,
      ``,
      `Data telah tercatat otomatis di Aplikasi Presensi Sekolah. Mohon izin/maklum.`,
      `Terima kasih. Wassalamu'alaikum Wr. Wb.`
    ];
    return lines.join('\n');
  };

  const handleCopyWaMessage = async (msg: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
      }
      setWaCopied(true);
      setTimeout(() => setWaCopied(false), 3000);
    } catch (e) {
      // Ignore clipboard failure silently
    }
  };

  const handleOpenAbsenceModal = (defaultType: 'Izin' | 'Sakit' | 'Dinas Luar' = 'Izin') => {
    setAbsenceType(defaultType);
    setAbsenceReason('');
    setAbsenceTask('');
    setAbsenceError('');
    setAbsenceSavedLog(null);
    setWaCopied(false);
    setShowAbsenceModal(true);
  };

  const handleSubmitRemoteAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    setAbsenceError('');

    if (!teacher) {
      setAbsenceError('Silakan pilih nama Anda terlebih dahulu.');
      return;
    }

    if (activeCutiToday || todayLog?.status === 'Cuti') {
      setAbsenceError('Anda masih tercatat dalam masa Cuti resmi. Tidak perlu mengajukan izin harian.');
      return;
    }

    if (settings.requireDeviceLock) {
      const lockCheck = checkDeviceLock(todayISO, teacher.nama);
      if (!lockCheck.allowed) {
        setAbsenceError(
          `HP ini sudah digunakan untuk presensi atas nama "${lockCheck.lockedToName}" hari ini (aturan anti-titip absen).`
        );
        playErrorBeep();
        return;
      }
    }

    const cleanReason = absenceReason.trim();
    const cleanTask = absenceTask.trim();

    if (!cleanReason) {
      setAbsenceError(`Mohon isi alasan / keterangan ${absenceType} terlebih dahulu.`);
      return;
    }

    if (hasAnyTeachingToday && !cleanTask) {
      setAbsenceError(
        'Anda memiliki jadwal mengajar hari ini. Mohon isi kolom Tugas untuk Siswa (atau tuliskan titipan tugas ke guru piket).'
      );
      return;
    }

    setIsSubmittingAbsence(true);
    const now = new Date();
    const subNote = formatSubstituteAttendanceNote(teacher);
    const ketParts = [cleanReason];
    if (cleanTask) ketParts.push(`Tugas Siswa: ${cleanTask}`);
    const fullKet = `${ketParts.join(' | ')}${subNote ? ` ${subNote}` : ''} [Pengajuan Mandiri Dari Rumah]`;

    const newLog: LogPresensi = {
      id: todayLog?.id || `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now.toISOString(),
      tanggal: todayISO,
      hari: hariIni,
      nama: teacher.nama,
      jabatan: teacher.jabatan,
      mapelHariIni: hasAnyTeachingToday ? todayScheduleSummaryText : (scheduleEval?.mapelHariIni || mapelHariIni),
      jamDatang: '-',
      status: absenceType,
      keterangan: fullKet,
      metodePresensi: 'QR HP Guru',
      peran: ruleInfo?.peran || determineTeacherPeran(teacher, jadwalList, undefined, settings.attendanceRuleOverrides)
    };

    const res = await onSaveLog(newLog);
    setIsSubmittingAbsence(false);

    if (res.success) {
      recordDeviceLock(todayISO, teacher.nama);
      playSuccessChime();
      setAbsenceSavedLog(newLog);
    } else {
      playErrorBeep();
      // Even if offline fallback stored locally, show WA share options
      setAbsenceSavedLog(newLog);
    }
  };

  const handleCorrectStatus = async () => {
    if (!todayLog || !teacher) return;
    setIsSubmitting(true);
    const updatedLog: LogPresensi = {
      ...todayLog,
      status: 'Tepat Waktu',
      keterangan: (todayLog.keterangan || '').trim()
        ? `${todayLog.keterangan} (Koreksi Jadwal Jam ${effectiveTodayThreshold})`
        : `Koreksi Jadwal Jam ${effectiveTodayThreshold}`,
      peran: expectedEval?.peran || todayLog.peran,
      batasStaf: expectedEval?.batasStaf || todayLog.batasStaf,
      statusStaf: expectedEval?.statusStaf || todayLog.statusStaf,
      batasMengajar: expectedEval?.batasMengajar || todayLog.batasMengajar,
      statusMengajar: expectedEval?.statusMengajar || todayLog.statusMengajar
    };
    const res = await onSaveLog(updatedLog);
    setIsSubmitting(false);
    if (res.success) {
      playSuccessChime();
      setResultModal({
        status: 'success',
        title: 'Status Berhasil Diperbarui!',
        message: `Status kehadiran ${teacher.nama} pada pukul ${todayLog.jamDatang} WIB telah disesuaikan menjadi Tepat Waktu (Batas jadwal hari ini: ${effectiveTodayThreshold} WIB).`,
        jam: todayLog.jamDatang,
        statusPresensi: 'Tepat Waktu'
      });
    }
  };

  // Execute GPS Actions (Reset, Calibrate, or Disable GPS Requirement)
  const executeGpsAction = async (action: 'reset_school' | 'use_current_gps' | 'toggle_gps') => {
    if (!onSaveSettings) {
      alert('Fungsi penyimpanan pengaturan tidak tersedia.');
      return;
    }
    setIsGpsActionLoading(true);
    setPinError('');
    try {
      if (action === 'reset_school') {
        await onSaveSettings({
          schoolLatitude: DEFAULT_SCHOOL_COORDS.latitude,
          schoolLongitude: DEFAULT_SCHOOL_COORDS.longitude,
          schoolRadiusMeters: 150
        });
        setGpsActionSuccess('Titik pusat sekolah berhasil di-reset ke koordinat resmi SMP Nurul Abror Al-Robbaniyin (-8.009330, 114.421731)!');
      } else if (action === 'use_current_gps') {
        if (!currentCoords) {
          alert('Titik GPS HP Anda belum terdeteksi. Silakan aktifkan izin lokasi browser lalu coba lagi.');
          setIsGpsActionLoading(false);
          return;
        }
        await onSaveSettings({
          schoolLatitude: currentCoords.lat,
          schoolLongitude: currentCoords.lng,
          schoolRadiusMeters: settings.schoolRadiusMeters || 150
        });
        setGpsActionSuccess(`Titik sekolah berhasil dikalibrasi ke posisi HP Anda saat ini (Lat: ${currentCoords.lat.toFixed(6)}, Lng: ${currentCoords.lng.toFixed(6)})!`);
      } else if (action === 'toggle_gps') {
        const nextState = !settings.requireLocation;
        await onSaveSettings({
          requireLocation: nextState
        });
        setGpsActionSuccess(
          nextState
            ? 'Validasi jarak GPS diaktifkan kembali.'
            : 'Validasi jarak GPS dinonaktifkan sementara. Semua guru sekarang dapat langsung melakukan presensi!'
        );
      }
      setPinPromptAction(null);
      setInputAdminPin('');
      getGpsLocation();
    } catch (e: any) {
      alert('Gagal menyimpan pengaturan: ' + (e.message || 'Error'));
    } finally {
      setIsGpsActionLoading(false);
    }
  };

  const handleRequestGpsAction = (action: 'reset_school' | 'use_current_gps' | 'toggle_gps') => {
    if (isAdmin) {
      executeGpsAction(action);
    } else {
      setPinPromptAction(action);
      setInputAdminPin('');
      setPinError('');
    }
  };

  const handleConfirmPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    const trimmed = inputAdminPin.trim();
    if (!trimmed) {
      setPinError('Silakan masukkan PIN Admin.');
      return;
    }

    if (!settings.webAppUrl) {
      setPinError('URL Google Apps Script belum diatur di Pengaturan.');
      return;
    }

    try {
      const res = await verifyPinRemote(settings.webAppUrl, trimmed);
      if (res.success && (res.role === 'admin' || res.role === 'kurikulum')) {
        if (pinPromptAction) {
          executeGpsAction(pinPromptAction);
        }
      } else {
        setPinError(res.message || 'PIN Admin tidak sesuai. Silakan coba lagi.');
      }
    } catch (err: any) {
      setPinError(err.message || 'Gagal verifikasi PIN ke server Apps Script.');
    }
  };

  // Get coordinates and geofence calculation
  const getGpsLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setGeoErrorMsg('Browser HP tidak mendukung GPS.');
      return;
    }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        });
        setGeoStatus('success');
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        setGeoErrorMsg(
          err.code === err.PERMISSION_DENIED
            ? 'Izin GPS ditolak. Mohon aktifkan izin lokasi di browser HP Anda.'
            : 'Sinyal GPS lemah atau belum terhubung.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    getGpsLocation();
  }, []);

  const schoolLat = normalizeCoordinate(settings.schoolLatitude, 'lat', DEFAULT_SCHOOL_COORDS.latitude);
  const schoolLng = normalizeCoordinate(settings.schoolLongitude, 'lng', DEFAULT_SCHOOL_COORDS.longitude);
  const maxRadius = settings.schoolRadiusMeters || DEFAULT_SCHOOL_COORDS.radiusMeters;

  const distanceMeters = currentCoords
    ? calculateDistanceMeters(currentCoords.lat, currentCoords.lng, schoolLat, schoolLng)
    : null;

  const isInsideSchool = !settings.requireLocation || (distanceMeters !== null && distanceMeters <= maxRadius);

  // Process attendance log
  const handleAttendanceProcess = async (scannedCode?: string) => {
    if (!teacher) {
      setResultModal({
        status: 'error',
        title: 'Nama Guru Belum Dipilih',
        message: 'Silakan pilih nama Anda terlebih dahulu di bagian atas.'
      });
      playErrorBeep();
      return;
    }

    if (activeCutiToday || todayLog?.status === 'Cuti') {
      const endLabel = activeCutiToday?.tanggalSelesai
        ? formatLongDateIndonesian(activeCutiToday.tanggalSelesai)
        : todayISO;
      setResultModal({
        status: 'warning',
        title: 'Masih Dalam Masa Cuti Resmi',
        message: `${teacher.nama} masih berstatus ${activeCutiToday?.jenisCuti || 'Cuti'} s/d ${endLabel}. Jika sudah aktif kembali bekerja, silakan lapor diri ke TU / Admin untuk mencabut status cuti terlebih dahulu sebelum mengisi presensi.`
      });
      setIsScannerOpen(false);
      playErrorBeep();
      return;
    }

    // 1. Verify QR if provided (Gate poster scan)
    if (scannedCode) {
      const isValid = validateSchoolQr(scannedCode, settings.schoolQrSecret);
      if (!isValid) {
        setResultModal({
          status: 'error',
          title: 'QR Code Tidak Sesuai',
          message: 'QR Code ini bukan poster presensi resmi SMP Nurul Abror Al-Robbaniyin.'
        });
        playErrorBeep();
        return;
      }
    }

    // 2. Anti-titip absen device check
    if (settings.requireDeviceLock) {
      const lockCheck = checkDeviceLock(todayISO, teacher.nama);
      if (!lockCheck.allowed) {
        setResultModal({
          status: 'error',
          title: 'Akses Ditolak (Anti-Titip Absen)',
          message: `HP ini telah digunakan presensi atas nama "${lockCheck.lockedToName}" hari ini. Satu perangkat hanya dapat digunakan untuk 1 guru.`
        });
        playErrorBeep();
        return;
      }
    }

    // 3. Geofence radius check
    // NOTE: If scannedCode is provided, teacher has physically scanned the poster installed at the gate,
    // which verifies physical presence even if GPS coordinates drift or are misconfigured.
    if (settings.requireLocation && !scannedCode) {
      if (distanceMeters === null) {
        setResultModal({
          status: 'error',
          title: 'GPS Sedang Membaca',
          message: 'Tunggu sebentar sampai titik koordinat HP Anda terdeteksi oleh browser.'
        });
        getGpsLocation();
        playErrorBeep();
        return;
      }
      if (distanceMeters > maxRadius) {
        setResultModal({
          status: 'error',
          title: 'Di Luar Radius Sekolah',
          message: `Jarak Anda saat ini ${distanceMeters.toLocaleString('id-ID')} meter dari titik sekolah (Batas maksimum: ${maxRadius} meter). Presensi hanya dapat dilakukan di lingkungan sekolah.`
        });
        playErrorBeep();
        return;
      }
    }

    // 4. Save attendance with intelligent schedule-based evaluation & principal rule
    setIsSubmitting(true);
    const now = new Date();
    const jamSekarang = formatTimeHHMM(now);
    const defaultThreshold = settings.jamMasukThreshold || '07:25';
    const evalResult = evaluateTeacherAttendanceStatus(
      jamSekarang,
      teacher,
      hariIni,
      defaultThreshold,
      settings.kebijakanKehadiran || 'instruksi_kepala_sekolah',
      jadwalList,
      settings.guruToleransiMenit || 0,
      settings.guruTanpaJadwalWajibHadir || false,
      undefined,
      settings.attendanceRuleOverrides
    );
    const status: StatusPresensi = evalResult.status;

    const subNote = formatSubstituteAttendanceNote(teacher);
    let ketDetail = `${evalResult.keterangan}${subNote ? ' ' + subNote : ''} [${scannedViaGoogleLens ? 'Google Lens' : (scannedCode ? 'Scan Poster Gerbang' : 'Presensi Mandiri')}${distanceMeters !== null ? ' • ' + distanceMeters.toLocaleString('id-ID') + 'm' : ''}]`;

    const newLog: LogPresensi = {
      id: todayLog?.id || `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now.toISOString(),
      tanggal: todayISO,
      hari: hariIni,
      nama: teacher.nama,
      jabatan: teacher.jabatan,
      mapelHariIni: scheduleEval?.mapelHariIni || mapelHariIni,
      jamDatang: jamSekarang,
      status: status,
      keterangan: ketDetail,
      metodePresensi: 'QR HP Guru',
      koordinatLokasi: currentCoords ? `${currentCoords.lat.toFixed(6)}, ${currentCoords.lng.toFixed(6)}` : undefined,
      peran: evalResult.peran,
      batasStaf: evalResult.batasStaf || undefined,
      statusStaf: evalResult.statusStaf || undefined,
      batasMengajar: evalResult.batasMengajar || undefined,
      statusMengajar: evalResult.statusMengajar || undefined
    };

    const res = await onSaveLog(newLog);
    setIsSubmitting(false);
    setIsScannerOpen(false);

    if (res.success) {
      recordDeviceLock(todayISO, teacher.nama);
      playSuccessChime();
      setResultModal({
        status: 'success',
        title: status === 'Tepat Waktu' ? 'Presensi Berhasil!' : 'Presensi Berhasil (Terlambat)',
        message: `Kehadiran atas nama ${teacher.nama} telah dicatat ke sistem dan tersinkronisasi.`,
        jam: jamSekarang,
        statusPresensi: status
      });
    } else {
      playErrorBeep();
      setResultModal({
        status: 'warning',
        title: 'Tersimpan Offline',
        message: res.message || 'Presensi disimpan di HP dan akan otomatis disinkronkan saat terhubung internet.',
        jam: jamSekarang,
        statusPresensi: status
      });
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4 pb-10">
      {/* Google Lens Banner (if opened via Google Lens link) */}
      {scannedViaGoogleLens && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 flex items-center gap-3 shadow-sm animate-fade-in">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-yellow-300" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-emerald-900 truncate">
              Terdeteksi dari Scan Google Lens / Kamera:
            </p>
            <p className="text-xs font-bold text-emerald-700 truncate">
              {scannedViaGoogleLens}
            </p>
          </div>
        </div>
      )}

      {/* 1. Header Ringkas Mobile */}
      <div className="bg-gradient-to-br from-[#2F5597] via-[#234278] to-[#1a335e] rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10.5px] font-extrabold tracking-wider text-yellow-300 uppercase">
              SMP Nurul Abror Al-Robbaniyin
            </p>
            <h2 className="text-xl font-black tracking-tight mt-0.5 text-white">
              Presensi Mandiri Guru
            </h2>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-black bg-white/20 px-3 py-1 rounded-full backdrop-blur-md border border-white/20 text-yellow-200">
              {currentTimeStr || '--:--:--'}
            </span>
          </div>
        </div>

        {/* Live Date Pill */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-blue-100 font-medium">
          <Clock className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
          <span>
            {hariIni}, {todayISO} &bull;{' '}
            {teacher && ruleInfo ? (
              ruleInfo.ruleMode === 'sesuai_jadwal' ? (
                hasTeachingTodayMain && personalBatasGuru ? (
                  <>Batas Masuk Anda Hari Ini: <strong className="text-yellow-200">{personalBatasGuru} WIB</strong> (Sesuai Jadwal)</>
                ) : settings.guruTanpaJadwalWajibHadir ? (
                  <>Wajib Hadir: <strong className="text-yellow-200">{schoolThresholdDefault} WIB</strong></>
                ) : (
                  <>Hari Ini <strong className="text-yellow-200">Tidak Ada Jam Mengajar</strong></>
                )
              ) : (
                <>
                  {ruleInfo.isGuruBk ? 'Wajib Hadir Guru BK' : 'Wajib Hadir Harian'}:{' '}
                  <strong className="text-yellow-200">{schoolThresholdDefault} WIB</strong>
                </>
              )
            ) : (
              <>Batas Staf/BK: <strong>{schoolThresholdDefault} WIB</strong> &bull; Guru: Sesuai Jadwal</>
            )}
          </span>
        </div>
      </div>

      {/* 2. Kartu Profil Guru (Sederhana 1 Sentuhan) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3.5">
        {!settings.webAppUrl && (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-extrabold">Belum Terhubung ke Database Google Sheets</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Daftar nama di bawah masih memakai <strong>data bawaan aplikasi</strong> karena URL Apps Script belum terpasang. Klik <strong>Login PIN Server</strong> di pojok kanan atas untuk menempel URL Web App, atau isi variabel <code className="font-mono font-bold bg-amber-100 px-1 rounded">VITE_WEB_APP_URL</code> di GitHub Actions Variables.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identitas Guru / Staf:</span>
          {teacher && (
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              Tersimpan di Perangkat
            </span>
          )}
        </div>

        <div className="relative">
          <select
            value={selectedTeacherName}
            onChange={(e) => {
              onSelectTeacherName(e.target.value);
              saveTeacherProfile(e.target.value);
            }}
            className="w-full appearance-none bg-slate-50 border-2 border-slate-200 hover:border-blue-400 focus:border-[#2F5597] rounded-2xl px-4 py-3.5 text-sm sm:text-base font-extrabold text-slate-900 focus:outline-none transition shadow-sm pr-10 cursor-pointer"
          >
            <option value="">-- Sentuh untuk Memilih Nama Anda --</option>
            {masterList.map((t, idx) => {
              const subSuffix = t.isTempSubstitute
                ? ` — [Pengganti Sementara]`
                : t.substitutingFor && t.substitutingFor.length > 0
                ? ` — ${t.jabatan} (+Pengganti ${t.substitutingFor.map((s) => s.guruCutiNama).join(', ')})`
                : ` — ${t.jabatan}`;
              return (
                <option key={`self-opt-${t.no || idx}-${t.nama}-${idx}`} value={t.nama}>
                  {t.nama}{subSuffix}
                </option>
              );
            })}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>

        {/* Selected Teacher Quick Summary */}
        {teacher ? (
          (() => {
            const resolvedRule = ruleInfo || resolveTeacherAttendanceRule(teacher, jadwalList, undefined, settings.attendanceRuleOverrides);
            const teacherPeran = resolvedRule.peran;
            const hasTeachingToday = Boolean(scheduleEval?.hasTeachingSchedule && scheduleEval.sesiList.length > 0);
            const firstTime = scheduleEval?.firstScheduleTime || '07:30';
            const batasGuru = minutesToTime(Math.max(0, (timeToMinutes(firstTime) ?? 450) - (settings.guruToleransiMenit || 0)));
            const batasStaf = settings.jamMasukThreshold || '07:25';

            return (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col gap-2.5 text-xs">
                {teacher.substitutingFor && teacher.substitutingFor.length > 0 && (
                  <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-950 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-purple-900 uppercase tracking-wider text-[10px]">
                        {teacher.isTempSubstitute ? 'Guru Pengganti Sementara (Aktif)' : 'Tugas Pengganti Sementara'}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-200 text-purple-900 rounded-full text-[9.5px] font-black">
                        Sementara
                      </span>
                    </div>
                    {teacher.substitutingFor.map((sub, sIdx) => (
                      <p key={sIdx} className="leading-snug">
                        Menggantikan: <strong>{sub.guruCutiNama}</strong>
                        {sub.classNote ? ` (${sub.classNote})` : ''} &bull;{' '}
                        <span className="text-purple-800">
                          {formatLongDateIndonesian(sub.tanggalMulai)} s/d {formatLongDateIndonesian(sub.tanggalSelesai)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-extrabold text-slate-900">{teacher.jabatan}</p>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                        teacher.isTempSubstitute
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : teacherPeran === 'Guru'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : teacherPeran === 'Guru BK'
                          ? 'bg-teal-50 text-teal-800 border-teal-200'
                          : teacherPeran === 'Guru BK+Mengajar'
                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                          : teacherPeran === 'Guru+Staf'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                        {teacher.isTempSubstitute ? 'Pengganti Sementara' : `Peran: ${teacherPeran}`}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {resolvedRule.ruleMode === 'wajib_harian' && (
                        <span className={`px-2 py-0.5 font-semibold rounded-md text-[10.5px] ${
                          resolvedRule.isGuruBk ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {resolvedRule.isGuruBk ? 'Wajib Hadir Guru BK' : 'Wajib Hadir Harian'}:{' '}
                          <strong className="text-slate-900">{batasStaf} WIB</strong>
                        </span>
                      )}

                      {resolvedRule.ruleMode === 'sesuai_jadwal' && (
                        hasTeachingToday ? (
                          <span className="px-2 py-0.5 bg-blue-100/90 text-blue-900 font-semibold rounded-md text-[10.5px]">
                            Batas Masuk Anda Hari Ini: <strong className="text-slate-900">{batasGuru} WIB</strong> (Sesuai Jadwal)
                            {settings.guruToleransiMenit > 0 && ` • Toleransi ${settings.guruToleransiMenit}m`}
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${
                            settings.guruTanpaJadwalWajibHadir
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {settings.guruTanpaJadwalWajibHadir
                              ? `Wajib Hadir Harian: ${batasStaf} WIB`
                              : 'Tidak Ada Jam Mengajar Hari Ini (Tidak wajib hadir)'}
                          </span>
                        )
                      )}

                      {resolvedRule.ruleMode === 'ganda' && (
                        <>
                          <span className={`px-2 py-0.5 font-semibold rounded-md text-[10.5px] ${
                            resolvedRule.isGuruBk ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {resolvedRule.isGuruBk ? 'Wajib Hadir Guru BK' : 'Batas Staf'}:{' '}
                            <strong className="text-slate-900">{batasStaf} WIB</strong>
                          </span>
                          {hasTeachingToday ? (
                            <span className="px-2 py-0.5 bg-blue-100/90 text-blue-900 font-semibold rounded-md text-[10.5px]">
                              Batas Mengajar: <strong className="text-blue-900">{batasGuru} WIB</strong>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-semibold rounded-md text-[10.5px]">
                              Tidak ada jam mengajar hari ini
                            </span>
                          )}
                        </>
                      )}

                      {settings.autoAlpaEnabled !== false && autoAlpaInfo?.wajibHadir && autoAlpaInfo.deadlineTime && !todayLog && (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 font-bold rounded-md text-[10.5px]">
                          Batas Tutup Otomatis (Alpa): <strong className="text-rose-900">{autoAlpaInfo.deadlineTime} WIB</strong>
                          {settings.autoAlpaCutoffMode !== 'batas_akhir_tetap' ? ` (+${autoAlpaInfo.graceMenit} mnt)` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {todayLog ? (
                    <div className="shrink-0 text-right">
                      <span className={`inline-block px-3 py-1.5 font-black rounded-xl text-xs shadow-xs ${
                        todayLog.status === 'Tepat Waktu'
                          ? 'bg-emerald-100 text-emerald-800'
                          : todayLog.status === 'Cuti'
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : todayLog.status === 'Izin' || todayLog.status === 'Dinas Luar'
                          ? 'bg-sky-100 text-sky-800'
                          : todayLog.status === 'Sakit'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {todayLog.status === 'Tepat Waktu'
                          ? '✓ Tepat Waktu'
                          : todayLog.status === 'Terlambat'
                          ? '⚠ Terlambat'
                          : todayLog.status}
                        {todayLog.jamDatang && todayLog.jamDatang !== '-' ? ` (${todayLog.jamDatang})` : ''}
                      </span>
                      {todayLog.statusStaf && todayLog.statusStaf !== '-' && todayLog.statusMengajar && todayLog.statusMengajar !== '-' && (
                        <span className="block text-[9.5px] text-slate-500 font-mono mt-0.5">
                          {resolvedRule.isGuruBk || (todayLog.peran || '').toLowerCase().includes('bk') || isGuruBkJabatan(teacher.jabatan)
                            ? 'Guru BK'
                            : 'Staf'}: {todayLog.statusStaf} | Ajar: {todayLog.statusMengajar}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="shrink-0 text-[11px] font-extrabold text-amber-700 bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-300">
                      Belum Presensi
                    </span>
                  )}
                </div>

                {/* Aturan & Sisa Kuota Ketidakhadiran Sekolah */}
                <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="font-extrabold text-slate-700">
                      Kuota Ketidakhadiran ({teacherQuotaSummary.periodLabel}):
                    </span>
                    <span className="text-[9.5px] font-semibold text-slate-400">
                      Aturan Sekolah
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                    <div className={`px-1.5 py-1 rounded-lg border font-bold ${
                      teacherQuotaSummary.maxIzin > 0 && teacherQuotaSummary.izin >= teacherQuotaSummary.maxIzin
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : teacherQuotaSummary.maxIzin > 1 && teacherQuotaSummary.izin === teacherQuotaSummary.maxIzin - 1
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-sky-50/70 border-sky-200 text-sky-900'
                    }`}>
                      <span className="block text-[9px] font-semibold opacity-80">Izin</span>
                      <span>{teacherQuotaSummary.izin}/{teacherQuotaSummary.maxIzin}</span>
                    </div>
                    <div className={`px-1.5 py-1 rounded-lg border font-bold ${
                      teacherQuotaSummary.maxSakit > 0 && teacherQuotaSummary.sakit >= teacherQuotaSummary.maxSakit
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : teacherQuotaSummary.maxSakit > 1 && teacherQuotaSummary.sakit === teacherQuotaSummary.maxSakit - 1
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                    }`}>
                      <span className="block text-[9px] font-semibold opacity-80">Sakit</span>
                      <span>{teacherQuotaSummary.sakit}/{teacherQuotaSummary.maxSakit}</span>
                    </div>
                    <div className={`px-1.5 py-1 rounded-lg border font-bold ${
                      teacherQuotaSummary.maxDinas > 0 && teacherQuotaSummary.dinas >= teacherQuotaSummary.maxDinas
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-purple-50/70 border-purple-200 text-purple-900'
                    }`}>
                      <span className="block text-[9px] font-semibold opacity-80">Dinas</span>
                      <span>{teacherQuotaSummary.dinas}/{teacherQuotaSummary.maxDinas}</span>
                    </div>
                    <div className={`px-1.5 py-1 rounded-lg border font-bold ${
                      teacherQuotaSummary.maxAlpa > 0 && teacherQuotaSummary.alpa >= teacherQuotaSummary.maxAlpa
                        ? 'bg-rose-100 border-rose-300 text-rose-900'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}>
                      <span className="block text-[9px] font-semibold opacity-80">Alpa</span>
                      <span>{teacherQuotaSummary.alpa}/{teacherQuotaSummary.maxAlpa}</span>
                    </div>
                  </div>
                </div>

            {/* Detail Pelajaran Hari Ini / Pilihan Hari (Format Ringkas 3 Sesi Sehari) */}
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/90 text-[11px] space-y-2.5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[#2F5597]" />
                  <span className="text-slate-700 font-extrabold uppercase tracking-wider text-[10.5px]">
                    {teacher.isTempSubstitute
                      ? `Jadwal Pengganti (${viewingHari}):`
                      : `Jadwal Mengajar (${viewingHari}):`}
                  </span>
                  {viewingHari === hariIni && (
                    <span className="text-[9.5px] font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded border border-emerald-300">
                      Hari Ini
                    </span>
                  )}
                </div>

                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                  isJadwalTidakDitemukan(teacher)
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : viewingScheduleEval?.jamSatuKelas
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : viewingScheduleEval?.firstScheduleTime
                    ? 'bg-blue-50 text-blue-900 border-blue-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  {isJadwalTidakDitemukan(teacher)
                    ? 'Belum Terhubung'
                    : viewingScheduleEval?.jamSatuKelas
                    ? `Ada Jam 1 (${viewingScheduleEval.jamSatuKelas})`
                    : viewingScheduleEval?.firstScheduleTime
                    ? `Mulai Pkl. ${viewingScheduleEval.firstScheduleTime} WIB`
                    : viewingScheduleEval?.hasTeachingSchedule ? 'Jadwal Aktif' : 'Libur Mengajar'}
                </span>
              </div>

              {/* Day Selector Pills so teacher/user can inspect any school day directly */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
                <span className="text-[10px] text-slate-400 font-bold shrink-0 mr-0.5">Hari:</span>
                {(['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'] as HariSekolah[]).map((h) => {
                  const isCurrentDay = h === hariIni;
                  const isSelected = h === viewingHari;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setViewingHari(h)}
                      className={`px-2 py-1 rounded-lg text-[10.5px] font-bold shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#2F5597] text-white shadow-xs'
                          : isCurrentDay
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {h} {isCurrentDay ? '•' : ''}
                    </button>
                  );
                })}
              </div>

              {/* Tampilan Diagnostik Sementara (Hanya terlihat saat Admin login) */}
              {isAdmin && teacher && (
                <div className="px-2.5 py-1.5 bg-slate-100 rounded-lg text-[10.5px] text-slate-500 font-mono border border-slate-200 leading-tight break-words">
                  "{getRawMapelByDay(teacher, viewingHari)}" | {getMasterDataSourceLabel(settings)}
                </div>
              )}

              {(!teacher.isTempSubstitute || substitutedSchedulesForViewingDay.length === 0) && (
                viewingScheduleEval?.hasTeachingSchedule && viewingScheduleEval.sesiList.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-1.5">
                      {viewingScheduleEval.sesiList.map((sesi, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/90 hover:bg-white transition shadow-2xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black shrink-0 ${
                              sesi.labelJam.includes('I-II')
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : sesi.labelJam.includes('III-IV')
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                            }`}>
                              {sesi.labelJam}
                            </span>
                            <span className="font-extrabold text-slate-800 text-xs truncate">
                              {sesi.namaMapel}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {sesi.kelas && sesi.kelas !== '-' && (
                              <span className="font-black text-blue-900 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-md text-[11px]">
                                {sesi.kelas}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-600 font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {sesi.jamMulai} - {sesi.jamSelesai} WIB
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Keterangan Jam Ke-1 & Aturan Presensi Pribadi */}
                    <div className="p-2 bg-slate-100/70 rounded-lg text-[10px] text-slate-600 leading-relaxed border border-slate-200">
                      <p className="font-semibold text-slate-800 mb-0.5">
                        📌 {viewingScheduleEval.jamSatuKeterangan}
                      </p>
                      <p className="text-slate-500">
                        {resolvedRule.ruleMode === 'sesuai_jadwal' ? (
                          <>
                            Aturan Presensi ({teacherPeran}): Batas hadir tepat waktu hari {viewingHari} adalah{' '}
                            <strong className="text-slate-800">
                              {minutesToTime(Math.max(0, (timeToMinutes(viewingScheduleEval.firstScheduleTime || '07:30') ?? 450) - (settings.guruToleransiMenit || 0)))} WIB
                            </strong>{' '}
                            (sesuai jadwal jam masuk kelas pertama).
                          </>
                        ) : resolvedRule.isGuruBk ? (
                          <>
                            Aturan Guru BK: Wajib hadir harian maksimal <strong className="text-slate-800">{batasStaf} WIB</strong>
                            {viewingScheduleEval.firstScheduleTime && ` & batas sesi mengajar pertama ${viewingScheduleEval.firstScheduleTime} WIB`}.
                          </>
                        ) : (
                          <>
                            Aturan Staf/Jabatan: Wajib hadir harian maksimal <strong className="text-slate-800">{batasStaf} WIB</strong>
                            {viewingScheduleEval.firstScheduleTime && ` & batas sesi mengajar pertama ${viewingScheduleEval.firstScheduleTime} WIB`}.
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <p className="text-slate-600 italic">
                      {isJadwalTidakDitemukan(teacher) ? (
                        <span className="text-amber-800 text-[10.5px] not-italic font-medium">
                          Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)
                        </span>
                      ) : resolvedRule.isGuruBk ? (
                        'Tugas Bimbingan & Konseling (Wajib Hadir sebagai Guru BK).'
                      ) : teacher.jabatan.toLowerCase().includes('guru') ? (
                        `Hari ${viewingHari} tidak ada jam tatap muka di kelas.`
                      ) : (
                        'Tugas operasional kantor / ketatausahaan sekolah.'
                      )}
                    </p>
                  </div>
                )
              )}

              {/* Jadwal Mengajar Guru Yang Digantikan (khusus Guru Pengganti) */}
              {substitutedSchedulesForViewingDay.length > 0 && (
                <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 border-b border-purple-200/80 pb-1.5">
                    <span className="font-extrabold text-purple-900 uppercase tracking-wider text-[10px]">
                      Jadwal Tugas Pengganti ({viewingHari})
                    </span>
                    <span className="px-2 py-0.5 bg-purple-200 text-purple-950 rounded-md text-[9.5px] font-black">
                      Dari Guru Cuti
                    </span>
                  </div>

                  {substitutedSchedulesForViewingDay.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10.5px]">
                        <span className="font-bold text-purple-950">
                          Menggantikan: {group.assignment.guruCutiNama}
                          {group.assignment.classNote ? ` (${group.assignment.classNote})` : ''}
                        </span>
                        {group.isClassFiltered && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 bg-white text-purple-800 rounded border border-purple-200">
                            Difilter {group.assignment.classNote}
                          </span>
                        )}
                      </div>

                      {group.matchedSesiList.length > 0 ? (
                        <div className="grid grid-cols-1 gap-1.5">
                          {group.matchedSesiList.map((sesi, sIdx) => (
                            <div
                              key={sIdx}
                              className="flex items-center justify-between p-2 bg-white rounded-xl border border-purple-200/90 shadow-2xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 bg-purple-100 text-purple-900 border border-purple-300">
                                  {sesi.labelJam}
                                </span>
                                <span className="font-extrabold text-slate-800 text-[11.5px] truncate">
                                  {sesi.namaMapel}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {sesi.kelas && sesi.kelas !== '-' && (
                                  <span className="font-black text-purple-900 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md text-[10.5px]">
                                    {sesi.kelas}
                                  </span>
                                )}
                                <span className="text-[9.5px] text-slate-600 font-mono font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  {sesi.jamMulai} - {sesi.jamSelesai} WIB
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10.5px] text-purple-800 italic bg-white/70 px-2.5 py-1.5 rounded-lg border border-purple-100">
                          {group.assignment.guruCutiNama} tidak memiliki jam mengajar pada hari {viewingHari}.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Collapsible Full Week Schedule Table */}
              <div className="pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWeeklySchedule(!showWeeklySchedule)}
                  className="w-full flex items-center justify-between text-[10.5px] font-bold text-[#2F5597] hover:text-blue-800 py-1 cursor-pointer"
                >
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>{showWeeklySchedule ? 'Sembunyikan Roster Mingguan' : 'Lihat Seluruh Roster Mingguan (Sabtu - Kamis)'}</span>
                  </span>
                  {showWeeklySchedule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showWeeklySchedule && (
                  <div className="mt-2 bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-[10.5px] space-y-1.5 animate-in fade-in duration-150">
                    <div className="font-bold text-slate-700 pb-1 border-b border-slate-200 flex justify-between">
                      <span>Roster Lengkap {teacher.nama}:</span>
                      <span className="text-[9.5px] text-slate-400 font-mono">6 Hari Sekolah</span>
                    </div>
                    {(['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'] as HariSekolah[]).map(day => {
                      const dayEval = evaluateTeacherScheduleForDay(teacher, day, settings.jamMasukThreshold || '07:25', jadwalList, settings.attendanceRuleOverrides);
                      const subGroupsOnDay = getSubstitutedSchedulesForDay({
                        teacher,
                        masterList,
                        hari: day,
                        threshold: settings.jamMasukThreshold || '07:25',
                        jadwalList,
                        attendanceRuleOverrides: settings.attendanceRuleOverrides
                      }).filter((g) => g.matchedSesiList.length > 0);
                      return (
                        <div
                          key={day}
                          onClick={() => setViewingHari(day)}
                          className={`p-1.5 rounded-lg flex items-start justify-between gap-2 cursor-pointer transition ${
                            day === viewingHari ? 'bg-blue-100/70 border border-blue-200 font-semibold' : 'hover:bg-slate-100'
                          }`}
                        >
                          <span className="w-12 shrink-0 font-bold text-slate-800">{day}:</span>
                          <div className="flex-1 text-slate-600 text-[10px] space-y-0.5">
                            {!teacher.isTempSubstitute && (
                              <div>
                                {isJadwalTidakDitemukan(teacher) ? (
                                  <em className="text-amber-700">Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)</em>
                                ) : dayEval.hasTeachingSchedule ? (
                                  dayEval.mapelHariIni
                                ) : (
                                  <em className="text-slate-400">Libur mengajar</em>
                                )}
                              </div>
                            )}
                            {subGroupsOnDay.length > 0 ? (
                              subGroupsOnDay.map((sg, sgIdx) => (
                                <div key={sgIdx} className="text-purple-800 font-semibold">
                                  {teacher.isTempSubstitute ? 'Pengganti' : '+ Pengganti'} ({sg.assignment.guruCutiNama}):{' '}
                                  {sg.matchedSesiList.map((s) => `${s.labelJam} ${s.namaMapel} (${s.kelas})`).join(', ')}
                                </div>
                              ))
                            ) : teacher.isTempSubstitute ? (
                              <em className="text-slate-400">Tidak ada jadwal pengganti</em>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowMyIdCard(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-[#183153] hover:text-blue-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                  <span>ID Card Saya</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowClassSchedulesModal(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-[#183153] hover:text-blue-700 bg-blue-50/80 px-2.5 py-1.5 rounded-lg border border-blue-200 shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#2F5597]" />
                  <span>Jadwal 16 Rombel (Resmi)</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Format 54x86mm</span>
            </div>
          </div>
        );
      })()
    ) : (
          <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 text-center">
            <p className="text-xs text-blue-800 font-medium">
              Arahkan kamera <strong>Google Lens</strong> ke Kartu ID Anda, atau pilih nama dari daftar di atas.
            </p>
          </div>
        )}
      </div>

      {/* 3. Validasi Lokasi GPS Ringkas & Solusi Koordinat */}
      <div className="space-y-2">
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                isInsideSchool ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              <MapPin className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                {geoStatus === 'locating' ? (
                  'Mendeteksi Koordinat GPS...'
                ) : isInsideSchool ? (
                  '✅ Berada di Area Sekolah'
                ) : (
                  '❌ Di Luar Area Sekolah'
                )}
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {distanceMeters !== null
                  ? `Jarak ke gerbang: ${distanceMeters.toLocaleString('id-ID')} meter (Batas: ${maxRadius}m)`
                  : geoErrorMsg || 'Memeriksa sinyal GPS...'}
              </p>
              <p className="text-[9.5px] text-slate-400 font-mono mt-0.5 break-all">
                Posisi HP: {currentCoords ? `${currentCoords.lat.toFixed(6)}, ${currentCoords.lng.toFixed(6)} (akurasi ±${currentCoords.accuracy} m)` : 'Mendeteksi...'} | Titik sekolah: {schoolLat.toFixed(6)}, {schoolLng.toFixed(6)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowGpsDetails(!showGpsDetails)}
              className="px-2.5 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition text-[11px] font-bold active:scale-95"
              title="Buka Detail GPS"
            >
              {showGpsDetails ? 'Tutup Info' : 'Detail GPS'}
            </button>
            <button
              onClick={getGpsLocation}
              className="p-2.5 rounded-xl text-blue-600 bg-blue-50 hover:bg-blue-100 transition active:scale-95"
              title="Segarkan GPS"
            >
              <RefreshCw className={`w-4 h-4 ${geoStatus === 'locating' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Success Feedback Banner after GPS Action */}
        {gpsActionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start justify-between gap-2 text-emerald-900 text-xs font-bold animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{gpsActionSuccess}</span>
            </div>
            <button
              onClick={() => setGpsActionSuccess('')}
              className="text-emerald-700 hover:text-emerald-900 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Extreme Distance Warning (> 5 km) - Solusi Otomatis untuk Masalah Koordinat Melenceng */}
        {distanceMeters !== null && distanceMeters > 5000 && (
          <div className="bg-amber-50 border-2 border-amber-400 rounded-3xl p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-black text-amber-950">
                  Titik Pusat Sekolah di Sistem Berjarak {Math.round(distanceMeters / 1000).toLocaleString('id-ID')} km!
                </h4>
                <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                  Titik sekolah yang tersimpan di sistem saat ini tidak cocok dengan posisi Anda di sekolah.
                  Pilih salah satu tombol solusi instan di bawah ini:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-200">
              <button
                type="button"
                onClick={() => handleRequestGpsAction('reset_school')}
                disabled={isGpsActionLoading}
                className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>1. Reset ke Titik Resmi Sekolah</span>
              </button>

              <button
                type="button"
                onClick={() => handleRequestGpsAction('use_current_gps')}
                disabled={isGpsActionLoading}
                className="px-3 py-2.5 bg-[#2F5597] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <MapPin className="w-3.5 h-3.5 text-yellow-300" />
                <span>2. Jadikan Posisi HP Ini Titik Sekolah</span>
              </button>

              <button
                type="button"
                onClick={() => handleRequestGpsAction('toggle_gps')}
                disabled={isGpsActionLoading}
                className="px-3 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>3. Matikan Wajib GPS (Bebaskan Absen)</span>
              </button>
            </div>
            <p className="text-[10px] text-amber-700 italic">
              * Perubahan otomatis tersinkronisasi ke Google Sheets dan langsung berlaku untuk semua guru.
            </p>
          </div>
        )}

        {/* Detailed GPS Panel (Toggleable) */}
        {showGpsDetails && (
          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 text-xs space-y-3 shadow-inner">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-blue-600" />
                Diagnostik Koordinat GPS
              </span>
              <a
                href={`https://maps.google.com/?q=${schoolLat},${schoolLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-[11px] font-bold flex items-center gap-1"
              >
                <span>Buka Peta Sekolah</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Posisi HP Anda Saat Ini</span>
                <p className="font-mono text-slate-800 font-bold mt-0.5">
                  Lat: {currentCoords ? currentCoords.lat.toFixed(6) : '-'}
                </p>
                <p className="font-mono text-slate-800 font-bold">
                  Lng: {currentCoords ? currentCoords.lng.toFixed(6) : '-'}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Akurasi: ±{currentCoords ? currentCoords.accuracy : '-'} meter
                </p>
              </div>

              <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Titik Sekolah di Sistem</span>
                <p className="font-mono text-slate-800 font-bold mt-0.5">
                  Lat: {schoolLat.toFixed(6)}
                </p>
                <p className="font-mono text-slate-800 font-bold">
                  Lng: {schoolLng.toFixed(6)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Radius Toleransi: {maxRadius} meter
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600 font-medium">
                Status Validasi GPS: <strong>{settings.requireLocation ? 'Diwajibkan' : 'Dimatikan (Bebas)'}</strong>
              </span>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleRequestGpsAction('reset_school')}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[11px] font-bold transition"
                >
                  Reset Titik Sekolah Resmi
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestGpsAction('use_current_gps')}
                  className="px-2.5 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-lg text-[11px] font-bold transition"
                >
                  Set Lokasi HP Ini Jadi Sekolah
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Tombol Utama Presensi (Sangat Jelas & Besar) */}
      <div className="space-y-3 pt-1">
        {(activeCutiToday || todayLog?.status === 'Cuti') ? (
          <div className="bg-teal-50 border-2 border-teal-500 rounded-3xl p-5 text-center shadow-md space-y-2.5">
            <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center mx-auto shadow">
              <CalendarDays className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-teal-950">
              Anda Masih Dalam Masa Cuti Resmi
            </h3>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs text-teal-950 font-black">{teacher?.nama}</span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full font-black bg-teal-200 text-teal-900">
                {activeCutiToday?.jenisCuti || 'Cuti Resmi'} (Non-Pelanggaran)
              </span>
            </div>
            {activeCutiToday && (
              <p className="text-xs font-bold text-teal-900">
                Periode: {formatLongDateIndonesian(activeCutiToday.tanggalMulai)} s/d {formatLongDateIndonesian(activeCutiToday.tanggalSelesai)}
                {activeCutiToday.guruPengganti && activeCutiToday.guruPengganti !== '-' && (
                  <> &bull; Pengganti: <span className="underline">{activeCutiToday.guruPengganti}</span></>
                )}
              </p>
            )}
            {(todayLog?.keterangan || activeCutiToday?.catatan) && (
              <p className="text-[11px] text-teal-800 bg-white/80 border border-teal-200 rounded-xl px-3 py-2">
                {todayLog?.keterangan || activeCutiToday?.catatan}
              </p>
            )}
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-left text-[11.5px] text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Sudah masuk sekolah &amp; siap aktif kembali?</strong> Harap <strong>lapor diri ke TU / Admin terlebih dahulu</strong> untuk mencabut atau menyelesaikan status cuti Anda di sistem sebelum mengisi presensi kehadiran.
              </p>
            </div>
          </div>
        ) : todayLog ? (
          (todayLog.status || '').startsWith('Alpa') ? (
            <div className="bg-rose-50 border-2 border-rose-500 rounded-3xl p-5 text-center shadow-md space-y-2">
              <div className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center mx-auto shadow">
                <XCircle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-rose-900">
                Tercatat Tidak Hadir (Alpa)
              </h3>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs text-rose-950 font-black">
                  {teacher?.nama}
                </span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-black bg-rose-200 text-rose-900">
                  {todayLog.status}
                </span>
              </div>
              {todayLog.keterangan && (
                <p className="text-[11px] text-rose-800 bg-white/80 border border-rose-200 rounded-xl px-3 py-2 leading-relaxed">
                  {todayLog.keterangan}
                </p>
              )}
              <p className="text-[11px] text-rose-700">
                Batas waktu pengisian presensi wajib hadir telah lewat. Hubungi Admin atau Waka Kurikulum apabila Anda memiliki tugas luar/izin/cuti resmi.
              </p>
            </div>
          ) : todayLog.status === 'Izin' || todayLog.status === 'Sakit' || todayLog.status === 'Dinas Luar' ? (
            (() => {
              const parsedKet = parseAbsenceKeterangan(todayLog.keterangan);
              const waMsg = buildAbsenceWaMessage({
                status: todayLog.status,
                reason: parsedKet.reason || todayLog.keterangan || '-',
                task: parsedKet.task,
                jadwalText: todayLog.mapelHariIni && todayLog.mapelHariIni !== '-' ? todayLog.mapelHariIni : todayScheduleSummaryText
              });
              return (
                <div className="bg-sky-50 border-2 border-sky-500 rounded-3xl p-5 text-center shadow-md space-y-3">
                  <div className="w-12 h-12 rounded-full bg-sky-600 text-white flex items-center justify-center mx-auto shadow">
                    <Clock className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-sky-900">
                      Status Hari Ini: {todayLog.status}
                    </h3>
                    <p className="text-xs text-sky-950 font-bold mt-0.5">{teacher?.nama}</p>
                  </div>

                  {parsedKet.reason && (
                    <div className="text-left text-[11.5px] text-sky-900 bg-white/90 border border-sky-200 rounded-xl px-3 py-2">
                      <span className="font-extrabold text-sky-800 block text-[10px] uppercase">Alasan / Keterangan:</span>
                      <span>{parsedKet.reason}</span>
                    </div>
                  )}

                  {parsedKet.task && (
                    <div className="text-left text-[11.5px] text-amber-950 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span className="font-extrabold text-amber-900 block text-[10px] uppercase">Tugas untuk Siswa:</span>
                      <span>{parsedKet.task}</span>
                    </div>
                  )}

                  {/* Kirim / Salin Info ke Grup WA Sekolah */}
                  <div className="pt-2 border-t border-sky-200/80 space-y-2 text-left">
                    <p className="text-[10.5px] font-bold text-sky-900 text-center">
                      Kirim Keterangan &amp; Tugas ke Grup WhatsApp Resmi Sekolah:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <a
                        href={waGroupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleCopyWaMessage(waMsg)}
                        className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span>{waCopied ? '✓ Teks Tersalin! Tempel di Grup WA Sekolah' : 'Salin Pesan & Buka Grup WA Sekolah'}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2 px-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                        >
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span>Pilih Grup di WA</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyWaMessage(waMsg)}
                          className="py-2 px-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>{waCopied ? 'Tersalin!' : 'Salin Teks Saja'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            /* Already attended view (Tepat Waktu / Terlambat) */
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-5 text-center shadow-md">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-2 shadow">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-emerald-900">
                Presensi Hari Ini Telah Tercatat
              </h3>
              <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs text-emerald-900 font-black">
                  {teacher?.nama}
                </span>
                <span className="text-xs text-slate-500">&bull;</span>
                <span className="text-xs text-emerald-800 font-bold">
                  Jam {todayLog.jamDatang} WIB
                </span>
                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-black ${
                    todayLog.status === 'Tepat Waktu'
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {todayLog.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Batas Presensi Anda: <strong>{effectiveTodayThreshold} WIB</strong>
                {expectedEval?.peran ? ` (${expectedEval.peran})` : ''}
              </p>

              {/* Auto Correction Button if previously misflagged as Terlambat */}
              {isStatusMismatched && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-2xl text-left">
                  <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Koreksi Otomatis Jam Masuk ({effectiveTodayThreshold} WIB):</span>
                  </p>
                  <p className="text-[11px] text-amber-800 mt-1">
                    Jam kedatangan Anda <strong>{todayLog.jamDatang} WIB</strong> tercatat sebelum batas <strong>{effectiveTodayThreshold} WIB</strong>. Anda berhak berstatus <strong>Tepat Waktu</strong>.
                  </p>
                  <button
                    onClick={handleCorrectStatus}
                    disabled={isSubmitting}
                    className="mt-2.5 w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Memperbarui Status...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Koreksi Status Menjadi "Tepat Waktu"</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <p className="text-[11px] text-emerald-600 mt-2">
                Data kehadiran Anda sudah tersinkronisasi ke Google Sheets sekolah.
              </p>
            </div>
          )
        ) : (
          <>
            {/* Warning & Solution if outside school radius */}
            {!isInsideSchool && settings.requireLocation && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-left space-y-1.5 animate-fadeIn">
                <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Tombol 1-Tap Terkunci (Jarak {distanceMeters !== null ? `${distanceMeters.toLocaleString('id-ID')}m` : ''} &gt; Batas {maxRadius}m)</span>
                </p>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Sistem keamanan mendeteksi HP Anda berada di luar radius sekolah.
                </p>
                <div className="bg-white/80 p-2.5 rounded-xl border border-rose-200/80 space-y-1.5 text-[11px]">
                  <p className="font-bold text-slate-800">
                    💡 Jika Anda sudah berada di sekolah, lakukan salah satu opsi ini:
                  </p>
                  <p className="text-slate-700">
                    1. <strong>Gunakan Kamera Scan Poster Gerbang:</strong> Klik tombol biru di bawah. Pindai poster QR fisik di gerbang sekolah (presensi langsung diterima tanpa terhalang jarak GPS).
                  </p>
                  <p className="text-slate-700">
                    2. <strong>Perbaiki Titik Sekolah:</strong> Klik tombol hijau <em>"Reset ke Titik Resmi Sekolah"</em> pada kotak peringatan kuning di atas (PIN Admin: 1234) agar semua guru bisa langsung absen.
                  </p>
                </div>
              </div>
            )}

            {/* Primary Big Action Button: 1-Tap Attendance Confirmation */}
            <button
              id="btn-presensi-langsung-hp"
              disabled={!teacher || isSubmitting || (!isInsideSchool && settings.requireLocation)}
              onClick={() => handleAttendanceProcess()}
              className={`w-full py-4 px-5 rounded-3xl font-black text-sm sm:text-base flex items-center justify-center gap-3 shadow-lg transition-all active:scale-98 ${
                !teacher || (!isInsideSchool && settings.requireLocation)
                  ? 'bg-slate-200 text-slate-400 border-2 border-slate-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-500 shadow-emerald-600/30'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-white" />
                  <span>Memproses Presensi...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6 text-yellow-300" />
                  <span>KONFIRMASI HADIR SEKARANG</span>
                </>
              )}
            </button>

            {/* Secondary Option: In-App Gate Poster Scanner */}
            <button
              id="btn-buka-scanner-qr"
              disabled={!teacher || isSubmitting}
              onClick={() => setIsScannerOpen(true)}
              className={`w-full py-3 px-4 rounded-3xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-all ${
                !teacher
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-[#2F5597]/10 hover:bg-[#2F5597]/20 text-[#2F5597] border-[#2F5597]/30'
              }`}
            >
              <Camera className="w-4 h-4 text-[#2F5597]" />
              <span>Opsi Lain: Buka Kamera Scan Poster Gerbang</span>
            </button>

            {/* Remote Absence Card: Izin / Sakit / Dinas Luar dari Rumah (Tanpa GPS) */}
            <div className="pt-2">
              <div className="bg-sky-50/90 border border-sky-200 rounded-3xl p-4 space-y-2.5 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black text-sky-950">
                      Berhalangan Hadir Hari Ini? (Izin / Sakit / Dinas Luar)
                    </p>
                    <p className="text-[10.5px] text-sky-800 leading-relaxed mt-0.5">
                      Validasi GPS hanya berlaku saat presensi hadir di sekolah. Jika Anda sedang di rumah / sakit / tugas luar, ajukan di sini beserta <strong>tugas untuk siswa</strong> &amp; kirim ke <strong>Grup WA Sekolah</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-ajukan-izin-dari-rumah"
                  disabled={!teacher || isSubmitting}
                  onClick={() => handleOpenAbsenceModal('Izin')}
                  className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-98 cursor-pointer"
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>Ajukan Izin / Sakit / Dinas Luar (Dari Rumah)</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 5. Modal Scanner Kamera HP (Fullscreen / Popup Bersih) */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <span className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
                <Camera className="w-4 h-4" />
                Scan Poster Titik Gerbang
              </span>
              <button
                onClick={() => setIsScannerOpen(false)}
                className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200"
              >
                Tutup
              </button>
            </div>

            <div className="p-3">
              <QrCameraScanner
                instructionText="Arahkan kamera ke Poster QR Gerbang Sekolah"
                onScanSuccess={(code) => handleAttendanceProcess(code)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal ID Card Guru (Download PNG & Preview) */}
      {showMyIdCard && teacher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 max-w-xs w-full border border-slate-200 shadow-2xl relative flex flex-col items-center my-auto">
            {/* Close Button */}
            <button
              onClick={() => setShowMyIdCard(false)}
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-3">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[9.5px] font-black rounded-full uppercase">
                Standar CR80 (54x86 mm)
              </span>
              <h3 className="text-xs font-black text-slate-900 mt-1">
                Kartu Identitas Presensi
              </h3>
              <p className="text-[10.5px] text-slate-500">
                Ukuran saku / dompet guru
              </p>
            </div>

            {/* The Compact ID Card */}
            <div className="my-1">
              <TeacherIdCard
                teacher={teacher}
                settings={settings}
                sideMode="front"
                showCutGuides={false}
              />
            </div>

            <p className="text-[10px] text-slate-500 text-center mt-2.5 leading-relaxed">
              Tekan tombol <strong>Download PNG</strong> di bawah kartu untuk menyimpannya ke galeri HP Anda.
            </p>

            <button
              onClick={() => setShowMyIdCard(false)}
              className="mt-3 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>
      )}

      {/* 6. Modal Pop-up Hasil Presensi */}
      {resultModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center shadow-2xl border border-slate-100 animate-scale-in space-y-4">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
                resultModal.status === 'success'
                  ? 'bg-emerald-100 text-emerald-600'
                  : resultModal.status === 'warning'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-rose-100 text-rose-600'
              }`}
            >
              {resultModal.status === 'success' ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : resultModal.status === 'warning' ? (
                <AlertTriangle className="w-10 h-10" />
              ) : (
                <XCircle className="w-10 h-10" />
              )}
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">
                {resultModal.title}
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {resultModal.message}
              </p>
            </div>

            {resultModal.jam && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Jam Masuk:</span>
                  <span className="text-slate-900">{resultModal.jam} WIB</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-500">Batas Tepat Waktu:</span>
                  <span className="text-slate-700 font-mono">{activeThreshold} WIB</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500">Status Kehadiran:</span>
                  <span className={`px-2 py-0.5 rounded-md ${resultModal.statusPresensi === 'Tepat Waktu' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {resultModal.statusPresensi}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setResultModal(null)}
              className="w-full py-3 bg-[#2F5597] hover:bg-[#234278] text-white font-bold text-xs rounded-2xl shadow transition"
            >
              Selesai / Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Verifikasi PIN Admin untuk Aksi Cepat GPS */}
      {pinPromptAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full border border-slate-200 shadow-2xl relative">
            <button
              onClick={() => {
                setPinPromptAction(null);
                setInputAdminPin('');
                setPinError('');
              }}
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2 shadow-xs">
                <Key className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900">
                Verifikasi Hak Akses Admin
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {pinPromptAction === 'reset_school' && 'Reset koordinat sekolah ke lokasi resmi SMP Nurul Abror Al-Robbaniyin'}
                {pinPromptAction === 'use_current_gps' && 'Jadikan koordinat GPS HP saat ini sebagai titik pusat sekolah'}
                {pinPromptAction === 'toggle_gps' && `${settings.requireLocation ? 'Nonaktifkan' : 'Aktifkan'} validasi jarak GPS sekolah`}
              </p>
            </div>

            <form onSubmit={handleConfirmPin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Masukkan PIN Admin (Bawaan: 1234):
                </label>
                <input
                  type="password"
                  maxLength={10}
                  autoFocus
                  value={inputAdminPin}
                  onChange={(e) => setInputAdminPin(e.target.value)}
                  placeholder="PIN Admin"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-lg font-mono tracking-widest font-black focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {pinError && (
                  <p className="text-xs text-rose-600 font-bold mt-1.5 text-center">
                    {pinError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinPromptAction(null);
                    setInputAdminPin('');
                    setPinError('');
                  }}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isGpsActionLoading || !inputAdminPin}
                  className="w-1/2 py-2.5 bg-[#2F5597] hover:bg-blue-800 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isGpsActionLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Konfirmasi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Roster Jadwal Pelajaran 16 Rombel Resmi */}
      {showClassSchedulesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-3 sm:p-5 shadow-2xl border border-slate-300">
            <JadwalPelajaranView
              masterList={masterList}
              isModal={true}
              onClose={() => setShowClassSchedulesModal(false)}
            />
          </div>
        </div>
      )}

      {/* Modal Pengajuan Izin / Sakit / Dinas Luar dari Rumah (Tanpa GPS) + Kirim WA Sekolah */}
      {showAbsenceModal && teacher && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-md border border-slate-200 shadow-2xl p-5 space-y-4 my-auto max-h-[92vh] overflow-y-auto relative">
            <button
              type="button"
              onClick={() => setShowAbsenceModal(false)}
              className="absolute top-3.5 right-3.5 p-1.5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition cursor-pointer"
              aria-label="Tutup modal pengajuan ketidakhadiran"
            >
              <X className="w-4 h-4" />
            </button>

            {!absenceSavedLog ? (
              <form onSubmit={handleSubmitRemoteAbsence} className="space-y-4">
                <div className="pr-8">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                        Pengajuan Izin / Sakit / Dinas Luar
                      </h3>
                      <p className="text-[11px] font-bold text-sky-700">
                        Dari Rumah &bull; Tanpa Validasi GPS
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    Pemohon: <strong className="text-slate-900">{teacher.nama}</strong> ({teacher.jabatan}) &bull; {hariIni}, {formatLongDateIndonesian(todayISO)}
                  </p>
                </div>

                {/* Pilihan Jenis Ketidakhadiran */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-slate-800">
                    1. Pilih Jenis Ketidakhadiran:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Izin', 'Sakit', 'Dinas Luar'] as const).map((jenis) => {
                      const isActive = absenceType === jenis;
                      const activeStyle =
                        jenis === 'Izin'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                          : jenis === 'Sakit'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-indigo-600 text-white border-indigo-600 shadow-sm';
                      return (
                        <button
                          key={jenis}
                          type="button"
                          onClick={() => {
                            setAbsenceType(jenis);
                            setAbsenceError('');
                          }}
                          className={`py-2.5 px-2 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                            isActive
                              ? activeStyle
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {jenis}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pengingat Kuota Ketidakhadiran Sekolah */}
                {(() => {
                  const selectedUsed =
                    absenceType === 'Izin'
                      ? teacherQuotaSummary.izin
                      : absenceType === 'Sakit'
                      ? teacherQuotaSummary.sakit
                      : teacherQuotaSummary.dinas;
                  const selectedMax =
                    absenceType === 'Izin'
                      ? teacherQuotaSummary.maxIzin
                      : absenceType === 'Sakit'
                      ? teacherQuotaSummary.maxSakit
                      : teacherQuotaSummary.maxDinas;
                  const isLimitReached = selectedMax > 0 && selectedUsed >= selectedMax;
                  const remaining = Math.max(0, selectedMax - selectedUsed);

                  return (
                    <div
                      className={`rounded-2xl p-3 border text-xs space-y-1.5 ${
                        isLimitReached
                          ? 'bg-rose-50 border-rose-300 text-rose-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[11px]">
                          Aturan Batas {absenceType} ({teacherQuotaSummary.periodLabel}):
                        </span>
                        <span
                          className={`font-black text-[11px] px-2 py-0.5 rounded-lg ${
                            isLimitReached
                              ? 'bg-rose-200 text-rose-950'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          Terpakai {selectedUsed} / {selectedMax} &bull; Sisa {remaining}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-600 leading-relaxed">
                        Batas resmi sekolah ({teacherQuotaSummary.periodeMode}): Izin maks{' '}
                        <strong>{teacherQuotaSummary.maxIzin}x</strong>, Sakit maks{' '}
                        <strong>{teacherQuotaSummary.maxSakit}x</strong>, Dinas Luar maks{' '}
                        <strong>{teacherQuotaSummary.maxDinas}x</strong>, Alpa maks{' '}
                        <strong>{teacherQuotaSummary.maxAlpa}x</strong>.
                      </p>
                      {isLimitReached && (
                        <p className="text-[10.5px] font-bold text-rose-800 flex items-start gap-1.5 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                          <span>
                            Perhatian: Kuota {absenceType} Anda pada periode ini telah mencapai/melebihi batas maksimal sekolah. Pengajuan tetap dicatat agar transparan dan terhitung dalam pembinaan.
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Jadwal Mengajar Hari Ini & Kolom Tugas untuk Siswa */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        {hasAnyTeachingToday
                          ? '2. Tugas untuk Siswa (Wajib Ada Jadwal Hari Ini):'
                          : '2. Catatan / Titipan Tugas Piket (Opsional):'}
                      </span>
                    </label>
                    {hasAnyTeachingToday && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                        {todayTeachingSessions.length} Sesi Mengajar
                      </span>
                    )}
                  </div>

                  {hasAnyTeachingToday ? (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-2.5 space-y-1.5">
                      <p className="text-[10.5px] font-bold text-amber-950">
                        Jadwal Mengajar Anda Hari Ini ({hariIni}):
                      </p>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {todayTeachingSessions.map((sesi, idx) => (
                          <div
                            key={`${sesi.labelJam}-${sesi.kelas}-${idx}`}
                            className="text-[10.5px] bg-white border border-amber-200/80 rounded-lg px-2 py-1 flex items-center justify-between gap-2"
                          >
                            <span className="font-bold text-slate-800">
                              {sesi.labelJam} &bull; {sesi.namaMapel} ({sesi.kelas})
                              {sesi.guruCutiNama ? ` [Pengganti ${sesi.guruCutiNama}]` : ''}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {sesi.jamMulai}-{sesi.jamSelesai}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                      Anda tidak memiliki jadwal mengajar tatap muka hari ini ({hariIni}).
                    </p>
                  )}

                  <textarea
                    rows={3}
                    value={absenceTask}
                    onChange={(e) => {
                      setAbsenceTask(e.target.value);
                      if (absenceError) setAbsenceError('');
                    }}
                    placeholder={
                      hasAnyTeachingToday
                        ? 'Contoh: Kelas 8A kerjakan LKS hal. 24-25 no. 1-10, dikumpulkan ke Ketua Kelas / Guru Piket...'
                        : 'Opsional: tuliskan titipan pesan atau tugas bila ada...'
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Alasan / Keterangan */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-extrabold text-slate-800">
                    3. Alasan / Keterangan {absenceType} (Wajib):
                  </label>
                  <textarea
                    rows={2}
                    value={absenceReason}
                    onChange={(e) => {
                      setAbsenceReason(e.target.value);
                      if (absenceError) setAbsenceError('');
                    }}
                    placeholder={`Tuliskan alasan singkat ${absenceType.toLowerCase()} Anda hari ini...`}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {absenceError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 rounded-2xl text-xs font-bold text-rose-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{absenceError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAbsenceModal(false)}
                    className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAbsence}
                    className="w-2/3 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-black text-xs rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingAbsence ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Menyimpan...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Simpan &amp; Siapkan Pesan WA</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              (() => {
                const waMsg = buildAbsenceWaMessage({
                  status: absenceSavedLog.status,
                  reason: absenceReason.trim(),
                  task: absenceTask.trim(),
                  jadwalText: todayScheduleSummaryText
                });

                return (
                  <div className="space-y-4">
                    <div className="text-center space-y-1.5 pr-4">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <h3 className="text-base font-black text-slate-900">
                        Pengajuan {absenceSavedLog.status} Tercatat!
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        Silakan teruskan laporan ketidakhadiran &amp; tugas siswa ini ke Grup WhatsApp Resmi Sekolah:
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10.5px] font-extrabold text-slate-500 uppercase">
                        Pratinjau Pesan WhatsApp:
                      </span>
                      <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed bg-slate-50 border border-slate-200 rounded-2xl p-3 text-slate-800 max-h-52 overflow-y-auto">
                        {waMsg}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <a
                        href={waGroupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleCopyWaMessage(waMsg)}
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition active:scale-98"
                      >
                        <MessageSquare className="w-4 h-4 shrink-0" />
                        <span>
                          {waCopied
                            ? '✓ Teks Tersalin! Tempel di Grup WA Sekolah'
                            : 'Salin Pesan & Buka Grup WA Sekolah'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(waMsg)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2.5 px-3 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                        >
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span>Pilih Grup di WA</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyWaMessage(waMsg)}
                          className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 shrink-0" />
                          <span>{waCopied ? 'Tersalin!' : 'Salin Teks Saja'}</span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAbsenceModal(false)}
                      className="w-full py-2.5 bg-[#2F5597] hover:bg-[#234278] text-white font-bold text-xs rounded-2xl shadow transition cursor-pointer"
                    >
                      Selesai / Tutup
                    </button>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Footer Info Ringkas */}
      <div className="text-center pt-2">
        <p className="text-[10.5px] text-slate-500 flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>SMP Nurul Abror Al-Robbaniyin &bull; Presensi Google Lens &amp; GPS</span>
        </p>
      </div>
    </div>
  );
};

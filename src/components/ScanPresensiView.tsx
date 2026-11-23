import React, { useState, useEffect } from 'react';
import {
  MasterGuruStaf,
  LogPresensi,
  AppSettings,
  StatusPresensi,
  HariSekolah,
  JadwalSlot
} from '../types';
import {
  findTeacherByQrCode,
  playSuccessChime,
  playErrorBeep,
  getSavedTeacherProfile,
  DEFAULT_SCHOOL_COORDS
} from '../utils/qrAndGeoUtils';
import { getHariFromDate, formatDateISO, formatTimeHHMM } from '../utils/dateUtils';
import { evaluateStatus24h } from '../utils/timeUtils';
import { evaluateTeacherAttendanceStatus } from '../utils/scheduleTimeEvaluator';
import { buildMapelString, isJadwalTidakDitemukan } from '../utils/jadwalEngine';
import { QrCameraScanner } from './QrCameraScanner';
import { QrGeneratorPrintView } from './QrGeneratorPrintView';
import { MobileSelfPresensi } from './MobileSelfPresensi';
import { getMasterDataSourceLabel, getRawMapelByDay } from '../utils/googleAppsScript';
import {
  Smartphone,
  School,
  QrCode,
  Sliders,
  Printer,
  CreditCard,
  CalendarCheck,
  Volume2,
  Lock,
  UserCheck,
  Sparkles,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface ScanPresensiViewProps {
  masterList: MasterGuruStaf[];
  existingLogs: LogPresensi[];
  settings: AppSettings;
  isAdmin: boolean;
  jadwalList?: JadwalSlot[];
  onSaveLog: (log: LogPresensi) => Promise<{ success: boolean; message: string; id?: string }>;
  onSaveSettings: (settings: Partial<AppSettings>) => Promise<void>;
  onOpenPinModal: () => void;
}

export const ScanPresensiView: React.FC<ScanPresensiViewProps> = ({
  masterList,
  existingLogs,
  settings,
  isAdmin,
  jadwalList,
  onSaveLog,
  onSaveSettings,
  onOpenPinModal
}) => {
  // Navigation between methods
  const [activeMode, setActiveMode] = useState<'hp_guru' | 'kios_piket' | 'cetak_qr' | 'pengaturan_gps'>('hp_guru');

  // Teacher Profile state for Mobile Self Scan
  const [selectedTeacherName, setSelectedTeacherName] = useState<string>(getSavedTeacherProfile());

  // --- STATE FOR METODE 2 (KIOS PIKET) ---
  const [kioskLastScanned, setKioskLastScanned] = useState<{
    teacher: MasterGuruStaf;
    time: string;
    status: StatusPresensi;
    isDuplicate?: boolean;
    message: string;
  } | null>(null);
  const [kioskStatusMessage, setKioskStatusMessage] = useState<string>('Siap men-scan kartu QR guru...');

  // --- STATE FOR PENGATURAN GPS (ADMIN) ---
  const [tempLat, setTempLat] = useState<string>(String(settings.schoolLatitude !== undefined ? settings.schoolLatitude : DEFAULT_SCHOOL_COORDS.latitude));
  const [tempLng, setTempLng] = useState<string>(String(settings.schoolLongitude !== undefined ? settings.schoolLongitude : DEFAULT_SCHOOL_COORDS.longitude));
  const [tempRadius, setTempRadius] = useState<number>(settings.schoolRadiusMeters || DEFAULT_SCHOOL_COORDS.radiusMeters);
  const [tempSecret, setTempSecret] = useState<string>(settings.schoolQrSecret || DEFAULT_SCHOOL_COORDS.secret);
  const [tempRequireLocation, setTempRequireLocation] = useState<boolean>(settings.requireLocation !== false);
  const [tempRequireDeviceLock, setTempRequireDeviceLock] = useState<boolean>(settings.requireDeviceLock !== false);
  const [isSavingGps, setIsSavingGps] = useState<boolean>(false);

  // Sync state if settings prop changes from database
  useEffect(() => {
    if (settings.schoolLatitude !== undefined) setTempLat(String(settings.schoolLatitude));
    if (settings.schoolLongitude !== undefined) setTempLng(String(settings.schoolLongitude));
    if (settings.schoolRadiusMeters) setTempRadius(settings.schoolRadiusMeters);
    if (settings.schoolQrSecret) setTempSecret(settings.schoolQrSecret);
    setTempRequireLocation(settings.requireLocation !== false);
    setTempRequireDeviceLock(settings.requireDeviceLock !== false);
  }, [settings]);

  const todayISO = formatDateISO();
  const hariIni = getHariFromDate(todayISO) as HariSekolah;

  // --- EXECUTE KIOSK PIKET SCAN (METODE 2) ---
  const handleKioskScan = async (scannedCode: string) => {
    const teacher = findTeacherByQrCode(scannedCode, masterList);

    if (!teacher) {
      playErrorBeep();
      setKioskStatusMessage('❌ Kartu QR tidak dikenali sebagai Guru / Staf.');
      return;
    }

    const alreadyScanned = existingLogs.find(
      (l) => l.nama.trim().toLowerCase() === teacher.nama.trim().toLowerCase() && l.tanggal === todayISO
    );

    const now = new Date();
    const jamSekarang = formatTimeHHMM(now);

    if (alreadyScanned) {
      playSuccessChime();
      setKioskLastScanned({
        teacher,
        time: alreadyScanned.jamDatang,
        status: alreadyScanned.status,
        isDuplicate: true,
        message: `${teacher.nama} sudah tercatat presensi sebelumnya pada pukul ${alreadyScanned.jamDatang} WIB.`
      });
      setKioskStatusMessage(`ℹ️ Sudah Absen: ${teacher.nama} (${alreadyScanned.jamDatang} WIB)`);
      return;
    }

    const defaultThreshold = settings.jamMasukThreshold || '07:25';
    const evalResult = evaluateTeacherAttendanceStatus(
      jamSekarang,
      teacher,
      hariIni,
      defaultThreshold,
      settings.kebijakanKehadiran || 'instruksi_kepala_sekolah',
      jadwalList,
      settings.guruToleransiMenit || 0,
      settings.guruTanpaJadwalWajibHadir || false
    );
    const status: StatusPresensi = evalResult.status;

    const mapelToday = buildMapelString(teacher, hariIni, jadwalList);

    const keterangan = `${evalResult.keterangan} [Scan Kios Piket]`;

    const newLog: LogPresensi = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now.toISOString(),
      tanggal: todayISO,
      hari: hariIni,
      nama: teacher.nama,
      jabatan: teacher.jabatan,
      mapelHariIni: evalResult.ringkasanSesi || mapelToday,
      jamDatang: jamSekarang,
      status: status,
      keterangan: keterangan,
      metodePresensi: 'QR Kios Piket',
      peran: evalResult.peran,
      batasStaf: evalResult.batasStaf || undefined,
      statusStaf: evalResult.statusStaf || undefined,
      batasMengajar: evalResult.batasMengajar || undefined,
      statusMengajar: evalResult.statusMengajar || undefined
    };

    playSuccessChime();
    setKioskLastScanned({
      teacher,
      time: jamSekarang,
      status: status,
      isDuplicate: false,
      message: `Presensi berhasil dicatat untuk ${teacher.nama} (${status})!`
    });
    setKioskStatusMessage(`✅ Berhasil: ${teacher.nama} (${jamSekarang} WIB)`);

    await onSaveLog(newLog);
  };

  // --- SAVE GPS SETTINGS TO CENTRAL DATABASE (ADMIN) ---
  const handleSaveGpsSettings = async () => {
    const latStr = String(tempLat).trim().replace(',', '.');
    const lngStr = String(tempLng).trim().replace(',', '.');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || lat < -11 || lat > 6) {
      alert('Koordinat Latitude tidak valid! Nilai harus berada di antara -11 dan 6 (contoh: -8.009330).');
      return;
    }

    if (isNaN(lng) || lng < 95 || lng > 141) {
      alert('Koordinat Longitude tidak valid! Nilai harus berada di antara 95 dan 141 (contoh: 114.421731).');
      return;
    }

    setIsSavingGps(true);
    await onSaveSettings({
      schoolLatitude: lat,
      schoolLongitude: lng,
      schoolRadiusMeters: tempRadius,
      schoolQrSecret: tempSecret,
      requireLocation: tempRequireLocation,
      requireDeviceLock: tempRequireDeviceLock
    });
    setIsSavingGps(false);
    alert('Pengaturan GPS & Titik Sekolah berhasil disimpan ke Database Cloud / Google Sheets!');
  };

  const handleResetToOfficialSchoolCoords = () => {
    setTempLat(String(DEFAULT_SCHOOL_COORDS.latitude));
    setTempLng(String(DEFAULT_SCHOOL_COORDS.longitude));
    setTempRadius(150);
    alert('Koordinat berhasil dikembalikan ke lokasi resmi SMP Nurul Abror Al-Robbaniyin (-8.009330, 114.421731) dengan radius 150m.\n\nJangan lupa klik tombol "Simpan Pengaturan GPS ke Database" di bawah.');
  };

  const handleUseCurrentGpsAsSchool = () => {
    if (!navigator.geolocation) {
      alert('Browser tidak mendukung GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setTempLat(lat.toFixed(6));
        setTempLng(lng.toFixed(6));

        if (lat > 0) {
          alert(`⚠️ Perhatian: Titik GPS yang terdeteksi memiliki Latitude positif (+${lat.toFixed(6)}).\nWilayah Pulau Jawa / Banyuwangi harus memiliki Latitude negatif (-) seperti -8.009330.\nPastikan Anda mengambil posisi dari HP di sekolah.`);
        } else {
          alert(`Titik pusat sekolah berhasil disetel dari posisi GPS Anda saat ini:\nLatitude: ${lat.toFixed(6)}\nLongitude: ${lng.toFixed(6)}\nAkurasi: ±${Math.round(pos.coords.accuracy)}m\n\nJangan lupa klik tombol "Simpan Pengaturan GPS ke Database" di bawah.`);
        }
      },
      (err) => {
        alert(`Gagal mengambil posisi GPS: ${err.message}. Pastikan izin lokasi browser telah diizinkan.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar: Only show full mode selector if Admin, otherwise show clean guide banner */}
      {isAdmin ? (
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {/* Mode 1 Button: HP Guru (Default & Simple) */}
            <button
              id="btn-mode-hp-guru"
              onClick={() => setActiveMode('hp_guru')}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeMode === 'hp_guru'
                  ? 'bg-[#2F5597] text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4 text-yellow-300" />
              <span>1. Scan Mandiri (HP Guru)</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-yellow-400 text-slate-900 rounded font-black">
                Simpel
              </span>
            </button>

            {/* Mode 2 Button: Kios Piket */}
            <button
              id="btn-mode-kios-piket"
              onClick={() => setActiveMode('kios_piket')}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeMode === 'kios_piket'
                  ? 'bg-[#2F5597] text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <School className="w-4 h-4 text-yellow-300" />
              <span>2. Kios Meja Piket (Tablet / Laptop)</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-400 text-slate-900 rounded font-black">
                Scan Kartu
              </span>
            </button>

            {/* Mode 3 Button: Cetak & Download ID Card (Hanya tampil untuk Admin) */}
            <button
              id="btn-mode-cetak-qr"
              onClick={() => setActiveMode('cetak_qr')}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeMode === 'cetak_qr'
                  ? 'bg-[#183153] text-white shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CreditCard className="w-4 h-4 text-amber-300" />
              <span>3. Cetak &amp; Download ID Card</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-blue-200 text-blue-900 rounded font-bold">Admin</span>
            </button>
          </div>

          {/* Admin Settings GPS Button */}
          <button
            onClick={() => setActiveMode('pengaturan_gps')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition ${
              activeMode === 'pengaturan_gps'
                ? 'bg-amber-500 text-white border-amber-600 shadow'
                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
            title="Pengaturan Titik GPS & Radius Sekolah di Database"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
            <span>Pengaturan GPS</span>
          </button>
        </div>
      ) : null}

      {/* ========================================================
          MODE 1: SCAN MANDIRI HP GURU (SEDERHANA, PRAKTIS & JELAS)
          ======================================================== */}
      {(activeMode === 'hp_guru' || !isAdmin) && (
        <MobileSelfPresensi
          masterList={masterList}
          existingLogs={existingLogs}
          settings={settings}
          isAdmin={isAdmin}
          selectedTeacherName={selectedTeacherName}
          onSelectTeacherName={setSelectedTeacherName}
          onSaveLog={onSaveLog}
          onSaveSettings={onSaveSettings}
          onOpenGpsSettings={() => setActiveMode('pengaturan_gps')}
          jadwalList={jadwalList}
        />
      )}

      {/* ========================================================
          MODE 2: KIOS MEJA PIKET / POS SATPAM (SCAN KARTU QR GURU)
          ======================================================== */}
      {activeMode === 'kios_piket' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Continuous Camera Scanner */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Kios Scanner Meja Piket (Aktif)
                  </h3>
                </div>
                <span className="text-xs px-2.5 py-1 bg-blue-100 text-blue-800 font-bold rounded-full">
                  Mode Tablet / Pos Lobi
                </span>
              </div>

              {/* Camera Scanner Viewport */}
              <QrCameraScanner
                instructionText="Tunjukkan Kartu ID QR Guru / Layar HP ke Kamera"
                onScanSuccess={handleKioskScan}
                qrboxSize={280}
              />

              {/* Status Banner */}
              <div className="mt-3 p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  <span className="font-semibold">{kioskStatusMessage}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Audio Suara Aktif</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Celebratory Scan Result Card & Today's Feed */}
          <div className="lg:col-span-5 space-y-4">
            {/* Last Scanned Result Badge */}
            {kioskLastScanned ? (
              <div
                className={`bg-white rounded-2xl p-6 border-2 shadow-lg transition-all animate-scale-in text-center ${
                  kioskLastScanned.status === 'Tepat Waktu'
                    ? 'border-emerald-500 bg-emerald-50/20'
                    : 'border-amber-500 bg-amber-50/20'
                }`}
              >
                <div className="w-16 h-16 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3 shadow">
                  <UserCheck className="w-8 h-8 text-[#2F5597]" />
                </div>

                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2 ${
                    kioskLastScanned.status === 'Tepat Waktu'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {kioskLastScanned.status}
                </span>

                <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-0.5">
                  {kioskLastScanned.teacher.nama}
                </h3>
                <p className="text-xs text-slate-500 font-medium mb-3">
                  {kioskLastScanned.teacher.jabatan}
                </p>

                <div className="bg-white/80 border border-slate-200 rounded-xl p-3 text-xs space-y-1 max-w-xs mx-auto text-left">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Jam Masuk:</span>
                    <span className="font-extrabold text-slate-800">{kioskLastScanned.time} WIB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-bold text-emerald-700">{kioskLastScanned.status}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                    <span className="text-slate-500 shrink-0 mr-2">Jadwal Mengajar ({hariIni}):</span>
                    <span className="font-semibold text-slate-800 truncate">
                      {isJadwalTidakDitemukan(kioskLastScanned.teacher) ? (
                        <span className="text-amber-700 text-[10.5px]">Jadwal belum terhubung (Kode Guru belum diisi di Master_Guru_Staf)</span>
                      ) : (
                        buildMapelString(kioskLastScanned.teacher, hariIni, jadwalList)
                      )}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="px-2 py-1 bg-slate-100 rounded text-[10px] text-slate-500 font-mono border border-slate-200 mt-1 break-words">
                      "{getRawMapelByDay(kioskLastScanned.teacher, hariIni)}" | {getMasterDataSourceLabel(settings)}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mt-3">{kioskLastScanned.message}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 border border-dashed border-slate-300 text-center text-slate-400 space-y-2">
                <QrCode className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">Menunggu Guru Melintas...</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Setiap guru cukup mengarahkan Kartu QR ID Card ke depan kamera tablet. Data kehadiran otomatis tercatat dan tersinkron ke Google Sheets.
                </p>
              </div>
            )}

            {/* Today's Scanned Log Feed (Picket Queue) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <CalendarCheck className="w-4 h-4 text-[#2F5597]" />
                  <span>Daftar Hadir Hari Ini ({hariIni})</span>
                </h4>
                <span className="text-[11px] font-extrabold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                  {existingLogs.filter(l => l.tanggal === todayISO).length} Guru
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-thin">
                {existingLogs.filter(l => l.tanggal === todayISO).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Belum ada guru yang presensi hari ini.</p>
                ) : (
                  existingLogs
                    .filter(l => l.tanggal === todayISO)
                    .map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{log.nama}</p>
                          <p className="text-[10px] text-slate-500 truncate">{log.jabatan}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-slate-700 block text-[11px]">
                            {log.jamDatang && log.jamDatang !== '-' ? `${log.jamDatang} WIB` : '-'}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                              log.status === 'Tepat Waktu'
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.status === 'Cuti'
                                ? 'bg-teal-100 text-teal-800'
                                : log.status === 'Izin' || log.status === 'Dinas Luar'
                                ? 'bg-sky-100 text-sky-800'
                                : log.status === 'Sakit'
                                ? 'bg-indigo-100 text-indigo-800'
                                : log.status.includes('Alpa')
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODE 3: GENERATOR & CETAK QR (KHUSUS ADMIN)
          ======================================================== */}
      {activeMode === 'cetak_qr' && isAdmin && (
        <QrGeneratorPrintView masterList={masterList} settings={settings} />
      )}

      {/* ========================================================
          MODE 4: PENGATURAN GPS GEOFENCING (DATABASE TERPUSAT)
          ======================================================== */}
      {activeMode === 'pengaturan_gps' && isAdmin && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-500" />
                <span>Pengaturan Titik GPS &amp; Radius Geofencing (Tersimpan di Database)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Semua perangkat HP guru akan otomatis membaca titik koordinat &amp; radius ini dari database pusat.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full border border-amber-300">
              Khusus Admin
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Latitude Sekolah:
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tempLat}
                onChange={(e) => setTempLat(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-500">Resmi SMP: -8.009330 (Harus bertanda minus)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Longitude Sekolah:
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tempLng}
                onChange={(e) => setTempLng(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[10px] text-slate-500">Resmi SMP: 114.421731</span>
            </div>
          </div>

          {/* Warning if Latitude is positive */}
          {parseFloat(String(tempLat).replace(',', '.')) > 0 && (
            <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-rose-900 text-xs flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <div>
                <p className="font-bold">Perhatian: Nilai Latitude Bernilai Positif (+{tempLat})</p>
                <p className="text-[11px] mt-0.5 text-rose-800">
                  Wilayah Banyuwangi, Jawa Timur berada di belahan bumi selatan sehingga bernilai <strong>negatif (-)</strong> (contoh: <code>-8.009330</code>). Tanda minus yang hilang akan menyebabkan aplikasi menghitung jarak sejauh ribuan kilometer ke luar negeri!
                </p>
              </div>
            </div>
          )}

          {/* Quick Calibration & Reset Buttons */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-xs text-blue-900">
                <p className="font-bold">📍 Kalibrasi &amp; Reset Titik Sekolah:</p>
                <p className="text-[11px] text-blue-700">
                  Ambil posisi otomatis jika sedang di gerbang, atau kembalikan ke koordinat resmi SMP Nurul Abror Al-Robbaniyin.
                </p>
              </div>
              <a
                href={`https://maps.google.com/?q=${tempLat},${tempLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0"
              >
                <span>Lihat di Google Maps</span>
              </a>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 border-t border-blue-200/70">
              <button
                type="button"
                onClick={handleResetToOfficialSchoolCoords}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5"
              >
                <span>🔄 Reset ke Titik Resmi SMP (-8.009330, 114.421731)</span>
              </button>

              <button
                type="button"
                onClick={handleUseCurrentGpsAsSchool}
                className="px-3.5 py-2 bg-[#2F5597] hover:bg-blue-800 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5"
              >
                <span>📍 Gunakan GPS HP Saya Saat Ini</span>
              </button>
            </div>
          </div>

          {/* Radius Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Radius Toleransi Presensi (Meter):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="20"
                max="1000"
                value={tempRadius}
                onChange={(e) => setTempRadius(parseInt(e.target.value, 10) || 50)}
                className="w-32 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-500">meter dari titik pusat</span>

              {/* Preset buttons */}
              <div className="flex gap-1.5 ml-auto">
                {[50, 100, 150, 200].map((r) => (
                  <button
                    key={r}
                    onClick={() => setTempRadius(r)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-bold border ${
                      tempRadius === r
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {r}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* QR Secret Token */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kode Rahasia Poster QR Sekolah (Secret Token):
            </label>
            <input
              type="text"
              value={tempSecret}
              onChange={(e) => setTempSecret(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="SMP-NA-PRESENSI-2026"
            />
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tempRequireLocation}
                onChange={(e) => setTempRequireLocation(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Wajibkan Validasi Jarak GPS (Geofencing)</span>
                <span className="text-slate-500 text-[11px]">Jika aktif, guru di luar radius tidak dapat melakukan presensi mandiri di HP.</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={tempRequireDeviceLock}
                onChange={(e) => setTempRequireDeviceLock(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">Aktifkan Kunci 1 Perangkat 1 Guru (Anti-Titip Absen)</span>
                <span className="text-slate-500 text-[11px]">Satu HP hanya dapat digunakan untuk 1 guru per hari.</span>
              </div>
            </label>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
            <button
              onClick={handleSaveGpsSettings}
              disabled={isSavingGps}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow transition flex items-center gap-2"
            >
              {isSavingGps ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Pengaturan GPS ke Database</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

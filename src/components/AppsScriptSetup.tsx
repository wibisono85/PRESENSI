import React, { useState } from 'react';
import { APPS_SCRIPT_CODE } from '../utils/googleAppsScript';
import { DEFAULT_SCHOOL_COORDS } from '../utils/qrAndGeoUtils';
import { AppSettings, MasterGuruStaf } from '../types';
import {
  Settings,
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Clock,
  Code2,
  FileSpreadsheet,
  HelpCircle,
  RefreshCw,
  MapPin,
  Sliders,
  ShieldCheck,
  Lock
} from 'lucide-react';

interface AppsScriptSetupProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => void;
  onTestConnection: () => Promise<void>;
  onSeedMasterData: () => Promise<{ success: boolean; message: string }>;
  masterCount: number;
}

export const AppsScriptSetup: React.FC<AppsScriptSetupProps> = ({
  settings,
  onSaveSettings,
  onTestConnection,
  onSeedMasterData,
  masterCount
}) => {
  const [webAppUrl, setWebAppUrl] = useState<string>(settings.webAppUrl);
  const [sheetUrl, setSheetUrl] = useState<string>(settings.sheetUrl);
  const [threshold, setThreshold] = useState<string>(settings.jamMasukThreshold || '07:25');
  const [guruToleransiMenit, setGuruToleransiMenit] = useState<number>(settings.guruToleransiMenit ?? 0);
  const [guruTanpaJadwalWajibHadir, setGuruTanpaJadwalWajibHadir] = useState<boolean>(settings.guruTanpaJadwalWajibHadir ?? false);

  // School GPS Location state
  const [schoolLatitude, setSchoolLatitude] = useState<string>(
    String(settings.schoolLatitude !== undefined ? settings.schoolLatitude : DEFAULT_SCHOOL_COORDS.latitude)
  );
  const [schoolLongitude, setSchoolLongitude] = useState<string>(
    String(settings.schoolLongitude !== undefined ? settings.schoolLongitude : DEFAULT_SCHOOL_COORDS.longitude)
  );
  const [schoolRadiusMeters, setSchoolRadiusMeters] = useState<number>(
    settings.schoolRadiusMeters || 150
  );
  const [requireLocation, setRequireLocation] = useState<boolean>(
    settings.requireLocation !== false
  );

  // Quota Settings state
  const [quotaPeriode, setQuotaPeriode] = useState<'Bulanan' | 'Semester'>(settings.quotaPeriode || 'Bulanan');
  const [quotaIzin, setQuotaIzin] = useState<number>(settings.quotaIzin ?? 3);
  const [quotaSakit, setQuotaSakit] = useState<number>(settings.quotaSakit ?? 5);
  const [quotaAlpa, setQuotaAlpa] = useState<number>(settings.quotaAlpa ?? 1);
  const [quotaDinasLuar, setQuotaDinasLuar] = useState<number>(settings.quotaDinasLuar ?? 5);
  const [quotaTanggalMulai, setQuotaTanggalMulai] = useState<string>(settings.quotaTanggalMulai || `${new Date().getFullYear()}-07-01`);

  const [copied, setCopied] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [seedResult, setSeedResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetGpsDefault = () => {
    setSchoolLatitude(String(DEFAULT_SCHOOL_COORDS.latitude));
    setSchoolLongitude(String(DEFAULT_SCHOOL_COORDS.longitude));
    setSchoolRadiusMeters(150);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);

    const latStr = String(schoolLatitude).trim().replace(',', '.');
    const lngStr = String(schoolLongitude).trim().replace(',', '.');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || lat < -11 || lat > 6) {
      setTestResult({
        success: false,
        message: 'Koordinat Latitude tidak valid! Nilai harus berada di antara -11 dan 6 (contoh: -8.009330).'
      });
      return;
    }

    if (isNaN(lng) || lng < 95 || lng > 141) {
      setTestResult({
        success: false,
        message: 'Koordinat Longitude tidak valid! Nilai harus berada di antara 95 dan 141 (contoh: 114.421731).'
      });
      return;
    }

    try {
      await onSaveSettings({
        webAppUrl: webAppUrl.trim(),
        sheetUrl: sheetUrl.trim(),
        jamMasukThreshold: threshold.trim(),
        guruToleransiMenit: Number(guruToleransiMenit) || 0,
        guruTanpaJadwalWajibHadir: Boolean(guruTanpaJadwalWajibHadir),
        schoolLatitude: lat,
        schoolLongitude: lng,
        schoolRadiusMeters,
        requireLocation,
        quotaPeriode,
        quotaIzin: Number(quotaIzin),
        quotaSakit: Number(quotaSakit),
        quotaAlpa: Number(quotaAlpa),
        quotaDinasLuar: Number(quotaDinasLuar),
        quotaTanggalMulai
      });
      setTestResult({
        success: true,
        message: 'Pengaturan, Titik GPS Sekolah, Kebijakan Kehadiran, dan Kuota berhasil tersimpan & tersinkronisasi ke Google Sheets!'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Gagal menyimpan pengaturan: ' + (err.message || 'Error jaringan')
      });
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await onTestConnection();
      setTestResult({ success: true, message: 'Koneksi berhasil! Google Apps Script siap digunakan.' });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Koneksi gagal. Pastikan URL benar dan di-deploy dengan opsi "Siapa Saja" (Anyone).'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    const res = await onSeedMasterData();
    setSeedResult(res);
    setIsSeeding(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Title */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center text-[#2F5597] shrink-0">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            Integrasi Google Sheets & Apps Script Backend
          </h2>
          <p className="text-xs text-slate-500">
            Hubungkan aplikasi ini ke Google Sheets sekolah Anda agar semua data tersimpan permanen secara real-time.
          </p>
        </div>
      </div>

      {/* Connection & Configuration Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-[#2F5597]" />
          <span>Pengaturan URL & Ambang Jam Masuk</span>
        </h3>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="setting-webapp-url" className="block text-xs font-bold text-slate-700 mb-1">
              URL Google Apps Script Web App <span className="text-rose-500">*</span>
            </label>
            <input
              type="url"
              id="setting-webapp-url"
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              value={webAppUrl}
              onChange={(e) => setWebAppUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-[#2F5597]"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Dapatkan URL ini dari menu Deploy &gt; New Deployment &gt; Web App di Google Apps Script Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="setting-sheet-url" className="block text-xs font-bold text-slate-700 mb-1">
                URL Google Sheet (Opsional)
              </label>
              <input
                type="url"
                id="setting-sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-[#2F5597]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Link spreadsheet langsung.
              </p>
            </div>

            <div>
              <label htmlFor="setting-threshold" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#2F5597]" />
                <span>Batas hadir Staf &amp; Jabatan (default 07:25)</span>
              </label>
              <input
                type="time"
                id="setting-threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold focus:ring-2 focus:ring-[#2F5597]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Batas presensi tepat waktu untuk Staf dan Guru dengan tugas struktural/jabatan.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Keamanan Hak Akses (Script Properties)</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                PIN Admin (<code className="font-mono font-bold bg-amber-100/80 px-1 py-0.5 rounded">PIN_ADMIN</code>) dan PIN Kurikulum (<code className="font-mono font-bold bg-amber-100/80 px-1 py-0.5 rounded">PIN_KURIKULUM</code>) divalidasi langsung oleh server Apps Script. PIN tidak disimpan di browser.
              </p>
            </div>
          </div>

          {/* Aturan Presensi Guru & Jadwal */}
          <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-black">ATURAN GURU</span>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                Toleransi Jam Mengajar &amp; Kewajiban Kehadiran Guru
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="setting-guru-toleransi" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#2F5597]" />
                  <span>Toleransi Jam Masuk Guru (Menit)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  id="setting-guru-toleransi"
                  value={guruToleransiMenit}
                  onChange={(e) => setGuruToleransiMenit(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold focus:ring-2 focus:ring-[#2F5597]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Batas hadir guru = Jam mulai sesi pertama dikurangi toleransi ini (default: 0 menit).
                </p>
              </div>

              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="setting-guru-tanpa-jadwal"
                  checked={guruTanpaJadwalWajibHadir}
                  onChange={(e) => setGuruTanpaJadwalWajibHadir(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[#2F5597] rounded border-slate-300 focus:ring-[#2F5597] cursor-pointer"
                />
                <label htmlFor="setting-guru-tanpa-jadwal" className="text-xs text-slate-700 cursor-pointer">
                  <span className="font-bold block text-slate-900">Guru Tanpa Jadwal Wajib Hadir</span>
                  <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                    Jika tidak aktif (default), guru yang hari itu tidak mengajar tidak wajib hadir dan tidak dihitung alpa.
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Quota Settings Section */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2F5597]" />
              <h4 className="text-sm font-bold text-slate-800">
                Kuota Kehadiran &amp; Batas Ketidakhadiran Guru/Staf
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jenis Periode Hitung Kuota
                </label>
                <select
                  value={quotaPeriode}
                  onChange={(e) => setQuotaPeriode(e.target.value as 'Bulanan' | 'Semester')}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
                >
                  <option value="Bulanan">Bulanan (Reset setiap awal bulan)</option>
                  <option value="Semester">Semesteran (Dihitung sejak awal semester)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pilih acuan akumulasi hitungan kuota di Dashboard.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tanggal Mulai Periode Berjalan
                </label>
                <input
                  type="date"
                  value={quotaTanggalMulai}
                  onChange={(e) => setQuotaTanggalMulai(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Sangat penting jika memilih semester (contoh: awal semester 1 Juli).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200">
                <label className="block text-xs font-bold text-blue-900 mb-1">
                  Maksimal Izin
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={quotaIzin}
                    onChange={(e) => setQuotaIzin(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center"
                  />
                  <span className="text-xs font-semibold text-slate-600 shrink-0">kali</span>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200">
                <label className="block text-xs font-bold text-indigo-900 mb-1">
                  Maksimal Sakit
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={quotaSakit}
                    onChange={(e) => setQuotaSakit(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center"
                  />
                  <span className="text-xs font-semibold text-slate-600 shrink-0">kali</span>
                </div>
              </div>

              <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200">
                <label className="block text-xs font-bold text-rose-900 mb-1">
                  Maksimal Alpa
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={quotaAlpa}
                    onChange={(e) => setQuotaAlpa(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center"
                  />
                  <span className="text-xs font-semibold text-slate-600 shrink-0">kali</span>
                </div>
              </div>

              <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200">
                <label className="block text-xs font-bold text-purple-900 mb-1">
                  Maksimal Dinas Luar
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={quotaDinasLuar}
                    onChange={(e) => setQuotaDinasLuar(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center"
                  />
                  <span className="text-xs font-semibold text-slate-600 shrink-0">kali</span>
                </div>
              </div>
            </div>
          </div>

          {/* School GPS Coordinates & Geofencing Section */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-800">
                  Titik Koordinat GPS &amp; Radius Sekolah
                </h4>
              </div>
              <button
                type="button"
                onClick={handleResetGpsDefault}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-bold bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition"
              >
                Reset ke Titik Resmi SMP
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Latitude Sekolah:
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={schoolLatitude}
                  onChange={(e) => setSchoolLatitude(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                />
                <span className="text-[10.5px] text-slate-500">Resmi: -8.009330 (Minus)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Longitude Sekolah:
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={schoolLongitude}
                  onChange={(e) => setSchoolLongitude(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                />
                <span className="text-[10.5px] text-slate-500">Resmi: 114.421731</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Radius Toleransi:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={20}
                    max={1000}
                    value={schoolRadiusMeters}
                    onChange={(e) => setSchoolRadiusMeters(parseInt(e.target.value) || 100)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 text-center"
                  />
                  <span className="text-xs font-bold text-slate-600 shrink-0">meter</span>
                </div>
                <span className="text-[10.5px] text-slate-500">Bawaan: 150 meter</span>
              </div>
            </div>

            {parseFloat(String(schoolLatitude).replace(',', '.')) > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Peringatan: Nilai Latitude positif (+{schoolLatitude}). Wilayah Jawa Timur harus bertanda minus (-8.009330).</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/60 p-3 rounded-xl border border-blue-200">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireLocation}
                  onChange={(e) => setRequireLocation(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Wajibkan Validasi Jarak GPS (Geofencing)</span>
                  <span className="text-[11px] text-slate-500">Jika dimatikan, guru bisa presensi tanpa dibatasi jarak koordinat.</span>
                </div>
              </label>

              <a
                href={`https://maps.google.com/?q=${schoolLatitude},${schoolLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-blue-300 shadow-2xs"
              >
                <span>Buka Titik di Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Menguji...' : 'Uji Koneksi Backend'}</span>
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
            >
              Simpan Pengaturan
            </button>
          </div>
        </form>

        {testResult && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Auto Seed Master Data Card */}
      {webAppUrl && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-[#2F5597]" />
                <span>Upload Master Data Guru ke Google Sheet</span>
              </h4>
              <p className="text-xs text-slate-600 mt-1">
                Kirim data roster {masterCount} guru/staf SMP Nurul Abror Al-Robbaniyin saat ini langsung ke sheet{' '}
                <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[11px]">Master_Guru_Staf</code>{' '}
                di Google Sheets Anda.
              </p>
            </div>
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="px-4 py-2 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${isSeeding ? 'animate-bounce' : ''}`} />
              <span>{isSeeding ? 'Mengirim...' : 'Upload Data Master'}</span>
            </button>
          </div>

          {seedResult && (
            <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs font-semibold text-slate-800">
              {seedResult.message}
            </div>
          )}
        </div>
      )}

      {/* Apps Script Code Generator */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#2F5597]" />
              <span>Kode Backend Apps Script (Code.gs)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Salin kode di bawah ini lalu tempel di Google Apps Script editor. Jika skrip sudah pernah dipasang, wajib salin ulang dan deploy ulang (<strong>Deploy &gt; Manage deployments &gt; Edit &gt; New version</strong>).
            </p>
          </div>

          <button
            onClick={handleCopyCode}
            className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shrink-0 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Kode Tersalin!' : 'Salin Kode Code.gs'}</span>
          </button>
        </div>

        <div className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto text-xs font-mono max-h-72 border border-slate-800">
          <pre>{APPS_SCRIPT_CODE}</pre>
        </div>
      </div>

      {/* Step-by-Step Setup Instructions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-[#2F5597]" />
          <span>Panduan Langkah-Langkah Setup dari Nol</span>
        </h3>

        <div className="space-y-4 text-xs sm:text-sm text-slate-700">
          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              1
            </span>
            <div>
              <div className="font-bold text-slate-900">Buat Google Spreadsheet Baru</div>
              <p className="text-slate-600 mt-0.5">
                Buka Google Drive (<a href="https://drive.google.com" target="_blank" rel="noreferrer" className="text-[#2F5597] underline">drive.google.com</a>), buat Spreadsheet baru dan beri nama <span className="font-semibold">"Presensi SMP Nurul Abror"</span>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              2
            </span>
            <div>
              <div className="font-bold text-slate-900">Buka Apps Script Editor</div>
              <p className="text-slate-600 mt-0.5">
                Di Google Sheet tersebut, klik menu atas: <span className="font-semibold">Ekstensi (Extensions) &gt; Apps Script</span>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              3
            </span>
            <div>
              <div className="font-bold text-slate-900">Tempel Kode Code.gs</div>
              <p className="text-slate-600 mt-0.5">
                Hapus seluruh isi file <code className="bg-slate-200 px-1 rounded">Code.gs</code>, lalu tempel kode yang sudah disalin dari tombol hijau di atas. Klik ikon <span className="font-semibold">Simpan (Disket)</span>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              4
            </span>
            <div>
              <div className="font-bold text-slate-900">Deploy sebagai Web App</div>
              <p className="text-slate-600 mt-0.5">
                Klik tombol <span className="font-semibold bg-blue-100 text-[#2F5597] px-2 py-0.5 rounded">Terapkan (Deploy)</span> kanan atas &gt; <span className="font-semibold">Penerapan baru (New Deployment)</span>.
              </p>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-600">
                <li>Pilih jenis penerapan: <span className="font-bold text-slate-900">Aplikasi Web (Web App)</span></li>
                <li>Jalankan sebagai: <span className="font-bold text-slate-900">Saya (Me / email anda)</span></li>
                <li>Siapa yang memiliki akses: <span className="font-bold text-emerald-700">Siapa saja (Anyone)</span> &larr; <span className="italic">PENTING agar tidak butuh login!</span></li>
              </ul>
              <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 leading-relaxed">
                <strong>⚠️ Update Skrip yang Sudah Ada:</strong> Jika Anda memperbarui skrip yang sudah terpasang sebelumnya, wajib salin ulang kode di atas dan lakukan deploy ulang: <strong>Deploy &gt; Manage deployments &gt; Edit (ikon pensil) &gt; Versi: New version &gt; Deploy</strong> agar tab baru (seperti <code className="font-mono font-bold">Data_Cuti</code>) serta penyimpanan massal cepat aktif otomatis.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              5
            </span>
            <div>
              <div className="font-bold text-slate-900">Atur PIN Server di Script Properties (Wajib)</div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                Di editor Apps Script, klik ikon <span className="font-semibold">Gerigi (Project Settings / Setelan Proyek)</span> di menu sisi kiri. Gulir ke bagian bawah ke tabel <span className="font-semibold">Script Properties (Properti Skrip)</span>, klik <span className="font-semibold">"Add script property"</span> dan masukkan:
              </p>
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-slate-700 font-mono text-xs">
                <li><span className="font-bold text-[#2F5597]">PIN_ADMIN</span> : Masukkan PIN rahasia Admin (contoh: <code>1234</code>)</li>
                <li><span className="font-bold text-[#2F5597]">PIN_KURIKULUM</span> : Masukkan PIN rahasia Kurikulum (contoh: <code>5678</code>)</li>
              </ul>
              <p className="text-slate-600 mt-1 text-[11px]">
                Lalu klik <strong>Save script properties</strong>. PIN ini aman di server Google dan tidak dapat dilihat oleh pengguna biasa.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="w-6 h-6 rounded-full bg-[#2F5597] text-white font-bold flex items-center justify-center shrink-0 text-xs">
              6
            </span>
            <div>
              <div className="font-bold text-slate-900">Salin URL &amp; Tempel di Aplikasi</div>
              <p className="text-slate-600 mt-0.5">
                Berikan izin akses (Authorize) saat diminta Google. Setelah selesai, salin <span className="font-semibold">URL Aplikasi Web</span> yang berakhiran <code className="bg-slate-200 px-1 rounded">/exec</code> dan tempelkan ke kolom URL di bagian atas halaman ini.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Download,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  HelpCircle,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import { AppSettings, TestApiResponse } from '../types';
import { testFetchMaster, testPostDummy, APPS_SCRIPT_CODE } from '../utils/googleAppsScript';

interface DiagnostikKoneksiProps {
  settings: AppSettings;
  onUpdateUrl?: (newUrl: string) => void;
}

export const DiagnostikKoneksi: React.FC<DiagnostikKoneksiProps> = ({ settings, onUpdateUrl }) => {
  const [currentUrl, setCurrentUrl] = useState<string>(settings.webAppUrl);
  const [testingMaster, setTestingMaster] = useState<boolean>(false);
  const [testingPost, setTestingPost] = useState<boolean>(false);
  
  const [masterResult, setMasterResult] = useState<TestApiResponse | null>(null);
  const [postResult, setPostResult] = useState<TestApiResponse | null>(null);

  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const handleTestMaster = async () => {
    setTestingMaster(true);
    setMasterResult(null);
    const result = await testFetchMaster(currentUrl);
    setMasterResult(result);
    setTestingMaster(false);
  };

  const handleTestPost = async () => {
    setTestingPost(true);
    setPostResult(null);
    const result = await testPostDummy(currentUrl);
    setPostResult(result);
    setTestingPost(false);
  };

  const copyAppsScriptCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-blue-50 text-[#2F5597] rounded-xl shrink-0 border border-blue-100">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Diagnostik &amp; Pengujian Koneksi Google Sheets</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Panel khusus untuk menguji endpoint Web App Apps Script, melihat raw response JSON, dan memeriksa status integrasi database.
              </p>
            </div>
          </div>

          {settings.sheetUrl && (
            <a
              href={settings.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-sm font-semibold transition-colors shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Buka Google Sheets Saya</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          )}
        </div>

        {/* Current URL Display */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
            URL Google Apps Script Web App Aktif Saat Ini:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={currentUrl}
              onChange={(e) => {
                setCurrentUrl(e.target.value);
                if (onUpdateUrl) onUpdateUrl(e.target.value);
              }}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
            />
          </div>
          {!currentUrl && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>URL Web App belum terpasang. Aplikasi saat ini berjalan dalam Mode Demo/Lokal.</span>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostic Action Buttons & Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test 1: GET Master Data */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">1. Tes Ambil Data Master (GET)</h3>
                <p className="text-xs text-slate-500">Memanggil action = master untuk melihat data dari Google Sheets</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-4">
            Tombol ini mengirim permintaan GET ke Web App untuk memastikan URL valid dan lembar <code className="bg-slate-100 px-1 rounded text-slate-800 font-mono">Master_Guru_Staf</code> dapat dibaca.
          </p>

          <button
            id="btn-tes-ambil-master"
            onClick={handleTestMaster}
            disabled={testingMaster || !currentUrl}
            className="w-full py-2.5 px-4 bg-[#2F5597] hover:bg-[#234278] disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            {testingMaster ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Memanggil GET Web App...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Tes Ambil Data Master</span>
              </>
            )}
          </button>

          {/* Test 1 Result Box */}
          {masterResult && (
            <div className="mt-5 space-y-3 flex-1 flex flex-col">
              {/* Status Header */}
              <div
                className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-between ${
                  masterResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {masterResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>
                    HTTP Status: <strong>{masterResult.httpStatus ?? 'Error'}</strong> {masterResult.statusText}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold bg-white/60">
                  {masterResult.success ? 'Berhasil' : 'Gagal'}
                </span>
              </div>

              {masterResult.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Pesan Error:</strong>
                    <span>{masterResult.error}</span>
                  </div>
                </div>
              )}

              {/* Raw JSON View */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-1">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5" />
                    Response Mentah (Raw JSON):
                  </span>
                  <span>{masterResult.rawText.length} karakter</span>
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-64 scrollbar-thin">
                  {masterResult.rawText || '(Response Kosong)'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Test 2: POST Dummy Data */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-[#2F5597] rounded-lg">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">2. Tes Kirim Data Contoh (POST)</h3>
                <p className="text-xs text-slate-500">Mengirim 1 baris dummy ke sheet Log_Presensi</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-4">
            Tombol ini mengirim payload POST dengan nama <code className="bg-slate-100 px-1 rounded text-slate-800 font-mono">GURU_TES_DIAGNOSTIK</code> untuk menguji hak akses penulisan ke Google Sheets.
          </p>

          <button
            id="btn-tes-kirim-contoh"
            onClick={handleTestPost}
            disabled={testingPost || !currentUrl}
            className="w-full py-2.5 px-4 bg-[#2F5597] hover:bg-[#234278] disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            {testingPost ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Mengirim POST Payload...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Tes Kirim Data Contoh</span>
              </>
            )}
          </button>

          {/* Test 2 Result Box */}
          {postResult && (
            <div className="mt-5 space-y-3 flex-1 flex flex-col">
              {/* Status Header */}
              <div
                className={`p-3 rounded-lg border text-xs font-semibold flex items-center justify-between ${
                  postResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {postResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>
                    HTTP Status: <strong>{postResult.httpStatus ?? 'Error'}</strong> {postResult.statusText}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold bg-white/60">
                  {postResult.success ? 'Berhasil' : 'Gagal'}
                </span>
              </div>

              {postResult.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold">Pesan Error:</strong>
                    <span>{postResult.error}</span>
                  </div>
                </div>
              )}

              {/* Raw JSON View */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-1">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5" />
                    Response Mentah (Raw JSON):
                  </span>
                  <span>{postResult.rawText.length} karakter</span>
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-64 scrollbar-thin">
                  {postResult.rawText || '(Response Kosong)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostic Checklist & Deployment Rules */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Panduan &amp; Checklist Troubleshooting Aplikasi Web Apps Script</h3>
            <p className="text-xs text-slate-500">Periksa 5 poin berikut jika data tidak muncul atau terjadi error sinkronisasi</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
          {/* Check 1 */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Layers className="w-4 h-4 text-[#2F5597]" />
              <span>1. Nama Tab / Sheet Harus Persis Sama</span>
            </div>
            <p className="text-slate-600">
              Pastikan nama tab di Google Sheets Anda persis sama (huruf besar/kecil &amp; garis bawah):
            </p>
            <ul className="list-disc list-inside font-mono text-[11px] text-slate-800 space-y-1 bg-white p-2 rounded border border-slate-200">
              <li>Master_Guru_Staf</li>
              <li>Log_Presensi</li>
            </ul>
          </div>

          {/* Check 2 */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>2. Pengaturan Deployment Web App</span>
            </div>
            <p className="text-slate-600">
              Saat klik <strong>Deploy &gt; New deployment</strong> di Google Apps Script:
            </p>
            <ul className="list-disc list-inside text-slate-800 space-y-1 bg-white p-2 rounded border border-slate-200">
              <li>Execute as (Jalankan sebagai): <strong>Me (Saya)</strong></li>
              <li>Who has access (Akses): <strong>Anyone (Siapa saja)</strong></li>
              <li>URL Wajib berakhiran <strong>/exec</strong> (Bukan /dev atau script editor)</li>
            </ul>
          </div>

          {/* Check 3 */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <span>3. Cara Update Deploy saat Kode Diubah</span>
            </div>
            <p className="text-slate-600">
              Jika Anda mengubah kode di Apps Script:
            </p>
            <div className="bg-white p-2 rounded border border-slate-200 text-slate-800 space-y-1">
              <p><strong>Agar URL Tidak Berubah:</strong></p>
              <p className="text-slate-600">Pilih <em>Deploy &gt; Manage deployments &gt; Edit (icon pensil) &gt; Version: New version &gt; Deploy</em>.</p>
              <p className="text-slate-600 mt-1">Jika memilih <em>New deployment</em>, URL akan berganti baru dan harus disalin ulang ke aplikasi ini.</p>
            </div>
          </div>

          {/* Check 4 */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>4. Header Kolom Sheet Master_Guru_Staf</span>
            </div>
            <p className="text-slate-600">
              Pastikan baris 1 tab <code className="font-mono bg-white px-1">Master_Guru_Staf</code> berisi kolom:
            </p>
            <p className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 text-slate-800">
              No, Nama (Guru dan Staf), Jabatan Struktural, Mapel Diampu - Sabtu, Mapel Diampu - Ahad, Mapel Diampu - Senin, Mapel Diampu - Selasa, Mapel Diampu - Rabu, Mapel Diampu - Kamis
            </p>
          </div>
        </div>

        {/* Apps Script Code Copy Section */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Salin Kode Apps Script Terkini (Backend Code.gs)</h4>
            <p className="text-xs text-slate-500">
              Termasuk penanganan batch upsert, CORS text/plain parsing, dan perbaikan nama kolom.
            </p>
          </div>
          <button
            onClick={copyAppsScriptCode}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors shadow-sm"
          >
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Kode Berhasil Disalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Salin Kode Backend Code.gs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

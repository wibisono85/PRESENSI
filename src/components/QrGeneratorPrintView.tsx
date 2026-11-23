import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MasterGuruStaf, AppSettings } from '../types';
import { getSchoolGateDirectUrl } from '../utils/qrAndGeoUtils';
import { TeacherIdCard } from './TeacherIdCard';
import { 
  Printer, 
  School, 
  Sparkles, 
  Download, 
  Layers, 
  ShieldCheck, 
  CreditCard, 
  Globe, 
  Scissors,
  CheckCircle2,
  Info
} from 'lucide-react';

interface QrGeneratorPrintViewProps {
  masterList: MasterGuruStaf[];
  settings: AppSettings;
}

export const QrGeneratorPrintView: React.FC<QrGeneratorPrintViewProps> = ({
  masterList,
  settings
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'kartu_guru' | 'poster_sekolah'>('kartu_guru');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [sideMode, setSideMode] = useState<'front' | 'back' | 'both'>('front');
  const [showCutGuides, setShowCutGuides] = useState<boolean>(true);

  const schoolQrData = getSchoolGateDirectUrl(settings.schoolQrSecret);

  const filteredTeachers = selectedTeacherFilter === 'all'
    ? masterList
    : masterList.filter(m => m.nama === selectedTeacherFilter);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Sub Tabs Navigation */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSubTab('kartu_guru')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition ${
              activeSubTab === 'kartu_guru'
                ? 'bg-[#183153] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4 text-amber-300" />
            <span>1. Cetak &amp; Download ID Card Guru (Ukuran Standar 54x86 mm)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('poster_sekolah')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition ${
              activeSubTab === 'poster_sekolah'
                ? 'bg-[#183153] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <School className="w-4 h-4 text-amber-300" />
            <span>2. Poster QR Gerbang Sekolah</span>
          </button>
        </div>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs sm:text-sm font-bold shadow-xs transition ml-auto active:scale-98"
        >
          <Printer className="w-4 h-4 text-emerald-200" />
          <span>Cetak Dokumen (Print / PDF)</span>
        </button>
      </div>

      {/* VIEW 1: Cetak & Download Kartu ID Guru */}
      {activeSubTab === 'kartu_guru' && (
        <div className="space-y-4">
          {/* Information & Feature Highlight Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-xl p-3.5 print:hidden shadow-2xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5 shadow-2xs">
                  <CreditCard className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                    <span>Format Kartu ID Standar Dompet &amp; Lanyard (CR80: 54 &times; 86 mm)</span>
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Kompak &amp; Pas Dibawa
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    Desain kartu telah disesuaikan dengan dimensi resmi kartu pengenal (CR80). Pas masuk ke dompet, saku baju, maupun holder plastik gantungan leher (lanyard). Guru dapat langsung mengarahkan Google Lens atau kamera HP ke QR Code kartu untuk presensi mandiri.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <Scissors className="w-3.5 h-3.5 text-slate-400" />
                  Dilengkapi Garis Potong A4
                </span>
              </div>
            </div>
          </div>

          {/* Filter & Customization Toolbar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
            {/* Left Filter: Teacher selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Pilih Guru:</span>
              <select
                value={selectedTeacherFilter}
                onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[260px]"
              >
                <option value="all">Semua Guru &amp; Staf ({masterList.length} Orang)</option>
                {masterList.map((t, idx) => (
                  <option key={`qr-opt-${t.no || idx}-${t.nama}-${idx}`} value={t.nama}>
                    {t.nama} - {t.jabatan}
                  </option>
                ))}
              </select>
            </div>

            {/* Middle Controls: Sisi Kartu */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Tampilan Cetak:</span>
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSideMode('front')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    sideMode === 'front'
                      ? 'bg-white text-[#183153] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sisi Depan
                </button>
                <button
                  type="button"
                  onClick={() => setSideMode('back')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    sideMode === 'back'
                      ? 'bg-white text-[#183153] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sisi Belakang
                </button>
                <button
                  type="button"
                  onClick={() => setSideMode('both')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition ${
                    sideMode === 'both'
                      ? 'bg-white text-[#183153] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dua Sisi (Bolak-Balik)
                </button>
              </div>
            </div>

            {/* Right Toggle: Cut Guides */}
            <div className="flex items-center gap-2 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCutGuides}
                  onChange={(e) => setShowCutGuides(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Tampilkan Garis Potong</span>
              </label>
            </div>
          </div>

          {/* Printable Cards Grid */}
          {/* On screen: responsive grid of standard compact cards */}
          {/* On print: strict 3-column A4 grid (9 cards per sheet) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:hidden">
            {filteredTeachers.map((teacher, idx) => (
              <TeacherIdCard
                key={`screen-${teacher.no || idx}-${teacher.nama}-${idx}`}
                teacher={teacher}
                settings={settings}
                sideMode={sideMode}
                showCutGuides={showCutGuides}
              />
            ))}
          </div>

          {/* Hidden on screen, Active ONLY when printing to A4 PDF */}
          <div className="hidden print:block id-cards-a4-grid">
            {filteredTeachers.map((teacher, idx) => (
              <TeacherIdCard
                key={`print-${teacher.no || idx}-${teacher.nama}-${idx}`}
                teacher={teacher}
                settings={settings}
                sideMode={sideMode}
                showCutGuides={showCutGuides}
              />
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: Poster QR Gerbang Sekolah */}
      {activeSubTab === 'poster_sekolah' && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-2xl bg-white border border-slate-300 shadow-md rounded-2xl p-6 sm:p-10 text-center relative overflow-hidden print:border-none print:shadow-none print:p-4">
            {/* Top decorative header */}
            <div className="border-b-2 border-[#183153] pb-6 mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 border border-blue-200 rounded-2xl mb-3 shadow-2xs">
                <School className="w-9 h-9 text-[#183153]" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
                SMP Nurul Abror Al-Robbaniyin
              </h2>
              <p className="text-sm font-bold text-[#183153] mt-0.5">
                POSTER RESMI TITIK PRESENSI KEHADIRAN GURU &amp; STAF
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Tahun Ajaran Aktif &bull; Sistem Presensi Terintegrasi
              </p>
            </div>

            {/* QR Code Canvas */}
            <div className="flex flex-col items-center justify-center my-6">
              <div className="p-4 bg-white border-3 border-slate-800 rounded-2xl shadow-sm inline-block">
                <QRCodeSVG
                  value={schoolQrData}
                  size={230}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-amber-900 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Kode Titik Gerbang: {settings.schoolQrSecret || 'SMP-NA-PRESENSI-2026'}</span>
              </div>
            </div>

            {/* Instruction Steps for Teachers */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left max-w-md mx-auto mb-6">
              <h4 className="text-xs font-bold text-slate-800 uppercase mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Petunjuk Scan Guru (HP Pribadi):
              </h4>
              <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed font-medium">
                <li>Buka aplikasi <strong>Google Lens</strong> atau <strong>Kamera HP</strong> Anda.</li>
                <li>Arahkan kamera ke QR Code poster ini atau barcode kartu ID Anda.</li>
                <li>Sentuh tautan web yang muncul di layar HP.</li>
                <li>Sistem akan otomatis mendeteksi lokasi GPS dan mencatat presensi Anda.</li>
              </ol>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-4 font-medium">
              Ditempel di Lobi Utama / Gerbang Sekolah &bull; Dilindungi Validasi Radius GPS &amp; Kunci Perangkat
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

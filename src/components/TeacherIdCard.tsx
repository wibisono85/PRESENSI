import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { MasterGuruStaf, AppSettings } from '../types';
import { getTeacherQrCode, getTeacherDirectUrl } from '../utils/qrAndGeoUtils';
import { buildMapelString } from '../utils/jadwalEngine';
import { 
  Download, 
  RotateCw, 
  Camera,
  ShieldCheck,
  Award,
  CheckCircle2, 
  Sparkles,
  Scissors
} from 'lucide-react';

interface TeacherIdCardProps {
  teacher: MasterGuruStaf;
  settings: AppSettings;
  sideMode?: 'front' | 'back' | 'both';
  showCutGuides?: boolean;
}

export const TeacherIdCard: React.FC<TeacherIdCardProps> = ({
  teacher,
  settings,
  sideMode = 'front',
  showCutGuides = true
}) => {
  const [currentSide, setCurrentSide] = useState<'front' | 'back'>('front');
  const [isDownloading, setIsDownloading] = useState(false);
  
  const frontCardRef = useRef<HTMLDivElement>(null);
  const backCardRef = useRef<HTMLDivElement>(null);

  const directUrl = getTeacherDirectUrl(teacher);
  const qrCodeRaw = getTeacherQrCode(teacher);

  // Get clean initials for avatar
  const getInitials = (name: string) => {
    if (!name) return 'NA';
    const clean = name.replace(/^(Drs\.|Dr\.|H\.|Hj\.|S\.Pd|M\.Pd|S\.Kom|S\.Ag|Lc)\.?\s+/gi, '').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length === 0) return 'NA';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const handleDownloadImage = async (targetSide: 'front' | 'back') => {
    const cardEl = targetSide === 'front' ? frontCardRef.current : backCardRef.current;
    if (!cardEl) return;

    try {
      setIsDownloading(true);
      // Generate ultra-crisp 300 DPI high-resolution image for printing or sharing
      const canvas = await html2canvas(cardEl, {
        scale: 4, // 4x scale ensures crispness on retina and physical printers
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
      });

      const cleanName = teacher.nama.replace(/[^a-zA-Z0-9]/g, '_');
      const sideLabel = targetSide === 'front' ? 'Depan' : 'Belakang';
      const link = document.createElement('a');
      link.download = `ID_Card_${cleanName}_${sideLabel}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Gagal mengunduh ID card:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const showFront = sideMode === 'both' || (sideMode === 'front' && currentSide === 'front') || (sideMode === 'back' && currentSide === 'front');
  const showBack = sideMode === 'both' || currentSide === 'back';

  return (
    <div className="flex flex-col items-center id-card-print-box break-inside-avoid">
      {/* Outer Card Container with Cutting Guides */}
      <div className="relative group">
        {showCutGuides && (
          <div className="absolute -inset-1.5 border border-dashed border-slate-300 rounded-[16px] pointer-events-none print:border-slate-400">
            <span className="hidden print:inline-block absolute -top-2.5 right-1.5 text-[6.5px] font-mono text-slate-500 bg-white px-1">
              ✂ 54x86mm
            </span>
          </div>
        )}

        {/* ========================================================
            SISI DEPAN (FRONT SIDE) - UKURAN STANDAR 54mm x 86mm
            ======================================================== */}
        {(sideMode === 'front' || sideMode === 'both' || currentSide === 'front') && (
          <div
            ref={frontCardRef}
            style={{
              width: '215px',
              height: '342px',
            }}
            className={`bg-white rounded-[12px] shadow-sm border border-slate-300 flex flex-col justify-between overflow-hidden relative select-none print:shadow-none print:border-slate-800 print:w-[54mm] print:h-[86mm] print:rounded-[3mm] ${
              sideMode === 'both' ? 'mb-4 print:mb-0' : currentSide === 'front' ? 'block' : 'hidden print:block'
            }`}
          >
            {/* Lanyard Punch Hole Indicator */}
            <div className="w-full pt-1.5 pb-0.5 flex justify-center bg-[#152a4a] print:bg-[#152a4a]">
              <div className="w-8 h-1 rounded-full bg-slate-400/40 border border-slate-500/30" />
            </div>

            {/* Top School Header */}
            <div className="bg-gradient-to-b from-[#152a4a] to-[#1e3d6b] text-white px-2 pb-1.5 text-center relative border-b-2 border-amber-400">
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                <img
                  src="./assets/aistudio/LOGO_SMP_ca9ab34f.png"
                  alt="Logo Sekolah"
                  className="w-4 h-4 rounded-full object-contain bg-white p-[1px] shrink-0"
                />
                <p className="text-[9px] font-black tracking-wide text-amber-300 uppercase leading-none">
                  SMP Nurul Abror
                </p>
              </div>
              <p className="text-[7.5px] text-blue-100 font-extrabold uppercase tracking-wider mt-0.5 leading-none">
                Al-Robbaniyin
              </p>
              <div className="mt-1 inline-block px-2 py-0.2 bg-amber-400/20 rounded-full border border-amber-400/40">
                <p className="text-[6.5px] text-amber-200 font-black tracking-widest uppercase leading-tight">
                  KARTU IDENTITAS GURU &amp; STAF
                </p>
              </div>
            </div>

            {/* Middle Body: Avatar & Info */}
            <div className="px-2 pt-1 text-center flex flex-col items-center">
              {/* Photo Avatar Badge */}
              <div className="relative mb-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#152a4a] to-[#25467A] text-white flex items-center justify-center font-black text-xs border-2 border-amber-400 shadow-xs">
                  {getInitials(teacher.nama)}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-600 text-white rounded-full p-0.5 border border-white">
                  <CheckCircle2 className="w-2 h-2" />
                </div>
              </div>

              {/* Name */}
              <h3 className="text-[10px] font-black text-slate-900 leading-tight line-clamp-2 max-w-[195px]">
                {teacher.nama}
              </h3>

              {/* Role & ID Badges */}
              <p className="text-[8px] font-bold text-[#1e3d6b] leading-none mt-0.5">
                {teacher.jabatan}
              </p>

              <span className="mt-1 text-[7.5px] font-mono font-black text-slate-600 px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded leading-none">
                {qrCodeRaw}
              </span>
            </div>

            {/* QR Code Container (Google Lens & Phone Camera Ready) */}
            <div className="flex flex-col items-center my-auto px-2">
              <div className="p-1 bg-white border border-slate-800 rounded-lg shadow-2xs">
                <QRCodeSVG
                  value={directUrl}
                  size={80}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[6.5px] font-bold text-slate-500">
                <Camera className="w-2 h-2 text-blue-600" />
                <span>Scan Google Lens / Kamera HP</span>
              </div>
            </div>

            {/* Footer Card */}
            <div className="bg-slate-50 border-t border-slate-200 px-2 py-0.5 flex items-center justify-between text-[6.5px] text-slate-500 font-medium">
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                <span>Presensi GPS Sah</span>
              </div>
              <span className="font-mono text-[6px] text-slate-400">TP. 2026/2027</span>
            </div>
          </div>
        )}

        {/* ========================================================
            SISI BELAKANG (BACK SIDE) - UKURAN STANDAR 54mm x 86mm
            ======================================================== */}
        {(sideMode === 'back' || (sideMode !== 'both' && currentSide === 'back')) && (
          <div
            ref={backCardRef}
            style={{
              width: '215px',
              height: '342px',
            }}
            className="bg-white rounded-[12px] shadow-sm border border-slate-300 flex flex-col justify-between overflow-hidden relative select-none print:shadow-none print:border-slate-800 print:w-[54mm] print:h-[86mm] print:rounded-[3mm]"
          >
            {/* Lanyard Punch Hole Indicator */}
            <div className="w-full pt-1.5 pb-0.5 flex justify-center bg-[#152a4a]">
              <div className="w-8 h-1 rounded-full bg-slate-400/40 border border-slate-500/30" />
            </div>

            {/* Top Header */}
            <div className="bg-[#152a4a] text-white px-2 py-1 text-center border-b-2 border-amber-400">
              <p className="text-[8px] font-black text-amber-300 uppercase tracking-wide">
                KETENTUAN KARTU PRESENSI
              </p>
              <p className="text-[6.5px] text-slate-200">SMP Nurul Abror Al-Robbaniyin</p>
            </div>

            {/* Jadwal Mengajar Guru di Sisi Belakang */}
            <div className="px-2 py-1 bg-slate-50 border-b border-slate-200">
              <p className="text-[6.5px] font-black text-[#152a4a] uppercase tracking-wider mb-1">
                Jadwal Mengajar Mingguan:
              </p>
              <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 text-[6px] text-slate-700">
                <div className="truncate"><strong className="text-slate-900">Sab:</strong> {buildMapelString(teacher, 'Sabtu')}</div>
                <div className="truncate"><strong className="text-slate-900">Ahad:</strong> {buildMapelString(teacher, 'Ahad')}</div>
                <div className="truncate"><strong className="text-slate-900">Sen:</strong> {buildMapelString(teacher, 'Senin')}</div>
                <div className="truncate"><strong className="text-slate-900">Sel:</strong> {buildMapelString(teacher, 'Selasa')}</div>
                <div className="truncate"><strong className="text-slate-900">Rab:</strong> {buildMapelString(teacher, 'Rabu')}</div>
                <div className="truncate"><strong className="text-slate-900">Kam:</strong> {buildMapelString(teacher, 'Kamis')}</div>
              </div>
            </div>

            {/* Rules List */}
            <div className="p-2 text-slate-700 text-[6.5px] leading-tight space-y-0.5">
              <div className="flex items-start gap-1">
                <span className="font-black text-[#1e3d6b]">1.</span>
                <p>Kartu identitas resmi kehadiran Guru &amp; Staf SMP Nurul Abror.</p>
              </div>
              <div className="flex items-start gap-1">
                <span className="font-black text-[#1e3d6b]">2.</span>
                <p>Scan barcode dengan <strong>Google Lens</strong> / kamera HP.</p>
              </div>
              <div className="flex items-start gap-1">
                <span className="font-black text-[#1e3d6b]">3.</span>
                <p>Presensi sah hanya di <strong>radius GPS sekolah</strong>.</p>
              </div>
              <div className="flex items-start gap-1">
                <span className="font-black text-[#1e3d6b]">4.</span>
                <p>Toleransi jam kedatangan disesuaikan otomatis dengan jadwal mengajar.</p>
              </div>
            </div>

            {/* Validation Stamp & Signature */}
            <div className="px-2.5 pb-1.5 pt-1 border-t border-slate-100 flex items-center justify-between text-[6.5px]">
              <div>
                <p className="text-slate-400 font-mono text-[6px]">KODE REGISTRASI:</p>
                <p className="font-mono font-black text-slate-800 text-[7.5px]">{qrCodeRaw}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 font-medium">Banyuwangi, 2026</p>
                <p className="font-bold text-slate-800 text-[7px] mt-0.5">Kepala Sekolah</p>
                <div className="inline-block mt-0.5 px-1 py-0.2 bg-emerald-50 border border-emerald-300 rounded text-[6px] text-emerald-800 font-bold">
                  ✓ TERVALIDASI
                </div>
              </div>
            </div>

            {/* Footer Card */}
            <div className="bg-[#152a4a] text-amber-200 px-2 py-0.5 text-center text-[6px] font-bold tracking-wider uppercase">
              Mencetak Generasi Berakhlak &amp; Berprestasi
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons under each card (Hidden when Printing) */}
      <div className="mt-2 flex items-center gap-1.5 print:hidden">
        {/* Flip Side Button */}
        <button
          onClick={() => setCurrentSide(prev => (prev === 'front' ? 'back' : 'front'))}
          className="flex items-center gap-1 px-2 py-1 text-[9.5px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs transition active:scale-95"
          title="Putar kartu untuk melihat sisi depan / belakang"
        >
          <RotateCw className="w-2.5 h-2.5 text-[#1e3d6b]" />
          <span>{currentSide === 'front' ? 'Belakang' : 'Depan'}</span>
        </button>

        {/* Download PNG Button */}
        <button
          disabled={isDownloading}
          onClick={() => handleDownloadImage(currentSide)}
          className="flex items-center gap-1 px-2 py-1 text-[9.5px] font-bold rounded-lg bg-[#1e3d6b] hover:bg-[#152a4a] text-white shadow-2xs transition active:scale-95 disabled:opacity-50"
          title="Download gambar ID Card PNG siap cetak / simpan di HP"
        >
          <Download className="w-2.5 h-2.5 text-amber-300" />
          <span>{isDownloading ? 'Menyimpan...' : 'Download PNG'}</span>
        </button>
      </div>
    </div>
  );
};


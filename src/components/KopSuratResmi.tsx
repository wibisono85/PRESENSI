import React from 'react';

/**
 * Kop Surat Resmi SMP Nurul Abror Al-Robbaniyin
 * Disusun sama persis dengan dokumen resmi sekolah:
 * - Logo di sisi kiri
 * - Yayasan, Nama Sekolah, TERAKREDITASI, NSS / NPSN / NIS, E_Mail
 * - Kotak alamat berbingkai ganda di bagian bawah kop
 */
export const KopSuratResmi: React.FC = () => {
  return (
    <div className="w-full text-slate-900 select-text">
      <div className="flex items-center gap-3 sm:gap-5 px-2 pb-2.5">
        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
          <img
            src="./assets/aistudio/LOGO_SMP_ca9ab34f.png"
            alt="Logo SMP Nurul Abror Al-Robbaniyin"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex-1 text-center leading-snug">
          <p className="text-[12px] sm:text-[13px] font-semibold tracking-wide text-slate-800 uppercase">
            YAYASAN NURUL ABROR AL-ROBBANIYIN
          </p>
          <h1 className="text-[16px] sm:text-[18px] font-bold tracking-tight text-slate-900 mt-0.5">
            SMP Nurul Abror Al &ndash; Robbaniyin
          </h1>
          <p className="text-[11px] sm:text-[12px] font-semibold tracking-wider text-slate-800 uppercase">
            TERAKREDITASI
          </p>
          <p className="text-[10.5px] sm:text-[11.5px] font-medium text-slate-800 mt-0.5 flex flex-wrap items-center justify-center gap-x-4">
            <span>NSS: 202052521240</span>
            <span>NPSN: 20574616</span>
            <span>NIS: 201720</span>
          </p>
          <p className="text-[10.5px] sm:text-[11.5px] font-medium text-slate-800">
            E_Mail: smpnaa_alrobbany@yahoo.com
          </p>
        </div>

        {/* Penyeimbang visual agar teks kop tepat di tengah kertas */}
        <div className="hidden sm:block w-14 shrink-0" aria-hidden="true" />
      </div>

      {/* Kotak alamat berbingkai ganda seperti pada dokumen resmi PDF */}
      <div className="border-[3px] border-double border-slate-900 px-3 py-1.5 text-center bg-white">
        <p className="text-[10.5px] sm:text-[11.5px] font-semibold text-slate-900">
          Alamat : Jl. KH. Agus Salim 165 (0333) 461440 Alasbuluh Wongsorejo Banyuwangi 68453
        </p>
      </div>
    </div>
  );
};

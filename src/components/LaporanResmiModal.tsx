import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, LogPresensi, MasterGuruStaf } from '../types';
import { formatDateISO, formatLongDateIndonesian } from '../utils/dateUtils';
import { determineTeacherPeran } from '../utils/scheduleTimeEvaluator';
import { KopSuratResmi } from './KopSuratResmi';
import { Download, FileText, Info, Printer, X } from 'lucide-react';

export type LaporanPeriodeMode = 'bulanan' | 'semester' | 'custom';
export type LaporanKategoriFilter = 'semua' | 'guru' | 'staf';

interface LaporanResmiModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogPresensi[];
  masterList: MasterGuruStaf[];
  settings?: AppSettings;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

interface SimpleRekapRow {
  nama: string;
  jabatan: string;
  kehadiran: number;
  tepatWaktu: number;
  terlambat: number;
  alpa: number;
  izin: number;
  sakit: number;
  dinasLuar: number;
  cuti: number;
}

const BULAN_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateIndonesianShortMonth(iso: string): string {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const year = parseInt(parts[0], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(monthIdx) || isNaN(day) || !BULAN_NAMES[monthIdx]) return iso;
  return `${day} ${BULAN_NAMES[monthIdx]} ${year}`;
}

function getMonthRange(year: number, monthIndexZero: number): { startDate: string; endDate: string } {
  const firstDay = new Date(year, monthIndexZero, 1);
  const lastDay = new Date(year, monthIndexZero + 1, 0);
  return {
    startDate: formatDateISO(firstDay),
    endDate: formatDateISO(lastDay)
  };
}

function getSemesterRange(year: number, semester: 'Ganjil' | 'Genap'): { startDate: string; endDate: string } {
  if (semester === 'Ganjil') {
    return {
      startDate: `${year}-07-01`,
      endDate: `${year}-12-31`
    };
  }
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-06-30`
  };
}

async function getLogoDataUri(): Promise<string> {
  try {
    const resp = await fetch('./assets/aistudio/LOGO_SMP_ca9ab34f.png');
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

export const LaporanResmiModal: React.FC<LaporanResmiModalProps> = ({
  isOpen,
  onClose,
  logs,
  masterList,
  settings,
  defaultStartDate,
  defaultEndDate
}) => {
  const todayIso = formatDateISO();
  const baseDateParts = (defaultStartDate || todayIso).split('-');
  const initialYear = parseInt(baseDateParts[0], 10) || new Date().getFullYear();
  const initialMonth = (parseInt(baseDateParts[1], 10) || new Date().getMonth() + 1) - 1;

  const [periodeMode, setPeriodeMode] = useState<LaporanPeriodeMode>('bulanan');
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedSemester, setSelectedSemester] = useState<'Ganjil' | 'Genap'>(
    initialMonth >= 6 ? 'Ganjil' : 'Genap'
  );
  const [customStart, setCustomStart] = useState<string>(defaultStartDate || todayIso);
  const [customEnd, setCustomEnd] = useState<string>(defaultEndDate || todayIso);

  const [kategoriFilter, setKategoriFilter] = useState<LaporanKategoriFilter>('semua');
  const [includeDinasCuti, setIncludeDinasCuti] = useState<boolean>(true);
  const [includeZeroRows, setIncludeZeroRows] = useState<boolean>(true);

  const todayDisplay = useMemo(() => {
    const longStr = formatLongDateIndonesian(todayIso);
    const commaIdx = longStr.indexOf(', ');
    return commaIdx >= 0 ? longStr.slice(commaIdx + 2) : longStr;
  }, [todayIso]);

  const detectedPrincipalName = useMemo(() => {
    const found = masterList.find((m) =>
      (m.jabatan || '').trim().toLowerCase().includes('kepala sekolah') &&
      !(m.jabatan || '').trim().toLowerCase().includes('wakil')
    );
    return found?.nama?.trim() || 'Indi Aunullah, SS. S.Fil';
  }, [masterList]);

  const [tempatTanggalTtd, setTempatTanggalTtd] = useState<string>(`Wongsorejo, ${todayDisplay}`);
  const [jabatanPenandatangan, setJabatanPenandatangan] = useState<string>(
    'Kepala SMP Nurul Abror Al-Robbaniyin'
  );
  const [namaPenandatangan, setNamaPenandatangan] = useState<string>(detectedPrincipalName);
  const [nipPenandatangan, setNipPenandatangan] = useState<string>('');
  const [printNotice, setPrintNotice] = useState<{ type: 'info' | 'success'; text: string } | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Sync default dates when modal opens
  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove('printing-laporan-resmi');
      setPrintNotice(null);
      return;
    }
    const refIso = defaultStartDate || formatDateISO();
    const parts = refIso.split('-');
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10) - 1;
    if (!isNaN(yr) && !isNaN(mo) && mo >= 0 && mo <= 11) {
      setSelectedYear(yr);
      setSelectedMonth(mo);
      setSelectedSemester(mo >= 6 ? 'Ganjil' : 'Genap');
    }
    if (defaultStartDate) setCustomStart(defaultStartDate);
    if (defaultEndDate) setCustomEnd(defaultEndDate);
  }, [isOpen, defaultStartDate, defaultEndDate]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-laporan-resmi');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-laporan-resmi');
    };
  }, []);

  const availableYears = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear(), initialYear]);
    for (const l of logs) {
      if (l.tanggal && l.tanggal.length >= 4) {
        const yr = parseInt(l.tanggal.slice(0, 4), 10);
        if (!isNaN(yr) && yr >= 2020 && yr <= 2100) set.add(yr);
      }
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [logs, initialYear]);

  const { activeStartDate, activeEndDate, periodeDisplayLabel, fileTag } = useMemo(() => {
    if (periodeMode === 'bulanan') {
      const { startDate, endDate } = getMonthRange(selectedYear, selectedMonth);
      const monthName = BULAN_NAMES[selectedMonth] || '';
      return {
        activeStartDate: startDate,
        activeEndDate: endDate,
        periodeDisplayLabel: `Bulan ${monthName} ${selectedYear}`,
        fileTag: `Bulan_${monthName}_${selectedYear}`
      };
    }
    if (periodeMode === 'semester') {
      const { startDate, endDate } = getSemesterRange(selectedYear, selectedSemester);
      const tahunAjaran =
        selectedSemester === 'Ganjil'
          ? `${selectedYear}/${selectedYear + 1}`
          : `${selectedYear - 1}/${selectedYear}`;
      const rentangBulan =
        selectedSemester === 'Ganjil' ? 'Juli – Desember' : 'Januari – Juni';
      return {
        activeStartDate: startDate,
        activeEndDate: endDate,
        periodeDisplayLabel: `Semester ${selectedSemester} Tahun Ajaran ${tahunAjaran} (${rentangBulan} ${selectedYear})`,
        fileTag: `Semester_${selectedSemester}_${selectedYear}`
      };
    }
    const s = customStart || todayIso;
    const e = customEnd && customEnd >= s ? customEnd : s;
    const label =
      s === e
        ? formatDateIndonesianShortMonth(s)
        : `${formatDateIndonesianShortMonth(s)} s.d. ${formatDateIndonesianShortMonth(e)}`;
    return {
      activeStartDate: s,
      activeEndDate: e,
      periodeDisplayLabel: label,
      fileTag: s === e ? s : `${s}_sd_${e}`
    };
  }, [periodeMode, selectedMonth, selectedYear, selectedSemester, customStart, customEnd, todayIso]);

  const kategoriDisplayLabel = useMemo(() => {
    if (kategoriFilter === 'guru') return 'Khusus Guru Mengajar';
    if (kategoriFilter === 'staf') return 'Khusus Staf & Guru BK';
    return 'Seluruh Guru dan Staf';
  }, [kategoriFilter]);

  const rows = useMemo<SimpleRekapRow[]>(() => {
    const map = new Map<string, SimpleRekapRow>();
    const masterMatchSet = new Set<string>();

    const matchesCategory = (peran: string, jabatan: string): boolean => {
      if (kategoriFilter === 'semua') return true;
      const p = (peran || '').toLowerCase();
      const j = (jabatan || '').toLowerCase();
      if (kategoriFilter === 'guru') {
        return p.includes('guru') && p !== 'guru bk';
      }
      // staf & guru bk
      return p.includes('staf') || p.includes('bk') || !j.includes('mata pelajaran');
    };

    for (const m of masterList) {
      if (!m.nama || !m.nama.trim()) continue;
      const peran = determineTeacherPeran(m, settings?.attendanceRuleOverrides);
      if (!matchesCategory(peran, m.jabatan)) continue;
      const key = m.nama.trim().toLowerCase();
      masterMatchSet.add(key);
      map.set(key, {
        nama: m.nama.trim(),
        jabatan: m.jabatan || '',
        kehadiran: 0,
        tepatWaktu: 0,
        terlambat: 0,
        alpa: 0,
        izin: 0,
        sakit: 0,
        dinasLuar: 0,
        cuti: 0
      });
    }

    for (const log of logs) {
      if (!log.nama || !log.nama.trim()) continue;
      if (!log.tanggal || log.tanggal < activeStartDate || log.tanggal > activeEndDate) continue;

      const key = log.nama.trim().toLowerCase();
      let entry = map.get(key);

      if (!entry) {
        // Jika ada log pegawai yang belum ada di master atau terfilter kategori
        const logPeran = log.peran || log.jabatan || '';
        if (kategoriFilter !== 'semua' && !masterMatchSet.has(key) && !matchesCategory(logPeran, log.jabatan)) {
          continue;
        }
        entry = {
          nama: log.nama.trim(),
          jabatan: log.jabatan || '',
          kehadiran: 0,
          tepatWaktu: 0,
          terlambat: 0,
          alpa: 0,
          izin: 0,
          sakit: 0,
          dinasLuar: 0,
          cuti: 0
        };
        map.set(key, entry);
      }

      const st = (log.status || '').trim();
      if (st === 'Tepat Waktu') {
        entry.tepatWaktu += 1;
        entry.kehadiran += 1;
      } else if (st === 'Terlambat') {
        entry.terlambat += 1;
        entry.kehadiran += 1;
      } else if (st === 'Alpa' || st.startsWith('Alpa ')) {
        entry.alpa += 1;
      } else if (st === 'Izin') {
        entry.izin += 1;
      } else if (st === 'Sakit') {
        entry.sakit += 1;
      } else if (st === 'Dinas Luar') {
        entry.dinasLuar += 1;
      } else if (st === 'Cuti') {
        entry.cuti += 1;
      }
    }

    const list = Array.from(map.values());
    if (!includeZeroRows) {
      return list.filter(
        (r) => r.kehadiran + r.alpa + r.izin + r.sakit + r.dinasLuar + r.cuti > 0
      );
    }
    return list;
  }, [masterList, logs, activeStartDate, activeEndDate, kategoriFilter, includeZeroRows, settings]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        kehadiran: acc.kehadiran + r.kehadiran,
        tepatWaktu: acc.tepatWaktu + r.tepatWaktu,
        terlambat: acc.terlambat + r.terlambat,
        alpa: acc.alpa + r.alpa,
        izin: acc.izin + r.izin,
        sakit: acc.sakit + r.sakit,
        dinasLuar: acc.dinasLuar + r.dinasLuar,
        cuti: acc.cuti + r.cuti
      }),
      {
        kehadiran: 0,
        tepatWaktu: 0,
        terlambat: 0,
        alpa: 0,
        izin: 0,
        sakit: 0,
        dinasLuar: 0,
        cuti: 0
      }
    );
  }, [rows]);

  const handlePrint = () => {
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    document.body.classList.add('printing-laporan-resmi');
    try {
      window.print();
    } catch {
      // ignore if blocked by iframe sandbox
    }

    setTimeout(() => {
      document.body.classList.remove('printing-laporan-resmi');
    }, 1500);

    if (inIframe) {
      setPrintNotice({
        type: 'info',
        text: 'Preview berjalan di dalam bingkai aplikasi (iframe). Jika dialog cetak browser tidak muncul, gunakan tombol "Unduh Siap Cetak (.html)" atau "Unduh Word (.doc)" di samping agar langsung terbuka rapi dengan font Times New Roman 12pt.'
      });
    } else {
      setPrintNotice({
        type: 'success',
        text: 'Dialog Cetak / Simpan PDF browser dipanggil dengan format khusus Times New Roman 12pt. Jika di HP, gunakan tombol "Unduh Word (.doc)" atau "Unduh Siap Cetak (.html)".'
      });
    }
  };

  const buildStandaloneHtml = (logoUri: string, autoPrint: boolean): string => {
    const logoCell = logoUri
      ? `<td style="width:76px; vertical-align:middle; text-align:center; padding-right:10px;">
           <img src="${logoUri}" alt="Logo" style="width:68px; height:68px; object-fit:contain;" />
         </td>`
      : '';

    const dinasCutiHeader = includeDinasCuti
      ? `<th style="border:1px solid #000; padding:6px 5px; text-align:center; width:64px;">Dinas /<br/>Cuti</th>`
      : '';

    const tableRowsHtml =
      rows.length === 0
        ? `<tr><td colspan="${includeDinasCuti ? 9 : 8}" style="border:1px solid #000; padding:14px; text-align:center; font-style:italic;">Belum ada data presensi pada periode ini.</td></tr>`
        : rows
            .map(
              (r, idx) => `
          <tr style="page-break-inside:avoid;">
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${idx + 1}</td>
            <td style="border:1px solid #000; padding:5px 8px; text-align:left;">${escapeHtml(r.nama)}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center; font-weight:bold;">${r.kehadiran}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.tepatWaktu}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.terlambat}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.alpa}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.izin}</td>
            <td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.sakit}</td>
            ${
              includeDinasCuti
                ? `<td style="border:1px solid #000; padding:5px 6px; text-align:center;">${r.dinasLuar + r.cuti}</td>`
                : ''
            }
          </tr>`
            )
            .join('');

    const totalRowHtml =
      rows.length > 0
        ? `<tr style="background:#f1f5f9; font-weight:bold;">
            <td colspan="2" style="border:1px solid #000; padding:6px 8px; text-align:center;">JUMLAH TOTAL (${rows.length} Pegawai)</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.kehadiran}</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.tepatWaktu}</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.terlambat}</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.alpa}</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.izin}</td>
            <td style="border:1px solid #000; padding:6px; text-align:center;">${totals.sakit}</td>
            ${
              includeDinasCuti
                ? `<td style="border:1px solid #000; padding:6px; text-align:center;">${totals.dinasLuar + totals.cuti}</td>`
                : ''
            }
          </tr>`
        : '';

    const printScript = autoPrint
      ? `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 250); });</script>`
      : '';

    return `<!DOCTYPE html>
<html lang="id" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>Laporan Rekap Kehadiran - ${escapeHtml(periodeDisplayLabel)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.4;
    color: #000000;
    background: #ffffff;
    margin: 0;
    padding: 20px;
  }
  .sheet {
    max-width: 720px;
    margin: 0 auto;
  }
  table.rekap {
    width: 100%;
    border-collapse: collapse;
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  ${
    autoPrint
      ? `<div class="no-print" style="font-family:Arial,sans-serif; background:#eff6ff; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; margin-bottom:16px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
          <span>Laporan siap cetak (Times New Roman 12pt). Jika dialog cetak tidak muncul, tekan <strong>Ctrl + P</strong> atau klik tombol di samping.</span>
          <button onclick="window.print()" style="background:#2F5597; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:700; cursor:pointer;">Cetak / Simpan PDF</button>
        </div>`
      : ''
  }
  <div class="sheet">
    <table style="width:100%; border-collapse:collapse; margin-bottom:4px;">
      <tr>
        ${logoCell}
        <td style="text-align:center; vertical-align:middle;">
          <div style="font-size:12pt; font-weight:bold; letter-spacing:0.5px;">YAYASAN NURUL ABROR AL-ROBBANIYIN</div>
          <div style="font-size:15pt; font-weight:bold; margin-top:2px;">SMP Nurul Abror Al &ndash; Robbaniyin</div>
          <div style="font-size:11pt; font-weight:bold; letter-spacing:1px;">TERAKREDITASI</div>
          <div style="font-size:10.5pt; margin-top:2px;">NSS: 202052521240 &nbsp;&nbsp; NPSN: 20574616 &nbsp;&nbsp; NIS: 201720</div>
          <div style="font-size:10.5pt;">E_Mail: smpnaa_alrobbany@yahoo.com</div>
        </td>
        ${logoUri ? '<td style="width:60px;"></td>' : ''}
      </tr>
    </table>
    <div style="border:3px double #000000; padding:4px 8px; text-align:center; font-size:10.5pt; font-weight:bold; margin-bottom:18px;">
      Alamat : Jl. KH. Agus Salim 165 (0333) 461440 Alasbuluh Wongsorejo Banyuwangi 68453
    </div>

    <div style="text-align:center; margin-bottom:16px;">
      <div style="font-size:15pt; font-weight:bold; text-transform:uppercase; letter-spacing:0.4px;">
        LAPORAN REKAPITULASI KEHADIRAN GURU DAN STAF
      </div>
      <div style="font-size:13pt; font-weight:bold; margin-top:4px;">
        Periode: ${escapeHtml(periodeDisplayLabel)}
      </div>
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:12pt; margin-bottom:12px;">
      <tr>
        <td style="width:165px; padding:2px 0;">Kategori Pegawai</td>
        <td style="width:14px; padding:2px 0;">:</td>
        <td style="padding:2px 0;">${escapeHtml(kategoriDisplayLabel)}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;">Rentang Tanggal</td>
        <td style="padding:2px 0;">:</td>
        <td style="padding:2px 0;">${escapeHtml(formatDateIndonesianShortMonth(activeStartDate))} s.d. ${escapeHtml(formatDateIndonesianShortMonth(activeEndDate))}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;">Jumlah Pegawai</td>
        <td style="padding:2px 0;">:</td>
        <td style="padding:2px 0;">${rows.length} Orang</td>
      </tr>
    </table>

    <table class="rekap">
      <thead>
        <tr style="background:#f1f5f9; font-weight:bold;">
          <th style="border:1px solid #000; padding:6px 4px; text-align:center; width:34px;">No</th>
          <th style="border:1px solid #000; padding:6px 8px; text-align:left;">Nama Guru / Staf</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:56px;">Hadir</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:64px;">Tepat<br/>Waktu</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:68px;">Terlambat</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:48px;">Alpa</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:46px;">Izin</th>
          <th style="border:1px solid #000; padding:6px 5px; text-align:center; width:50px;">Sakit</th>
          ${dinasCutiHeader}
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
        ${totalRowHtml}
      </tbody>
    </table>

    <p style="font-size:12pt; margin-top:10px; margin-bottom:22px;">
      <em>Keterangan:</em> Kolom <strong>Hadir</strong> merupakan jumlah kehadiran fisik (Tepat Waktu + Terlambat).
    </p>

    <table style="width:100%; border-collapse:collapse; font-size:12pt; margin-top:16px; page-break-inside:avoid;">
      <tr>
        <td style="width:55%;"></td>
        <td style="width:45%; text-align:left; vertical-align:top;">
          <div>${escapeHtml(tempatTanggalTtd)}</div>
          <div>${escapeHtml(jabatanPenandatangan)},</div>
          <div style="height:64px;"></div>
          <div style="font-weight:bold; text-decoration:underline;">${escapeHtml(namaPenandatangan || '........................................')}</div>
          ${nipPenandatangan.trim() ? `<div>NIP/NIY: ${escapeHtml(nipPenandatangan.trim())}</div>` : ''}
        </td>
      </tr>
    </table>
  </div>
  ${printScript}
</body>
</html>`;
  };

  const handleDownloadReport = async (format: 'doc' | 'html') => {
    setIsExporting(true);
    try {
      const logoUri = await getLogoDataUri();
      const htmlContent = buildStandaloneHtml(logoUri, format === 'html');
      const mime = format === 'doc' ? 'application/msword;charset=utf-8' : 'text/html;charset=utf-8';
      const blob = new Blob(['\ufeff', htmlContent], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Rekap_Kehadiran_${fileTag}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setPrintNotice({
        type: 'success',
        text:
          format === 'doc'
            ? `File Word (.doc) berhasil diunduh (${a.download}). Buka di Microsoft Word / WPS Office, seluruh isi sudah berformat Times New Roman 12pt.`
            : `File Siap Cetak (.html) berhasil diunduh (${a.download}). Buka file tersebut di browser untuk langsung mencetak atau Simpan PDF.`
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      id="laporan-resmi-portal"
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs overflow-y-auto p-3 sm:p-6"
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 14mm 15mm 15mm 15mm;
          }
        }
      `}</style>

      {/* Toolbar Pengaturan & Aksi Cetak (Disembunyikan saat mencetak) */}
      <div className="laporan-resmi-print-hide max-w-5xl mx-auto mb-4 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-[#1e3a6d] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">
              Cetak Laporan Rekap Sederhana (Khusus Pimpinan)
            </h2>
            <p className="text-[11px] text-blue-100 mt-0.5">
              Format ringkas &amp; jelas menggunakan huruf <strong>Times New Roman 12pt</strong> (judul lebih besar) untuk laporan Bulanan maupun Semester.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Tutup pratinjau laporan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 text-xs">
          {/* Baris 1: Jenis Periode & Pilihan Waktu */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 space-y-1">
              <label className="font-bold text-slate-700 block">Jenis Periode Laporan</label>
              <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl border border-slate-200 font-bold">
                <button
                  type="button"
                  onClick={() => setPeriodeMode('bulanan')}
                  className={`py-1.5 rounded-lg transition cursor-pointer ${
                    periodeMode === 'bulanan'
                      ? 'bg-[#2F5597] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bulanan
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeMode('semester')}
                  className={`py-1.5 rounded-lg transition cursor-pointer ${
                    periodeMode === 'semester'
                      ? 'bg-[#2F5597] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semester
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeMode('custom')}
                  className={`py-1.5 rounded-lg transition cursor-pointer ${
                    periodeMode === 'custom'
                      ? 'bg-[#2F5597] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {periodeMode === 'bulanan' && (
              <>
                <div className="md:col-span-3 space-y-1">
                  <label className="font-bold text-slate-700 block">Pilih Bulan</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    {BULAN_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="font-bold text-slate-700 block">Tahun</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {periodeMode === 'semester' && (
              <>
                <div className="md:col-span-3 space-y-1">
                  <label className="font-bold text-slate-700 block">Pilih Semester</label>
                  <select
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value as 'Ganjil' | 'Genap')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="Ganjil">Semester Ganjil (Jul – Des)</option>
                    <option value="Genap">Semester Genap (Jan – Jun)</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="font-bold text-slate-700 block">Tahun Kalender</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {periodeMode === 'custom' && (
              <>
                <div className="md:col-span-2 space-y-1">
                  <label className="font-bold text-slate-700 block">Dari Tanggal</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <label className="font-bold text-slate-700 block">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  />
                </div>
              </>
            )}

            <div className="md:col-span-3 space-y-1">
              <label className="font-bold text-slate-700 block">Kategori Pegawai</label>
              <select
                value={kategoriFilter}
                onChange={(e) => setKategoriFilter(e.target.value as LaporanKategoriFilter)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
              >
                <option value="semua">Semua Guru &amp; Staf</option>
                <option value="guru">Khusus Guru Mengajar</option>
                <option value="staf">Khusus Staf &amp; Guru BK</option>
              </select>
            </div>
          </div>

          {/* Baris 2: Pengaturan Kolom & Penandatangan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">Tempat &amp; Tanggal TTD</label>
              <input
                type="text"
                value={tempatTanggalTtd}
                onChange={(e) => setTempatTanggalTtd(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">Jabatan Penandatangan</label>
              <input
                type="text"
                value={jabatanPenandatangan}
                onChange={(e) => setJabatanPenandatangan(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">Nama Kepala Sekolah</label>
              <input
                type="text"
                value={namaPenandatangan}
                onChange={(e) => setNamaPenandatangan(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block">NIP / NIY (Opsional)</label>
              <input
                type="text"
                placeholder="Kosongkan jika tidak perlu"
                value={nipPenandatangan}
                onChange={(e) => setNipPenandatangan(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* Baris 3: Checkbox opsi + Tombol Aksi */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-4 text-slate-700 font-medium">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDinasCuti}
                  onChange={(e) => setIncludeDinasCuti(e.target.checked)}
                  className="rounded border-slate-300 text-[#2F5597]"
                />
                <span>Sertakan kolom Dinas / Cuti</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeZeroRows}
                  onChange={(e) => setIncludeZeroRows(e.target.checked)}
                  className="rounded border-slate-300 text-[#2F5597]"
                />
                <span>Tampilkan semua pegawai aktif (meski 0 catatan)</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleDownloadReport('doc')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Word (.doc)</span>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleDownloadReport('html')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                <span>Unduh Siap Cetak (.html)</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2F5597] hover:bg-[#234278] text-white rounded-xl font-bold shadow-sm transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-300" />
                <span>Cetak / Simpan PDF</span>
              </button>
            </div>
          </div>

          {printNotice && (
            <div
              className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                printNotice.type === 'info'
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{printNotice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setPrintNotice(null)}
                className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lembar Pratinjau & Cetak Resmi A4 — Times New Roman 12pt */}
      <div
        id="laporan-resmi-printable"
        className="max-w-[210mm] mx-auto bg-white text-black shadow-2xl border border-slate-300 p-6 sm:p-10"
        style={{
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '12pt',
          lineHeight: 1.4,
          color: '#000000'
        }}
      >
        <KopSuratResmi />

        {/* Judul Laporan (Lebih besar dari isi 12pt) */}
        <div style={{ textAlign: 'center', marginTop: '18pt', marginBottom: '14pt' }}>
          <h1
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '15pt',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              margin: 0
            }}
          >
            LAPORAN REKAPITULASI KEHADIRAN GURU DAN STAF
          </h1>
          <div
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '13pt',
              fontWeight: 700,
              marginTop: '4pt'
            }}
          >
            Periode: {periodeDisplayLabel}
          </div>
        </div>

        {/* Identitas Ringkas Laporan (12pt) */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: '"Times New Roman", Times, serif',
            fontSize: '12pt',
            marginBottom: '12pt'
          }}
        >
          <tbody>
            <tr>
              <td style={{ width: '165px', padding: '2px 0' }}>Kategori Pegawai</td>
              <td style={{ width: '14px', padding: '2px 0' }}>:</td>
              <td style={{ padding: '2px 0' }}>{kategoriDisplayLabel}</td>
            </tr>
            <tr>
              <td style={{ padding: '2px 0' }}>Rentang Tanggal</td>
              <td style={{ padding: '2px 0' }}>:</td>
              <td style={{ padding: '2px 0' }}>
                {formatDateIndonesianShortMonth(activeStartDate)} s.d.{' '}
                {formatDateIndonesianShortMonth(activeEndDate)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '2px 0' }}>Jumlah Pegawai</td>
              <td style={{ padding: '2px 0' }}>:</td>
              <td style={{ padding: '2px 0' }}>{rows.length} Orang</td>
            </tr>
          </tbody>
        </table>

        {/* Tabel Rekap Sederhana — Seluruh Isi 12pt Times New Roman */}
        <div className="overflow-x-auto">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '12pt'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 700 }}>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 4px',
                    textAlign: 'center',
                    width: '34px'
                  }}
                >
                  No
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 8px',
                    textAlign: 'left'
                  }}
                >
                  Nama Guru / Staf
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '56px'
                  }}
                >
                  Hadir
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '66px'
                  }}
                >
                  Tepat Waktu
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '72px'
                  }}
                >
                  Terlambat
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '48px'
                  }}
                >
                  Alpa
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '46px'
                  }}
                >
                  Izin
                </th>
                <th
                  style={{
                    border: '1px solid #000000',
                    padding: '6px 5px',
                    textAlign: 'center',
                    width: '50px'
                  }}
                >
                  Sakit
                </th>
                {includeDinasCuti && (
                  <th
                    style={{
                      border: '1px solid #000000',
                      padding: '6px 5px',
                      textAlign: 'center',
                      width: '64px'
                    }}
                  >
                    Dinas / Cuti
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={includeDinasCuti ? 9 : 8}
                    style={{
                      border: '1px solid #000000',
                      padding: '16px',
                      textAlign: 'center',
                      fontStyle: 'italic'
                    }}
                  >
                    Belum ada data presensi tercatat untuk periode ini.
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((r, idx) => (
                    <tr
                      key={`simple-report-${r.nama}-${idx}`}
                      style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    >
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 4px',
                          textAlign: 'center'
                        }}
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 8px',
                          textAlign: 'left'
                        }}
                      >
                        {r.nama}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center',
                          fontWeight: 700
                        }}
                      >
                        {r.kehadiran}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center'
                        }}
                      >
                        {r.tepatWaktu}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center'
                        }}
                      >
                        {r.terlambat}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center'
                        }}
                      >
                        {r.alpa}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center'
                        }}
                      >
                        {r.izin}
                      </td>
                      <td
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 5px',
                          textAlign: 'center'
                        }}
                      >
                        {r.sakit}
                      </td>
                      {includeDinasCuti && (
                        <td
                          style={{
                            border: '1px solid #000000',
                            padding: '5px 5px',
                            textAlign: 'center'
                          }}
                        >
                          {r.dinasLuar + r.cuti}
                        </td>
                      )}
                    </tr>
                  ))}

                  <tr
                    style={{
                      backgroundColor: '#f1f5f9',
                      fontWeight: 700,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid'
                    }}
                  >
                    <td
                      colSpan={2}
                      style={{
                        border: '1px solid #000000',
                        padding: '6px 8px',
                        textAlign: 'center'
                      }}
                    >
                      JUMLAH TOTAL ({rows.length} Pegawai)
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.kehadiran}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.tepatWaktu}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.terlambat}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.alpa}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.izin}
                    </td>
                    <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                      {totals.sakit}
                    </td>
                    {includeDinasCuti && (
                      <td style={{ border: '1px solid #000000', padding: '6px 5px', textAlign: 'center' }}>
                        {totals.dinasLuar + totals.cuti}
                      </td>
                    )}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Keterangan singkat (12pt) */}
        <p style={{ fontSize: '12pt', marginTop: '10pt', marginBottom: '20pt' }}>
          <em>Keterangan:</em> Kolom <strong>Hadir</strong> merupakan jumlah kehadiran fisik (Tepat Waktu + Terlambat).
        </p>

        {/* Blok Tanda Tangan Resmi (12pt) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '14pt',
            breakInside: 'avoid',
            pageBreakInside: 'avoid'
          }}
        >
          <div style={{ width: '46%', fontSize: '12pt', textAlign: 'left' }}>
            <div>{tempatTanggalTtd}</div>
            <div>{jabatanPenandatangan},</div>
            <div style={{ height: '56pt' }} />
            <div style={{ fontWeight: 700, textDecoration: 'underline' }}>
              {namaPenandatangan || '........................................'}
            </div>
            {nipPenandatangan.trim() && <div>NIP/NIY: {nipPenandatangan.trim()}</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

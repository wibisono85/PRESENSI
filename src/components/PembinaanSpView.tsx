import React, { useMemo, useRef, useState } from 'react';
import {
  DataSpRecord,
  LogPresensi,
  MasterGuruStaf,
  SpJenisDokumen,
  SpPenerbit,
  SpStatusTindakLanjut,
  SpTahap,
  UserRole
} from '../types';
import { KopSuratResmi } from './KopSuratResmi';
import { formatDateISO } from '../utils/dateUtils';
import { analyzeTeacherSpAttendance } from '../utils/autoAlpaUtils';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSignature,
  FileText,
  Filter,
  Info,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';

interface PembinaanSpViewProps {
  masterList: MasterGuruStaf[];
  logs: LogPresensi[];
  spList: DataSpRecord[];
  hasRemoteSpSheet: boolean;
  userRole: UserRole;
  webAppUrl: string;
  onSaveSp: (record: DataSpRecord) => Promise<{
    success: boolean;
    syncedToSheet: boolean;
    needsScriptUpdate?: boolean;
    message: string;
  }>;
  onDeleteSp: (id: string) => Promise<{ success: boolean; message: string }>;
  onNavigateToSetup?: () => void;
}

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const NAMA_HARI = ['Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function toRomanMonth(dateStr: string): string {
  const parts = (dateStr || '').split('-');
  const m = parseInt(parts[1] || '', 10);
  if (!isNaN(m) && m >= 1 && m <= 12) return ROMAN_MONTHS[m - 1];
  return ROMAN_MONTHS[new Date().getMonth()];
}

function getYearFromDate(dateStr: string): string {
  const parts = (dateStr || '').split('-');
  if (parts[0] && /^\d{4}$/.test(parts[0])) return parts[0];
  return String(new Date().getFullYear());
}

function getPeriodeBulanFromDate(dateStr: string): string {
  const parts = (dateStr || '').split('-');
  const y = parts[0] || String(new Date().getFullYear());
  const m = parseInt(parts[1] || '', 10);
  if (!isNaN(m) && m >= 1 && m <= 12) return `${NAMA_BULAN[m - 1]} ${y}`;
  const now = new Date();
  return `${NAMA_BULAN[now.getMonth()]} ${now.getFullYear()}`;
}

function parseDatePartsIndo(dateStr: string): {
  hari: string;
  tanggal: string;
  bulan: string;
  tahun: string;
  lengkap: string;
} {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      hari: '..................',
      tanggal: '......',
      bulan: '..................',
      tahun: '2026',
      lengkap: '........................'
    };
  }
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const hari = NAMA_HARI[dt.getDay()] || '..................';
  const bulan = NAMA_BULAN[m - 1] || '..................';
  return {
    hari,
    tanggal: String(d),
    bulan,
    tahun: String(y),
    lengkap: `${d} ${bulan} ${y}`
  };
}

function generateNextNomorSurat(spList: DataSpRecord[], dateStr: string): string {
  const year = getYearFromDate(dateStr);
  const roman = toRomanMonth(dateStr);
  let maxSeq = 0;
  for (const item of spList) {
    const itemYear = getYearFromDate(item.tanggalSurat || '');
    if (itemYear === year || (item.nomorSurat || '').includes(`/${year}`)) {
      const m = (item.nomorSurat || '').trim().match(/^(\d{1,4})\s*\//);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `${nextSeq} / SMP.NAA / ${roman} / ${year}`;
}

function extractMainSubjectSummary(teacher?: MasterGuruStaf): string {
  if (!teacher) return '-';
  const jab = (teacher.jabatan || '').trim();
  const days = [
    teacher.mapelSabtu,
    teacher.mapelAhad,
    teacher.mapelSenin,
    teacher.mapelSelasa,
    teacher.mapelRabu,
    teacher.mapelKamis
  ].filter((x) => x && x !== '-' && x.toLowerCase() !== 'libur');

  if (days.length === 0) {
    return jab.toLowerCase().includes('guru') ? jab : '-';
  }

  const subjects = new Set<string>();
  for (const d of days) {
    const segments = d.split(',');
    for (const seg of segments) {
      const cleaned = seg
        .replace(/Jam\s+[I|V|X0-9\-]+:\s*/i, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
      if (cleaned && cleaned !== '-') subjects.add(cleaned);
    }
  }
  if (subjects.size > 0) {
    return Array.from(subjects).slice(0, 4).join(', ');
  }
  return jab;
}

export const PembinaanSpView: React.FC<PembinaanSpViewProps> = ({
  masterList,
  logs,
  spList,
  hasRemoteSpSheet,
  userRole,
  webAppUrl,
  onSaveSp,
  onDeleteSp,
  onNavigateToSetup
}) => {
  const todayISO = formatDateISO();
  const currentMonthPrefix = todayISO.slice(0, 7);

  // Active sub-mode: form + preview vs printable focus
  const [editingId, setEditingId] = useState<string>('');
  const [selectedNama, setSelectedNama] = useState<string>('');
  const [nipNty, setNipNty] = useState<string>('');
  const [jabatan, setJabatan] = useState<string>('');
  const [mataPelajaran, setMataPelajaran] = useState<string>('');
  const [tanggalSurat, setTanggalSurat] = useState<string>(todayISO);
  const [nomorSurat, setNomorSurat] = useState<string>(() => generateNextNomorSurat(spList, todayISO));
  const [tahap, setTahap] = useState<SpTahap>('Teguran / Pembinaan I');
  const [jenisDokumen, setJenisDokumen] = useState<SpJenisDokumen>('berita_acara_pembinaan');
  const [penerbit, setPenerbit] = useState<SpPenerbit>('Waka Kurikulum');
  const [urutanKe, setUrutanKe] = useState<number>(1);
  const [lokasiPertemuan, setLokasiPertemuan] = useState<string>('Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin');
  const [alasanUtama, setAlasanUtama] = useState<string>(
    'Ketidakhadiran dalam Agenda Rapat Bulanan Sekolah / Tingkat Kehadiran Kerja harian di bawah standar operasional (80%).'
  );
  const [tanggalRapatAbsen, setTanggalRapatAbsen] = useState<string>('');
  const [periodeBulan, setPeriodeBulan] = useState<string>(() => getPeriodeBulanFromDate(todayISO));
  const [persentaseKehadiran, setPersentaseKehadiran] = useState<string>('');
  const [rincianPelanggaran, setRincianPelanggaran] = useState<string>('');
  const [pelanggaranLainnya, setPelanggaranLainnya] = useState<string>('');
  const [catatanKlarifikasi, setCatatanKlarifikasi] = useState<string>('');
  const [disertaiPemanggilan, setDisertaiPemanggilan] = useState<boolean>(false);
  const [tanggalPemanggilan, setTanggalPemanggilan] = useState<string>(todayISO);
  const [jamPemanggilan, setJamPemanggilan] = useState<string>('09:00 WIB');
  const [tempatPemanggilan, setTempatPemanggilan] = useState<string>('Ruang Kepala SMP Nurul Abror Al-Robbaniyin');
  const [riwayatTerkait, setRiwayatTerkait] = useState<string>('');
  const [namaPenandatangan, setNamaPenandatangan] = useState<string>(
    userRole === 'kurikulum' ? 'Waka Kurikulum' : 'Waka Kurikulum'
  );
  const [nipPenandatangan, setNipPenandatangan] = useState<string>('');
  const [statusTindakLanjut, setStatusTindakLanjut] = useState<SpStatusTindakLanjut>('Diterbitkan');

  // UI Feedback & Filters
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
    needsScriptUpdate?: boolean;
  } | null>(null);
  const [showPanduanBahasa, setShowPanduanBahasa] = useState<boolean>(false);
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [archiveFilterTahap, setArchiveFilterTahap] = useState<string>('semua');
  const [candidateFilter, setCandidateFilter] = useState<'perlu_perhatian' | 'semua'>('perlu_perhatian');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<{
    type: 'info' | 'success';
    text: string;
  } | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const printSheetRef = useRef<HTMLDivElement>(null);

  // Build per-teacher history + attendance summary for the current month
  // Catatan Penting: Status 'Cuti' (dengan izin cuti & guru pengganti) BUKAN pelanggaran dan tidak mengurangi % kehadiran.
  const teacherStats = useMemo(() => {
    const spByTeacher = new Map<string, DataSpRecord[]>();
    for (const rec of spList) {
      const k = rec.nama.trim().toLowerCase();
      if (!spByTeacher.has(k)) spByTeacher.set(k, []);
      spByTeacher.get(k)!.push(rec);
    }

    const logsMonth = logs.filter((l) => (l.tanggal || '').startsWith(currentMonthPrefix));
    const logsByTeacher = new Map<string, LogPresensi[]>();
    for (const l of logsMonth) {
      const k = l.nama.trim().toLowerCase();
      if (!logsByTeacher.has(k)) logsByTeacher.set(k, []);
      logsByTeacher.get(k)!.push(l);
    }

    return masterList.map((m) => {
      const k = m.nama.trim().toLowerCase();
      const history = (spByTeacher.get(k) || []).sort((a, b) =>
        (a.tanggalSurat || '').localeCompare(b.tanggalSurat || '')
      );
      const tLogs = logsByTeacher.get(k) || [];
      const cutiCount = tLogs.filter((l) => l.status === 'Cuti').length;
      const total = tLogs.length;
      const effectiveTotal = Math.max(0, total - cutiCount);
      const hadirCount = tLogs.filter(
        (l) => l.status === 'Tepat Waktu' || l.status === 'Terlambat' || l.status === 'Dinas Luar'
      ).length;
      const terlambatCount = tLogs.filter((l) => l.status === 'Terlambat').length;
      const alpaCount = tLogs.filter((l) => (l.status || '').startsWith('Alpa')).length;
      const pctHadir = effectiveTotal > 0 ? Math.round((hadirCount / effectiveTotal) * 100) : null;
      const needsAttention =
        history.length > 0 || (pctHadir !== null && pctHadir < 80) || alpaCount > 0 || terlambatCount >= 3;

      return {
        teacher: m,
        history,
        spCount: history.length,
        totalLogs: total,
        effectiveTotalLogs: effectiveTotal,
        cutiCount,
        hadirCount,
        terlambatCount,
        alpaCount,
        pctHadir,
        needsAttention
      };
    });
  }, [masterList, logs, spList, currentMonthPrefix]);

  const filteredCandidates = useMemo(() => {
    const base =
      candidateFilter === 'perlu_perhatian'
        ? teacherStats.filter((t) => t.needsAttention)
        : teacherStats;
    return [...base].sort((a, b) => {
      if (b.spCount !== a.spCount) return b.spCount - a.spCount;
      const pctA = a.pctHadir ?? 100;
      const pctB = b.pctHadir ?? 100;
      return pctA - pctB;
    });
  }, [teacherStats, candidateFilter]);

  const selectedTeacherHistory = useMemo(() => {
    if (!selectedNama) return [];
    const k = selectedNama.trim().toLowerCase();
    return spList
      .filter((s) => s.nama.trim().toLowerCase() === k && s.id !== editingId)
      .sort((a, b) => (a.tanggalSurat || '').localeCompare(b.tanggalSurat || ''));
  }, [spList, selectedNama, editingId]);

  const buildAttendanceBreakdownText = (nama: string, dateStr: string) => {
    if (!nama.trim()) return { pct: '', text: '' };
    const monthPrefix = (dateStr || tanggalSurat || todayISO).slice(0, 7);
    const label = getPeriodeBulanFromDate(dateStr || tanggalSurat || todayISO);
    const breakdown = analyzeTeacherSpAttendance({
      nama,
      logs,
      monthPrefix,
      periodeLabel: label
    });
    return {
      pct: breakdown.pctHadir !== null ? `${breakdown.pctHadir}%` : '',
      text: breakdown.rincianText
    };
  };

  const applyTeacherSelection = (nama: string) => {
    setEditingId('');
    setSelectedNama(nama);
    setSaveMessage(null);
    const stat = teacherStats.find((t) => t.teacher.nama === nama);
    const m = stat?.teacher || masterList.find((x) => x.nama === nama);

    setJabatan(m?.jabatan || '');
    setMataPelajaran(extractMainSubjectSummary(m));
    const activePeriode = getPeriodeBulanFromDate(tanggalSurat);
    setPeriodeBulan(activePeriode);

    const breakdown = buildAttendanceBreakdownText(nama, tanggalSurat);
    setPersentaseKehadiran(
      breakdown.pct || (stat?.pctHadir !== null && stat?.pctHadir !== undefined ? `${stat.pctHadir}%` : '')
    );
    setRincianPelanggaran(breakdown.text);

    const prevHistory = stat?.history || [];
    const nextKe = prevHistory.length + 1;
    setUrutanKe(nextKe);

    const prevNumbers = prevHistory.map((h) => `${h.tahap} (No. ${h.nomorSurat})`).join('; ');
    setRiwayatTerkait(prevNumbers);

    // Otomatis tentukan tahap sesuai aturan:
    // Ke-1: Kurikulum (Teguran Pertama / Pembinaan I)
    // Ke-2: SP-II (Pembinaan lanjutan)
    // Ke-3 atau lebih: SP-III + Pemanggilan oleh Kepala Sekolah!
    if (nextKe >= 3) {
      setTahap('SP-III + Pemanggilan');
      setJenisDokumen('surat_peringatan');
      setPenerbit('Kepala Sekolah');
      setDisertaiPemanggilan(true);
      setNamaPenandatangan('Halik, S.Pd');
      setStatusTindakLanjut(userRole === 'kurikulum' ? 'Eskalasi Kepala Sekolah' : 'Diterbitkan');
    } else if (nextKe === 2) {
      setTahap('SP-II');
      setJenisDokumen('surat_peringatan');
      setPenerbit('Waka Kurikulum');
      setDisertaiPemanggilan(false);
      setNamaPenandatangan('Halik, S.Pd');
      setStatusTindakLanjut('Diterbitkan');
    } else {
      setTahap('Teguran / Pembinaan I');
      setJenisDokumen('berita_acara_pembinaan');
      setPenerbit('Waka Kurikulum');
      setDisertaiPemanggilan(false);
      setNamaPenandatangan('Waka Kurikulum');
      setStatusTindakLanjut('Diterbitkan');
    }
  };

  const handleTahapChange = (nextTahap: SpTahap) => {
    setTahap(nextTahap);
    if (nextTahap === 'Teguran / Pembinaan I') {
      setJenisDokumen('berita_acara_pembinaan');
      setPenerbit('Waka Kurikulum');
      setDisertaiPemanggilan(false);
      if (namaPenandatangan === 'Halik, S.Pd') setNamaPenandatangan('Waka Kurikulum');
    } else if (nextTahap === 'SP-I' || nextTahap === 'SP-II') {
      setJenisDokumen('surat_peringatan');
      setDisertaiPemanggilan(false);
      if (penerbit === 'Kepala Sekolah' || namaPenandatangan === 'Waka Kurikulum') {
        setNamaPenandatangan(penerbit === 'Waka Kurikulum' ? 'Waka Kurikulum' : 'Halik, S.Pd');
      }
    } else if (nextTahap === 'SP-III + Pemanggilan') {
      setJenisDokumen('surat_peringatan');
      setPenerbit('Kepala Sekolah');
      setDisertaiPemanggilan(true);
      setNamaPenandatangan('Halik, S.Pd');
      if (urutanKe < 3) setUrutanKe(3);
    }
  };

  const handleResetNew = () => {
    setEditingId('');
    setSelectedNama('');
    setNipNty('');
    setJabatan('');
    setMataPelajaran('');
    const nextNo = generateNextNomorSurat(spList, todayISO);
    setTanggalSurat(todayISO);
    setNomorSurat(nextNo);
    setTahap('Teguran / Pembinaan I');
    setJenisDokumen('berita_acara_pembinaan');
    setPenerbit('Waka Kurikulum');
    setUrutanKe(1);
    setLokasiPertemuan('Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin');
    setAlasanUtama(
      'Ketidakhadiran dalam Agenda Rapat Bulanan Sekolah / Tingkat Kehadiran Kerja harian di bawah standar operasional (80%).'
    );
    setTanggalRapatAbsen('');
    setPeriodeBulan(getPeriodeBulanFromDate(todayISO));
    setPersentaseKehadiran('');
    setRincianPelanggaran('');
    setPelanggaranLainnya('');
    setCatatanKlarifikasi('');
    setDisertaiPemanggilan(false);
    setTanggalPemanggilan(todayISO);
    setJamPemanggilan('09:00 WIB');
    setTempatPemanggilan('Ruang Kepala SMP Nurul Abror Al-Robbaniyin');
    setRiwayatTerkait('');
    setNamaPenandatangan('Waka Kurikulum');
    setNipPenandatangan('');
    setStatusTindakLanjut('Diterbitkan');
    setSaveMessage(null);
  };

  const handleLoadRecord = (rec: DataSpRecord) => {
    setEditingId(rec.id);
    setSelectedNama(rec.nama);
    setNipNty(rec.nipNty || '');
    setJabatan(rec.jabatan || '');
    setMataPelajaran(rec.mataPelajaran || '');
    setTanggalSurat(rec.tanggalSurat || todayISO);
    setNomorSurat(rec.nomorSurat || '');
    setTahap(rec.tahap || 'Teguran / Pembinaan I');
    setJenisDokumen(rec.jenisDokumen || 'berita_acara_pembinaan');
    setPenerbit(rec.penerbit || 'Waka Kurikulum');
    setUrutanKe(rec.urutanKe || 1);
    setLokasiPertemuan(rec.lokasiPertemuan || 'Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin');
    setAlasanUtama(rec.alasanUtama || '');
    setTanggalRapatAbsen(rec.tanggalRapatAbsen || '');
    setPeriodeBulan(rec.periodeBulan || getPeriodeBulanFromDate(rec.tanggalSurat || todayISO));
    setPersentaseKehadiran(rec.persentaseKehadiran || '');
    setRincianPelanggaran(rec.rincianPelanggaran && rec.rincianPelanggaran !== '-' ? rec.rincianPelanggaran : '');
    setPelanggaranLainnya(rec.pelanggaranLainnya || '');
    setCatatanKlarifikasi(rec.catatanKlarifikasi || '');
    setDisertaiPemanggilan(Boolean(rec.disertaiPemanggilan));
    setTanggalPemanggilan(rec.tanggalPemanggilan || todayISO);
    setJamPemanggilan(rec.jamPemanggilan || '09:00 WIB');
    setTempatPemanggilan(rec.tempatPemanggilan || 'Ruang Kepala SMP Nurul Abror Al-Robbaniyin');
    setRiwayatTerkait(rec.riwayatTerkait || '');
    setNamaPenandatangan(rec.namaPenandatangan || 'Waka Kurikulum');
    setNipPenandatangan(rec.nipPenandatangan || '');
    setStatusTindakLanjut(rec.statusTindakLanjut || 'Diterbitkan');
    setSaveMessage({
      type: 'success',
      text: `Membuka arsip surat No. ${rec.nomorSurat} (${rec.nama}) untuk ditinjau, diunduh, atau dicetak ulang.`
    });
    setTimeout(() => {
      printSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage(null);

    if (!selectedNama.trim()) {
      setSaveMessage({ type: 'error', text: 'Pilih nama Guru / Staf terlebih dahulu.' });
      return;
    }
    if (!nomorSurat.trim()) {
      setSaveMessage({ type: 'error', text: 'Nomor Surat wajib diisi sebelum menyimpan.' });
      return;
    }

    const now = new Date();
    const waktuDibuat = `${formatDateISO(now)} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const idToUse = editingId || `SP-${Date.now()}`;
    const record: DataSpRecord = {
      id: idToUse,
      waktuDibuat,
      nomorSurat: nomorSurat.trim(),
      tanggalSurat: tanggalSurat || todayISO,
      tahap,
      jenisDokumen,
      penerbit,
      urutanKe: Number(urutanKe) || 1,
      nama: selectedNama.trim(),
      nipNty: nipNty.trim() || '-',
      jabatan: jabatan.trim() || '-',
      mataPelajaran: mataPelajaran.trim() || '-',
      lokasiPertemuan: lokasiPertemuan.trim() || 'Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin',
      alasanUtama: alasanUtama.trim() || '-',
      tanggalRapatAbsen: tanggalRapatAbsen.trim(),
      periodeBulan: periodeBulan.trim() || getPeriodeBulanFromDate(tanggalSurat),
      persentaseKehadiran: persentaseKehadiran.trim() || '-',
      rincianPelanggaran: rincianPelanggaran.trim() || '-',
      pelanggaranLainnya: pelanggaranLainnya.trim() || '-',
      catatanKlarifikasi: catatanKlarifikasi.trim() || '-',
      disertaiPemanggilan: Boolean(disertaiPemanggilan),
      tanggalPemanggilan: disertaiPemanggilan ? tanggalPemanggilan : '',
      jamPemanggilan: disertaiPemanggilan ? jamPemanggilan : '',
      tempatPemanggilan: disertaiPemanggilan ? tempatPemanggilan : '',
      riwayatTerkait: riwayatTerkait.trim() || '-',
      namaPenandatangan: namaPenandatangan.trim() || (penerbit === 'Kepala Sekolah' ? 'Halik, S.Pd' : 'Waka Kurikulum'),
      nipPenandatangan: nipPenandatangan.trim() || '-',
      statusTindakLanjut
    };

    setIsSaving(true);
    const res = await onSaveSp(record);
    setIsSaving(false);

    if (res.success) {
      setEditingId(idToUse);
      setSaveMessage({
        type: res.syncedToSheet ? 'success' : 'warning',
        text: res.message,
        needsScriptUpdate: res.needsScriptUpdate
      });
    } else {
      setSaveMessage({ type: 'error', text: res.message });
    }
  };

  const handleQuickStatusUpdate = async (rec: DataSpRecord, newStatus: SpStatusTindakLanjut) => {
    const updated: DataSpRecord = { ...rec, statusTindakLanjut: newStatus };
    await onSaveSp(updated);
    if (editingId === rec.id) {
      setStatusTindakLanjut(newStatus);
    }
  };

  const escapeHtml = (str: string) =>
    (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const getLogoDataUri = async (): Promise<string> => {
    const logoUrl = './assets/aistudio/LOGO_SMP_ca9ab34f.png';
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 200;
          canvas.height = img.naturalHeight || 200;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
            return;
          }
        } catch {
          // fallback below
        }
        try {
          resolve(new URL(logoUrl, window.location.href).href);
        } catch {
          resolve(logoUrl);
        }
      };
      img.onerror = () => {
        try {
          resolve(new URL(logoUrl, window.location.href).href);
        } catch {
          resolve(logoUrl);
        }
      };
      img.src = logoUrl;
    });
  };

  const buildFormalLetterHtml = (logoSrc: string, autoPrint: boolean): string => {
    const dSurat = parseDatePartsIndo(tanggalSurat);
    const dRapat = parseDatePartsIndo(tanggalRapatAbsen);
    const dPanggil = parseDatePartsIndo(tanggalPemanggilan);
    const spLevel =
      tahap === 'SP-III + Pemanggilan' ? 'SP - III' : tahap === 'SP-II' ? 'SP - II' : 'SP - I';

    const kopHtml = `
      <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
        <tr>
          <td style="width:84px; vertical-align:middle; text-align:center;">
            <img src="${escapeHtml(logoSrc)}" alt="Logo" style="width:74px; height:74px; object-fit:contain;" />
          </td>
          <td style="text-align:center; vertical-align:middle; line-height:1.35;">
            <div style="font-size:12px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#1e293b;">
              YAYASAN NURUL ABROR AL-ROBBANIYIN
            </div>
            <div style="font-size:18px; font-weight:800; color:#0f172a; margin:2px 0;">
              SMP Nurul Abror Al &ndash; Robbaniyin
            </div>
            <div style="font-size:11.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#1e293b;">
              TERAKREDITASI
            </div>
            <div style="font-size:11px; color:#1e293b; margin-top:2px;">
              NSS: 202052521240 &nbsp;&nbsp;&nbsp; NPSN: 20574616 &nbsp;&nbsp;&nbsp; NIS: 201720
            </div>
            <div style="font-size:11px; color:#1e293b;">
              E_Mail: smpnaa_alrobbany@yahoo.com
            </div>
          </td>
          <td style="width:56px;"></td>
        </tr>
      </table>
      <div style="border:3px double #0f172a; padding:5px 10px; text-align:center; font-size:11px; font-weight:600; color:#0f172a; margin-bottom:16px;">
        Alamat : Jl. KH. Agus Salim 165 (0333) 461440 Alasbuluh Wongsorejo Banyuwangi 68453
      </div>
    `;

    let bodyHtml = '';
    if (jenisDokumen === 'berita_acara_pembinaan') {
      const klarifikasiBlock = catatanKlarifikasi.trim()
        ? `<div style="white-space:pre-line; min-height:68px; font-size:11.5px; color:#0f172a;">${escapeHtml(catatanKlarifikasi)}</div>`
        : `<div style="margin-top:14px;">
             <div style="border-bottom:1px dotted #64748b; height:18px;"></div>
             <div style="border-bottom:1px dotted #64748b; height:18px;"></div>
             <div style="border-bottom:1px dotted #64748b; height:18px;"></div>
             <div style="border-bottom:1px dotted #64748b; height:18px;"></div>
             <div style="border-bottom:1px dotted #64748b; height:18px;"></div>
           </div>`;

      const penandatanganNama =
        namaPenandatangan && namaPenandatangan !== 'Waka Kurikulum'
          ? escapeHtml(namaPenandatangan)
          : '( .................................................... )';

      bodyHtml = `
        <div style="text-align:center; margin-bottom:14px;">
          <div style="font-size:14px; font-weight:700; text-transform:uppercase; text-decoration:underline; letter-spacing:0.4px;">
            BERITA ACARA KLARIFIKASI DAN PEMBINAAN KEDISIPLINAN GURU/STAF
          </div>
          <div style="font-size:11.5px; font-style:italic; color:#334155; margin-top:4px;">
            Nomor: ${escapeHtml(nomorSurat || '..... / SMP.NAA / Edit-Bulan / 2026')}
          </div>
        </div>

        <p style="margin:0 0 10px 0;">
          Pada hari ini, <strong>${escapeHtml(dSurat.hari)}</strong> tanggal <strong>${escapeHtml(dSurat.tanggal)}</strong> bulan <strong>${escapeHtml(dSurat.bulan)}</strong> tahun <strong>${escapeHtml(dSurat.tahun)}</strong>, bertempat di <strong>${escapeHtml(lokasiPertemuan || 'Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin')}</strong>, telah dilaksanakan sesi klarifikasi dan pembinaan kedisiplinan terhadap:
        </p>

        <table style="width:94%; margin-left:16px; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
          <tr>
            <td style="width:185px; padding:3px 0;">Nama Lengkap</td>
            <td style="width:14px; padding:3px 0;">:</td>
            <td style="padding:3px 0; font-weight:700; border-bottom:1px dotted #94a3b8;">${escapeHtml(selectedNama)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">NIP / NTY</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; border-bottom:1px dotted #94a3b8;">${nipNty && nipNty !== '-' ? escapeHtml(nipNty) : ''}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">Jabatan / Tugas</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; border-bottom:1px dotted #94a3b8;">${escapeHtml(jabatan || 'Guru Mata Pelajaran / Staf Tata Usaha')}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">Mata Pelajaran (jika guru)</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; border-bottom:1px dotted #94a3b8;">${mataPelajaran && mataPelajaran !== '-' ? escapeHtml(mataPelajaran) : ''}</td>
          </tr>
        </table>

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          A. Pokok Permasalahan &amp; Hasil Klarifikasi
        </div>
        <p style="margin:4px 0;">
          1. Pelanggaran Kedisiplinan: ${escapeHtml(alasanUtama || 'Ketidakhadiran dalam Agenda Rapat Bulanan Sekolah / Tingkat Kehadiran Kerja harian di bawah standar operasional (80%).')}${persentaseKehadiran && persentaseKehadiran !== '-' ? ` (Kehadiran ${escapeHtml(periodeBulan)}: ${escapeHtml(persentaseKehadiran)}).` : ''}
        </p>
        ${rincianPelanggaran.trim() && rincianPelanggaran.trim() !== '-' ? `
        <div style="border:1px solid #cbd5e1; background:#f8fafc; padding:8px 12px; margin:6px 0 10px 0; font-size:11px; color:#0f172a;">
          <div style="font-weight:700; color:#1e3a8a; margin-bottom:4px;">Rekap Data Kehadiran &amp; Rincian Pelanggaran Tercatat (${escapeHtml(periodeBulan || 'Periode Berjalan')}):</div>
          <div style="white-space:pre-line; line-height:1.45;">${escapeHtml(rincianPelanggaran)}</div>
        </div>` : ''}
        <p style="margin:4px 0 8px 0;">2. Keterangan / Alasan Penyebab Ketidakhadiran:</p>
        <div style="border-left:3px solid #1e3a8a; background:#f8fafc; padding:10px 14px; margin-bottom:12px;">
          <div style="font-size:11.5px; font-weight:700; color:#1e293b; margin-bottom:6px;">
            Catatan Alasan dari Guru/Staf yang Bersangkutan:
          </div>
          ${klarifikasiBlock}
        </div>

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          B. Arahan &amp; Pembinaan oleh Waka Kurikulum
        </div>
        <ul style="margin:6px 0 12px 0; padding-left:20px; font-size:11.5px;">
          <li style="margin-bottom:4px;"><strong>Pentingnya Rapat Bulanan:</strong> Menjelaskan kembali fungsi vital rapat bulanan sebagai sarana koordinasi, sinkronisasi kurikulum, serta evaluasi pencapaian pembelajaran peserta didik di SMP Nurul Abror Al-Robbaniyin.</li>
          <li style="margin-bottom:4px;"><strong>Penegakan Nilai Organisasi:</strong> Mengingatkan kewajiban menjaga disiplin kerja, tanggung jawab, serta komitmen keteladanan (<em>uswah hasanah</em>) sesuai dengan Visi dan Misi Sekolah.</li>
          <li><strong>Mekanisme Perizinan:</strong> Mempertegas kembali Prosedur Operasional Standar (SOP) perizinan harian dan izin ketidakhadiran rapat (maksimal 3 kali izin per bulan dengan persetujuan pimpinan).</li>
        </ul>

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          C. Komitmen &amp; Rencana Tindak Lanjut
        </div>
        <ul style="margin:6px 0 16px 0; padding-left:20px; font-size:11.5px;">
          <li style="margin-bottom:4px;">Guru/Staf bersangkutan menyadari kekhilafan dan berkomitmen meningkatkan disiplin kehadiran harian maupun pertemuan resmi sekolah.</li>
          <li style="margin-bottom:4px;">Apabila berhalangan hadir karena alasan darurat, bersangkutan wajib menyampaikan konfirmasi tertulis/pesan resmi kepada Waka Kurikulum/Atasan sebelum kegiatan berlangsung.</li>
          <li>Guru bersangkutan bersedia diproses sesuai ketentuan berjenjang (Surat Peringatan) apabila pelanggaran kedisiplinan terulang di kemudian hari (hingga 3 kali akan ditindaklanjuti dengan SP &amp; Pemanggilan oleh Kepala Sekolah).</li>
        </ul>

        <table style="width:100%; border-collapse:collapse; margin-top:24px; font-size:12px;">
          <tr>
            <td style="width:50%; vertical-align:top;">
              <div>Guru / Staf yang Dibina,</div>
              <div style="height:64px;"></div>
              <div style="font-weight:700;">( ${escapeHtml(selectedNama || '....................................................')} )</div>
              <div style="font-size:11px;">NIP/NTY: ${nipNty && nipNty !== '-' ? escapeHtml(nipNty) : ''}</div>
            </td>
            <td style="width:50%; vertical-align:top;">
              <div>Waka Kurikulum / Tim Pembina,</div>
              <div style="height:64px;"></div>
              <div style="font-weight:700;">${penandatanganNama}</div>
              <div style="font-size:11px;">NIP/NTY: ${nipPenandatangan && nipPenandatangan !== '-' ? escapeHtml(nipPenandatangan) : ''}</div>
            </td>
          </tr>
        </table>
      `;
    } else {
      const judulSp = disertaiPemanggilan
        ? `SURAT PERINGATAN KEDISIPLINAN (${spLevel}) &amp; PEMANGGILAN KEPALA SEKOLAH`
        : `SURAT PERINGATAN KEDISIPLINAN (${spLevel})`;
      const pejabatTitle =
        penerbit === 'Kepala Sekolah'
          ? 'Kepala SMP Nurul Abror Al-Robbaniyin Wongsorejo'
          : 'Waka Kurikulum SMP Nurul Abror Al-Robbaniyin Wongsorejo';
      const pemanggilanHtml = disertaiPemanggilan
        ? `
          <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
            3. Pemanggilan Resmi Menghadap Kepala Sekolah
          </div>
          <p style="margin:4px 0 8px 0; font-size:11.5px;">
            Dikarenakan catatan pembinaan telah berulang hingga tahap ke-${urutanKe}, maka bersamaan dengan Surat Peringatan ini yang bersangkutan <strong>WAJIB hadir memenuhi pemanggilan Kepala Sekolah</strong> pada:
          </p>
          <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:10px 12px; margin-left:8px; margin-bottom:12px;">
            <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
              <tr>
                <td style="width:140px; padding:2px 0; font-weight:600;">Hari / Tanggal</td>
                <td style="width:12px;">:</td>
                <td style="font-weight:700;">${escapeHtml(dPanggil.hari)}, ${escapeHtml(dPanggil.lengkap)}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; font-weight:600;">Pukul</td>
                <td>:</td>
                <td style="font-weight:700;">${escapeHtml(jamPemanggilan || '09:00 WIB')}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; font-weight:600;">Tempat</td>
                <td>:</td>
                <td style="font-weight:700;">${escapeHtml(tempatPemanggilan || 'Ruang Kepala SMP Nurul Abror Al-Robbaniyin')}</td>
              </tr>
              <tr>
                <td style="padding:2px 0; font-weight:600; vertical-align:top;">Agenda</td>
                <td style="vertical-align:top;">:</td>
                <td>Klarifikasi akhir langsung bersama Kepala Sekolah, evaluasi komitmen perbaikan kinerja, dan penandatanganan Berita Acara Pembinaan Tingkat Akhir.</td>
              </tr>
            </table>
          </div>
        `
        : '';

      const riwayatLi =
        riwayatTerkait && riwayatTerkait !== '-'
          ? `<li style="margin-bottom:4px;"><strong>Akumulasi / Pengulangan Pembinaan Sebelumnya:</strong> ${escapeHtml(riwayatTerkait)}.</li>`
          : '';

      bodyHtml = `
        <div style="text-align:center; margin-bottom:14px;">
          <div style="font-size:14px; font-weight:700; text-transform:uppercase; text-decoration:underline; letter-spacing:0.4px;">
            ${judulSp}
          </div>
          <div style="font-size:11.5px; font-style:italic; color:#334155; margin-top:4px;">
            Nomor: ${escapeHtml(nomorSurat || '..... / SMP.NAA / Edit-Bulan / 2026')}
          </div>
        </div>

        <p style="margin:0 0 10px 0;">
          Yang bertanda tangan di bawah ini, <strong>${pejabatTitle}</strong>, berdasarkan ketentuan Tata Tertib dan Kode Etik Guru &amp; Karyawan Sekolah serta Yayasan, memberikan <strong>Surat Peringatan${disertaiPemanggilan ? ' sekaligus Pemanggilan Resmi' : ''}</strong> kepada:
        </p>

        <table style="width:94%; margin-left:16px; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
          <tr>
            <td style="width:170px; padding:3px 0;">Nama Lengkap</td>
            <td style="width:14px; padding:3px 0;">:</td>
            <td style="padding:3px 0; font-weight:700; border-bottom:1px dotted #94a3b8;">${escapeHtml(selectedNama)}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">NIP / NTY</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; border-bottom:1px dotted #94a3b8;">${nipNty && nipNty !== '-' ? escapeHtml(nipNty) : ''}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">Jabatan / Tugas</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; border-bottom:1px dotted #94a3b8;">${escapeHtml(jabatan || 'Guru / Karyawan (Staf Tata Usaha)')}</td>
          </tr>
          <tr>
            <td style="padding:3px 0;">Unit Kerja</td>
            <td style="padding:3px 0;">:</td>
            <td style="padding:3px 0; font-weight:700;">SMP Nurul Abror Al-Robbaniyin</td>
          </tr>
        </table>

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          1. Dasaran Pelanggaran Kedisiplinan
        </div>
        <p style="margin:4px 0;">
          Berdasarkan rekapitulasi presensi dan dokumen klarifikasi pembinaan internal${urutanKe >= 3 ? ` (pengulangan kedisiplinan ke-${urutanKe} setelah pembinaan sebelumnya)` : ''}, yang bersangkutan terbukti melakukan pelanggaran tata tertib berupa:
        </p>
        <ul style="margin:6px 0 10px 0; padding-left:20px; font-size:11.5px;">
          <li style="margin-bottom:4px;"><strong>Ketidakhadiran Rapat Bulanan:</strong> Tidak menghadiri agenda Rapat Bulanan Sekolah/Kurikulum tanpa konfirmasi/alasan sah pada tanggal <strong>${escapeHtml(tanggalRapatAbsen ? dRapat.lengkap : '........................................')}</strong>.</li>
          <li style="margin-bottom:4px;"><strong>Tingkat Kehadiran Kerja di Bawah Minimum:</strong> Persentase kehadiran harian dalam periode bulan <strong>${escapeHtml(periodeBulan || '........................................')}</strong> berada di bawah standar minimum 80%${persentaseKehadiran && persentaseKehadiran !== '-' ? ` (tercatat ${escapeHtml(persentaseKehadiran)})` : ''}.</li>
          ${riwayatLi}
          <li><strong>Pelanggaran Tata Tertib Lainnya:</strong> ${escapeHtml(pelanggaranLainnya.trim() || '..........................................................................................................................')}</li>
        </ul>
        ${rincianPelanggaran.trim() && rincianPelanggaran.trim() !== '-' ? `
        <div style="border:1px solid #cbd5e1; background:#f8fafc; padding:9px 12px; margin:6px 0 10px 0; font-size:11px; color:#0f172a;">
          <div style="font-weight:700; color:#1e3a8a; margin-bottom:4px;">Rekap Data Kehadiran &amp; Rincian Pelanggaran Tercatat (${escapeHtml(periodeBulan || 'Periode Berjalan')}):</div>
          <div style="white-space:pre-line; line-height:1.45;">${escapeHtml(rincianPelanggaran)}</div>
        </div>` : ''}

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          2. Dasar Hukum &amp; Ketentuan Sekolah
        </div>
        <p style="margin:4px 0;">Tindakan kedisiplinan ini diterbitkan merujuk pada ketentuan resmi sekolah dan yayasan:</p>
        <ul style="margin:6px 0 10px 0; padding-left:20px; font-size:11.5px;">
          <li style="margin-bottom:4px;">Tata Tertib dan Kode Etik SMP Nurul Abror Al-Robbaniyin Bab II (Disiplin Kerja &amp; Kewajiban Selaku Pendidik/Pengajar).</li>
          <li>SOP Yayasan Pendidikan Islam Nurul Abror Al-Robbaniyin mengenai sanksi kedisiplinan berjenjang bagi pegawai.</li>
        </ul>

        ${pemanggilanHtml}

        <div style="font-size:12.5px; font-weight:700; color:#1e3a8a; border-bottom:1px solid #1e3a8a; padding-bottom:3px; margin:12px 0 6px 0;">
          ${disertaiPemanggilan ? '4' : '3'}. Sanksi &amp; Penegasan Komitmen
        </div>
        <div style="border-left:3px solid #1e3a8a; background:#f1f5f9; padding:10px 12px; font-size:11.5px; margin-bottom:8px;">
          <div style="font-weight:700; margin-bottom:2px;">Maksud dan Tujuan Penerbitan Surat Peringatan:</div>
          <div>Surat Peringatan ini diterbitkan bukan sebagai bentuk hukuman personal, melainkan sebagai sarana evaluasi, pembinaan formal, dan penegakan profesionalisme agar yang bersangkutan segera melakukan perbaikan kinerja, meningkatkan integritas, dan menaati seluruh tata tertib yang berlaku di SMP Nurul Abror Al-Robbaniyin.</div>
        </div>
        <p style="margin:6px 0 16px 0; font-size:11.5px;">
          Apabila dalam kurun waktu evaluasi mendatang yang bersangkutan tidak menunjukkan perbaikan sikap dan kedisiplinan secara signifikan, maka sekolah akan melimpahkan berkas penanganan dan rekomendasi sanksi tingkat lanjut (skorsing/pemberhentian) kepada Biro Pendidikan Yayasan.
        </p>

        <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:12px;">
          <tr>
            <td style="width:50%; vertical-align:top;">
              <div style="font-style:italic;">Mengetahui / Menerima,</div>
              <div>Guru / Karyawan Bersangkutan,</div>
              <div style="height:64px;"></div>
              <div style="font-weight:700;">( ${escapeHtml(selectedNama || '....................................................')} )</div>
            </td>
            <td style="width:50%; vertical-align:top;">
              <div>Ditetapkan di Wongsorejo, ${escapeHtml(dSurat.lengkap)}</div>
              <div>${penerbit === 'Kepala Sekolah' ? 'Kepala SMP Nurul Abror Al-Robbaniyin,' : 'Waka Kurikulum SMP Nurul Abror Al-Robbaniyin,'}</div>
              <div style="height:64px;"></div>
              <div style="font-weight:700;">${escapeHtml(namaPenandatangan || (penerbit === 'Kepala Sekolah' ? 'Halik, S.Pd' : 'Waka Kurikulum'))}</div>
              ${nipPenandatangan && nipPenandatangan !== '-' ? `<div style="font-size:11px;">NIP/NTY: ${escapeHtml(nipPenandatangan)}</div>` : ''}
            </td>
          </tr>
        </table>

        <div style="margin-top:16px; font-size:11px; color:#334155;">
          <div style="font-weight:700;">Tembusan Yth:</div>
          <ol style="margin:3px 0 0 0; padding-left:18px;">
            <li>Ketua Biro Pendidikan Yayasan Nurul Abror Al-Robbaniyin</li>
            <li>Waka Kurikulum / Kesiswaan SMP Nurul Abror Al-Robbaniyin</li>
            <li>Arsip Kepegawaian (TU)</li>
          </ol>
        </div>
      `;
    }

    const printScript = autoPrint
      ? `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 250); });</script>`
      : '';

    return `<!DOCTYPE html>
<html lang="id" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(nomorSurat || 'Surat Pembinaan Kedisiplinan')} - ${escapeHtml(selectedNama || 'SMP NAA')}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 16mm 16mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.5; margin: 0; padding: 20px; background: #ffffff; }
  .sheet { max-width: 760px; margin: 0 auto; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  ${autoPrint ? `<div class="no-print" style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
    <span>Dokumen resmi siap cetak A4. Jika dialog cetak tidak muncul otomatis, klik tombol di samping atau tekan <strong>Ctrl + P</strong>.</span>
    <button onclick="window.print()" style="background:#2F5597; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:700; cursor:pointer;">Cetak / Simpan PDF</button>
  </div>` : ''}
  <div class="sheet">
    ${kopHtml}
    ${bodyHtml}
  </div>
  ${printScript}
</body>
</html>`;
  };

  const handleDownloadLetter = async (format: 'doc' | 'html') => {
    setIsExporting(true);
    try {
      const logoUri = await getLogoDataUri();
      const htmlContent = buildFormalLetterHtml(logoUri, format === 'html');
      const mime = format === 'doc' ? 'application/msword;charset=utf-8' : 'text/html;charset=utf-8';
      const blob = new Blob(['\ufeff', htmlContent], { type: mime });
      const url = URL.createObjectURL(blob);
      const safeName = (selectedNama || 'Draft_Surat').replace(/[^a-zA-Z0-9]+/g, '_');
      const safeNo = (nomorSurat || 'SMPNAA').replace(/[^a-zA-Z0-9]+/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeNo}_${safeName}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setPrintNotice({
        type: 'success',
        text:
          format === 'doc'
            ? `File Word (.doc) berhasil diunduh (${a.download}). Buka di Microsoft Word / WPS Office untuk cetak atau pengeditan lanjutan.`
            : `File Siap Cetak (.html) berhasil diunduh (${a.download}). Buka file tersebut di browser untuk langsung mencetak atau Simpan sebagai PDF (A4).`
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    try {
      window.print();
    } catch {
      // ignore if blocked by iframe sandbox
    }

    if (inIframe) {
      setPrintNotice({
        type: 'info',
        text: 'Preview saat ini berjalan di dalam bingkai aplikasi (iframe), sehingga browser preview sering memblokir dialog cetak otomatis. Gunakan tombol "Unduh Siap Cetak (.html)" atau "Unduh Word (.doc)" di atas, atau buka link GitHub Pages aplikasi Anda di tab browser normal untuk mencetak langsung.'
      });
    } else {
      setPrintNotice({
        type: 'success',
        text: 'Dialog Cetak / Simpan PDF browser dipanggil. Jika di HP dialog cetak tidak muncul, gunakan tombol "Unduh Word (.doc)" atau "Unduh Siap Cetak (.html)".'
      });
    }
  };

  const filteredArchive = useMemo(() => {
    return spList
      .filter((s) => {
        if (archiveFilterTahap !== 'semua' && s.tahap !== archiveFilterTahap) return false;
        if (archiveSearch.trim()) {
          const q = archiveSearch.trim().toLowerCase();
          return (
            s.nama.toLowerCase().includes(q) ||
            s.nomorSurat.toLowerCase().includes(q) ||
            s.tahap.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => (b.waktuDibuat || b.tanggalSurat).localeCompare(a.waktuDibuat || a.tanggalSurat));
  }, [spList, archiveFilterTahap, archiveSearch]);

  const dateIndoSurat = parseDatePartsIndo(tanggalSurat);
  const dateIndoRapat = parseDatePartsIndo(tanggalRapatAbsen);
  const dateIndoPanggil = parseDatePartsIndo(tanggalPemanggilan);

  const spLevelTag =
    tahap === 'SP-III + Pemanggilan'
      ? 'SP - III'
      : tahap === 'SP-II'
      ? 'SP - II'
      : 'SP - I';

  return (
    <div className="space-y-6">
      {/* Header Banner (Screen Only) */}
      <div className="print:hidden bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center text-rose-700 shrink-0">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">
              Pembinaan Kedisiplinan &amp; Surat Peringatan (SP)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Tahap 1 diterbitkan oleh <strong>Waka Kurikulum</strong> sebagai teguran &amp; klarifikasi pertama. Apabila berulang sampai <strong>3 kali</strong>, otomatis eskalasi menjadi <strong>SP-III &amp; Pemanggilan Kepala Sekolah</strong> dengan pencatatan Nomor Surat resmi ke database (<code className="bg-slate-100 px-1 rounded font-mono font-bold">Data_SP</code>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPanduanBahasa((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{showPanduanBahasa ? 'Tutup Panduan Tabayyun' : 'Panduan Bahasa Pembinaan'}</span>
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleDownloadLetter('doc')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Word (.doc)</span>
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleDownloadLetter('html')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Unduh Siap Cetak (.html)</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2F5597] hover:bg-[#234278] text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak / PDF Surat</span>
          </button>
        </div>
      </div>

      {/* Print / Export Feedback Notice */}
      {printNotice && (
        <div
          className={`print:hidden p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-xs ${
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
            className="p-1 rounded-lg hover:bg-black/5 shrink-0 cursor-pointer"
            title="Tutup info"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warning Notice if Code.gs doesn't support Data_SP yet */}
      {webAppUrl && !hasRemoteSpSheet && (
        <div className="print:hidden p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Sheet <strong>Data_SP</strong> belum terdeteksi di respons Apps Script. Agar pencatatan nomor surat langsung tersimpan ke tab <strong>Data_SP</strong> Google Sheets, salin &amp; deploy ulang kode terbaru dari menu <strong>Pengaturan Sheets</strong>.
            </span>
          </div>
          {userRole === 'admin' && onNavigateToSetup && (
            <button
              type="button"
              onClick={onNavigateToSetup}
              className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold text-[11px] shrink-0"
            >
              Buka Pengaturan Sheets
            </button>
          )}
        </div>
      )}

      {/* Panduan Bahasa & SOP Bertahap (Sesuai Halaman 5 PDF) */}
      {showPanduanBahasa && (
        <div className="print:hidden bg-gradient-to-br from-indigo-50/80 to-white border border-indigo-200 rounded-2xl p-5 space-y-3 text-xs text-slate-700 shadow-xs">
          <h3 className="text-sm font-black text-indigo-950 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Panduan Pendekatan Bertahap &amp; Formulasi Bahasa (Sesuai SOP Sekolah)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-3.5 rounded-xl border border-indigo-100 space-y-1.5">
              <p className="font-extrabold text-indigo-900">1. Tahap Pembinaan &amp; Dialog (Waka Kurikulum)</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                <strong>Asas Tabayyun (Persuasif &amp; Edukatif):</strong> <em>&ldquo;Kami mengundang Bapak/Ibu ke ruang kurikulum untuk bersilaturahmi sekaligus mengonfirmasi kendala yang dihadapi saat agenda rapat kemarin, agar kita bisa mencari solusi bersama demi kelancaran program sekolah.&rdquo;</em>
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                <strong>Fokus Dampak Komunitas:</strong> <em>&ldquo;Kehadiran Bapak/Ibu sangat kami harapkan karena gagasan dan kontribusi Bapak/Ibu penting dalam menjaga kualitas pembelajaran siswa-siswi kita.&rdquo;</em>
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-indigo-100 space-y-1.5">
              <p className="font-extrabold text-rose-900">2. Eskalasi 3 Kali &rarr; SP &amp; Pemanggilan Kepala Sekolah</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Apabila teguran/pembinaan Kurikulum berulang hingga <strong>3 kali</strong>, sistem menandai eskalasi menjadi <strong>SP-III bersamaan Pemanggilan Kepala Sekolah</strong> untuk evaluasi formal dan penandatanganan komitmen sebelum rekomendasi tindak lanjut ke Biro Pendidikan Yayasan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan Pemantauan Kedisiplinan & Akumulasi Teguran (Screen Only) */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#2F5597]" />
              <span>Pemantauan Kedisiplinan &amp; Riwayat SP Pegawai</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Data kehadiran bulan ini (standar minimal 80%) digabungkan dengan akumulasi catatan SP/Pembinaan tersimpan.{' '}
              <span className="text-teal-700 font-semibold">
                Status Cuti Resmi (memiliki izin cuti &amp; guru pengganti) dikecualikan dan tidak dihitung sebagai pelanggaran.
              </span>
            </p>
          </div>
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setCandidateFilter('perlu_perhatian')}
              className={`px-3 py-1 rounded-lg transition ${
                candidateFilter === 'perlu_perhatian'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Pembinaan / Ada Riwayat SP
            </button>
            <button
              type="button"
              onClick={() => setCandidateFilter('semua')}
              className={`px-3 py-1 rounded-lg transition ${
                candidateFilter === 'semua'
                  ? 'bg-white text-[#2F5597] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Pegawai ({teacherStats.length})
            </button>
          </div>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Belum ada pegawai dengan kehadiran di bawah 80% bulan ini atau riwayat SP aktif. Klik <strong>Semua Pegawai</strong> untuk memilih secara manual.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Nama Guru / Staf</th>
                  <th className="px-3 py-2 text-center">Kehadiran Bulan Ini</th>
                  <th className="px-3 py-2 text-center">Telat / Alpa</th>
                  <th className="px-3 py-2 text-center">Riwayat Teguran/SP</th>
                  <th className="px-3 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCandidates.map((row) => (
                  <tr key={`cand-${row.teacher.no}-${row.teacher.nama}`} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-800">{row.teacher.nama}</div>
                      <div className="text-[10.5px] text-slate-500">{row.teacher.jabatan}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {row.pctHadir !== null ? (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                              row.pctHadir < 80
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {row.pctHadir}% ({row.hadirCount}/{row.effectiveTotalLogs})
                          </span>
                        ) : row.cutiCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            Sedang Cuti Resmi
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-slate-400">Belum ada log</span>
                        )}
                        {row.cutiCount > 0 && (
                          <span className="text-[10px] font-semibold text-teal-700">
                            Cuti Resmi: {row.cutiCount} hr (Non-Pelanggaran)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[11px]">
                      <span className="text-amber-700 font-bold">{row.terlambatCount}</span> /{' '}
                      <span className="text-rose-700 font-bold">{row.alpaCount}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.spCount === 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10.5px] font-bold">
                          0x (Belum Pernah)
                        </span>
                      ) : row.spCount === 1 ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10.5px] font-bold">
                          1x (Tahap 1 Kurikulum)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 text-[10.5px] font-black">
                          {row.spCount}x &bull; {row.spCount >= 2 ? 'Eskalasi Kepsek (Ke-3)' : 'Lanjutan'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => applyTeacherSelection(row.teacher.nama)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                          row.spCount >= 2
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-[#2F5597] hover:bg-[#234278] text-white'
                        }`}
                      >
                        {row.spCount >= 2 ? 'Buat SP-III & Pemanggilan' : row.spCount === 1 ? 'Buat SP-II' : 'Buat Teguran I'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Workspace: Form (Left) + Live Official Letter Preview (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: FORM INPUT (Hidden on Print) */}
        <form
          onSubmit={handleSaveSubmit}
          className="print:hidden xl:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2F5597]" />
              <span>{editingId ? 'Edit / Tinjau Surat Tercatat' : 'Terbitkan Pembinaan / SP Baru'}</span>
            </h3>
            <button
              type="button"
              onClick={handleResetNew}
              className="text-[11px] font-bold text-[#2F5597] hover:underline"
            >
              + Buat Baru
            </button>
          </div>

          {/* Escalation Alert Banner when teacher repeats >= 3 times */}
          {(urutanKe >= 3 || selectedTeacherHistory.length >= 2 || tahap === 'SP-III + Pemanggilan') && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-start gap-2.5 text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black">
                  Berulang 3 Kali &rarr; SP-III + Pemanggilan Kepala Sekolah
                </p>
                <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                  Pegawai ini telah memiliki <strong>{selectedTeacherHistory.length}</strong> catatan teguran/pembinaan sebelumnya. Sesuai aturan sekolah, surat ke-3 diterbitkan oleh <strong>Kepala Sekolah</strong> bersamaan dengan <strong>Pemanggilan Resmi</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Pilih Pegawai */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Guru / Staf <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedNama}
              onChange={(e) => applyTeacherSelection(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
            >
              <option value="">-- Pilih Guru / Staf --</option>
              {masterList.map((m, idx) => (
                <option key={`sp-opt-${m.no || idx}-${m.nama}`} value={m.nama}>
                  {m.nama} &mdash; {m.jabatan}
                </option>
              ))}
            </select>
            {selectedTeacherHistory.length > 0 && (
              <p className="text-[11px] text-amber-700 font-semibold mt-1">
                Riwayat sebelumnya ({selectedTeacherHistory.length}x):{' '}
                {selectedTeacherHistory.map((h) => `${h.tahap} (${h.nomorSurat})`).join(', ')}
              </p>
            )}
          </div>

          {/* Nomor Surat & Tanggal Surat */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Nomor Surat <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setNomorSurat(generateNextNomorSurat(spList, tanggalSurat))}
                  className="text-[10.5px] font-bold text-[#2F5597] hover:underline"
                >
                  Auto Nomor
                </button>
              </div>
              <input
                type="text"
                value={nomorSurat}
                onChange={(e) => setNomorSurat(e.target.value)}
                placeholder="001 / SMP.NAA / XI / 2026"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tanggal Surat
              </label>
              <input
                type="date"
                value={tanggalSurat}
                onChange={(e) => {
                  setTanggalSurat(e.target.value);
                  setPeriodeBulan(getPeriodeBulanFromDate(e.target.value));
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>
          </div>

          {/* Tahap & Penerbit & Format Dokumen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tahap Peringatan / Pembinaan
              </label>
              <select
                value={tahap}
                onChange={(e) => handleTahapChange(e.target.value as SpTahap)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              >
                <option value="Teguran / Pembinaan I">Tahap 1: Teguran / Pembinaan I (Kurikulum)</option>
                <option value="SP-I">SP-I (Surat Peringatan I)</option>
                <option value="SP-II">SP-II (Surat Peringatan II)</option>
                <option value="SP-III + Pemanggilan">Tahap 3: SP-III + Pemanggilan Kepala Sekolah</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Penerbit / Pejabat
              </label>
              <select
                value={penerbit}
                onChange={(e) => {
                  const val = e.target.value as SpPenerbit;
                  setPenerbit(val);
                  if (val === 'Kepala Sekolah') {
                    setNamaPenandatangan('Halik, S.Pd');
                  } else if (namaPenandatangan === 'Halik, S.Pd') {
                    setNamaPenandatangan('Waka Kurikulum');
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              >
                <option value="Waka Kurikulum">Waka Kurikulum (Teguran Pertama / Pembinaan)</option>
                <option value="Kepala Sekolah">Kepala Sekolah (SP &amp; Pemanggilan)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Format Dokumen Resmi
              </label>
              <select
                value={jenisDokumen}
                onChange={(e) => setJenisDokumen(e.target.value as SpJenisDokumen)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              >
                <option value="berita_acara_pembinaan">Berita Acara Klarifikasi &amp; Pembinaan (Hal 1-2)</option>
                <option value="surat_peringatan">Surat Peringatan Kedisiplinan SP (Hal 3-4)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pelanggaran Ke- (Urutan)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={urutanKe}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 1;
                  setUrutanKe(val);
                  if (val >= 3) {
                    setDisertaiPemanggilan(true);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>
          </div>

          {/* Identitas di Surat */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">NIP / NTY</label>
              <input
                type="text"
                value={nipNty}
                onChange={(e) => setNipNty(e.target.value)}
                placeholder="-"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Jabatan / Tugas</label>
              <input
                type="text"
                value={jabatan}
                onChange={(e) => setJabatan(e.target.value)}
                placeholder="Guru Mata Pelajaran"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran</label>
              <input
                type="text"
                value={mataPelajaran}
                onChange={(e) => setMataPelajaran(e.target.value)}
                placeholder="-"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Detail Permasalahan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tgl Rapat Absen (Opsional)</label>
              <input
                type="date"
                value={tanggalRapatAbsen}
                onChange={(e) => setTanggalRapatAbsen(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Periode Bulan</label>
              <input
                type="text"
                value={periodeBulan}
                onChange={(e) => setPeriodeBulan(e.target.value)}
                placeholder="November 2026"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">% Kehadiran</label>
              <input
                type="text"
                value={persentaseKehadiran}
                onChange={(e) => setPersentaseKehadiran(e.target.value)}
                placeholder="mis. 72%"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Data Kehadiran & Rincian Pelanggaran Otomatis dari Log */}
          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-extrabold text-[#1e3a8a]">
                Data Kehadiran &amp; Rincian Pelanggaran (Disertakan di Surat)
              </label>
              <button
                type="button"
                disabled={!selectedNama}
                onClick={() => {
                  const b = buildAttendanceBreakdownText(selectedNama, tanggalSurat);
                  if (b.pct) setPersentaseKehadiran(b.pct);
                  setRincianPelanggaran(b.text);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-100 text-[#2F5597] border border-blue-300 rounded-lg text-[10.5px] font-bold transition disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Muat Data Log Terbaru</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={rincianPelanggaran}
              onChange={(e) => setRincianPelanggaran(e.target.value)}
              placeholder="Pilih nama guru/staf untuk mengisi otomatis rekap % kehadiran serta daftar tanggal Terlambat & Tidak Hadir/Alpa (Cuti Resmi otomatis dikecualikan)..."
              className="w-full px-3 py-2 bg-white border border-blue-200 rounded-xl text-[11px] font-mono leading-relaxed text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
            />
            <p className="text-[10px] text-slate-600 leading-snug">
              Data ditarik otomatis dari rekap bulan terkait (termasuk Alpa otomatis &gt;90 menit &amp; keterlambatan; <strong>Cuti Resmi</strong> dikecualikan). Bisa diedit manual sebelum menyimpan/mencetak.
            </p>
          </div>

          {jenisDokumen === 'berita_acara_pembinaan' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tempat Klarifikasi</label>
                <input
                  type="text"
                  value={lokasiPertemuan}
                  onChange={(e) => setLokasiPertemuan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pokok Permasalahan Kedisiplinan</label>
                <textarea
                  rows={2}
                  value={alasanUtama}
                  onChange={(e) => setAlasanUtama(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Alasan / Klarifikasi Guru (kosongkan jika diisi tulisan tangan saat tatap muka)
                </label>
                <textarea
                  rows={3}
                  value={catatanKlarifikasi}
                  onChange={(e) => setCatatanKlarifikasi(e.target.value)}
                  placeholder="Biarkan kosong untuk menampilkan garis isian tulisan tangan pada cetakan kertas..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pelanggaran Tata Tertib Lainnya (Opsional)
              </label>
              <textarea
                rows={2}
                value={pelanggaranLainnya}
                onChange={(e) => setPelanggaranLainnya(e.target.value)}
                placeholder="Misalnya: Sering terlambat masuk jam pelajaran pertama..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
          )}

          {/* Pemanggilan Kepala Sekolah Section */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <label className="flex items-center gap-2 text-xs font-extrabold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={disertaiPemanggilan}
                onChange={(e) => {
                  setDisertaiPemanggilan(e.target.checked);
                  if (e.target.checked && penerbit !== 'Kepala Sekolah') {
                    setPenerbit('Kepala Sekolah');
                    setNamaPenandatangan('Halik, S.Pd');
                  }
                }}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
              />
              <span>Sertakan Pemanggilan Resmi oleh Kepala Sekolah (Wajib bila berulang 3x)</span>
            </label>

            {disertaiPemanggilan && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tanggal Pemanggilan</label>
                  <input
                    type="date"
                    value={tanggalPemanggilan}
                    onChange={(e) => setTanggalPemanggilan(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Pukul</label>
                  <input
                    type="text"
                    value={jamPemanggilan}
                    onChange={(e) => setJamPemanggilan(e.target.value)}
                    placeholder="09:00 WIB"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tempat Menghadap</label>
                  <input
                    type="text"
                    value={tempatPemanggilan}
                    onChange={(e) => setTempatPemanggilan(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Rujukan Riwayat Teguran/Pembinaan Sebelumnya
                  </label>
                  <input
                    type="text"
                    value={riwayatTerkait}
                    onChange={(e) => setRiwayatTerkait(e.target.value)}
                    placeholder="Contoh: Tahap 1 (No. 001/...), SP-II (No. 004/...)"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Penandatangan & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Penandatangan</label>
              <input
                type="text"
                value={namaPenandatangan}
                onChange={(e) => setNamaPenandatangan(e.target.value)}
                placeholder={penerbit === 'Kepala Sekolah' ? 'Halik, S.Pd' : 'Waka Kurikulum'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">NIP/NTY Penandatangan</label>
              <input
                type="text"
                value={nipPenandatangan}
                onChange={(e) => setNipPenandatangan(e.target.value)}
                placeholder="Opsional"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Status Arsip</label>
              <select
                value={statusTindakLanjut}
                onChange={(e) => setStatusTindakLanjut(e.target.value as SpStatusTindakLanjut)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value="Diterbitkan">Diterbitkan</option>
                <option value="Sudah Klarifikasi">Sudah Klarifikasi</option>
                <option value="Selesai Pembinaan">Selesai Pembinaan</option>
                <option value="Eskalasi Kepala Sekolah">Eskalasi Kepala Sekolah</option>
              </select>
            </div>
          </div>

          {saveMessage && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                saveMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : saveMessage.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveMessage.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Menyimpan...' : editingId ? 'Perbarui Catatan & No. Surat' : 'Simpan No. Surat & Catatan'}</span>
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={() => handleDownloadLetter('doc')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Word (.doc)</span>
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={() => handleDownloadLetter('html')}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>HTML Cetak</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#2F5597] hover:bg-[#234278] text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN: LIVE OFFICIAL DOCUMENT PREVIEW & PRINT SHEET (A4) */}
        <div className="xl:col-span-7 print:col-span-12">
          <div className="print:hidden mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="font-bold uppercase tracking-wider">
              Pratinjau Dokumen Resmi ({jenisDokumen === 'berita_acara_pembinaan' ? 'Berita Acara Kurikulum' : `${spLevelTag} Resmi`})
            </span>
            <span>Ukuran Kertas: A4 Portrait</span>
          </div>

          <div
            ref={printSheetRef}
            className="bg-white border border-slate-300 shadow-md rounded-xl p-6 sm:p-10 text-slate-900 print:border-none print:shadow-none print:p-0 print:rounded-none font-serif text-[12.5px] leading-relaxed"
          >
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 14mm 16mm 16mm 16mm;
                }
                body {
                  background: #ffffff !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            `}</style>

            {/* KOP SURAT SAMA PERSIS DENGAN FILE PDF */}
            <div className="font-sans">
              <KopSuratResmi />
            </div>

            {jenisDokumen === 'berita_acara_pembinaan' ? (
              /* ============================================================
                 FORMAT 1: BERITA ACARA KLARIFIKASI DAN PEMBINAAN (KURIKULUM)
                 ============================================================ */
              <div className="mt-5 space-y-4 font-sans text-[12px] text-slate-900">
                <div className="text-center">
                  <h2 className="text-[14px] font-bold uppercase underline underline-offset-4 tracking-wide">
                    BERITA ACARA KLARIFIKASI DAN PEMBINAAN KEDISIPLINAN GURU/STAF
                  </h2>
                  <p className="text-[11.5px] italic text-slate-700 mt-1">
                    Nomor: {nomorSurat || '..... / SMP.NAA / Edit-Bulan / 2026'}
                  </p>
                </div>

                <p className="leading-relaxed">
                  Pada hari ini, <span className="font-semibold">{dateIndoSurat.hari}</span> tanggal{' '}
                  <span className="font-semibold">{dateIndoSurat.tanggal}</span> bulan{' '}
                  <span className="font-semibold">{dateIndoSurat.bulan}</span> tahun{' '}
                  <span className="font-semibold">{dateIndoSurat.tahun}</span>, bertempat di{' '}
                  <span className="font-semibold">{lokasiPertemuan || 'Ruang Kurikulum SMP Nurul Abror Al-Robbaniyin'}</span>,
                  telah dilaksanakan sesi klarifikasi dan pembinaan kedisiplinan terhadap:
                </p>

                <table className="w-full text-[12px] ml-4 max-w-[92%]">
                  <tbody>
                    <tr>
                      <td className="py-0.5 w-48 align-top">Nama Lengkap</td>
                      <td className="py-0.5 w-4 align-top">:</td>
                      <td className="py-0.5 font-semibold border-b border-dotted border-slate-400">
                        {selectedNama || ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">NIP / NTY</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 border-b border-dotted border-slate-400">
                        {nipNty && nipNty !== '-' ? nipNty : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">Jabatan / Tugas</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 border-b border-dotted border-slate-400">
                        {jabatan || 'Guru Mata Pelajaran / Staf Tata Usaha'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">Mata Pelajaran (jika guru)</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 border-b border-dotted border-slate-400">
                        {mataPelajaran && mataPelajaran !== '-' ? mataPelajaran : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* A. Pokok Permasalahan & Hasil Klarifikasi */}
                <div className="pt-2 space-y-2">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    A. Pokok Permasalahan &amp; Hasil Klarifikasi
                  </h3>
                  <p>
                    1. Pelanggaran Kedisiplinan: {alasanUtama || 'Ketidakhadiran dalam Agenda Rapat Bulanan Sekolah / Tingkat Kehadiran Kerja harian di bawah standar operasional (80%).'}
                    {persentaseKehadiran && persentaseKehadiran !== '-' ? ` (Kehadiran ${periodeBulan}: ${persentaseKehadiran}).` : ''}
                  </p>
                  {rincianPelanggaran.trim() && rincianPelanggaran.trim() !== '-' && (
                    <div className="border border-slate-300 bg-slate-50 p-2.5 rounded text-[11px] text-slate-900">
                      <p className="font-bold text-[#1e3a8a] mb-1">
                        Rekap Data Kehadiran &amp; Rincian Pelanggaran Tercatat ({periodeBulan || 'Periode Berjalan'}):
                      </p>
                      <div className="whitespace-pre-line leading-relaxed">{rincianPelanggaran}</div>
                    </div>
                  )}
                  <p>2. Keterangan / Alasan Penyebab Ketidakhadiran:</p>

                  <div className="border-l-[3px] border-[#1e3a8a] bg-slate-50/70 p-3.5 space-y-2">
                    <p className="text-[11.5px] font-semibold text-slate-800">
                      Catatan Alasan dari Guru/Staf yang Bersangkutan:
                    </p>
                    {catatanKlarifikasi.trim() ? (
                      <p className="text-[12px] text-slate-900 whitespace-pre-line min-h-[72px]">
                        {catatanKlarifikasi}
                      </p>
                    ) : (
                      <div className="space-y-4 pt-2 pb-1">
                        <div className="border-b border-dotted border-slate-400 h-3" />
                        <div className="border-b border-dotted border-slate-400 h-3" />
                        <div className="border-b border-dotted border-slate-400 h-3" />
                        <div className="border-b border-dotted border-slate-400 h-3" />
                        <div className="border-b border-dotted border-slate-400 h-3" />
                      </div>
                    )}
                  </div>
                </div>

                {/* B. Arahan & Pembinaan oleh Waka Kurikulum */}
                <div className="pt-1 space-y-1.5">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    B. Arahan &amp; Pembinaan oleh Waka Kurikulum
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed">
                    <li>
                      <strong>Pentingnya Rapat Bulanan:</strong> Menjelaskan kembali fungsi vital rapat bulanan sebagai sarana koordinasi, sinkronisasi kurikulum, serta evaluasi pencapaian pembelajaran peserta didik di SMP Nurul Abror Al-Robbaniyin.
                    </li>
                    <li>
                      <strong>Penegakan Nilai Organisasi:</strong> Mengingatkan kewajiban menjaga disiplin kerja, tanggung jawab, serta komitmen keteladanan (<em>uswah hasanah</em>) sesuai dengan Visi dan Misi Sekolah.
                    </li>
                    <li>
                      <strong>Mekanisme Perizinan:</strong> Mempertegas kembali Prosedur Operasional Standar (SOP) perizinan harian dan izin ketidakhadiran rapat (maksimal 3 kali izin per bulan dengan persetujuan pimpinan).
                    </li>
                  </ul>
                </div>

                {/* C. Komitmen & Rencana Tindak Lanjut */}
                <div className="pt-1 space-y-1.5">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    C. Komitmen &amp; Rencana Tindak Lanjut
                  </h3>
                  <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed">
                    <li>
                      Guru/Staf bersangkutan menyadari kekhilafan dan berkomitmen meningkatkan disiplin kehadiran harian maupun pertemuan resmi sekolah.
                    </li>
                    <li>
                      Apabila berhalangan hadir karena alasan darurat, bersangkutan wajib menyampaikan konfirmasi tertulis/pesan resmi kepada Waka Kurikulum/Atasan sebelum kegiatan berlangsung.
                    </li>
                    <li>
                      Guru bersangkutan bersedia diproses sesuai ketentuan berjenjang (Surat Peringatan) apabila pelanggaran kedisiplinan terulang di kemudian hari (hingga 3 kali akan ditindaklanjuti dengan SP &amp; Pemanggilan oleh Kepala Sekolah).
                    </li>
                  </ul>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-6 text-[12px]">
                  <div>
                    <p>Guru / Staf yang Dibina,</p>
                    <div className="h-16" />
                    <p className="font-semibold">
                      ( {selectedNama || '....................................................'} )
                    </p>
                    <p className="text-[11px]">NIP/NTY: {nipNty && nipNty !== '-' ? nipNty : ''}</p>
                  </div>
                  <div>
                    <p>Waka Kurikulum / Tim Pembina,</p>
                    <div className="h-16" />
                    <p className="font-semibold">
                      {namaPenandatangan && namaPenandatangan !== 'Waka Kurikulum'
                        ? namaPenandatangan
                        : '( .................................................... )'}
                    </p>
                    <p className="text-[11px]">NIP/NTY: {nipPenandatangan && nipPenandatangan !== '-' ? nipPenandatangan : ''}</p>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================
                 FORMAT 2: SURAT PERINGATAN KEDISIPLINAN (SP I / II / III)
                 (+ PEMANGGILAN KEPALA SEKOLAH BILA BERULANG >= 3 KALI)
                 ============================================================ */
              <div className="mt-5 space-y-4 font-sans text-[12px] text-slate-900">
                <div className="text-center">
                  <h2 className="text-[14px] font-bold uppercase underline underline-offset-4 tracking-wide">
                    {disertaiPemanggilan
                      ? `SURAT PERINGATAN KEDISIPLINAN (${spLevelTag}) & PEMANGGILAN KEPALA SEKOLAH`
                      : `SURAT PERINGATAN KEDISIPLINAN (${spLevelTag})`}
                  </h2>
                  <p className="text-[11.5px] italic text-slate-700 mt-1">
                    Nomor: {nomorSurat || '..... / SMP.NAA / Edit-Bulan / 2026'}
                  </p>
                </div>

                <p className="leading-relaxed">
                  Yang bertanda tangan di bawah ini,{' '}
                  <strong>
                    {penerbit === 'Kepala Sekolah'
                      ? 'Kepala SMP Nurul Abror Al-Robbaniyin Wongsorejo'
                      : 'Waka Kurikulum SMP Nurul Abror Al-Robbaniyin Wongsorejo'}
                  </strong>
                  , berdasarkan ketentuan Tata Tertib dan Kode Etik Guru &amp; Karyawan Sekolah serta Yayasan, memberikan{' '}
                  <strong>
                    Surat Peringatan{disertaiPemanggilan ? ' sekaligus Pemanggilan Resmi' : ''}
                  </strong>{' '}
                  kepada:
                </p>

                <table className="w-full text-[12px] ml-4 max-w-[92%]">
                  <tbody>
                    <tr>
                      <td className="py-0.5 w-44 align-top">Nama Lengkap</td>
                      <td className="py-0.5 w-4 align-top">:</td>
                      <td className="py-0.5 font-semibold border-b border-dotted border-slate-400">
                        {selectedNama || ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">NIP / NTY</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 border-b border-dotted border-slate-400">
                        {nipNty && nipNty !== '-' ? nipNty : ''}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">Jabatan / Tugas</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 border-b border-dotted border-slate-400">
                        {jabatan || 'Guru / Karyawan (Staf Tata Usaha)'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-0.5 align-top">Unit Kerja</td>
                      <td className="py-0.5 align-top">:</td>
                      <td className="py-0.5 font-semibold">SMP Nurul Abror Al-Robbaniyin</td>
                    </tr>
                  </tbody>
                </table>

                {/* 1. Dasaran Pelanggaran Kedisiplinan */}
                <div className="pt-1 space-y-1.5">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    1. Dasaran Pelanggaran Kedisiplinan
                  </h3>
                  <p className="text-[12px]">
                    Berdasarkan rekapitulasi presensi dan dokumen klarifikasi pembinaan internal
                    {urutanKe >= 3 ? ` (pengulangan kedisiplinan ke-${urutanKe} setelah pembinaan sebelumnya)` : ''}, yang
                    bersangkutan terbukti melakukan pelanggaran tata tertib berupa:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed">
                    <li>
                      <strong>Ketidakhadiran Rapat Bulanan:</strong> Tidak menghadiri agenda Rapat Bulanan Sekolah/Kurikulum tanpa konfirmasi/alasan sah pada tanggal{' '}
                      <span className="font-semibold">
                        {tanggalRapatAbsen ? dateIndoRapat.lengkap : '........................................'}
                      </span>
                      .
                    </li>
                    <li>
                      <strong>Tingkat Kehadiran Kerja di Bawah Minimum:</strong> Persentase kehadiran harian dalam periode bulan{' '}
                      <span className="font-semibold">{periodeBulan || '........................................'}</span> berada di bawah standar minimum 80%
                      {persentaseKehadiran && persentaseKehadiran !== '-' ? ` (tercatat ${persentaseKehadiran})` : ''}.
                    </li>
                    {riwayatTerkait && riwayatTerkait !== '-' && (
                      <li>
                        <strong>Akumulasi / Pengulangan Pembinaan Sebelumnya:</strong> {riwayatTerkait}.
                      </li>
                    )}
                    <li>
                      <strong>Pelanggaran Tata Tertib Lainnya:</strong>{' '}
                      <span>
                        {pelanggaranLainnya.trim()
                          ? pelanggaranLainnya
                          : '......................................................................................................................................................'}
                      </span>
                    </li>
                  </ul>
                  {rincianPelanggaran.trim() && rincianPelanggaran.trim() !== '-' && (
                    <div className="border border-slate-300 bg-slate-50 p-3 rounded text-[11px] text-slate-900">
                      <p className="font-bold text-[#1e3a8a] mb-1">
                        Rekap Data Kehadiran &amp; Rincian Pelanggaran Tercatat ({periodeBulan || 'Periode Berjalan'}):
                      </p>
                      <div className="whitespace-pre-line leading-relaxed">{rincianPelanggaran}</div>
                    </div>
                  )}
                </div>

                {/* 2. Dasar Hukum & Ketentuan Sekolah */}
                <div className="pt-1 space-y-1.5">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    2. Dasar Hukum &amp; Ketentuan Sekolah
                  </h3>
                  <p className="text-[12px]">
                    Tindakan kedisiplinan ini diterbitkan merujuk pada ketentuan resmi sekolah dan yayasan:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed">
                    <li>
                      Tata Tertib dan Kode Etik SMP Nurul Abror Al-Robbaniyin Bab II (Disiplin Kerja &amp; Kewajiban Selaku Pendidik/Pengajar).
                    </li>
                    <li>
                      SOP Yayasan Pendidikan Islam Nurul Abror Al-Robbaniyin mengenai sanksi kedisiplinan berjenjang bagi pegawai.
                    </li>
                  </ul>
                </div>

                {/* 3. Pemanggilan Kepala Sekolah (Muncul saat disertaiPemanggilan / berulang 3x) */}
                {disertaiPemanggilan && (
                  <div className="pt-1 space-y-1.5">
                    <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                      3. Pemanggilan Resmi Menghadap Kepala Sekolah
                    </h3>
                    <p className="text-[11.5px] leading-relaxed">
                      Dikarenakan catatan pembinaan telah berulang hingga tahap ke-{urutanKe}, maka bersamaan dengan Surat Peringatan ini yang bersangkutan <strong>WAJIB hadir memenuhi pemanggilan Kepala Sekolah</strong> pada:
                    </p>
                    <div className="bg-slate-50 border border-slate-300 rounded-md p-3 text-[11.5px] ml-2">
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="w-36 py-0.5 font-semibold">Hari / Tanggal</td>
                            <td className="w-3">:</td>
                            <td className="font-bold">
                              {dateIndoPanggil.hari}, {dateIndoPanggil.lengkap}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">Pukul</td>
                            <td>:</td>
                            <td className="font-bold">{jamPemanggilan || '09:00 WIB'}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold">Tempat</td>
                            <td>:</td>
                            <td className="font-bold">
                              {tempatPemanggilan || 'Ruang Kepala SMP Nurul Abror Al-Robbaniyin'}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-0.5 font-semibold align-top">Agenda</td>
                            <td className="align-top">:</td>
                            <td>
                              Klarifikasi akhir langsung bersama Kepala Sekolah, evaluasi komitmen perbaikan kinerja, dan penandatanganan Berita Acara Pembinaan Tingkat Akhir.
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sanksi & Penegasan Komitmen */}
                <div className="pt-1 space-y-2">
                  <h3 className="text-[13px] font-bold text-[#1e3a8a] border-b border-[#1e3a8a] pb-0.5">
                    {disertaiPemanggilan ? '4' : '3'}. Sanksi &amp; Penegasan Komitmen
                  </h3>

                  <div className="border-l-[3px] border-[#1e3a8a] bg-slate-100/80 p-3 text-[11.5px] leading-relaxed">
                    <p className="font-semibold text-slate-900 mb-0.5">
                      Maksud dan Tujuan Penerbitan Surat Peringatan:
                    </p>
                    <p>
                      Surat Peringatan ini diterbitkan bukan sebagai bentuk hukuman personal, melainkan sebagai sarana evaluasi, pembinaan formal, dan penegakan profesionalisme agar yang bersangkutan segera melakukan perbaikan kinerja, meningkatkan integritas, dan menaati seluruh tata tertib yang berlaku di SMP Nurul Abror Al-Robbaniyin.
                    </p>
                  </div>

                  <p className="text-[11.5px] leading-relaxed">
                    Apabila dalam kurun waktu evaluasi mendatang yang bersangkutan tidak menunjukkan perbaikan sikap dan kedisiplinan secara signifikan, maka sekolah akan melimpahkan berkas penanganan dan rekomendasi sanksi tingkat lanjut (skorsing/pemberhentian) kepada Biro Pendidikan Yayasan.
                  </p>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-6 text-[12px]">
                  <div>
                    <p className="italic">Mengetahui / Menerima,</p>
                    <p>Guru / Karyawan Bersangkutan,</p>
                    <div className="h-16" />
                    <p className="font-semibold">
                      ( {selectedNama || '....................................................'} )
                    </p>
                  </div>
                  <div>
                    <p>Ditetapkan di Wongsorejo, {dateIndoSurat.lengkap}</p>
                    <p>
                      {penerbit === 'Kepala Sekolah'
                        ? 'Kepala SMP Nurul Abror Al-Robbaniyin,'
                        : 'Waka Kurikulum SMP Nurul Abror Al-Robbaniyin,'}
                    </p>
                    <div className="h-16" />
                    <p className="font-bold">
                      {namaPenandatangan || (penerbit === 'Kepala Sekolah' ? 'Halik, S.Pd' : 'Waka Kurikulum')}
                    </p>
                    {nipPenandatangan && nipPenandatangan !== '-' && (
                      <p className="text-[11px]">NIP/NTY: {nipPenandatangan}</p>
                    )}
                  </div>
                </div>

                {/* Tembusan Yth (Sesuai Halaman 4 PDF) */}
                <div className="pt-4 text-[11px] text-slate-700 leading-snug">
                  <p className="font-semibold">Tembusan Yth:</p>
                  <ol className="list-decimal pl-5 space-y-0.5 mt-0.5">
                    <li>Ketua Biro Pendidikan Yayasan Nurul Abror Al-Robbaniyin</li>
                    <li>Waka Kurikulum / Kesiswaan SMP Nurul Abror Al-Robbaniyin</li>
                    <li>Arsip Kepegawaian (TU)</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Buku Agenda & Arsip Nomor Surat SP / Pembinaan (Screen Only) */}
      <div className="print:hidden bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#2F5597]" />
              <span>Buku Agenda Nomor Surat &amp; Arsip Pembinaan / SP ({spList.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Seluruh nomor surat yang diterbitkan tersimpan otomatis di aplikasi dan tab <strong>Data_SP</strong> Google Sheets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Cari nama / no. surat..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>

            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={archiveFilterTahap}
                onChange={(e) => setArchiveFilterTahap(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700"
              >
                <option value="semua">Semua Tahap</option>
                <option value="Teguran / Pembinaan I">Tahap 1 (Kurikulum)</option>
                <option value="SP-I">SP-I</option>
                <option value="SP-II">SP-II</option>
                <option value="SP-III + Pemanggilan">SP-III + Pemanggilan Kepsek</option>
              </select>
            </div>
          </div>
        </div>

        {filteredArchive.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            Belum ada catatan Nomor Surat pembinaan / SP yang tersimpan.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Nomor Surat &amp; Tanggal</th>
                  <th className="px-3 py-2.5">Nama Pegawai</th>
                  <th className="px-3 py-2.5">Tahap &amp; Penerbit</th>
                  <th className="px-3 py-2.5">Status Tindak Lanjut</th>
                  <th className="px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredArchive.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5">
                      <div className="font-mono font-bold text-slate-900">{item.nomorSurat}</div>
                      <div className="text-[10.5px] text-slate-500">{item.tanggalSurat}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-800">{item.nama}</div>
                      <div className="text-[10.5px] text-slate-500">{item.jabatan}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-black border ${
                          item.tahap === 'SP-III + Pemanggilan' || item.disertaiPemanggilan
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : item.tahap === 'SP-II'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        Ke-{item.urutanKe}: {item.tahap}
                      </span>
                      <div className="text-[10.5px] text-slate-500 mt-0.5">
                        Oleh: <strong>{item.penerbit}</strong>
                        {item.disertaiPemanggilan && item.tanggalPemanggilan
                          ? ` • Panggil: ${item.tanggalPemanggilan} (${item.jamPemanggilan})`
                          : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={item.statusTindakLanjut}
                        onChange={(e) =>
                          handleQuickStatusUpdate(item, e.target.value as SpStatusTindakLanjut)
                        }
                        className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-800"
                      >
                        <option value="Diterbitkan">Diterbitkan</option>
                        <option value="Sudah Klarifikasi">Sudah Klarifikasi</option>
                        <option value="Selesai Pembinaan">Selesai Pembinaan</option>
                        <option value="Eskalasi Kepala Sekolah">Eskalasi Kepala Sekolah</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleLoadRecord(item)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg font-bold text-[11px]"
                      >
                        Buka / Cetak
                      </button>
                      {confirmDeleteId === item.id ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteSp(item.id);
                              setConfirmDeleteId(null);
                              if (editingId === item.id) handleResetNew();
                            }}
                            className="px-2 py-1 bg-rose-600 text-white rounded-lg font-bold text-[11px]"
                          >
                            Ya, Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg font-bold text-[11px]"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 inline-flex align-middle"
                          title="Hapus catatan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

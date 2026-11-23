import React, { useState } from 'react';
import { MasterGuruStaf } from '../types';
import { DEFAULT_MASTER_GURU_STAF } from '../data/defaultMaster';
import { getTeacherQrCode } from '../utils/qrAndGeoUtils';
import { JadwalPelajaranView } from './JadwalPelajaranView';
import { 
  Search, Plus, Edit2, Trash2, RotateCcw, Users, BookOpen, 
  Briefcase, X, Save, QrCode, CloudUpload, CloudDownload, 
  RefreshCw, HelpCircle, CheckCircle2, AlertTriangle, Info
} from 'lucide-react';

interface MasterDataModalProps {
  masterList: MasterGuruStaf[];
  onUpdateMasterList: (newList: MasterGuruStaf[]) => void;
  webAppUrl?: string;
  onSeedMaster?: () => Promise<{ success: boolean; message: string }>;
  onReloadRemote?: () => Promise<void>;
}

export const MasterDataModal: React.FC<MasterDataModalProps> = ({
  masterList,
  onUpdateMasterList,
  webAppUrl,
  onSeedMaster,
  onReloadRemote
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [showRosterModal, setShowRosterModal] = useState<boolean>(false);

  // Form state for creating/editing
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [formNama, setFormNama] = useState<string>('');
  const [formJabatan, setFormJabatan] = useState<string>('');
  const [formKodeUnik, setFormKodeUnik] = useState<string>('');
  const [formKodeGuru, setFormKodeGuru] = useState<string>('');
  const [formPeran, setFormPeran] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formMapelSabtu, setFormMapelSabtu] = useState<string>('-');
  const [formMapelAhad, setFormMapelAhad] = useState<string>('-');
  const [formMapelSenin, setFormMapelSenin] = useState<string>('-');
  const [formMapelSelasa, setFormMapelSelasa] = useState<string>('-');
  const [formMapelRabu, setFormMapelRabu] = useState<string>('-');
  const [formMapelKamis, setFormMapelKamis] = useState<string>('-');

  const filteredList = masterList.filter(
    (m) =>
      m.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.jabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.peran && m.peran.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.kodeGuru !== undefined && String(m.kodeGuru).includes(searchQuery)) ||
      (m.kodeUnik && m.kodeUnik.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSyncToSheets = async () => {
    if (!onSeedMaster) return;
    if (!confirm(`Kirim & sinkronkan ${masterList.length} data guru dan jadwal ini ke sheet 'Master_Guru_Staf' di Google Spreadsheet Anda?`)) {
      return;
    }

    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await onSeedMaster();
      setSyncFeedback({
        success: res.success,
        message: res.message || (res.success ? 'Roster berhasil disinkronkan ke Google Sheets!' : 'Gagal sinkronisasi.')
      });
    } catch (e: any) {
      setSyncFeedback({
        success: false,
        message: 'Koneksi error: ' + (e.message || 'Gagal terhubung ke Google Sheets')
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromSheets = async () => {
    if (!onReloadRemote) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await onReloadRemote();
      setSyncFeedback({
        success: true,
        message: 'Data master terbaru berhasil ditarik dari Google Sheets!'
      });
    } catch (e: any) {
      setSyncFeedback({
        success: false,
        message: 'Gagal menarik data: ' + (e.message || 'Koneksi error')
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingNo(null);
    setFormNama('');
    setFormJabatan('');
    setFormKodeUnik(`NA-GURU-${String(masterList.length + 1).padStart(3, '0')}`);
    setFormKodeGuru('');
    setFormPeran('');
    setFormError(null);
    setFormMapelSabtu('-');
    setFormMapelAhad('-');
    setFormMapelSenin('-');
    setFormMapelSelasa('-');
    setFormMapelRabu('-');
    setFormMapelKamis('-');
    setIsEditing(true);
  };

  const handleOpenEdit = (guru: MasterGuruStaf) => {
    setEditingNo(guru.no);
    setFormNama(guru.nama);
    setFormJabatan(guru.jabatan);
    setFormKodeUnik(guru.kodeUnik || getTeacherQrCode(guru));
    setFormKodeGuru(guru.kodeGuru !== undefined && guru.kodeGuru !== null ? String(guru.kodeGuru) : '');
    setFormPeran(guru.peran || '');
    setFormError(null);
    setFormMapelSabtu(guru.mapelSabtu || '-');
    setFormMapelAhad(guru.mapelAhad || '-');
    setFormMapelSenin(guru.mapelSenin || '-');
    setFormMapelSelasa(guru.mapelSelasa || '-');
    setFormMapelRabu(guru.mapelRabu || '-');
    setFormMapelKamis(guru.mapelKamis || '-');
    setIsEditing(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNama.trim()) return;

    let parsedKodeGuru: number | undefined = undefined;
    if (formKodeGuru.trim() !== '') {
      const num = parseInt(formKodeGuru.trim(), 10);
      if (isNaN(num) || num <= 0) {
        setFormError('Kode Guru harus berupa angka bulat positif.');
        return;
      }
      // Validasi: Kode Guru tidak boleh sama dengan kode guru lain di daftar
      const duplicate = masterList.find(
        (m) => m.kodeGuru === num && (editingNo === null || m.no !== editingNo)
      );
      if (duplicate) {
        setFormError(`Kode Guru ${num} sudah digunakan oleh "${duplicate.nama}". Kode Guru tidak boleh sama.`);
        return;
      }
      parsedKodeGuru = num;
    }

    const cleanPeran = formPeran.trim() !== '' ? formPeran.trim() : undefined;

    let updatedList: MasterGuruStaf[];
    if (editingNo !== null) {
      // Edit
      updatedList = masterList.map((m) =>
        m.no === editingNo
          ? {
              ...m,
              nama: formNama.trim(),
              jabatan: formJabatan.trim() || 'Staf',
              kodeUnik: formKodeUnik.trim() || getTeacherQrCode(m),
              kodeGuru: parsedKodeGuru,
              peran: cleanPeran,
              mapelSabtu: formMapelSabtu.trim() || '-',
              mapelAhad: formMapelAhad.trim() || '-',
              mapelSenin: formMapelSenin.trim() || '-',
              mapelSelasa: formMapelSelasa.trim() || '-',
              mapelRabu: formMapelRabu.trim() || '-',
              mapelKamis: formMapelKamis.trim() || '-'
            }
          : m
      );
    } else {
      // Create new
      const nextNo = masterList.length > 0 ? Math.max(...masterList.map((m) => m.no)) + 1 : 1;
      const newEntry: MasterGuruStaf = {
        no: nextNo,
        nama: formNama.trim(),
        jabatan: formJabatan.trim() || 'Staf',
        kodeUnik: formKodeUnik.trim() || `NA-GURU-${String(nextNo).padStart(3, '0')}`,
        kodeGuru: parsedKodeGuru,
        peran: cleanPeran,
        mapelSabtu: formMapelSabtu.trim() || '-',
        mapelAhad: formMapelAhad.trim() || '-',
        mapelSenin: formMapelSenin.trim() || '-',
        mapelSelasa: formMapelSelasa.trim() || '-',
        mapelRabu: formMapelRabu.trim() || '-',
        mapelKamis: formMapelKamis.trim() || '-'
      };
      updatedList = [...masterList, newEntry];
    }

    onUpdateMasterList(updatedList);
    setIsEditing(false);
    setFormError(null);
  };

  const handleDelete = (no: number) => {
    if (confirm('Hapus guru/staf ini dari master data?')) {
      onUpdateMasterList(masterList.filter((m) => m.no !== no));
    }
  };

  const handleResetToDefault = () => {
    if (confirm('Kembalikan Master Data ke Roster Resmi Sekolah (38 Guru & Staf Lengkap sesuai SK Pembagian Tugas, termasuk Fiqih Ustadz Ahmad Zaini & Kode 22K Akhlak VII D)?')) {
      onUpdateMasterList(DEFAULT_MASTER_GURU_STAF);
      setSyncFeedback({
        success: true,
        message: 'Roster resmi 38 guru & staf berhasil dimuat. Klik tombol "Sinkronkan ke Google Sheets" untuk memperbarui data di spreadsheet Anda.'
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#2F5597]/10 text-[#2F5597] rounded-xl flex items-center justify-center font-bold shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  Master Data Guru &amp; Staf ({masterList.length} Orang)
                </h2>
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className="text-xs text-[#2F5597] bg-blue-50 hover:bg-blue-100 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                  title="Klik untuk melihat panduan penulisan dan letak database jadwal"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Panduan Jadwal Ideal</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Roster resmi jadwal mengajar per hari untuk evaluasi jam kedatangan &amp; presensi otomatis.
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {onSeedMaster && (
              <button
                onClick={handleSyncToSheets}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                title="Kirim seluruh 38 data guru & staf beserta jadwal ke sheet Master_Guru_Staf di Google Sheets Anda"
              >
                <CloudUpload className="w-4 h-4" />
                <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan ke Google Sheets'}</span>
              </button>
            )}

            {onReloadRemote && (
              <button
                onClick={handlePullFromSheets}
                disabled={isSyncing}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                title="Tarik data master guru terbaru dari sheet Master_Guru_Staf"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                <span>Tarik dari Sheets</span>
              </button>
            )}

            <button
              onClick={() => setShowRosterModal(true)}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-[#2F5597] border border-blue-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              title="Buka Jadwal Pelajaran Resmi 16 Rombel (VII A - IX H)"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Jadwal 16 Rombel</span>
            </button>

            <button
              onClick={handleResetToDefault}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              title="Kembalikan ke susunan 38 guru & staf resmi SMP Nurul Abror Al-Robbaniyin"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Roster Resmi</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Guru</span>
            </button>
          </div>
        </div>

        {/* Sync Feedback Message */}
        {syncFeedback && (
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            syncFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-2">
              {syncFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{syncFeedback.message}</span>
            </div>
            <button
              onClick={() => setSyncFeedback(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Informative Guidance: Penentuan Jadwal Ideal */}
        {showGuide && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-3 text-xs text-slate-700 animate-in fade-in duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-blue-900 font-extrabold text-sm">
                <Info className="w-4 h-4 text-[#2F5597]" />
                <span>Dimana dan Bagaimana Penentuan Jadwal yang Ideal?</span>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Tutup [✕]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-blue-100 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  1. Tempat Database Jadwal Berada:
                </div>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  Database jadwal guru tersimpan di Google Spreadsheet Anda pada sheet bernama <b>Master_Guru_Staf</b> (Kolom D s/d I: Sabtu, Ahad, Senin, Selasa, Rabu, Kamis).
                </p>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  💡 <b>Praktis:</b> Anda tidak perlu mengisi manual ke spreadsheet jika tidak ingin repot. Cukup klik tombol hijau <b>"Sinkronkan ke Google Sheets"</b> di atas, maka seluruh 38 guru & staf beserta jadwal resmi akan otomatis terkirim dan tersimpan rapi ke Google Spreadsheet Anda!
                </p>
              </div>

              <div className="space-y-1.5 bg-white p-3 rounded-lg border border-blue-100 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  2. Format Penulisan Roster Ideal:
                </div>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  Format ideal mencantumkan jam, mapel, dan kelas:
                  <br />
                  <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono text-blue-800">
                    Jam 1-2: [Mapel] ([Kelas]), Jam 3-4: [Mapel] ([Kelas])
                  </code>
                </p>
                <p className="text-slate-600 leading-relaxed text-[11.5px]">
                  <b>Contoh:</b>
                  <br />
                  • Ahmad Zaini, M.Pd (Guru Fiqh & Agama): <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono">Jam I-II: Fiqih (8B), Jam III-IV: Fiqih (7A), Jam V-VI: Fiqih (7B)</code>
                  <br />
                  • Ustadz Ainur Rofiqi: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono">Jam 3-4: L (7A), Jam 6-7: L (7B)</code> (atau cukup <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono">Tauhid (7A, 7B)</code>)
                  <br />
                  • Ustadzah Anisatut Toyyibah (22K): <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono">Jam 3-4: K (7D)</code> (atau <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono">Akhlak (7D)</code>)
                </p>
              </div>
            </div>

            <div className="bg-blue-100/60 p-2.5 rounded-lg border border-blue-200 text-[11px] text-blue-900 font-medium">
              ✨ <b>Fleksibilitas Cerdas:</b> Baik Anda menulis <code className="font-mono">Jam 3-4: L (7A)</code>, <code className="font-mono">Tauhid (7A, 7B)</code>, ataupun <code className="font-mono">22K (7D)</code>, sistem presensi kini otomatis mengenali nama mapel, kelas, dan jam mulainya (08:30 WIB) secara adil dan akurat!
            </div>
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Cari nama guru atau jabatan..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5597] shadow-sm"
        />
      </div>

      {/* Add / Edit Form Dialog */}
      {isEditing && (
        <div className="bg-slate-50 border-2 border-[#2F5597] p-5 rounded-2xl shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-bold text-slate-900 text-base">
              {editingNo !== null ? 'Edit Data Guru / Staf' : 'Tambah Guru / Staf Baru'}
            </h3>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveForm} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800 font-semibold animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap (dengan Gelar) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Ustdz. Ahmad Syauqi, M.Pd."
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#2F5597]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jabatan Struktural <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Kepala Sekolah, Guru IPA, Staf TU"
                  value={formJabatan}
                  onChange={(e) => setFormJabatan(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#2F5597]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kode Guru (Angka Bulat)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Misal: 12 (boleh kosong)"
                  value={formKodeGuru}
                  onChange={(e) => {
                    setFormKodeGuru(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Relasi ke tabel jadwal mengajar (boleh kosong).</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Peran Presensi
                </label>
                <select
                  value={formPeran}
                  onChange={(e) => setFormPeran(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
                >
                  <option value="">Otomatis (kosong)</option>
                  <option value="Guru">Guru</option>
                  <option value="Staf">Staf</option>
                  <option value="Guru+Staf">Guru+Staf</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">Penetapan aturan jam datang &amp; evaluasi.</p>
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kode Unik Barcode / QR ID
                </label>
                <input
                  type="text"
                  placeholder="Misal: NA-GURU-001"
                  value={formKodeUnik}
                  onChange={(e) => setFormKodeUnik(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-[#2F5597]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Jadwal Mapel Diampu per Hari (Isi dengan "-" jika tidak mengajar pada hari tersebut)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Sabtu</span>
                  <input
                    type="text"
                    value={formMapelSabtu}
                    onChange={(e) => setFormMapelSabtu(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Ahad</span>
                  <input
                    type="text"
                    value={formMapelAhad}
                    onChange={(e) => setFormMapelAhad(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Senin</span>
                  <input
                    type="text"
                    value={formMapelSenin}
                    onChange={(e) => setFormMapelSenin(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Selasa</span>
                  <input
                    type="text"
                    value={formMapelSelasa}
                    onChange={(e) => setFormMapelSelasa(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Rabu</span>
                  <input
                    type="text"
                    value={formMapelRabu}
                    onChange={(e) => setFormMapelRabu(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-600 mb-1">Kamis</span>
                  <input
                    type="text"
                    value={formMapelKamis}
                    onChange={(e) => setFormMapelKamis(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#2F5597] text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Master</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">Nama Guru / Staf</th>
                <th className="px-4 py-3">Jabatan Struktural</th>
                <th className="px-3 py-3 text-center">Kode Guru</th>
                <th className="px-3 py-3 text-center">Peran Presensi</th>
                <th className="px-3 py-3 text-center">Kode QR ID</th>
                <th className="px-3 py-3 text-center">Sabtu</th>
                <th className="px-3 py-3 text-center">Ahad</th>
                <th className="px-3 py-3 text-center">Senin</th>
                <th className="px-3 py-3 text-center">Selasa</th>
                <th className="px-3 py-3 text-center">Rabu</th>
                <th className="px-3 py-3 text-center">Kamis</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredList.map((m, idx) => (
                <tr key={`master-${m.no}-${m.nama}-${idx}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{m.nama}</td>
                  <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">{m.jabatan}</td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    {m.kodeGuru !== undefined && m.kodeGuru !== null ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
                        {m.kodeGuru}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    {m.peran ? (
                      <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${
                        m.peran === 'Guru'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : m.peran === 'Guru+Staf'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                        {m.peran}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium italic">
                        Otomatis
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-[#2F5597] border border-blue-200 rounded">
                      {m.kodeUnik || getTeacherQrCode(m)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelSabtu}</td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelAhad}</td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelSenin}</td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelSelasa}</td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelRabu}</td>
                  <td className="px-3 py-3 text-center text-[11px]">{m.mapelKamis}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(m)}
                        className="p-1 text-[#2F5597] hover:bg-blue-50 rounded-lg"
                        title="Edit data"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(m.no)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                        title="Hapus data"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Jadwal Pelajaran 16 Rombel */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-3 sm:p-5 shadow-2xl border border-slate-300">
            <JadwalPelajaranView
              masterList={masterList}
              isModal={true}
              onClose={() => setShowRosterModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

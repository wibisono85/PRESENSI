import React, { useState, useMemo } from 'react';
import { MasterGuruStaf, LogPresensi, AppSettings, JadwalSlot, DataCutiRecord } from '../types';
import { formatDateISO, getHariFromDate, formatLongDateIndonesian, isJumat } from '../utils/dateUtils';
import { evaluateTeacherScheduleForDay, isTeacherWajibHadir, determineTeacherPeran, getDefaultAlpaStatus } from '../utils/scheduleTimeEvaluator';
import { computeTeacherAutoAlpaDeadline } from '../utils/autoAlpaUtils';
import { buildEffectiveAttendanceRoster, isCutiRecordActiveOnDate } from '../utils/cutiUtils';
import { DEFAULT_WHATSAPP_GROUP_URL, WaGatewayStatus, getStoredSettings } from '../utils/googleAppsScript';
import { buildBelumAbsenWaMessage, computeBelumAbsenWaSummary } from '../utils/waReminderUtils';
import { UserX, Search, UserCheck, ArrowRight, AlertTriangle, BookOpen, Briefcase, CalendarRange, Clock, Zap, Users, MessageSquare, Send, Copy, ExternalLink, BellRing, ChevronDown, ChevronUp } from 'lucide-react';

interface BelumAbsenProps {
  masterList: MasterGuruStaf[];
  logs: LogPresensi[];
  cutiList?: DataCutiRecord[];
  onSelectTeacherForInput: (nama: string) => void;
  onSelectTeacherForCuti?: (nama: string) => void;
  onRunAutoAlpa?: (
    targetDate: string,
    bypassTodayTimeCheck?: boolean
  ) => Promise<{ success: boolean; inserted: number; skipped: number; message: string }>;
  onSendWaReminder?: (
    customMessage: string
  ) => Promise<{ success: boolean; sent: boolean; message: string }>;
  waGatewayStatus?: WaGatewayStatus;
  settings?: AppSettings;
  jadwalList?: JadwalSlot[];
}

export const BelumAbsen: React.FC<BelumAbsenProps> = ({
  masterList,
  logs,
  cutiList = [],
  onSelectTeacherForInput,
  onSelectTeacherForCuti,
  onRunAutoAlpa,
  onSendWaReminder,
  waGatewayStatus,
  settings,
  jadwalList
}) => {
  const [selectedTanggal, setSelectedTanggal] = useState<string>(formatDateISO());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllUnscheduled, setShowAllUnscheduled] = useState<boolean>(false);
  const [isProcessingAutoAlpa, setIsProcessingAutoAlpa] = useState<boolean>(false);
  const [autoAlpaResult, setAutoAlpaResult] = useState<{ success: boolean; text: string } | null>(null);
  const [showWaPreview, setShowWaPreview] = useState<boolean>(false);
  const [waCopied, setWaCopied] = useState<boolean>(false);
  const [isSendingWaServer, setIsSendingWaServer] = useState<boolean>(false);
  const [waServerResult, setWaServerResult] = useState<{ success: boolean; text: string } | null>(null);

  const activeHari = useMemo(() => {
    return getHariFromDate(selectedTanggal);
  }, [selectedTanggal]);

  const effectiveSettings = useMemo(() => {
    return settings || getStoredSettings();
  }, [settings]);

  const waGroupUrl = effectiveSettings.whatsappGroupUrl || DEFAULT_WHATSAPP_GROUP_URL;

  const waSummary = useMemo(() => {
    return computeBelumAbsenWaSummary({
      masterList,
      logs,
      cutiList,
      settings: effectiveSettings,
      jadwalList,
      tanggal: selectedTanggal
    });
  }, [masterList, logs, cutiList, effectiveSettings, jadwalList, selectedTanggal]);

  const waReminderMessage = useMemo(() => {
    const fallbackAppUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
    return buildBelumAbsenWaMessage({
      summary: waSummary,
      appPublicUrl: effectiveSettings.waAppPublicUrl || fallbackAppUrl,
      graceMenit: effectiveSettings.autoAlpaGraceMenit ?? 90
    });
  }, [waSummary, effectiveSettings]);

  const handleCopyWaReminder = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(waReminderMessage);
      }
      setWaCopied(true);
      setTimeout(() => setWaCopied(false), 3000);
    } catch (e) {
      // Ignore clipboard permission errors
    }
  };

  const handleSendWaViaServer = async () => {
    if (!onSendWaReminder) return;
    setIsSendingWaServer(true);
    setWaServerResult(null);
    try {
      const res = await onSendWaReminder(waReminderMessage);
      setWaServerResult({ success: res.success && res.sent, text: res.message });
    } finally {
      setIsSendingWaServer(false);
    }
  };

  // Teachers who are currently marked as Cuti on selectedTanggal
  const cutiTodayLogs = useMemo(() => {
    if (isJumat(activeHari)) return [];
    return logs.filter((l) => l.tanggal === selectedTanggal && l.status === 'Cuti');
  }, [logs, selectedTanggal, activeHari]);

  // Teachers covered by an active Data_Cuti entry on selectedTanggal
  const activeCutiNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of cutiList) {
      if (isCutiRecordActiveOnDate(c, selectedTanggal)) {
        set.add(c.nama.trim().toLowerCase());
      }
    }
    return set;
  }, [cutiList, selectedTanggal]);

  const effectiveRoster = useMemo(() => {
    return buildEffectiveAttendanceRoster(masterList, cutiList, selectedTanggal, jadwalList);
  }, [masterList, cutiList, selectedTanggal, jadwalList]);

  const logsByName = useMemo(() => {
    const map = new Map<string, LogPresensi>();
    for (const l of logs) {
      if (l.tanggal === selectedTanggal && l.nama) {
        map.set(l.nama.trim().toLowerCase(), l);
      }
    }
    return map;
  }, [logs, selectedTanggal]);

  const activeSubstitutesToday = useMemo(() => {
    if (isJumat(activeHari)) return [];
    return effectiveRoster.filter((m) => m.substitutingFor && m.substitutingFor.length > 0);
  }, [effectiveRoster, activeHari]);

  // Determine who has NOT submitted attendance on selectedTanggal based on role-based rules
  const unmarkedList = useMemo(() => {
    if (isJumat(activeHari)) return [];

    const recordedNames = new Set(
      logs.filter((l) => l.tanggal === selectedTanggal).map((l) => l.nama.trim().toLowerCase())
    );

    return effectiveRoster.filter((m) => {
      if (!m.nama || !m.nama.trim()) return false;
      const norm = m.nama.trim().toLowerCase();
      if (recordedNames.has(norm)) return false;
      if (activeCutiNames.has(norm)) return false;

      if (m.isTempSubstitute || showAllUnscheduled) return true;

      // Staf, Guru BK & Ganda selalu wajib hadir; Guru hanya bila punya sesi mengajar hari itu (atau guruTanpaJadwalWajibHadir = true)
      return isTeacherWajibHadir(m, activeHari, jadwalList, settings?.guruTanpaJadwalWajibHadir, settings?.attendanceRuleOverrides);
    });
  }, [effectiveRoster, logs, activeCutiNames, selectedTanggal, activeHari, showAllUnscheduled, jadwalList, settings]);

  // Filtered unmarked list
  const filteredUnmarked = useMemo(() => {
    if (!searchQuery.trim()) return unmarkedList;
    const q = searchQuery.toLowerCase();
    return unmarkedList.filter(
      (m) => m.nama.toLowerCase().includes(q) || m.jabatan.toLowerCase().includes(q)
    );
  }, [unmarkedList, searchQuery]);

  const nowDate = new Date();
  const todayISO = formatDateISO(nowDate);
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  const handleRunAutoAlpaClick = async () => {
    if (!onRunAutoAlpa) return;
    setIsProcessingAutoAlpa(true);
    setAutoAlpaResult(null);
    try {
      const res = await onRunAutoAlpa(selectedTanggal, false);
      setAutoAlpaResult({ success: res.success, text: res.message });
    } finally {
      setIsProcessingAutoAlpa(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Header & Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-rose-600 uppercase tracking-wider">
              <UserX className="w-4 h-4 text-rose-600" />
              <span>Daftar Guru / Staf Belum Presensi</span>
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight mt-0.5">
              {formatLongDateIndonesian(selectedTanggal)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={selectedTanggal}
              onChange={(e) => {
                setSelectedTanggal(e.target.value);
                setAutoAlpaResult(null);
              }}
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:ring-2 focus:ring-[#2F5597]"
            />
            {onRunAutoAlpa && !isJumat(activeHari) && selectedTanggal <= todayISO && (
              <button
                type="button"
                disabled={isProcessingAutoAlpa}
                onClick={handleRunAutoAlpaClick}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
                title="Catat otomatis Tidak Hadir (Alpa) bagi guru/staf wajib hadir yang sudah melewati batas maksimal +90 menit"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {isProcessingAutoAlpa
                    ? 'Memproses...'
                    : `Proses Auto-Tidak Hadir (+${settings?.autoAlpaGraceMenit ?? 90} mnt)`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Info Banner Auto-Alpa */}
        {!isJumat(activeHari) && settings?.autoAlpaEnabled !== false && (
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-950 flex items-start gap-2">
            <Clock className="w-4 h-4 text-[#2F5597] shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong>Pencatatan Otomatis Aktif:</strong> Guru/Staf berstatus <strong>Wajib Hadir</strong> yang belum presensi melebihi{' '}
              <strong>+{settings?.autoAlpaGraceMenit ?? 90} menit</strong> dari jam masuknya otomatis dicatat sebagai <strong>Tidak Hadir (Alpa)</strong> oleh sistem (kecuali sedang Cuti/Izin/Sakit/Dinas Luar atau tidak ada jadwal mengajar).
            </span>
          </div>
        )}

        {autoAlpaResult && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold border ${
              autoAlpaResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {autoAlpaResult.text}
          </div>
        )}

        {/* Friday warning */}
        {isJumat(activeHari) ? (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Hari Jumat adalah hari libur sekolah. Tidak ada kewajiban presensi.</span>
          </div>
        ) : (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Cari nama atau jabatan guru/staf..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {cutiTodayLogs.length > 0 && (
                  <div className="px-3 py-1.5 bg-teal-50 text-teal-800 rounded-xl border border-teal-200 text-xs font-bold text-center">
                    {cutiTodayLogs.length} Sedang Cuti
                  </div>
                )}
                <div className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-bold text-center">
                  {unmarkedList.length} Belum Presensi
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer font-medium hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={showAllUnscheduled}
                  onChange={(e) => setShowAllUnscheduled(e.target.checked)}
                  className="rounded border-slate-300 text-[#2F5597] focus:ring-[#2F5597]"
                />
                <span>Tampilkan semua (termasuk yang tidak ada jadwal hari {activeHari})</span>
              </label>
            </div>
          </div>
        )}
        {/* Panel Pengingat Grup WhatsApp Sekolah (Pukul 08:30 WIB) */}
        {!isJumat(activeHari) && (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-emerald-950">
                      Pengingat Grup WA Sekolah (Pukul {effectiveSettings.waReminderJam || '08:30'} WIB)
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                        waGatewayStatus?.configured
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}
                    >
                      {waGatewayStatus?.configured
                        ? `Gateway Otomatis Siap (${(waGatewayStatus.provider || 'fonnte').toUpperCase()})`
                        : 'Kirim 1-Klik (Otomatis 08:30 Perlu Gateway)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900 mt-0.5 leading-relaxed">
                    {waSummary.totalBelumAbsen > 0 ? (
                      <>
                        Terdeteksi <strong>{waSummary.totalBelumAbsen}</strong> guru/staf belum presensi:{' '}
                        <strong>{waSummary.segeraAlpaList.length}</strong> prioritas sebelum batas Auto-Alpa,{' '}
                        <strong>{waSummary.jadwalSiangList.length}</strong> jadwal siang
                        {waSummary.penggantiList.length > 0
                          ? `, ${waSummary.penggantiList.length} guru pengganti`
                          : ''}.
                      </>
                    ) : (
                      <span>Semua guru &amp; staf wajib hadir pada tanggal ini sudah tercatat presensi.</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWaPreview((prev) => !prev)}
                className="px-3 py-1.5 bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-center cursor-pointer transition"
              >
                <span>{showWaPreview ? 'Sembunyikan Teks' : 'Lihat Pratinjau Pesan'}</span>
                {showWaPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showWaPreview && (
              <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed bg-white border border-emerald-200 rounded-xl p-3 text-slate-800 max-h-56 overflow-y-auto">
                {waReminderMessage}
              </pre>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={waGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCopyWaReminder}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {waCopied
                    ? '✓ Teks Tersalin! Tempel di Grup WA Sekolah'
                    : 'Salin Pengingat & Buka Grup WA Sekolah'}
                </span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(waReminderMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>Pilih Grup di WA</span>
              </a>

              <button
                type="button"
                onClick={handleCopyWaReminder}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>{waCopied ? 'Tersalin!' : 'Salin Teks'}</span>
              </button>

              {onSendWaReminder && (
                <button
                  type="button"
                  disabled={isSendingWaServer}
                  onClick={handleSendWaViaServer}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#2F5597] hover:bg-[#234278] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span>{isSendingWaServer ? 'Mengirim ke Gateway...' : 'Kirim Otomatis via Server'}</span>
                </button>
              )}
            </div>

            {waServerResult && (
              <div
                className={`p-2.5 rounded-xl text-xs font-semibold border ${
                  waServerResult.success
                    ? 'bg-white border-emerald-300 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {waServerResult.text}
              </div>
            )}

            {!waGatewayStatus?.configured && (
              <p className="text-[10.5px] text-emerald-900/80 leading-relaxed">
                💡 <strong>Catatan Otomatis 08:30 WIB:</strong> WhatsApp tidak mengizinkan pengiriman otomatis tanpa bot ke link undangan <code className="bg-white/80 px-1 rounded">chat.whatsapp.com</code>. Agar pesan terkirim otomatis setiap <strong>08:30 WIB</strong> tanpa membuka aplikasi, aktifkan WA Gateway (Fonnte/Wablas/Webhook) &amp; trigger <code className="bg-white/80 px-1 rounded">pasangTriggerPengingatWa0830</code> di menu <strong>Pengaturan Sheets</strong>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info Banner: Teachers Currently on Approved Leave (Cuti) */}
      {cutiTodayLogs.length > 0 && (
        <div className="bg-teal-50/80 border border-teal-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-teal-900 uppercase tracking-wider">
              <CalendarRange className="w-4 h-4 text-teal-600 shrink-0" />
              <span>Sedang Cuti Resmi pada {formatLongDateIndonesian(selectedTanggal)} ({cutiTodayLogs.length} Orang)</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cutiTodayLogs.map((c, idx) => (
              <div
                key={`cuti-today-${c.id}-${idx}`}
                className="bg-white/90 border border-teal-200 rounded-xl px-3 py-2 text-xs flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{c.nama}</span>
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded text-[10px] font-extrabold border border-teal-300">
                    Cuti
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">{c.jabatan}</span>
                {c.keterangan && (
                  <span className="text-[11px] text-teal-800 font-medium mt-0.5">{c.keterangan}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Banner: Active Substitute Teachers Today */}
      {activeSubstitutesToday.length > 0 && (
        <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-extrabold text-purple-950 uppercase tracking-wider">
              <Users className="w-4 h-4 text-purple-700 shrink-0" />
              <span>Guru Pengganti Sementara Aktif ({activeSubstitutesToday.length} Orang)</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeSubstitutesToday.map((sub, idx) => {
              const subLog = logsByName.get(sub.nama.trim().toLowerCase());
              return (
                <div
                  key={`active-sub-${sub.nama}-${idx}`}
                  className="bg-white/95 border border-purple-200 rounded-xl px-3 py-2.5 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900 truncate">{sub.nama}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                        {sub.isTempSubstitute ? 'Pengganti Luar' : 'Guru Internal'}
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-900">
                      Menggantikan:{' '}
                      <strong>
                        {sub.substitutingFor?.map((s) => `${s.guruCutiNama}${s.classNote ? ` (${s.classNote})` : ''}`).join(', ')}
                      </strong>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {subLog ? (
                      <span className="inline-block px-2 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {subLog.status} {subLog.jamDatang && subLog.jamDatang !== '-' ? `(${subLog.jamDatang})` : ''}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectTeacherForInput(sub.nama)}
                        className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-[10.5px] font-bold transition shadow-xs"
                      >
                        Catat Hadir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List of Unmarked Teachers & Staff */}
      {unmarkedList.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-2xl text-center space-y-2">
          <UserCheck className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-lg font-bold text-emerald-900">Alhamdulillah! Semua Guru & Staf Sudah Presensi</h3>
          <p className="text-xs text-emerald-700">
            Seluruh {masterList.length} guru dan staf terdaftar sudah mencatatkan kehadiran (termasuk izin/cuti) pada {formatLongDateIndonesian(selectedTanggal)}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredUnmarked.map((guru, idx) => {
            const peran = determineTeacherPeran(guru, jadwalList, undefined, settings?.attendanceRuleOverrides);
            const alpaStatus = getDefaultAlpaStatus(guru, jadwalList, settings?.attendanceRuleOverrides);
            const scheduleEval = evaluateTeacherScheduleForDay(guru, activeHari, settings?.jamMasukThreshold || '07:25', jadwalList, settings?.attendanceRuleOverrides);
            const deadlineInfo = settings
              ? computeTeacherAutoAlpaDeadline(guru, activeHari, settings, jadwalList)
              : null;
            const isPastDeadline = Boolean(
              deadlineInfo?.wajibHadir &&
              deadlineInfo.deadlineMinutes !== null &&
              (selectedTanggal < todayISO || (selectedTanggal === todayISO && nowMinutes > deadlineInfo.deadlineMinutes))
            );
            return (
              <div
                key={`belum-absen-${guru.no}-${guru.nama}-${idx}`}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-blue-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm sm:text-base">{guru.nama}</h4>
                        <span className={`px-2 py-0.2 rounded text-[9.5px] font-black border ${
                          guru.isTempSubstitute
                            ? 'bg-purple-100 text-purple-900 border-purple-300'
                            : peran === 'Guru'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : peran === 'Guru BK'
                            ? 'bg-teal-50 text-teal-800 border-teal-200'
                            : peran === 'Guru BK+Mengajar'
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : peran === 'Guru+Staf'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {guru.isTempSubstitute ? 'Pengganti Sementara' : peran}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mt-0.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{guru.jabatan}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isPastDeadline
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {isPastDeadline ? 'Lewat Batas +90m' : 'Belum Absen'}
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-mono">
                        {alpaStatus}
                      </span>
                      {deadlineInfo?.wajibHadir && deadlineInfo.deadlineTime && (
                        <span className="text-[10px] font-bold text-slate-600">
                          Tutup Auto: {deadlineInfo.deadlineTime} WIB
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#2F5597] shrink-0" />
                        <span className="text-slate-500">Jadwal {activeHari}:</span>
                      </div>
                      {scheduleEval.firstScheduleTime && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          Mulai {scheduleEval.firstScheduleTime} WIB
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-800 pl-5">
                      {scheduleEval.hasTeachingSchedule ? (
                        <div className="space-y-1">
                          {scheduleEval.sesiList.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {scheduleEval.sesiList.map((s, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-blue-50 text-blue-900 border border-blue-200"
                                >
                                  <span className="font-mono text-[9.5px] text-blue-700 font-bold">{s.labelJam}:</span>
                                  <span>{s.namaMapel}</span>
                                  <span className="font-bold text-slate-700">({s.kelas})</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-blue-900 leading-snug">{scheduleEval.mapelHariIni}</p>
                          )}
                          <p className="text-[10.5px] text-slate-500 font-medium">
                            {scheduleEval.jamSatuKeterangan}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-normal">
                          {guru.jabatan.toLowerCase().includes('guru') ? 'Tidak ada jam mengajar hari ini' : 'Staf Sekolah'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectTeacherForInput(guru.nama)}
                    className="flex-1 py-2.5 px-3 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <span>Catat Presensi</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {onSelectTeacherForCuti && (
                    <button
                      onClick={() => onSelectTeacherForCuti(guru.nama)}
                      className="py-2.5 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      title="Catat Cuti (Melahirkan, Umroh, Tahunan, dll)"
                    >
                      <CalendarRange className="w-3.5 h-3.5" />
                      <span>Cuti</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


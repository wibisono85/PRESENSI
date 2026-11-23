import React, { useState, useMemo } from 'react';
import { MasterGuruStaf, LogPresensi, AppSettings, JadwalSlot } from '../types';
import { formatDateISO, getHariFromDate, formatLongDateIndonesian, isJumat } from '../utils/dateUtils';
import { evaluateTeacherScheduleForDay, isTeacherWajibHadir, determineTeacherPeran } from '../utils/scheduleTimeEvaluator';
import { UserX, Search, Calendar, UserCheck, ArrowRight, AlertTriangle, BookOpen, Briefcase, CalendarRange } from 'lucide-react';

interface BelumAbsenProps {
  masterList: MasterGuruStaf[];
  logs: LogPresensi[];
  onSelectTeacherForInput: (nama: string) => void;
  onSelectTeacherForCuti?: (nama: string) => void;
  settings?: AppSettings;
  jadwalList?: JadwalSlot[];
}

export const BelumAbsen: React.FC<BelumAbsenProps> = ({
  masterList,
  logs,
  onSelectTeacherForInput,
  onSelectTeacherForCuti,
  settings,
  jadwalList
}) => {
  const [selectedTanggal, setSelectedTanggal] = useState<string>(formatDateISO());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllUnscheduled, setShowAllUnscheduled] = useState<boolean>(false);

  const activeHari = useMemo(() => {
    return getHariFromDate(selectedTanggal);
  }, [selectedTanggal]);

  // Teachers who are currently marked as Cuti on selectedTanggal
  const cutiTodayLogs = useMemo(() => {
    if (isJumat(activeHari)) return [];
    return logs.filter((l) => l.tanggal === selectedTanggal && l.status === 'Cuti');
  }, [logs, selectedTanggal, activeHari]);

  // Determine who has NOT submitted attendance on selectedTanggal based on role-based rules
  const unmarkedList = useMemo(() => {
    if (isJumat(activeHari)) return [];

    const recordedNames = new Set(
      logs.filter((l) => l.tanggal === selectedTanggal).map((l) => l.nama.trim().toLowerCase())
    );

    return masterList.filter((m) => {
      if (!m.nama || !m.nama.trim()) return false;
      if (recordedNames.has(m.nama.trim().toLowerCase())) return false;

      if (showAllUnscheduled) return true;

      // Staf & Guru+Staf selalu wajib hadir; Guru hanya bila punya sesi mengajar hari itu (atau guruTanpaJadwalWajibHadir = true)
      return isTeacherWajibHadir(m, activeHari, jadwalList, settings?.guruTanpaJadwalWajibHadir);
    });
  }, [masterList, logs, selectedTanggal, activeHari, showAllUnscheduled, jadwalList, settings]);

  // Filtered unmarked list
  const filteredUnmarked = useMemo(() => {
    if (!searchQuery.trim()) return unmarkedList;
    const q = searchQuery.toLowerCase();
    return unmarkedList.filter(
      (m) => m.nama.toLowerCase().includes(q) || m.jabatan.toLowerCase().includes(q)
    );
  }, [unmarkedList, searchQuery]);

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

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={selectedTanggal}
              onChange={(e) => setSelectedTanggal(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:ring-2 focus:ring-[#2F5597]"
            />
          </div>
        </div>

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
            const peran = determineTeacherPeran(guru, jadwalList);
            const alpaStatus = peran === 'Guru' ? 'Alpa (Jadwal Mengajar)' : 'Alpa (Wajib Hadir Staf)';
            const scheduleEval = evaluateTeacherScheduleForDay(guru, activeHari, settings?.jamMasukThreshold || '07:25', jadwalList);
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
                          peran === 'Guru'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : peran === 'Guru+Staf'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {peran}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mt-0.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{guru.jabatan}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-extrabold uppercase">
                        Belum Absen
                      </span>
                      <span className="text-[9.5px] text-slate-400 font-mono">
                        {alpaStatus}
                      </span>
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


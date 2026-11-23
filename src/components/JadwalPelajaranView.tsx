import React, { useState, useMemo } from 'react';
import { OFFICIAL_CLASS_SCHEDULES, ClassSchedule } from '../data/officialClassSchedules';
import { MasterGuruStaf, HariSekolah, JadwalSlot, UserRole } from '../types';
import {
  BookOpen,
  Users,
  Calendar,
  Clock,
  GraduationCap,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  X
} from 'lucide-react';
import { evaluateTeacherScheduleForDay } from '../utils/scheduleTimeEvaluator';
import { jadwalToClassSchedules, getActiveTerm } from '../utils/jadwalEngine';

interface JadwalPelajaranViewProps {
  masterList: MasterGuruStaf[];
  jadwalList?: JadwalSlot[];
  userRole?: UserRole;
  webAppUrl?: string;
  jadwalTahunAjaran?: string;
  jadwalSemester?: string;
  onReloadJadwal?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const JadwalPelajaranView: React.FC<JadwalPelajaranViewProps> = ({
  masterList,
  jadwalList,
  userRole,
  webAppUrl,
  jadwalTahunAjaran,
  jadwalSemester,
  onReloadJadwal,
  onClose,
  isModal = false
}) => {
  const [activeMode, setActiveMode] = useState<'per_kelas' | 'per_guru'>('per_kelas');
  const [selectedKelompok, setSelectedKelompok] = useState<'semua' | 'Putra' | 'Putri'>('semua');
  const [selectedKelas, setSelectedKelas] = useState<string>('VII A');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTeacherName, setSelectedTeacherName] = useState<string>(() => {
    return masterList.length > 0 ? masterList[0].nama : '';
  });

  // Ensure first teacher from list is selected when masterList is ready
  React.useEffect(() => {
    if ((!selectedTeacherName || !masterList.some((m) => m.nama === selectedTeacherName)) && masterList.length > 0) {
      setSelectedTeacherName(masterList[0].nama);
    }
  }, [masterList, selectedTeacherName]);

  const isUsingRemoteJadwal = Boolean(jadwalList && Array.isArray(jadwalList) && jadwalList.length > 0);

  const activeTerm = useMemo(() => {
    return getActiveTerm(jadwalList, jadwalTahunAjaran, jadwalSemester) || {
      tahunAjaran: '2026/2027',
      semester: 'Ganjil'
    };
  }, [jadwalList, jadwalTahunAjaran, jadwalSemester]);

  const activeSchedules: ClassSchedule[] = useMemo(() => {
    if (isUsingRemoteJadwal && jadwalList) {
      return jadwalToClassSchedules(jadwalList, activeTerm.tahunAjaran, activeTerm.semester);
    }
    return OFFICIAL_CLASS_SCHEDULES;
  }, [isUsingRemoteJadwal, jadwalList, activeTerm]);

  const filteredClasses = useMemo(() => {
    return activeSchedules.filter((c) => {
      if (selectedKelompok !== 'semua' && c.tipe !== selectedKelompok) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKelas = c.kelas.toLowerCase().includes(q);
        const matchWali = c.waliKelas.toLowerCase().includes(q);
        return matchKelas || matchWali;
      }
      return true;
    });
  }, [activeSchedules, selectedKelompok, searchQuery]);

  const activeClassData: ClassSchedule | undefined = useMemo(() => {
    return activeSchedules.find((c) => c.kelas === selectedKelas) || activeSchedules[0];
  }, [activeSchedules, selectedKelas]);

  const selectedTeacher = useMemo(() => {
    return (
      masterList.find((m) => m.nama === selectedTeacherName) ||
      masterList.find((m) => m.nama.toLowerCase().includes(selectedTeacherName.toLowerCase())) ||
      masterList[0] ||
      null
    );
  }, [masterList, selectedTeacherName]);

  const daysList: HariSekolah[] = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];

  // Color mapping for subjects
  const getSubjectColor = (mapel: string) => {
    const m = mapel.toUpperCase();
    if (m.includes('FIQH') || m.includes('FIQIH')) return 'bg-amber-100 text-amber-900 border-amber-300';
    if (m.includes('TAUHID') || m.includes('AKHLAK') || m.includes('TARIKH')) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    if (m.includes('MATEMATIKA') || m.includes('IPA')) return 'bg-blue-100 text-blue-900 border-blue-300';
    if (m.includes('INDONESIA') || m.includes('INGGRIS')) return 'bg-indigo-100 text-indigo-900 border-indigo-300';
    if (m.includes('IPS') || m.includes('PKN')) return 'bg-purple-100 text-purple-900 border-purple-300';
    if (m.includes('TIK') || m.includes('PRAKARYA')) return 'bg-teal-100 text-teal-900 border-teal-300';
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  return (
    <div className={`space-y-6 ${isModal ? 'p-1' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}`}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#183153] via-[#244275] to-[#2F5597] text-white p-5 sm:p-6 rounded-3xl shadow-sm border border-blue-800/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 shrink-0">
              <BookOpen className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isUsingRemoteJadwal ? (
                  <span className="px-2.5 py-0.5 bg-emerald-400 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-slate-900" />
                    <span>Sumber: Google Sheets (Jadwal_Pelajaran) {activeTerm.tahunAjaran} {activeTerm.semester}</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-yellow-400 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Sumber: Data bawaan aplikasi
                  </span>
                )}
                <span className="text-blue-200 text-xs font-mono">16 Rombel</span>
                {onReloadJadwal && (
                  <button
                    onClick={onReloadJadwal}
                    title="Sinkronisasi ulang jadwal dari Google Sheets"
                    className="p-1 hover:bg-white/10 rounded-lg text-blue-200 hover:text-white transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black mt-1">
                Jadwal Pelajaran SMP Nurul Abror Al-Robbaniyin &mdash; Tahun Ajaran {activeTerm.tahunAjaran} / Semester {activeTerm.semester}
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Semester {activeTerm.semester}, Tahun Ajaran {activeTerm.tahunAjaran} &bull; Struktur 3 Sesi Inti Harian
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex bg-white/10 p-1 rounded-2xl border border-white/20">
              <button
                type="button"
                onClick={() => setActiveMode('per_kelas')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeMode === 'per_kelas'
                    ? 'bg-white text-[#183153] shadow-sm'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                Jadwal Per Kelas
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('per_guru')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeMode === 'per_guru'
                    ? 'bg-white text-[#183153] shadow-sm'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                Jadwal Per Guru
              </button>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          MODE 1: JADWAL PELAJARAN PER KELAS (16 ROMBEL RESMI)
          ======================================================== */}
      {activeMode === 'per_kelas' && (
        <div className="space-y-4">
          {/* Controls: Kelompok Filter & Search */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Filter Putra / Putri */}
            <div className="flex items-center gap-1.5 w-full md:w-auto">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Kelompok:
              </span>
              <button
                type="button"
                onClick={() => setSelectedKelompok('semua')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedKelompok === 'semua'
                    ? 'bg-[#2F5597] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Semua (16)
              </button>
              <button
                type="button"
                onClick={() => setSelectedKelompok('Putra')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedKelompok === 'Putra'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Putra (8)
              </button>
              <button
                type="button"
                onClick={() => setSelectedKelompok('Putri')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedKelompok === 'Putri'
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Putri (8)
              </button>
            </div>

            {/* Quick search input */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari kelas / wali kelas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
              />
            </div>
          </div>

          {/* Class Selectors Grid */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Pilih Rombel Kelas:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filteredClasses.map((c) => {
                const isSelected = c.kelas === selectedKelas;
                return (
                  <button
                    key={c.kelas}
                    type="button"
                    onClick={() => setSelectedKelas(c.kelas)}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#2F5597] text-white shadow-sm ring-2 ring-blue-300'
                        : c.tipe === 'Putra'
                        ? 'bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100'
                        : 'bg-pink-50 text-pink-900 border border-pink-200 hover:bg-pink-100'
                    }`}
                  >
                    <span>Kelas {c.kelas}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                      isSelected ? 'bg-white/20 text-white' : c.tipe === 'Putra' ? 'bg-blue-200 text-blue-800' : 'bg-pink-200 text-pink-800'
                    }`}>
                      {c.tipe}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Class Schedule Timetable Card */}
          {activeClassData && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
              {/* Class Header Bar */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      KELAS {activeClassData.kelas} ({activeClassData.tipe.toUpperCase()})
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#2F5597] text-white">
                      Rombel Aktif
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                    <GraduationCap className="w-4 h-4 text-[#2F5597]" />
                    <span>Wali Kelas: <strong className="text-slate-900">{activeClassData.waliKelas}</strong></span>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  3 Sesi Pembelajaran &bull; Istirahat 09.30 - 10.00 WIB
                </div>
              </div>

              {/* Timetable Grid (6 Hari Sekolah x 3 Sesi) */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-700 font-black border-b border-slate-200 uppercase text-[11px]">
                      <th className="p-3 w-36 border-r border-slate-200">Jam &amp; Waktu</th>
                      {daysList.map((day) => (
                        <th key={day} className="p-3 border-r border-slate-200 text-center last:border-r-0">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {/* Sesi 1: Jam I - II */}
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="p-3 bg-slate-50/60 border-r border-slate-200 align-top">
                        <div className="font-black text-slate-900 text-xs">Sesi 1 (Jam I - II)</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">07.30 - 08.30 WIB</div>
                      </td>
                      {daysList.map((day) => {
                        const sess = activeClassData.jadwal[day]?.find((s) => s.jam.includes('I-II'));
                        return (
                          <td key={day} className="p-2.5 border-r border-slate-200 align-top last:border-r-0">
                            {sess ? (
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/90 hover:shadow-2xs transition">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-black border ${getSubjectColor(sess.mapel)}`}>
                                  {sess.mapel}
                                </span>
                                <p className="text-[10px] text-slate-700 font-bold mt-1.5 leading-snug">
                                  {sess.guru}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Sesi 2: Jam III - IV */}
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="p-3 bg-slate-50/60 border-r border-slate-200 align-top">
                        <div className="font-black text-slate-900 text-xs">Sesi 2 (Jam III - IV)</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">08.30 - 09.30 WIB</div>
                      </td>
                      {daysList.map((day) => {
                        const sess = activeClassData.jadwal[day]?.find((s) => s.jam.includes('III-IV'));
                        return (
                          <td key={day} className="p-2.5 border-r border-slate-200 align-top last:border-r-0">
                            {sess ? (
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/90 hover:shadow-2xs transition">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-black border ${getSubjectColor(sess.mapel)}`}>
                                  {sess.mapel}
                                </span>
                                <p className="text-[10px] text-slate-700 font-bold mt-1.5 leading-snug">
                                  {sess.guru}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Istirahat */}
                    <tr className="bg-amber-50/50 border-y border-amber-200 text-amber-900">
                      <td className="p-2 bg-amber-100/60 border-r border-amber-200 font-bold text-[10.5px]">
                        09.30 - 10.00
                      </td>
                      <td colSpan={6} className="p-2 text-center font-bold text-[11px] uppercase tracking-wider text-amber-800">
                        ☕ ISTIRAHAT &bull; Sholat Dhuha &amp; Rehat (30 Menit)
                      </td>
                    </tr>

                    {/* Sesi 3: Jam VI - VII (Jam 5-6 di aplikasi) */}
                    <tr className="hover:bg-slate-50/70 transition">
                      <td className="p-3 bg-slate-50/60 border-r border-slate-200 align-top">
                        <div className="font-black text-slate-900 text-xs">Sesi 3 (Jam V - VI)</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">10.00 - 11.00 WIB</div>
                      </td>
                      {daysList.map((day) => {
                        const sess = activeClassData.jadwal[day]?.find((s) => s.jam.includes('V-VI') || s.jam.includes('VI-VII'));
                        return (
                          <td key={day} className="p-2.5 border-r border-slate-200 align-top last:border-r-0">
                            {sess ? (
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/90 hover:shadow-2xs transition">
                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-black border ${getSubjectColor(sess.mapel)}`}>
                                  {sess.mapel}
                                </span>
                                <p className="text-[10px] text-slate-700 font-bold mt-1.5 leading-snug">
                                  {sess.guru}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODE 2: JADWAL PELAJARAN PER GURU (ROSTER INDIVIDUAL)
          ======================================================== */}
      {activeMode === 'per_guru' && (
        <div className="space-y-4">
          {/* Teacher Selector Card */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pilih Guru / Staf untuk Melihat Roster:
              </label>
              <select
                value={selectedTeacherName}
                onChange={(e) => setSelectedTeacherName(e.target.value)}
                className="w-full sm:w-96 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2F5597]"
              >
                {masterList.map((m, idx) => (
                  <option key={`jadwal-teacher-${m.no}-${m.nama}-${idx}`} value={m.nama}>
                    {m.no}. {m.nama} &mdash; {m.jabatan}
                  </option>
                ))}
              </select>
            </div>

            {selectedTeacher && (
              <div className="text-right w-full sm:w-auto">
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                  {selectedTeacher.kodeUnik || 'GURU'}
                </span>
              </div>
            )}
          </div>

          {/* Teacher Details & Schedule Table */}
          {selectedTeacher && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>{selectedTeacher.nama}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {selectedTeacher.jabatan}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold">
                    6 Hari Sekolah (Sabtu - Kamis)
                  </span>
                </div>
              </div>

              {/* 6 Days Breakdown for Selected Teacher */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {daysList.map((day) => {
                  const evalDay = evaluateTeacherScheduleForDay(selectedTeacher, day);
                  return (
                    <div
                      key={day}
                      className={`p-3.5 rounded-2xl border transition ${
                        evalDay.hasTeachingSchedule
                          ? 'bg-slate-50/90 border-slate-200 hover:bg-white shadow-2xs'
                          : 'bg-slate-50/40 border-slate-100 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 mb-2">
                        <span className="font-black text-slate-900 text-sm">{day}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          evalDay.hasTeachingSchedule
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {evalDay.hasTeachingSchedule ? `${evalDay.sesiList.length} Sesi Aktif` : 'Libur Mengajar'}
                        </span>
                      </div>

                      {evalDay.hasTeachingSchedule && evalDay.sesiList.length > 0 ? (
                        <div className="space-y-1.5">
                          {evalDay.sesiList.map((sesi, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-600 text-[10px]">
                                  {sesi.labelJam}
                                </span>
                                <span className="font-black text-slate-900">{sesi.namaMapel}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="px-2 py-0.5 font-black text-blue-900 bg-blue-100 rounded-md text-[10px]">
                                  {sesi.kelas}
                                </span>
                                <span className="text-[9.5px] text-slate-500 font-mono">
                                  {sesi.jamMulai}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic text-xs py-2 text-center">
                          Tidak ada jam tatap muka di kelas pada hari {day}.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

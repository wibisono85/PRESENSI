import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  ClipboardList,
  UserX,
  Settings,
  CheckCircle,
  AlertTriangle,
  Users,
  TableProperties,
  Activity,
  BarChart3,
  Lock,
  ShieldCheck,
  QrCode,
  BookOpen
} from 'lucide-react';
import { ActiveTab, UserRole } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isConnected: boolean;
  webAppUrl: string;
  unmarkedCount: number;
  isAdmin: boolean;
  userRole?: UserRole;
  onOpenPinModal: () => void;
  onLogoutAdmin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isConnected,
  webAppUrl,
  unmarkedCount,
  isAdmin,
  userRole,
  onOpenPinModal,
  onLogoutAdmin
}) => {
  const currentRole: UserRole = userRole || (isAdmin ? 'admin' : 'none');
  const isAuthorized = currentRole === 'admin' || currentRole === 'kurikulum';
  const [timeString, setTimeString] = useState<string>('');
  const [dateString, setDateString] = useState<string>('');
  const navContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB'
      );
      setDateString(
        now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Layar kecil (HP): tab aktif otomatis tergulir ke area terlihat (scrollIntoView, inline 'center')
  useEffect(() => {
    if (navContainerRef.current) {
      const activeBtn = navContainerRef.current.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest'
        });
      }
    }
  }, [activeTab, isAuthorized]);

  return (
    <header className="bg-[#2F5597] text-white shadow-md sticky top-0 z-30">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center border border-yellow-300/70 shadow-sm p-0.5 shrink-0 overflow-hidden">
            <img
              src="./assets/aistudio/LOGO_SMP_ca9ab34f.png"
              alt="Logo SMP Nurul Abror Al-Robbaniyin"
              className="w-full h-full object-contain rounded-full"
            />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
              SMP Nurul Abror Al-Robbaniyin
            </h1>
            <p className="text-xs text-blue-100 font-medium">
              Sistem Presensi Kehadiran Guru &amp; Staf
            </p>
          </div>
        </div>

        {/* Clock, Admin Mode Switch & Connection Badge */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end border-t border-white/10 pt-2 sm:pt-0 sm:border-t-0">
          <div className="text-left sm:text-right text-xs">
            <div className="font-semibold text-yellow-200">{timeString}</div>
            <div className="text-blue-100 opacity-90">{dateString}</div>
          </div>

          {/* Admin Mode Switch Button */}
          {/* Admin / Kurikulum Mode Switch Button */}
          {!isAuthorized ? (
            <button
              id="btn-login-admin"
              onClick={onOpenPinModal}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-200 border border-yellow-300/50 rounded-full text-xs font-bold transition-all shadow-sm active:scale-95"
              title="Masuk sebagai Admin atau Kurikulum"
            >
              <Lock className="w-3.5 h-3.5 text-yellow-300" />
              <span>Login PIN Server</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {currentRole === 'admin' ? (
                <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 rounded-full text-xs font-black">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Admin / Kepala Sekolah</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 px-3 py-1 bg-indigo-500/30 text-indigo-200 border border-indigo-400/50 rounded-full text-xs font-black">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Bagian Kurikulum</span>
                </span>
              )}
              <button
                id="btn-logout-admin"
                onClick={onLogoutAdmin}
                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 border border-rose-400/40 rounded-full text-[11px] font-bold transition-all"
                title="Keluar dari Mode Akses Terproteksi"
              >
                Keluar
              </button>
            </div>
          )}

          {isAuthorized && (
            <button
              onClick={() => setActiveTab('diagnostik')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                webAppUrl && isConnected
                  ? 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30 hover:bg-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-100 border-amber-400/30 hover:bg-amber-500/30'
              }`}
              title="Buka Diagnostik Koneksi Google Sheets"
            >
              {webAppUrl && isConnected ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Sheets Terhubung</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                  <span>Diagnostik</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs - SHOWN WHEN LOGGED IN AS ADMIN OR KURIKULUM */}
      {isAuthorized ? (
        <div className="bg-[#234278] border-t border-white/10 overflow-x-auto md:overflow-visible scrollbar-none">
          <div
            ref={navContainerRef}
            className="max-w-7xl mx-auto px-2 sm:px-6 flex gap-1 sm:gap-2 md:flex-wrap md:gap-y-1.5 md:py-1.5"
          >
            {/* Tab 0: Scan Barcode / QR Presensi (GPS & Kios & Cetak) */}
            <button
              id="tab-scan-qr"
              data-tab="scan_qr"
              data-active={activeTab === 'scan_qr'}
              onClick={() => setActiveTab('scan_qr')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'scan_qr'
                  ? 'border-yellow-400 text-yellow-300 bg-white/15 shadow-sm'
                  : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
              }`}
            >
              <QrCode className="w-4 h-4 text-yellow-300" />
              <span>Scan &amp; Kios Presensi</span>
            </button>

            {/* Tab: Jadwal Pelajaran (16 Kelas) - Akses Admin & Kurikulum */}
            <button
              id="tab-jadwal-pelajaran"
              data-tab="jadwal"
              data-active={activeTab === 'jadwal'}
              onClick={() => setActiveTab('jadwal')}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'jadwal'
                  ? 'border-yellow-400 text-yellow-300 bg-white/10 shadow-sm'
                  : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
              }`}
            >
              <BookOpen className="w-4 h-4 text-emerald-300" />
              <span>Jadwal Pelajaran (16 Kelas)</span>
            </button>

            {/* Admin-Only Tabs: Presensi, Input, Rekap, Master, Pengaturan, Diagnostik */}
            {currentRole === 'admin' && (
              <>
                {/* Tab 3: Dashboard & Grafik */}
                <button
                  id="tab-dashboard"
                  data-tab="dashboard"
                  data-active={activeTab === 'dashboard'}
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'dashboard'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-amber-300" />
                  <span>Dashboard &amp; Grafik</span>
                </button>

                {/* Tab 5: Belum Absen */}
                <button
                  id="tab-belum-absen"
                  data-tab="belum"
                  data-active={activeTab === 'belum'}
                  onClick={() => setActiveTab('belum')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all relative ${
                    activeTab === 'belum'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <UserX className="w-4 h-4" />
                  <span>Belum Absen</span>
                  {unmarkedCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                      {unmarkedCount}
                    </span>
                  )}
                </button>

                {/* Tab 4: Rekap & Riwayat */}
                <button
                  id="tab-rekap-riwayat"
                  data-tab="rekap"
                  data-active={activeTab === 'rekap'}
                  onClick={() => setActiveTab('rekap')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'rekap'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-amber-300" />
                  <span>Rekap &amp; Riwayat</span>
                </button>

                {/* Tab 1: Realtime Single Input */}
                <button
                  id="tab-input-presensi"
                  data-tab="input"
                  data-active={activeTab === 'input'}
                  onClick={() => setActiveTab('input')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'input'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>Input Presensi (Realtime)</span>
                </button>

                {/* Tab 2: Mass / Batch Daily Input */}
                <button
                  id="tab-input-massal"
                  data-tab="input_massal"
                  data-active={activeTab === 'input_massal'}
                  onClick={() => setActiveTab('input_massal')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'input_massal'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <TableProperties className="w-4 h-4 text-yellow-300" />
                  <span>Input / Koreksi Harian</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-yellow-400 text-slate-900 rounded">
                    Massal
                  </span>
                </button>

                {/* Tab 6: Master Guru & Staf */}
                <button
                  id="tab-master-guru"
                  data-tab="master"
                  data-active={activeTab === 'master'}
                  onClick={() => setActiveTab('master')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'master'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="w-4 h-4 text-amber-300" />
                  <span>Master Guru &amp; Staf</span>
                </button>

                {/* Tab 7: Settings */}
                <button
                  id="tab-setup-apps-script"
                  data-tab="setup"
                  data-active={activeTab === 'setup'}
                  onClick={() => setActiveTab('setup')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'setup'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Settings className="w-4 h-4 text-amber-300" />
                  <span>Pengaturan Sheets</span>
                </button>

                {/* Tab 8: Diagnostics */}
                <button
                  id="tab-diagnostik-koneksi"
                  data-tab="diagnostik"
                  data-active={activeTab === 'diagnostik'}
                  onClick={() => setActiveTab('diagnostik')}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                    activeTab === 'diagnostik'
                      ? 'border-yellow-400 text-yellow-300 bg-white/10'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Activity className="w-4 h-4 text-emerald-300" />
                  <span>Diagnostik</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Simple clean subtitle bar when user is not admin */
        <div className="bg-[#234278]/80 border-t border-white/10 px-4 py-2 text-center text-xs text-blue-100 flex items-center justify-center gap-2">
          <QrCode className="w-4 h-4 text-yellow-300" />
          <span>Arahkan Kamera / Google Lens ke Barcode ID Card Guru &bull; Tidak Perlu Install Aplikasi</span>
        </div>
      )}
    </header>
  );
};

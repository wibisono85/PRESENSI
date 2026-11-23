/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MasterGuruStaf, LogPresensi, AppSettings, ActiveTab, JadwalSlot, UserRole, DataCutiRecord } from './types';
import {
  getStoredSettings,
  saveStoredSettings,
  getLocalMasterData,
  saveLocalMasterData,
  normalizeMasterGuruStaf,
  getLocalLogs,
  getLocalCutiData,
  hasRemoteCutiSheetSupport,
  fetchRemoteData,
  postSaveSettings,
  postNewLog,
  batchUpsertLogs,
  deleteLogEntry,
  postSaveCuti,
  deleteCutiRemote,
  syncCutiRecordsRemote
} from './utils/googleAppsScript';
import { getLocalJadwal } from './utils/jadwalEngine';
import { formatDateISO } from './utils/dateUtils';

import { Header } from './components/Header';
import { ScanPresensiView } from './components/ScanPresensiView';
import { InputPresensi } from './components/InputPresensi';
import { InputMassal } from './components/InputMassal';
import { DashboardView } from './components/DashboardView';
import { RekapRiwayat } from './components/RekapRiwayat';
import { BelumAbsen } from './components/BelumAbsen';
import { AppsScriptSetup } from './components/AppsScriptSetup';
import { MasterDataModal } from './components/MasterDataModal';
import { JadwalPelajaranView } from './components/JadwalPelajaranView';
import { DiagnostikKoneksi } from './components/DiagnostikKoneksi';
import { AdminPinModal } from './components/AdminPinModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan_qr');

  // Role & Access state (server-validated: 'admin' | 'kurikulum' | 'none')
  const [userRole, setUserRole] = useState<UserRole>('none');
  const isAdmin = userRole === 'admin';
  const isKurikulum = userRole === 'kurikulum';
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

  // App settings state
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings());

  // Data state
  const [masterList, setMasterList] = useState<MasterGuruStaf[]>(getLocalMasterData());
  const [logs, setLogs] = useState<LogPresensi[]>(getLocalLogs());
  const [cutiList, setCutiList] = useState<DataCutiRecord[]>(getLocalCutiData());
  const [hasRemoteCutiSheet, setHasRemoteCutiSheet] = useState<boolean>(hasRemoteCutiSheetSupport());
  const [jadwalList, setJadwalList] = useState<JadwalSlot[]>(getLocalJadwal());

  // Network & UI status
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Pre-selected teacher for direct navigation from "Belum Absen" tab
  const [preselectedTeacher, setPreselectedTeacher] = useState<string>('');
  const [preselectedInputMode, setPreselectedInputMode] = useState<'quick' | 'manual' | 'cuti'>('quick');

  // Initial data loading & periodic sync
  const loadData = useCallback(async (webAppUrl: string) => {
    setIsRefreshing(true);
    const res = await fetchRemoteData(webAppUrl);
    setMasterList(res.master);
    setLogs(res.logs);
    if (res.cuti) {
      setCutiList(res.cuti);
    }
    if (res.hasRemoteCutiSheet !== undefined) {
      setHasRemoteCutiSheet(res.hasRemoteCutiSheet);
    }
    if (res.jadwal) {
      setJadwalList(res.jadwal);
    }
    if (res.settings) {
      setSettings(prev => ({ ...prev, ...res.settings }));
    }
    setIsConnected(res.success && !!webAppUrl);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadData(settings.webAppUrl);
  }, [settings.webAppUrl, loadData]);

  // Safeguard: Lock unauthorized users strictly to the mobile scan / attendance view
  useEffect(() => {
    if (userRole === 'none' && activeTab !== 'scan_qr') {
      setActiveTab('scan_qr');
    } else if (userRole === 'kurikulum' && activeTab !== 'scan_qr' && activeTab !== 'jadwal') {
      setActiveTab('jadwal');
    }
  }, [userRole, activeTab]);

  // Handler for saving settings (Syncs to Google Sheets backend)
  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    saveStoredSettings(newSettings);
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (settings.webAppUrl) {
      await postSaveSettings(settings.webAppUrl, updated);
    }
  };

  // Handler for submitting single attendance log (Realtime)
  const handleSaveLog = async (newLog: LogPresensi) => {
    const res = await postNewLog(settings.webAppUrl, newLog);
    setLogs(getLocalLogs());
    return res;
  };

  // Handler for submitting batch attendance logs (Mass / Correction)
  const handleBatchSaveLogs = async (logsToSave: LogPresensi[]) => {
    const res = await batchUpsertLogs(settings.webAppUrl, logsToSave);
    setLogs(getLocalLogs());
    return res;
  };

  // Handler for deleting attendance log
  const handleDeleteLog = async (id: string) => {
    await deleteLogEntry(settings.webAppUrl, id);
    setLogs(getLocalLogs());
  };

  // Handler for saving master leave record (Data_Cuti)
  const handleSaveCuti = async (cutiRecord: DataCutiRecord) => {
    const res = await postSaveCuti(settings.webAppUrl, cutiRecord);
    setCutiList(getLocalCutiData());
    if (res.syncedToSheet) {
      setHasRemoteCutiSheet(true);
    }
    return res;
  };

  // Handler for deleting master leave record (and optionally daily Cuti logs)
  const handleDeleteCuti = async (record: DataCutiRecord, alsoDeleteLogs: boolean = true) => {
    const res = await deleteCutiRemote(settings.webAppUrl, record, alsoDeleteLogs);
    setCutiList(getLocalCutiData());
    setLogs(getLocalLogs());
    return res;
  };

  // Handler for batch syncing all recorded Cuti entries to Data_Cuti sheet
  const handleSyncAllCuti = async (records: DataCutiRecord[]) => {
    const res = await syncCutiRecordsRemote(settings.webAppUrl, records);
    if (res.syncedToSheet) {
      setHasRemoteCutiSheet(true);
      await loadData(settings.webAppUrl);
    }
    return res;
  };

  // Handler for seeding master data to Google Sheets
  const handleSeedMaster = async () => {
    if (!settings.webAppUrl) {
      return { success: false, message: 'URL Google Apps Script belum diisi.' };
    }
    try {
      const res = await fetch(settings.webAppUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'seedMaster', masterData: masterList })
      });
      const json = await res.json();
      return { success: json.status === 'success', message: json.message || 'Master data ter-upload ke Sheets.' };
    } catch (e: any) {
      return { success: false, message: 'Gagal mengirim data: ' + e.message };
    }
  };

  // Handler for updating master list locally
  const handleUpdateMasterList = (newList: MasterGuruStaf[]) => {
    const normalized = normalizeMasterGuruStaf(newList);
    setMasterList(normalized);
    saveLocalMasterData(normalized);
  };

  // Calculate unmarked count for today
  const unmarkedTodayCount = useMemo(() => {
    const todayISO = formatDateISO();
    const recordedNamesToday = new Set(
      logs.filter((l) => l.tanggal === todayISO).map((l) => l.nama)
    );
    return masterList.filter((m) => !recordedNamesToday.has(m.nama)).length;
  }, [masterList, logs]);

  const handleSelectTeacherFromBelum = (nama: string, mode: 'quick' | 'manual' | 'cuti' = 'quick') => {
    setPreselectedTeacher(nama);
    setPreselectedInputMode(mode);
    setActiveTab('input');
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col selection:bg-[#2F5597] selection:text-white">
      {/* Top Fixed Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        webAppUrl={settings.webAppUrl}
        unmarkedCount={unmarkedTodayCount}
        isAdmin={isAdmin}
        userRole={userRole}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onLogoutAdmin={() => {
          setUserRole('none');
          setActiveTab('scan_qr');
        }}
      />

      {/* Admin / Kurikulum Verification Modal */}
      <AdminPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(role) => {
          setUserRole(role);
          setIsPinModalOpen(false);
          if (role === 'kurikulum') {
            setActiveTab('jadwal');
          }
        }}
        webAppUrl={settings.webAppUrl}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Tab 0: Scan Barcode / QR Presensi (GPS & Kios) */}
        {activeTab === 'scan_qr' && (
          <ScanPresensiView
            masterList={masterList}
            existingLogs={logs}
            settings={settings}
            isAdmin={isAdmin}
            jadwalList={jadwalList}
            onSaveLog={handleSaveLog}
            onSaveSettings={handleSaveSettings}
            onOpenPinModal={() => setIsPinModalOpen(true)}
          />
        )}

        {/* Tab 1: Realtime Single Input & Leave (Cuti) */}
        {activeTab === 'input' && (
          <InputPresensi
            masterList={masterList}
            existingLogs={logs}
            cutiList={cutiList}
            hasRemoteCutiSheet={hasRemoteCutiSheet}
            threshold={settings.jamMasukThreshold || '07:25'}
            onSubmit={handleSaveLog}
            onBatchSave={handleBatchSaveLogs}
            onSaveCuti={handleSaveCuti}
            onDeleteCuti={handleDeleteCuti}
            onSyncAllCuti={handleSyncAllCuti}
            onNavigateToSetup={() => setActiveTab('setup')}
            preselectedTeacher={preselectedTeacher}
            initialMode={preselectedInputMode}
            onClearPreselection={() => {
              setPreselectedTeacher('');
              setPreselectedInputMode('quick');
            }}
            settings={settings}
            jadwalList={jadwalList}
          />
        )}

        {/* Tab 2: Mass Batch Input & Daily Correction */}
        {activeTab === 'input_massal' && (
          <InputMassal
            masterList={masterList}
            existingLogs={logs}
            threshold={settings.jamMasukThreshold || '07:25'}
            onBatchSave={handleBatchSaveLogs}
            onRefreshData={() => loadData(settings.webAppUrl)}
            settings={settings}
            jadwalList={jadwalList}
          />
        )}

        {/* Tab 3: Dashboard Grafik Analytics */}
        {activeTab === 'dashboard' && (
          <DashboardView
            logs={logs}
            masterList={masterList}
            settings={settings}
            jadwalList={jadwalList}
          />
        )}

        {/* Tab 3: Rekap & Riwayat */}
        {activeTab === 'rekap' && (
          <RekapRiwayat
            logs={logs}
            masterList={masterList}
            sheetUrl={settings.sheetUrl}
            onRefresh={() => loadData(settings.webAppUrl)}
            onDeleteLog={handleDeleteLog}
            isRefreshing={isRefreshing}
          />
        )}

        {/* Tab 4: Belum Absen */}
        {activeTab === 'belum' && (
          <BelumAbsen
            masterList={masterList}
            logs={logs}
            onSelectTeacherForInput={(nama) => handleSelectTeacherFromBelum(nama, 'quick')}
            onSelectTeacherForCuti={(nama) => handleSelectTeacherFromBelum(nama, 'cuti')}
            settings={settings}
            jadwalList={jadwalList}
          />
        )}

        {/* Tab 5: Master Guru & Staf */}
        {activeTab === 'master' && (
          <MasterDataModal
            masterList={masterList}
            onUpdateMasterList={handleUpdateMasterList}
            webAppUrl={settings.webAppUrl}
            onSeedMaster={handleSeedMaster}
            onReloadRemote={() => loadData(settings.webAppUrl)}
          />
        )}

        {/* Tab: Jadwal Pelajaran (16 Kelas) */}
        {activeTab === 'jadwal' && (
          <JadwalPelajaranView
            masterList={masterList}
            jadwalList={jadwalList}
            userRole={userRole}
            webAppUrl={settings.webAppUrl}
            jadwalTahunAjaran={settings.jadwalTahunAjaran}
            jadwalSemester={settings.jadwalSemester}
            onReloadJadwal={() => loadData(settings.webAppUrl)}
          />
        )}

        {/* Tab 6: Pengaturan Sheets */}
        {activeTab === 'setup' && (
          <AppsScriptSetup
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onTestConnection={() => loadData(settings.webAppUrl)}
            onSeedMasterData={handleSeedMaster}
            masterCount={masterList.length}
          />
        )}

        {/* Tab 7: Diagnostik Koneksi */}
        {activeTab === 'diagnostik' && (
          <DiagnostikKoneksi
            settings={settings}
            onUpdateUrl={(newUrl) => handleSaveSettings({ webAppUrl: newUrl })}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 mt-auto">
        <p className="font-semibold text-slate-700">
          Aplikasi Presensi Guru &amp; Staf &mdash; SMP Nurul Abror Al-Robbaniyin
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Terintegrasi Google Sheets Backend | Jalur Pengawasan &amp; Audit Rekapitulasi Kehadiran Harian
        </p>
      </footer>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MasterGuruStaf, LogPresensi, AppSettings, ActiveTab, JadwalSlot, UserRole, DataCutiRecord, DataSpRecord } from './types';
import {
  getStoredSettings,
  saveStoredSettings,
  getLocalMasterData,
  saveLocalMasterData,
  normalizeMasterGuruStaf,
  getLocalLogs,
  getLocalCutiData,
  hasRemoteCutiSheetSupport,
  getLocalSpData,
  hasRemoteSpSheetSupport,
  fetchRemoteData,
  postSaveSettings,
  postNewLog,
  batchUpsertLogs,
  postBatchAutoAlpa,
  deleteLogEntry,
  postSaveCuti,
  deleteCutiRemote,
  revokeCutiRemote,
  syncCutiRecordsRemote,
  postSaveSp,
  deleteSpRemote,
  WaGatewayStatus,
  sendWaReminderRemote
} from './utils/googleAppsScript';
import { getLocalJadwal } from './utils/jadwalEngine';
import { formatDateISO, formatLongDateIndonesian } from './utils/dateUtils';
import { addCalendarDaysISO, buildMissingDailyCutiLogs, enumerateSchoolDatesInRange, isCutiRecordActiveOnDate } from './utils/cutiUtils';
import { computeMissingAutoAlpaLogs } from './utils/autoAlpaUtils';
import { isTeacherWajibHadir } from './utils/scheduleTimeEvaluator';

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
import { PembinaanSpView } from './components/PembinaanSpView';
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
  const [spList, setSpList] = useState<DataSpRecord[]>(getLocalSpData());
  const [hasRemoteSpSheet, setHasRemoteSpSheet] = useState<boolean>(hasRemoteSpSheetSupport());
  const [jadwalList, setJadwalList] = useState<JadwalSlot[]>(getLocalJadwal());
  const [waGatewayStatus, setWaGatewayStatus] = useState<WaGatewayStatus | undefined>(undefined);

  // Network & UI status
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Pre-selected teacher for direct navigation from "Belum Absen" tab
  const [preselectedTeacher, setPreselectedTeacher] = useState<string>('');
  const [preselectedInputMode, setPreselectedInputMode] = useState<'quick' | 'manual' | 'cuti'>('quick');
  const isRunningAutoAlpaRef = useRef<boolean>(false);

  const runAutoAlpaSync = useCallback(
    async (params: {
      master: MasterGuruStaf[];
      currentLogs: LogPresensi[];
      cuti: DataCutiRecord[];
      effectiveSettings: AppSettings;
      jadwal?: JadwalSlot[];
      targetDates?: string[];
      bypassTodayTimeCheck?: boolean;
    }) => {
      const { master, currentLogs, cuti, effectiveSettings, jadwal, targetDates, bypassTodayTimeCheck } = params;
      if (effectiveSettings.autoAlpaEnabled === false) {
        return { success: true, inserted: 0, skipped: 0, message: 'Fitur Auto-Alpa otomatis sedang dinonaktifkan di Pengaturan.' };
      }
      if (isRunningAutoAlpaRef.current || master.length === 0) {
        return { success: true, inserted: 0, skipped: 0, message: 'Sedang memproses atau data master kosong.' };
      }
      isRunningAutoAlpaRef.current = true;
      try {
        const missing = computeMissingAutoAlpaLogs({
          masterList: master,
          existingLogs: currentLogs,
          cutiList: cuti,
          settings: effectiveSettings,
          jadwalList: jadwal,
          targetDates,
          bypassTodayTimeCheck
        });
        if (missing.length === 0) {
          return { success: true, inserted: 0, skipped: 0, message: 'Semua guru/staf wajib hadir yang melewati batas waktu sudah tercatat.' };
        }
        const res = await postBatchAutoAlpa(effectiveSettings.webAppUrl, missing);
        setLogs(getLocalLogs());
        return res;
      } finally {
        isRunningAutoAlpaRef.current = false;
      }
    },
    []
  );

  // Initial data loading & periodic sync
  const loadData = useCallback(async (webAppUrl: string) => {
    setIsRefreshing(true);
    const res = await fetchRemoteData(webAppUrl);
    setMasterList(res.master);
    setLogs(res.logs);
    const nextCuti = res.cuti || cutiList;
    if (res.cuti) {
      setCutiList(res.cuti);
    }
    if (res.hasRemoteCutiSheet !== undefined) {
      setHasRemoteCutiSheet(res.hasRemoteCutiSheet);
    }
    if (res.sp) {
      setSpList(res.sp);
    }
    if (res.hasRemoteSpSheet !== undefined) {
      setHasRemoteSpSheet(res.hasRemoteSpSheet);
    }
    const nextJadwal = res.jadwal || jadwalList;
    if (res.jadwal) {
      setJadwalList(res.jadwal);
    }
    let mergedSettings = settings;
    if (res.settings) {
      mergedSettings = { ...settings, ...res.settings };
      setSettings(mergedSettings);
    }
    if (res.waGatewayStatus) {
      setWaGatewayStatus(res.waGatewayStatus);
    }
    setIsConnected(res.success && !!webAppUrl);
    setIsRefreshing(false);

    // Jalankan evaluasi otomatis Tidak Hadir (Auto-Alpa +90 menit) setelah data segar terbaca
    if (res.success && mergedSettings.autoAlpaEnabled !== false && (!webAppUrl || res.master.length > 0)) {
      await runAutoAlpaSync({
        master: res.master,
        currentLogs: res.logs,
        cuti: nextCuti,
        effectiveSettings: mergedSettings,
        jadwal: nextJadwal
      });
    }
  }, [runAutoAlpaSync]);

  useEffect(() => {
    loadData(settings.webAppUrl);
  }, [settings.webAppUrl, loadData]);

  // Periodic background check every 5 minutes while app is open
  useEffect(() => {
    if (settings.autoAlpaEnabled === false) return;
    const timer = setInterval(() => {
      runAutoAlpaSync({
        master: masterList,
        currentLogs: logs,
        cuti: cutiList,
        effectiveSettings: settings,
        jadwal: jadwalList
      });
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [masterList, logs, cutiList, settings, jadwalList, runAutoAlpaSync]);

  // Safeguard: Lock unauthorized users strictly to the mobile scan / attendance view
  useEffect(() => {
    if (userRole === 'none' && activeTab !== 'scan_qr') {
      setActiveTab('scan_qr');
    } else if (
      userRole === 'kurikulum' &&
      activeTab !== 'scan_qr' &&
      activeTab !== 'jadwal' &&
      activeTab !== 'sp_pembinaan'
    ) {
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

  // Handler for revoking / finishing an active Cuti early (when teacher reports back to TU/Admin)
  const handleRevokeCuti = async (record: DataCutiRecord, effectiveReturnDate: string) => {
    const teacher = masterList.find((m) => m.nama.trim().toLowerCase() === record.nama.trim().toLowerCase());
    const newEndDate =
      effectiveReturnDate > record.tanggalMulai
        ? addCalendarDaysISO(effectiveReturnDate, -1)
        : record.tanggalMulai;

    let newJumlahHari = 0;
    if (effectiveReturnDate > record.tanggalMulai) {
      const range = enumerateSchoolDatesInRange(record.tanggalMulai, newEndDate, 180);
      if (range.valid) {
        if (record.cakupan === 'wajib_hadir' && teacher) {
          const wajib = range.schoolDates.filter((d) =>
            isTeacherWajibHadir(teacher, d.hari, jadwalList, settings.guruTanpaJadwalWajibHadir, settings.attendanceRuleOverrides)
          );
          newJumlahHari = wajib.length > 0 ? wajib.length : range.schoolDates.length;
        } else {
          newJumlahHari = range.schoolDates.length;
        }
      }
    }

    const revNote = `Dicabut/Aktif kembali mulai ${formatLongDateIndonesian(effectiveReturnDate)}`;
    const baseCatatan = record.catatan && record.catatan !== '-' ? record.catatan.trim() : '';
    const updatedCatatan = baseCatatan ? `${baseCatatan} • ${revNote}` : revNote;

    const updatedRecord: DataCutiRecord = {
      ...record,
      tanggalSelesai: newEndDate,
      jumlahHariEfektif: newJumlahHari,
      catatan: updatedCatatan,
      statusPengajuan: 'Dicabut'
    };

    const res = await revokeCutiRemote(settings.webAppUrl, {
      originalRecord: record,
      updatedRecord,
      effectiveDate: effectiveReturnDate
    });
    setCutiList(getLocalCutiData());
    setLogs(getLocalLogs());
    return res;
  };

  // Handler for extending an existing Cuti record
  const handleExtendCuti = async (params: {
    record: DataCutiRecord;
    newEndDate: string;
    guruPengganti?: string;
    nomorSurat?: string;
    catatan?: string;
  }) => {
    const { record, newEndDate, guruPengganti, nomorSurat, catatan } = params;
    if (!newEndDate || newEndDate < record.tanggalMulai) {
      return {
        success: false,
        syncedToSheet: false,
        addedLogs: 0,
        message: 'Tanggal selesai perpanjangan tidak boleh lebih awal dari tanggal mulai cuti.'
      };
    }

    const teacher = masterList.find((m) => m.nama.trim().toLowerCase() === record.nama.trim().toLowerCase());
    const range = enumerateSchoolDatesInRange(record.tanggalMulai, newEndDate, 180);
    if (!range.valid) {
      return {
        success: false,
        syncedToSheet: false,
        addedLogs: 0,
        message: range.error || 'Rentang perpanjangan cuti tidak valid.'
      };
    }

    let totalEffectiveDays = range.schoolDates.length;
    if (record.cakupan === 'wajib_hadir' && teacher) {
      const wajib = range.schoolDates.filter((d) =>
        isTeacherWajibHadir(teacher, d.hari, jadwalList, settings.guruTanpaJadwalWajibHadir, settings.attendanceRuleOverrides)
      );
      if (wajib.length > 0) totalEffectiveDays = wajib.length;
    }

    const extNote = `Diperpanjang s/d ${formatLongDateIndonesian(newEndDate)}`;
    const rawCat = catatan !== undefined ? catatan.trim() : (record.catatan && record.catatan !== '-' ? record.catatan.trim() : '');
    const finalCatatan = rawCat
      ? rawCat.includes(extNote)
        ? rawCat
        : `${rawCat} • ${extNote}`
      : extNote;

    const updatedRecord: DataCutiRecord = {
      ...record,
      tanggalSelesai: newEndDate,
      jumlahHariEfektif: totalEffectiveDays,
      guruPengganti: guruPengganti !== undefined ? (guruPengganti.trim() || '-') : record.guruPengganti,
      nomorSurat: nomorSurat !== undefined ? (nomorSurat.trim() || '-') : record.nomorSurat,
      catatan: finalCatatan,
      statusPengajuan: 'Aktif'
    };

    const cutiSaveRes = await postSaveCuti(settings.webAppUrl, updatedRecord);
    const currentLogs = getLocalLogs();
    const missingLogs = buildMissingDailyCutiLogs({
      cutiRecords: [updatedRecord],
      existingLogs: currentLogs,
      masterList,
      threshold: settings.jamMasukThreshold || '07:25',
      jadwalList,
      guruTanpaJadwalWajibHadir: settings.guruTanpaJadwalWajibHadir,
      attendanceRuleOverrides: settings.attendanceRuleOverrides
    });

    let addedLogs = 0;
    if (missingLogs.length > 0) {
      const batchRes = await batchUpsertLogs(settings.webAppUrl, missingLogs);
      if (batchRes.success) {
        addedLogs = missingLogs.length;
      }
    }

    setCutiList(getLocalCutiData());
    setLogs(getLocalLogs());

    return {
      success: true,
      syncedToSheet: cutiSaveRes.syncedToSheet,
      addedLogs,
      message: `Cuti ${record.nama} berhasil diperpanjang s/d ${formatLongDateIndonesian(newEndDate)} (${addedLogs} hari tambahan dicatat ke Log_Presensi).`
    };
  };

  // Handler for saving SP / Pembinaan record (Data_SP)
  const handleSaveSp = async (spRecord: DataSpRecord) => {
    const res = await postSaveSp(settings.webAppUrl, spRecord);
    setSpList(getLocalSpData());
    if (res.syncedToSheet) {
      setHasRemoteSpSheet(true);
    }
    return res;
  };

  // Handler for deleting SP / Pembinaan record
  const handleDeleteSp = async (id: string) => {
    const res = await deleteSpRemote(settings.webAppUrl, id);
    setSpList(getLocalSpData());
    return res;
  };

  // Handler for batch syncing all recorded Cuti entries to Data_Cuti AND missing daily rows to Log_Presensi
  const handleSyncAllCuti = async (records: DataCutiRecord[]) => {
    const res = await syncCutiRecordsRemote(settings.webAppUrl, records);
    let logSyncNote = '';
    let logSyncFailed = false;

    const missingDailyLogs = buildMissingDailyCutiLogs({
      cutiRecords: records,
      existingLogs: logs,
      masterList,
      threshold: settings.jamMasukThreshold || '07:25',
      jadwalList,
      guruTanpaJadwalWajibHadir: settings.guruTanpaJadwalWajibHadir,
      attendanceRuleOverrides: settings.attendanceRuleOverrides
    });

    if (missingDailyLogs.length > 0 && settings.webAppUrl && res.syncedToSheet) {
      const logRes = await batchUpsertLogs(settings.webAppUrl, missingDailyLogs);
      if (logRes.success) {
        logSyncNote = ` + ${missingDailyLogs.length} catatan harian Cuti ditambahkan ke Log_Presensi.`;
      } else {
        logSyncFailed = true;
        logSyncNote = ` Namun sinkronisasi ke Log_Presensi gagal: ${logRes.message}`;
      }
    } else if (missingDailyLogs.length === 0 && res.syncedToSheet) {
      logSyncNote = ' Semua catatan harian di Log_Presensi sudah lengkap.';
    }

    if (res.syncedToSheet) {
      setHasRemoteCutiSheet(true);
      await loadData(settings.webAppUrl);
    }

    return {
      ...res,
      success: res.success && !logSyncFailed,
      message: `${res.message}${logSyncNote}`.trim()
    };
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
      logs.filter((l) => l.tanggal === todayISO).map((l) => l.nama.trim().toLowerCase())
    );
    const activeCutiNamesToday = new Set(
      cutiList.filter((c) => isCutiRecordActiveOnDate(c, todayISO)).map((c) => c.nama.trim().toLowerCase())
    );
    return masterList.filter((m) => {
      const n = m.nama.trim().toLowerCase();
      return !recordedNamesToday.has(n) && !activeCutiNamesToday.has(n);
    }).length;
  }, [masterList, logs, cutiList]);

  const handleSelectTeacherFromBelum = (nama: string, mode: 'quick' | 'manual' | 'cuti' = 'quick') => {
    setPreselectedTeacher(nama);
    setPreselectedInputMode(mode);
    setActiveTab('input');
  };

  const handleSendWaReminder = async (customMessage?: string, forceSend: boolean = false) => {
    const appPublicUrl =
      settings.waAppPublicUrl ||
      (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
    const res = await sendWaReminderRemote(settings.webAppUrl, {
      forceSend,
      customMessage,
      appPublicUrl
    });
    if (res.sent) {
      setWaGatewayStatus((prev) => ({
        ...(prev || { configured: true }),
        configured: true,
        lastSentDate: formatDateISO(),
        lastStatus: res.message
      }));
    }
    return res;
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
        onSaveWebAppUrl={(url) => {
          saveStoredSettings({ webAppUrl: url });
          setSettings((prev) => ({ ...prev, webAppUrl: url }));
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Tab 0: Scan Barcode / QR Presensi (GPS & Kios) */}
        {activeTab === 'scan_qr' && (
          <ScanPresensiView
            masterList={masterList}
            existingLogs={logs}
            cutiList={cutiList}
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
            onRevokeCuti={handleRevokeCuti}
            onExtendCuti={handleExtendCuti}
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
            cutiList={cutiList}
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
            cutiList={cutiList}
            sheetUrl={settings.sheetUrl}
            onRefresh={() => loadData(settings.webAppUrl)}
            onDeleteLog={handleDeleteLog}
            isRefreshing={isRefreshing}
            settings={settings}
            jadwalList={jadwalList}
            onSendWaReminder={(customMessage) => handleSendWaReminder(customMessage, true)}
            waGatewayStatus={waGatewayStatus}
          />
        )}

        {/* Tab 4: Belum Absen */}
        {activeTab === 'belum' && (
          <BelumAbsen
            masterList={masterList}
            logs={logs}
            cutiList={cutiList}
            onSelectTeacherForInput={(nama) => handleSelectTeacherFromBelum(nama, 'quick')}
            onSelectTeacherForCuti={(nama) => handleSelectTeacherFromBelum(nama, 'cuti')}
            onRunAutoAlpa={(targetDate, bypassTime) =>
              runAutoAlpaSync({
                master: masterList,
                currentLogs: logs,
                cuti: cutiList,
                effectiveSettings: settings,
                jadwal: jadwalList,
                targetDates: [targetDate],
                bypassTodayTimeCheck: bypassTime
              })
            }
            onSendWaReminder={(customMessage) => handleSendWaReminder(customMessage, true)}
            waGatewayStatus={waGatewayStatus}
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

        {/* Tab: Pembinaan Kedisiplinan & Surat Peringatan (SP) */}
        {activeTab === 'sp_pembinaan' && (
          <PembinaanSpView
            masterList={masterList}
            logs={logs}
            spList={spList}
            hasRemoteSpSheet={hasRemoteSpSheet}
            userRole={userRole}
            webAppUrl={settings.webAppUrl}
            onSaveSp={handleSaveSp}
            onDeleteSp={handleDeleteSp}
            onNavigateToSetup={() => setActiveTab('setup')}
          />
        )}

        {/* Tab 6: Pengaturan Sheets */}
        {activeTab === 'setup' && (
          <AppsScriptSetup
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onTestConnection={() => loadData(settings.webAppUrl)}
            onSeedMasterData={handleSeedMaster}
            onTestWaReminder={() => handleSendWaReminder(undefined, true)}
            waGatewayStatus={waGatewayStatus}
            masterCount={masterList.length}
            masterList={masterList}
            jadwalList={jadwalList}
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
      <footer className="print:hidden bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 mt-auto">
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

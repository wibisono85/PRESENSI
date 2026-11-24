import { AppSettings, AttendanceRuleMode, DataCutiRecord, JadwalSlot, LogPresensi, MasterGuruStaf, StatusPresensi, TestApiResponse } from '../types';
import { DEFAULT_MASTER_GURU_STAF } from '../data/defaultMaster';
import { parseAndFormat24hTime } from './timeUtils';
import { DEFAULT_SCHOOL_COORDS, normalizeCoordinate } from './qrAndGeoUtils';
import { getLocalJadwal, saveLocalJadwal, cariKodeGuru } from './jadwalEngine';

export const APPS_SCRIPT_CODE = `/**
 * Google Apps Script - Backend Presensi SMP Nurul Abror Al-Robbaniyin
 * Tempelkan kode ini ke Google Sheets: Ekstensi > Apps Script (Code.gs)
 * Lalu klik "Terapkan" (Deploy) > "Penerepan baru" (New Deployment) > Pilih "Aplikasi Web" (Web App)
 * - Jalankan sebagai: Saya (Me)
 * - Yang memiliki akses: Siapa saja (Anyone)
 * 
 * SANGAT PENTING:
 * Setiap kali mengubah kode ini, gunakan menu "Kelola Deployment" (Manage Deployments) > "Edit" > Pilih "Versi Baru" (New Version)
 * AGAR URL WEB APP TIDAK BERUBAH.
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(ss);
  
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';
  
  if (action === 'master') {
    return createJsonResponse({ status: 'success', master: getMasterData(ss) });
  } else if (action === 'logs') {
    return createJsonResponse({ status: 'success', logs: getLogData(ss) });
  } else if (action === 'getLogsByDate') {
    var targetDate = (e && e.parameter && e.parameter.tanggal) ? e.parameter.tanggal : '';
    var allLogs = getLogData(ss);
    if (targetDate) {
      allLogs = allLogs.filter(function(l) { return l.tanggal === targetDate; });
    }
    return createJsonResponse({ status: 'success', logs: allLogs });
  } else if (action === 'cuti') {
    return createJsonResponse({ status: 'success', cuti: getCutiData(ss) });
  } else if (action === 'getJadwal') {
    var jResult = getJadwalData(ss);
    return createJsonResponse({
      status: 'success',
      rows: jResult.rows,
      jadwal: jResult.rows,
      jadwalAktif: jResult.jadwalAktif,
      terms: jResult.terms
    });
  } else {
    var jAll = getJadwalData(ss);
    return createJsonResponse({
      status: 'success',
      master: getMasterData(ss),
      logs: getLogData(ss),
      cuti: getCutiData(ss),
      settings: getSettingsData(ss),
      jadwal: jAll.rows,
      jadwalAktif: jAll.jadwalAktif,
      terms: jAll.terms
    });
  }
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);
    
    var contents = e.postData.contents;
    var payload = JSON.parse(contents);
    var action = payload.action;

    if (action === 'addLog') {
      var data = payload.data;
      if (!data.nama || !data.tanggal) {
        return createJsonResponse({ status: 'error', message: 'Field Nama dan Tanggal wajib diisi.' });
      }
      
      var logSheet = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
      if (!logSheet) {
        logSheet = ss.insertSheet('Log_Presensi');
      }
      ensureLogHeaders(logSheet);

      var rows = logSheet.getDataRange().getValues();
      var keyMap = {};
      for (var i = 1; i < rows.length; i++) {
        var rNama = String(rows[i][4] || '').trim().toLowerCase();
        var rTanggal = formatDate(rows[i][2]).trim();
        if (rNama && rTanggal) {
          keyMap[rNama + '_' + rTanggal] = i + 1;
        }
      }

      var itemKey = String(data.nama).trim().toLowerCase() + '_' + String(data.tanggal).trim();
      var nextId = data.id || ('ID-' + Date.now());
      var bStaf = data.batasStaf ? ("'" + String(data.batasStaf).replace(/^'/, '')) : '';
      var bMengajar = data.batasMengajar ? ("'" + String(data.batasMengajar).replace(/^'/, '')) : '';
      var rowData = [
        nextId,
        data.timestamp || new Date().toISOString(),
        data.tanggal,
        data.hari,
        data.nama,
        data.jabatan || '-',
        data.mapelHariIni || '-',
        data.jamDatang || '-',
        data.status || 'Tepat Waktu',
        data.keterangan || '',
        data.peran || '',
        bStaf,
        data.statusStaf || '',
        bMengajar,
        data.statusMengajar || ''
      ];

      if (keyMap[itemKey]) {
        var targetRow = keyMap[itemKey];
        logSheet.getRange(targetRow, 1, 1, 15).setValues([rowData]);
        return createJsonResponse({ status: 'success', message: 'Data presensi berhasil diperbarui di Google Sheets.', id: nextId });
      } else {
        logSheet.appendRow(rowData);
        return createJsonResponse({ status: 'success', message: 'Data presensi berhasil disimpan ke Google Sheets.', id: nextId });
      }
      
    } else if (action === 'batchUpsert') {
      var logs = payload.logs || payload.data || [];
      if (!Array.isArray(logs) || logs.length === 0) {
        return createJsonResponse({ status: 'error', message: 'Tidak ada data presensi yang dikirim.' });
      }

      var batchLock = LockService.getScriptLock();
      try {
        batchLock.waitLock(30000);
      } catch (lockErr) {
        return createJsonResponse({ status: 'error', message: 'Server sedang sibuk memproses presensi lain. Coba beberapa saat lagi.' });
      }

      try {
        var logSheet = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
        if (!logSheet) {
          logSheet = ss.insertSheet('Log_Presensi');
        }
        ensureLogHeaders(logSheet);

        var rows = logSheet.getDataRange().getValues();
        var keyMap = {};
        var lastContentRow = 1;
        for (var i = 1; i < rows.length; i++) {
          var rowHasContent = false;
          for (var c = 0; c < rows[i].length; c++) {
            if (rows[i][c] !== '' && rows[i][c] !== null && rows[i][c] !== undefined) {
              rowHasContent = true;
              break;
            }
          }
          if (rowHasContent) {
            lastContentRow = i + 1;
          }
          var rNama = String(rows[i][4] || '').trim().toLowerCase();
          var rTanggal = formatDate(rows[i][2]).trim();
          if (rNama && rTanggal) {
            keyMap[rNama + '_' + rTanggal] = i + 1;
          }
        }

        var updatedCount = 0;
        var insertedCount = 0;
        var appendBatch = [];
        var pendingBatchIdx = {};

        for (var k = 0; k < logs.length; k++) {
          var item = logs[k];
          if (!item.nama || !item.tanggal) continue;

          var itemKey = String(item.nama).trim().toLowerCase() + '_' + String(item.tanggal).trim();
          var nextId = item.id || ('ID-' + Date.now() + '-' + k);
          var timestamp = item.timestamp || new Date().toISOString();
          var bStaf = item.batasStaf ? ("'" + String(item.batasStaf).replace(/^'/, '')) : '';
          var bMengajar = item.batasMengajar ? ("'" + String(item.batasMengajar).replace(/^'/, '')) : '';
          var rowData = [
            nextId,
            timestamp,
            item.tanggal,
            item.hari,
            item.nama,
            item.jabatan || '-',
            item.mapelHariIni || '-',
            item.jamDatang || '-',
            item.status || 'Tepat Waktu',
            item.keterangan || '',
            item.peran || '',
            bStaf,
            item.statusStaf || '',
            bMengajar,
            item.statusMengajar || ''
          ];

          if (keyMap[itemKey]) {
            var targetRow = keyMap[itemKey];
            logSheet.getRange(targetRow, 1, 1, 15).setValues([rowData]);
            updatedCount++;
          } else if (pendingBatchIdx[itemKey] !== undefined) {
            appendBatch[pendingBatchIdx[itemKey]] = rowData;
          } else {
            pendingBatchIdx[itemKey] = appendBatch.length;
            appendBatch.push(rowData);
            insertedCount++;
          }
        }

        if (appendBatch.length > 0) {
          var startAppendRow = Math.max(lastContentRow, 1) + 1;
          logSheet.getRange(startAppendRow, 1, appendBatch.length, 15).setValues(appendBatch);
        }

        return createJsonResponse({
          status: 'success',
          message: 'Batch presensi berhasil diproses: ' + insertedCount + ' data baru, ' + updatedCount + ' data diperbarui.',
          inserted: insertedCount,
          updated: updatedCount,
          total: insertedCount + updatedCount
        });
      } finally {
        batchLock.releaseLock();
      }

    } else if (action === 'deleteLog') {
      var logId = payload.id;
      var logSheet = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
      if (logSheet) {
        var rows = logSheet.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          if (String(rows[i][0]) === String(logId)) {
            logSheet.deleteRow(i + 1);
            return createJsonResponse({ status: 'success', message: 'Data berhasil dihapus dari Google Sheets.' });
          }
        }
      }
      return createJsonResponse({ status: 'error', message: 'ID Log tidak ditemukan.' });
      
    } else if (action === 'seedMaster') {
      var masterSheet = findSheetFlexible(ss, ['Master_Guru_Staf', 'Master Guru Staf', 'Master', 'Guru', 'Staf'], ['master', 'guru']);
      if (!masterSheet) {
        masterSheet = ss.insertSheet('Master_Guru_Staf');
      }
      var masterData = payload.masterData;
      
      masterSheet.clearContents();
      masterSheet.appendRow([
        'No', 'Nama (Guru dan Staf)', 'Jabatan Struktural', 
        'Mapel Diampu - Sabtu', 'Mapel Diampu - Ahad', 'Mapel Diampu - Senin', 
        'Mapel Diampu - Selasa', 'Mapel Diampu - Rabu', 'Mapel Diampu - Kamis',
        'Kode Guru', 'Peran Presensi'
      ]);
      
      for (var j = 0; j < masterData.length; j++) {
        var m = masterData[j];
        masterSheet.appendRow([
          m.no, m.nama, m.jabatan,
          m.mapelSabtu, m.mapelAhad, m.mapelSenin,
          m.mapelSelasa, m.mapelRabu, m.mapelKamis,
          (m.kodeGuru !== undefined && m.kodeGuru !== null) ? m.kodeGuru : '',
          (m.peran !== undefined && m.peran !== null) ? m.peran : ''
        ]);
      }
      return createJsonResponse({ status: 'success', message: 'Master data berhasil diperbarui di Google Sheets.' });
    } else if (action === 'verifyPin') {
      try {
        var role = checkPin(payload.pin);
        if (!role) {
          return createJsonResponse({ status: 'error', message: 'PIN tidak sesuai! Silakan coba lagi.' });
        }
        return createJsonResponse({ status: 'success', role: role });
      } catch (err) {
        return createJsonResponse({ status: 'error', message: err.message || String(err) });
      }
    } else if (action === 'saveJadwal') {
      var authRole = null;
      try {
        authRole = checkPin(payload.pin);
      } catch (err) {
        return createJsonResponse({ status: 'error', message: err.message || String(err) });
      }
      if (authRole !== 'admin' && authRole !== 'kurikulum') {
        return createJsonResponse({ status: 'error', message: 'Akses ditolak: PIN tidak valid untuk menyimpan jadwal.' });
      }

      var rows = payload.rows;
      var tahunAjaran = String(payload.tahunAjaran || '2026/2027').trim();
      var semester = String(payload.semester || 'Ganjil').trim();
      var catatan = String(payload.catatan || '').trim();

      if (!Array.isArray(rows) || rows.length === 0) {
        return createJsonResponse({ status: 'error', message: 'Data baris jadwal kosong.' });
      }

      var validDays = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];
      var validSessions = ['Jam I-II', 'Jam III-IV', 'Jam V-VI'];
      var errors = [];

      var classSlotMap = {};
      var teacherSlotMap = {};

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rowNum = i + 1;

        var hari = String(r.hari || '').trim();
        var sesi = String(r.sesi || '').trim();
        var kelas = String(r.kelas || '').trim();
        var rawKode = r.kodeGuru;
        var kodeGuru = parseInt(String(rawKode || ''), 10);
        var namaGuru = String(r.namaGuru || '').trim();
        var mapel = String(r.namaMapel || r.kodeMapel || r.mapel || r.mataPelajaran || '').trim();

        // Field wajib
        if (!hari || !sesi || !kelas || (rawKode === undefined || rawKode === null || rawKode === '') || !namaGuru || !mapel) {
          errors.push('Baris ' + rowNum + ': Field wajib tidak lengkap (Hari, Sesi, Kelas, Kode Guru, Nama Guru, Mata Pelajaran wajib terisi).');
        }

        // Kode guru angka
        if (isNaN(kodeGuru) || kodeGuru <= 0) {
          errors.push('Baris ' + rowNum + ': Kode Guru harus berupa angka bulat positif.');
        }

        // Hari dalam {Sabtu, Ahad, Senin, Selasa, Rabu, Kamis}
        if (validDays.indexOf(hari) === -1) {
          errors.push('Baris ' + rowNum + ': Hari "' + hari + '" tidak valid. Pilihan: ' + validDays.join(', ') + '.');
        }

        // Sesi dalam {Jam I-II, Jam III-IV, Jam V-VI}
        if (validSessions.indexOf(sesi) === -1) {
          errors.push('Baris ' + rowNum + ': Sesi "' + sesi + '" tidak valid. Pilihan: ' + validSessions.join(', ') + '.');
        }

        // TIDAK ada duplikat (hari, sesi, kelas)
        var classKey = hari.toLowerCase() + '|' + sesi.toLowerCase() + '|' + kelas.toLowerCase();
        if (classSlotMap[classKey]) {
          errors.push('Baris ' + rowNum + ': Duplikat slot untuk Kelas ' + kelas + ' pada ' + hari + ' (' + sesi + '). Sudah diisi di baris ' + classSlotMap[classKey] + '.');
        } else {
          classSlotMap[classKey] = rowNum;
        }

        // TIDAK ada guru yang sama di dua kelas pada (hari, sesi) yang sama
        if (!isNaN(kodeGuru) && kodeGuru > 0 && hari && sesi) {
          var teacherKey = hari.toLowerCase() + '|' + sesi.toLowerCase() + '|' + kodeGuru;
          if (teacherSlotMap[teacherKey]) {
            var prevConflict = teacherSlotMap[teacherKey];
            errors.push('Baris ' + rowNum + ': Guru [' + kodeGuru + '] ' + namaGuru + ' mengajar di dua kelas sekaligus (' + prevConflict.kelas + ' dan ' + kelas + ') pada ' + hari + ' (' + sesi + '). Tabrakan dengan baris ' + prevConflict.rowNum + '.');
          } else {
            teacherSlotMap[teacherKey] = { kelas: kelas, rowNum: rowNum };
          }
        }
      }

      if (errors.length > 0) {
        return createJsonResponse({
          status: 'error',
          message: 'Validasi jadwal gagal (' + errors.length + ' kesalahan ditemukan). Seluruh simpanan ditolak.',
          errors: errors
        });
      }

      // Validasi berhasil -> Gunakan LockService
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(30000);
      } catch (lockErr) {
        return createJsonResponse({ status: 'error', message: 'Server sedang sibuk memproses simpan jadwal lain. Coba beberapa saat lagi.' });
      }

      try {
        var jadwalSheet = findSheetFlexible(ss, ['Jadwal_Pelajaran', 'Jadwal Pelajaran', 'Jadwal'], ['jadwal']);
        if (!jadwalSheet) {
          jadwalSheet = ss.insertSheet('Jadwal_Pelajaran');
        }

        var headerCols = [
          'tahun_ajaran', 'semester', 'hari', 'sesi', 'jam_mulai', 'jam_selesai',
          'kelas', 'kode_guru', 'nama_guru', 'kode_mapel', 'nama_mapel'
        ];

        // Baca baris lama di Jadwal_Pelajaran
        var oldValues = jadwalSheet.getDataRange().getValues();
        var matchingOldRows = [];
        var otherTermRows = [];

        if (oldValues.length > 1) {
          var hRow = oldValues[0].map(function(h) { return String(h).toLowerCase().trim().replace(/[\\s\\-]+/g, '_'); });
          var cTahun = hRow.findIndex(function(h) { return h.indexOf('tahun') > -1; });
          var cSem = hRow.findIndex(function(h) { return h.indexOf('semester') > -1; });
          if (cTahun === -1) cTahun = 0;
          if (cSem === -1) cSem = 1;

          for (var r = 1; r < oldValues.length; r++) {
            var rowVals = oldValues[r];
            var isAllEmpty = true;
            for (var c = 0; c < rowVals.length; c++) {
              if (rowVals[c] && String(rowVals[c]).trim() !== '') {
                isAllEmpty = false;
                break;
              }
            }
            if (isAllEmpty) continue;

            var rTahun = String(rowVals[cTahun] || '').trim();
            var rSem = String(rowVals[cSem] || '').trim();

            if (rTahun.toLowerCase() === tahunAjaran.toLowerCase() && rSem.toLowerCase() === semester.toLowerCase()) {
              matchingOldRows.push(rowVals);
            } else {
              otherTermRows.push(rowVals);
            }
          }
        }

        // Arsipkan baris lama semester itu ke sheet 'Jadwal_Riwayat'
        // (kolom yang sama + diarsipkan_pada + oleh)
        if (matchingOldRows.length > 0) {
          var riwayatSheet = findSheetFlexible(ss, ['Jadwal_Riwayat'], ['riwayat']);
          if (!riwayatSheet) {
            riwayatSheet = ss.insertSheet('Jadwal_Riwayat');
          }
          if (riwayatSheet.getLastRow() === 0) {
            riwayatSheet.appendRow([
              'tahun_ajaran', 'semester', 'hari', 'sesi', 'jam_mulai', 'jam_selesai',
              'kelas', 'kode_guru', 'nama_guru', 'kode_mapel', 'nama_mapel',
              'diarsipkan_pada', 'oleh'
            ]);
          }

          var archiveStamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
          var archiveRows = [];
          for (var a = 0; a < matchingOldRows.length; a++) {
            var oldR = matchingOldRows[a];
            var row11 = [];
            for (var colIdx = 0; colIdx < 11; colIdx++) {
              row11.push(oldR[colIdx] !== undefined ? oldR[colIdx] : '');
            }
            row11.push(archiveStamp);
            row11.push(authRole);
            archiveRows.push(row11);
          }
          var lastArchiveRow = riwayatSheet.getLastRow();
          riwayatSheet.getRange(lastArchiveRow + 1, 1, archiveRows.length, 13).setValues(archiveRows);
        }

        // Siapkan baris baru dengan 11 kolom:
        // tahun_ajaran, jam_mulai, jam_selesai ditulis sebagai teks (awalan apostrof)
        var newFormattedRows = [];
        for (var s = 0; s < rows.length; s++) {
          var item = rows[s];
          var jMulai = String(item.jamMulai || '').trim();
          var jSelesai = String(item.jamSelesai || '').trim();
          if ((!jMulai || !jSelesai) && item.jam) {
            var p = String(item.jam).split('-');
            if (p.length === 2) {
              if (!jMulai) jMulai = p[0].trim().replace('.', ':');
              if (!jSelesai) jSelesai = p[1].trim().replace('.', ':');
            }
          }
          if (!jMulai || !jSelesai) {
            var sLabel = String(item.sesi || '').toLowerCase();
            if (sLabel.indexOf('i-ii') > -1) { jMulai = '07:30'; jSelesai = '08:30'; }
            else if (sLabel.indexOf('iii-iv') > -1) { jMulai = '08:30'; jSelesai = '09:30'; }
            else if (sLabel.indexOf('v-vi') > -1) { jMulai = '10:00'; jSelesai = '11:00'; }
          }

          var mapelName = String(item.namaMapel || item.mapel || item.mataPelajaran || item.kodeMapel || '-').trim();
          var mapelCode = String(item.kodeMapel || item.mapel || item.namaMapel || '-').trim();

          newFormattedRows.push([
            "'" + tahunAjaran,
            semester,
            String(item.hari || '').trim(),
            String(item.sesi || '').trim(),
            "'" + jMulai,
            "'" + jSelesai,
            String(item.kelas || '').trim(),
            parseInt(item.kodeGuru, 10),
            String(item.namaGuru || '').trim(),
            mapelCode,
            mapelName
          ]);
        }

        // Gabungkan baris term lain yang tidak disentuh + baris baru term ini
        var allRowsToWrite = [headerCols];
        for (var o = 0; o < otherTermRows.length; o++) {
          var oRow = otherTermRows[o];
          var oRow11 = [];
          for (var cI = 0; cI < 11; cI++) {
            oRow11.push(oRow[cI] !== undefined ? oRow[cI] : '');
          }
          allRowsToWrite.push(oRow11);
        }
        for (var n = 0; n < newFormattedRows.length; n++) {
          allRowsToWrite.push(newFormattedRows[n]);
        }

        // Tulis sekaligus dengan setValues (batch, bukan satu per satu)
        jadwalSheet.clearContents();
        jadwalSheet.getRange(1, 1, allRowsToWrite.length, 11).setValues(allRowsToWrite);

        // Catat ke sheet 'Jadwal_Log' (waktu, peran, tahunAjaran, semester, jumlah baris, catatan)
        var logJadwalSheet = findSheetFlexible(ss, ['Jadwal_Log'], ['jadwal_log', 'log_jadwal']);
        if (!logJadwalSheet) {
          logJadwalSheet = ss.insertSheet('Jadwal_Log');
        }
        if (logJadwalSheet.getLastRow() === 0) {
          logJadwalSheet.appendRow(['waktu', 'peran', 'tahun_ajaran', 'semester', 'jumlah_baris', 'catatan']);
        }
        var logStamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
        logJadwalSheet.appendRow([
          logStamp,
          authRole,
          "'" + tahunAjaran,
          semester,
          rows.length,
          catatan || '-'
        ]);

        return createJsonResponse({
          status: 'success',
          message: 'Jadwal Pelajaran berhasil disimpan (' + rows.length + ' baris untuk ' + tahunAjaran + ' ' + semester + '). Baris lama diarsipkan ke Jadwal_Riwayat.',
          count: rows.length
        });
      } finally {
        lock.releaseLock();
      }

    } else if (action === 'getJadwal') {
      var jResult = getJadwalData(ss);
      return createJsonResponse({
        status: 'success',
        rows: jResult.rows,
        jadwal: jResult.rows,
        jadwalAktif: jResult.jadwalAktif,
        terms: jResult.terms
      });

    } else if (action === 'setJadwalAktif') {
      var authRole = null;
      try {
        authRole = checkPin(payload.pin);
      } catch (err) {
        return createJsonResponse({ status: 'error', message: err.message || String(err) });
      }
      if (authRole !== 'admin' && authRole !== 'kurikulum') {
        return createJsonResponse({ status: 'error', message: 'Akses ditolak: PIN tidak valid untuk mengatur term aktif.' });
      }

      var thn = String(payload.tahunAjaran || '').trim();
      var sem = String(payload.semester || '').trim();
      if (!thn || !sem) {
        return createJsonResponse({ status: 'error', message: 'Tahun Ajaran dan Semester wajib diisi.' });
      }

      var settingsSheet = findSheetFlexible(ss, ['Pengaturan_Aplikasi', 'Pengaturan Aplikasi', 'Pengaturan', 'Settings'], ['pengaturan', 'setting']);
      if (!settingsSheet) {
        settingsSheet = ss.insertSheet('Pengaturan_Aplikasi');
        settingsSheet.appendRow(['Key', 'Value']);
      }

      var sRows = settingsSheet.getDataRange().getValues();
      var foundThn = false;
      var foundSem = false;
      for (var sr = 1; sr < sRows.length; sr++) {
        var k = String(sRows[sr][0] || '').trim();
        if (k === 'jadwalTahunAjaran') {
          settingsSheet.getRange(sr + 1, 2).setValue("'" + thn);
          foundThn = true;
        } else if (k === 'jadwalSemester') {
          settingsSheet.getRange(sr + 1, 2).setValue("'" + sem);
          foundSem = true;
        }
      }
      if (!foundThn) {
        settingsSheet.appendRow(['jadwalTahunAjaran', "'" + thn]);
      }
      if (!foundSem) {
        settingsSheet.appendRow(['jadwalSemester', "'" + sem]);
      }

      return createJsonResponse({
        status: 'success',
        message: 'Term aktif jadwal berhasil diatur ke ' + thn + ' ' + sem + '.',
        jadwalAktif: { tahunAjaran: thn, semester: sem }
      });
    } else if (action === 'saveSettings') {
      var newSettings = payload.settings || payload.data || {};
      var settingsSheet = findSheetFlexible(ss, ['Pengaturan_Aplikasi', 'Pengaturan Aplikasi', 'Pengaturan', 'Settings'], ['pengaturan', 'setting']);
      if (!settingsSheet) {
        settingsSheet = ss.insertSheet('Pengaturan_Aplikasi');
      }
      settingsSheet.clearContents();
      settingsSheet.appendRow(['Key', 'Value']);
      var keys = Object.keys(newSettings);
      for (var s = 0; s < keys.length; s++) {
        var key = keys[s];
        // Jangan pernah simpan webAppUrl atau adminPin ke Sheets
        if (key !== 'webAppUrl' && key !== 'adminPin') {
          var rawVal = newSettings[key];
          if (rawVal === undefined || rawVal === null) continue;
          var val = (typeof rawVal === 'object') ? JSON.stringify(rawVal) : String(rawVal);
          // koordinat disimpan sebagai teks agar tidak rusak oleh locale Indonesia
          if (key === 'jamMasukThreshold' || key === 'schoolLatitude' || key === 'schoolLongitude') {
            settingsSheet.appendRow([key, "'" + val]);
          } else {
            settingsSheet.appendRow([key, val]);
          }
        }
      }
      return createJsonResponse({ status: 'success', message: 'Pengaturan berhasil disimpan di Google Sheets.' });
    } else if (action === 'saveCuti') {
      var cData = payload.data || payload;
      if (!cData || !cData.nama || !cData.tanggalMulai || !cData.tanggalSelesai) {
        return createJsonResponse({ status: 'error', message: 'Field Nama, Tanggal Mulai, dan Tanggal Selesai cuti wajib diisi.' });
      }

      var cutiLock = LockService.getScriptLock();
      try {
        cutiLock.waitLock(30000);
      } catch (lockErr) {
        return createJsonResponse({ status: 'error', message: 'Server sedang sibuk. Coba beberapa saat lagi.' });
      }

      try {
        var cutiSheet = ensureCutiSheet(ss);
        var cutiId = String(cData.id || ('CUTI-REC-' + Date.now())).trim();
        var rowVals = [
          cutiId,
          String(cData.waktuPengajuan || Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')),
          String(cData.nama).trim(),
          String(cData.jabatan || '-').trim(),
          String(cData.peran || '-').trim(),
          String(cData.jenisCuti || 'Cuti').trim(),
          "'" + String(cData.tanggalMulai).trim(),
          "'" + String(cData.tanggalSelesai).trim(),
          Number(cData.jumlahHariEfektif) || 1,
          String(cData.cakupan || 'wajib_hadir').trim(),
          String(cData.guruPengganti || '-').trim() || '-',
          String(cData.nomorSurat || '-').trim() || '-',
          String(cData.catatan || '-').trim() || '-',
          String(cData.statusPengajuan || 'Aktif').trim()
        ];

        var existingRows = cutiSheet.getDataRange().getValues();
        var targetCutiRow = -1;
        for (var ci = 1; ci < existingRows.length; ci++) {
          if (String(existingRows[ci][0] || '').trim() === cutiId) {
            targetCutiRow = ci + 1;
            break;
          }
        }

        if (targetCutiRow > -1) {
          cutiSheet.getRange(targetCutiRow, 1, 1, 14).setValues([rowVals]);
        } else {
          cutiSheet.appendRow(rowVals);
        }

        return createJsonResponse({
          status: 'success',
          message: 'Data pengajuan cuti berhasil disimpan ke sheet Data_Cuti.',
          id: cutiId
        });
      } finally {
        cutiLock.releaseLock();
      }
    } else if (action === 'deleteCuti') {
      var delId = String(payload.id || '').trim();
      var alsoDeleteLogs = payload.alsoDeleteLogs === true;
      var delNama = String(payload.nama || '').trim().toLowerCase();
      var delStart = String(payload.tanggalMulai || '').trim();
      var delEnd = String(payload.tanggalSelesai || '').trim();

      var delLock = LockService.getScriptLock();
      try {
        delLock.waitLock(30000);
      } catch (lockErr) {
        return createJsonResponse({ status: 'error', message: 'Server sedang sibuk. Coba beberapa saat lagi.' });
      }

      try {
        var cutiSheetDel = findSheetFlexible(ss, ['Data_Cuti', 'Data Cuti'], ['cuti']);
        var deletedCutiRows = 0;
        if (cutiSheetDel && delId) {
          var cRows = cutiSheetDel.getDataRange().getValues();
          for (var cr = cRows.length - 1; cr >= 1; cr--) {
            if (String(cRows[cr][0] || '').trim() === delId) {
              cutiSheetDel.deleteRow(cr + 1);
              deletedCutiRows++;
            }
          }
        }

        var deletedLogRows = 0;
        if (alsoDeleteLogs && delNama && delStart && delEnd) {
          var logSheetDel = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
          if (logSheetDel) {
            var lRows = logSheetDel.getDataRange().getValues();
            for (var lr = lRows.length - 1; lr >= 1; lr--) {
              var lNama = String(lRows[lr][4] || '').trim().toLowerCase();
              var lTgl = formatDate(lRows[lr][2]).trim();
              var lSt = String(lRows[lr][8] || '').trim().toLowerCase();
              if (lNama === delNama && lSt === 'cuti' && lTgl >= delStart && lTgl <= delEnd) {
                logSheetDel.deleteRow(lr + 1);
                deletedLogRows++;
              }
            }
          }
        }

        return createJsonResponse({
          status: 'success',
          message: 'Data cuti berhasil dihapus (' + deletedCutiRows + ' catatan cuti, ' + deletedLogRows + ' baris Log_Presensi).',
          deletedCutiRows: deletedCutiRows,
          deletedLogRows: deletedLogRows
        });
      } finally {
        delLock.releaseLock();
      }
    } else if (action === 'batchSaveCuti') {
      var records = payload.records || payload.data || [];
      if (!Array.isArray(records) || records.length === 0) {
        return createJsonResponse({ status: 'error', message: 'Tidak ada data cuti untuk disinkronkan.' });
      }
      var bCutiLock = LockService.getScriptLock();
      try {
        bCutiLock.waitLock(30000);
      } catch (lockErr) {
        return createJsonResponse({ status: 'error', message: 'Server sedang sibuk. Coba beberapa saat lagi.' });
      }
      try {
        var bCutiSheet = ensureCutiSheet(ss);
        var existCuti = bCutiSheet.getDataRange().getValues();
        var existIdMap = {};
        var existSigMap = {};
        for (var ei = 1; ei < existCuti.length; ei++) {
          var eId = String(existCuti[ei][0] || '').trim();
          var eNama = String(existCuti[ei][2] || '').trim().toLowerCase();
          var eMulai = formatDate(existCuti[ei][6]).trim();
          var eSelesai = formatDate(existCuti[ei][7]).trim();
          if (eId) existIdMap[eId] = ei + 1;
          if (eNama && eMulai) existSigMap[eNama + '|' + eMulai + '|' + eSelesai] = ei + 1;
        }
        var bAppend = [];
        var bUpdated = 0;
        for (var bi = 0; bi < records.length; bi++) {
          var rec = records[bi];
          if (!rec || !rec.nama || !rec.tanggalMulai) continue;
          var rId = String(rec.id || ('CUTI-REC-' + Date.now() + '-' + bi)).trim();
          var rMulai = String(rec.tanggalMulai).trim();
          var rSelesai = String(rec.tanggalSelesai || rMulai).trim();
          var rSig = String(rec.nama).trim().toLowerCase() + '|' + rMulai + '|' + rSelesai;
          var rowArr = [
            rId,
            String(rec.waktuPengajuan || Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')),
            String(rec.nama).trim(),
            String(rec.jabatan || '-').trim(),
            String(rec.peran || '-').trim(),
            String(rec.jenisCuti || 'Cuti').trim(),
            "'" + rMulai,
            "'" + rSelesai,
            Number(rec.jumlahHariEfektif) || 1,
            String(rec.cakupan || 'wajib_hadir').trim(),
            String(rec.guruPengganti || '-').trim() || '-',
            String(rec.nomorSurat || '-').trim() || '-',
            String(rec.catatan || '-').trim() || '-',
            String(rec.statusPengajuan || 'Aktif').trim()
          ];
          var targetR = existIdMap[rId] || existSigMap[rSig] || -1;
          if (targetR > -1) {
            bCutiSheet.getRange(targetR, 1, 1, 14).setValues([rowArr]);
            bUpdated++;
          } else {
            bAppend.push(rowArr);
            existIdMap[rId] = 999999;
            existSigMap[rSig] = 999999;
          }
        }
        if (bAppend.length > 0) {
          var startCRow = Math.max(bCutiSheet.getLastRow(), 1) + 1;
          bCutiSheet.getRange(startCRow, 1, bAppend.length, 14).setValues(bAppend);
        }
        return createJsonResponse({
          status: 'success',
          message: 'Sinkronisasi Data_Cuti selesai: ' + bAppend.length + ' ditambahkan, ' + bUpdated + ' diperbarui.',
          inserted: bAppend.length,
          updated: bUpdated
        });
      } finally {
        bCutiLock.releaseLock();
      }
    }
    
    return createJsonResponse({ status: 'error', message: 'Aksi tidak dikenali.' });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * Jalankan fungsi ini secara manual di editor Apps Script (tombol Run/Jalankan)
 * untuk membuat seluruh sheet (termasuk Data_Cuti) dan memigrasikan data cuti dari Log_Presensi.
 */
function setupDanCekDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet aktif tidak ditemukan. Buka Apps Script melalui Google Sheet: Ekstensi > Apps Script.');
  }
  ensureSheets(ss);
  var cutiList = getCutiData(ss);
  var logList = getLogData(ss);
  Logger.log('=== CEK DATABASE PRESENSI ===');
  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Jumlah Log_Presensi: ' + logList.length);
  Logger.log('Jumlah Data_Cuti: ' + cutiList.length);
  return {
    spreadsheet: ss.getName(),
    logsCount: logList.length,
    cutiCount: cutiList.length
  };
}

function findSheetFlexible(ss, targetNames, keywords) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  if (!ss) {
    return null;
  }
  for (var i = 0; i < targetNames.length; i++) {
    var sh = ss.getSheetByName(targetNames[i]);
    if (sh) return sh;
  }
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var name = sheets[s].getName().toLowerCase();
    for (var k = 0; k < keywords.length; k++) {
      if (name.indexOf(keywords[k].toLowerCase()) > -1) {
        return sheets[s];
      }
    }
  }
  return null;
}

function ensureSheets(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  var masterSheet = findSheetFlexible(ss, ['Master_Guru_Staf', 'Master Guru Staf', 'Master', 'Guru', 'Staf'], ['master', 'guru']);
  if (!masterSheet) {
    masterSheet = ss.insertSheet('Master_Guru_Staf');
    masterSheet.appendRow([
      'No', 'Nama (Guru dan Staf)', 'Jabatan Struktural', 
      'Mapel Diampu - Sabtu', 'Mapel Diampu - Ahad', 'Mapel Diampu - Senin', 
      'Mapel Diampu - Selasa', 'Mapel Diampu - Rabu', 'Mapel Diampu - Kamis',
      'Kode Guru', 'Peran Presensi'
    ]);
  }
  
  var logSheet = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
  if (!logSheet) {
    logSheet = ss.insertSheet('Log_Presensi');
    logSheet.appendRow([
      'ID', 'Timestamp', 'Tanggal', 'Hari', 'Nama', 
      'Jabatan', 'Mapel Diampu Hari Ini', 'Jam Datang', 'Status', 'Keterangan',
      'Peran', 'Batas Staf', 'Status Staf', 'Batas Mengajar', 'Status Mengajar'
    ]);
  } else {
    ensureLogHeaders(logSheet);
  }

  var jadwalSheet = findSheetFlexible(ss, ['Jadwal_Pelajaran', 'Jadwal Pelajaran', 'Jadwal'], ['jadwal']);
  if (!jadwalSheet) {
    jadwalSheet = ss.insertSheet('Jadwal_Pelajaran');
    jadwalSheet.appendRow([
      'tahun_ajaran', 'semester', 'hari', 'sesi', 'jam_mulai', 'jam_selesai',
      'kelas', 'kode_guru', 'nama_guru', 'kode_mapel', 'nama_mapel'
    ]);
  }

  var settingsSheet = findSheetFlexible(ss, ['Pengaturan_Aplikasi', 'Pengaturan Aplikasi', 'Pengaturan', 'Settings'], ['pengaturan', 'setting']);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet('Pengaturan_Aplikasi');
    settingsSheet.appendRow(['Key', 'Value']);
  }

  ensureCutiSheet(ss);
}

function ensureCutiSheet(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  var cutiSheet = findSheetFlexible(ss, ['Data_Cuti', 'Data Cuti'], ['cuti']);
  if (!cutiSheet) {
    cutiSheet = ss.insertSheet('Data_Cuti');
    cutiSheet.appendRow([
      'ID Cuti', 'Waktu Pengajuan', 'Nama', 'Jabatan', 'Peran',
      'Jenis Cuti', 'Tanggal Mulai', 'Tanggal Selesai', 'Jumlah Hari Efektif',
      'Cakupan', 'Guru Pengganti', 'Nomor Surat', 'Catatan', 'Status Pengajuan'
    ]);
  }
  if (cutiSheet.getLastRow() <= 1) {
    backfillCutiFromLogs(ss, cutiSheet);
  }
  return cutiSheet;
}

function backfillCutiFromLogs(ss, cutiSheet) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return 0;
  if (!cutiSheet) {
    cutiSheet = findSheetFlexible(ss, ['Data_Cuti', 'Data Cuti'], ['cuti']);
  }
  if (!cutiSheet || cutiSheet.getLastRow() > 1) return 0;

  var logs = getLogData(ss);
  var cutiLogs = [];
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i].status || '').trim().toLowerCase() === 'cuti') {
      cutiLogs.push(logs[i]);
    }
  }
  if (cutiLogs.length === 0) return 0;

  var groups = {};
  var groupKeys = [];
  for (var j = 0; j < cutiLogs.length; j++) {
    var l = cutiLogs[j];
    var ket = String(l.keterangan || '').trim();
    var gKey = String(l.nama || '').trim().toLowerCase() + '||' + ket;
    if (!groups[gKey]) {
      groups[gKey] = [];
      groupKeys.push(gKey);
    }
    groups[gKey].push(l);
  }

  var rowsToInsert = [];
  for (var g = 0; g < groupKeys.length; g++) {
    var list = groups[groupKeys[g]];
    list.sort(function(a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); });
    var first = list[0];
    var last = list[list.length - 1];
    var fKet = String(first.keterangan || '').trim();
    var jenisMatch = fKet.match(/^\\[([^\\]]+)\\]/);
    var jenisCuti = jenisMatch ? jenisMatch[1].trim() : 'Cuti';
    var penggantiMatch = fKet.match(/Pengganti\\/Tugas:\\s*([^•]+)/i);
    var suratMatch = fKet.match(/Surat:\\s*([^•]+)/i);
    var catatanMatch = fKet.match(/Ket:\\s*([^•]+)/i);
    var autoId = 'CUTI-MIG-' + (g + 1) + '-' + String(first.tanggal || '').replace(/[^\\d]/g, '');

    rowsToInsert.push([
      autoId,
      String(first.timestamp || (first.tanggal + ' 07:00:00')),
      String(first.nama || '').trim(),
      String(first.jabatan || '-').trim(),
      String(first.peran || 'Guru').trim(),
      jenisCuti,
      "'" + String(first.tanggal || '').trim(),
      "'" + String(last.tanggal || first.tanggal || '').trim(),
      list.length,
      list.length > 1 ? 'wajib_hadir' : 'harian',
      penggantiMatch ? penggantiMatch[1].trim() : '-',
      suratMatch ? suratMatch[1].trim() : '-',
      catatanMatch ? catatanMatch[1].trim() : (jenisMatch ? '-' : (fKet || '-')),
      'Aktif'
    ]);
  }

  if (rowsToInsert.length > 0) {
    cutiSheet.getRange(2, 1, rowsToInsert.length, 14).setValues(rowsToInsert);
  }
  return rowsToInsert.length;
}

function ensureStatusDropdownValidation(sheet, statusCol) {
  if (!sheet) return;
  var col = statusCol || 9;
  var defaultStatuses = [
    'Tepat Waktu',
    'Terlambat',
    'Izin',
    'Sakit',
    'Cuti',
    'Dinas Luar',
    'Alpa',
    'Alpa (Jadwal Mengajar)',
    'Alpa (Wajib Hadir Staf)',
    'Alpa (Wajib Hadir Guru BK)'
  ];
  var maxDataRow = Math.max(sheet.getMaxRows(), 500);
  var sampleCell = sheet.getRange(2, col, 1, 1);
  var existingRule = sampleCell.getDataValidation();
  if (existingRule && existingRule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    var args = existingRule.getCriteriaValues();
    var existingList = Array.isArray(args[0]) ? args[0] : [];
    var hasCuti = existingList.some(function(v) { return String(v).trim().toLowerCase() === 'cuti'; });
    var hasBkAlpa = existingList.some(function(v) { return String(v).trim().toLowerCase() === 'alpa (wajib hadir guru bk)'; });
    if (hasCuti && hasBkAlpa && existingRule.getAllowInvalid()) {
      return;
    }
    var merged = [];
    var seen = {};
    for (var i = 0; i < existingList.length; i++) {
      var item = String(existingList[i] || '').trim();
      if (item && !seen[item.toLowerCase()]) {
        seen[item.toLowerCase()] = true;
        merged.push(item);
      }
    }
    for (var j = 0; j < defaultStatuses.length; j++) {
      var def = defaultStatuses[j];
      if (!seen[def.toLowerCase()]) {
        seen[def.toLowerCase()] = true;
        merged.push(def);
      }
    }
    var updatedRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(merged, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, col, maxDataRow - 1, 1).setDataValidation(updatedRule);
  } else if (!existingRule) {
    var newRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(defaultStatuses, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, col, maxDataRow - 1, 1).setDataValidation(newRule);
  }
}

function ensureLogHeaders(sheet) {
  if (!sheet) return;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'ID', 'Timestamp', 'Tanggal', 'Hari', 'Nama',
      'Jabatan', 'Mapel Diampu Hari Ini', 'Jam Datang', 'Status', 'Keterangan',
      'Peran', 'Batas Staf', 'Status Staf', 'Batas Mengajar', 'Status Mengajar'
    ]);
    ensureStatusDropdownValidation(sheet, 9);
    return;
  }
  var lastCol = sheet.getLastColumn();
  var numColsToCheck = Math.max(lastCol, 15);
  var headerValues = sheet.getRange(1, 1, 1, numColsToCheck).getDisplayValues()[0];
  var newHeaders = ['Peran', 'Batas Staf', 'Status Staf', 'Batas Mengajar', 'Status Mengajar'];
  for (var c = 0; c < 5; c++) {
    var colIdx = 10 + c; // 10 is 0-indexed column 11 (K)
    if (!headerValues[colIdx] || String(headerValues[colIdx]).trim() === '') {
      sheet.getRange(1, colIdx + 1).setValue(newHeaders[c]);
    }
  }
  var statusCol1Based = 9;
  for (var hc = 0; hc < headerValues.length; hc++) {
    var hText = String(headerValues[hc] || '').toLowerCase().trim();
    if (hText.indexOf('status') > -1 && hText.indexOf('staf') === -1 && hText.indexOf('ajar') === -1) {
      statusCol1Based = hc + 1;
      break;
    }
  }
  ensureStatusDropdownValidation(sheet, statusCol1Based);
}

function checkPin(pin) {
  var props = PropertiesService.getScriptProperties();
  var pinAdmin = props.getProperty('PIN_ADMIN');
  var pinKurikulum = props.getProperty('PIN_KURIKULUM');

  if (!pinAdmin && !pinKurikulum) {
    throw new Error('PIN server belum diatur di Script Properties');
  }

  var cache = CacheService.getScriptCache();
  var lockKey = 'PIN_LOCKOUT_UNTIL';
  var failKey = 'PIN_FAIL_COUNT';

  var isLocked = cache.get(lockKey);
  if (isLocked) {
    throw new Error('Terlalu banyak percobaan PIN salah (5 kali). Percobaan ditolak selama 10 menit demi keamanan.');
  }

  var inputPin = (pin !== undefined && pin !== null) ? String(pin).trim() : '';
  if (!inputPin) {
    return null;
  }

  var adminPinTrimmed = pinAdmin ? String(pinAdmin).trim() : '';
  var kurikulumPinTrimmed = pinKurikulum ? String(pinKurikulum).trim() : '';

  if (adminPinTrimmed && inputPin === adminPinTrimmed) {
    cache.remove(failKey);
    return 'admin';
  }

  if (kurikulumPinTrimmed && inputPin === kurikulumPinTrimmed) {
    cache.remove(failKey);
    return 'kurikulum';
  }

  // PIN salah: catat ke cache anti-tebak
  var fails = parseInt(cache.get(failKey) || '0', 10) + 1;
  if (fails >= 5) {
    cache.put(lockKey, 'LOCKED', 600); // 10 menit
    cache.remove(failKey);
    throw new Error('Terlalu banyak percobaan PIN salah (5 kali). Percobaan ditolak selama 10 menit.');
  } else {
    cache.put(failKey, String(fails), 600);
    return null;
  }
}

function getSettingsData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  var sheet = findSheetFlexible(ss, ['Pengaturan_Aplikasi', 'Pengaturan Aplikasi', 'Pengaturan', 'Settings'], ['pengaturan', 'setting']);
  if (!sheet) return null;
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return null;
  var tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  var obj = {};
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    var v = rows[i][1];
    if (v instanceof Date) {
      v = Utilities.formatDate(v, tz, 'HH:mm');
    } else {
      v = String(v || '').trim();
    }
    // PIN divalidasi HANYA di server Apps Script, tidak boleh dikembalikan dari Sheets
    if (k && k !== 'adminPin' && k !== 'PIN_ADMIN' && k !== 'PIN_KURIKULUM') {
      obj[k] = v;
    }
  }
  return obj;
}

function getMasterData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  var sheet = findSheetFlexible(ss, ['Master_Guru_Staf', 'Master Guru Staf', 'Master', 'Guru', 'Staf', 'Data Guru'], ['master', 'guru', 'staf']);
  if (!sheet && ss.getSheets().length > 0) sheet = ss.getSheets()[0];
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var displayRows = sheet.getDataRange().getDisplayValues();
  if (rows.length <= 1) return [];

  var headerRow = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colNo = headerRow.findIndex(function(h) { return h === 'no'; });
  var colNama = headerRow.findIndex(function(h) { return h.indexOf('nama') > -1; });
  var colJabatan = headerRow.findIndex(function(h) { return h.indexOf('jabatan') > -1; });

  var colSabtu = headerRow.findIndex(function(h) { return h.indexOf('sabtu') > -1; });
  var colAhad = headerRow.findIndex(function(h) { return h.indexOf('ahad') > -1 || h.indexOf('minggu') > -1; });
  var colSenin = headerRow.findIndex(function(h) { return h.indexOf('senin') > -1; });
  var colSelasa = headerRow.findIndex(function(h) { return h.indexOf('selasa') > -1; });
  var colRabu = headerRow.findIndex(function(h) { return h.indexOf('rabu') > -1; });
  var colKamis = headerRow.findIndex(function(h) { return h.indexOf('kamis') > -1; });
  var colKodeGuru = headerRow.findIndex(function(h) { return h.indexOf('kode guru') > -1; });
  var colPeran = headerRow.findIndex(function(h) { return h.indexOf('peran') > -1; });

  if (colNama === -1) colNama = 1;
  if (colJabatan === -1) colJabatan = 2;
  if (colNo === -1) colNo = 0;

  if (colSabtu === -1) colSabtu = 3;
  if (colAhad === -1) colAhad = 4;
  if (colSenin === -1) colSenin = 5;
  if (colSelasa === -1) colSelasa = 6;
  if (colRabu === -1) colRabu = 7;
  if (colKamis === -1) colKamis = 8;

  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = displayRows[i] || rows[i];
    var namaVal = r[colNama] !== undefined ? String(r[colNama]).trim() : '';
    if (namaVal && namaVal.toLowerCase() !== 'nama' && namaVal.toLowerCase() !== 'nama (guru dan staf)') {
      var rawKodeGuru = colKodeGuru > -1 && r[colKodeGuru] !== undefined ? String(r[colKodeGuru]).trim() : '';
      var numKodeGuru = rawKodeGuru ? parseInt(rawKodeGuru, 10) : '';
      if (typeof numKodeGuru === 'number' && isNaN(numKodeGuru)) numKodeGuru = '';
      var peranVal = colPeran > -1 && r[colPeran] !== undefined ? String(r[colPeran]).trim() : '';

      result.push({
        no: r[colNo] || i,
        nama: namaVal,
        jabatan: String(r[colJabatan] || '-'),
        kodeGuru: numKodeGuru,
        peran: peranVal,
        mapelSabtu: String(r[colSabtu] || '-'),
        mapelAhad: String(r[colAhad] || '-'),
        mapelSenin: String(r[colSenin] || '-'),
        mapelSelasa: String(r[colSelasa] || '-'),
        mapelRabu: String(r[colRabu] || '-'),
        mapelKamis: String(r[colKamis] || '-')
      });
    }
  }
  return result;
}

function getJadwalData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return { rows: [], jadwalAktif: null, terms: [] };
  var sheet = findSheetFlexible(ss, ['Jadwal_Pelajaran', 'Jadwal Pelajaran', 'Jadwal'], ['jadwal']);
  var settings = getSettingsData(ss) || {};
  var activeYear = settings.jadwalTahunAjaran ? String(settings.jadwalTahunAjaran).trim() : '';
  var activeSem = settings.jadwalSemester ? String(settings.jadwalSemester).trim() : '';

  if (!sheet) {
    return {
      rows: [],
      jadwalAktif: activeYear && activeSem ? { tahunAjaran: activeYear, semester: activeSem } : null,
      terms: []
    };
  }

  var displayRows = sheet.getDataRange().getDisplayValues();
  if (displayRows.length <= 1) {
    return {
      rows: [],
      jadwalAktif: activeYear && activeSem ? { tahunAjaran: activeYear, semester: activeSem } : null,
      terms: []
    };
  }

  var headerRow = displayRows[0].map(function(h) { 
    return String(h).toLowerCase().trim().replace(/[\\s\\-]+/g, '_'); 
  });

  var colTahun = headerRow.findIndex(function(h) { return h.indexOf('tahun') > -1; });
  var colSemester = headerRow.findIndex(function(h) { return h.indexOf('semester') > -1; });
  var colHari = headerRow.findIndex(function(h) { return h.indexOf('hari') > -1; });
  var colSesi = headerRow.findIndex(function(h) { return h.indexOf('sesi') > -1; });
  var colJamMulai = headerRow.findIndex(function(h) { return h.indexOf('jam_mulai') > -1 || h.indexOf('mulai') > -1; });
  var colJamSelesai = headerRow.findIndex(function(h) { return h.indexOf('jam_selesai') > -1 || h.indexOf('selesai') > -1; });
  var colKelas = headerRow.findIndex(function(h) { return h.indexOf('kelas') > -1; });
  var colKodeGuru = headerRow.findIndex(function(h) { return h.indexOf('kode_guru') > -1 || h.indexOf('kodeguru') > -1; });
  var colNamaGuru = headerRow.findIndex(function(h) { return h.indexOf('nama_guru') > -1 || h.indexOf('guru') > -1; });
  var colKodeMapel = headerRow.findIndex(function(h) { return h.indexOf('kode_mapel') > -1 || h.indexOf('kodemapel') > -1; });
  var colNamaMapel = headerRow.findIndex(function(h) { return h.indexOf('nama_mapel') > -1 || h.indexOf('mapel') > -1; });

  var rows = [];
  var termMap = {};
  var terms = [];

  for (var i = 1; i < displayRows.length; i++) {
    var r = displayRows[i];
    var isAllEmpty = true;
    for (var k = 0; k < r.length; k++) {
      if (r[k] && String(r[k]).trim() !== '') {
        isAllEmpty = false;
        break;
      }
    }
    if (isAllEmpty) continue;

    var rawKodeGuru = colKodeGuru > -1 && r[colKodeGuru] !== undefined ? String(r[colKodeGuru]).trim() : '';
    var parsedKode = rawKodeGuru ? parseInt(rawKodeGuru, 10) : 0;
    if (isNaN(parsedKode)) parsedKode = 0;

    var rTahun = colTahun > -1 && r[colTahun] !== undefined ? String(r[colTahun]).trim() : '';
    var rSem = colSemester > -1 && r[colSemester] !== undefined ? String(r[colSemester]).trim() : '';
    var jMulai = colJamMulai > -1 && r[colJamMulai] !== undefined ? String(r[colJamMulai]).trim() : '';
    var jSelesai = colJamSelesai > -1 && r[colJamSelesai] !== undefined ? String(r[colJamSelesai]).trim() : '';
    var kMapel = colKodeMapel > -1 && r[colKodeMapel] !== undefined ? String(r[colKodeMapel]).trim() : '';
    var nMapel = colNamaMapel > -1 && r[colNamaMapel] !== undefined ? String(r[colNamaMapel]).trim() : '';

    if (rTahun && rSem) {
      var tKey = rTahun.toLowerCase() + '|' + rSem.toLowerCase();
      if (!termMap[tKey]) {
        termMap[tKey] = true;
        terms.push({ tahunAjaran: rTahun, semester: rSem });
      }
    }

    rows.push({
      tahunAjaran: rTahun,
      semester: rSem,
      hari: colHari > -1 && r[colHari] !== undefined ? String(r[colHari]).trim() : '',
      sesi: colSesi > -1 && r[colSesi] !== undefined ? String(r[colSesi]).trim() : '',
      jamMulai: jMulai,
      jamSelesai: jSelesai,
      jam: (jMulai && jSelesai) ? (jMulai + ' - ' + jSelesai) : '',
      kelas: colKelas > -1 && r[colKelas] !== undefined ? String(r[colKelas]).trim() : '',
      kodeGuru: parsedKode,
      namaGuru: colNamaGuru > -1 && r[colNamaGuru] !== undefined ? String(r[colNamaGuru]).trim() : '',
      kodeMapel: kMapel || nMapel || '-',
      namaMapel: nMapel || kMapel || '-'
    });
  }

  var finalActiveTerm = null;
  if (activeYear && activeSem) {
    finalActiveTerm = { tahunAjaran: activeYear, semester: activeSem };
  } else if (terms.length > 0) {
    finalActiveTerm = terms[0];
  }

  return {
    rows: rows,
    jadwalAktif: finalActiveTerm,
    terms: terms
  };
}

function getCutiData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log('Spreadsheet aktif tidak ditemukan. Buka Apps Script melalui Google Sheet: Ekstensi > Apps Script.');
    return [];
  }
  var sheet = ensureCutiSheet(ss);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var displayRows = sheet.getDataRange().getDisplayValues();
  if (rows.length <= 1) return [];

  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var d = displayRows[i] || [];
    var namaVal = String(d[2] !== undefined && d[2] !== '' ? d[2] : (r[2] || '')).trim();
    if (!namaVal) continue;

    var tglMulai = d[6] ? formatDate(d[6]) : formatDate(r[6]);
    var tglSelesai = d[7] ? formatDate(d[7]) : formatDate(r[7]);
    var jmlHari = parseInt(String(d[8] || r[8] || '1'), 10);
    if (isNaN(jmlHari) || jmlHari < 1) jmlHari = 1;

    result.push({
      id: String(d[0] || r[0] || ('CUTI-' + i)).trim(),
      waktuPengajuan: String(d[1] || r[1] || '').trim(),
      nama: namaVal,
      jabatan: String(d[3] || r[3] || '-').trim(),
      peran: String(d[4] || r[4] || '-').trim(),
      jenisCuti: String(d[5] || r[5] || 'Cuti').trim(),
      tanggalMulai: tglMulai,
      tanggalSelesai: tglSelesai || tglMulai,
      jumlahHariEfektif: jmlHari,
      cakupan: String(d[9] || r[9] || 'wajib_hadir').trim(),
      guruPengganti: String(d[10] || r[10] || '').trim(),
      nomorSurat: String(d[11] || r[11] || '').trim(),
      catatan: String(d[12] || r[12] || '').trim(),
      statusPengajuan: String(d[13] || r[13] || 'Aktif').trim()
    });
  }
  Logger.log('getCutiData berhasil membaca ' + result.length + ' baris cuti.');
  return result;
}

function getLogData(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  var sheet = findSheetFlexible(ss, ['Log_Presensi', 'Log Presensi', 'Data_Presensi', 'Presensi', 'Log'], ['log_presensi', 'log presensi', 'data_presensi', 'presensi']);
  if (!sheet && ss.getSheets().length > 0) sheet = ss.getSheets()[0];
  if (!sheet) return [];
  ensureLogHeaders(sheet);

  var rows = sheet.getDataRange().getValues();
  var displayRows = sheet.getDataRange().getDisplayValues();
  if (rows.length <= 1) return [];

  var headerRow = rows[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var colNama = headerRow.findIndex(function(h) { return h === 'nama' || h.indexOf('nama') > -1; });
  var colTanggal = headerRow.findIndex(function(h) { return h === 'tanggal' || h.indexOf('tgl') > -1 || h.indexOf('tanggal') > -1; });
  
  // Find Jam Datang specifically without matching Timestamp column
  var colJam = -1;
  for (var c = 0; c < headerRow.length; c++) {
    var h = headerRow[c];
    if (h.indexOf('jam') > -1 && h.indexOf('time') === -1) {
      colJam = c;
      break;
    }
  }
  if (colJam === -1) {
    for (var c = 0; c < headerRow.length; c++) {
      if (headerRow[c].indexOf('waktu datang') > -1) {
        colJam = c;
        break;
      }
    }
  }
  if (colJam === -1) colJam = 7;

  var colStatus = headerRow.findIndex(function(h) { return h === 'status' || h.indexOf('status') > -1; });
  var colJabatan = headerRow.findIndex(function(h) { return h.indexOf('jabatan') > -1; });
  var colMapel = headerRow.findIndex(function(h) { return h.indexOf('mapel') > -1; });
  var colHari = headerRow.findIndex(function(h) { return h === 'hari'; });
  var colId = headerRow.findIndex(function(h) { return h === 'id'; });
  var colTimestamp = headerRow.findIndex(function(h) { return h.indexOf('time') > -1 || h.indexOf('timestamp') > -1; });
  var colKet = headerRow.findIndex(function(h) { return h.indexOf('keterangan') > -1 || h.indexOf('ket') > -1; });

  var colPeran = headerRow.findIndex(function(h) { return h.indexOf('peran') > -1; });
  var colBatasStaf = headerRow.findIndex(function(h) { return h.indexOf('batas') > -1 && h.indexOf('staf') > -1; });
  var colStatusStaf = headerRow.findIndex(function(h) { return h.indexOf('status') > -1 && h.indexOf('staf') > -1; });
  var colBatasMengajar = headerRow.findIndex(function(h) { return h.indexOf('batas') > -1 && (h.indexOf('ajar') > -1 || h.indexOf('guru') > -1); });
  var colStatusMengajar = headerRow.findIndex(function(h) { return h.indexOf('status') > -1 && (h.indexOf('ajar') > -1 || h.indexOf('guru') > -1); });

  if (colNama === -1) colNama = 4;
  if (colTanggal === -1) colTanggal = 2;
  if (colStatus === -1) colStatus = 8;
  if (colJabatan === -1) colJabatan = 5;
  if (colMapel === -1) colMapel = 6;
  if (colHari === -1) colHari = 3;
  if (colId === -1) colId = 0;
  if (colTimestamp === -1) colTimestamp = 1;
  if (colKet === -1) colKet = 9;

  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var d = displayRows[i] || [];
    var namaVal = d[colNama] !== undefined ? String(d[colNama]).trim() : (r[colNama] !== undefined ? String(r[colNama]).trim() : '');
    var tglVal = d[colTanggal] ? formatDate(d[colTanggal]) : formatDate(r[colTanggal]);
    var rawJam = d[colJam] !== undefined && d[colJam] !== '' ? d[colJam] : r[colJam];
    var jamVal = formatTime(rawJam);

    var rawBatasStaf = colBatasStaf > -1 ? (d[colBatasStaf] !== undefined && d[colBatasStaf] !== '' ? d[colBatasStaf] : r[colBatasStaf]) : '';
    var rawBatasMengajar = colBatasMengajar > -1 ? (d[colBatasMengajar] !== undefined && d[colBatasMengajar] !== '' ? d[colBatasMengajar] : r[colBatasMengajar]) : '';
    var cleanBatasStaf = rawBatasStaf ? formatTime(String(rawBatasStaf).replace(/^'/, '')) : '';
    var cleanBatasMengajar = rawBatasMengajar ? formatTime(String(rawBatasMengajar).replace(/^'/, '')) : '';

    if (namaVal || tglVal || r[colId] || d[colId]) {
      result.push({
        id: String(d[colId] || r[colId] || ('LOG-' + i)),
        timestamp: String(d[colTimestamp] || r[colTimestamp] || new Date().toISOString()),
        tanggal: tglVal,
        hari: String(d[colHari] || r[colHari] || ''),
        nama: namaVal,
        jabatan: String(d[colJabatan] || r[colJabatan] || '-'),
        mapelHariIni: String(d[colMapel] || r[colMapel] || '-'),
        jamDatang: jamVal,
        status: String(d[colStatus] || r[colStatus] || 'Tepat Waktu'),
        keterangan: String(d[colKet] || r[colKet] || ''),
        peran: colPeran > -1 && (d[colPeran] || r[colPeran]) ? String(d[colPeran] || r[colPeran]).trim() : undefined,
        batasStaf: cleanBatasStaf && cleanBatasStaf !== '-' ? cleanBatasStaf : undefined,
        statusStaf: colStatusStaf > -1 && (d[colStatusStaf] || r[colStatusStaf]) ? String(d[colStatusStaf] || r[colStatusStaf]).trim() : undefined,
        batasMengajar: cleanBatasMengajar && cleanBatasMengajar !== '-' ? cleanBatasMengajar : undefined,
        statusMengajar: colStatusMengajar > -1 && (d[colStatusMengajar] || r[colStatusMengajar]) ? String(d[colStatusMengajar] || r[colStatusMengajar]).trim() : undefined
      });
    }
  }
  return result;
}

function formatTime(val) {
  if (!val) return '-';
  if (val instanceof Date) {
    var hh = String(val.getHours()).padStart(2, '0');
    var min = String(val.getMinutes()).padStart(2, '0');
    return hh + ':' + min;
  }
  var str = String(val).trim();
  if (!str || str === '-') return '-';

  var timeMatch = str.match(/(\\d{1,2}):(\\d{2})/);
  if (timeMatch) {
    var h = String(timeMatch[1]).padStart(2, '0');
    var m = String(timeMatch[2]).padStart(2, '0');
    return h + ':' + m;
  }

  return str;
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var yyyy = val.getFullYear();
    var mm = String(val.getMonth() + 1).padStart(2, '0');
    var dd = String(val.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }
  var str = String(val).trim();
  if (str.indexOf('T') > -1) {
    str = str.split('T')[0];
  }
  var isoMatch = str.match(/^(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})/);
  if (isoMatch) {
    return isoMatch[1] + '-' + String(isoMatch[2]).padStart(2, '0') + '-' + String(isoMatch[3]).padStart(2, '0');
  }
  var dmyMatch = str.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})/);
  if (dmyMatch) {
    return dmyMatch[3] + '-' + String(dmyMatch[2]).padStart(2, '0') + '-' + String(dmyMatch[1]).padStart(2, '0');
  }
  return str;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

// Storage keys
const STORAGE_KEY_WEB_APP = 'smp_nurul_abror_webapp_url';
const STORAGE_KEY_SHEET_URL = 'smp_nurul_abror_sheet_url';
const STORAGE_KEY_THRESHOLD = 'smp_nurul_abror_threshold';
const STORAGE_KEY_LOGS = 'smp_nurul_abror_local_logs';
const STORAGE_KEY_CUTI = 'smp_nurul_abror_local_cuti';
const STORAGE_KEY_HAS_REMOTE_CUTI = 'smp_nurul_abror_has_remote_cuti';
const STORAGE_KEY_MASTER = 'smp_nurul_abror_local_master';
const STORAGE_KEY_GURU_TOLERANSI = 'smp_nurul_abror_guru_toleransi_menit_v1';
const STORAGE_KEY_GURU_TANPA_JADWAL = 'smp_nurul_abror_guru_tanpa_jadwal_wajib_hadir_v1';
const STORAGE_KEY_QUOTA_PERIODE = 'smp_nurul_abror_quota_periode';
const STORAGE_KEY_QUOTA_IZIN = 'smp_nurul_abror_quota_izin';
const STORAGE_KEY_QUOTA_SAKIT = 'smp_nurul_abror_quota_sakit';
const STORAGE_KEY_QUOTA_ALPA = 'smp_nurul_abror_quota_alpa';
const STORAGE_KEY_QUOTA_DINAS = 'smp_nurul_abror_quota_dinas';
const STORAGE_KEY_QUOTA_START = 'smp_nurul_abror_quota_start';
const STORAGE_KEY_SCHOOL_LAT = 'smp_nurul_abror_school_lat';
const STORAGE_KEY_SCHOOL_LNG = 'smp_nurul_abror_school_lng';
const STORAGE_KEY_SCHOOL_RADIUS = 'smp_nurul_abror_school_radius';
const STORAGE_KEY_SCHOOL_QR_SECRET = 'smp_nurul_abror_school_qr_secret';
const STORAGE_KEY_REQ_LOCATION = 'smp_nurul_abror_req_location';
const STORAGE_KEY_REQ_DEVICE_LOCK = 'smp_nurul_abror_req_device_lock';
const STORAGE_KEY_KEBIJAKAN = 'smp_nurul_abror_kebijakan_kehadiran';
export const STORAGE_KEY_JADWAL_TAHUN = 'smp_nurul_abror_jadwal_tahun_ajaran';
export const STORAGE_KEY_JADWAL_SEMESTER = 'smp_nurul_abror_jadwal_semester';
const STORAGE_KEY_ATTENDANCE_OVERRIDES = 'smp_nurul_abror_attendance_rule_overrides_v1';

export const MASTER_SCHEMA_VERSION_KEY = 'smp_nurul_abror_master_schema_v3';
export const CURRENT_MASTER_SCHEMA_VERSION = 'v2026_10_12_jadwal_fiqih_zaini_v8_permanent';
export const STORAGE_KEY_MASTER_SOURCE = 'smp_nurul_abror_master_source';

export function getMasterDataSourceLabel(settings?: AppSettings): 'Sumber: Google Sheets' | 'Sumber: Data bawaan aplikasi' {
  if (typeof window === 'undefined') return 'Sumber: Data bawaan aplikasi';
  const source = localStorage.getItem(STORAGE_KEY_MASTER_SOURCE);
  const webApp = settings?.webAppUrl || localStorage.getItem(STORAGE_KEY_WEB_APP);
  return (source === 'sheets' && Boolean(webApp)) ? 'Sumber: Google Sheets' : 'Sumber: Data bawaan aplikasi';
}

export function getRawMapelByDay(teacher?: MasterGuruStaf | null, day?: string): string {
  if (!teacher) return '-';
  switch (day) {
    case 'Sabtu': return teacher.mapelSabtu || '-';
    case 'Ahad': return teacher.mapelAhad || '-';
    case 'Senin': return teacher.mapelSenin || '-';
    case 'Selasa': return teacher.mapelSelasa || '-';
    case 'Rabu': return teacher.mapelRabu || '-';
    case 'Kamis': return teacher.mapelKamis || '-';
    default: return '-';
  }
}

/**
 * Standardizes and locks teacher roster data to guarantee absolute integrity
 * Prevents remote Google Sheets empty/legacy cells from overwriting official schedules
 */
export function normalizeMasterGuruStaf(rawList: MasterGuruStaf[]): MasterGuruStaf[] {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return DEFAULT_MASTER_GURU_STAF;
  }

  const seenNames = new Set<string>();
  const seenNos = new Set<number>();
  let maxNo = 0;

  for (const g of rawList) {
    if (typeof g.no === 'number' && !isNaN(g.no) && g.no > maxNo) {
      maxNo = g.no;
    }
  }

  const result: MasterGuruStaf[] = [];

  for (let idx = 0; idx < rawList.length; idx++) {
    const g = rawList[idx];
    if (!g || !g.nama) continue;
    const cleanName = g.nama.trim();
    if (!cleanName) continue;

    const normKey = cleanName.toLowerCase();
    if (seenNames.has(normKey)) {
      // Skip duplicate entries with identical teacher name
      continue;
    }
    seenNames.add(normKey);

    const copy = { ...g, nama: cleanName };
    const nameLower = normKey;

    // Guru 5: Ahmad Zaini, S.Pd.I, M.Pd
    if (copy.no === 5 || nameLower.includes('zaini')) {
      copy.nama = 'Ahmad Zaini, S.Pd.I, M.Pd';
      copy.jabatan = 'Guru Fiqh & Agama';
      copy.kodeUnik = 'NA-GURU-005';
      copy.mapelSenin = 'Jam I-II: Fiqih (8B), Jam III-IV: Fiqih (7A), Jam V-VI: Fiqih (7B)';
      if (!copy.mapelSabtu || copy.mapelSabtu === '-') {
        copy.mapelSabtu = 'Jam I-II: Tauhid (9A), Jam III-IV: Tauhid (9C), Jam V-VI: Tauhid (9B)';
      }
      if (!copy.mapelAhad || copy.mapelAhad === '-') {
        copy.mapelAhad = 'Jam I-II: Fiqih (8A), Jam III-IV: Tauhid (9D), Jam V-VI: Fiqih (7B)';
      }
      if (!copy.mapelRabu || copy.mapelRabu === '-') {
        copy.mapelRabu = 'Jam I-II: Fiqih (8B), Jam III-IV: Fiqih (7A), Jam V-VI: Fiqih (8A)';
      }
      if (!copy.mapelSelasa) copy.mapelSelasa = '-';
      if (!copy.mapelKamis) copy.mapelKamis = '-';
      if (!copy.no || copy.no === 5 || !seenNos.has(5)) {
        copy.no = 5;
      }
    }

    // Guru 22: Anisatut Toyyibah
    if (copy.no === 22 || nameLower.includes('anisatut')) {
      copy.nama = 'Anisatut Toyyibah';
      copy.jabatan = 'Guru Akhlak (Kode 22K) & Wali Kelas 8D';
      copy.kodeUnik = 'NA-GURU-022';
      copy.mapelSabtu = 'Jam 3-4: K (7D)';
      if (!copy.no || copy.no === 22 || !seenNos.has(22)) {
        copy.no = 22;
      }
    }

    // Ensure copy.no is a strictly unique number across the entire list
    let assignedNo = typeof copy.no === 'number' && !isNaN(copy.no) && copy.no > 0 ? copy.no : (idx + 1);
    if (seenNos.has(assignedNo)) {
      maxNo += 1;
      assignedNo = maxNo;
    }
    copy.no = assignedNo;
    seenNos.add(assignedNo);

    if (copy.kodeGuru === undefined || copy.kodeGuru === null) {
      const resolvedKode = cariKodeGuru(copy);
      if (resolvedKode !== null) {
        copy.kodeGuru = resolvedKode;
      }
    }

    // Biarkan peran kosong agar evaluator cerdas (determineTeacherPeran / resolveTeacherAttendanceRule)
    // dapat membedakan Guru, Guru BK, Guru+Staf, dan Staf secara akurat sesuai jadwal & jabatan.

    result.push(copy);
  }

  return result;
}

export const DEFAULT_WEB_APP_URL = ((import.meta as any).env?.VITE_WEB_APP_URL as string) || '';
export const DEFAULT_SHEET_URL = ((import.meta as any).env?.VITE_SHEET_URL as string) || '';

export function getStoredSettings(): AppSettings {
  if (typeof window !== 'undefined') {
    // Pastikan tidak ada PIN tersimpan di localStorage browser sesuai kepatuhan keamanan
    localStorage.removeItem('smp_nurul_abror_admin_pin');
  }

  const webAppUrl = localStorage.getItem(STORAGE_KEY_WEB_APP) || DEFAULT_WEB_APP_URL;
  const sheetUrl = localStorage.getItem(STORAGE_KEY_SHEET_URL) || DEFAULT_SHEET_URL;
  const jamMasukThreshold = localStorage.getItem(STORAGE_KEY_THRESHOLD) || '07:25';
  const guruToleransiMenit = parseInt(localStorage.getItem(STORAGE_KEY_GURU_TOLERANSI) || '0', 10);
  const guruTanpaJadwalWajibHadir = localStorage.getItem(STORAGE_KEY_GURU_TANPA_JADWAL) === 'true';
  const kebijakanKehadiran = (localStorage.getItem(STORAGE_KEY_KEBIJAKAN) as 'instruksi_kepala_sekolah' | 'sesuai_jadwal_mengajar') || 'instruksi_kepala_sekolah';
  const quotaPeriode = (localStorage.getItem(STORAGE_KEY_QUOTA_PERIODE) as 'Bulanan' | 'Semester') || 'Bulanan';
  const quotaIzin = parseInt(localStorage.getItem(STORAGE_KEY_QUOTA_IZIN) || '3', 10);
  const quotaSakit = parseInt(localStorage.getItem(STORAGE_KEY_QUOTA_SAKIT) || '5', 10);
  const quotaAlpa = parseInt(localStorage.getItem(STORAGE_KEY_QUOTA_ALPA) || '1', 10);
  const quotaDinasLuar = parseInt(localStorage.getItem(STORAGE_KEY_QUOTA_DINAS) || '5', 10);
  const quotaTanggalMulai = localStorage.getItem(STORAGE_KEY_QUOTA_START) || `${new Date().getFullYear()}-07-01`;

  const schoolLatitude = normalizeCoordinate(
    localStorage.getItem(STORAGE_KEY_SCHOOL_LAT),
    'lat',
    DEFAULT_SCHOOL_COORDS.latitude
  );
  const schoolLongitude = normalizeCoordinate(
    localStorage.getItem(STORAGE_KEY_SCHOOL_LNG),
    'lng',
    DEFAULT_SCHOOL_COORDS.longitude
  );
  const schoolRadiusMeters = parseInt(localStorage.getItem(STORAGE_KEY_SCHOOL_RADIUS) || '100', 10);
  const schoolQrSecret = localStorage.getItem(STORAGE_KEY_SCHOOL_QR_SECRET) || 'SMP-NA-PRESENSI-2026';
  const requireLocation = localStorage.getItem(STORAGE_KEY_REQ_LOCATION) !== 'false';
  const requireDeviceLock = localStorage.getItem(STORAGE_KEY_REQ_DEVICE_LOCK) !== 'false';
  const jadwalTahunAjaran = localStorage.getItem(STORAGE_KEY_JADWAL_TAHUN) || undefined;
  const jadwalSemester = localStorage.getItem(STORAGE_KEY_JADWAL_SEMESTER) || undefined;
  let attendanceRuleOverrides: Record<string, AttendanceRuleMode> = {};
  try {
    const rawOverrides = localStorage.getItem(STORAGE_KEY_ATTENDANCE_OVERRIDES);
    if (rawOverrides) {
      const parsedOverrides = JSON.parse(rawOverrides);
      if (parsedOverrides && typeof parsedOverrides === 'object' && !Array.isArray(parsedOverrides)) {
        for (const [k, v] of Object.entries(parsedOverrides)) {
          if (v === 'sesuai_jadwal' || v === 'wajib_harian' || v === 'ganda') {
            attendanceRuleOverrides[k] = v;
          }
        }
      }
    }
  } catch (e) {
    attendanceRuleOverrides = {};
  }

  return {
    webAppUrl,
    sheetUrl,
    jamMasukThreshold,
    guruToleransiMenit,
    guruTanpaJadwalWajibHadir,
    kebijakanKehadiran,
    quotaPeriode,
    quotaIzin,
    quotaSakit,
    quotaAlpa,
    quotaDinasLuar,
    quotaTanggalMulai,
    schoolLatitude,
    schoolLongitude,
    schoolRadiusMeters,
    schoolQrSecret,
    requireLocation,
    requireDeviceLock,
    jadwalTahunAjaran,
    jadwalSemester,
    attendanceRuleOverrides
  };
}

export function saveStoredSettings(settings: Partial<AppSettings>) {
  if (settings.webAppUrl !== undefined) localStorage.setItem(STORAGE_KEY_WEB_APP, settings.webAppUrl.trim());
  if (settings.sheetUrl !== undefined) localStorage.setItem(STORAGE_KEY_SHEET_URL, settings.sheetUrl.trim());
  if (settings.jamMasukThreshold !== undefined) localStorage.setItem(STORAGE_KEY_THRESHOLD, settings.jamMasukThreshold.trim());
  if (settings.guruToleransiMenit !== undefined) localStorage.setItem(STORAGE_KEY_GURU_TOLERANSI, String(settings.guruToleransiMenit));
  if (settings.guruTanpaJadwalWajibHadir !== undefined) localStorage.setItem(STORAGE_KEY_GURU_TANPA_JADWAL, String(settings.guruTanpaJadwalWajibHadir));
  if (settings.kebijakanKehadiran !== undefined) localStorage.setItem(STORAGE_KEY_KEBIJAKAN, settings.kebijakanKehadiran);
  if (settings.quotaPeriode !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_PERIODE, settings.quotaPeriode);
  if (settings.quotaIzin !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_IZIN, String(settings.quotaIzin));
  if (settings.quotaSakit !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_SAKIT, String(settings.quotaSakit));
  if (settings.quotaAlpa !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_ALPA, String(settings.quotaAlpa));
  if (settings.quotaDinasLuar !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_DINAS, String(settings.quotaDinasLuar));
  if (settings.quotaTanggalMulai !== undefined) localStorage.setItem(STORAGE_KEY_QUOTA_START, settings.quotaTanggalMulai);
  if (settings.schoolLatitude !== undefined) localStorage.setItem(STORAGE_KEY_SCHOOL_LAT, String(settings.schoolLatitude));
  if (settings.schoolLongitude !== undefined) localStorage.setItem(STORAGE_KEY_SCHOOL_LNG, String(settings.schoolLongitude));
  if (settings.schoolRadiusMeters !== undefined) localStorage.setItem(STORAGE_KEY_SCHOOL_RADIUS, String(settings.schoolRadiusMeters));
  if (settings.schoolQrSecret !== undefined) localStorage.setItem(STORAGE_KEY_SCHOOL_QR_SECRET, settings.schoolQrSecret);
  if (settings.requireLocation !== undefined) localStorage.setItem(STORAGE_KEY_REQ_LOCATION, String(settings.requireLocation));
  if (settings.requireDeviceLock !== undefined) localStorage.setItem(STORAGE_KEY_REQ_DEVICE_LOCK, String(settings.requireDeviceLock));
  if (settings.jadwalTahunAjaran !== undefined) localStorage.setItem(STORAGE_KEY_JADWAL_TAHUN, settings.jadwalTahunAjaran.trim());
  if (settings.jadwalSemester !== undefined) localStorage.setItem(STORAGE_KEY_JADWAL_SEMESTER, settings.jadwalSemester.trim());
  if (settings.attendanceRuleOverrides !== undefined) {
    localStorage.setItem(STORAGE_KEY_ATTENDANCE_OVERRIDES, JSON.stringify(settings.attendanceRuleOverrides || {}));
  }
}

export function resetMasterDataToOfficial(): MasterGuruStaf[] {
  saveLocalMasterData(DEFAULT_MASTER_GURU_STAF);
  localStorage.setItem(MASTER_SCHEMA_VERSION_KEY, CURRENT_MASTER_SCHEMA_VERSION);
  localStorage.setItem(STORAGE_KEY_MASTER_SOURCE, 'default');
  return DEFAULT_MASTER_GURU_STAF;
}

export function getLocalMasterData(): MasterGuruStaf[] {
  const currentVersion = localStorage.getItem(MASTER_SCHEMA_VERSION_KEY);
  const stored = localStorage.getItem(STORAGE_KEY_MASTER);

  // If master data is uninitialized or from an older version, refresh to official 38 list with 22K updated
  if (currentVersion !== CURRENT_MASTER_SCHEMA_VERSION || !stored) {
    return resetMasterDataToOfficial();
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length >= 30) {
      const normalized = normalizeMasterGuruStaf(parsed);
      saveLocalMasterData(normalized);
      return normalized;
    }
  } catch (e) {
    console.error(e);
  }

  return resetMasterDataToOfficial();
}

export function saveLocalMasterData(master: MasterGuruStaf[]) {
  localStorage.setItem(STORAGE_KEY_MASTER, JSON.stringify(master));
}

function normalizeStatus(statusRaw: string): StatusPresensi {
  const s = (statusRaw || '').trim().toLowerCase();
  if (s === 'tepat waktu' || s === 'tepat') return 'Tepat Waktu';
  if (s === 'terlambat' || s === 'telat') return 'Terlambat';
  if (s === 'izin' || s === 'ijin') return 'Izin';
  if (s === 'sakit') return 'Sakit';
  if (s === 'cuti' || s.startsWith('cuti')) return 'Cuti';
  if (s === 'alpa (jadwal mengajar)') return 'Alpa (Jadwal Mengajar)';
  if (s === 'alpa (wajib hadir staf)') return 'Alpa (Wajib Hadir Staf)';
  if (s === 'alpa (wajib hadir guru bk)') return 'Alpa (Wajib Hadir Guru BK)';
  if (s === 'alpa' || s === 'alpha' || s === 'tanpa keterangan') return 'Alpa';
  if (s === 'dinas luar' || s === 'dinas') return 'Dinas Luar';
  return 'Tepat Waktu';
}

function sanitizeLogTime(log: LogPresensi): LogPresensi {
  if (!log) return log;
  const cleanNama = (log.nama || '').trim().replace(/\s+/g, ' ');
  const cleanStatus = normalizeStatus(log.status);

  let cleanTanggal = (log.tanggal || '').trim();
  if (cleanTanggal.includes('T')) {
    cleanTanggal = cleanTanggal.split('T')[0];
  }
  const isoMatch = cleanTanggal.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    cleanTanggal = `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
  } else {
    const dmyMatch = cleanTanggal.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      cleanTanggal = `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(dmyMatch[1]).padStart(2, '0')}`;
    }
  }

  let cleanJam = log.jamDatang || '-';
  if (cleanJam && cleanJam !== '-') {
    const parsed = parseAndFormat24hTime(cleanJam);
    if (parsed.isValid && parsed.formatted) {
      cleanJam = parsed.formatted;
    }
  }

  const cleanBatasStaf = log.batasStaf ? String(log.batasStaf).replace(/^'/, '').trim() : undefined;
  const cleanBatasMengajar = log.batasMengajar ? String(log.batasMengajar).replace(/^'/, '').trim() : undefined;

  return {
    ...log,
    nama: cleanNama,
    status: cleanStatus,
    tanggal: cleanTanggal,
    jamDatang: cleanJam,
    peran: log.peran ? String(log.peran).trim() : undefined,
    batasStaf: cleanBatasStaf && cleanBatasStaf !== '-' ? cleanBatasStaf : undefined,
    statusStaf: log.statusStaf ? String(log.statusStaf).trim() : undefined,
    batasMengajar: cleanBatasMengajar && cleanBatasMengajar !== '-' ? cleanBatasMengajar : undefined,
    statusMengajar: log.statusMengajar ? String(log.statusMengajar).trim() : undefined
  };
}

export function getLocalLogs(): LogPresensi[] {
  const stored = localStorage.getItem(STORAGE_KEY_LOGS);
  if (stored) {
    try {
      const parsed: LogPresensi[] = JSON.parse(stored);
      return parsed.map(sanitizeLogTime);
    } catch (e) {
      console.error(e);
    }
  }
  return [];
}

export function saveLocalLogs(logs: LogPresensi[]) {
  const cleaned = logs.map(sanitizeLogTime);
  localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(cleaned));
}

function parseRemoteSettings(raw: Record<string, any>): Partial<AppSettings> {
  const result: Partial<AppSettings> = {};
  if (raw.jamMasukThreshold) {
    const rawVal = String(raw.jamMasukThreshold).trim();
    const parsed = parseAndFormat24hTime(rawVal);
    result.jamMasukThreshold = parsed.isValid && parsed.formatted ? parsed.formatted : rawVal;
  }
  if (raw.guruToleransiMenit !== undefined) {
    result.guruToleransiMenit = parseInt(String(raw.guruToleransiMenit), 10) || 0;
  }
  if (raw.guruTanpaJadwalWajibHadir !== undefined) {
    result.guruTanpaJadwalWajibHadir = raw.guruTanpaJadwalWajibHadir === true || String(raw.guruTanpaJadwalWajibHadir).toLowerCase() === 'true';
  }
  if (raw.quotaPeriode === 'Bulanan' || raw.quotaPeriode === 'Semester') result.quotaPeriode = raw.quotaPeriode;
  if (raw.quotaIzin !== undefined) result.quotaIzin = parseInt(String(raw.quotaIzin), 10) || 3;
  if (raw.quotaSakit !== undefined) result.quotaSakit = parseInt(String(raw.quotaSakit), 10) || 5;
  if (raw.quotaAlpa !== undefined) result.quotaAlpa = parseInt(String(raw.quotaAlpa), 10) || 1;
  if (raw.quotaDinasLuar !== undefined) result.quotaDinasLuar = parseInt(String(raw.quotaDinasLuar), 10) || 5;
  if (raw.quotaTanggalMulai) result.quotaTanggalMulai = String(raw.quotaTanggalMulai).trim();
  if (raw.sheetUrl) result.sheetUrl = String(raw.sheetUrl).trim();
  if (raw.schoolLatitude !== undefined) {
    result.schoolLatitude = normalizeCoordinate(raw.schoolLatitude, 'lat', DEFAULT_SCHOOL_COORDS.latitude);
  }
  if (raw.schoolLongitude !== undefined) {
    result.schoolLongitude = normalizeCoordinate(raw.schoolLongitude, 'lng', DEFAULT_SCHOOL_COORDS.longitude);
  }
  if (raw.schoolRadiusMeters !== undefined) result.schoolRadiusMeters = parseInt(String(raw.schoolRadiusMeters), 10);
  if (raw.schoolQrSecret !== undefined) result.schoolQrSecret = String(raw.schoolQrSecret);
  if (raw.requireLocation !== undefined) result.requireLocation = raw.requireLocation === true || raw.requireLocation === 'true';
  if (raw.requireDeviceLock !== undefined) result.requireDeviceLock = raw.requireDeviceLock === true || raw.requireDeviceLock === 'true';
  if (raw.jadwalTahunAjaran) result.jadwalTahunAjaran = String(raw.jadwalTahunAjaran).trim();
  if (raw.jadwalSemester) result.jadwalSemester = String(raw.jadwalSemester).trim();
  if (raw.attendanceRuleOverrides !== undefined) {
    try {
      const parsed = typeof raw.attendanceRuleOverrides === 'string'
        ? JSON.parse(raw.attendanceRuleOverrides)
        : raw.attendanceRuleOverrides;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const cleanMap: Record<string, AttendanceRuleMode> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v === 'sesuai_jadwal' || v === 'wajib_harian' || v === 'ganda') {
            cleanMap[k] = v;
          }
        }
        result.attendanceRuleOverrides = cleanMap;
      }
    } catch (e) {
      // ignore invalid remote JSON
    }
  }
  return result;
}

export function getLocalCutiData(): DataCutiRecord[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY_CUTI);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.error(e);
    }
  }
  return [];
}

export function saveLocalCutiData(list: DataCutiRecord[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CUTI, JSON.stringify(list));
}

export function hasRemoteCutiSheetSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_HAS_REMOTE_CUTI) === 'true';
}

/**
 * Extracts summary Cuti records from Log_Presensi rows (status === 'Cuti')
 * as a fallback when Data_Cuti sheet is not yet populated/deployed.
 */
export function deriveCutiFromLogs(
  logs: LogPresensi[],
  masterList?: MasterGuruStaf[]
): DataCutiRecord[] {
  const cutiLogs = logs.filter((l) => l.status === 'Cuti');
  if (cutiLogs.length === 0) return [];

  const groups = new Map<string, LogPresensi[]>();

  for (const log of cutiLogs) {
    const ket = (log.keterangan || '').trim();
    const jenisMatch = ket.match(/^\[([^\]]+)\]/);
    const jenis = jenisMatch ? jenisMatch[1].trim() : 'Cuti';
    // Group logs that share teacher + jenis + keterangan (multi-day leave shares identical keterangan)
    const groupKey = `${log.nama.trim().toLowerCase()}||${jenis}||${ket}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(log);
  }

  const derived: DataCutiRecord[] = [];
  for (const [, groupLogs] of groups.entries()) {
    const sorted = [...groupLogs].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const ket = (first.keterangan || '').trim();
    const jenisMatch = ket.match(/^\[([^\]]+)\]/);
    const jenisCuti = jenisMatch ? jenisMatch[1].trim() : 'Cuti';
    const penggantiMatch = ket.match(/Pengganti\/Tugas:\s*([^•]+)/i);
    const suratMatch = ket.match(/Surat:\s*([^•]+)/i);
    const catatanMatch = ket.match(/Ket:\s*([^•]+)/i);
    const masterMatch = masterList?.find((m) => m.nama.trim().toLowerCase() === first.nama.trim().toLowerCase());

    derived.push({
      id: `DERIVED-${first.nama.trim().toLowerCase().replace(/\s+/g, '-')}-${first.tanggal}-${last.tanggal}`,
      waktuPengajuan: first.timestamp || `${first.tanggal} 07:00:00`,
      nama: first.nama,
      jabatan: first.jabatan || masterMatch?.jabatan || '-',
      peran: first.peran || masterMatch?.peran || 'Guru',
      jenisCuti,
      tanggalMulai: first.tanggal,
      tanggalSelesai: last.tanggal,
      jumlahHariEfektif: sorted.length,
      cakupan: sorted.length > 1 ? 'wajib_hadir' : 'harian',
      guruPengganti: penggantiMatch ? penggantiMatch[1].trim() : '-',
      nomorSurat: suratMatch ? suratMatch[1].trim() : '-',
      catatan: catatanMatch ? catatanMatch[1].trim() : (jenisMatch ? '-' : ket || '-'),
      statusPengajuan: 'Aktif'
    });
  }

  return derived.sort((a, b) => b.tanggalMulai.localeCompare(a.tanggalMulai));
}

/**
 * Syncs/Fetches data from Google Apps Script Web App or falls back to local storage.
 */
export async function fetchRemoteData(webAppUrl: string): Promise<{
  success: boolean;
  master: MasterGuruStaf[];
  logs: LogPresensi[];
  cuti?: DataCutiRecord[];
  hasRemoteCutiSheet?: boolean;
  settings?: Partial<AppSettings>;
  jadwal?: JadwalSlot[];
  jadwalAktif?: { tahunAjaran: string; semester: string };
  terms?: Array<{ tahunAjaran: string; semester: string }>;
  message?: string;
  httpStatus?: number;
}> {
  if (!webAppUrl) {
    const localLogs = getLocalLogs();
    const localCuti = getLocalCutiData();
    return {
      success: true,
      master: getLocalMasterData(),
      logs: localLogs,
      cuti: localCuti.length > 0 ? localCuti : deriveCutiFromLogs(localLogs),
      hasRemoteCutiSheet: false,
      jadwal: getLocalJadwal(),
      message: 'Mode Demo/Lokal (Belum ada URL Apps Script)'
    };
  }

  try {
    const res = await fetch(webAppUrl, { method: 'GET', redirect: 'follow' });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      // not json
    }

    if (res.ok && json && json.status === 'success') {
      const isFromSheets = Boolean(json.master && Array.isArray(json.master) && json.master.length > 0);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_MASTER_SOURCE, isFromSheets ? 'sheets' : 'default');
      }
      const rawMaster = isFromSheets ? json.master : getLocalMasterData();
      const master = normalizeMasterGuruStaf(rawMaster);
      const rawLogs: LogPresensi[] = json.logs || [];
      const logs = rawLogs.map(sanitizeLogTime);
      saveLocalMasterData(master);
      saveLocalLogs(logs);

      const hasRemoteCuti = Array.isArray(json.cuti);
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_HAS_REMOTE_CUTI, hasRemoteCuti ? 'true' : 'false');
      }
      let cutiList: DataCutiRecord[];
      if (hasRemoteCuti) {
        cutiList = json.cuti;
        saveLocalCutiData(cutiList);
      } else {
        cutiList = getLocalCutiData();
      }

      if (json.jadwal && Array.isArray(json.jadwal) && json.jadwal.length > 0) {
        saveLocalJadwal(json.jadwal);
      }
      const jadwal = (json.jadwal && Array.isArray(json.jadwal) && json.jadwal.length > 0)
        ? json.jadwal
        : getLocalJadwal();

      let remoteSettings: Partial<AppSettings> | undefined = undefined;
      if (json.settings && typeof json.settings === 'object') {
        remoteSettings = parseRemoteSettings(json.settings);
      }
      if (json.jadwalAktif && typeof json.jadwalAktif === 'object') {
        if (!remoteSettings) remoteSettings = {};
        if (json.jadwalAktif.tahunAjaran) remoteSettings.jadwalTahunAjaran = String(json.jadwalAktif.tahunAjaran).trim();
        if (json.jadwalAktif.semester) remoteSettings.jadwalSemester = String(json.jadwalAktif.semester).trim();
      }
      if (remoteSettings) {
        saveStoredSettings(remoteSettings);
      }

      return {
        success: true,
        master,
        logs,
        cuti: cutiList,
        hasRemoteCutiSheet: hasRemoteCuti,
        settings: remoteSettings,
        jadwal,
        jadwalAktif: json.jadwalAktif,
        terms: json.terms,
        httpStatus: res.status
      };
    } else {
      return {
        success: false,
        httpStatus: res.status,
        master: getLocalMasterData(),
        logs: getLocalLogs(),
        cuti: getLocalCutiData(),
        hasRemoteCutiSheet: false,
        jadwal: getLocalJadwal(),
        message: json?.message || `Gagal mengambil data dari Google Apps Script (HTTP ${res.status}).`
      };
    }
  } catch (err: any) {
    console.warn('Apps Script fetch failed:', err);
    return {
      success: false,
      master: getLocalMasterData(),
      logs: getLocalLogs(),
      cuti: getLocalCutiData(),
      hasRemoteCutiSheet: false,
      jadwal: getLocalJadwal(),
      message: `Koneksi ke Apps Script gagal: ${err.message || 'CORS / Network Error'}. Menggunakan data lokal.`
    };
  }
}

/**
 * Saves application settings to Google Apps Script backend and local storage.
 */
export async function postSaveSettings(
  webAppUrl: string,
  settings: Partial<AppSettings>
): Promise<{ success: boolean; message: string }> {
  // Always update local storage first
  saveStoredSettings(settings);

  if (!webAppUrl) {
    return { success: true, message: 'Pengaturan disimpan secara lokal (Mode Demo).' };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveSettings',
        settings
      })
    });
    const json = await res.json();
    return {
      success: json.status === 'success',
      message: json.message || 'Pengaturan berhasil disimpan di Google Sheets.'
    };
  } catch (e: any) {
    return {
      success: false,
      message: 'Gagal menyimpan ke Google Sheets: ' + (e.message || 'Error jaringan') + '. Tersimpan secara lokal.'
    };
  }
}

/**
 * Submits a new attendance log entry to Apps Script or local storage.
 */
export async function postNewLog(
  webAppUrl: string,
  newLog: LogPresensi
): Promise<{ success: boolean; message: string; id?: string }> {
  const currentLogs = getLocalLogs();
  const newKey = `${newLog.nama.trim().toLowerCase()}_${newLog.tanggal.trim()}`;
  const updatedLogs = [newLog, ...currentLogs.filter(l => {
    const lKey = `${l.nama.trim().toLowerCase()}_${l.tanggal.trim()}`;
    return l.id !== newLog.id && lKey !== newKey;
  })];
  saveLocalLogs(updatedLogs);

  if (!webAppUrl) {
    return {
      success: true,
      message: `Presensi ${newLog.nama} jam ${newLog.jamDatang} tersimpan (Mode Demo Lokal).`,
      id: newLog.id
    };
  }

  try {
    const payload = {
      action: 'addLog',
      data: newLog
    };

    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      return {
        success: true,
        message: json.message || `Presensi ${newLog.nama} jam ${newLog.jamDatang} tersimpan ke Google Sheets.`,
        id: json.id || newLog.id
      };
    } else {
      return {
        success: false,
        message: `Gagal simpan ke Google Sheet (HTTP ${res.status}): ${json?.message || 'Response tidak valid'}. Tersimpan di browser.`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal sync ke Google Sheets (${err.message || 'Koneksi Error'}). Tersimpan di browser.`
    };
  }
}

/**
 * Batch Upsert Logs to Google Apps Script
 */
export async function batchUpsertLogs(
  webAppUrl: string,
  logsToUpsert: LogPresensi[]
): Promise<{ success: boolean; message: string; updated?: number; inserted?: number }> {
  if (logsToUpsert.length === 0) {
    return { success: true, message: 'Tidak ada data untuk disimpan.' };
  }

  // Save/Upsert into local storage first
  const currentLogs = getLocalLogs();
  const logMap = new Map<string, LogPresensi>();
  for (const l of currentLogs) {
    const key = `${l.nama.trim().toLowerCase()}_${l.tanggal.trim()}`;
    logMap.set(key, l);
  }
  for (const newL of logsToUpsert) {
    const key = `${newL.nama.trim().toLowerCase()}_${newL.tanggal.trim()}`;
    logMap.set(key, newL);
  }
  const mergedLogs = Array.from(logMap.values());
  saveLocalLogs(mergedLogs);

  if (!webAppUrl) {
    return {
      success: true,
      message: `${logsToUpsert.length} data presensi tersimpan secara lokal (Mode Demo).`
    };
  }

  try {
    const payload = {
      action: 'batchUpsert',
      logs: logsToUpsert
    };

    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      return {
        success: true,
        message: json.message || `${logsToUpsert.length} data presensi berhasil tersimpan ke Google Sheets.`,
        updated: json.updated,
        inserted: json.inserted
      };
    } else {
      return {
        success: false,
        message: `HTTP ${res.status}: Gagal menyimpan batch ke Google Sheets (${json?.message || 'Format tidak dikenal'}). Tersimpan lokal.`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal sync Google Sheets (${err.message || 'Koneksi error'}). Tersimpan di browser.`
    };
  }
}

/**
 * Diagnostic test: GET Master
 */
export async function testFetchMaster(webAppUrl: string): Promise<TestApiResponse> {
  if (!webAppUrl) {
    return {
      success: false,
      rawText: '',
      error: 'URL Google Apps Script Web App belum diisi di Pengaturan.'
    };
  }

  const targetUrl = webAppUrl.includes('?') ? `${webAppUrl}&action=master` : `${webAppUrl}?action=master`;

  try {
    const res = await fetch(targetUrl, { method: 'GET', redirect: 'follow' });
    const rawText = await res.text();
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok) {
      if (parsedData && parsedData.status === 'success') {
        return {
          success: true,
          httpStatus: res.status,
          statusText: res.statusText,
          rawText,
          parsedData
        };
      } else {
        return {
          success: false,
          httpStatus: res.status,
          statusText: res.statusText,
          rawText,
          parsedData,
          error: parsedData?.message || 'Aplikasi Web merespons tetapi mengembalikan status error.'
        };
      }
    } else {
      return {
        success: false,
        httpStatus: res.status,
        statusText: res.statusText,
        rawText,
        error: `HTTP Error Code ${res.status}: ${res.statusText}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      rawText: err.message || String(err),
      error: `Gagal terhubung ke Web App Apps Script: ${err.message || 'CORS / Network Error'}. Pastikan URL ber-akhiran /exec dan pengaturannya "Anyone".`
    };
  }
}

/**
 * Diagnostic test: POST Dummy
 */
export async function testPostDummy(webAppUrl: string): Promise<TestApiResponse> {
  if (!webAppUrl) {
    return {
      success: false,
      rawText: '',
      error: 'URL Google Apps Script Web App belum diisi di Pengaturan.'
    };
  }

  const dummyData: LogPresensi = {
    id: 'TEST-' + Date.now(),
    timestamp: new Date().toLocaleString('id-ID'),
    tanggal: new Date().toISOString().split('T')[0],
    hari: 'Sabtu',
    nama: 'GURU_TES_DIAGNOSTIK',
    jabatan: 'Guru Mata Pelajaran',
    mapelHariIni: 'Uji Koneksi',
    jamDatang: '07:00',
    status: 'Tepat Waktu',
    keterangan: 'Baris Uji Coba Diagnostik Koneksi'
  };

  const payload = {
    action: 'addLog',
    data: dummyData
  };

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok) {
      if (parsedData && parsedData.status === 'success') {
        return {
          success: true,
          httpStatus: res.status,
          statusText: res.statusText,
          rawText,
          parsedData
        };
      } else {
        return {
          success: false,
          httpStatus: res.status,
          statusText: res.statusText,
          rawText,
          parsedData,
          error: parsedData?.message || 'Gagal menyimpan baris contoh ke Google Sheets.'
        };
      }
    } else {
      return {
        success: false,
        httpStatus: res.status,
        statusText: res.statusText,
        rawText,
        error: `HTTP Error Code ${res.status}: ${res.statusText}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      rawText: err.message || String(err),
      error: `Gagal mengirim data contoh: ${err.message || 'CORS / Network Error'}.`
    };
  }
}

/**
 * Deletes a log entry from Google Sheet & local storage.
 */
export async function deleteLogEntry(
  webAppUrl: string,
  logId: string
): Promise<{ success: boolean; message: string }> {
  const currentLogs = getLocalLogs();
  const updated = currentLogs.filter(l => l.id !== logId);
  saveLocalLogs(updated);

  if (!webAppUrl) {
    return { success: true, message: 'Log berhasil dihapus (Lokal).' };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'deleteLog', id: logId })
    });
    const json = await res.json();
    return { success: true, message: json.message || 'Log berhasil dihapus.' };
  } catch (err) {
    return { success: true, message: 'Dihapus dari penyimpanan lokal.' };
  }
}

/**
 * Sends and seeds entire master roster (32 teachers + schedules) to Google Sheets Master_Guru_Staf sheet
 */
export async function seedMasterDataToSheets(
  webAppUrl: string,
  masterData: MasterGuruStaf[]
): Promise<{ success: boolean; message: string }> {
  // Always update local storage
  saveLocalMasterData(masterData);

  if (!webAppUrl) {
    return {
      success: true,
      message: 'Master data berhasil disimpan di penyimpanan lokal (Mode Demo).'
    };
  }

  try {
    const payload = {
      action: 'seedMaster',
      masterData
    };

    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      // not json
    }

    if (res.ok && json && json.status === 'success') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_MASTER_SOURCE, 'sheets');
      }
      return {
        success: true,
        message: json.message || `${masterData.length} data guru dan roster jadwal berhasil disinkronkan ke Google Sheets.`
      };
    } else {
      return {
        success: false,
        message: `Gagal sinkronisasi ke Google Sheets (${json?.message || `HTTP ${res.status}`}).`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal terhubung ke Google Sheets (${err.message || 'Koneksi Error'}).`
    };
  }
}

/**
 * Verifies PIN against Google Apps Script backend.
 * PIN is verified solely against PropertiesService (PIN_ADMIN or PIN_KURIKULUM).
 * Returns { success: true, role: 'admin' | 'kurikulum' } or error message.
 * Does NOT return or expose PIN.
 */
export async function verifyPinRemote(
  webAppUrl: string,
  pin: string
): Promise<{ success: boolean; role?: 'admin' | 'kurikulum'; message?: string }> {
  if (!webAppUrl) {
    return {
      success: false,
      message: 'URL Google Apps Script belum diatur di Pengaturan Aplikasi.'
    };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'verifyPin',
        pin: pin.trim()
      })
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      return {
        success: true,
        role: json.role
      };
    } else {
      return {
        success: false,
        message: json?.message || `Gagal verifikasi PIN (HTTP ${res.status}).`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal terhubung ke Google Apps Script: ${err.message || 'Error Jaringan / CORS'}.`
    };
  }
}

/**
 * Saves schedule rows to Google Sheets (sheet Jadwal_Pelajaran) with automated archiving to Jadwal_Riwayat
 * and audit logging to Jadwal_Log.
 * Replaces only rows matching tahunAjaran + semester; other semesters are untouched.
 * Requires authorized PIN (admin or kurikulum role).
 */
export async function saveJadwalRemote(
  webAppUrl: string,
  pin: string,
  tahunAjaran: string,
  semester: string,
  rows: JadwalSlot[],
  catatan?: string
): Promise<{ success: boolean; message: string; errors?: string[]; count?: number }> {
  if (!webAppUrl) {
    return {
      success: false,
      message: 'URL Google Apps Script belum diatur di Pengaturan.'
    };
  }

  try {
    const payload = {
      action: 'saveJadwal',
      pin: pin.trim(),
      tahunAjaran,
      semester,
      rows,
      catatan: catatan || ''
    };

    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      return {
        success: true,
        message: json.message || 'Jadwal Pelajaran berhasil disimpan ke Google Sheets.',
        count: json.count
      };
    } else {
      return {
        success: false,
        message: json?.message || 'Gagal menyimpan jadwal.',
        errors: json?.errors
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal mengirim jadwal: ${err.message || 'Error Jaringan'}.`
    };
  }
}

/**
 * Reads schedule from sheet Jadwal_Pelajaran on Google Sheets.
 * Returns all rows, active term (jadwalAktif), and list of available terms.
 */
export async function getJadwalRemote(
  webAppUrl: string,
  tahunAjaran?: string,
  semester?: string
): Promise<{
  success: boolean;
  status: 'success' | 'empty' | 'error';
  rows: JadwalSlot[];
  jadwalAktif?: { tahunAjaran: string; semester: string };
  terms?: Array<{ tahunAjaran: string; semester: string }>;
  message?: string;
}> {
  if (!webAppUrl) {
    return {
      success: false,
      status: 'error',
      rows: [],
      message: 'URL Google Apps Script belum diisi.'
    };
  }

  try {
    let url = webAppUrl.includes('?') ? `${webAppUrl}&action=getJadwal` : `${webAppUrl}?action=getJadwal`;
    if (tahunAjaran) url += `&tahunAjaran=${encodeURIComponent(tahunAjaran)}`;
    if (semester) url += `&semester=${encodeURIComponent(semester)}`;

    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json) {
      if (json.status === 'success') {
        const rows: JadwalSlot[] = json.rows || json.jadwal || [];
        if (rows.length > 0) {
          saveLocalJadwal(rows);
        }
        return {
          success: true,
          status: 'success',
          rows,
          jadwalAktif: json.jadwalAktif,
          terms: json.terms
        };
      } else if (json.status === 'empty') {
        return {
          success: true,
          status: 'empty',
          rows: [],
          jadwalAktif: json.jadwalAktif,
          terms: json.terms,
          message: json.message || 'Sheet Jadwal_Pelajaran masih kosong.'
        };
      }
    }

    return {
      success: false,
      status: 'error',
      rows: [],
      message: json?.message || `HTTP ${res.status}: Gagal memuat jadwal dari Google Sheets.`
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      rows: [],
      message: err.message || 'Gagal terhubung ke Google Sheets untuk membaca jadwal.'
    };
  }
}

/**
 * Sets the active academic term (tahunAjaran & semester) in Google Sheets (Pengaturan_Aplikasi).
 * Requires authorized PIN (admin or kurikulum role).
 */
export async function setJadwalAktifRemote(
  webAppUrl: string,
  pin: string,
  tahunAjaran: string,
  semester: string
): Promise<{ success: boolean; message: string; jadwalAktif?: { tahunAjaran: string; semester: string } }> {
  if (!webAppUrl) {
    return {
      success: false,
      message: 'URL Google Apps Script belum diatur.'
    };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'setJadwalAktif',
        pin: pin.trim(),
        tahunAjaran: tahunAjaran.trim(),
        semester: semester.trim()
      })
    });
    const json = await res.json();
    if (json && json.status === 'success') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_JADWAL_TAHUN, tahunAjaran.trim());
        localStorage.setItem(STORAGE_KEY_JADWAL_SEMESTER, semester.trim());
      }
    }
    return {
      success: json.status === 'success',
      message: json.message || 'Term aktif berhasil diatur.',
      jadwalAktif: json.jadwalAktif
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal mengatur term aktif: ${err.message || 'Error Jaringan'}.`
    };
  }
}

/**
 * Saves a summary leave record to sheet Data_Cuti & local storage.
 */
export async function postSaveCuti(
  webAppUrl: string,
  cutiRecord: DataCutiRecord
): Promise<{ success: boolean; syncedToSheet: boolean; needsScriptUpdate?: boolean; message: string }> {
  const current = getLocalCutiData();
  const updated = [cutiRecord, ...current.filter((c) => c.id !== cutiRecord.id)];
  saveLocalCutiData(updated);

  if (!webAppUrl) {
    return {
      success: true,
      syncedToSheet: false,
      message: 'Ringkasan cuti tersimpan secara lokal (Mode Demo).'
    };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveCuti',
        data: cutiRecord
      })
    });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_HAS_REMOTE_CUTI, 'true');
      }
      return {
        success: true,
        syncedToSheet: true,
        message: json.message || 'Data cuti tersimpan ke sheet Data_Cuti.'
      };
    }

    const msg = String(json?.message || '');
    const needsUpdate = msg.toLowerCase().includes('aksi tidak dikenali');
    return {
      success: true,
      syncedToSheet: false,
      needsScriptUpdate: needsUpdate,
      message: needsUpdate
        ? 'Catatan harian masuk ke Log_Presensi, namun Code.gs di Google Sheets perlu diperbarui agar tab Data_Cuti muncul.'
        : `Tersimpan lokal (${msg || `HTTP ${res.status}`}).`
    };
  } catch (err: any) {
    return {
      success: true,
      syncedToSheet: false,
      message: `Ringkasan cuti tersimpan di browser (${err.message || 'Error jaringan'}).`
    };
  }
}

/**
 * Deletes a leave record from Data_Cuti (and optionally removes matching Cuti rows from Log_Presensi).
 */
export async function deleteCutiRemote(
  webAppUrl: string,
  record: DataCutiRecord,
  alsoDeleteLogs: boolean = true
): Promise<{ success: boolean; message: string }> {
  const currentCuti = getLocalCutiData();
  saveLocalCutiData(currentCuti.filter((c) => c.id !== record.id));

  if (alsoDeleteLogs) {
    const targetName = record.nama.trim().toLowerCase();
    const currentLogs = getLocalLogs();
    const filteredLogs = currentLogs.filter((l) => {
      if (
        l.nama.trim().toLowerCase() === targetName &&
        l.status === 'Cuti' &&
        l.tanggal >= record.tanggalMulai &&
        l.tanggal <= record.tanggalSelesai
      ) {
        return false;
      }
      return true;
    });
    saveLocalLogs(filteredLogs);
  }

  if (!webAppUrl) {
    return { success: true, message: 'Data cuti dihapus dari penyimpanan lokal.' };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteCuti',
        id: record.id,
        nama: record.nama,
        tanggalMulai: record.tanggalMulai,
        tanggalSelesai: record.tanggalSelesai,
        alsoDeleteLogs
      })
    });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      return { success: true, message: json.message || 'Data cuti berhasil dihapus dari Google Sheets.' };
    }
    return {
      success: true,
      message: json?.message || 'Dihapus dari daftar lokal (perbarui Code.gs jika ingin sinkronisasi penuh ke Data_Cuti).'
    };
  } catch (err: any) {
    return {
      success: true,
      message: 'Dihapus dari penyimpanan lokal.'
    };
  }
}

/**
 * Batch syncs summary Cuti records to sheet Data_Cuti in Google Sheets.
 */
export async function syncCutiRecordsRemote(
  webAppUrl: string,
  records: DataCutiRecord[]
): Promise<{ success: boolean; syncedToSheet: boolean; needsScriptUpdate?: boolean; message: string }> {
  if (!webAppUrl) {
    return {
      success: false,
      syncedToSheet: false,
      message: 'URL Google Apps Script belum diisi di menu Pengaturan Sheets.'
    };
  }
  if (!records || records.length === 0) {
    return {
      success: true,
      syncedToSheet: true,
      message: 'Tidak ada data cuti yang perlu disinkronkan.'
    };
  }

  try {
    const res = await fetch(webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'batchSaveCuti',
        records
      })
    });
    const rawText = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(rawText);
    } catch (e) {}

    if (res.ok && json && json.status === 'success') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_HAS_REMOTE_CUTI, 'true');
        const current = getLocalCutiData();
        const mergedMap = new Map<string, DataCutiRecord>();
        for (const c of current) {
          mergedMap.set(c.id, c);
        }
        for (const r of records) {
          mergedMap.set(r.id, r);
        }
        saveLocalCutiData(Array.from(mergedMap.values()));
      }
      return {
        success: true,
        syncedToSheet: true,
        message: json.message || `${records.length} data cuti berhasil disinkronkan ke tab Data_Cuti.`
      };
    }

    const msg = String(json?.message || '');
    const needsUpdate = msg.toLowerCase().includes('aksi tidak dikenali');
    return {
      success: false,
      syncedToSheet: false,
      needsScriptUpdate: needsUpdate,
      message: needsUpdate
        ? 'Apps Script Web App masih menjalankan versi lama. Salin ulang Code.gs lalu Deploy > Manage deployments > Edit > New version > Deploy.'
        : (msg || `Gagal sinkronisasi ke Google Sheets (HTTP ${res.status}).`)
    };
  } catch (err: any) {
    return {
      success: false,
      syncedToSheet: false,
      message: `Gagal terhubung ke Apps Script: ${err.message || 'Error jaringan'}.`
    };
  }
}




export type StatusPresensi =
  | 'Tepat Waktu'
  | 'Terlambat'
  | 'Izin'
  | 'Sakit'
  | 'Cuti'
  | 'Alpa'
  | 'Alpa (Jadwal Mengajar)'
  | 'Alpa (Wajib Hadir Staf)'
  | 'Alpa (Wajib Hadir Guru BK)'
  | 'Dinas Luar';

export type AttendanceRuleMode = 'sesuai_jadwal' | 'wajib_harian' | 'ganda';

export type HariSekolah = 'Sabtu' | 'Ahad' | 'Senin' | 'Selasa' | 'Rabu' | 'Kamis' | 'Jumat';

export type UserRole = 'none' | 'admin' | 'kurikulum';

export type ActiveTab =
  | 'scan_qr'
  | 'dashboard'
  | 'input'
  | 'input_massal'
  | 'rekap'
  | 'belum'
  | 'master'
  | 'jadwal'
  | 'kelola_jadwal'
  | 'sp_pembinaan'
  | 'setup'
  | 'diagnostik';

export interface JadwalLogEntry {
  waktu: string;
  peran: string;
  tahunAjaran: string;
  semester: string;
  jumlahBaris: number;
  catatan: string;
}

export interface SubstituteAssignment {
  cutiId: string;
  guruCutiNama: string;
  guruCutiJabatan?: string;
  jenisCuti: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  catatan?: string;
  classNote?: string;
}

export interface MasterGuruStaf {
  no: number;
  nama: string;
  jabatan: string;
  kodeUnik?: string; // Unique QR/Barcode Identifier e.g. GURU-001
  kodeGuru?: number;
  peran?: string; // 'Guru' | 'Staf' | 'Guru+Staf' | 'Guru BK' | 'Guru BK+Mengajar'
  mapelSabtu: string;
  mapelAhad: string;
  mapelSenin: string;
  mapelSelasa: string;
  mapelRabu: string;
  mapelKamis: string;
  isTempSubstitute?: boolean;
  substitutingFor?: SubstituteAssignment[];
}

export interface JadwalSlot {
  tahunAjaran: string;
  semester: string;
  hari: string;
  sesi: string;
  jamMulai: string;
  jamSelesai: string;
  kelas: string;
  kodeGuru: number;
  namaGuru: string;
  kodeMapel: string;
  namaMapel: string;
}

export interface LogPresensi {
  id: string;
  timestamp: string; // YYYY-MM-DD HH:mm:ss
  tanggal: string; // YYYY-MM-DD
  hari: HariSekolah;
  nama: string;
  jabatan: string;
  mapelHariIni: string;
  jamDatang: string; // HH:mm or '-'
  status: StatusPresensi;
  keterangan: string;
  metodePresensi?: 'Manual' | 'QR HP Guru' | 'QR Kios Piket';
  koordinatLokasi?: string; // Lat, Lng when scanned via mobile
  peran?: string; // 'Guru' | 'Staf' | 'Guru+Staf' | 'Guru BK' | 'Guru BK+Mengajar'
  batasStaf?: string; // HH:mm or '-'
  statusStaf?: string; // 'Tepat Waktu' | 'Terlambat' or '-'
  batasMengajar?: string; // HH:mm or '-'
  statusMengajar?: string; // 'Tepat Waktu' | 'Terlambat' or '-'
}

export interface DataCutiRecord {
  id: string;
  waktuPengajuan: string; // YYYY-MM-DD HH:mm:ss
  nama: string;
  jabatan: string;
  peran: string;
  jenisCuti: string;
  tanggalMulai: string; // YYYY-MM-DD
  tanggalSelesai: string; // YYYY-MM-DD
  jumlahHariEfektif: number;
  cakupan: 'wajib_hadir' | 'semua_hari_sekolah' | 'harian';
  guruPengganti: string;
  nomorSurat: string;
  catatan: string;
  statusPengajuan: 'Aktif' | 'Selesai' | 'Dicabut' | 'Dibatalkan';
}

export type SpTahap =
  | 'Teguran / Pembinaan I'
  | 'SP-I'
  | 'SP-II'
  | 'SP-III + Pemanggilan';

export type SpJenisDokumen = 'berita_acara_pembinaan' | 'surat_peringatan';

export type SpPenerbit = 'Waka Kurikulum' | 'Kepala Sekolah';

export type SpStatusTindakLanjut =
  | 'Diterbitkan'
  | 'Sudah Klarifikasi'
  | 'Selesai Pembinaan'
  | 'Eskalasi Kepala Sekolah';

export interface DataSpRecord {
  id: string;
  waktuDibuat: string; // YYYY-MM-DD HH:mm:ss
  nomorSurat: string; // e.g. 001 / SMP.NAA / XI / 2026
  tanggalSurat: string; // YYYY-MM-DD
  tahap: SpTahap;
  jenisDokumen: SpJenisDokumen;
  penerbit: SpPenerbit;
  urutanKe: number;
  nama: string;
  nipNty: string;
  jabatan: string;
  mataPelajaran: string;
  lokasiPertemuan: string;
  alasanUtama: string;
  tanggalRapatAbsen: string;
  periodeBulan: string;
  persentaseKehadiran: string;
  pelanggaranLainnya: string;
  catatanKlarifikasi: string;
  disertaiPemanggilan: boolean;
  tanggalPemanggilan: string;
  jamPemanggilan: string;
  tempatPemanggilan: string;
  riwayatTerkait: string;
  rincianPelanggaran?: string;
  namaPenandatangan: string;
  nipPenandatangan: string;
  statusTindakLanjut: SpStatusTindakLanjut;
}

export interface AppSettings {
  webAppUrl: string;
  sheetUrl: string;
  jamMasukThreshold: string; // e.g. '07:25' (Instruksi resmi Kepala Sekolah / Batas Staf & Guru BK)
  guruToleransiMenit: number; // e.g. 0
  guruTanpaJadwalWajibHadir: boolean; // e.g. false
  attendanceRuleOverrides?: Record<string, AttendanceRuleMode>; // Keyed by normalized teacher/staff name
  kebijakanKehadiran?: 'instruksi_kepala_sekolah' | 'sesuai_jadwal_mengajar'; // Dual recognition (legacy)
  adminPin?: string; // (Deprecated - PIN kini divalidasi server-side via Script Properties)
  jadwalTahunAjaran?: string; // e.g. '2026/2027'
  jadwalSemester?: string; // e.g. 'Ganjil' | 'Genap'
  quotaPeriode: 'Bulanan' | 'Semester';
  quotaIzin: number;
  quotaSakit: number;
  quotaAlpa: number;
  quotaDinasLuar: number;
  quotaTanggalMulai: string; // YYYY-MM-DD
  // Geofencing & QR Settings
  schoolLatitude: number; // e.g. -8.009330
  schoolLongitude: number; // e.g. 114.421731
  schoolRadiusMeters: number; // e.g. 100 meters
  schoolQrSecret: string; // Secret token for school gate QR code
  requireLocation: boolean; // Enforce GPS radius check
  requireDeviceLock: boolean; // Enforce 1 device 1 scan per day
  // Auto-Alpa (Otomatis Tidak Hadir setelah batas waktu kedatangan)
  autoAlpaEnabled?: boolean; // Default: true
  autoAlpaGraceMenit?: number; // Default: 90 menit setelah jam masuk/jadwal
  autoAlpaCutoffMode?: 'setelah_jam_masuk' | 'batas_akhir_tetap'; // Default: 'setelah_jam_masuk'
  autoAlpaBatasAkhirJam?: string; // e.g. '09:00' when autoAlpaCutoffMode === 'batas_akhir_tetap'
  autoAlpaMulaiTanggal?: string; // YYYY-MM-DD: tanggal mulai berlakunya pencatatan otomatis
  whatsappGroupUrl?: string; // Link Grup WhatsApp Resmi Sekolah
  waReminderEnabled?: boolean; // Aktifkan pengingat otomatis pukul 08:30 WIB
  waReminderJam?: string; // Default '08:30'
  waGatewayProvider?: 'fonnte' | 'wablas' | 'webhook'; // Provider WA Gateway untuk kirim otomatis di Apps Script
  waGatewayUrl?: string; // URL endpoint gateway (opsional, default Fonnte)
  waGroupId?: string; // ID Grup WA tujuan (mis. 120363xxx@g.us)
  waAppPublicUrl?: string; // Tautan aplikasi untuk dicantumkan dalam pesan pengingat WA
}

export interface TestApiResponse {
  success: boolean;
  httpStatus?: number;
  statusText?: string;
  rawText: string;
  parsedData?: any;
  error?: string;
}


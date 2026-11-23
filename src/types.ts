export type StatusPresensi =
  | 'Tepat Waktu'
  | 'Terlambat'
  | 'Izin'
  | 'Sakit'
  | 'Cuti'
  | 'Alpa'
  | 'Alpa (Jadwal Mengajar)'
  | 'Alpa (Wajib Hadir Staf)'
  | 'Dinas Luar';

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

export interface MasterGuruStaf {
  no: number;
  nama: string;
  jabatan: string;
  kodeUnik?: string; // Unique QR/Barcode Identifier e.g. GURU-001
  kodeGuru?: number;
  peran?: string; // 'Guru' | 'Staf' | 'Guru+Staf'
  mapelSabtu: string;
  mapelAhad: string;
  mapelSenin: string;
  mapelSelasa: string;
  mapelRabu: string;
  mapelKamis: string;
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
  peran?: string; // 'Guru' | 'Staf' | 'Guru+Staf'
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
  statusPengajuan: 'Aktif' | 'Selesai' | 'Dibatalkan';
}

export interface AppSettings {
  webAppUrl: string;
  sheetUrl: string;
  jamMasukThreshold: string; // e.g. '07:25' (Instruksi resmi Kepala Sekolah / Batas Staf)
  guruToleransiMenit: number; // e.g. 0
  guruTanpaJadwalWajibHadir: boolean; // e.g. false
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
}

export interface TestApiResponse {
  success: boolean;
  httpStatus?: number;
  statusText?: string;
  rawText: string;
  parsedData?: any;
  error?: string;
}


/**
 * Jadwal Pelajaran Resmi SMP Nurul Abror Al-Robbaniyin
 * Semester Ganjil - Tahun Pelajaran 2026/2027
 * Ditandatangani oleh Waka Kurikulum (Syaiful Anam, S.Pd)
 */

export interface SesiJadwal {
  jamKe: number; // 1 s.d 7
  waktu: string; // e.g. "07.30 - 08.00"
  jamMulai: string; // e.g. "07:30"
  jamSelesai: string; // e.g. "08:00"
  kelas: string; // e.g. "7A", "8B", "9C"
  kodeMapel: string; // e.g. "D", "E", "F"
  namaMapel: string; // e.g. "IPA", "MATEMATIKA"
}

export const JAM_PELAJARAN_LIST = [
  { jamKe: 1, label: "Jam ke-1", waktu: "07.30 - 08.00", start: "07:30", end: "08:00", defaultThreshold: "07:30" },
  { jamKe: 2, label: "Jam ke-2", waktu: "08.00 - 08.30", start: "08:00", end: "08:30", defaultThreshold: "08:00" },
  { jamKe: 3, label: "Jam ke-3", waktu: "08.30 - 09.00", start: "08:30", end: "09:00", defaultThreshold: "08:30" },
  { jamKe: 4, label: "Jam ke-4", waktu: "09.00 - 09.30", start: "09:00", end: "09:30", defaultThreshold: "09:00" },
  { jamKe: 5, label: "Istirahat", waktu: "09.30 - 10.00", start: "09:30", end: "10:00", isBreak: true },
  { jamKe: 6, label: "Jam ke-6", waktu: "10.00 - 10.30", start: "10:00", end: "10:30", defaultThreshold: "10:00" },
  { jamKe: 7, label: "Jam ke-7", waktu: "10.30 - 11.00", start: "10:30", end: "11.00", defaultThreshold: "10:30" },
];

export const MAPEL_MAP: Record<string, string> = {
  'A': 'PKN',
  'B': 'Bahasa Indonesia',
  'C': 'Bahasa Inggris',
  'D': 'IPA',
  'E': 'Matematika',
  'F': 'IPS',
  'G': 'TIK',
  'H': 'Prakarya',
  'I': 'Tata Busana',
  'J': 'Fiqh',
  'K': 'Akhlak',
  'L': 'Tauhid',
  'M': 'Tarikh'
};

export const WALI_KELAS_MAP: Record<string, string> = {
  '7A': 'Dr. Hirtsul Arifin, S.Kom, M.Pd (16)',
  '7B': 'Ahmad Zakki, S.Kom (15)',
  '8A': 'Habibudin, S.Pd, M.Pd (13)',
  '8B': 'Saiful Amir, S.Pd (7)',
  '9A': 'Ridwan Rohman, S.Pd, M.Pd (11)',
  '9B': 'Basrawi, S.Pd (9)',
  '9C': 'Muhtadi, S.Pd.I, M.Pd (8)',
  '9D': 'Ust. Mukarrom (10)',
  '7C': 'Riska Ayu Susanti, S.Pd (31)',
  '7D': 'Syarifatun Nisa\', S.Mat (28)',
  '8C': 'Nurul Qomariah, S.Pd (25)',
  '8D': 'Anisatut Toyyibah (22)',
  '9E': 'Wiwin Dwi Mustika, S.Pd (23)',
  '9F': 'Ulfah Al-Aluf, S.Pd.I (24)',
  '9G': 'Nila Husniyah, S.Pd (27)',
  '9H': 'Ismil Asiffin, S.Pd (30)'
};

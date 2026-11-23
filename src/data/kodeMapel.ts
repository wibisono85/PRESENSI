/**
 * Peta Kode Mata Pelajaran Resmi SMP Nurul Abror Al-Robbaniyin
 */

export interface KodeMapelItem {
  kode: string;
  nama: string;
}

export const KODE_MAPEL_LIST: KodeMapelItem[] = [
  { kode: 'A', nama: 'PKN' },
  { kode: 'B', nama: 'Bahasa Indonesia' },
  { kode: 'C', nama: 'Bahasa Inggris' },
  { kode: 'D', nama: 'IPA' },
  { kode: 'E', nama: 'Matematika' },
  { kode: 'F', nama: 'IPS' },
  { kode: 'G', nama: 'TIK' },
  { kode: 'H', nama: 'Prakarya' },
  { kode: 'I', nama: 'Tata Busana' },
  { kode: 'J', nama: 'Fiqh' },
  { kode: 'K', nama: 'Akhlak' },
  { kode: 'L', nama: 'Tauhid' },
  { kode: 'M', nama: 'Tarikh' }
];

export const KODE_MAPEL: Record<string, string> = {
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

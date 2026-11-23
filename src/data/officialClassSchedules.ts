export interface ClassScheduleSession {
  jam: string;
  waktu: string;
  mapel: string;
  guru: string;
}

export interface ClassSchedule {
  kelas: string;
  tipe: 'Putra' | 'Putri';
  waliKelas: string;
  jadwal: {
    Sabtu: ClassScheduleSession[];
    Ahad: ClassScheduleSession[];
    Senin: ClassScheduleSession[];
    Selasa: ClassScheduleSession[];
    Rabu: ClassScheduleSession[];
    Kamis: ClassScheduleSession[];
  };
}

/**
 * JADWAL PELAJARAN PER KELAS - SMP NURUL ABROR AL-ROBBANIYIN
 * Semester Ganjil - Tahun Pelajaran 2026/2027
 * Terdiri dari 16 Rombel (VII A - IX H)
 */
export const OFFICIAL_CLASS_SCHEDULES: ClassSchedule[] = [
  {
    "kelas": "VII A",
    "tipe": "Putra",
    "waliKelas": "Dr. Hirtsul Arifin, S.Kom, M.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ainur Rofiqi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Dr. Hirtsul Arifin, S.Kom, M.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Halik, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Ainur Rofiqi, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Dr. Hirtsul Arifin, S.Kom, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Habibudin, S.Pd, M.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VII B",
    "tipe": "Putra",
    "waliKelas": "Ahmad Zakki, S.Kom",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPS",
          "guru": "Dr. Hirtsul Arifin, S.Kom, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Ainur Rofiqi, S.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Halik, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ainur Rofiqi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Dr. Hirtsul Arifin, S.Kom, M.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Habibudin, S.Pd, M.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VIII A",
    "tipe": "Putra",
    "waliKelas": "Habibudin, S.Pd, M.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Ust. Mukarrom"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VIII B",
    "tipe": "Putra",
    "waliKelas": "Saiful Amir, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX A",
    "tipe": "Putra",
    "waliKelas": "Ridwan Rohman, S.Pd, M.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX B",
    "tipe": "Putra",
    "waliKelas": "Basrawi, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX C",
    "tipe": "Putra",
    "waliKelas": "Muhtadi, S.Pd.I, M.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX D",
    "tipe": "Putra",
    "waliKelas": "Ust. Mukarrom",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "Habibudin, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PKN",
          "guru": "Muhtadi, S.Pd.I, M.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Ahmad Zaini, S.Pd.I, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Ust. Mukarrom"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Hariyanto, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Basrawi, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syaiful Anam, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TARIKH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Ahmad Zakki, S.Kom"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ridwan Rohman, S.Pd, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Saiful Amir, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Sulaiman, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VII C",
    "tipe": "Putri",
    "waliKelas": "Riska Ayu Susanti, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PKN",
          "guru": "Dra. HJ. Qurrotul Faizah, M.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Riska Ayu Susanti, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "AKHLAK",
          "guru": "Anisatut Toyyibah"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Riska Ayu Susanti, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        }
      ]
    }
  },
  {
    "kelas": "VII D",
    "tipe": "Putri",
    "waliKelas": "Syarifatun Nisa', S.Mat",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Anisatut Toyyibah"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Riska Ayu Susanti, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PKN",
          "guru": "Dra. HJ. Qurrotul Faizah, M.Pd.I"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Hossaimah, S.Pd.I"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Riska Ayu Susanti, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Hossaimah, S.Pd.I"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VIII C",
    "tipe": "Putri",
    "waliKelas": "Nurul Qomariah, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Anisatut Toyyibah"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "VIII D",
    "tipe": "Putri",
    "waliKelas": "Anisatut Toyyibah",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Anisatut Toyyibah"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Syarifatun Nisa', S.Mat"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Hossaimah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Nurul Qomariah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Surotul Faizah, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        }
      ]
    }
  },
  {
    "kelas": "IX E",
    "tipe": "Putri",
    "waliKelas": "Wiwin Dwi Mustika, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "AKHLAK",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX F",
    "tipe": "Putri",
    "waliKelas": "Ulfah Al-Aluf, S.Pd.I",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "AKHLAK",
          "guru": "Nila Husniyah, S.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "FIQH",
          "guru": "Fariqoh Ahmad"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        }
      ]
    }
  },
  {
    "kelas": "IX G",
    "tipe": "Putri",
    "waliKelas": "Nila Husniyah, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "FIQH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "AKHLAK",
          "guru": "Nila Husniyah, S.Pd"
        }
      ]
    }
  },
  {
    "kelas": "IX H",
    "tipe": "Putri",
    "waliKelas": "Ismil Asiffin, S.Pd",
    "jadwal": {
      "Sabtu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "AKHLAK",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TARIKH",
          "guru": "Fariqoh Ahmad"
        }
      ],
      "Ahad": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INDONESIA",
          "guru": "Fatimah Citra Handayani"
        }
      ],
      "Senin": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "MATEMATIKA",
          "guru": "Drs. H. Imam Bustomi, M.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "IPS",
          "guru": "Dian Ariantini, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        }
      ],
      "Selasa": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "IPA",
          "guru": "Ulfah Al-Aluf, S.Pd.I"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PKN",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        }
      ],
      "Rabu": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "BAHASA INGGRIS",
          "guru": "Ismil Asiffin, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "PRAKARYA",
          "guru": "HJ. Rupiyati, S.Pd"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TAUHID",
          "guru": "Nila Husniyah, S.Pd"
        }
      ],
      "Kamis": [
        {
          "jam": "Jam I-II",
          "waktu": "07.30 - 08.30",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        },
        {
          "jam": "Jam III-IV",
          "waktu": "08.30 - 09.30",
          "mapel": "FIQH",
          "guru": "Fariqoh Ahmad"
        },
        {
          "jam": "Jam V-VI",
          "waktu": "10.00 - 11.00",
          "mapel": "TIK",
          "guru": "Wiwin Dwi Mustika, S.Pd"
        }
      ]
    }
  }
];

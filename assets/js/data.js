/* ============================================================
   ISI PORTOFOLIO — ubah teks halaman cukup di file ini.
   ------------------------------------------------------------
   - Teks boleh memakai tag sederhana: <b>tebal</b>, <code>kode</code>.
   - Urutan di dalam daftar [ ... ] = urutan tampil di halaman.
   - Kolom yang dikosongkan ('') tidak ditampilkan.
   - Setelah mengedit, cek salah ketik (koma/kutip yang hilang):
       node --check assets/js/data.js
   - Judul tab dan pratinjau tautan (meta og:*) ada di <head> index.html,
     karena dibaca Google/WhatsApp/LinkedIn tanpa menjalankan JavaScript.
   ============================================================ */
window.PORTO = {

  /* ---------- hero (bagian paling atas) ---------- */
  profil: {
    namaDepan: 'Andhika Samuel',          // juga dipakai untuk logo di navigasi: Andhika.Samuel
    namaBelakang: 'Daya Lelunu',
    gelar: ', A.Md.Kom.',
    tagline: 'Internal Tools · Automation · Digitalisasi Proses',
    lead: 'Saya mengubah pekerjaan administrasi yang tersebar di banyak file Excel menjadi <b>satu database, dashboard, dan otomasi</b> yang dipakai tim setiap hari — dirancang, diamankan, didokumentasikan, dan dirawat sendiri.',
    status: 'Mining Production Clerk · PT. Bagas Bumi Persada',   // diberi titik hijau
    lokasi: 'Tabalong, Kalimantan Selatan',
    foto: 'assets/img/foto.jpg',                                  // persegi, ±600×600
    lencana: ['n8n', 'Node.js', 'MySQL', 'Docker'],              // maksimal 4, mengelilingi foto
    cv: 'assets/doc/CV-Andhika-Samuel-Daya-Lelunu.pdf'           // '' = sembunyikan tombol "Unduh CV"
  },

  /* ---------- deretan angka di bawah hero ---------- */
  angka: [
    { label: 'Modul', nilai: 11, ket: 'pengganti file Excel tim admin' },
    { label: 'Endpoint API', nilai: 59, ket: 'dengan sesi login & hak per fitur' },
    { label: 'Karyawan / hari', nilai: 306, awalan: '±', ket: 'dihitung otomatis untuk pesanan makan' },
    { label: 'Layanan Docker', nilai: 5, ket: 'di Ubuntu Server, HTTPS lewat Caddy' },
    { label: 'Halaman panduan', nilai: 27, ket: 'untuk membangun ulang sistem' }
  ],

  /* ---------- 01 · Tentang saya ---------- */
  tentang: {
    pembuka: 'Mining Production Clerk yang membangun sendiri <b>Magi System</b> — platform internal yang memindahkan administrasi Departemen Mining dari banyak file Excel ke satu database dan dashboard.',
    paragraf: [
      'Pekerjaan harian saya adalah menyusun perhitungan roster kerja, mengolah data kebutuhan manpower, dan mengelola absensi serta data karyawan. Dari situ saya melihat pola yang selalu berulang, data yang saling bertentangan antar-file, dan aturan kerja yang hanya “diingat orang”. Saya memindahkan semuanya ke sistem yang menegakkan aturan itu sendiri, mencatat siapa mengubah apa, dan menjalankan pekerjaan rutin secara otomatis.',
      'Saya terbiasa <b>berpikir kritis</b> dan <b>memecahkan masalah</b>: mencari akar persoalannya dulu, baru membangun solusinya.',
      'Sekarang saya memperdalam <b>DevOps</b>, <b>cloud</b>, dan <b>machine learning</b> — melanjutkan hal yang sama ke skala yang lebih besar.'
    ],
    nilai: [
      { ikon: '⌗', judul: 'Merancang', teks: 'Dari masalah lapangan ke skema data: ERD, tabel dengan batasan yang dijaga database (UNIQUE, FK, CHECK, trigger).' },
      { ikon: '⛨', judul: 'Mengamankan', teks: 'Login per akun, hak akses per fitur ditegakkan di server, hak database per kolom, dan jejak audit untuk setiap perubahan.' },
      { ikon: '⟳', judul: 'Merawat', teks: 'Backup harian yang teruji pulih, pemantauan otomatis, audit keamanan mandiri, dan panduan rebuild yang lengkap.' }
    ],
    foto: 'assets/img/meja-kerja.jpg',                            // '' = sembunyikan foto lebar
    fotoAlt: 'Andhika Samuel di meja kerja, di depan beberapa monitor yang menampilkan dashboard, terminal server, dan kode',
    fotoKet: 'Meja kerja — tempat Magi System dibangun dan dirawat setiap hari.'
  },

  /* ---------- 02 · Studi kasus Magi System ---------- */
  magi: {
    intro: 'Sistem kerja terpadu untuk tim admin Departemen Mining. Data yang dulu tersebar di banyak file Excel — karyawan, mess, BPJS, kontrak, SIMPER, roster, absensi, pesanan makan — dikumpulkan ke <b>satu database MySQL</b> dan <b>satu dashboard web</b>, lalu pekerjaan harian yang polanya tetap dijalankan otomatis lewat <b>n8n</b>. Inisiatif pribadi; berjalan di server kantor dan dipakai tim setiap hari.',

    // [sebelum, sesudah]
    banding: [
      ['Data karyawan tersebar di beberapa file/sheet dan sering bertentangan', 'Satu profil per karyawan, dicari dengan nama atau ID'],
      ['Pesanan makan harian (MBR) dihitung dan dikirim manual', 'Dihitung otomatis tiap pagi dari roster; admin tinggal memeriksa dan menyetujui'],
      ['Aturan kerja hanya diingat orang (mis. karyawan yang sudah berhenti tidak boleh dipesankan makan)', 'Aturan ditegakkan query dan validasi server'],
      ['Tidak ada jejak siapa mengubah apa', 'Setiap login dan perubahan data tercatat di <code>audit_log</code>'],
      ['File dibagikan apa adanya', 'Login per akun, hak akses per fitur']
    ],

    // halaman = file di folder demo/ yang dibuka saat kartu diklik.
    // ikon: hex, mbr, roster, karyawan, absen, afl, simper, apd, warning, todo, akses
    modul: [
      { nama: 'Mission Control', halaman: 'index.html', ikon: 'hex', teks: 'Ringkasan angka, status sistem, notifikasi, dan <b>Import Roster</b> (xlsx/csv divalidasi baris per baris).' },
      { nama: 'MBR · Meal Box Request', halaman: 'MBR_dasbord.html', ikon: 'mbr', teks: 'Pesanan makan harian per shift & lokasi; email baru terkirim setelah admin menyetujui (batas 30 menit).' },
      { nama: 'Edit Roster', halaman: 'roster.html', ikon: 'roster', teks: 'Ubah shift per orang per tanggal; hapus roster dengan pratinjau jumlah baris nyata sebelum eksekusi.' },
      { nama: 'Data Karyawan', halaman: 'karyawan.html', ikon: 'karyawan', teks: 'Profil lengkap: identitas, mess, BPJS, masa kontrak, SIMPER, skill, dan riwayat warning.' },
      { nama: 'Absensi', halaman: 'absen.html', ikon: 'absen', teks: 'Catatan ketidakhadiran, persentase kehadiran vs roster per shift, dan surat yang belum masuk.' },
      { nama: 'AFL · Cuti', halaman: 'afl.html', ikon: 'afl', teks: 'Formulir cuti sebulan ke depan dari roster, gerbang cetak, PDF AFL + Travel Request, crosscek roster vs AFL.' },
      { nama: 'SIMPER & Skill Unit', halaman: 'simper.html', ikon: 'simper', teks: 'Izin mengemudi tambang dan skill unit alat berat per karyawan, dengan peringatan masa berlaku.' },
      { nama: 'APD', halaman: 'apd.html', ikon: 'apd', teks: 'Antrean permintaan alat pelindung diri, cetak form PDF, ceklis Safety → Warehouse → diambil, hitung EXP.' },
      { nama: 'Warning', halaman: 'warning.html', ikon: 'warning', teks: 'Surat peringatan dan masa berlakunya, pembina berstatus staff, cetak form PDF dan email ke HR.' },
      { nama: 'To Do List', halaman: 'todo.html', ikon: 'todo', teks: 'Papan tugas tim dengan penugasan, tenggat, serah-terima, dan notifikasi “selesai” lintas pengguna.' },
      { nama: 'Akses & Pengguna', halaman: 'akses.html', ikon: 'akses', teks: 'Kelola akun dashboard dan hak per fitur (khusus Administrator), plus status akun MySQL & n8n.' }
    ],

    sorotan: [
      { judul: 'Otomasi MBR (n8n)', teks: 'Tiap pagi menghitung jatah makan ±306 karyawan aktif per shift dan lokasi dari roster, menyusun laporan xlsx, lalu <b>menunggu persetujuan admin</b> sebelum email terkirim. Timeout 30 menit tidak pernah terbaca sebagai “disetujui”.' },
      { judul: 'Dokumen otomatis', teks: 'Formulir cuti (AFL) + Travel Request, permintaan APD, dan surat peringatan dicetak jadi PDF dari template Google Sheets; SP juga dikirim lewat email.' },
      { judul: 'Layanan data Node.js', teks: '59 endpoint tanpa framework: login sesi (token HMAC di cookie HttpOnly), hak akses per fitur di server, query berparameter, jejak audit, dan hak database per kolom.' },
      { judul: 'Infrastruktur', teks: '5 layanan Docker Compose di Ubuntu Server (image dipin ke digest), HTTPS lewat Caddy, pemantauan otomatis, dan backup harian yang teruji pulih.' },
      { judul: 'Audit & dokumentasi', teks: 'Audit keamanan mandiri, pemulihan insiden roster terhapus massal, panduan rebuild 27 halaman, dan ERD.' },
      { judul: 'Pemantau & susulan', teks: 'Dashboard mendeteksi run n8n yang gagal, token Google putus, jadwal yang tidak jalan karena server mati — dan menawarkan “proses susulan” untuk tanggal cuti yang terlewat.' }
    ],

    keamanan: [
      'Password disimpan sebagai hash <b>scrypt</b> dengan salt per akun; penguncian 5 gagal / 15 menit.',
      'Sesi = token <b>HMAC-SHA256</b> stateless di cookie <code>HttpOnly</code> + <code>Secure</code>, TTL 12 jam.',
      'Hak fitur ditegakkan di <b>server</b> per rute; gerbang di klien hanya untuk tampilan.',
      'User MySQL per aplikasi dengan <b>least privilege</b>, sampai <code>GRANT</code> per kolom.',
      'Header keamanan (CSP, <code>X-Frame-Options</code>, <code>nosniff</code>) di Caddy.',
      'Hook <code>pre-commit</code> menolak <code>.env</code>, dump data, dan pola rahasia.'
    ],

    stack: ['Node.js 22', 'mysql2', 'pdf-lib', 'n8n 2.x', 'MySQL 9.7', 'Caddy', 'Docker Compose', 'HTML/CSS/JS vanilla', 'Google Sheets / Drive / Gmail API', 'Bash', 'Python'],

    catatanAi: 'Dikembangkan dengan bantuan Claude Code (AI coding assistant) — perancangan, keputusan, pengujian di lapangan, dan perawatannya saya kerjakan sendiri.'
  },

  /* ---------- 03 · Pengalaman (terbaru di atas) ---------- */
  pengalaman: [
    {
      waktu: 'Mar 2024 — sekarang',
      jabatan: 'Mining Production Clerk',
      tempat: 'PT. Bagas Bumi Persada · Departemen Mining',
      tugas: [                                                   // opsional — daftar tugas berpoin
        'Menyusun perhitungan roster kerja dan mengolah data kebutuhan manpower departemen.',
        'Mengelola administrasi berbasis Excel (absensi, data karyawan) dan database departemen sesuai target KPI.'
      ],
      proyek: {                                                  // opsional — hapus bila tidak ada
        nama: 'Magi System',
        ket: 'inisiatif pribadi · live di server kantor',
        poin: [
          '<b>Cakupan:</b> 11 modul (MBR, AFL, SIMPER, APD, Warning, roster, karyawan, absensi, akses, To Do) pengganti file Excel tim admin.',
          '<b>Dampak:</b> pekerjaan repetitif berjalan otomatis; data besar departemen tersimpan rapi di satu tempat.',
          '<b>Otomasi MBR:</b> tiap pagi menghitung jatah makan ±306 karyawan aktif, dikirim setelah disetujui admin.',
          '<b>Layanan data Node.js:</b> 59 endpoint dengan login sesi, hak akses per fitur, jejak audit, hak database per kolom.'
        ],
        tautan: { teks: 'Baca studi kasusnya ↑', href: '#magi' }
      }
    },
    {
      waktu: 'Sep 2022 — Jan 2023',
      jabatan: 'Website Programmer',
      tempat: 'Yasmin Borneo Sasirangan',
      ringkas: 'Membangun website untuk digitalisasi UMKM.'
    },
    {
      waktu: 'Jul — Nov 2018',
      jabatan: 'IT Support (Magang)',
      tempat: 'BPPRD Kabupaten Tabalong',
      ringkas: 'Instalasi LAN dan perbaikan komputer.'
    }
  ],

  /* ---------- 04 · Keahlian, pendidikan, sertifikasi ---------- */
  keahlian: [
    { grup: 'Automation & Integrasi', isi: ['n8n', 'ETL', 'Webhook', 'REST API', 'Google API'] },
    { grup: 'Database & Spreadsheet', isi: ['MySQL', 'Manajemen Database', 'Backup & Restore', 'ERD', 'MS Excel', 'Google Sheets'] },
    { grup: 'Backend & Infrastruktur', isi: ['Node.js', 'Docker', 'Caddy', 'Ubuntu Server', 'Git & GitHub', 'Auth & RBAC', 'Audit Trail'] },
    { grup: 'Pemrograman', isi: ['JavaScript', 'PHP', 'Python', 'Java', 'C/C++', 'HTML/CSS', 'Claude Code'] }
  ],
  sedangBelajar: ['CI/CD', 'AWS', 'Machine Learning'],

  pendidikan: [
    { nama: 'Politeknik Negeri Banjarmasin', ket: 'D3 Teknik Informatika · IPK 3,58', waktu: '2020 — 2023' },
    { nama: 'SMK Negeri 1 Tanjung', ket: 'Teknik Komputer & Jaringan', waktu: '2017 — 2020' }
  ],
  sertifikasi: [
    { nama: 'Kompetensi Digital Marketing', ket: 'Bogor', waktu: '29 Agustus 2022' },
    { nama: 'Olimpiade Jaringan Mikrotik — APJII', ket: 'Balikpapan', waktu: '19 September 2019' }
  ],

  /* ---------- 05 · Kontak ---------- */
  kontak: {
    ajakan: 'Terbuka untuk peran di bidang <b>internal tools</b>, <b>otomasi</b>, <b>data</b>, atau <b>DevOps</b> — atau sekadar ngobrol soal digitalisasi proses di lapangan.',
    email: 'andhikasamueldayalelunu@gmail.com',
    linkedin: 'https://www.linkedin.com/in/andhikasamuel-dayalelunu-341a06260',
    github: '',                                                  // mis. 'https://github.com/username' — kosong = tidak tampil
    lokasi: 'Kab. Tabalong, Kalimantan Selatan'
  }
};

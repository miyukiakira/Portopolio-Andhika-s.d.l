/* ============================================================
   MAGI//SYSTEM — Mission Control (dashboard utama)
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; index.html
   hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Isi:
     1. KONFIG        — endpoint n8n & file-bridge
     2. STYLE         — tema "warm space": cream / orange / merah
     3. MARKUP        — header, kartu misi, telemetri, kolom notifikasi
     4. STARFIELD     — latar bintang (canvas)
     5. NOTIFIKASI    — store + render + persist (localStorage)
     6. LIVE          — polling mbr_status.json & health-check n8n
     7. AKSI          — tombol MBR + Import Roster (modal upload) + Edit Roster
                        + Karyawan (data lengkap, karyawan.html)
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    // file-bridge: ditulis node "Tulis Status Web" / "Tulis Status Terkirim"
    // ke Dasbord/mbr_status.json, DIBACA lewat magi-api (butuh login) — Caddy
    // menolak /mbr_status.json langsung sejak audit 2026-10-13 (isinya email
    // penerima, KPI, URL persetujuan).
    statusUrl: MAGI.url('/webhook/mbr-status'),
    // MASA PERALIHAN: selama magi_api belum dibuat ulang (scripts/pindah-ke-compose.sh)
    // endpoint di atas belum ada -> 404 -> baca berkas lama. Hapus sesudah peralihan.
    statusUrlLama: './mbr_status.json',
    // pemantau kesehatan (magi-api sistem-status): run n8n yang gagal, token
    // Google putus, jadwal yang tidak jalan, AFL susulan, umur cadangan
    sistemUrl: MAGI.url('/webhook/sistem-status'),
    sistemMs: 60000,
    // halaman detail MBR (control deck + approval)
    mbrPage: './MBR_dasbord.html',
    // halaman edit roster (roster.html + roster.js)
    editRosterPage: './roster.html',
    // halaman data lengkap karyawan (karyawan.html + karyawan.js)
    karyawanPage: './karyawan.html',
    // halaman absensi (absen.html + absen.js)
    absenPage: './absen.html',
    // halaman akses & pengguna (akses.html + akses.js) — daftar akun server
    aksesPage: './akses.html',
    // halaman to do list (todo.html + todo.js) — catatan pekerjaan bersama
    todoPage: './todo.html',
    // halaman AFL (afl.html + afl.js) — karyawan yang mulai cuti bulan depan
    aflPage: './afl.html',
    // halaman SIMPER (simper.html + simper.js) — SIMPER/SIMPOL + skill unit per karyawan
    simperPage: './simper.html',
    // halaman APD (apd.html + apd.js) — input pengajuan APD + kirim cetak ke n8n
    apdPage: './apd.html',
    // halaman Warning (warning.html + warning.js) — surat peringatan per karyawan
    warningPage: './warning.html',
    // panel Progres AFL: persentase status AFL per bulan mulai cuti (magi-api
    // afl-rekap). Terbuka untuk SEMUA akun yang login — isinya hanya hitungan,
    // tanpa nama/ID karyawan — sebagai informasi untuk semua tim.
    aflRekapUrl: MAGI.url('/webhook/afl-rekap'),
    aflMs: 60000,
    aflBulanMaks: 3,   // bulan yang ditampilkan (terbaru dulu)
    // panel SIMPER & Skill: hitungan saja (magi-api simper-angka) — terbuka
    // untuk SEMUA akun login, tanpa nama/ID; karyawan ber-DOT tidak dihitung
    simperAngkaUrl: MAGI.url('/webhook/simper-angka'),
    simperMs: 60000,
    simperUnitMaks: 8,   // baris tabel unit sebelum "＋ N unit lainnya"
    // panel Warning Aktif: hitungan saja (magi-api warning-angka) — terbuka
    // untuk SEMUA akun login, tanpa nama/ID; karyawan ber-DOT tidak dihitung
    warningAngkaUrl: MAGI.url('/webhook/warning-angka'),
    warningMs: 60000,
    // editor n8n
    n8nBase: MAGI.n8nBase,
    // webhook import roster — BELUM ada di n8n. Siapkan workflow dengan
    // path ini (POST, multipart/form-data, field "file") lalu publish;
    // tombol "Import Roster" langsung berfungsi tanpa mengubah kode.
    rosterUrl: MAGI.url('/webhook/roster-import'),
    // ringkasan roster aktual per shift (webhook roster-summary, GET ?tgl=)
    // default tanggal = besok (dihitung di SQL), sama dgn target MBR.
    summaryUrl: MAGI.url('/webhook/roster-summary'),
    // ringkasan absensi HARI INI. Sengaja MEMAKAI ULANG webhook absen-list
    // (GET ?q=&from=&to=, default hari ini) dan meringkasnya di browser —
    // tidak ada endpoint absen-summary. Alasannya: karyawan_absen hanya
    // mencatat KETIDAKHADIRAN, jadi barisnya sedikit (puluhan/hari), dan
    // menambah workflow baru menuntut restart n8n yang membunuh eksekusi
    // yang sedang menunggu persetujuan. Kalau suatu saat absensi dicatat
    // untuk semua karyawan tiap hari, pindahkan ke workflow ringkasan
    // ber-GROUP BY — `LIMIT 2000` di absen-list adalah batas nyatanya.
    absenUrl: MAGI.url('/webhook/absen-list'),
    // kehadiran per shift kerja: roster sebagai penyebut, catatan absensi
    // sebagai pengurang (webhook absen-rate, GET ?from=&to=)
    absenRateUrl: MAGI.url('/webhook/absen-rate'),
    // Kode absensi yang dihitung sebagai TIDAK MASUK. KOSONG = setiap baris
    // di karyawan_absen dianggap tidak masuk. Sengaja begitu: arti tiap kode
    // belum terdokumentasi, dan menebak akan diam-diam menggeser persentase
    // kehadiran — angka yang justru dipakai orang untuk mengambil keputusan.
    // Isi mis. ['A','SK'] begitu artinya pasti (endpoint mengirim rincian
    // per kode, jadi penyaringan cukup di sini).
    kodeTidakMasuk: [],
    // hari yang ditampilkan panel Roster Aktual: 'kemarin' | 'hari' | 'besok'.
    // Default 'besok' — itu tanggal yang dipakai pipeline MBR, jadi panel ini
    // dan Telemetri MBR bercerita tentang hari yang sama saat halaman dibuka.
    // Pilihan pengguna menimpanya dan tersimpan di localStorage (rosterStore).
    rosterHari: 'besok',
    rosterStore: 'magi.roster.hari',
    // periode awal panel absensi: 'kemarin' | 'pekan' | 'bulan'.
    // Default 7 hari: karyawan_absen hanya mencatat ketidakhadiran, jadi
    // banyak hari memang kosong dan panel berperiode sehari akan sering
    // kosong. Pilihan pengguna menimpa ini dan tersimpan di localStorage
    // (absenStore); nilai lama 'hari' dipetakan ke 'kemarin' saat dibaca.
    absenPeriode: 'pekan',
    absenStore: 'magi.absen.periode',
    // panel To Do List di bawah kolom notifikasi — memakai ulang endpoint
    // halaman todo.html (todo-list) dan menyaring yang BELUM selesai di sini.
    // Tidak ada endpoint ringkasan tersendiri: papannya dibatasi 500 baris,
    // jadi menyaring di browser lebih murah daripada satu rute baru.
    todoUrl: MAGI.url('/webhook/todo-list'),
    // berapa pekerjaan yang muat di panel sempit ini sebelum diringkas
    // jadi "+N lainnya" — panelnya pengingat, daftar lengkapnya di todo.html
    todoMax: 8,
    // lingkup panel: 'saya' = hanya yang ditugaskan ke akun ini, 'semua' =
    // seluruh papan. Bawaannya 'saya' — panel ini pengingat pribadi di sudut
    // dashboard, papan lengkapnya ada di todo.html. Pilihan disimpan per
    // browser. Kuncinya berbeda dari saringan halaman todo.html
    // ('magi.todo.filter', yang juga bisa menunjuk pengguna tertentu): panel
    // ini hanya mengenal dua keadaan, dan memakai satu kunci bersama akan
    // membuatnya menampilkan pilihan yang tidak pernah dibuat di sini.
    todoLingkup: 'saya',
    todoStore: 'magi.todo.lingkup',
    pollMs: 5000,
    healthMs: 20000,
    summaryMs: 60000,
    absenMs: 60000,
    todoMs: 60000,
    maxNotif: 60,
    store: 'magi.notif.v1',
    kunciStore: 'magi.notif.kunci.v1',
    maxKunci: 500
  };

  /* ==========================================================
     2. STYLE
     ========================================================== */
  /* STYLE: dipindah ke berkas index.css (dimuat <link> di .html) — audit 2026-10-13 */

  /* ==========================================================
     3. MARKUP
     ========================================================== */
  var ICON_MBR =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/>' +
    '<path d="M17 3c-1.7 0-3 2-3 5s1 4 2.2 4.3L16 21"/></svg>';
  var ICON_ROSTER =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3v11"/><path d="M8 7l4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>';
  var ICON_EDIT =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  var ICON_KARYAWAN =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var ICON_ABSEN =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/>' +
    '<path d="M8 2.5v4"/><path d="M16 2.5v4"/><path d="M8.5 14.5l2.2 2.2L15.5 12"/></svg>';
  var ICON_AKSES =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M2 18v3c0 .55.45 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r="1"/></svg>';
  var ICON_TODO =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/>' +
    '<path d="m3 6 1.6 1.6L8 4.2"/><path d="m3 12 1.6 1.6L8 10.2"/><path d="m3 18 1.6 1.6L8 16.2"/></svg>';
  var ICON_AFL =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>' +
    '<path d="m9 15.5 2 2 4-4"/></svg>';
  var ICON_SIMPER =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="10.5" r="2"/>' +
    '<path d="M5 15.5c.6-1.4 1.7-2.1 3-2.1s2.4.7 3 2.1"/><path d="M14 10h4.5"/><path d="M14 13.5h3"/></svg>';
  var ICON_APD =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M2.5 16h19v2.5h-19z"/><path d="M10 8.4V5.5h4v2.9"/><path d="M7.5 10.5l1 3"/><path d="M16.5 10.5l-1 3"/></svg>';
  var ICON_WARNING =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5"/><path d="M12 17h.01"/></svg>';
  var ICON_MARK =
    '<svg class="mark" viewBox="0 0 48 48" fill="none">' +
    '<path d="M24 3l18 10.5v21L24 45 6 34.5v-21z" stroke="#FF6A1F" stroke-width="1.6"/>' +
    '<path d="M24 11l11 6.4v12.8L24 36.6 13 30.2V17.4z" stroke="#E23B32" stroke-width="1.2" opacity=".75"/>' +
    '<circle cx="24" cy="24" r="3.6" fill="#FFB03A"/>' +
    '<ellipse cx="24" cy="24" rx="17" ry="6.5" stroke="#F4EADB" stroke-width=".9" opacity=".35" transform="rotate(-28 24 24)"/>' +
    '</svg>';

  var HTML = [
    '<canvas id="stars"></canvas>',
    '<div class="wrap">',

    /* ---- header ---- */
    '<header class="hud">',
    ICON_MARK,
    '<div class="brand"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
    '<div class="sub">Mining Operations · Mission Control</div></div>',
    '<div class="hud-spacer"></div>',
    '<div class="hud-cell"><div class="k">Waktu Lokal</div><div class="v" id="clock">--:--:--</div></div>',
    '<div class="hud-div"></div>',
    '<div class="hud-cell"><div class="k">Tanggal</div><div class="v" id="today">—</div></div>',
    '<div class="hud-div"></div>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">Menghubungkan…</span></div>',
    '</header>',

    '<div class="deck">',
    '<div class="stack">',

    /* ---- konsol misi ---- */
    '<section class="panel" data-pan="konsol"><div class="p-head"><span class="idx">01</span><h2>Konsol Misi</h2>',
    '<span class="spacer"></span><span class="idx">pilih modul</span></div>',
    '<div class="p-body"><div class="missions">',
    '<button class="mission" id="btnMbr" data-feat="mbr">',
    '<span class="tag">Modul · Laporan Harian</span>',
    '<span class="ttl">' + ICON_MBR + 'MBR</span>',
    '<span class="desc">Mealbox Report — pantau pipeline, tinjau ringkasan, dan setujui pengiriman email harian.</span>',
    '<span class="go">Buka Control Deck <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission alt" id="btnRoster" data-feat="import-roster">',
    '<span class="tag">Modul · Data Master</span>',
    '<span class="ttl">' + ICON_ROSTER + 'IMPORT ROSTER</span>',
    '<span class="desc">Unggah jadwal roster karyawan (xlsx/csv) untuk periode berikutnya ke pipeline n8n.</span>',
    '<span class="go">Buka Uploader <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission edit" id="btnEditRoster" data-feat="edit-roster">',
    '<span class="tag">Modul · Data Master</span>',
    '<span class="ttl">' + ICON_EDIT + 'EDIT ROSTER</span>',
    '<span class="desc">Tinjau & sunting data roster karyawan yang sudah tersimpan di database.</span>',
    '<span class="go">Buka Editor <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission data" id="btnKaryawan" data-feat="karyawan">',
    '<span class="tag">Modul · Data Master</span>',
    '<span class="ttl">' + ICON_KARYAWAN + 'KARYAWAN</span>',
    '<span class="desc">Data lengkap seluruh karyawan — cari berdasarkan nama atau ID HO, lalu buka detailnya.</span>',
    '<span class="go">Buka Data Karyawan <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission absen" id="btnAbsen" data-feat="absen">',
    '<span class="tag">Modul · Data Master</span>',
    '<span class="ttl">' + ICON_ABSEN + 'ABSEN</span>',
    '<span class="desc">Catat & sunting absensi karyawan — cari per nama/ID HO dan tanggal, lalu ubah atau tambah data.</span>',
    '<span class="go">Buka Absensi <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission" id="btnAkses" data-feat="akses">',
    '<span class="tag">Modul · Administrasi</span>',
    '<span class="ttl">' + ICON_AKSES + 'AKSES</span>',
    '<span class="desc">Daftar semua akun yang terdaftar di server — pengguna dashboard, akun layanan/MySQL, dan akun editor n8n.</span>',
    '<span class="go">Lihat Pengguna <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission todo" id="btnTodo" data-feat="todo">',
    '<span class="tag">Modul · Catatan Kerja</span>',
    '<span class="ttl">' + ICON_TODO + 'TO DO LIST</span>',
    '<span class="desc">Catatan pekerjaan bersama — yang belum dikerjakan memerah saat tanggalnya lewat, yang selesai jadi hijau.</span>',
    '<span class="go">Buka Daftar Pekerjaan <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission afl" id="btnAfl" data-feat="afl">',
    '<span class="tag">Modul · Cuti</span>',
    '<span class="ttl">' + ICON_AFL + 'AFL</span>',
    '<span class="desc">Karyawan yang mulai cuti (FB) bulan depan menurut roster — ID, nama, dan jabatan.</span>',
    '<span class="go">Buka Dashboard AFL <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission simper" id="btnSimper" data-feat="simper">',
    '<span class="tag">Modul · Kompetensi</span>',
    '<span class="ttl">' + ICON_SIMPER + 'SIMPER</span>',
    '<span class="desc">SIMPER / SIMPOL dan skill unit karyawan — cari per nama atau ID HO untuk melihat izin, masa berlaku, dan unit yang dikuasai.</span>',
    '<span class="go">Buka Data SIMPER <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission apd" id="btnApd" data-feat="apd">',
    '<span class="tag">Modul · Keselamatan</span>',
    '<span class="ttl">' + ICON_APD + 'APD</span>',
    '<span class="desc">Pengajuan Alat Pelindung Diri — input APD per karyawan, centang yang akan dicetak, lalu kirim ke n8n.</span>',
    '<span class="go">Buka Pengajuan APD <span class="arw">→</span></span>',
    '</button>',
    '<button class="mission warning" id="btnWarning" data-feat="warning">',
    '<span class="tag">Modul · Kedisiplinan</span>',
    '<span class="ttl">' + ICON_WARNING + 'Warning</span>',
    '<span class="desc">Surat peringatan karyawan — catat pelanggaran, tingkat sanksi, tanggal, dan pembina (staff).</span>',
    '<span class="go">Buka Data Warning <span class="arw">→</span></span>',
    '</button>',
    '</div></div></section>',

    /* ---- telemetri ---- */
    '<section class="panel" data-pan="telemetri"><div class="p-head"><span class="idx">02</span><h2>Telemetri MBR</h2>',
    '<span class="spacer"></span><span class="idx" id="telState">—</span></div>',
    '<div class="p-body">',
    '<div class="tiles">',
    '<div class="tile"><div class="lab">Karyawan</div><div class="num" id="kEmp">—</div><div class="meta">terdata roster</div></div>',
    '<div class="tile"><div class="lab">Meal Box</div><div class="num o" id="kMeal">—</div><div class="meta">total porsi</div></div>',
    '<div class="tile"><div class="lab">Lokasi Aktif</div><div class="num a" id="kLoc">—</div><div class="meta">titik antar</div></div>',
    '<div class="tile"><div class="lab">Special Cash</div><div class="num r" id="kSc">—</div><div class="meta">override lokasi</div></div>',
    '</div>',
    '<div class="runline">',
    '<div>TARGET <b id="tTarget">—</b></div>',
    '<div>FILE <b id="tFile">—</b></div>',
    '<div>UPDATE <b id="tWhen">—</b></div>',
    '</div>',
    '</div></section>',

    /* ---- ringkasan roster aktual ---- */
    '<section class="panel" data-pan="roster"><div class="p-head"><span class="idx">03</span><h2>Roster Aktual</h2>',
    '<span class="spacer"></span>',
    '<button class="chip" data-rs="kemarin">Kemarin</button>',
    '<button class="chip" data-rs="hari">Hari Ini</button>',
    '<button class="chip" data-rs="besok">Besok</button>',
    '<span class="idx" id="rsState">memuat…</span></div>',
    '<div class="p-body">',
    '<div class="shifttiles" id="rsTiles"><div class="rs-empty">Memuat ringkasan roster…</div></div>',
    '<div id="rsMatrix"></div>',
    '<div class="runline">',
    '<div>TANGGAL <b id="rsDate">—</b></div>',
    '<div>TOTAL <b id="rsTotal">—</b></div>',
    '</div>',
    '</div></section>',

    /* ---- ringkasan absensi ---- */
    '<section class="panel" data-pan="absensi"><div class="p-head"><span class="idx">04</span><h2>Ringkasan Absensi</h2>',
    '<span class="spacer"></span>',
    '<button class="chip" data-ab="kemarin">Kemarin</button>',
    '<button class="chip" data-ab="pekan">7 hari</button>',
    '<button class="chip" data-ab="bulan">Bulan ini</button>',
    '<span class="idx" id="abState">memuat…</span></div>',
    '<div class="p-body">',
    '<div class="shifttiles" id="abTiles"><div class="rs-empty">Memuat ringkasan absensi…</div></div>',
    '<div class="rs-subhead">Kehadiran vs Roster</div>',
    '<div id="abRate"><div class="rs-empty">Memuat kehadiran…</div></div>',
    '<div class="runline">',
    '<div>TANGGAL <b id="abDate">—</b></div>',
    '<div>TERCATAT <b id="abTotal">—</b></div>',
    '</div>',
    '</div></section>',

    /* ---- progres AFL (informasi untuk semua tim) ---- */
    '<section class="panel" data-pan="afl"><div class="p-head"><span class="idx">05</span><h2>Progres AFL</h2>',
    '<span class="spacer"></span><span class="idx" id="aflState">memuat…</span></div>',
    '<div class="p-body">',
    '<div id="aflRows"><div class="rs-empty">Memuat progres AFL…</div></div>',
    '<div class="runline">',
    '<div>PERIODE <b id="aflPeriode">—</b></div>',
    '<div>DIPERBARUI <b id="aflWhen">—</b></div>',
    '<div id="aflLink"></div>',
    '</div>',
    '</div></section>',

    /* ---- SIMPER & skill (hitungan saja, informasi untuk semua tim) ---- */
    '<section class="panel" data-pan="simper"><div class="p-head"><span class="idx">06</span><h2>SIMPER &amp; Skill</h2>',
    '<span class="spacer"></span><span class="idx" id="spState">memuat…</span></div>',
    '<div class="p-body">',
    '<div class="shifttiles" id="spTiles"><div class="rs-empty">Memuat ringkasan SIMPER…</div></div>',
    '<div class="rs-subhead">Status Skill</div>',
    '<div class="shifttiles" id="spStatus"></div>',
    '<div class="rs-subhead">Orang per Unit</div>',
    '<div id="spUnit"></div>',
    '<div class="runline">',
    '<div>KARYAWAN AKTIF <b id="spAktif">—</b> (tanpa DOT)</div>',
    '<div>DIPERBARUI <b id="spWhen">—</b></div>',
    '<div id="spLink"></div>',
    '</div>',
    '</div></section>',

    /* ---- warning aktif (hitungan saja, informasi untuk semua tim) ---- */
    '<section class="panel" data-pan="warning"><div class="p-head"><span class="idx">07</span><h2>Warning Aktif</h2>',
    '<span class="spacer"></span><span class="idx" id="wrState">memuat…</span></div>',
    '<div class="p-body">',
    '<div class="shifttiles" id="wrTiles"><div class="rs-empty">Memuat ringkasan warning…</div></div>',
    '<div class="rs-subhead">Orang per Sanksi Aktif</div>',
    '<div class="shifttiles" id="wrSanksi"></div>',
    '<div class="runline">',
    '<div>KARYAWAN AKTIF <b id="wrAktif">—</b> (tanpa DOT)</div>',
    '<div>DIPERBARUI <b id="wrWhen">—</b></div>',
    '<div id="wrLink"></div>',
    '</div>',
    '</div></section>',

    /* ---- status sistem ---- */
    '<section class="panel" data-pan="sistem"><div class="p-head"><span class="idx">08</span><h2>Status Sistem</h2></div>',
    '<div class="p-body" style="padding-top:6px;padding-bottom:8px">',
    '<div class="svc"><span class="dot" id="dN8n"></span><span><span class="nm">n8n engine</span><br><span class="ur">' + CFG.n8nBase + '</span></span>',
    '<span class="sp"></span><span class="st" id="sN8n">cek…</span></div>',
    '<div class="svc"><span class="dot on"></span><span><span class="nm">dashboard httpd</span><br><span class="ur" id="urlSelf">—</span></span>',
    '<span class="sp"></span><span class="st">online</span></div>',
    '<div class="svc"><span class="dot" id="dBridge"></span><span><span class="nm">file-bridge</span><br><span class="ur">mbr_status (magi-api)</span></span>',
    '<span class="sp"></span><span class="st" id="sBridge">cek…</span></div>',
    '<div id="sisRows"></div>',
    '<div class="sisWarn" id="sisWarn"></div>',
    '</div></section>',

    '</div>', /* /stack */

    /* ---- kolom kanan: notifikasi + to do list ---- */
    '<div class="rail">',
    '<aside class="panel notif" data-pan="notif">',
    '<div class="p-head"><span class="idx">09</span><h2>Notifikasi</h2><span class="spacer"></span>',
    '<span class="badge zero" id="nBadge">0</span></div>',
    '<div class="filters">',
    '<button class="chip on" data-f="all">Semua</button>',
    '<button class="chip" data-f="ok">Sukses</button>',
    '<button class="chip" data-f="warn">Peringatan</button>',
    '<button class="chip" data-f="crit">Kritis</button>',
    '<button class="chip ghost" id="clearN">Bersihkan</button>',
    '</div>',
    '<div class="feed" id="feed"></div>',
    '</aside>',

    /* ---- to do list: hanya yang BELUM dikerjakan ---- */
    '<section class="panel tdpanel" data-pan="todo"><div class="p-head"><span class="idx">10</span><h2>To Do List</h2>',
    '<span class="spacer"></span>',
    '<button class="chip" data-td="saya" type="button">Saya</button>',
    '<button class="chip" data-td="semua" type="button">Semua</button>',
    '<span class="idx" id="tdState">—</span></div>',
    '<div class="tdlist" id="tdList"></div>',
    '<div class="tdfoot"><a href="' + CFG.todoPage + '">Buka To Do List →</a></div>',
    '</section>',

    '</div>', /* /rail */

    '</div>', /* /deck */

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.mbrPage + '">MBR control deck</a> · ',
    'editor n8n: <code>ssh -L 5678:127.0.0.1:5678</code> lalu buka localhost:5678</div>',
    '</div>', /* /wrap */

    /* ---- modal import roster ---- */
    '<div class="mask" id="mask">',
    '<div class="modal" role="dialog" aria-modal="true" aria-label="Import Roster">',
    '<div class="p-head"><span class="idx">↑</span><h2>Import Roster</h2><span class="spacer"></span>',
    '<span class="idx" id="mState">standby</span></div>',
    '<div class="p-body">',
    '<div class="drop" id="drop" tabindex="0">',
    '<div class="big">Tarik file ke sini</div>',
    '<div class="sm">atau klik untuk memilih · .xlsx .xls .csv</div>',
    '</div>',
    '<input type="file" id="file" accept=".xlsx,.xls,.csv" hidden>',
    '<div class="picked" id="picked"><span>▣</span><span class="fn" id="pName"></span><span class="fs" id="pSize"></span></div>',
    /* panduan format — dibuka default karena salah format = berkas ditolak */
    '<details class="fmt" open><summary>Format berkas roster</summary><div class="isi">',
    '<table><tr><th>ID HO</th><th>2026-08-16</th><th>2026-08-17</th></tr>',
    '<tr><td>XYZ00000002</td><td>D</td><td>N</td></tr>',
    '<tr><td>XYZ00000003</td><td>O</td><td class="kosong">(kosong)</td></tr></table>',
    '<ol>',
    '<li>Kolom pertama <b>wajib</b> berjudul <code>ID HO</code> (boleh <code>id_ho</code>, <code>NIK</code>, <code>ID</code>). ',
    'Judul lain membuat sistem salah menebak kolom ID.</li>',
    '<li>Satu baris = satu karyawan. ID HO harus sudah terdaftar di <b>Data Karyawan</b>.</li>',
    '<li>Judul kolom berikutnya = tanggal, satu kolom per tanggal.</li>',
    '<li>Kode shift: <code>D</code>→DS, <code>N</code>→NS, <code>O</code>→CS. Kode lain ',
    '(<code>FB</code>, <code>T</code>, <code>CB</code>, <code>TR</code>) ditulis apa adanya. ',
    '<b>Sel kosong = tidak dijadwalkan</b>, dan tidak menghapus apa pun.</li>',
    '</ol>',
    '<div class="awas"><span class="j">⚠ Penyebab penolakan paling sering</span>',
    'Kolom tanggal <b>jangan berformat “Tanggal” di Excel</b>. Blok baris judul → ',
    '<b>Format Cells → General</b>. Kalau berubah jadi angka seperti <code>46250</code>, itu <b>benar</b>. ',
    'Kalau tampil <code>8/16/26</code>, berkas akan ditolak.<br>',
    'Bentuk judul tanggal yang diterima: <code>2026-08-16</code> · <code>16/08/2026</code> · ',
    '<code>16-08-2026</code> · angka serial Excel.</div>',
    '<div class="aman"><span class="j">Yang terjadi saat impor</span>',
    'Roster lama <b>tidak dihapus</b>. Yang diganti hanya baris dengan <b>ID HO dan tanggal yang sama</b> ',
    'dengan isi berkas; karyawan lain dan tanggal lain tidak tersentuh. Baris tidak sah dilewati dan ',
    'dilaporkan — kalau tidak ada satu pun yang sah, berkas ditolak dan tidak ada yang ditulis.</div>',
    '</div></details>',
    '<div class="hint">Berkas dikirim <code>POST multipart/form-data</code> (field <code>file</code>) ke<br>',
    '<code>' + CFG.rosterUrl + '</code><br>',
    'Buat workflow n8n dengan webhook path <code>roster-import</code> lalu publish agar endpoint aktif.</div>',
    '</div>',
    '<div class="acts"><button class="btn" id="mCancel">Batal</button>',
    '<button class="btn primary" id="mSend" disabled>Kirim ke n8n</button></div>',
    '</div></div>'
  ].join('\n');

  document.getElementById('app').innerHTML = HTML;

  var $ = function (id) { return document.getElementById(id); };

  /* ==========================================================
     HAK AKSES — SEMUA modul Konsol Misi tetap tampil; tiap tombol
     diberi label kecil "Berhak akses" / "Tidak berhak akses" sesuai
     hak akun. Yang tidak berhak juga dikunci (klik -> notifikasi,
     dan config.js tetap mementalkan kalau dipaksa lewat URL).
     Administrator / sesi lama (tanpa magi.peran) = berhak semua.
     Sumber: localStorage magi.peran + magi.hak (diisi login.js).
     ========================================================== */
  (function terapkanHakAkses() {
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    var bolehSemua = (peran === '' || peran === 'Administrator');
    var izin = Array.isArray(hak) ? hak : [];
    var tombol = document.querySelectorAll('.missions .mission[data-feat]');
    Array.prototype.forEach.call(tombol, function (b) {
      var punya = bolehSemua || izin.indexOf(b.getAttribute('data-feat')) >= 0;
      b.setAttribute('data-hak', punya ? '1' : '0');
      if (!punya) b.classList.add('terkunci');
      var badge = document.createElement('span');
      badge.className = 'hakbadge ' + (punya ? 'ya' : 'tidak');
      badge.textContent = punya ? '● Berhak akses' : '○ Tidak berhak akses';
      b.appendChild(badge);
    });
  })();

  /* ==========================================================
     4. STARFIELD
     ========================================================== */
  (function starfield() {
    // Digambar SEKALI, ulang hanya saat ukuran jendela berubah. Dulu dianimasikan
    // dengan requestAnimationFrame: canvas selayar penuh digambar ulang 60x/detik
    // tanpa henti, memakan >1 inti CPU di komputer klien (diukur 2026-10-25).
    // Sama dengan latar MBR_dasbord.js.
    var cv = $('stars'), ctx = cv.getContext('2d'), tunda = null;
    function gambar() {
      var w = cv.width = window.innerWidth, h = cv.height = window.innerHeight;
      var n = Math.min(220, Math.round(w * h / 9000));
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.fillStyle = (i % 11 === 0 ? 'rgba(255,150,80,' : 'rgba(244,234,219,') + (Math.random() * 0.6 + 0.2) + ')';
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.25 + 0.25, 0, 6.284);
        ctx.fill();
      }
    }
    window.addEventListener('resize', function () { clearTimeout(tunda); tunda = setTimeout(gambar, 200); });
    gambar();
  })();

  /* ==========================================================
     5. NOTIFIKASI
     ========================================================== */
  var notes = [];
  var filter = 'all';
  var seen = {}; /* dedupe per-sesi berdasarkan key */

  function loadNotes() {
    try {
      var raw = localStorage.getItem(CFG.store);
      notes = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(notes)) notes = [];
    } catch (e) { notes = []; }
  }
  function saveNotes() {
    try { localStorage.setItem(CFG.store, JSON.stringify(notes.slice(0, CFG.maxNotif))); } catch (e) { /* quota */ }
  }

  /* Kunci kejadian yang SUDAH pernah diumumkan, disimpan terpisah dari daftar.
     Dulu dedupe notifyEvent() hanya melihat daftar notifikasi, jadi sesudah
     "Bersihkan" (atau catatan lama terdorong keluar batas maxNotif) peringatan
     yang masih dilaporkan server — mis. "Jadwal AFL tidak jalan" yang bertahan
     7 hari — ditulis ulang sebagai notifikasi baru tiap polling 60 detik. */
  function bacaKunci() {
    try {
      var a = JSON.parse(localStorage.getItem(CFG.kunciStore) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function ingatKunci(daftar) {
    daftar = daftar.filter(function (k) { return k; });
    if (!daftar.length) return;
    var a = bacaKunci().filter(function (k) { return daftar.indexOf(k) < 0; });
    a = daftar.concat(a).slice(0, CFG.maxKunci);
    try { localStorage.setItem(CFG.kunciStore, JSON.stringify(a)); } catch (e) { /* quota */ }
  }
  /* pangkas ke maxNotif; kunci catatan yang terbuang tetap diingat */
  function pangkasNotes() {
    if (notes.length <= CFG.maxNotif) return;
    ingatKunci(notes.slice(CFG.maxNotif).map(function (n) { return n && n.key; }));
    notes.length = CFG.maxNotif;
  }

  /**
   * Tambah notifikasi ke kolom kanan.
   * level  : 'info' | 'ok' | 'warn' | 'crit'
   * key    : bila diisi, notifikasi dengan key sama hanya muncul sekali
   *          per sesi (mis. "n8n offline" yang dicek tiap 20 detik).
   */
  function notify(level, icon, title, detail, key, href) {
    if (key) {
      if (seen[key]) return;
      seen[key] = 1;
    }
    notes.unshift({
      ts: Date.now(), level: level, icon: icon,
      title: title, detail: detail || '', read: false, href: href || '', key: ''
    });
    pangkasNotes();
    saveNotes();
    renderNotes();
  }
  /* lepas kunci dedupe saat kondisi pulih, supaya bisa memberi tahu lagi nanti */
  function unseen(key) { delete seen[key]; }

  /**
   * Notifikasi kejadian MBR (minta approval / terkirim / dibatalkan).
   * Kejadian yang sama bisa ditulis DUA KALI: halaman ini memantau
   * mbr_status.json sendiri, dan MBR_dasbord.js meneruskan tiga kejadian yang
   * sama ke store bersama. `evKey` = "mbr:<status>:<generatedAt>" disimpan di
   * dalam catatan, jadi penulis kedua cukup mundur.
   * Beda dari `seen` di notify(): kunci ini ikut tersimpan (lintas tab & reload),
   * bukan hanya per sesi — itu memang yang dibutuhkan, karena satu run MBR
   * hanya boleh diumumkan sekali.
   */
  function notifyEvent(evKey, level, icon, title, detail, href, cta) {
    loadNotes();                       /* baca dulu tulisan tab sebelah */
    for (var i = 0; i < notes.length; i++) {
      if (notes[i] && notes[i].key === evKey) { renderNotes(); return; }
    }
    if (bacaKunci().indexOf(evKey) >= 0) return;   /* sudah diumumkan lalu dibersihkan */
    notes.unshift({
      ts: Date.now(), level: level, icon: icon,
      title: title, detail: detail || '', read: false,
      href: href || '', cta: cta || '', key: evKey
    });
    ingatKunci([evKey]);
    pangkasNotes();
    saveNotes();
    renderNotes();
  }

  function ago(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 45) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderNotes() {
    var list = notes.filter(function (n) { return filter === 'all' || n.level === filter; });
    var feed = $('feed');
    if (!list.length) {
      feed.innerHTML = '<div class="empty">▮ tidak ada notifikasi</div>';
    } else {
      feed.innerHTML = list.map(function (n) {
        return '<div class="note ' + n.level + (n.read ? '' : ' unread') + '">' +
          '<div class="ic">' + esc(n.icon) + '</div><div class="bd">' +
          '<div class="ti">' + esc(n.title) + '</div>' +
          (n.detail ? '<div class="de">' + esc(n.detail) + '</div>' : '') +
          (n.href ? '<a class="note-go" href="' + esc(n.href) + '">' +
                    esc(n.cta || 'Tinjau & Setujui →') + '</a>' : '') +
          '<div class="tm">' + ago(n.ts) + '</div></div></div>';
      }).join('');
    }
    var unread = notes.filter(function (n) { return !n.read; }).length;
    var b = $('nBadge');
    b.textContent = unread;
    b.className = 'badge' + (unread ? '' : ' zero');
  }

  /* tandai terbaca saat kolom notifikasi disentuh */
  function markRead() {
    var changed = false;
    notes.forEach(function (n) { if (!n.read) { n.read = true; changed = true; } });
    if (changed) { saveNotes(); renderNotes(); }
  }
  $('feed').addEventListener('mouseenter', markRead);
  $('feed').addEventListener('click', markRead);

  Array.prototype.forEach.call(document.querySelectorAll('.chip[data-f]'), function (c) {
    c.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.chip[data-f]'), function (x) { x.classList.remove('on'); });
      c.classList.add('on');
      filter = c.getAttribute('data-f');
      renderNotes();
    });
  });
  $('clearN').addEventListener('click', function () {
    loadNotes();                       /* ikut tulisan tab sebelah / MBR_dasbord.js / todo.js */
    ingatKunci(notes.map(function (n) { return n && n.key; }));
    notes = [];
    saveNotes();
    renderNotes();
  });

  /* segarkan label waktu relatif tiap menit */
  setInterval(renderNotes, 60000);

  /* ==========================================================
     6. LIVE — jam, polling status, health-check
     ========================================================== */
  function clock() {
    var d = new Date();
    $('clock').textContent = d.toLocaleTimeString('id-ID', { hour12: false });
    $('today').textContent = d.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }
  setInterval(clock, 1000);
  clock();

  var nf = new Intl.NumberFormat('id-ID');
  function num(v) { return (v === 0 || v) ? nf.format(v) : '—'; }

  function setLink(state, txt) {
    $('linkDot').className = 'dot ' + state;
    $('linkTxt').textContent = txt;
  }

  /* penanda di judul tab browser — terlihat walau tab tidak aktif (mis. run terjadwal) */
  var BASE_TITLE = document.title;
  function setTitleAlert(on) {
    document.title = on ? '⏳ PERLU APPROVAL — ' + BASE_TITLE : BASE_TITLE;
  }

  var lastFlag = null, lastGen = null, bridgeOk = null;

  function applyStatus(js) {
    var k = js.kpi || {};
    $('kEmp').textContent = num(k.emp);
    $('kMeal').textContent = num(k.meal);
    $('kLoc').textContent = num(k.activeLoc);
    $('kSc').textContent = num(k.sc);
    $('tTarget').textContent = js.target || '—';
    $('tFile').textContent = js.file || '—';
    $('tWhen').textContent = js.generatedAt
      ? new Date(js.generatedAt).toLocaleString('id-ID', { hour12: false })
      : '—';

    var flag = js.status || 'idle';
    if (flag === 'sent') {
      $('telState').textContent = 'terkirim';
      setLink('on', 'Terkirim');
    } else if (flag === 'pending') {
      $('telState').textContent = 'menunggu persetujuan';
      setLink('wait', 'Perlu approval');
    } else if (flag === 'expired') {
      $('telState').textContent = 'dibatalkan (kedaluwarsa)';
      setLink('off', 'Approval kedaluwarsa');
    } else {
      $('telState').textContent = flag;
      setLink('on', 'Terhubung');
    }

    /* notifikasi hanya saat status / run berubah — bukan tiap polling.
       Kunci kejadian dipakai bersama MBR_dasbord.js supaya tidak dobel. */
    var gen = js.generatedAt || '';
    var ev = 'mbr:' + flag + ':' + gen;
    var firstLoad = (lastFlag === null);
    if (flag === 'pending' && (firstLoad || gen !== lastGen || lastFlag !== 'pending')) {
      /* ALERT approval — merah, menonjol, bisa diklik langsung ke Control Deck */
      notifyEvent(ev, 'crit', '⏳', 'MBR MENUNGGU PERSETUJUAN ANDA',
        'Tinjau & setujui di Control Deck · ' + num(k.meal) + ' box · ' + (js.target || ''),
        CFG.mbrPage);
    } else if (flag === 'sent' && (firstLoad || lastFlag !== 'sent')) {
      notifyEvent(ev, 'ok', '📧', 'Email MBR terkirim',
        (js.email && js.email.to) ? 'ke ' + js.email.to : (js.file || ''));
    } else if (flag === 'expired' && (firstLoad || lastFlag !== 'expired')) {
      /* node "Status Kadaluarsa": Wait 30 menit habis tanpa approve → IF
         "Disetujui?" ambil cabang FALSE, email TIDAK pernah dikirim */
      notifyEvent(ev, 'crit', '⛔', 'MBR DIBATALKAN — tidak ada persetujuan',
        'Batas 30 menit terlewat · email tidak dikirim · ' + (js.target || ''),
        CFG.mbrPage, 'Buka Control Deck →');
    } else if (firstLoad) {
      notify('info', '◈', 'Mission control siap', 'status terakhir: ' + flag);
    }
    setTitleAlert(flag === 'pending');   // kedip di judul tab saat perlu approval
    lastFlag = flag;
    lastGen = gen;
  }

  async function pollStatus() {
    try {
      var res = await fetch(CFG.statusUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.status === 404 && CFG.statusUrlLama) res = await fetch(CFG.statusUrlLama + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var js = await res.json();
      $('dBridge').className = 'dot on';
      $('sBridge').textContent = 'aktif';
      if (bridgeOk === false) {
        unseen('bridge-down');
        notify('ok', '✔', 'File-bridge pulih', 'status MBR terbaca kembali');
      }
      bridgeOk = true;
      applyStatus(js);
    } catch (e) {
      $('dBridge').className = 'dot off';
      $('sBridge').textContent = 'gagal';
      setLink('off', 'Bridge terputus');
      bridgeOk = false;
      notify('crit', '✖', 'Gagal membaca status MBR',
        (e.message || e) + ' · cek container magi_api (endpoint mbr-status)', 'bridge-down');
    }
  }

  var n8nOk = null;
  async function checkN8n() {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, 4000);
    try {
      /* no-cors: respons opaque tetap menandakan servernya hidup */
      await fetch(CFG.n8nBase + '/healthz?t=' + Date.now(), {
        mode: 'no-cors', cache: 'no-store', signal: ctl.signal
      });
      $('dN8n').className = 'dot on';
      $('sN8n').textContent = 'online';
      if (n8nOk === false) {
        unseen('n8n-down');
        notify('ok', '🛰', 'n8n kembali online', CFG.n8nBase);
      }
      n8nOk = true;
    } catch (e) {
      $('dN8n').className = 'dot off';
      $('sN8n').textContent = 'offline';
      n8nOk = false;
      notify('warn', '⚠', 'n8n tidak merespons',
        'cek container n8n (docker compose ps)', 'n8n-down');
    } finally {
      clearTimeout(t);
    }
  }

  /* ==========================================================
     6a. PEMANTAU SISTEM (magi-api sistem-status) — audit 2026-10-13
     Satu baris per workflow n8n + cadangan, dan kotak peringatan.
     Tiap peringatan juga masuk kolom Notifikasi SEKALI (kunci tersimpan
     "sys:<kode>" — kode dari server sudah memuat id run / tanggal, jadi
     kejadian baru memberi tahu lagi, kejadian lama tidak berulang).
     ========================================================== */
  function jamLalu(iso) {
    var t = Date.parse(iso || '');
    if (!isFinite(t)) return '—';
    return ago(t);
  }
  function barisSistem(dot, nama, ket, st) {
    return '<div class="svc"><span class="dot ' + dot + '"></span><span><span class="nm">' + esc(nama) +
      '</span><br><span class="ur">' + esc(ket) + '</span></span><span class="sp"></span>' +
      '<span class="st">' + esc(st) + '</span></div>';
  }
  function renderSistem(d) {
    var html = '';
    (d.workflow || []).forEach(function (w) {
      if (!w.ada) { html += barisSistem('off', w.label, 'workflow tidak ditemukan di n8n', 'hilang'); return; }
      var t = w.terakhir;
      var gagal = t && (t.status === 'error' || t.status === 'crashed');
      var dot = gagal || w.google_putus ? 'off' : (w.jadwal_terlewat && w.jadwal_terlewat.length ? 'wait' : 'on');
      var ket = (w.jadwal ? 'jadwal ' + w.jadwal + ' · ' : '') +
        (t ? 'run #' + t.id + ' ' + jamLalu(t.mulai) : 'belum pernah jalan');
      var st = w.google_putus ? 'token google' : (gagal ? 'gagal' : (t ? t.status : '—'));
      if (!w.aktif && w.kunci !== 'impor') { dot = 'wait'; st = 'nonaktif'; }
      html += barisSistem(dot, 'workflow ' + w.label, ket, st);
    });
    var b = d.backup || {};
    if (b.tanpa_mount) html += barisSistem('wait', 'cadangan', 'status belum terbaca — magi_api perlu dibuat ulang', 'menunggu');
    else if (!b.ada) html += barisSistem('off', 'cadangan', 'belum ada cadangan otomatis', 'tidak ada');
    else {
      var lama = b.umur_jam === null || b.umur_jam > 26;
      html += barisSistem(!b.ok_terakhir || b.umur_jam > 72 ? 'off' : (lama ? 'wait' : 'on'), 'cadangan',
        'terakhir ' + jamLalu(b.sukses_terakhir) + (b.ukuran ? ' · ' + Math.round(b.ukuran / 1048576) + ' MB' : ''),
        b.ok_terakhir ? (lama ? 'basi' : 'ok') : 'gagal');
    }
    $('sisRows').innerHTML = html;
    $('sisWarn').innerHTML = (d.peringatan || []).map(function (p) {
      return '<div class="w ' + (p.tingkat === 'crit' ? 'crit' : '') + '"><b>' + esc(p.judul) + '</b><span>' + esc(p.detail) + '</span></div>';
    }).join('');
    (d.peringatan || []).forEach(function (p) {
      var href = /^afl-susulan/.test(p.kode) ? CFG.aflPage : '';
      notifyEvent('sys:' + p.kode, p.tingkat === 'crit' ? 'crit' : 'warn', p.tingkat === 'crit' ? '✖' : '⚠',
        p.judul, p.detail, href, href ? 'Buka AFL →' : '');
    });
  }
  async function pollSistem() {
    try {
      var res = await fetch(CFG.sistemUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.status === 404) {
        // magi_api lama (sebelum scripts/pindah-ke-compose.sh) belum punya endpoint ini
        $('sisRows').innerHTML = barisSistem('wait', 'pemantau sistem', 'belum aktif — magi_api perlu dibuat ulang (scripts/pindah-ke-compose.sh)', 'menunggu');
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderSistem(await res.json());
      unseen('sistem-down');
    } catch (e) {
      $('sisRows').innerHTML = barisSistem('off', 'pemantau sistem', 'sistem-status tidak terbaca — ' + (e.message || e), 'gagal');
      notify('warn', '⚠', 'Pemantau sistem tidak terbaca', String(e.message || e) + ' · cek container magi_api', 'sistem-down');
    }
  }

  /* ==========================================================
     6b. RINGKASAN ROSTER AKTUAL (webhook roster-summary)
     ========================================================== */
  /* label deskriptif per kode shift; hanya DS/NS/CS yang shift kerja
     (meal-eligible), sisanya diperlakukan cuti/off oleh Logic pesan MBR */
  var SHIFT_LABEL = {
    DS: 'Day Shift', NS: 'Night Shift', CS: 'Crossover',
    FB: 'Field Break', TR: 'Training', T: 'Off', CB: 'Company Business',   // CB: pemilik 2026-10-13 (semula salah ditebak 'Cuti Besar')
    '(kosong)': 'Tanpa kode'
  };

  function fmtTgl(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '—';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function renderRosterSummary(js) {
    // label kode dari katalog server (lib.KODE_ROSTER) — SHIFT_LABEL di atas
    // hanya cadangan kalau respons lama belum membawa `label`
    if (js && js.label) Object.keys(js.label).forEach(function (k) { SHIFT_LABEL[k] = js.label[k]; });
    var tiles = $('rsTiles');
    var shifts = (js && js.shifts) || [];
    var total = (js && js.total) || 0;
    $('rsDate').textContent = (js && js.tgl) ? fmtTgl(js.tgl) : '—';
    $('rsTotal').textContent = (js && js.total != null) ? num(total) + ' karyawan' : '—';
    if (!shifts.length) {
      tiles.innerHTML = '<div class="rs-empty">Belum ada data roster untuk tanggal ini.</div>';
      $('rsMatrix').innerHTML = '';
      return;
    }
    tiles.innerHTML = shifts.map(function (s) {
      var code = String(s.shift || '?');
      var cls = 's-' + code.replace(/[^A-Za-z0-9]/g, '');
      var pct = total ? Math.round(s.jumlah / total * 100) : 0;
      var lbl = SHIFT_LABEL[code] || 'Lainnya';
      return '<div class="tile shift ' + cls + '"><span class="pbar" style="width:' + (total ? s.jumlah / total * 100 : 0) + '%"' +
        ' title="' + esc(code + ': ' + num(s.jumlah) + ' dari ' + num(total) + ' karyawan (' + pct + '%)') + '"></span>' +
        '<div class="lab">' + esc(code) + '</div>' +
        '<div class="num">' + num(s.jumlah) + '</div>' +
        '<div class="meta">' + esc(lbl) + ' · ' + pct + '%</div></div>';
    }).join('');
    renderRosterMatrix(js);
  }

  /* tabel rincian: baris = jabatan, kolom = kode shift, sel = jumlah */
  function renderRosterMatrix(js) {
    var el = $('rsMatrix');
    var codes = (js && js.shiftCodes) || [];
    var roles = (js && js.roles) || [];
    if (!roles.length || !codes.length) { el.innerHTML = ''; return; }
    var shiftTot = {};
    ((js && js.shifts) || []).forEach(function (s) { shiftTot[s.shift] = s.jumlah; });

    var head = '<tr><th class="jab">Jabatan</th>' +
      codes.map(function (c) {
        return '<th class="h-' + c.replace(/[^A-Za-z0-9]/g, '') + '">' + esc(c) + '</th>';
      }).join('') + '<th>Total</th></tr>';

    var total = (js && js.total) || 0;
    // sel jabatan: bar transparan selebar porsinya dari total karyawan tanggal itu
    var selJab = function (nama, n, label) {
      var p = total ? n / total * 100 : 0;
      return '<td class="jab"><span class="jbar" style="width:' + p + '%"></span>' +
        '<span class="jt">' + label + '</span><span class="jp">' + (p > 0 && p < 1 ? '<1' : Math.round(p)) + '%</span></td>';
    };
    var baris = function (r, kelas, label) {
      var cells = codes.map(function (c) {
        var v = (r.counts && r.counts[c]) || 0;
        return '<td class="' + (v ? '' : 'z') + '">' + (v ? num(v) : '·') + '</td>';
      }).join('');
      return '<tr' + (kelas ? ' class="' + kelas + '"' : '') + '>' + selJab(r.jabatan, r.total, label) + cells +
        '<td class="tot">' + num(r.total) + '</td></tr>';
    };
    var KEL_LABEL = { 'Staff': 'Staff · Sr. Staff', 'Non Staff': 'Non Staff' };
    var kelompok = (js && Array.isArray(js.kelompok)) ? js.kelompok : [];
    // Staff & Non Staff disusun terpisah: baris kelompok (subtotal per shift) lalu
    // jabatannya. Respons lama tanpa `kelompok` -> daftar gabungan seperti dulu.
    var body = kelompok.length
      ? kelompok.map(function (g) {
          return baris({ jabatan: g.kategori, total: g.total, counts: g.counts }, 'grp',
              esc(KEL_LABEL[g.kategori] || g.kategori) + ' · ' + num(g.total) + ' orang') +
            (g.roles || []).map(function (r) { return baris(r, '', esc(r.jabatan)); }).join('');
        }).join('')
      : roles.map(function (r) { return baris(r, '', esc(r.jabatan)); }).join('');

    var foot = '<tr><td class="jab">TOTAL</td>' +
      codes.map(function (c) { return '<td>' + num(shiftTot[c] || 0) + '</td>'; }).join('') +
      '<td class="tot">' + num((js && js.total) || 0) + '</td></tr>';

    el.innerHTML = '<div class="rs-subhead">Rincian per Jabatan</div>' +
      '<div class="rmatrix-wrap"><table class="rmatrix"><thead>' + head + '</thead>' +
      '<tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
  }

  /* ---- pilihan hari (chip Kemarin / Hari Ini / Besok) ------------------
     roster-summary menerima ?tgl=YYYY-MM-DD; tanpa parameter itu tanggalnya
     dihitung di MySQL sebagai DATE_ADD(CURDATE(),INTERVAL 1 DAY) — "besok"
     menurut jam server (WIB), persis yang dipakai pipeline MBR.

     Ketiga tombol diturunkan dari tanggal itu, BUKAN dari jam browser. Kalau
     "Hari Ini" dihitung sendiri di sini, komputer yang beda zona waktu (atau
     jamnya meleset sehari) akan meminta tanggal yang berbeda dari yang
     dipahami MBR, dan panelnya diam-diam bercerita tentang hari yang salah —
     tanpa pesan error, karena tanggal itu tetap tanggal yang sah. Maka
     jawaban pertama dari server dipakai sebagai jangkar dan sisanya digeser
     dari situ. */
  var RS_GESER = { kemarin: -2, hari: -1, besok: 0 };
  var RS_LABEL = { kemarin: 'kemarin', hari: 'hari ini', besok: 'besok' };
  var rsHari = CFG.rosterHari;
  try {
    var rsSimpan = localStorage.getItem(CFG.rosterStore);
    if (rsSimpan && RS_GESER[rsSimpan] != null) rsHari = rsSimpan;
  } catch (e) { /* localStorage diblokir — pakai default */ }

  var rsJangkar = '';        /* "besok" menurut server */
  var rsJangkarLokal = '';   /* tanggal lokal saat jangkar itu diambil */

  /* geser YYYY-MM-DD sejumlah n hari lewat UTC, supaya pergantian waktu
     musim panas tidak pernah menggeser hasilnya satu hari. */
  function geserHari(ymd, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + n);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  function rsTglTerpilih() {
    return rsJangkar ? geserHari(rsJangkar, RS_GESER[rsHari] || 0) : '';
  }

  var rsOk = null;
  async function ambilRingkasan(tgl) {
    var url = CFG.summaryUrl + '?t=' + Date.now() + (tgl ? '&tgl=' + encodeURIComponent(tgl) : '');
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }

  async function fetchRosterSummary() {
    try {
      /* tab yang dibiarkan terbuka melewati tengah malam: jangkarnya sudah
         basi, ambil ulang dari server. */
      if (rsJangkarLokal && rsJangkarLokal !== isoTgl(new Date())) rsJangkar = '';

      var js;
      if (!rsJangkar) {
        js = await ambilRingkasan('');        /* tanpa ?tgl → server yang menghitung besok */
        if (js && js.tgl) { rsJangkar = js.tgl; rsJangkarLokal = isoTgl(new Date()); }
        /* jawaban tadi milik "besok"; kalau bukan itu yang dipilih, minta lagi */
        if (rsHari !== 'besok' && rsJangkar) js = await ambilRingkasan(rsTglTerpilih());
      } else {
        js = await ambilRingkasan(rsTglTerpilih());
      }
      renderRosterSummary(js);
      $('rsState').textContent = RS_LABEL[rsHari] || 'aktual';
      rsOk = true;
    } catch (e) {
      $('rsState').textContent = 'gagal';
      if (rsOk !== false) {
        $('rsTiles').innerHTML = '<div class="rs-empty">Gagal memuat ringkasan roster — ' +
          esc(String(e.message || e)) + '. Pastikan service <b>magi_api</b> berjalan (endpoint <b>roster-summary</b>).</div>';
        $('rsMatrix').innerHTML = '';
        $('rsDate').textContent = '—'; $('rsTotal').textContent = '—';
      }
      rsOk = false;
    }
  }

  /* ==========================================================
     6c. RINGKASAN ABSENSI (memakai ulang webhook absen-list)
     ==========================================================
     absen-list mengembalikan BARIS, bukan ringkasan, jadi penghitungannya
     di sini. Tanpa parameter tanggal ia memakai default-nya sendiri:
     HARI INI saja (from=to=hari ini) — beda dari panel roster yang melihat
     besok. Itu memang bedanya: roster dipakai untuk merencanakan (MBR besok),
     absensi untuk melihat kenyataan hari ini. */

  /* Satu orang hanya bisa punya satu baris per hari (UNIQUE (id_ho,tgl) di
     karyawan_absen), tapi rentang tanggal bisa membuat orang yang sama muncul
     beberapa kali — jadi total dihitung sebagai jumlah ORANG yang berbeda,
     bukan jumlah baris, supaya judul "TERCATAT n karyawan" tetap jujur. */
  function ringkasAbsen(rows) {
    var perKode = {}, orang = {}, tglMin = '', tglMax = '';
    rows.forEach(function (r) {
      var kode = (r.kode || '').trim() || '(tanpa kode)';
      perKode[kode] = (perKode[kode] || 0) + 1;
      if (r.id) orang[r.id] = 1;
      if (r.tgl) {
        if (!tglMin || r.tgl < tglMin) tglMin = r.tgl;
        if (!tglMax || r.tgl > tglMax) tglMax = r.tgl;
      }
    });
    var kodes = Object.keys(perKode).map(function (k) {
      return { kode: k, jumlah: perKode[k] };
    }).sort(function (a, b) {
      return b.jumlah - a.jumlah || a.kode.localeCompare(b.kode);
    });
    return {
      kodes: kodes, baris: rows.length,
      karyawan: Object.keys(orang).length,
      tglMin: tglMin, tglMax: tglMax
    };
  }

  /* periode yang dipilih pengguna → rentang tanggal yang dikirim ke webhook.
     'pekan' = hari ini dan 6 hari ke belakang; 'bulan' = tanggal 1 s/d hari ini. */
  function isoTgl(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  var PERIODE_LABEL = { kemarin: 'kemarin', pekan: '7 hari', bulan: 'bulan ini' };
  /* Periode harian = KEMARIN, bukan hari ini: absensi dicatat untuk hari yang
     sudah lewat, jadi tanggal hari ini praktis selalu kosong. 'pekan' dan
     'bulan' tetap berakhir hari ini — keduanya jendela bergulir, dan satu hari
     kosong di ujungnya tidak mengubah angkanya. */
  function absenRange(mode) {
    var akhir = new Date(), awal = new Date();
    if (mode === 'kemarin') { akhir.setDate(akhir.getDate() - 1); awal = new Date(akhir); }
    else if (mode === 'pekan') awal.setDate(awal.getDate() - 6);
    else if (mode === 'bulan') awal.setDate(1);
    return { from: isoTgl(awal), to: isoTgl(akhir) };
  }
  var absenPeriode = CFG.absenPeriode;
  try {
    var simpan = localStorage.getItem(CFG.absenStore);
    if (simpan === 'hari') simpan = 'kemarin';   // nilai lama sebelum 2026-08-10
    if (simpan && PERIODE_LABEL[simpan]) absenPeriode = simpan;
  } catch (e) { /* localStorage diblokir — pakai default */ }

  function renderAbsenSummary(rows, range) {
    var s = ringkasAbsen(rows);
    var tiles = $('abTiles');
    /* Label memakai rentang yang DIMINTA, bukan rentang data. Kalau memakai
       tgl terkecil–terbesar dari hasil, panel "7 hari" yang cuma berisi satu
       hari akan mengaku merangkum satu hari — padahal enam hari lainnya sudah
       dilihat dan memang kosong. */
    $('abDate').textContent = (range.from === range.to)
      ? fmtTgl(range.from)
      : fmtTgl(range.from) + ' — ' + fmtTgl(range.to);
    /* Angka di tile = jumlah CATATAN, sedangkan TERCATAT = jumlah ORANG.
       Keduanya berbeda begitu periodenya lebih dari sehari — data nyata 4–10
       Agustus 2026 misalnya berisi 3 catatan tapi semuanya orang yang sama.
       Kalau hanya salah satu yang ditampilkan, tile yang berjumlah 3 di atas
       tulisan "1 karyawan" terbaca seperti salah hitung; jadi keduanya ditulis
       terang-terangan, dan disingkat saat memang sama. */
    $('abTotal').textContent = !s.baris ? '—'
      : (s.baris === s.karyawan)
        ? num(s.karyawan) + ' karyawan'
        : num(s.baris) + ' catatan · ' + num(s.karyawan) + ' karyawan';

    if (!s.kodes.length) {
      tiles.innerHTML = '<div class="rs-empty">Belum ada absensi tercatat untuk periode ini. ' +
        'Catat lewat menu <b>Absen</b>.</div>';
      return;
    }
    var terbanyak = s.kodes[0].jumlah;
    tiles.innerHTML = s.kodes.map(function (c) {
      var pct = s.baris ? Math.round(c.jumlah / s.baris * 100) : 0;
      var top = (c.jumlah === terbanyak) ? ' top' : '';
      return '<div class="tile absen' + top + '"><div class="lab">' + esc(c.kode) + '</div>' +
        '<div class="num">' + num(c.jumlah) + '</div>' +
        '<div class="meta">' + pct + '% catatan</div></div>';
    }).join('');
  }

  var abOk = null;
  async function fetchAbsenSummary() {
    var r = absenRange(absenPeriode);
    try {
      var res = await fetch(CFG.absenUrl + '?from=' + r.from + '&to=' + r.to + '&t=' + Date.now(),
        { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var rows = await res.json();
      if (!Array.isArray(rows)) rows = [];
      renderAbsenSummary(rows, r);
      $('abState').textContent = PERIODE_LABEL[absenPeriode];
      abOk = true;
    } catch (e) {
      $('abState').textContent = 'gagal';
      if (abOk !== false) {
        $('abTiles').innerHTML = '<div class="rs-empty">Gagal memuat ringkasan absensi — ' +
          esc(String(e.message || e)) + '. Pastikan service <b>magi_api</b> berjalan (endpoint <b>absen-list</b>).</div>';
        $('abDate').textContent = '—'; $('abTotal').textContent = '—';
      }
      abOk = false;
    }
  }

  /* ==========================================================
     6f. PANEL PROGRES AFL (informasi untuk semua tim)
     ----------------------------------------------------------
     Sumber: magi-api afl-rekap — sama dengan panel "Persentase AFL"
     di afl.html. Per bulan mulai cuti, tiap AFL dihitung SEKALI
     menurut status terakhirnya (full approved > revisi > sudah
     kembali > sudah dicetak > belum dicetak), jadi bar penuh = 100%.
     Terbuka untuk semua akun yang login (hanya hitungan, tanpa nama);
     tautan ke halaman AFL hanya untuk yang berhak 'afl'.
     ========================================================== */
  var AFL_STATUS = ['belum', 'dicetak', 'kembali', 'revisi', 'full_approve'];
  var AFL_LABEL = { belum: 'Belum dicetak', dicetak: 'Sudah dicetak', kembali: 'Sudah kembali',
    revisi: 'Revisi', full_approve: 'Full approved' };
  var AFL_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'];
  var BOLEH_AFL = (function () {
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    if (peran === '' || peran === 'Administrator') return true;   // '' = sesi lama
    return Array.isArray(hak) && hak.indexOf('afl') >= 0;
  })();
  function aflBulan(s) {
    var m = /^(\d{4})-(\d{2})$/.exec(s || '');
    return m ? AFL_BULAN[+m[2] - 1] + ' ' + m[1] : (s || '—');
  }
  function aflPct(n, t) { return t ? pct1(n * 100 / t) + '%' : '—'; }
  function aflBaris(o, d) {
    var t = o.total || 0;
    var tercetak = t - (o.belum || 0);
    var m = /^(\d{4})-(\d{2})$/.exec(o.bulan || '');
    var akhir = m ? new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10) : '';
    var bar = t ? AFL_STATUS.map(function (k) {
      var n = o[k] || 0;
      return n ? '<span class="ak-' + k + '" style="width:' + (n * 100 / t) + '%" title="' +
        esc(AFL_LABEL[k] + ' ' + aflPct(n, t) + ' (' + n + ' AFL)') + '"></span>' : '';
    }).join('') : '';
    var lgd = AFL_STATUS.map(function (k) {
      var n = o[k] || 0;
      return '<div class="it"><span class="sw ak-' + k + '"></span>' + esc(AFL_LABEL[k]) +
        '<span class="p">' + aflPct(n, t) + '</span><span class="n">' + num(n) + ' AFL</span></div>';
    }).join('');
    var sub = [];
    if (o.belum) {
      sub.push(num(o.belum) + ' belum dicetak: ' + num(o.belum_waktunya || 0) + ' belum waktunya · ' +
        num(o.sudah_waktunya || 0) + ' sudah waktunya');
    }
    var html = '<div class="aflrow"><div class="aflhead"><span class="bl">Cuti ' + esc(aflBulan(o.bulan)) + '</span>' +
      '<span class="tt">' + num(t) + ' AFL</span>' +
      '<span class="jd"><b>' + aflPct(tercetak, t) + '</b> sudah tercetak</span></div>' +
      '<div class="aflbar">' + bar + '</div><div class="afllgd">' + lgd + '</div>';
    if (sub.length) html += '<div class="aflsub">' + esc(sub.join(' · ')) + '</div>';
    if (akhir && d.roster_sampai && d.roster_sampai < akhir) {
      html += '<div class="aflsub amber">Roster baru sampai ' + esc(tglPendek(d.roster_sampai)) +
        ' — total bulan ini belum lengkap.</div>';
    }
    return html + '</div>';
  }
  function renderAflRekap(d) {
    var bl = (d && Array.isArray(d.bulan)) ? d.bulan.slice() : [];
    if (!bl.length) {
      $('aflRows').innerHTML = '<div class="rs-empty">Belum ada data AFL.</div>';
      $('aflPeriode').textContent = '—';
      return;
    }
    bl.reverse();   // terbaru dulu
    var tampil = bl.slice(0, CFG.aflBulanMaks);
    $('aflRows').innerHTML = tampil.map(function (o) { return aflBaris(o, d); }).join('');
    $('aflPeriode').textContent = tampil.length === 1 ? aflBulan(tampil[0].bulan)
      : aflBulan(tampil[tampil.length - 1].bulan) + ' – ' + aflBulan(tampil[0].bulan);
    $('aflState').textContent = 'per bulan mulai cuti';
  }
  var aflOk = null;
  async function fetchAflRekap() {
    try {
      var res = await fetch(CFG.aflRekapUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderAflRekap(await res.json());
      $('aflWhen').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      aflOk = true;
    } catch (e) {
      if (aflOk !== false) {
        $('aflRows').innerHTML = '<div class="rs-empty">Gagal memuat progres AFL — ' + esc(String(e.message || e)) + '.</div>';
        $('aflState').textContent = 'gagal';
      }
      aflOk = false;
    }
  }
  $('aflLink').innerHTML = BOLEH_AFL
    ? '<a class="afllink" href="' + CFG.aflPage + '">Buka AFL →</a>'
    : 'detail di halaman AFL (butuh hak akses AFL)';

  /* ==========================================================
     6g. PANEL SIMPER & SKILL (informasi untuk semua tim)
     ----------------------------------------------------------
     Sumber: magi-api simper-angka — hitungan yang SAMA dengan panel
     Ringkasan di simper.html, tetapi TANPA nama/ID karyawan, jadi
     terbuka untuk semua akun yang login. Karyawan yang punya DOT
     tidak dihitung. Daftar siapa saja (exp dekat, catatan) hanya di
     halaman SIMPER; tautannya hanya untuk yang berhak 'simper'.
     ========================================================== */
  var BOLEH_SIMPER = (function () {
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    if (peran === '' || peran === 'Administrator') return true;   // '' = sesi lama
    return Array.isArray(hak) && hak.indexOf('simper') >= 0;
  })();
  var spData = null;
  var spSemua = false;   // tabel unit: semua baris, atau hanya CFG.simperUnitMaks teratas
  function spTile(lab, n, kls, meta) {
    return '<div class="tile"><div class="lab">' + esc(lab) + '</div>' +
      '<div class="num' + (kls ? ' ' + kls : '') + '">' + num(n) + '</div><div class="meta">' + esc(meta) + '</div></div>';
  }
  function renderSimper(d) {
    spData = d;
    var t = d.total;
    $('spTiles').innerHTML =
      spTile('Punya SIMPER', t.punya_simper, '', 'dari ' + num(t.karyawan_aktif) + ' karyawan aktif') +
      spTile('Kedaluwarsa', t.kedaluwarsa, t.kedaluwarsa ? 'r' : '', 'sudah lewat masa berlaku') +
      spTile('Habis ≤ ' + d.batas_hari + ' hari', t.segera, t.segera ? 'a' : '', 'segera diperpanjang') +
      spTile('Bercatatan', t.catatan, '', 'SIMPER dengan catatan');
    var warna = { Full: 'g', Training: 'a', Parsial: 'b' };
    $('spStatus').innerHTML = d.status.map(function (s) {
      return spTile(s.status, s.skill, s.skill ? warna[s.status] : '', num(s.orang) + ' orang');
    }).join('');
    $('spAktif').textContent = num(t.karyawan_aktif);
    $('spState').textContent = 'karyawan aktif';
    renderSimperUnit();
  }
  function renderSimperUnit() {
    var u = spData.unit || [];
    if (!u.length) {
      $('spUnit').innerHTML = '<div class="rs-empty">Belum ada skill unit yang tercatat.</div>';
      return;
    }
    var tampil = spSemua ? u : u.slice(0, CFG.simperUnitMaks);
    var sel = function (v, k) { return '<td class="r ' + (v ? k : 'nol') + '">' + num(v) + '</td>'; };
    $('spUnit').innerHTML = '<table class="sptbl"><thead><tr><th>Unit</th><th class="r">Orang</th>' +
      '<th class="r">Full</th><th class="r"><span class="pj">Training</span><span class="pd">Trn</span></th>' +
      '<th class="r"><span class="pj">Parsial</span><span class="pd">Prs</span></th></tr></thead><tbody>' +
      tampil.map(function (x) {
        return '<tr><td><span class="un">' + esc(x.unit) + '</span><span class="uk">' + esc(x.kategori || '—') + '</span></td>' +
          sel(x.orang, 'tot') + sel(x.full, 'g') + sel(x.training, 'a') + sel(x.parsial, 'b') + '</tr>';
      }).join('') + '</tbody></table>' +
      (u.length > CFG.simperUnitMaks
        ? '<button class="chip spmore" id="spMore" type="button">' +
          (spSemua ? 'Tampilkan ' + CFG.simperUnitMaks + ' teratas' : '＋ ' + (u.length - tampil.length) + ' unit lainnya') + '</button>'
        : '');
    if ($('spMore')) $('spMore').addEventListener('click', function () { spSemua = !spSemua; renderSimperUnit(); });
  }
  var spOk = null;
  async function fetchSimper() {
    try {
      var res = await fetch(CFG.simperAngkaUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderSimper(await res.json());
      $('spWhen').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      spOk = true;
    } catch (e) {
      if (spOk !== false) {
        $('spTiles').innerHTML = '<div class="rs-empty">Gagal memuat ringkasan SIMPER — ' + esc(String(e.message || e)) + '.</div>';
        $('spStatus').innerHTML = '';
        $('spUnit').innerHTML = '';
        $('spState').textContent = 'gagal';
      }
      spOk = false;
    }
  }
  $('spLink').innerHTML = BOLEH_SIMPER
    ? '<a class="afllink" href="' + CFG.simperPage + '">Buka SIMPER →</a>'
    : 'daftar nama di halaman SIMPER (butuh hak akses SIMPER)';

  /* ==========================================================
     6h. PANEL WARNING AKTIF (informasi untuk semua tim)
     ----------------------------------------------------------
     Sumber: magi-api warning-angka — berapa karyawan yang sedang punya
     warning aktif (masa sanksi belum habis DAN status bukan Done /
     Cancel; aturan yang sama dengan warna merah di warning.html), tanpa
     nama/ID, jadi terbuka untuk semua akun login. Karyawan ber-DOT tidak
     dihitung. Siapa saja orangnya hanya di halaman Warning; tautannya
     hanya untuk yang berhak 'warning'.
     ========================================================== */
  var BOLEH_WARNING = (function () {   // juga dipakai notifikasi email warning terkirim
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    if (peran === '' || peran === 'Administrator') return true;   // '' = sesi lama
    return Array.isArray(hak) && hak.indexOf('warning') >= 0;
  })();
  // warna angka per sanksi, makin berat makin merah (selaras badge warning.css)
  var WR_WARNA = { Konseling: 'b', Pertama: 'a', Kedua: 'o', Ketiga: 'r' };
  function renderWarning(d) {
    $('wrTiles').innerHTML =
      spTile('Karyawan warning aktif', d.orang, d.orang ? 'r' : 'g', 'dari ' + num(d.karyawan_aktif) + ' karyawan aktif') +
      spTile('Warning aktif', d.warning, d.warning ? 'a' : '', 'masih dalam masa sanksi');
    $('wrSanksi').innerHTML = (d.sanksi || []).map(function (s) {
      return spTile(s.sanksi, s.orang, s.orang ? (WR_WARNA[s.sanksi] || '') : '', 'orang');
    }).join('');
    $('wrAktif').textContent = num(d.karyawan_aktif);
    $('wrState').textContent = d.orang ? d.orang + ' orang' : 'nihil';
  }
  /* Notifikasi "Email warning terkirim" untuk SEMUA pengguna — pola yang sama
     dengan "Pekerjaan selesai" (To Do): warning-angka membawa kiriman email
     berhasil terakhir (id audit_log, naik terus); browser menyimpan id
     terbesar yang sudah diumumkan (`magi.warning.email`), yang lebih baru =
     baru dikirim seseorang dan diumumkan sekali (kunci notifyEvent per id).
     Pemuatan PERTAMA di satu browser hanya menetapkan garis dasar (0 bila
     belum pernah ada kiriman) supaya riwayat lama tidak dimuntahkan.
     Nama karyawan hanya dikirim server untuk akun berhak 'warning'. */
  var WR_SEEN = 'magi.warning.email';
  /* 'YYYY-MM-DD HH:MM' (WIB, dari MySQL) -> '28 Okt 2026 13:05'
     (nama bulan = TD_BULAN di bagian To Do; sudah terisi sebelum fetch pertama selesai) */
  function wrWaktu(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(String(s || ''));
    return m ? (+m[3]) + ' ' + TD_BULAN[+m[2] - 1] + ' ' + m[1] + ' ' + m[4] : String(s || '');
  }
  function wrUmumkanTerkirim(items) {
    var simpan = null;
    try { simpan = localStorage.getItem(WR_SEEN); } catch (e) {}
    var sebelum = simpan === null ? null : (Number(simpan) || 0);
    var maks = sebelum || 0;
    (items || []).forEach(function (k) { if (k.id > maks) maks = k.id; });
    if (maks !== sebelum) { try { localStorage.setItem(WR_SEEN, String(maks)); } catch (e) {} }
    if (sebelum === null) return;
    (items || []).filter(function (k) { return k.id > sebelum; }).reverse().forEach(function (k) {
      notifyEvent('warning:email:' + k.id, 'ok', '✉',
        'Email warning terkirim' + (k.karyawan ? ': ' + k.karyawan : ''),
        'Sanksi ' + k.sanksi + ' · dikirim oleh ' + (k.oleh || 'seseorang') + ' · ' + wrWaktu(k.pada) + ' WIB',
        BOLEH_WARNING ? CFG.warningPage : '', BOLEH_WARNING ? 'Buka Warning →' : '');
    });
  }
  var wrOk = null;
  async function fetchWarning() {
    try {
      var res = await fetch(CFG.warningAngkaUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var d = await res.json();
      renderWarning(d);
      wrUmumkanTerkirim(d.terkirim);
      $('wrWhen').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      wrOk = true;
    } catch (e) {
      if (wrOk !== false) {
        $('wrTiles').innerHTML = '<div class="rs-empty">Gagal memuat ringkasan warning — ' + esc(String(e.message || e)) + '.</div>';
        $('wrSanksi').innerHTML = '';
        $('wrState').textContent = 'gagal';
      }
      wrOk = false;
    }
  }
  $('wrLink').innerHTML = BOLEH_WARNING
    ? '<a class="afllink" href="' + CFG.warningPage + '">Buka Warning →</a>'
    : 'daftar nama di halaman Warning (butuh hak akses Warning)';

  /* ==========================================================
     6e. PANEL TO DO LIST (bawah kolom notifikasi)
     ==========================================================
     Menampilkan pekerjaan yang BELUM dikerjakan saja — papan lengkapnya
     (termasuk yang sudah selesai) ada di todo.html.

     Dua hal yang sengaja begini:

     1. Tanggal aktual diambil dari `hari_ini` pada respons, BUKAN dari jam
        browser. Aturan merahnya adalah perbandingan tanggal; klien yang
        jamnya meleset akan memerahkan pekerjaan yang sebenarnya masih hari
        ini — tanggal yang sah, jadi tak pernah memunculkan error. Sama
        dengan jangkar tanggal panel Roster Aktual dan dengan todo.js.

     Warna (sama dengan todo.js kelas() dan routes/todo.js telat()):
     kuning = punya tenggat yang belum lewat (pengingat); merah = tenggat
     sudah lewat, atau tanpa tenggat dan tgl. dicatat sudah lewat.
     2. Panel disembunyikan (bukan menampilkan pesan galat) untuk akun yang
        tidak punya fitur 'todo'. Hak dibaca dari localStorage yang sama
        dengan terapkanHakAkses, jadi tidak ada permintaan yang pasti
        dijawab 403 dan tidak ada panel kosong yang mengganggu. */
  var BOLEH_TODO = (function () {
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    if (peran === '' || peran === 'Administrator') return true;   // '' = sesi lama
    return Array.isArray(hak) && hak.indexOf('todo') >= 0;
  })();

  /* Lingkup panel (chip Saya / Semua). Disaring di browser: respons todo-list
     memang sudah membawa seluruh papan beserta `dikerjakan_oleh`, jadi pindah
     lingkup tidak perlu ambil ulang dan terasa seketika. */
  var tdLingkup = (function () {
    try {
      var v = localStorage.getItem(CFG.todoStore) || '';
      if (v === 'saya' || v === 'semua') return v;
    } catch (e) { /* localStorage diblokir */ }
    return CFG.todoLingkup;
  })();
  // siapa "saya": dari respons (identitas token sesi), bukan tebakan klien
  var tdAktor = (window.MAGI && MAGI.actor) || '';
  var _tdData = null;          // respons terakhir, supaya chip bisa menggambar ulang

  // '2026-09-19' -> '19 Sep'  (tahun dibuang: panel sempit, dan yang penting
  // di sini seberapa lama tertunda, bukan tahunnya)
  var TD_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tdTgl(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? String(Number(m[3])) + ' ' + TD_BULAN[Number(m[2]) - 1] : '';
  }
  function tdSelisih(a, b) {
    var pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || ''), pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '');
    if (!pa || !pb) return 0;
    return Math.round((Date.UTC(+pb[1], +pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], +pa[2] - 1, +pa[3])) / 86400000);
  }

  /* Notifikasi "pekerjaan sudah selesai" untuk SEMUA pengguna.
     Tidak ada kanal push di sistem ini, dan tidak perlu: tiap baris membawa
     `selesai_pada` (waktu server, milidetik), dan panel ini memang sudah
     polling tiap 60 detik. Browser menyimpan stempel terbaru yang sudah
     pernah diumumkan (`magi.todo.selesai`, dipakai bersama todo.js supaya
     satu kejadian tidak diumumkan dua kali); apa pun yang lebih baru dari itu
     = baru saja diselesaikan seseorang, dan diumumkan sekali.
     Pemuatan PERTAMA di satu browser hanya menetapkan garis dasar — tanpa itu
     membuka dashboard pertama kali akan memuntahkan notifikasi untuk seluruh
     riwayat pekerjaan yang pernah selesai. */
  var TD_SEEN = 'magi.todo.selesai';
  function tdUmumkanSelesai(items) {
    var sebelum = '';
    try { sebelum = localStorage.getItem(TD_SEEN) || ''; } catch (e) {}
    var maks = sebelum, baru = [];
    items.forEach(function (t) {
      if (!t.selesai || !t.selesai_pada) return;
      if (t.selesai_pada > maks) maks = t.selesai_pada;
      if (sebelum && t.selesai_pada > sebelum) baru.push(t);
    });
    if (maks !== sebelum) { try { localStorage.setItem(TD_SEEN, maks); } catch (e) {} }
    if (!sebelum) return;
    baru.forEach(function (t) {
      notifyEvent('todo:sel:' + t.id + ':' + t.selesai_pada, 'ok', '✔',
        'Pekerjaan selesai: ' + t.pekerjaan,
        'ditandai selesai oleh ' + (t.selesai_nama || t.selesai_oleh || 'seseorang'),
        CFG.todoPage, 'Buka To Do List →');
    });
  }

  // 'telat' | 'tenggat' | '' untuk pekerjaan yang BELUM selesai
  function tdKelas(t, hariIni) {
    if (!hariIni) return '';
    if (t.tenggat) return t.tenggat < hariIni ? 'telat' : 'tenggat';
    return (t.tgl_tambah && t.tgl_tambah < hariIni) ? 'telat' : '';
  }
  function renderTodo(d) {
    _tdData = d || {};
    if (_tdData.aktor) tdAktor = _tdData.aktor;
    // notifikasi dihitung dari SELURUH papan, bukan dari hasil saringan:
    // pekerjaan orang lain yang baru selesai tetap diumumkan walau lingkup
    // sedang 'saya'
    tdUmumkanSelesai(Array.isArray(_tdData.items) ? _tdData.items : []);
    gambarTodo();
  }

  function gambarTodo() {
    var d = _tdData;
    if (!d) return;
    var hariIni = d.hari_ini || '';
    var semua = Array.isArray(d.items) ? d.items : [];
    var punyaku = (tdLingkup === 'saya');
    var belum = semua.filter(function (t) { return !t.selesai; });
    if (punyaku) {
      belum = belum.filter(function (t) {
        return !!t.dikerjakan_oleh && String(t.dikerjakan_oleh) === String(tdAktor);
      });
    }
    var telat = belum.filter(function (t) { return tdKelas(t, hariIni) === 'telat'; });
    var tenggat = belum.filter(function (t) { return tdKelas(t, hariIni) === 'tenggat'; });

    $('tdState').textContent = belum.length
      ? (belum.length + ' belum' + (tenggat.length ? ' · ' + tenggat.length + ' tenggat' : '') +
         (telat.length ? ' · ' + telat.length + ' telat' : ''))
      : 'bersih';

    if (!belum.length) {
      // lingkup 'saya' yang kosong bukan berarti papannya bersih — sebutkan
      // dan sediakan jalan keluarnya, jangan sampai pekerjaan orang lain
      // terlihat seperti tidak ada
      $('tdList').innerHTML = punyaku
        ? '<div class="tdempty">▮ tidak ada pekerjaan untuk Anda' +
          '<button class="chip" data-td="semua" type="button">Lihat semua</button></div>'
        : '<div class="tdempty">▮ tidak ada pekerjaan tertunda</div>';
      return;
    }

    // urutan sudah dari endpoint: belum selesai dulu, paling tua di atas —
    // jadi yang paling terlambat selalu jadi baris pertama.
    var tampil = belum.slice(0, CFG.todoMax);
    var html = tampil.map(function (t) {
      var k = tdKelas(t, hariIni);
      // lingkup 'semua': yang penting siapa pelaksananya. Lingkup 'saya':
      // pelaksananya sudah pasti saya, jadi yang berguna justru siapa yang
      // menitipkan pekerjaan ini.
      var siapa = punyaku
        ? (t.oleh_nama || t.oleh ? 'dari ' + esc(t.oleh_nama || t.oleh) : 'dicatat sendiri')
        : (t.dikerjakan_nama || t.dikerjakan_oleh
            ? '→ ' + esc(t.dikerjakan_nama || t.dikerjakan_oleh) : 'belum ditugaskan');
      var meta = siapa + ' · ' + (tdTgl(t.tgl_tambah) || '—');
      if (k === 'telat') {
        meta += ' · <b>' + (t.tenggat ? 'lewat tenggat ' : 'terlambat ') +
          tdSelisih(t.tenggat || t.tgl_tambah, hariIni) + ' hari</b>';
      } else if (k === 'tenggat') {
        var sisa = tdSelisih(hariIni, t.tenggat);
        meta += ' · <b>tenggat ' + tdTgl(t.tenggat) + (sisa <= 0 ? ' (hari ini)' : ' · ' + sisa + ' hari lagi') + '</b>';
      }
      return '<a class="tditem' + (k ? ' ' + k : '') + '" href="' + CFG.todoPage + '">' +
        '<span class="tdk">' + esc(t.pekerjaan) + '</span>' +
        '<span class="tdm">' + meta + '</span></a>';
    }).join('');
    if (belum.length > tampil.length) {
      html += '<span class="tdmore">+' + (belum.length - tampil.length) + ' pekerjaan lainnya</span>';
    }
    $('tdList').innerHTML = html;
  }

  var tdOk = null;
  async function fetchTodo() {
    if (!BOLEH_TODO) return;
    try {
      var res = await fetch(CFG.todoUrl + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderTodo(await res.json() || {});
      tdOk = true;
    } catch (e) {
      $('tdState').textContent = 'gagal';
      // jangan menimpa daftar yang masih terbaca dengan pesan galat setiap
      // polling gagal — tulis sekali saja, pola yang sama dengan abOk/rsOk
      if (tdOk !== false) {
        $('tdList').innerHTML = '<div class="tdempty">Gagal memuat — ' + esc(String(e.message || e)) + '</div>';
      }
      tdOk = false;
    }
  }

  /* ==========================================================
     6d. PANEL BISA DILIPAT
     ==========================================================
     Klik kepala panel → badan panel disembunyikan, tinggal judulnya; klik
     lagi → kembali. Pilihan disimpan per panel (atribut data-pan) supaya
     tata letak yang sudah diatur tidak hilang saat halaman dimuat ulang. */
  var LIPAT_KEY = 'magi.panel.lipat';

  function bacaLipat() {
    try {
      var r = JSON.parse(localStorage.getItem(LIPAT_KEY) || '[]');
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }
  function simpanLipat(daftar) {
    try { localStorage.setItem(LIPAT_KEY, JSON.stringify(daftar)); } catch (e) { /* diblokir */ }
  }

  function pasangLipatPanel() {
    var terlipat = bacaLipat();
    Array.prototype.forEach.call(document.querySelectorAll('.panel[data-pan]'), function (panel) {
      var nama = panel.getAttribute('data-pan');
      var head = panel.querySelector('.p-head');
      if (!head) return;

      /* penanda arah: ▾ terbuka, ▸ (dirotasi) saat terlipat */
      var caret = document.createElement('span');
      caret.className = 'caret';
      caret.textContent = '▾';
      caret.setAttribute('aria-hidden', 'true');
      head.appendChild(caret);

      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');

      function terapkan(lipat, simpan) {
        panel.classList.toggle('lipat', lipat);
        head.setAttribute('aria-expanded', lipat ? 'false' : 'true');
        head.setAttribute('title', lipat ? 'Klik untuk membuka panel' : 'Klik untuk melipat panel');
        if (!simpan) return;
        var daftar = bacaLipat().filter(function (n) { return n !== nama; });
        if (lipat) daftar.push(nama);
        simpanLipat(daftar);
      }
      terapkan(terlipat.indexOf(nama) >= 0, false);

      head.addEventListener('click', function (e) {
        /* kepala panel juga memuat kontrol (chip periode absensi, tombol
           Bersihkan notifikasi). Klik di atasnya harus menjalankan kontrol
           itu, bukan melipat panelnya. */
        if (e.target !== head && e.target.closest && e.target.closest('button,a,input,select,label')) return;
        terapkan(!panel.classList.contains('lipat'), true);
      });
      head.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        if (e.target !== head) return;              /* biarkan tombol di dalamnya bekerja sendiri */
        e.preventDefault();                          /* spasi jangan menggulirkan halaman */
        terapkan(!panel.classList.contains('lipat'), true);
      });
    });
  }

  /* ==========================================================
     6c-2. KEHADIRAN vs ROSTER (webhook absen-rate)
     ==========================================================
     Pertanyaannya: dari yang DIJADWALKAN masuk hari itu, berapa persen yang
     benar-benar masuk — siang dan malam dihitung terpisah. Penyebutnya roster
     (hanya shift kerja DS/NS/CS; FB/T/CB/TR memang tidak dijadwalkan masuk),
     pengurangnya baris di karyawan_absen. Keduanya dihitung server dalam SATU
     query agar mustahil memakai himpunan karyawan yang berbeda. */
  var SHIFT_FACET = { DS: 'Siang', NS: 'Malam', CS: 'Crossover' };

  function pct1(n) {
    return (Math.round(n * 10) / 10).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function tglPendek(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    return new Date(+m[1], +m[2] - 1, +m[3])
      .toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  }

  /* jumlah orang yang dihitung TIDAK MASUK pada satu hari/shift */
  function tidakMasuk(o) {
    var kode = (o && o.kode) || {};
    var pilih = CFG.kodeTidakMasuk || [];
    var n = 0;
    Object.keys(kode).forEach(function (k) {
      if (!pilih.length || pilih.indexOf(k) >= 0) n += kode[k] || 0;
    });
    return n;
  }

  /* Kolom per hari. Yang digambar adalah JUMLAH ORANG tidak masuk, bukan
     persennya: persen kehadiran bergerak di 98–100% sehingga batang 0–100%
     akan rata semua dan tidak menceritakan apa pun, sedangkan jumlah orang
     bergerak 0–3 dan langsung menunjukkan hari mana yang bermasalah.
     Persennya tetap ada sebagai angka utama di atas grafik. */
  function svgHarian(hari, judul) {
    var n = hari.length;
    if (n < 2) return '';                       // satu hari: angka saja, tanpa grafik
    var W = 240, H = 62, padB = 14, padT = 10;
    var slot = W / n;
    var lebar = Math.max(3, Math.min(24, slot - 2));   // sisakan celah 2px antar batang
    var maxV = 0;
    hari.forEach(function (h) { maxV = Math.max(maxV, tidakMasuk(h)); });
    var skala = Math.max(1, maxV);
    var tinggi = H - padB - padT;

    var batang = hari.map(function (h, i) {
      var v = tidakMasuk(h);
      var x = i * slot + (slot - lebar) / 2;
      var t = v ? Math.max(3, Math.round(v / skala * tinggi)) : 0;
      var y = padT + tinggi - t;
      var ket = tglPendek(h.tgl) + ' · ' + v + ' tidak masuk dari ' + h.roster + ' dijadwalkan';
      /* latar tipis menandai hari yang datanya ada tapi nilainya nol —
         tanpa itu, hari nol tak bisa dibedakan dari hari tanpa roster */
      return '<g><title>' + esc(ket) + '</title>' +
        '<rect class="barbg" x="' + x.toFixed(1) + '" y="' + padT + '" width="' + lebar.toFixed(1) +
        '" height="' + tinggi + '" rx="2"></rect>' +
        (v ? '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + lebar.toFixed(1) +
             '" height="' + t + '" rx="4"></rect>' +
             '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (y + t - 4).toFixed(1) + '" width="' + lebar.toFixed(1) +
             '" height="4"></rect>' : '') +
        '</g>';
    }).join('');

    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" preserveAspectRatio="none" ' +
      'aria-label="' + esc(judul + ': jumlah tidak masuk per hari, tertinggi ' + maxV + ' orang') + '">' +
      batang +
      '<line class="base" x1="0" y1="' + (padT + tinggi) + '" x2="' + W + '" y2="' + (padT + tinggi) + '"></line>' +
      '<text class="axlab" x="0" y="' + (H - 3) + '">' + esc(tglPendek(hari[0].tgl)) + '</text>' +
      '<text class="axlab" x="' + W + '" y="' + (H - 3) + '" text-anchor="end">' +
      esc(tglPendek(hari[n - 1].tgl)) + '</text>' +
      '<text class="axlab" x="0" y="' + (padT - 2) + '">' + maxV + ' org</text>' +
      '</svg>';
  }

  function facetHTML(s) {
    var nama = SHIFT_FACET[s.shift] || s.shift;
    var judul = nama + ' · ' + s.shift;
    if (!s.roster) {
      return '<div class="facet"><div class="ftitle">' + esc(judul) + '</div>' +
        '<div class="fhero kosong">tidak ada roster</div>' +
        '<div class="fmeta">tidak ada yang dijadwalkan pada periode ini</div></div>';
    }
    var absen = 0;
    s.hari.forEach(function (h) { absen += tidakMasuk(h); });
    var masuk = s.roster - absen;
    var persen = masuk / s.roster * 100;
    return '<div class="facet"><div class="ftitle">' + esc(judul) + '</div>' +
      '<div class="fhero">' + pct1(persen) + '%</div>' +
      '<div class="fmeta"><b>' + num(masuk) + '</b> masuk dari ' + num(s.roster) + ' dijadwalkan' +
      (absen ? '<br>' + num(absen) + ' tidak masuk' : '') + '</div>' +
      svgHarian(s.hari, judul) + '</div>';
  }

  function renderAbsenRate(js) {
    var el = $('abRate');
    var shifts = (js && js.shifts) || [];
    var kerja = shifts.filter(function (s) { return s.roster > 0; });
    if (!kerja.length) {
      el.innerHTML = '<div class="rs-empty">Tidak ada roster shift kerja pada periode ini.</div>';
      return;
    }
    /* Siang & Malam selalu berdampingan; Crossover hanya kalau memang ada
       orangnya — jumlahnya biasanya 2–5, tidak layak menyita satu kolom
       penuh setiap hari, tapi juga tidak boleh dihilangkan diam-diam. */
    var utama = kerja.filter(function (s) { return s.shift === 'DS' || s.shift === 'NS'; });
    var lain = kerja.filter(function (s) { return s.shift !== 'DS' && s.shift !== 'NS'; });

    var html = '<div class="facets">' + utama.map(facetHTML).join('') + '</div>';
    if (lain.length) {
      html += '<div class="rate-note">' + lain.map(function (s) {
        var absen = 0;
        s.hari.forEach(function (h) { absen += tidakMasuk(h); });
        var p = pct1((s.roster - absen) / s.roster * 100);
        return (SHIFT_FACET[s.shift] || s.shift) + ' (' + esc(s.shift) + '): <b>' + p + '%</b> · ' +
          num(s.roster - absen) + ' dari ' + num(s.roster) + ' dijadwalkan';
      }).join(' · ') + '</div>';
    }
    el.innerHTML = html;
  }

  var arOk = null;
  async function fetchAbsenRate() {
    var r = absenRange(absenPeriode);
    try {
      var res = await fetch(CFG.absenRateUrl + '?from=' + r.from + '&to=' + r.to + '&t=' + Date.now(),
        { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var js = await res.json();
      renderAbsenRate(js);
      arOk = true;
    } catch (e) {
      if (arOk !== false) {
        $('abRate').innerHTML = '<div class="rs-empty">Gagal memuat kehadiran — ' +
          esc(String(e.message || e)) + '. Pastikan service <b>magi_api</b> berjalan (endpoint <b>absen-rate</b>).</div>';
      }
      arOk = false;
    }
  }

  /* chip hari di kepala panel roster */
  function pasangChipRoster() {
    var chips = document.querySelectorAll('.chip[data-rs]');
    Array.prototype.forEach.call(chips, function (c) {
      var mode = c.getAttribute('data-rs');
      if (mode === rsHari) c.classList.add('on');
      c.addEventListener('click', function () {
        if (mode === rsHari) return;
        rsHari = mode;
        try { localStorage.setItem(CFG.rosterStore, mode); } catch (e) { /* diblokir */ }
        Array.prototype.forEach.call(chips, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        $('rsState').textContent = 'memuat…';
        rsOk = null;               /* pesan gagal boleh muncul lagi utk hari baru */
        fetchRosterSummary();
      });
    });
  }

  /* chip lingkup di kepala panel To Do List (Saya / Semua) */
  function pasangChipTodo() {
    tandaiChipTodo();
    // satu delegasi untuk chip di kepala panel DAN tombol "Lihat semua" pada
    // keadaan kosong: isi panel digambar ulang tiap polling, jadi listener
    // yang menempel pada tombolnya sendiri akan ikut terbuang
    document.addEventListener('click', function (e) {
      var b = (e.target && e.target.closest) ? e.target.closest('[data-td]') : null;
      if (!b) return;
      var mode = b.getAttribute('data-td');
      if (mode === tdLingkup) return;
      tdLingkup = mode;
      try { localStorage.setItem(CFG.todoStore, mode); } catch (e2) { /* diblokir */ }
      tandaiChipTodo();
      gambarTodo();
    });
  }
  function tandaiChipTodo() {
    var chips = document.querySelectorAll('.tdpanel .chip[data-td]');
    Array.prototype.forEach.call(chips, function (c) {
      if (c.getAttribute('data-td') === tdLingkup) c.classList.add('on');
      else c.classList.remove('on');
    });
  }

  /* chip periode di kepala panel */
  function pasangChipAbsen() {
    var chips = document.querySelectorAll('.chip[data-ab]');
    Array.prototype.forEach.call(chips, function (c) {
      var mode = c.getAttribute('data-ab');
      if (mode === absenPeriode) c.classList.add('on');
      c.addEventListener('click', function () {
        if (mode === absenPeriode) return;
        absenPeriode = mode;
        try { localStorage.setItem(CFG.absenStore, mode); } catch (e) { /* diblokir */ }
        Array.prototype.forEach.call(chips, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        $('abState').textContent = 'memuat…';
        abOk = null;               /* pesan gagal boleh muncul lagi utk periode baru */
        arOk = null;
        fetchAbsenSummary();
        fetchAbsenRate();
      });
    });
  }

  /* ==========================================================
     7. AKSI — tombol MBR, Import Roster, Edit Roster & Karyawan
     ========================================================== */
  // modul yang tidak berhak diakses akun ini: klik -> notifikasi, tidak pindah
  function terkunci(id, label) {
    var b = $(id);
    if (b && b.getAttribute('data-hak') === '0') {
      notify('warn', '🔒', 'Tidak punya hak akses', 'modul ' + label + ' — hubungi Administrator');
      return true;
    }
    return false;
  }

  $('btnMbr').addEventListener('click', function () {
    if (terkunci('btnMbr', 'MBR')) return;
    window.location.href = CFG.mbrPage;
  });

  $('btnEditRoster').addEventListener('click', function () {
    if (terkunci('btnEditRoster', 'Edit Roster')) return;
    window.location.href = CFG.editRosterPage;
  });

  $('btnKaryawan').addEventListener('click', function () {
    if (terkunci('btnKaryawan', 'Data Karyawan')) return;
    window.location.href = CFG.karyawanPage;
  });

  $('btnAbsen').addEventListener('click', function () {
    if (terkunci('btnAbsen', 'Absensi')) return;
    window.location.href = CFG.absenPage;
  });

  $('btnAkses').addEventListener('click', function () {
    if (terkunci('btnAkses', 'Akses & Pengguna')) return;
    window.location.href = CFG.aksesPage;
  });

  $('btnTodo').addEventListener('click', function () {
    if (terkunci('btnTodo', 'To Do List')) return;
    window.location.href = CFG.todoPage;
  });

  $('btnAfl').addEventListener('click', function () {
    if (terkunci('btnAfl', 'AFL')) return;
    window.location.href = CFG.aflPage;
  });

  $('btnSimper').addEventListener('click', function () {
    if (terkunci('btnSimper', 'SIMPER')) return;
    window.location.href = CFG.simperPage;
  });

  $('btnApd').addEventListener('click', function () {
    if (terkunci('btnApd', 'APD')) return;
    window.location.href = CFG.apdPage;
  });

  $('btnWarning').addEventListener('click', function () {
    if (terkunci('btnWarning', 'Warning')) return;
    window.location.href = CFG.warningPage;
  });

  var mask = $('mask'), fileInput = $('file'), staged = null;

  function openModal() {
    mask.classList.add('on');
    $('mState').textContent = 'standby';
    $('drop').focus();
  }
  function closeModal() {
    mask.classList.remove('on');
    staged = null;
    fileInput.value = '';
    $('picked').classList.remove('on');
    $('mSend').disabled = true;
  }
  function stage(f) {
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      notify('warn', '⚠', 'Format file tidak didukung', f.name + ' · gunakan .xlsx/.xls/.csv');
      return;
    }
    staged = f;
    $('pName').textContent = f.name;
    $('pSize').textContent = (f.size / 1024).toFixed(1) + ' KB';
    $('picked').classList.add('on');
    $('mSend').disabled = false;
    $('mState').textContent = 'siap kirim';
  }

  $('btnRoster').addEventListener('click', function () {
    if (terkunci('btnRoster', 'Import Roster')) return;
    openModal();
  });
  $('mCancel').addEventListener('click', closeModal);
  mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mask.classList.contains('on')) closeModal();
  });

  $('drop').addEventListener('click', function () { fileInput.click(); });
  $('drop').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', function () { stage(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    $('drop').addEventListener(ev, function (e) { e.preventDefault(); $('drop').classList.add('hot'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    $('drop').addEventListener(ev, function (e) { e.preventDefault(); $('drop').classList.remove('hot'); });
  });
  $('drop').addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) stage(e.dataTransfer.files[0]);
  });

  $('mSend').addEventListener('click', async function () {
    if (!staged) return;
    var btn = $('mSend');
    var name = staged.name;
    btn.disabled = true;
    $('mState').textContent = 'memvalidasi…';
    notify('info', '↑', 'Mengunggah & memvalidasi roster', name);

    var fd = new FormData();
    fd.append('file', staged, name);
    fd.append('filename', name);

    try {
      var res = await fetch(CFG.rosterUrl, { method: 'POST', body: fd });
      var body = {};
      try { body = await res.json(); } catch (e) { body = {}; }

      if (res.ok && body.status === 'ok') {
        /* terimpor (baris invalid dilewati) */
        $('mState').textContent = 'selesai';
        var nDates = (body.dates || []).length;
        notify('ok', '✔', 'Roster diimpor: ' + (body.imported || 0) + ' baris',
          name + (nDates ? ' · ' + nDates + ' tanggal' : ''));
        if (body.skipped) {
          notify('warn', '⚠', (body.skipped) + ' baris dilewati (tidak diimpor)',
            'id_ho tak dikenal / data tidak valid');
          (body.errors || []).slice(0, 5).forEach(function (er) {
            notify('warn', '·', 'Baris ' + (er.baris != null ? er.baris : '?') +
              (er.id_ho ? ' · ' + er.id_ho : ''), (er.masalah || []).join('; '));
          });
        }
        closeModal();
      } else if (body.status === 'invalid') {
        /* gagal validasi — TIDAK diimpor; tampilkan detail per baris */
        $('mState').textContent = 'ditolak';
        btn.disabled = false;
        notify('crit', '✖', 'Validasi gagal — data tidak diimpor',
          body.message || ((body.errorCount || 0) + ' baris bermasalah'));
        (body.errors || []).slice(0, 6).forEach(function (er) {
          notify('warn', '⚠', 'Baris ' + (er.baris != null ? er.baris : '?') +
            (er.id_ho ? ' · ' + er.id_ho : ''),
            (er.masalah || []).join('; '));
        });
        if ((body.errorCount || 0) > 6) {
          notify('warn', '…', 'Dan ' + (body.errorCount - 6) + ' baris bermasalah lainnya',
            'perbaiki file lalu unggah ulang');
        }
      } else {
        throw new Error('HTTP ' + res.status + (body.message ? ' · ' + body.message : ''));
      }
    } catch (e) {
      $('mState').textContent = 'gagal';
      btn.disabled = false;
      notify('crit', '✖', 'Import roster gagal',
        'endpoint ' + CFG.rosterUrl + ' — ' + (e.message || e));
    }
  });

  /* ==========================================================
     BOOT
     ========================================================== */
  $('urlSelf').textContent = location.origin + '/';
  loadNotes();
  /* masuk ke modul lain tidak lagi dicatat — buang sisa catatan "Membuka …"
     yang sudah tersimpan di browser dari versi sebelumnya */
  var sisaNav = notes.length;
  notes = notes.filter(function (n) {
    return !(n && n.level === 'info' && !n.key && /^Membuka /.test(n.title || ''));
  });
  if (notes.length !== sisaNav) saveNotes();
  renderNotes();

  /* Store notifikasi dibagikan dengan MBR_dasbord.html (se-origin). Saat halaman
     itu menulis notifikasi sukses ke localStorage, event 'storage' menyalakan
     pembaruan langsung di sini. (Event 'storage' hanya terpicu dari tab lain;
     saat kembali ke halaman ini via navigasi, loadNotes() di atas sudah memuatnya.) */
  window.addEventListener('storage', function (e) {
    if (e.key === CFG.store) { loadNotes(); renderNotes(); }
  });
  if (location.protocol === 'file:') {
    notify('warn', '⚠', 'Dibuka lewat file://',
      'fetch diblokir browser · buka http://localhost:8088/', 'proto');
  }
  pollStatus();
  setInterval(pollStatus, CFG.pollMs);
  checkN8n();
  setInterval(checkN8n, CFG.healthMs);
  pollSistem();
  setInterval(pollSistem, CFG.sistemMs);
  pasangChipRoster();
  fetchRosterSummary();
  setInterval(fetchRosterSummary, CFG.summaryMs);
  pasangLipatPanel();
  pasangChipAbsen();
  fetchAbsenSummary();
  setInterval(fetchAbsenSummary, CFG.absenMs);
  fetchAbsenRate();
  setInterval(fetchAbsenRate, CFG.absenMs);
  fetchAflRekap();
  setInterval(fetchAflRekap, CFG.aflMs);
  fetchSimper();
  setInterval(fetchSimper, CFG.simperMs);
  fetchWarning();
  setInterval(fetchWarning, CFG.warningMs);
  if (BOLEH_TODO) {
    pasangChipTodo();
    fetchTodo();
    setInterval(fetchTodo, CFG.todoMs);
  } else {
    // akun tanpa fitur 'todo': panelnya tidak ditampilkan sama sekali
    var pTodo = document.querySelector('.panel[data-pan="todo"]');
    if (pTodo) pTodo.hidden = true;
  }
})();

/* ============================================================
   MAGI//SYSTEM — AFL (cuti bulan depan)
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; afl.html
   hanya shell kosong berisi <div id="app">. Pola sama dengan
   todo.js/akses.js.

   Menampilkan karyawan yang MULAI cuti (shift FB) pada bulan
   kalender berikutnya: ID HO, nama, jabatan, POH, dan tanggal mulai.
   Satu baris = satu blok cuti — hari FB yang hari sebelumnya
   bukan FB, aturan yang sama dengan workflow n8n "AFL". Blok
   yang mulai bulan ini lalu menyeberang ke bulan depan tidak
   ikut (cutinya sudah berjalan).

   "Bulan depan" DIHITUNG SERVER (CURDATE() MySQL), bukan jam
   browser — klien yang jamnya meleset di sekitar pergantian
   bulan akan menampilkan bulan yang salah tanpa error apa pun.

   Kalau roster belum diimpor sampai akhir bulan depan, daftar
   ini terpotong dan tampak sama persis dengan daftar lengkap.
   Karena itu `roster_sampai` dibandingkan dengan akhir bulan dan
   peringatannya ditampilkan.

   Panel 01 "Hasil Workflow AFL" (2026-10-12) menampilkan output
   node MySQL dari eksekusi workflow n8n "AFL" yang terakhir
   berhasil — run terjadwal 08:00 maupun run manual dari editor.
   magi-api membacanya langsung dari database n8n (tidak lewat
   file di Dasbord/, yang dilayani tanpa sesi padahal isinya ID
   karyawan). Dimuat ulang tiap menit, jadi halaman yang terbuka
   saat jadwal jalan ikut berganti sendiri. Kalau run terakhir
   gagal, peringatannya tampil DAN hasil sukses sebelumnya tetap
   ditampilkan — run pagi yang gagal tidak boleh terlihat seperti
   "tidak ada yang cuti".

   Papan 02 "Cetak AFL" (2026-10-12) = gerbang seperti papan
   persetujuan MBR. Workflow berhenti di node Wait "Tunggu Cetak"
   (batas 23 jam); tombol Cetak -> POST afl-cetak -> magi-api
   melanjutkan eksekusi itu dan n8n bergerak ke node berikutnya.
   URL resume tidak pernah sampai ke browser. Keadaan papan
   (menunggu/dicetak/kedaluwarsa/...) dibaca dari eksekusi n8n
   sendiri lewat afl-run, jadi semua pengguna melihat hal yang
   sama — bukan penanda lokal seperti tombol Hold di MBR.

   Sumber data: GET  CFG.listUrl  (magi-api /webhook/afl-list)
                GET  CFG.runUrl   (magi-api /webhook/afl-run)
   Tulis:       POST CFG.cetakUrl (magi-api /webhook/afl-cetak)
                POST CFG.jalankanUrl (magi-api /webhook/afl-jalankan — tombol Jalankan ulang)
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    homePage: './index.html',
    listUrl: MAGI.url('/webhook/afl-list'),
    runUrl: MAGI.url('/webhook/afl-run'),
    cetakUrl: MAGI.url('/webhook/afl-cetak'),
    jalankanUrl: MAGI.url('/webhook/afl-jalankan'),
    pdfUrl: MAGI.url('/webhook/afl-pdf'),
    catatanUrl: MAGI.url('/webhook/afl-catatan'),
    catatanUbahUrl: MAGI.url('/webhook/afl-catatan-ubah'),
    rekapUrl: MAGI.url('/webhook/afl-rekap'),
    crosscekUrl: MAGI.url('/webhook/afl-crosscek'),
    catatanMs: 60000,   // riwayat dibaca ulang tiap menit (dipakai beberapa orang)
    runDokMs: 4000,   // selama n8n membuat PDF sesudah Cetak (±20 dtk)
    // hasil workflow dibaca ulang tiap menit: run 08:00 muncul sendiri
    // di halaman yang sedang terbuka, tanpa menekan Perbarui. Selama ada
    // run yang menunggu cetak, lebih rapat — supaya kalau orang lain sudah
    // mencetak, tombol di layar ini cepat ikut terkunci.
    runMs: 60000,
    runTungguMs: 15000,
  };
  // mode eksekusi n8n -> label yang dipahami pemakai
  var MODE = { trigger: 'terjadwal', manual: 'manual (editor n8n)', cli: 'uji (CLI)',
    webhook: 'jalankan ulang (dashboard)', retry: 'diulang', integrated: 'dipanggil workflow lain' };
  var _runId = null;        // id hasil yang sedang tampil (deteksi "baru")
  var _run = null;          // respons afl-run terakhir
  var _kirim = null;        // id eksekusi yang Cetak-nya sedang dikirim
  var _galatCetak = '';     // pesan gagal Cetak terakhir (ditampilkan di papan)
  var _ulang = null;        // {dari, sejak, pesan} selama menunggu run hasil Jalankan ulang
  var _galatUlang = '';     // pesan gagal Jalankan ulang terakhir
  var _rekap = null;        // respons afl-rekap terakhir
  var _cekTgl = '';         // tanggal crosscek yang dipilih ('' = besok menurut server)

  /* Kolom centang "Cetak" (2026-10-12). Yang disimpan adalah kunci baris
     (id_ho|awal_cuti, dikirim server sebagai `kunci`) yang centangnya DILEPAS,
     per nomor run — bawaannya semua dicetak. Disimpan di localStorage supaya
     tidak hilang saat polling menggambar ulang tabel (tiap 15 dtk selama
     menunggu) atau halaman dimuat ulang. Hanya pilihan di browser ini; yang
     mengikat adalah daftar yang dikirim saat Cetak ditekan (afl-cetak `pilih`),
     dan server mengambil datanya dari eksekusi n8n, bukan dari browser. */
  var BATAL_KEY = 'magi.afl.batal.';
  var _batal = {};          // runId -> Set kunci yang tidak dicetak
  var _cek = null;          // konteks gambar baris: {mode, batal, dicetak}
  // Panel Catatan AFL (riwayat karyawan_afl): data, kata cari, saringan warna.
  var _cat = null;
  var _catCari = '';
  var SARING_KEY = 'magi.afl.catatan.saring';
  var _catSaring = (function () {
    try { var v = localStorage.getItem(SARING_KEY) || ''; if (/^(semua|merah|oranye|hijau|terbuka)$/.test(v)) return v; } catch (e) {}
    return 'semua';
  })();
  var _revisiId = null;     // id_afl yang sedang diisi alasan revisinya (modal)
  // Run yang sedang DILIHAT (tautan "Lihat" dari catatan run menunggu / riwayat).
  // 0 = ikuti run lengkap terbaru (bawaan). Disimpan di URL (?run=) supaya bisa
  // dimuat ulang / dibagikan.
  var _lihat = (function () {
    try { return Number(new URLSearchParams(location.search).get('run')) || 0; } catch (e) { return 0; }
  })();
  var _tRun = null;
  var _gagal = { list: false, run: false };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dash(s) { s = String(s == null ? '' : s).trim(); return s === '' ? '—' : esc(s); }

  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  // '2026-11-12' -> '12 Nov 2026'
  function tglIndo(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return '';
    return String(Number(m[3])) + ' ' + BULAN[Number(m[2]) - 1] + ' ' + m[1];
  }
  // '2026-10-12 16:10' (jam server WIB, apa adanya) -> '12 Okt 2026 16.10'
  function tglJamIndo(s) {
    var m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/.exec(String(s || ''));
    return m ? tglIndo(m[1]) + ' ' + m[2] + '.' + m[3] : String(s || '');
  }
  // '2026-11-12' -> 'Kam' (lewat UTC supaya zona waktu browser tak menggeser hari)
  function hariDari(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return '';
    return HARI[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  }
  // '2026-11' -> 'November 2026'
  function bulanIndo(s) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
    if (!m) return '—';
    return BULAN_PANJANG[Number(m[2]) - 1] + ' ' + m[1];
  }

  /* ==========================================================
     STYLE — token & kelas SAMA dengan halaman lain
     ========================================================== */
  /* STYLE: dipindah ke berkas afl.css (dimuat <link> di .html) — audit 2026-10-13 */

  /* ==========================================================
     MARKUP
     ========================================================== */
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

    '<header class="hud">',
    ICON_MARK,
    '<div class="brand"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
    '<div class="sub">AFL · Cuti Bulan Depan</div></div>',
    '<div class="hud-spacer"></div>',
    '<div class="hud-cell"><div class="k">Tanggal Server</div><div class="v" id="hariIni">—</div></div>',
    '<button class="rfr" id="btnRefresh">↻ Perbarui</button>',
    '<a class="back" href="' + CFG.homePage + '">← Konsol Misi</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">memuat…</span></div>',
    '</header>',

    '<div class="lead"><b>Hasil Workflow AFL</b> = karyawan yang ditarik jadwal n8n pada run terakhirnya: mereka yang ',
    '<b>mulai cuti (FB) tepat sebulan lagi</b>. Periksa daftarnya, lalu tekan <b>Cetak</b> di papan samping — n8n baru ',
    'melanjutkan ke langkah berikutnya setelah tombol itu ditekan (batas 23 jam). ',
    '<b>Daftar Cuti Bulan Depan</b> = semua yang mulai cuti di bulan kalender berikutnya. ',
    'Di keduanya satu baris = satu cuti, dicatat pada <b>hari pertamanya</b>; karyawan yang sudah berhenti (ber-DOT) ',
    'tidak ditampilkan di daftar bulanan.</div>',

    '<div id="cekTop" class="cek-top"></div>',

    '<div class="deck">',
    '<section class="panel" id="pHasil"><div class="p-head"><span class="idx">01</span><h2>Hasil Workflow AFL</h2>',
    '<span id="runBaru"></span><span class="spacer"></span><span class="cnt" id="runCnt"></span></div>',
    '<div class="tbl-wrap"><table class="afl cek"><thead><tr>',
    '<th class="lekat l0 c-pilih"><label class="pilih-k" title="Centang / lepas semua"><input type="checkbox" id="pilihSemua" checked disabled>Cetak</label></th>',
    '<th class="c-no lekat l1">No</th><th class="lekat l2">ID HO</th><th class="lekat l3">Nama</th>',
    '<th>Jabatan</th><th>Alasan</th><th>Terakhir Kerja</th><th>Awal Cuti</th><th>Akhir Cuti</th>',
    '<th>Kembali Bekerja</th><th style="text-align:right">Hari Kerja</th><th style="text-align:right">Total Cuti</th>',
    '<th>POH</th><th>Berangkat</th><th>Balik</th><th>Status TR</th>',
    '</tr></thead><tbody id="rTb"><tr><td colspan="16" class="empty">Memuat…</td></tr></tbody></table></div>',
    '<details class="raw" id="rRaw"><summary id="rRawSum">Lihat JSON hasil node</summary><pre id="rJson">[]</pre></details>',
    '</section>',

    /* ---- 02 papan cetak ---- */
    '<section class="panel" id="pGate"><div class="p-head"><span class="idx">02</span><h2>Cetak AFL</h2></div>',
    '<div class="g-body">',
    '<div class="stat" id="stat"><span class="dot" id="statDot"></span>',
    '<div><div class="t" id="statT">Memuat…</div><div class="s" id="statS">membaca eksekusi workflow AFL</div></div></div>',
    '<dl class="kv">',
    '<dt>Run</dt><dd class="m" id="gRun">—</dd>',
    '<dt>Dibuat</dt><dd class="m" id="gWaktu">—</dd>',
    '<dt>Pemicu</dt><dd class="m" id="gMode">—</dd>',
    '<dt>Karyawan</dt><dd id="gJumlah">—</dd>',
    '<dt>Mulai cuti</dt><dd id="gTgl">—</dd>',
    '<dt id="gBatasK">Batas cetak</dt><dd class="m" id="gBatas">—</dd>',
    '<dt>Jadwal 08:00</dt><dd class="m" id="gJadwal">—</dd>',
    '</dl>',
    '<div id="gNotes"></div>',
    '<div class="dispatch"><button class="btn primary" id="btnCetak" type="button" disabled>🖨 Cetak</button></div>',
    '<div class="g-foot" id="gFoot">Setelah Cetak ditekan, n8n melanjutkan run ini ke node berikutnya. Tidak bisa dibatalkan.</div>',
    '<div class="ulang"><button class="btn" id="btnUlang" type="button" disabled>↻ Jalankan ulang</button>',
    '<div class="u-ket" id="uKet">Jalankan workflow AFL sekarang — data ditarik ulang dari roster &amp; Google Sheet.</div></div>',
    '<div id="gDok"></div>',
    '</div></section>',
    '</div>',

    '<section class="panel" id="pCek"><div class="p-head"><span class="idx">03</span><h2>Crosscek Cuti</h2>',
    '<span class="spacer"></span><div class="cek-alat">',
    '<input type="date" id="cekTgl" aria-label="Tanggal crosscek">',
    '<button class="chip" type="button" id="cekBesok">Besok</button>',
    '<span class="cnt" id="cekCnt"></span></div></div>',
    '<div id="cekBanner" class="cek-banner"></div>',
    '<div class="cek-grid">',
    '<div class="cek-kol"><div class="cek-h" id="cekHB">Berangkat cuti</div>',
    '<div class="tbl-wrap"><table class="afl cek2"><thead><tr><th>Karyawan</th><th>Roster</th><th>AFL</th><th>Hasil cek</th></tr></thead>',
    '<tbody id="cekTbB"><tr><td colspan="4" class="empty">Memuat…</td></tr></tbody></table></div></div>',
    '<div class="cek-kol"><div class="cek-h" id="cekHK">Balik cuti</div>',
    '<div class="tbl-wrap"><table class="afl cek2"><thead><tr><th>Karyawan</th><th>Roster</th><th>AFL</th><th>Hasil cek</th></tr></thead>',
    '<tbody id="cekTbK"><tr><td colspan="4" class="empty">Memuat…</td></tr></tbody></table></div></div>',
    '</div>',
    '<div class="rk-foot">',
    '<b>Berangkat</b> = awal cuti pada tanggal ini menurut roster (hari pertama blok FB) <b>atau</b> menurut AFL. ',
    '<b>Balik</b> = akhir cuti pada tanggal ini (tanggal travel balik karyawan biasa; special case kembali sehari sesudahnya). ',
    'Roster dibaca apa adanya sekarang dan dicocokkan dengan tabel karyawan_afl: ada AFL-nya, awal &amp; akhir cuti, jumlah hari cuti, ',
    'dan kode roster pada tanggal itu. <b style="color:#ffb4ae">Merah</b> = tidak sesuai. ',
    '<b style="color:var(--amber)">Kuning</b> = AFL yang berangkat belum full approve / ditandai revisi. ',
    '<b>Dengan Travel Request</b> = POH di luar Tabalong/Balangan (dicetak AFL + Travel Request); ',
    '<b>tanpa</b> = POH Tabalong/Balangan (AFL saja) — aturan yang sama dengan pemisahan POH di workflow. ',
    '<b>Jalur travel</b> (↗ berangkat, ↙ balik) = jalur yang tercetak di Travel Request; kalau belum ada, dari sheet ',
    '<b>Rute travel</b> / <b>special chase</b> pada run AFL terbaru yang membacanya. Tanggal travel: berangkat di awal cuti, ',
    'balik di akhir cuti; special case berangkat sehari sebelum cuti dan balik di hari masuk kerja. Kuning bila jalur ',
    'tidak diketahui atau sheet sudah berubah sejak TR dicetak.',
    '</div>',
    '</section>',

    '<section class="panel" id="pRekap"><div class="p-head"><span class="idx">04</span><h2>Persentase AFL</h2>',
    '<span class="spacer"></span><span class="cnt" id="rkCnt"></span></div>',
    '<div class="cat-ket">',
    '<span><span class="sw k-belum"></span>Belum dicetak</span>',
    '<span><span class="sw k-dicetak"></span>Sudah dicetak</span>',
    '<span><span class="sw k-kembali"></span>Sudah kembali (Dari Lapangan)</span>',
    '<span><span class="sw k-revisi"></span>Revisi</span>',
    '<span><span class="sw k-full_approve"></span>Full approved</span>',
    '</div>',
    '<div class="tbl-wrap"><table class="afl rekap"><thead><tr>',
    '<th>Bulan Cuti</th><th class="r">Total AFL</th><th>Belum Dicetak</th><th>Sudah Dicetak</th>',
    '<th>Sudah Kembali</th><th>Revisi</th><th>Full Approved</th><th>Komposisi</th>',
    '</tr></thead><tbody id="rkTb"><tr><td colspan="8" class="empty">Memuat…</td></tr></tbody></table></div>',
    '<div class="rk-foot" id="rkFoot"></div>',
    '</section>',

    '<section class="panel" id="pCatatan"><div class="p-head"><span class="idx">05</span><h2>Catatan AFL</h2>',
    '<span class="spacer"></span><span class="cnt" id="catCnt"></span></div>',
    '<div class="cat-ket">',
    '<span><span class="sw hijau"></span>Full approve</span>',
    '<span><span class="sw oranye"></span>Revisi</span>',
    '<span><span class="sw merah"></span>&ge; <b id="catBatas">15</b> hari sejak dicetak, Dari Lapangan &amp; Full Approve belum dicentang</span>',
    '</div>',
    '<div class="cat-alat">',
    '<input class="cat-cari" id="catCari" type="search" placeholder="Cari nama / ID HO…" aria-label="Cari catatan AFL">',
    '<button class="chip" type="button" data-saring="semua">Semua</button>',
    '<button class="chip" type="button" data-saring="merah">Merah</button>',
    '<button class="chip" type="button" data-saring="oranye">Revisi</button>',
    '<button class="chip" type="button" data-saring="hijau">Full approve</button>',
    '<button class="chip" type="button" data-saring="terbuka">Belum full approve</button>',
    '</div>',
    '<div class="tbl-wrap"><table class="afl catatan"><thead><tr>',
    '<th>ID HO</th><th>Nama</th><th>Jabatan</th><th>POH</th><th>Awal Cuti</th><th>Akhir Cuti</th>',
    '<th style="text-align:right">Cuti</th><th>Alasan</th><th>Dicetak</th>',
    '<th class="c-pilih">Dari Lapangan</th><th class="c-pilih">Full Approve</th><th class="c-pilih">Revisi</th><th>Alasan Revisi</th>',
    '</tr></thead><tbody id="catTb"><tr><td colspan="13" class="empty">Memuat…</td></tr></tbody></table></div>',
    '</section>',

    '<div class="rwarn" id="warn"></div>',

    '<div class="tiles">',
    '<div class="tile"><div class="lab">Bulan</div><div class="num sm" id="kBulan">—</div><div class="meta" id="mBulan">—</div></div>',
    '<div class="tile"><div class="lab">Karyawan Cuti</div><div class="num g" id="kOrang">—</div><div class="meta" id="mOrang">orang</div></div>',
    '<div class="tile"><div class="lab">Roster Tersedia</div><div class="num o sm" id="kRoster">—</div><div class="meta" id="mRoster">tanggal terakhir di database</div></div>',
    '</div>',

    '<section class="panel"><div class="p-head"><span class="idx">06</span><h2>Daftar Cuti Bulan Depan</h2>',
    '<span class="spacer"></span><span class="cnt" id="cnt"></span></div>',
    '<div class="p-body"><div class="tbl-wrap"><table class="afl"><thead><tr>',
    '<th class="c-no">No</th><th>ID HO</th><th>Nama</th><th>Jabatan</th><th>POH</th><th>Mulai Cuti</th>',
    '</tr></thead><tbody id="tb"><tr><td colspan="6" class="empty">Memuat…</td></tr></tbody></table></div></div></section>',

    '<div class="foot">Panel 01–02 dibaca dari eksekusi workflow n8n <b>AFL</b> (Cetak tercatat di <b>audit_log</b>); panel 03 = tabel <b>karyawan_afl</b> (setiap ubah tercatat di audit_log); panel 04 dihitung dari tabel ',
    '<b>db_mining.karyawan_roster</b> (shift <b>FB</b>) setiap kali halaman dimuat. ',
    '— <a href="' + CFG.homePage + '">Konsol Misi</a></div>',

    '</div>',

    /* ---- modal konfirmasi cetak ---- */
    '<div class="mask" id="maskRev"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mRevTitle">',
    '<div class="m-head"><h3 id="mRevTitle">Alasan Revisi</h3></div>',
    '<div class="m-body"><div id="mRevKet" style="margin-bottom:10px"></div>',
    '<textarea class="inp-rev" id="mRevTeks" maxlength="2000" placeholder="Apa yang perlu direvisi? (boleh dikosongkan)"></textarea></div>',
    '<div class="m-foot"><button class="btn" type="button" id="mRevBatal">Batal</button>',
    '<button class="btn primary" type="button" id="mRevSimpan">Simpan</button></div>',
    '</div></div>',

    '<div class="mask" id="maskUlang"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mUlangTitle">',
    '<div class="m-head"><h3 id="mUlangTitle">Jalankan Ulang Workflow AFL</h3></div>',
    '<div class="m-body" id="mUlangBody"></div>',
    '<div class="m-foot"><button class="btn" type="button" id="mUlangBatal">Batal</button>',
    '<button class="btn primary" type="button" id="mUlangYa">↻ Jalankan</button></div>',
    '</div></div>',

    '<div class="mask" id="mask"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle">Konfirmasi Cetak</h3></div>',
    '<div class="m-body" id="mBody"></div>',
    '<div class="m-foot"><button class="btn" type="button" id="mBatal">Batal</button>',
    '<button class="btn primary" type="button" id="mYa">🖨 Cetak</button></div>',
    '</div></div>',
  ].join('');

  document.addEventListener('DOMContentLoaded', function () {
    $('app').innerHTML = HTML;
    starfield();
    $('btnRefresh').addEventListener('click', function () { muat(); muatRun(); });
    $('btnCetak').addEventListener('click', tanyaCetak);
    $('rTb').addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('pilih')) ubahPilih(t.getAttribute('data-k'), t.checked);
    });
    $('pilihSemua').addEventListener('change', function () { ubahSemua(this.checked); });
    $('pGate').addEventListener('click', function (e) {
      var sus = e.target && e.target.closest ? e.target.closest('[data-susulan]') : null;
      if (sus) { e.preventDefault(); tanyaSusulan(); return; }
      var a = e.target && e.target.closest ? e.target.closest('[data-lihat]') : null;
      if (!a) return;
      e.preventDefault();
      lihatRun(a.getAttribute('data-lihat'));
    });
    $('mBatal').addEventListener('click', tutupModal);
    $('mYa').addEventListener('click', kirimCetak);
    $('mask').addEventListener('click', function (e) { if (e.target === $('mask')) tutupModal(); });
    $('btnUlang').addEventListener('click', tanyaUlang);
    $('mUlangBatal').addEventListener('click', tutupUlang);
    $('mUlangYa').addEventListener('click', kirimUlang);
    $('maskUlang').addEventListener('click', function (e) { if (e.target === $('maskUlang')) tutupUlang(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { tutupModal(); tutupRevisi(); tutupUlang(); } });
    $('catCari').addEventListener('input', function () { _catCari = this.value; renderCatatan(); });
    $('pCatatan').addEventListener('click', function (e) {
      var c = e.target && e.target.closest ? e.target.closest('[data-saring]') : null;
      if (c) { setSaring(c.getAttribute('data-saring')); return; }
      var r = e.target && e.target.closest ? e.target.closest('[data-rev]') : null;
      if (r) bukaRevisi(Number(r.getAttribute('data-rev')), true);
    });
    $('catTb').addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute('data-kol')) return;
      centangCatatan(Number(t.getAttribute('data-id')), t.getAttribute('data-kol'), t.checked, t);
    });
    $('mRevBatal').addEventListener('click', tutupRevisi);
    $('mRevSimpan').addEventListener('click', simpanRevisi);
    $('maskRev').addEventListener('click', function (e) { if (e.target === $('maskRev')) tutupRevisi(); });
    tandaSaring();
    muat();
    muatRun();
    muatCatatan();
    muatRekap();
    muatCek();
    $('cekTgl').addEventListener('change', function () { _cekTgl = this.value || ''; muatCek(); });
    $('cekBesok').addEventListener('click', function () { _cekTgl = ''; muatCek(); });
    setInterval(function () { muatCatatan(); muatRekap(); muatCek(); }, CFG.catatanMs);
    // hitung mundur batas cetak tanpa menunggu polling berikutnya
    setInterval(function () { if (_run) renderGate(_run); }, 30000);
  });

  /* ==========================================================
     LOGIKA
     ========================================================== */
  function setLink(state, txt) {
    var d = $('linkDot'), t = $('linkTxt');
    d.className = 'dot' + (state ? ' ' + state : '');
    t.textContent = txt;
  }
  // dua sumber data: pill "terhubung" hanya kalau keduanya berhasil
  function tandaLink(sumber, gagal) {
    _gagal[sumber] = gagal;
    if (_gagal.list || _gagal.run) setLink('off', _gagal.list && _gagal.run ? 'gagal' : 'sebagian gagal');
    else setLink('on', 'terhubung');
  }
  function ambil(url) {
    return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
        return b;
      });
    });
  }
  function tanpaTitik(e) { return String((e && e.message) || e).replace(/\.+$/, ''); }

  function muat() {
    setLink('wait', 'memuat…');
    ambil(CFG.listUrl)
      .then(function (d) {
        render(d || {});
        tandaLink('list', false);
      })
      .catch(function (e) {
        tandaLink('list', true);
        $('tb').innerHTML = '<tr><td colspan="6" class="empty">Gagal memuat — ' + esc(tanpaTitik(e)) + '.</td></tr>';
        $('cnt').textContent = '';
      });
  }

  /* ---------- panel 01 + 02: hasil workflow & papan cetak ---------- */
  function jadwalRun(ms) {
    clearTimeout(_tRun);
    _tRun = setTimeout(muatRun, ms);
  }
  function lihatRun(id) {
    _lihat = Number(id) || 0;
    try {
      var u = new URL(location.href);
      if (_lihat) u.searchParams.set('run', String(_lihat)); else u.searchParams.delete('run');
      history.replaceState(null, '', u.toString());
    } catch (e) {}
    _runId = null; $('runBaru').innerHTML = '';
    muatRun();
  }
  function muatRun() {
    ambil(CFG.runUrl + (_lihat ? '?id=' + encodeURIComponent(_lihat) : ''))
      .then(function (d) {
        _run = d || {};
        if (_ulang) {
          // run baru dari Jalankan ulang sudah ada dan tidak sedang berjalan -> selesai
          // menunggu; batas 90 dtk supaya catatan "menjalankan ulang" tidak menggantung
          var a = _run.terakhir;
          if ((a && a.id > _ulang.dari && !sedangJalan(_run)) || Date.now() - _ulang.sejak > 90000) _ulang = null;
        }
        if (_run.hasil) {
          rapikanBatal([_run.hasil.id].concat((_run.menunggu_lain || []).map(function (x) { return x.id; })));
        }
        renderRun(_run);
        renderGate(_run);
        tandaLink('run', false);
      })
      .catch(function (e) {
        tandaLink('run', true);
        $('stat').className = 'stat crit';
        $('statDot').className = 'dot off';
        $('statT').textContent = 'Gagal membaca workflow';
        $('statS').textContent = tanpaTitik(e);
        $('btnCetak').disabled = true;
      })
      .then(function () {
        var h = _run && _run.hasil, g = h && h.gerbang;
        jadwalRun((_ulang || (h && h.dokumen_keadaan === 'membuat')) ? CFG.runDokMs
          : (g && g.keadaan === 'menunggu' ? CFG.runTungguMs : CFG.runMs));
      });
  }

  // ISO UTC -> '12 Okt 2026 12.32' dalam jam lokal browser. Ini titik waktu,
  // bukan perbandingan tanggal, jadi jam browser aman dipakai di sini.
  function waktuLokal(iso) {
    var d = new Date(iso || '');
    if (isNaN(d.getTime())) return '—';
    var j = String(d.getHours()), m = String(d.getMinutes());
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + ' ' +
      (j.length < 2 ? '0' : '') + j + '.' + (m.length < 2 ? '0' : '') + m;
  }
  function labelMode(m) { return MODE[m] || m || '—'; }
  // sisa waktu sampai batas, mis. "22 j 41 m" — dari jam browser, hanya hiasan;
  // yang mengikat tetap waitTill di n8n (server menolak run yang sudah lewat)
  function sisa(iso) {
    var t = new Date(iso || '').getTime();
    if (isNaN(t)) return '';
    var mnt = Math.round((t - Date.now()) / 60000);
    if (mnt <= 0) return 'lewat';
    var j = Math.floor(mnt / 60), m = mnt % 60;
    return (j ? j + ' j ' : '') + m + ' m';
  }
  function rentangTgl(items) {
    var t = items.map(function (it) { return it.tgl; }).filter(Boolean).sort();
    if (!t.length) return '—';
    return t[0] === t[t.length - 1] ? tglIndo(t[0]) : tglIndo(t[0]) + ' – ' + tglIndo(t[t.length - 1]);
  }

  function renderRun(d) {
    var h = d.hasil;
    // penanda "baru" kalau hasil yang tampil berganti selagi halaman terbuka
    if (h && _runId !== null && h.id !== _runId) {
      $('runBaru').innerHTML = '<span class="baru">baru · #' + esc(h.id) + '</span>';
    }
    if (h) _runId = h.id;

    if (!h || !Array.isArray(h.items) || !h.items.length) {
      $('pilihSemua').disabled = true; $('pilihSemua').checked = false; $('pilihSemua').indeterminate = false;
    }
    if (!h) {
      $('runCnt').textContent = '';
      $('rTb').innerHTML = '<tr><td colspan="16" class="empty">' + esc(d.catatan || 'Belum ada hasil.') + '</td></tr>';
      $('rJson').textContent = '[]';
      return;
    }
    $('runCnt').textContent = 'run #' + h.id + ' · ' + waktuLokal(h.mulai) + ' · ' + (h.jumlah || 0) + ' item';
    $('rRawSum').textContent = 'Lihat JSON hasil node "' + (h.node || '—') + '" (' + (h.jumlah || 0) + ' item)';
    $('rJson').textContent = JSON.stringify(h.json || [], null, 2);

    var items = Array.isArray(h.items) ? h.items : [];
    if (!items.length) {
      $('rTb').innerHTML = '<tr><td colspan="16" class="empty">Run #' + esc(h.id) +
        ' tidak menemukan karyawan yang mulai cuti tepat sebulan lagi.</td></tr>';
      return;
    }
    var g = h.gerbang || {};
    _cek = {
      mode: keadaan(d),
      batal: batalUntuk(h.id),
      dicetak: Array.isArray(g.dicetak) ? new Set(g.dicetak) : null,
    };
    $('rTb').innerHTML = items.map(barisCek).join('');
    tandaiPilihSemua(items);
  }

  /* Satu baris tabel panel 01 = satu karyawan hasil olahan n8n.
     Nilai kosong yang PERLU dicek (amber + keterangan di title) dibedakan
     dari yang memang tidak berlaku (abu-abu): jalur hanya diolah untuk POH
     di luar Tabalong/Balangan — karyawan lokal tidak punya field jalur sama
     sekali, jadi kosongnya bukan kekurangan data. */
  var KET_ROSTER = 'roster belum diimpor sampai 14 hari setelah awal cuti';
  function kosong(perlu, ket) {
    return '<span class="c-kosong' + (perlu ? ' perlu' : '') + '"' + (ket ? ' title="' + esc(ket) + '"' : '') + '>' +
      (perlu ? 'kosong' : '—') + '</span>';
  }
  function tdTgl(v, cls, ket) {
    if (tglIndo(v)) {
      return '<td class="c-tgl' + (cls ? ' ' + cls : '') + '">' + esc(tglIndo(v)) + '<span class="hr">' + esc(hariDari(v)) + '</span></td>';
    }
    return '<td class="c-tgl">' + kosong(true, ket) + '</td>';
  }
  function tdJalur(v, luar, cat) {
    var c = cat ? '<span class="cat">' + esc(cat) + '</span>' : '';
    if (v != null && String(v).trim() !== '') return '<td class="c-jalur">' + esc(v) + c + '</td>';
    if (luar) return '<td class="c-jalur">' + kosong(true, cat || 'jalur kosong — isi saat koreksi') + c + '</td>';
    return '<td class="c-jalur"><span class="c-kosong" title="POH Tabalong/Balangan — tidak memakai jalur">—</span></td>';
  }
  /* ---------- kolom centang Cetak ---------- */
  function batalUntuk(runId) {
    if (_batal[runId]) return _batal[runId];
    var set = new Set();
    try {
      set = new Set(JSON.parse(localStorage.getItem(BATAL_KEY + runId) || '[]'));
    } catch (e) { /* localStorage diblokir: cukup di memori */ }
    _batal[runId] = set;
    return set;
  }
  // buang pilihan centang milik run yang sudah tidak menunggu (tidak ditampilkan
  // dan tidak ada di daftar "run lain menunggu")
  function rapikanBatal(simpan) {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(BATAL_KEY) === 0 && simpan.indexOf(Number(k.slice(BATAL_KEY.length))) < 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  function simpanBatal(runId) {
    try { localStorage.setItem(BATAL_KEY + runId, JSON.stringify(Array.from(_batal[runId] || []))); } catch (e) {}
  }
  function kunciDari(it) { return it.kunci || (String(it.id_ho || '') + '|' + String(it.awal_cuti || it.tgl || '')); }
  // apakah baris ini (akan / sudah) dicetak, menurut keadaan papan
  function ikutCetak(it) {
    var c = _cek || {};
    var kunci = kunciDari(it);
    if (c.mode === 'dicetak') return c.dicetak ? c.dicetak.has(kunci) : true;
    // 'berjalan' = sesudah Cetak, n8n masih membuat PDF (body Cetak baru tersimpan saat
    // eksekusi selesai) — pakai pilihan centang di browser ini; browser lain: semua.
    if (c.mode === 'menunggu' || c.mode === 'kirim' || c.mode === 'berjalan') return !(c.batal && c.batal.has(kunci));
    return false;
  }
  function hitungPilih(d) {
    var h = d && d.hasil, items = (h && Array.isArray(h.items)) ? h.items : [];
    return { total: items.length, pilih: items.filter(ikutCetak).length,
      batal: items.filter(function (it) { return !ikutCetak(it); }) };
  }
  function tandaiPilihSemua(items) {
    var el = $('pilihSemua'), c = _cek || {};
    var bisa = c.mode === 'menunggu';
    var n = items.filter(ikutCetak).length;
    el.disabled = !bisa || !items.length;
    el.checked = items.length > 0 && n === items.length;
    el.indeterminate = n > 0 && n < items.length;
  }
  function ubahPilih(kunci, mau) {
    var h = _run && _run.hasil;
    if (!h || keadaan(_run) !== 'menunggu') return;
    var set = batalUntuk(h.id);
    if (mau) set.delete(kunci); else set.add(kunci);
    simpanBatal(h.id);
    renderRun(_run);
    renderGate(_run);
  }
  function ubahSemua(mau) {
    var h = _run && _run.hasil;
    if (!h || keadaan(_run) !== 'menunggu') return;
    var set = batalUntuk(h.id);
    set.clear();
    if (!mau) (h.items || []).forEach(function (it) { set.add(kunciDari(it)); });
    simpanBatal(h.id);
    renderRun(_run);
    renderGate(_run);
  }

  function barisCek(it, i) {
    var tak = Number(it.roster_lengkap) === 0 && it.roster_lengkap !== null && it.roster_lengkap !== undefined && it.roster_lengkap !== '';
    var luar = Object.prototype.hasOwnProperty.call(it, 'jalur_berangkat');
    var hari = (it.total_h_kerja == null || it.total_h_kerja === '') ? null : Number(it.total_h_kerja);
    var syarat = Number(it.syarat_h_kerja) || 0;
    var al = it.alasan == null ? '' : String(it.alasan);
    var alCls = !al ? '' : (al.toLowerCase().indexOf('as schedule') >= 0 ? ' sesuai' : ' sesuaikan');
    var c = _cek || {};
    var ikut = ikutCetak(it);
    var bisaUbah = c.mode === 'menunggu';
    var tampakBatal = !ikut && (c.mode === 'menunggu' || c.mode === 'kirim' || c.mode === 'dicetak' || c.mode === 'berjalan');
    var ketCentang = c.mode === 'dicetak' ? (ikut ? 'ikut dicetak' : 'tidak ikut dicetak')
      : (bisaUbah ? 'lepas centang bila baris ini tidak perlu dicetak' : 'centang hanya bisa diubah selama menunggu cetak');
    return '<tr' + (tampakBatal ? ' class="batal"' : '') + '>' +
      '<td class="lekat l0 c-pilih"><input type="checkbox" class="pilih" data-k="' + esc(kunciDari(it)) + '"' +
        (ikut ? ' checked' : '') + (bisaUbah ? '' : ' disabled') + ' title="' + esc(ketCentang) + '" aria-label="Cetak ' + esc(it.nama || it.id_ho) + '"></td>' +
      '<td class="c-no lekat l1">' + (i + 1) + '</td>' +
      '<td class="c-mono lekat l2">' + dash(it.id_ho) + '</td>' +
      '<td class="c-nama lekat l3">' + (it.nama ? esc(it.nama) : '<span class="c-shift">tidak ada di data karyawan</span>') +
        (tampakBatal ? '<span class="tag-batal">tidak dicetak</span>' : '') + '</td>' +
      '<td>' + dash(it.jabatan) + '</td>' +
      '<td class="c-alasan' + alCls + '">' + (al ? esc(al) : kosong(true, 'hari kerja tidak diketahui — isi saat koreksi')) + '</td>' +
      tdTgl(it.akhir_kerja, '', 'tidak ada hari kerja sebelum cuti di roster') +
      tdTgl(it.tgl, 'c-awal', '') +
      tdTgl(it.akhir_cuti, '', tak ? KET_ROSTER : 'akhir cuti tidak ditemukan') +
      tdTgl(it.masuk_kembali, '', tak ? KET_ROSTER : 'tidak ada hari kerja dalam 14 hari setelah cuti') +
      '<td class="c-num' + (hari !== null && syarat && hari !== syarat ? ' kurang' : '') + '"' +
        (hari !== null && syarat ? ' title="syarat ' + syarat + ' hari (' + esc(it.status || '') + ')"' : '') + '>' +
        (hari === null ? kosong(true, 'tidak ada cuti sebelumnya di data roster') : hari + (syarat ? '<span class="sub"> / ' + syarat + '</span>' : '')) + '</td>' +
      '<td class="c-num">' + (it.total_cuti == null || it.total_cuti === '' ? kosong(true, tak ? KET_ROSTER : '') : esc(it.total_cuti)) + '</td>' +
      '<td>' + dash(it.poh) + '</td>' +
      tdJalur(it.jalur_berangkat, luar, it.catatan_jalur) +
      tdJalur(it.jalur_balik, luar, '') +
      '<td>' + (it.status_cuti ? '<span class="tr-badge">' + esc(it.status_cuti) + '</span>' : '<span class="c-kosong">—</span>') + '</td>' +
      '</tr>';
  }

  // Keadaan papan: dari gerbang di server, plus 'kirim' (lokal, sesaat
  // setelah Cetak ditekan sampai polling melihat eksekusinya lanjut).
  function keadaan(d) {
    var h = d && d.hasil;
    if (!h) return 'belum';
    var k = (h.gerbang && h.gerbang.keadaan) || '';
    if (k === 'menunggu' && _kirim === h.id) return 'kirim';
    return k || 'belum';
  }

  function renderGate(d) {
    var wf = d.workflow || {}, h = d.hasil, akhir = d.terakhir, g = (h && h.gerbang) || {};
    var k = keadaan(d), cls = '', dot = '', t = '', s = '';
    var n = h ? (h.jumlah || 0) : 0;
    var hp = hitungPilih(d);

    if (k === 'menunggu') {
      cls = 'warn'; dot = 'wait'; t = 'Menunggu cetak';
      s = hp.pilih + ' dari ' + n + ' karyawan dicentang — periksa daftarnya, lalu tekan Cetak sebelum ' + waktuLokal(g.batas) + ' (sisa ' + sisa(g.batas) + ')';
    } else if (k === 'kirim') {
      cls = 'warn'; dot = 'wait'; t = 'Mengirim ke n8n…';
      s = 'menunggu eksekusi #' + h.id + ' berlanjut';
    } else if (k === 'dicetak') {
      cls = 'ok'; dot = 'on'; t = 'Sudah dicetak';
      s = hp.pilih + ' dari ' + n + ' karyawan dicetak oleh ' + (g.nama || g.oleh || '—') + ' · ' + waktuLokal(g.pada) + ' — n8n lanjut ke node berikutnya';
    } else if (k === 'kedaluwarsa') {
      cls = 'crit'; dot = 'off'; t = 'Kedaluwarsa — tidak dicetak';
      s = 'batas 23 jam habis ' + waktuLokal(g.pada) + '. ' + n + ' karyawan ini tidak diteruskan; tekan Jalankan ulang bila masih perlu.';
    } else if (k === 'kosong') {
      t = 'Tidak ada yang perlu dicetak';
      s = 'run #' + h.id + ' tidak menemukan karyawan yang mulai cuti tepat sebulan lagi';
    } else if (k === 'sebagian') {
      t = 'Run sebagian dari editor';
      s = 'run #' + h.id + ' dijalankan dari editor n8n hanya sampai node "' + (g.node_akhir || '—') + '" — tidak menunggu cetak';
    } else if (k === 'tanpa') {
      t = 'Run sebelum gerbang cetak';
      s = 'run #' + h.id + ' dibuat sebelum node "Tunggu Cetak" ada — tidak bisa dicetak dari sini';
    } else if (k === 'berjalan' && h.dokumen_keadaan === 'membuat') {
      cls = 'warn'; dot = 'wait'; t = 'Dicetak — membuat PDF…';
      s = 'run #' + h.id + ' · n8n mengisi form Google Sheet lalu mengekspor PDF';
    } else if (k === 'berjalan') {
      cls = 'warn'; dot = 'wait'; t = 'Sedang berjalan…'; s = 'run #' + h.id;
    } else if (k === 'gagal') {
      cls = 'crit'; dot = 'off'; t = 'Run gagal'; s = g.error || 'lihat eksekusi #' + h.id + ' di n8n';
    } else {
      t = 'Belum ada run'; s = 'tunggu jadwal 08:00 atau tekan Jalankan ulang';
    }
    $('stat').className = 'stat' + (cls ? ' ' + cls : '');
    $('statDot').className = 'dot' + (dot ? ' ' + dot : '');
    $('statT').textContent = t;
    $('statS').textContent = s;

    $('gRun').textContent = h ? '#' + h.id : '—';
    $('gWaktu').textContent = h ? waktuLokal(h.mulai) : '—';
    $('gMode').textContent = h ? labelMode(h.mode) + (h.pemicu && h.pemicu.susulan ? ' · susulan' : '') +
      (h.pemicu && h.pemicu.nama ? ' · ' + h.pemicu.nama : '') : '—';
    if (h && (k === 'menunggu' || k === 'kirim')) $('gJumlah').textContent = hp.pilih + ' dari ' + n + ' orang dicentang';
    else if (h && k === 'dicetak') $('gJumlah').textContent = hp.pilih + ' dari ' + n + ' orang dicetak';
    else $('gJumlah').textContent = h ? n + ' orang' : '—';
    $('gTgl').textContent = h ? rentangTgl(h.items || []) : '—';
    if (k === 'dicetak') {
      $('gBatasK').textContent = 'Dicetak';
      $('gBatas').textContent = waktuLokal(g.pada) + ' · ' + (g.nama || g.oleh || '—');
    } else {
      $('gBatasK').textContent = 'Batas cetak';
      $('gBatas').textContent = (k === 'menunggu' || k === 'kirim') ? waktuLokal(g.batas) + ' (sisa ' + sisa(g.batas) + ')' : '—';
    }
    $('gJadwal').className = 'm ' + (wf.aktif ? 'ok' : 'warn');
    $('gJadwal').textContent = wf.aktif ? '● aktif' : '○ belum di-publish';

    var notes = [];
    if (_galatCetak) notes.push('<div class="gnote merah"><b>Cetak gagal:</b> ' + esc(_galatCetak) + '</div>');
    if (_ulang) {
      notes.push('<div class="gnote amber">↻ <b>Menjalankan ulang workflow AFL…</b> run baru muncul di sini dalam beberapa detik.' +
        (_ulang.pesan ? '<br>' + esc(_ulang.pesan) : '') + '</div>');
    }
    if (_galatUlang) notes.push('<div class="gnote merah"><b>Jalankan ulang gagal:</b> ' + esc(_galatUlang) + '</div>');
    // AFL SUSULAN (audit 2026-10-13): tanggal cuti yang tidak pernah dijangkau
    // run mana pun karena jadwal 08:00 tidak jalan (server mati) — dihitung server
    var tl = d.terlewat;
    if (tl && tl.tanggal && tl.tanggal.length && !_ulang) {
      var tg = tl.tanggal;
      notes.push('<div class="gnote amber">⚠ <b>' + tg.length + ' tanggal cuti belum pernah diproses</b>' +
        (tl.hari && tl.hari.length ? ' — jadwal AFL tidak jalan pada ' + esc(tl.hari.map(tglIndo).join(', ')) + ' (server mati?)' : '') +
        '. Cuti mulai ' + esc(tglIndo(tg[0])) + (tg.length > 1 ? ' s/d ' + esc(tglIndo(tg[tg.length - 1])) : '') +
        '.<br><button class="btn kecil" type="button" data-susulan="1" style="margin-top:8px">↻ Proses susulan</button></div>');
    }
    if (akhir && h && akhir.id !== h.id && (akhir.status === 'error' || akhir.status === 'crashed')) {
      notes.push('<div class="gnote merah">Run terbaru <b>#' + esc(akhir.id) + '</b> (' + esc(waktuLokal(akhir.mulai)) + ') <b>gagal</b>' +
        (akhir.error ? ': ' + esc(akhir.error) : '') + '. Yang tampil adalah run <b>#' + esc(h.id) + '</b>.</div>');
    }
    if (!wf.aktif) {
      notes.push('<div class="gnote amber">Workflow <b>AFL</b> belum di-publish di n8n — jadwal 08:00 <b>belum berjalan sendiri</b>; ' +
        'run di sini berasal dari editor/uji.</div>');
    }
    if (d.catatan) notes.push('<div class="gnote redup">' + esc(d.catatan) + '</div>');
    if (d.dilihat) {
      notes.push('<div class="gnote redup">Menampilkan run <b>#' + esc(d.dilihat) + '</b> — ' +
        '<a href="#" class="tautan" data-lihat="0">kembali ke run terbaru</a></div>');
    }
    (d.menunggu_lain || []).forEach(function (r) {
      notes.push('<div class="gnote amber">Run <b>#' + esc(r.id) + '</b> (' + esc(waktuLokal(r.mulai)) + ', ' + esc(r.jumlah) +
        ' orang) juga <b>masih menunggu cetak</b> sampai ' + esc(waktuLokal(r.batas)) + ' — ' +
        '<a href="#" class="tautan" data-lihat="' + esc(r.id) + '">lihat</a></div>');
    });
    $('gNotes').innerHTML = notes.join('');

    $('gDok').innerHTML = htmlDokumen(h) + htmlRiwayat(d);
    $('btnCetak').disabled = (k !== 'menunggu') || hp.pilih === 0;
    var ket = 'Jalankan workflow AFL sekarang — data ditarik ulang dari roster & Google Sheet.', kunci = false;
    if (!wf.aktif) { kunci = true; ket = 'Bisa dipakai setelah workflow AFL di-publish di n8n.'; }
    else if (_ulang) { kunci = true; ket = 'Sedang menjalankan ulang…'; }
    else if (sedangJalan(d)) { kunci = true; ket = 'Run #' + akhir.id + ' sedang berjalan — tunggu sampai selesai.'; }
    else if (k === 'kirim' || (h && h.dokumen_keadaan === 'membuat')) { kunci = true; ket = 'Tunggu sampai cetakan selesai dibuat.'; }
    $('btnUlang').disabled = kunci;
    $('uKet').textContent = ket;
    if (k === 'menunggu' && hp.pilih === 0) {
      $('gNotes').innerHTML += '<div class="gnote amber">Tidak ada karyawan yang dicentang — centang minimal satu untuk bisa mencetak.</div>';
    }
  }

  /* Dokumen cetak: dibuat n8n sesudah Cetak — form Google Sheet diisi per
     karyawan lalu diekspor jadi PDF gabungan per kelompok (POH Tabalong-Balangan:
     AFL saja; POH luar: AFL + Travel Request berselang-seling, untuk cetak
     bolak-balik). "Unduh"/"Lihat" lewat magi-api (afl-pdf, butuh login);
     "Drive"/"Sheet" membuka salinan permanen di folder Drive "AFL Cetak". */
  function htmlDokumen(h) {
    if (!h) return '';
    var k = h.dokumen_keadaan;
    var kepala = '<div class="dok"><div class="dok-h">Dokumen cetak</div>';
    if (k === 'membuat') {
      return kepala + '<div class="gnote amber">⏳ n8n sedang mengisi form dan membuat PDF… ' +
        '(±3 detik per halaman — biasanya kurang dari 1 menit). Halaman ini memperbarui sendiri.</div></div>';
    }
    if (k === 'gagal') {
      return kepala + '<div class="gnote merah"><b>Gagal membuat PDF:</b> ' +
        esc(h.dokumen_error || ('lihat eksekusi #' + h.id + ' di n8n')) + '</div></div>';
    }
    if (k !== 'siap' || !Array.isArray(h.dokumen) || !h.dokumen.length) return '';
    var sp = h.simpan || null;
    var db = !sp ? ''
      : sp.keadaan === 'siap'
        ? '<div class="gnote redup">✓ <b>' + esc(sp.jumlah) + ' karyawan</b> tersimpan di database (tabel <b>karyawan_afl</b>, cetak = 1).</div>'
        : '<div class="gnote merah"><b>PDF jadi, tapi gagal menyimpan ke database:</b> ' + esc(sp.error || ('lihat eksekusi #' + h.id + ' di n8n')) + '</div>';
    return kepala + db + h.dokumen.map(function (d) {
      var url = CFG.pdfUrl + '?id=' + encodeURIComponent(h.id) + '&jenis=' + encodeURIComponent(d.jenis);
      return '<div class="dok-i"><div class="dok-t">' + esc(d.judul) + '</div>' +
        '<div class="dok-m">' + esc(d.jumlah_orang) + ' orang · ' + esc(d.halaman) + ' halaman' +
          (d.ukuran ? ' · ' + esc(d.ukuran) : '') + (d.jenis === 'luar' ? ' · cetak bolak-balik' : '') + '</div>' +
        '<div class="dok-a">' +
          '<a class="btn kecil primary" href="' + esc(url) + '">⬇ Unduh PDF</a>' +
          '<a class="btn kecil" href="' + esc(url + '&lihat=1') + '" target="_blank" rel="noopener">Lihat</a>' +
          (d.link_pdf ? '<a class="btn kecil" href="' + esc(d.link_pdf) + '" target="_blank" rel="noopener">Drive</a>' : '') +
          (d.link_sheet ? '<a class="btn kecil" href="' + esc(d.link_sheet) + '" target="_blank" rel="noopener" title="Salinan form yang sudah terisi — bisa dikoreksi lalu dicetak ulang dari Google Sheets">Sheet</a>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* Cetakan sebelumnya (dalam 10 eksekusi terakhir) — PDF-nya tetap bisa diunduh
     walau papan sudah menampilkan run yang lebih baru. Lebih lama dari itu (atau
     sesudah n8n memangkas eksekusi, bawaan 14 hari): folder Drive "AFL Cetak". */
  function htmlRiwayat(d) {
    var r = (d && d.riwayat) || [];
    if (!r.length) return '';
    return '<div class="dok"><div class="dok-h">Cetakan sebelumnya</div>' + r.map(function (x) {
      return '<div class="dok-i"><div class="dok-m" style="margin:0 0 8px">Run #' + esc(x.id) + ' · ' +
          esc(waktuLokal(x.pada || x.mulai)) + (x.oleh ? ' · ' + esc(x.oleh) : '') +
          ' · <a href="#" class="tautan" data-lihat="' + esc(x.id) + '">lihat</a></div>' +
        '<div class="dok-a">' + (x.dokumen || []).map(function (dk) {
          var url = CFG.pdfUrl + '?id=' + encodeURIComponent(x.id) + '&jenis=' + encodeURIComponent(dk.jenis);
          return '<a class="btn kecil" href="' + esc(url) + '" title="' + esc(dk.jumlah_orang + ' orang · ' + dk.halaman + ' halaman') + '">⬇ ' +
            esc(dk.jenis === 'luar' ? 'POH Luar' : 'Tabalong-Balangan') + '</a>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  function tanyaCetak() {
    var d = _run || {}, h = d.hasil;
    if (keadaan(d) !== 'menunggu') return;
    var hp = hitungPilih(d);
    if (!hp.pilih) return;
    var dipilih = (h.items || []).filter(ikutCetak);
    $('mBody').innerHTML =
      'Cetak AFL untuk <b>' + hp.pilih + ' dari ' + esc(h.jumlah || 0) + ' karyawan</b> dari run <b>#' + esc(h.id) + '</b> ' +
      '(mulai cuti ' + esc(rentangTgl(dipilih)) + ').' +
      (hp.batal.length
        ? '<br><br><b>Tidak dicetak (' + hp.batal.length + '):</b> ' +
          hp.batal.map(function (it) { return esc(it.nama || it.id_ho); }).join(', ') + '.'
        : '') +
      '<br><br>Setelah dicetak, n8n <b>melanjutkan run ini ke node berikutnya</b> hanya dengan karyawan yang dicentang, ' +
      'dan tombol Cetak terkunci untuk semua pengguna. Pastikan daftarnya sudah diperiksa.';
    $('mask').classList.add('on');
    setTimeout(function () { $('mYa').focus(); }, 30);
  }
  function tutupModal() { $('mask').classList.remove('on'); }

  function kirimCetak() {
    var d = _run || {}, h = d.hasil;
    tutupModal();
    if (!h || keadaan(d) !== 'menunggu') return;
    _kirim = h.id; _galatCetak = '';
    renderGate(d);
    fetch(CFG.cetakUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: h.id, pilih: (h.items || []).filter(ikutCetak).map(kunciDari) }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
        return b;
      });
    }).then(function () {
      // n8n melanjutkan eksekusinya dalam hitungan detik — baca ulang cepat
      setTimeout(muatRun, 1500);
      setTimeout(muatRun, 5000);
    }).catch(function (e) {
      _kirim = null;
      _galatCetak = tanpaTitik(e);
      muatRun();
    });
  }

  /* ==========================================================
     CROSSCEK CUTI — afl-crosscek: siapa yang berangkat (awal cuti) dan
     balik (akhir cuti) pada tanggal terpilih (bawaan BESOK menurut server),
     roster aktual dicocokkan dengan karyawan_afl. Pencocokannya di server
     (cekCuti di routes/afl.js); di sini hanya menampilkan. Ketidaksesuaian
     untuk BESOK juga dimunculkan di atas halaman (#cekTop).
     ========================================================== */
  function muatCek() {
    ambil(CFG.crosscekUrl + (_cekTgl ? '?tgl=' + encodeURIComponent(_cekTgl) : ''))
      .then(function (d) { renderCek(d || {}); })
      .catch(function (e) {
        var g = '<tr><td colspan="4" class="empty">Gagal memuat crosscek — ' + esc(tanpaTitik(e)) + '.</td></tr>';
        $('cekTbB').innerHTML = g; $('cekTbK').innerHTML = g;
        $('cekBanner').innerHTML = '';
      });
  }
  function rentang(a, b) {
    if (!a) return '—';
    return esc(tglIndo(a)) + (b && b !== a ? ' – ' + esc(tglIndo(b)) : '');
  }
  /* Jalur travel untuk yang punya TR: berangkat ↗ dan balik ↙ beserta tanggal
     travelnya (special case: sehari sebelum awal cuti & hari masuk kerja). Sumber:
     TR yang tercetak (karyawan_afl) atau — kalau belum ada — sheet Rute travel /
     special chase dari run AFL terbaru yang membacanya. */
  function htmlJalur(x) {
    var j = x.jalur;
    if (!x.travel_request || !j) return '';
    var tg = function (t) { return t ? '<i>' + esc(tglIndo(t)) + '</i>' : ''; };
    var sumber = j.sumber === 'tercetak' ? 'jalur di TR tercetak'
      : (j.sumber === 'sheet' ? 'jalur dari sheet' + (j.sheet_run ? ' (run #' + esc(j.sheet_run) + ')' : '') + ' — belum ada TR tercetak'
        : 'jalur tidak diketahui');
    return '<span class="jl">' +
      '<span class="r"><span class="a">↗</span>' + (j.berangkat ? esc(j.berangkat) : '—') + tg(j.tgl_berangkat) + '</span>' +
      '<span class="r"><span class="a">↙</span>' + (j.balik ? esc(j.balik) : '—') + tg(j.tgl_balik) + '</span>' +
      '<span class="s">' + sumber + (j.special ? ' · <span class="sp">special case · Travel Day</span>' : '') + '</span></span>';
  }
  // Jangan dinamai barisCek: nama itu milik tabel panel 01. Dua deklarasi
  // function bernama sama dalam satu scope -> yang terakhir menimpa yang
  // pertama, dan panel 01 tergambar dengan baris 4 kolom milik crosscek.
  function barisCrosscek(x) {
    var r = x.roster || {}, a = x.afl;
    var kRoster = r.awal
      ? '<span class="tg">' + rentang(r.awal, r.akhir) + '</span><span class="kc">' + esc(r.jumlah) + ' hari FB' +
        (r.masuk_kembali ? ' · masuk ' + esc(tglIndo(r.masuk_kembali)) : '') + '</span>'
      : '<span class="tg">bukan FB</span><span class="kc">kode ' + esc(r.kode || 'kosong') + '</span>';
    var kAfl = a
      ? '<span class="tg">' + rentang(a.awal_cuti, a.akhir_cuti) + '</span><span class="kc">' +
        (a.total_cuti === null ? '—' : esc(a.total_cuti) + ' hari') + ' · #' + esc(a.id_afl) + '</span>' +
        '<span class="bd' + (a.dari_lapangan ? ' ya' : '') + '">' + (a.dari_lapangan ? '✓' : '○') + ' lapangan</span>' +
        '<span class="bd' + (a.full_approve ? ' ya' : '') + '">' + (a.full_approve ? '✓' : '○') + ' approve</span>' +
        (a.revisi ? '<span class="bd rev">revisi</span>' : '')
      : '<span class="tg">—</span><span class="kc">tidak ada AFL</span>';
    var hasil = (x.masalah || []).length
      ? x.masalah.map(function (m) {
          return '<span class="ms ' + (m.tingkat === 'merah' ? 'merah' : 'amber') + '">' + (m.tingkat === 'merah' ? '⚠ ' : '• ') + esc(m.teks) + '</span>';
        }).join('')
      : '<span class="ok">✓ Sesuai</span>';
    var cls = x.status === 'tidak_sesuai' ? 't-merah' : (x.status === 'peringatan' ? 't-amber' : '');
    return '<tr class="' + cls + '"><td><span class="nm">' + dash(x.nama) + '</span><span class="kc">' + esc(x.id_ho) +
      (x.jabatan ? ' · ' + esc(x.jabatan) : '') + (x.poh ? ' · ' + esc(x.poh) : '') + '</span>' + htmlJalur(x) + '</td>' +
      '<td>' + kRoster + '</td><td>' + kAfl + '</td><td>' + hasil + '</td></tr>';
  }
  /* Dipisah: yang punya Travel Request (POH luar — dicetak AFL + TR) dan yang
     tidak (POH Tabalong/Balangan — AFL saja). travel_request dihitung server
     dengan aturan yang sama dengan node "POH Tabalong/Balangan?" di workflow. */
  var GRUP_TR = [
    { tr: true, judul: '✈ Dengan Travel Request', ket: 'POH luar — AFL + Travel Request' },
    { tr: false, judul: 'Tanpa Travel Request', ket: 'POH Tabalong / Balangan — AFL saja' },
  ];
  function tabelCek(list) {
    return GRUP_TR.map(function (g) {
      var isi = list.filter(function (x) { return !!x.travel_request === g.tr; });
      return '<tr class="grp' + (g.tr ? ' tr' : '') + '"><td colspan="4">' + esc(g.judul) +
        '<span class="n">' + isi.length + ' orang</span><span class="k">' + esc(g.ket) + '</span></td></tr>' +
        (isi.length ? isi.map(barisCrosscek).join('') : '<tr><td colspan="4" class="kosong-g">tidak ada</td></tr>');
    }).join('');
  }
  function renderCek(d) {
    var tgl = d.tanggal || '', rk = d.ringkas || {};
    $('cekTgl').value = tgl;
    $('cekBesok').classList.toggle('on', tgl === d.besok);
    var label = (hariDari(tgl) ? hariDari(tgl) + ', ' : '') + tglIndo(tgl);
    var besok = tgl === d.besok;
    $('cekHB').innerHTML = 'Berangkat cuti · mulai cuti <b>' + esc(label) + '</b><span class="n">' + esc(rk.berangkat || 0) + ' orang · ' +
      esc(rk.berangkat_tr || 0) + ' dengan TR</span>';
    $('cekHK').innerHTML = 'Balik cuti · akhir cuti <b>' + esc(label) + '</b><span class="n">' + esc(rk.balik || 0) + ' orang · ' +
      esc(rk.balik_tr || 0) + ' dengan TR</span>' +
      (d.roster_lusa_ada ? '' : '<span class="n">· roster sesudah tanggal ini belum ada</span>');
    var kosong = function (t) { return '<tr><td colspan="4" class="empty">' + t + '</td></tr>'; };
    $('cekTbB').innerHTML = (d.berangkat || []).length ? tabelCek(d.berangkat) : kosong('Tidak ada yang mulai cuti pada tanggal ini.');
    $('cekTbK').innerHTML = (d.balik || []).length ? tabelCek(d.balik) : kosong('Tidak ada yang selesai cuti pada tanggal ini.');
    $('cekCnt').textContent = (rk.berangkat || 0) + ' berangkat · ' + (rk.balik || 0) + ' balik';
    var b = '';
    if (rk.tidak_sesuai) {
      b = '<div class="gnote merah"><b>⚠ ' + esc(rk.tidak_sesuai) + ' data cuti tidak sesuai</b> antara roster dan AFL untuk ' + esc(label) +
        ' — periksa sebelum karyawan ' + (besok ? 'berangkat / balik besok' : 'berangkat / balik') + '.' +
        (rk.peringatan ? ' ' + esc(rk.peringatan) + ' lainnya perlu perhatian (kuning).' : '') + '</div>';
    } else if (rk.peringatan) {
      b = '<div class="gnote amber">Roster &amp; AFL cocok. ' + esc(rk.peringatan) + ' AFL perlu perhatian (belum full approve / revisi).</div>';
    } else if ((rk.berangkat || 0) + (rk.balik || 0)) {
      b = '<div class="gnote redup">✓ Semua data roster &amp; AFL untuk ' + esc(label) + ' cocok.</div>';
    }
    $('cekBanner').innerHTML = b;
    // peringatan di atas halaman — hanya untuk BESOK, hanya yang merah
    if (besok) {
      $('cekTop').innerHTML = rk.tidak_sesuai
        ? '<div class="gnote merah"><b>⚠ Crosscek besok (' + esc(label) + '):</b> ' + esc(rk.tidak_sesuai) +
          ' data cuti tidak sesuai antara roster dan AFL — <a href="#pCek" class="tautan">lihat panel 03 Crosscek Cuti</a>.</div>'
        : '';
    }
  }

  /* ==========================================================
     PERSENTASE AFL — afl-rekap, per bulan mulai cuti.
     Tiap AFL dihitung SEKALI menurut status terakhirnya (server):
       full approved > revisi > sudah kembali > sudah dicetak > belum dicetak
     sehingga kelima persen berjumlah 100% dari total AFL bulan itu.
     Total = blok cuti FB yang mulai di bulan itu (tanpa karyawan ber-DOT)
     + AFL yang sudah tercetak. Dibaca ulang tiap menit dan sesudah centang
     di Catatan AFL berubah.
     ========================================================== */
  var REKAP_KOLOM = ['belum', 'dicetak', 'kembali', 'revisi', 'full_approve'];
  var REKAP_LABEL = { belum: 'Belum dicetak', dicetak: 'Sudah dicetak', kembali: 'Sudah kembali',
    revisi: 'Revisi', full_approve: 'Full approved' };
  function muatRekap() {
    ambil(CFG.rekapUrl)
      .then(function (d) { _rekap = d || {}; renderRekap(); })
      .catch(function (e) {
        $('rkTb').innerHTML = '<tr><td colspan="8" class="empty">Gagal memuat persentase — ' + esc(tanpaTitik(e)) + '.</td></tr>';
      });
  }
  // 127 dari 133 -> '95,5%' (0 dan 100 tanpa desimal)
  function persen(n, t) {
    if (!t) return '—';
    var p = n * 100 / t;
    return (p === 0 || p === 100 ? String(p) : p.toFixed(1)).replace('.', ',') + '%';
  }
  function barisRekap(o, total, d) {
    var t = o.total || 0;
    var mb = /^(\d{4})-(\d{2})$/.exec(String(o.bulan || ''));
    var akhirBulan = (!total && mb) ? new Date(Date.UTC(+mb[1], +mb[2], 0)).toISOString().slice(0, 10) : '';
    var label = total ? 'Total' : bulanIndo(o.bulan);
    var sub = '';
    if (akhirBulan && d.roster_sampai && d.roster_sampai < akhirBulan) {
      sub = '<div class="sub amber">roster baru sampai ' + esc(tglIndo(d.roster_sampai)) + '</div>';
    }
    var sel = REKAP_KOLOM.map(function (k) {
      var n = o[k] || 0;
      var ket = '';
      if (k === 'belum' && n) {
        ket = '<div class="sub">' + esc(o.belum_waktunya || 0) + ' belum waktunya · ' +
          esc(o.sudah_waktunya || 0) + ' sudah waktunya</div>';
      }
      return '<td class="s-' + k + (n ? '' : ' nol') + '"><div class="pct">' + persen(n, t) + '</div>' +
        '<div class="nn">' + esc(n) + ' AFL</div>' + ket + '</td>';
    }).join('');
    var bar = '<div class="komp" title="' + esc(REKAP_KOLOM.map(function (k) {
      return REKAP_LABEL[k] + ' ' + persen(o[k] || 0, t);
    }).join(' · ')) + '">' + (t ? REKAP_KOLOM.map(function (k) {
      var n = o[k] || 0;
      return n ? '<span class="k-' + k + '" style="width:' + (n * 100 / t) + '%"></span>' : '';
    }).join('') : '') + '</div>';
    return '<tr' + (total ? ' class="total"' : '') + '><td class="bl">' + esc(label) + sub + '</td>' +
      '<td class="r"><div class="tot">' + esc(t) + '</div><div class="nn">AFL</div></td>' + sel +
      '<td>' + bar + '</td></tr>';
  }
  function renderRekap() {
    var d = _rekap || {};
    var bl = Array.isArray(d.bulan) ? d.bulan : [];
    if (!bl.length) {
      $('rkTb').innerHTML = '<tr><td colspan="8" class="empty">Belum ada data.</td></tr>';
      return;
    }
    $('rkTb').innerHTML = bl.map(function (o) { return barisRekap(o, false, d); }).join('') +
      (bl.length > 1 && d.total ? barisRekap(d.total, true, d) : '');
    $('rkCnt').textContent = bl.length === 1 ? bulanIndo(bl[0].bulan) : bulanIndo(bl[0].bulan) + ' – ' + bulanIndo(bl[bl.length - 1].bulan);
    $('rkFoot').innerHTML =
      'Persen dari <b>total AFL</b> bulan itu. Tiap AFL dihitung sekali menurut status terakhirnya ' +
      '(Full approved › Revisi › Sudah kembali › Sudah dicetak), jadi kelima kolom berjumlah 100%. ' +
      'Total = blok cuti FB yang mulai di bulan itu (karyawan ber-DOT tidak dihitung) ditambah AFL yang sudah tercetak. ' +
      '<b>Sudah kembali</b> = Dari Lapangan dicentang di Catatan AFL. <b>Belum waktunya</b> = cuti mulai lebih dari sebulan lagi ' +
      '(setelah ' + esc(tglIndo(d.batas_jadwal)) + '), workflow belum sampai ke tanggalnya; <b>sudah waktunya</b> = jadwal cetaknya sudah lewat ' +
      'atau hari ini, tetapi belum ada AFL tercetak.';
  }

  /* ==========================================================
     JALANKAN ULANG — memicu workflow AFL sekarang juga (afl-jalankan).
     magi-api memanggil node Webhook "Jalankan Ulang" di n8n; hasilnya sama
     dengan jadwal 08:00 (karyawan yang mulai cuti tepat sebulan dari HARI
     INI, data roster & sheet terbaru) dan run baru menunggu Cetak lagi.
     Run yang masih menunggu cetak bisa ditutup sekalian (bawaan dicentang)
     supaya tidak ada dua run menunggu untuk tanggal yang sama.
     ========================================================== */
  function runMenunggu(d) {
    var ids = [], h = d && d.hasil;
    if (h && h.gerbang && h.gerbang.keadaan === 'menunggu') ids.push(h.id);
    ((d && d.menunggu_lain) || []).forEach(function (r) { if (ids.indexOf(r.id) < 0) ids.push(r.id); });
    return ids;
  }
  function sedangJalan(d) {
    var a = d && d.terakhir;
    return !!(a && (a.status === 'running' || a.status === 'new'));
  }
  function tanyaUlang() {
    if ($('btnUlang').disabled) return;
    var tunggu = runMenunggu(_run || {});
    $('mUlangBody').innerHTML =
      'n8n menjalankan workflow <b>AFL</b> sekarang, sama seperti jadwal 08:00: karyawan yang ' +
      '<b>mulai cuti tepat sebulan dari hari ini</b> ditarik ulang dengan data roster serta sheet ' +
      '<b>Rute travel</b> &amp; <b>special chase</b> terbaru, lalu run baru <b>menunggu Cetak</b> lagi.' +
      '<br><br>Cetakan yang sudah ada tidak berubah. Mencetak ulang karyawan yang sama memperbarui ' +
      'catatannya di Catatan AFL (tidak dobel).' +
      (tunggu.length
        ? '<label class="m-cek"><input type="checkbox" id="mUlangTutup" checked><span>Tutup run <b>#' +
          tunggu.join(', #') + '</b> yang masih menunggu cetak — <b>tidak dicetak</b>, digantikan run baru.</span></label>'
        : '');
    $('maskUlang').classList.add('on');
    setTimeout(function () { $('mUlangYa').focus(); }, 30);
  }
  function tutupUlang() { $('maskUlang').classList.remove('on'); }
  function kirimUlang() {
    var d = _run || {}, cb = $('mUlangTutup');
    var tutup = cb && cb.checked ? runMenunggu(d) : [];
    tutupUlang();
    _ulang = { dari: Math.max(d.hasil ? d.hasil.id : 0, d.terakhir ? d.terakhir.id : 0), sejak: Date.now(), pesan: '' };
    _galatUlang = '';
    renderGate(d);
    fetch(CFG.jalankanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutup: tutup }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
        return b;
      });
    }).then(function (b) {
      if (_ulang) _ulang.pesan = (b && b.message) || '';
      if (_lihat) { lihatRun('0'); return; }   // tampilkan run terbaru, bukan run lama yang sedang dilihat
      muatRun();
    }).catch(function (e) {
      _ulang = null;
      _galatUlang = tanpaTitik(e);
      renderGate(_run || {});
    });
  }

  /* AFL SUSULAN — run khusus untuk tanggal cuti yang terlewat (daftar
     tanggalnya dihitung ulang server saat tombol ditekan; cuti yang sudah
     tercetak dilewati). Run yang masih menunggu cetak TIDAK ditutup. */
  function tanyaSusulan() {
    var tl = (_run && _run.terlewat) || {};
    var tg = tl.tanggal || [];
    if (!tg.length) return;
    var ok = window.confirm('Jalankan AFL susulan untuk ' + tg.length + ' tanggal cuti (' + tglIndo(tg[0]) +
      (tg.length > 1 ? ' s/d ' + tglIndo(tg[tg.length - 1]) : '') + ')?\n\n' +
      'Run baru akan menunggu Cetak seperti biasa. Cuti yang sudah tercetak dilewati.');
    if (!ok) return;
    var d = _run || {};
    _ulang = { dari: Math.max(d.hasil ? d.hasil.id : 0, d.terakhir ? d.terakhir.id : 0), sejak: Date.now(), pesan: '' };
    _galatUlang = '';
    renderGate(d);
    fetch(CFG.jalankanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ susulan: true }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
        return b;
      });
    }).then(function (b) {
      if (_ulang) _ulang.pesan = (b && b.message) || '';
      if (_lihat) { lihatRun('0'); return; }
      muatRun();
    }).catch(function (e) {
      _ulang = null;
      _galatUlang = tanpaTitik(e);
      renderGate(_run || {});
    });
  }

  /* ==========================================================
     CATATAN AFL — riwayat karyawan_afl (yang sudah dicetak & disimpan)
     Warna dihitung SERVER (afl-catatan) dari tanggal server, satu aturan:
       hijau  = full approve · oranye = revisi ·
       merah  = >= batas_hari (15) hari sejak dicetak, Dari Lapangan & Full Approve belum dicentang
     Angka batas di legenda diambil dari balasan server, bukan ditulis mati.
     Centang dikirim satu per satu ke afl-catatan-ubah; balasan server (baris
     terbaru + warnanya) langsung menggantikan baris di layar.
     ========================================================== */
  function muatCatatan() {
    ambil(CFG.catatanUrl)
      .then(function (d) { _cat = d || {}; renderCatatan(); })
      .catch(function (e) {
        $('catTb').innerHTML = '<tr><td colspan="13" class="empty">Gagal memuat catatan — ' + esc(tanpaTitik(e)) + '.</td></tr>';
      });
  }
  function setSaring(v) {
    _catSaring = v;
    try { localStorage.setItem(SARING_KEY, v); } catch (e) {}
    tandaSaring();
    renderCatatan();
  }
  function tandaSaring() {
    var c = document.querySelectorAll('#pCatatan [data-saring]');
    var rk = (_cat && _cat.ringkas) || null;
    Array.prototype.forEach.call(c, function (b) {
      var v = b.getAttribute('data-saring');
      b.classList.toggle('on', v === _catSaring);
      if (!b.getAttribute('data-label')) b.setAttribute('data-label', b.textContent);
      var n = !rk ? '' : v === 'semua' ? rk.total : v === 'terbuka' ? (rk.total - rk.hijau) : rk[v];
      b.innerHTML = esc(b.getAttribute('data-label')) + (n === '' ? '' : '<span class="n">' + esc(n) + '</span>');
    });
  }
  function lolosSaring(r) {
    if (_catSaring === 'merah' || _catSaring === 'oranye' || _catSaring === 'hijau') { if (r.warna !== _catSaring) return false; }
    else if (_catSaring === 'terbuka' && r.full_approve) return false;
    var q = String(_catCari || '').trim().toLowerCase();
    if (q && (r.nama + ' ' + r.id_ho).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }
  function renderCatatan() {
    var d = _cat || {};
    var items = Array.isArray(d.items) ? d.items : [];
    tandaSaring();
    if (d.batas_hari) $('catBatas').textContent = d.batas_hari;
    var tampil = items.filter(lolosSaring);
    $('catCnt').textContent = tampil.length === items.length ? items.length + ' AFL' : tampil.length + ' dari ' + items.length + ' AFL';
    if (!items.length) {
      $('catTb').innerHTML = '<tr><td colspan="13" class="empty">Belum ada AFL yang dicetak dan disimpan.</td></tr>';
      return;
    }
    if (!tampil.length) {
      $('catTb').innerHTML = '<tr><td colspan="13" class="empty">Tidak ada catatan yang cocok dengan saringan.</td></tr>';
      return;
    }
    $('catTb').innerHTML = tampil.map(barisCatatan).join('');
  }
  function centangSel(r, kol, judul) {
    return '<td class="c-pilih"><input type="checkbox" data-id="' + esc(r.id_afl) + '" data-kol="' + kol + '"' +
      (r[kol] ? ' checked' : '') + ' title="' + esc(judul) + '" aria-label="' + esc(judul + ' — ' + r.nama) + '"></td>';
  }
  function barisCatatan(r) {
    var umur = r.umur_hari === null || r.umur_hari === undefined ? ''
      : (r.umur_hari === 0 ? 'hari ini' : r.umur_hari + ' hari lalu');
    return '<tr class="' + (r.warna ? 'w-' + r.warna : '') + '" data-baris="' + esc(r.id_afl) + '">' +
      '<td class="c-mono">' + dash(r.id_ho) + '</td>' +
      '<td class="c-nama">' + dash(r.nama) + '</td>' +
      '<td>' + dash(r.jabatan) + '</td>' +
      '<td>' + dash(r.poh) + '</td>' +
      '<td class="c-tgl">' + (tglIndo(r.awal_cuti) ? esc(tglIndo(r.awal_cuti)) : '—') + '</td>' +
      '<td class="c-tgl">' + (tglIndo(r.akhir_cuti) ? esc(tglIndo(r.akhir_cuti)) : '<span class="c-kosong">—</span>') + '</td>' +
      '<td class="c-num">' + (r.total_cuti === null || r.total_cuti === undefined ? '—' : esc(r.total_cuti)) + '</td>' +
      '<td class="c-alasan">' + dash(r.alasan) + '</td>' +
      '<td class="c-mono" style="white-space:normal">' + (r.dicetak_pada ? esc(tglJamIndo(r.dicetak_pada)) : '—') +
        '<span class="umur">' + esc(umur) + (r.dicetak_oleh ? ' · ' + esc(r.dicetak_oleh) : '') + '</span></td>' +
      centangSel(r, 'dari_lapangan', 'Dari Lapangan') +
      centangSel(r, 'full_approve', 'Full Approve') +
      centangSel(r, 'revisi', 'Revisi') +
      '<td class="c-rev">' + (r.alasan_revisi ? esc(r.alasan_revisi) : '<span class="c-kosong">—</span>') +
        (r.revisi || r.alasan_revisi ? '<button type="button" class="ubah-rev" data-rev="' + esc(r.id_afl) + '">✎</button>' : '') + '</td>' +
      '</tr>';
  }
  function cariCatatan(id) {
    var it = (_cat && _cat.items) || [];
    for (var i = 0; i < it.length; i++) if (it[i].id_afl === id) return it[i];
    return null;
  }
  function kirimCatatan(body) {
    return fetch(CFG.catatanUbahUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
        return b;
      });
    });
  }
  function gantiCatatan(item) {
    var it = (_cat && _cat.items) || [];
    for (var i = 0; i < it.length; i++) if (it[i].id_afl === item.id_afl) it[i] = item;
    if (_cat && _cat.ringkas) {
      var rk = { total: it.length, hijau: 0, oranye: 0, merah: 0, lain: 0 };
      it.forEach(function (x) { rk[x.warna || 'lain']++; });
      _cat.ringkas = rk;
    }
    renderCatatan();
    muatRekap();   // centang mengubah status AFL -> persentase ikut berubah
    muatCek();     // ... dan peringatan approve di crosscek
  }
  function centangCatatan(id, kol, mau, el) {
    if (kol === 'revisi' && mau) { el.checked = false; bukaRevisi(id, false); return; }
    var tr = el.closest('tr'); if (tr) tr.classList.add('sibuk');
    el.disabled = true;
    var body = { id_afl: id }; body[kol] = mau;
    kirimCatatan(body).then(function (b) { gantiCatatan(b.item); })
      .catch(function (e) { alert('Gagal menyimpan: ' + tanpaTitik(e)); muatCatatan(); });
  }
  // revisi: dicentang lewat modal (sekalian alasan); tombol ✎ mengubah alasan saja
  function bukaRevisi(id, ubahSaja) {
    var r = cariCatatan(id); if (!r) return;
    _revisiId = { id: id, ubahSaja: !!ubahSaja };
    $('mRevTitle').textContent = ubahSaja ? 'Ubah Alasan Revisi' : 'Tandai Revisi';
    $('mRevKet').innerHTML = '<b>' + esc(r.nama) + '</b> · cuti ' + esc(tglIndo(r.awal_cuti)) +
      (ubahSaja ? '' : '<br>Baris akan berwarna <b>oranye</b> sampai di-full approve.');
    $('mRevTeks').value = r.alasan_revisi || '';
    $('maskRev').classList.add('on');
    setTimeout(function () { $('mRevTeks').focus(); }, 30);
  }
  function tutupRevisi() { $('maskRev').classList.remove('on'); _revisiId = null; }
  function simpanRevisi() {
    if (!_revisiId) return;
    var body = { id_afl: _revisiId.id, alasan_revisi: $('mRevTeks').value };
    if (!_revisiId.ubahSaja) body.revisi = true;
    $('mRevSimpan').disabled = true;
    kirimCatatan(body).then(function (b) { tutupRevisi(); gantiCatatan(b.item); })
      .catch(function (e) { alert('Gagal menyimpan: ' + tanpaTitik(e)); })
      .then(function () { $('mRevSimpan').disabled = false; });
  }

  function render(d) {
    var items = Array.isArray(d.items) ? d.items : [];
    var orang = {};
    items.forEach(function (it) { orang[it.id_ho] = 1; });
    var nOrang = Object.keys(orang).length;

    $('hariIni').textContent = tglIndo(d.hari_ini) || '—';
    $('kBulan').textContent = bulanIndo(d.bulan);
    $('mBulan').textContent = (d.dari && d.sampai) ? tglIndo(d.dari) + ' – ' + tglIndo(d.sampai) : '—';
    $('kOrang').textContent = String(nOrang);
    $('mOrang').textContent = items.length === nOrang
      ? 'orang'
      : 'orang · ' + items.length + ' cuti (ada yang cuti dua kali)';
    $('kRoster').textContent = tglIndo(d.roster_sampai) || '—';

    // Roster yang belum sampai akhir bulan = daftar terpotong yang tampak lengkap.
    var w = $('warn');
    if (!d.roster_sampai || (d.sampai && d.roster_sampai < d.sampai)) {
      w.innerHTML = '⚠ Roster di database baru sampai <b>' + (esc(tglIndo(d.roster_sampai)) || '—') + '</b>, ' +
        'sedangkan bulan depan berakhir <b>' + esc(tglIndo(d.sampai)) + '</b>. ' +
        'Cuti yang mulai sesudah tanggal itu belum terlihat — jalankan <b>Import Roster</b> untuk periode berikutnya.';
      w.classList.add('on');
    } else {
      w.classList.remove('on');
    }

    var batas = Number(d.batas) || 0;
    $('cnt').textContent = items.length + ' baris' + (batas && items.length >= batas ? ' (dibatasi ' + batas + ')' : '');

    if (!items.length) {
      $('tb').innerHTML = '<tr><td colspan="6" class="empty">Tidak ada karyawan yang mulai cuti pada ' +
        esc(bulanIndo(d.bulan)) + '.</td></tr>';
      return;
    }
    var html = [], sebelum = '';
    items.forEach(function (it, i) {
      var awal = it.mulai !== sebelum;
      sebelum = it.mulai;
      html.push('<tr' + (awal ? ' class="awal"' : '') + '>' +
        '<td class="c-no">' + (i + 1) + '</td>' +
        '<td class="c-mono">' + dash(it.id_ho) + '</td>' +
        '<td class="c-nama">' + dash(it.nama) + '</td>' +
        '<td>' + dash(it.jabatan) + '</td>' +
        '<td>' + dash(it.poh) + '</td>' +
        '<td class="c-tgl">' + esc(tglIndo(it.mulai)) + '<span class="hr">' + esc(hariDari(it.mulai)) + '</span></td>' +
        '</tr>');
    });
    $('tb').innerHTML = html.join('');
  }

  /* ==========================================================
     STARFIELD — identik dengan index.js/todo.js
     ========================================================== */
  function starfield() {
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
  }
})();

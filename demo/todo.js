/* ============================================================
   MAGI//SYSTEM — To Do List
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; todo.html
   hanya shell kosong berisi <div id="app">. Pola sama dengan
   index.js/roster.js/karyawan.js/absen.js/akses.js.

   Papan catatan pekerjaan BERSAMA — semua akun yang punya fitur
   "todo" melihat daftar yang sama.

   Satu baris = satu pekerjaan:
     nama pekerjaan · tgl. ditambahkan (otomatis, tanggal server)
     · nama yang menambahkan (dari akun yang login) · tgl. selesai
     (otomatis saat kolom "clear" dicentang) · catatan · centang.

   Warna baris (aturan dari pemilik):
     hijau  = kolom centang true (sudah selesai)
     kuning = belum selesai dan PUNYA tenggat yang belum lewat
              (hari ini atau sesudahnya) — pengingat (2026-10-19)
     normal = belum selesai, tanpa tenggat, tgl. ditambahkan = hari ini
     merah  = belum selesai dan tenggatnya sudah lewat — atau, kalau
              tanpa tenggat, tgl. ditambahkan sudah lewat
   Aturan yang sama ada di routes/todo.js (telat()) dan panel To Do
   di index.js — ubah ketiganya bersamaan.

   TANGGAL AKTUAL DIAMBIL DARI SERVER (`hari_ini` pada respons
   todo-list), BUKAN dari jam browser. Jam klien yang meleset atau
   beda zona waktu akan memerahkan pekerjaan yang sebenarnya masih
   hari ini — tanggal yang sah, jadi tak ada error yang muncul dan
   salahnya tak akan ketahuan. Alasan yang sama dengan jangkar
   tanggal panel Roster Aktual di index.js.

   Sumber data: GET  CFG.listUrl    (magi-api /webhook/todo-list)
   Tulis:       POST todo-create / todo-update / todo-toggle / todo-delete
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    homePage: './index.html',
    listUrl: MAGI.url('/webhook/todo-list'),
    createUrl: MAGI.url('/webhook/todo-create'),
    updateUrl: MAGI.url('/webhook/todo-update'),
    toggleUrl: MAGI.url('/webhook/todo-toggle'),
    deleteUrl: MAGI.url('/webhook/todo-delete'),
    // papan ini dipakai beberapa orang sekaligus: muat ulang berkala supaya
    // pekerjaan yang diselesaikan/diserahkan orang lain muncul tanpa menekan
    // Perbarui — sekaligus jalan masuk notifikasi "sudah selesai" di bawah.
    refreshMs: 60000,
  };
  var AKTOR = (window.MAGI && MAGI.actor) || 'anon';
  var PERAN = '';
  var HARI_INI = '';     // tanggal aktual menurut server (YYYY-MM-DD)
  var _items = [];
  var _pengguna = [];    // {username, nama} untuk dropdown "dikerjakan oleh"
  var MODE = 'add';      // 'add' | 'edit'
  var EDIT_ID = null;
  var TENGGAT_LAMA = ''; // tenggat tersimpan saat popup Ubah dibuka (boleh dikirim balik walau sudah lewat)
  var _batas = 0;        // batas baris dari server (untuk keterangan jumlah)

  /* Saringan "dikerjakan oleh" — HANYA di browser.
     Endpoint todo-list sudah mengirim seluruh papan (maks 500 baris) beserta
     `dikerjakan_oleh` tiap baris, jadi menyaring di sini tidak menambah satu
     permintaan pun dan pindah saringan terasa seketika (tidak ambil ulang).
     Nilai: 'all' | 'me' | 'none' | 'u:<username>'. Disimpan per browser.
     Kuncinya SENGAJA berbeda dari kunci panel To Do List di halaman utama
     ('magi.todo.lingkup', hanya saya/semua): kalau dipakai bersama, memilih
     pengguna lain di sini akan membuat panel dashboard menampilkan sesuatu
     yang tidak pernah dipilih di sana. */
  var FILTER_KEY = 'magi.todo.filter';
  var FILTER = (function () {
    try {
      var v = localStorage.getItem(FILTER_KEY) || '';
      if (v === 'all' || v === 'me' || v === 'none' || v.indexOf('u:') === 0) return v;
    } catch (e) { /* localStorage diblokir */ }
    return 'me';          // bawaan: fokus ke pekerjaan sendiri
  })();

  /* Notifikasi lintas-pengguna tanpa kanal push.
     Yang membuatnya mungkin: `selesai_pada` (waktu server, milidetik) ikut
     dikirim tiap baris. Klien menyimpan stempel terbaru yang sudah pernah
     diumumkan; begitu polling menemukan baris selesai yang lebih baru dari
     itu, pemiliknya diberi tahu. Jadi orang lain tahu tanpa server perlu
     mendorong apa pun.
     Pemuatan PERTAMA di satu browser hanya menetapkan garis dasar dan tidak
     memberi tahu apa pun — tanpa itu, membuka halaman untuk pertama kali akan
     memuntahkan notifikasi untuk semua pekerjaan yang pernah selesai.
     Kunci `magi.todo.selesai` sengaja dibagi dengan index.js: satu kejadian
     cukup diumumkan sekali per browser, di panel manapun yang melihatnya
     lebih dulu. */
  var SEEN_KEY = 'magi.todo.selesai';
  var NOTIF_KEY = 'magi.notif.v1';     // store bersama dengan index.js
  var NOTIF_MAX = 60;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dash(s) { s = String(s == null ? '' : s).trim(); return s === '' ? '—' : esc(s); }

  // '2026-09-19' -> '19 Sep 2026'; nilai kosong/aneh dikembalikan apa adanya
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tglIndo(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return '';
    return String(Number(m[3])) + ' ' + BULAN[Number(m[2]) - 1] + ' ' + m[1];
  }
  // selisih hari sederhana atas dua tanggal YYYY-MM-DD (lewat UTC supaya DST
  // tidak pernah menggeser hasilnya sehari — sama seperti geserHari di index.js)
  function selisihHari(a, b) {
    var pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || ''), pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '');
    if (!pa || !pb) return 0;
    var ua = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]), ub = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
    return Math.round((ub - ua) / 86400000);
  }

  /* ==========================================================
     STYLE — token & kelas SAMA dengan halaman lain
     ========================================================== */
  var CSS = [
    ':root{',
    '  --void:#0a0806; --panel:#181310; --panel2:#1f1814;',
    '  --line:rgba(244,234,219,.10); --line-strong:rgba(255,106,31,.38);',
    '  --cream:#F4EADB; --cream-dim:#bfae9a; --cream-mute:#7f7264;',
    '  --orange:#FF6A1F; --amber:#FFB03A; --red:#E23B32; --rust:#8f3d18;',
    '  --ok:#7FD6A6; --warn:#FFB03A; --crit:#E23B32;',
    '  --sans:ui-sans-serif,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;',
    '  --mono:"DejaVu Sans Mono","Cascadia Code","JetBrains Mono",ui-monospace,"Courier New",monospace;',
    '  --glow:0 0 18px rgba(255,106,31,.35);',
    '}',
    '*{box-sizing:border-box}',
    'html,body{margin:0;padding:0;height:100%}',
    'body{background:var(--void);color:var(--cream);font-family:var(--sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}',
    '#stars{position:fixed;inset:0;z-index:0;pointer-events:none}',
    'body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:',
    '  radial-gradient(900px 520px at 78% -12%, rgba(255,106,31,.20), transparent 62%),',
    '  radial-gradient(760px 420px at -8% 108%, rgba(226,59,50,.16), transparent 58%),',
    '  radial-gradient(1200px 700px at 50% 130%, rgba(255,176,58,.07), transparent 60%)}',

    '.wrap{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:22px 24px 48px}',

    'header.hud{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:14px 20px;margin-bottom:22px;',
    '  border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(255,106,31,.07),rgba(10,8,6,.35));',
    '  box-shadow:inset 0 1px 0 rgba(244,234,219,.06),0 12px 40px rgba(0,0,0,.45)}',
    '.mark{width:46px;height:46px;flex:0 0 auto;filter:drop-shadow(0 0 10px rgba(255,106,31,.55))}',
    '.brand{display:flex;flex-direction:column;line-height:1.1}',
    '.brand .logo{font-size:20px;font-weight:800;letter-spacing:.14em;color:var(--cream)}',
    '.brand .logo b{color:var(--orange);font-weight:800}',
    '.brand .sub{font-family:var(--mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--cream-mute);margin-top:3px}',
    '.hud-spacer{flex:1}',
    '.hud-cell{display:flex;flex-direction:column;gap:3px}',
    '.hud-cell .k{font-family:var(--mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.hud-cell .v{font-family:var(--mono);font-size:12.5px;color:var(--cream-dim)}',
    '.back,.rfr{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;',
    '  text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:8px 15px;background:rgba(244,234,219,.04);color:var(--cream-dim);transition:.15s;cursor:pointer}',
    '.back:hover,.rfr:hover{color:var(--cream);border-color:var(--line-strong);box-shadow:var(--glow)}',
    '.pill{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 13px;background:rgba(244,234,219,.04);color:var(--cream-dim)}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--cream-mute);flex:0 0 auto}',
    '.dot.on{background:var(--ok);box-shadow:0 0 10px var(--ok)}',
    '.dot.off{background:var(--crit);box-shadow:0 0 10px rgba(226,59,50,.7)}',
    '.dot.wait{background:var(--warn);box-shadow:0 0 10px rgba(255,176,58,.7);animation:pulse 1.2s infinite}',
    '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}',

    '.lead{border:1px solid var(--line);border-radius:12px;background:rgba(244,234,219,.03);',
    '  padding:13px 16px;margin-bottom:22px;font-size:12.5px;color:var(--cream-dim);line-height:1.65}',
    '.lead b{color:var(--cream)}',
    '.lead .kunci{display:inline-flex;align-items:center;gap:6px;margin-right:14px;white-space:nowrap}',
    '.lead .sw{width:11px;height:11px;border-radius:3px;border:1px solid var(--line);flex:0 0 auto}',
    '.lead .sw.hijau{background:rgba(127,214,166,.55);border-color:rgba(127,214,166,.6)}',
    '.lead .sw.normal{background:rgba(244,234,219,.10)}',
    '.lead .sw.merah{background:rgba(226,59,50,.55);border-color:rgba(226,59,50,.6)}',
    '.lead .sw.kuning{background:rgba(255,176,58,.55);border-color:rgba(255,176,58,.6)}',

    /* ---------- tile ringkasan ---------- */
    '.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}',
    '@media(max-width:760px){.tiles{grid-template-columns:repeat(2,1fr)}}',
    '.tile{border:1px solid var(--line);border-radius:12px;padding:14px 15px;background:rgba(244,234,219,.03)}',
    '.tile .lab{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.tile .num{font-family:var(--mono);font-size:28px;font-weight:700;line-height:1.1;margin-top:5px;color:var(--cream)}',
    '.tile .num.o{color:var(--amber)}.tile .num.r{color:var(--crit)}.tile .num.g{color:var(--ok)}',
    '.tile .num.y{color:#FFD45A}',
    '.tile .meta{font-size:11px;color:var(--cream-dim);margin-top:4px}',

    '.panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--panel),var(--panel2));',
    '  box-shadow:0 10px 34px rgba(0,0,0,.4);overflow:hidden;margin-bottom:22px}',
    '.p-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:13px 18px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.p-head h2{margin:0;font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream)}',
    '.p-head .idx{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--orange)}',
    '.p-head .spacer{flex:1}',
    '.p-head .cnt{font-family:var(--mono);font-size:10px;color:var(--cream-mute);letter-spacing:.1em}',
    /* saringan "dikerjakan oleh" di kepala panel */
    '.flab{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--cream-mute)}',
    '.chip{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:rgba(244,234,219,.04);color:var(--cream-dim);transition:.15s}',
    '.chip:hover{color:var(--cream);border-color:var(--line-strong)}',
    '.chip.on{background:rgba(255,106,31,.16);border-color:var(--line-strong);color:var(--amber)}',
    '.fsel{font-family:var(--mono);font-size:10.5px;color:var(--cream-dim);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 11px;cursor:pointer;max-width:220px}',
    '.fsel:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.fsel option{background:var(--panel);color:var(--cream)}',
    '.empty .chip{margin-top:12px}',
    '.p-body{padding:0}',

    /* ---------- tabel pekerjaan ---------- */
    '.tbl-wrap{overflow-x:auto}',
    'table.todo{width:100%;border-collapse:collapse;min-width:900px}',
    '.todo thead th{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;text-align:left;',
    '  color:var(--cream-mute);padding:11px 14px;border-bottom:1px solid var(--line-strong);background:var(--panel)}',
    '.todo tbody td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13.5px;color:var(--cream-dim)}',
    '.todo tbody tr:last-child td{border-bottom:none}',
    '.todo tbody tr:hover{background:rgba(244,234,219,.03)}',
    '.c-ker{color:var(--cream);font-weight:600;min-width:16ch;max-width:34ch}',
    '.c-mono{font-family:var(--mono);font-size:12px;color:var(--cream-dim);white-space:nowrap}',
    '.c-oleh{font-size:12.5px;white-space:nowrap}',
    '.c-note{font-size:12px;color:var(--cream-mute);max-width:40ch;white-space:pre-wrap}',
    '.c-chk{text-align:center;width:72px}',
    '.c-aksi{width:104px;text-align:right;white-space:nowrap}',
    '.c-kosong{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--cream-mute)}',
    '.c-aku{color:var(--amber);font-weight:600}',
    '.umur{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream-mute);margin-top:3px}',

    /* --- tiga keadaan baris: normal (hari ini) / merah (lewat) / hijau (selesai) --- */
    '.todo tbody tr.telat td{background:rgba(226,59,50,.10)}',
    '.todo tbody tr.telat:hover td{background:rgba(226,59,50,.15)}',
    '.todo tbody tr.telat td:first-child{box-shadow:inset 3px 0 0 var(--crit)}',
    '.todo tbody tr.telat .c-ker{color:#ffd9d6}',
    '.todo tbody tr.telat .umur{color:var(--crit)}',
    /* kuning = punya tenggat yang belum lewat (pengingat) */
    '.todo tbody tr.tenggat td{background:rgba(255,176,58,.11)}',
    '.todo tbody tr.tenggat:hover td{background:rgba(255,176,58,.16)}',
    '.todo tbody tr.tenggat td:first-child{box-shadow:inset 3px 0 0 #FFD45A}',
    '.todo tbody tr.tenggat .c-ker{color:#FFE7A8}',
    '.todo tbody tr.tenggat .umur{color:#FFD45A}',
    '.c-tg{font-family:var(--mono);font-size:12px;white-space:nowrap}',
    '.todo tbody tr.kelar td{background:rgba(127,214,166,.10)}',
    '.todo tbody tr.kelar:hover td{background:rgba(127,214,166,.15)}',
    '.todo tbody tr.kelar td:first-child{box-shadow:inset 3px 0 0 var(--ok)}',
    '.todo tbody tr.kelar .c-ker{color:var(--ok);text-decoration:line-through;text-decoration-thickness:1px}',
    '.todo tbody tr.kelar .umur{color:var(--ok)}',
    '.todo tbody tr.sibuk{opacity:.55}',

    '.chk{width:18px;height:18px;accent-color:var(--ok);cursor:pointer}',
    '.chk:disabled{cursor:progress}',

    '.empty{padding:26px;font-size:13px;color:var(--cream-mute);text-align:center}',

    /* tombol tambah di kepala panel */
    '.addbtn{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;',
    '  cursor:pointer;border:1px solid var(--line-strong);border-radius:999px;padding:7px 13px;',
    '  background:linear-gradient(180deg,var(--orange),var(--rust));color:#1a0e06;font-weight:700;transition:.15s}',
    '.addbtn:hover{filter:brightness(1.1);box-shadow:var(--glow)}',
    '.dbtn,.ebtn{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 9px;background:rgba(244,234,219,.04);color:var(--cream-mute);transition:.15s}',
    '.dbtn:hover{color:var(--crit);border-color:rgba(226,59,50,.5);background:rgba(226,59,50,.08)}',
    '.ebtn{margin-right:6px}',
    '.ebtn:hover{color:var(--cream);border-color:var(--line-strong)}',

    /* toast kecil */
    '.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;max-width:90vw;',
    '  font-family:var(--mono);font-size:12px;padding:12px 18px;border-radius:10px;border:1px solid var(--line-strong);',
    '  background:rgba(24,19,16,.96);color:var(--cream);box-shadow:0 14px 44px rgba(0,0,0,.5);opacity:0;transition:opacity .2s,transform .2s}',
    '.toast.on{opacity:1;transform:translateX(-50%) translateY(-4px)}',
    '.toast.ok{border-color:rgba(127,214,166,.5)}.toast.err{border-color:rgba(226,59,50,.5);color:var(--crit)}',

    /* ---------- POPUP TAMBAH PEKERJAAN ---------- */
    '.overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:20px;',
    '  background:rgba(5,4,3,.72);backdrop-filter:blur(3px)}',
    '.overlay.on{display:flex}',
    '.modal{width:min(94vw,460px);border:1px solid var(--line-strong);border-radius:16px;overflow:hidden;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 26px 70px rgba(0,0,0,.6)}',
    '.modal .m-head{padding:15px 20px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,rgba(255,106,31,.12),transparent);',
    '  font-family:var(--mono);font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--cream)}',
    '.modal .m-body{padding:20px}',
    '.modal .fld{margin-bottom:15px}',
    '.modal .fld label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute);margin-bottom:6px}',
    '.modal .fld .opt{color:var(--cream-mute);text-transform:none;letter-spacing:0}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 13px;transition:.15s}',
    'textarea.inp{min-height:96px;resize:vertical;line-height:1.6}',
    'input[type=date].inp{font-family:var(--mono);color-scheme:dark}',
    '.sel{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 13px;cursor:pointer}',
    '.sel:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.sel option{background:var(--panel);color:var(--cream)}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.otomatis{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);line-height:1.8;',
    '  border:1px dashed var(--line);border-radius:9px;padding:10px 12px}',
    '.otomatis b{color:var(--cream-dim);font-weight:600}',
    '.m-err{display:none;font-family:var(--mono);font-size:11px;color:var(--crit);background:rgba(226,59,50,.10);',
    '  border:1px solid rgba(226,59,50,.35);border-radius:9px;padding:9px 12px;margin-bottom:15px}',
    '.m-err.on{display:block}',
    '.m-foot{display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--line)}',
    '.btn{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:9px;padding:10px 18px;background:transparent;color:var(--cream-dim);transition:.15s}',
    '.btn:hover:not(:disabled){color:var(--cream);border-color:var(--line-strong)}',
    '.btn.primary{background:linear-gradient(180deg,var(--orange),var(--rust));border-color:transparent;color:#1a0e06;font-weight:700}',
    '.btn:disabled{opacity:.5;cursor:not-allowed}',

    '.foot{margin-top:8px;font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);line-height:1.9}',
    '.foot a{color:var(--cream-dim);text-decoration:none}.foot a:hover{color:var(--cream)}',
    '.foot b{color:var(--cream-dim)}',
  ].join('');

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
    '<div class="sub">To Do List · Catatan Pekerjaan</div></div>',
    '<div class="hud-spacer"></div>',
    '<div class="hud-cell"><div class="k">Tanggal Server</div><div class="v" id="hariIni">—</div></div>',
    '<button class="rfr" id="btnRefresh">↻ Perbarui</button>',
    '<a class="back" href="' + CFG.homePage + '">← Konsol Misi</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">memuat…</span></div>',
    '</header>',

    '<div class="lead">Papan <b>pekerjaan bersama</b> — semua pengguna yang berhak melihat daftar yang sama. ',
    'Tanggal ditambahkan, nama pencatat, dan tanggal selesai diisi <b>otomatis</b>; yang perlu diketik hanya nama pekerjaan dan catatan.<br>',
    '<span class="kunci"><span class="sw hijau"></span>sudah selesai</span>',
    '<span class="kunci"><span class="sw kuning"></span>punya tenggat (pengingat)</span>',
    '<span class="kunci"><span class="sw normal"></span>dicatat hari ini</span>',
    '<span class="kunci"><span class="sw merah"></span>belum selesai, tenggat / tanggalnya sudah lewat</span><br>',
'Pakai saringan <b>Dikerjakan oleh</b> di kepala daftar untuk fokus ke pekerjaan sendiri — ',
'pilihan <b>Semua</b> tetap ada, jadi daftar orang lain tidak pernah tertutup.</div>',

    '<div class="tiles">',
    '<div class="tile"><div class="lab">Belum Selesai</div><div class="num o" id="kBelum">—</div><div class="meta" id="mBelum">masih terbuka</div></div>',
    '<div class="tile"><div class="lab">Bertenggat</div><div class="num y" id="kTenggat">—</div><div class="meta" id="mTenggat">pengingat tenggat</div></div>',
    '<div class="tile"><div class="lab">Terlambat</div><div class="num r" id="kTelat">—</div><div class="meta" id="mTelat">lewat tenggat / tanggal dicatat</div></div>',
    '<div class="tile"><div class="lab">Selesai</div><div class="num g" id="kKelar">—</div><div class="meta" id="mKelar">sudah dicentang</div></div>',
    '</div>',

    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Daftar Pekerjaan</h2>',
    '<span class="spacer"></span>',
    '<span class="flab">Dikerjakan oleh</span>',
    '<button class="chip" data-td="me" type="button">Saya</button>',
    '<button class="chip" data-td="all" type="button">Semua</button>',
    '<select class="fsel" id="fKerjakan" aria-label="Saring daftar berdasarkan yang mengerjakan"></select>',
    '<button class="addbtn" id="btnAdd">＋ Tambah Pekerjaan</button>',
    '<span class="cnt" id="cnt"></span></div>',
    '<div class="p-body"><div class="tbl-wrap"><table class="todo"><thead><tr>',
    '<th>Nama Pekerjaan</th><th>Tgl. Ditambahkan</th><th>Tenggat</th><th>Ditambahkan Oleh</th><th>Tgl. Selesai</th>',
    '<th>Dikerjakan Oleh</th><th>Catatan</th>',
    '<th class="c-chk">Clear</th><th></th>',
    '</tr></thead><tbody id="tb"></tbody></table></div></div></section>',

    '<div class="foot" id="foot"></div>',

    '</div>',

    /* ---- popup tambah pekerjaan ---- */
    '<div class="overlay" id="ovl">',
    '<form class="modal" id="addForm" autocomplete="off" novalidate>',
    '<div class="m-head" id="mdlTitle">Tambah Pekerjaan</div>',
    '<div class="m-body">',
    '<div class="m-err" id="addErr"></div>',
    '<div class="fld"><label for="aKerja">Nama Pekerjaan</label>',
    '<input class="inp" id="aKerja" type="text" maxlength="200" placeholder="mis. Rekap absensi pekan ini" autocomplete="off"></div>',
    '<div class="fld"><label for="aKerjakan">Dikerjakan Oleh</label>',
    '<select class="sel" id="aKerjakan"></select></div>',
    '<div class="fld"><label for="aTenggat">Tenggat Waktu <span class="opt">— opsional · baris jadi kuning sebagai pengingat</span></label>',
    '<input class="inp" id="aTenggat" type="date"></div>',
    '<div class="fld"><label for="aCatatan">Catatan <span class="opt">— opsional</span></label>',
    '<textarea class="inp" id="aCatatan" maxlength="2000" placeholder="Rincian, kendala, atau siapa yang perlu dihubungi…"></textarea></div>',
    '<div class="otomatis" id="aOtomatis"></div>',
    '</div>',
    '<div class="m-foot">',
    '<button class="btn" type="button" id="addCancel">Batal</button>',
    '<button class="btn primary" type="submit" id="addSave">Tambahkan</button>',
    '</div>',
    '</form>',
    '</div>',
    '<div class="toast" id="toast"></div>',
  ].join('');

  document.addEventListener('DOMContentLoaded', function () {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    $('app').innerHTML = HTML;
    starfield();
    $('btnRefresh').addEventListener('click', muat);
    wire();
    $('foot').innerHTML =
      'Tersimpan di tabel <b>db_mining.app_todo</b> · setiap tambah/centang/hapus tercatat di ' +
      '<b>audit_log</b>. — <a href="' + CFG.homePage + '">Konsol Misi</a>';
    muat();
    // papan bersama: ikut melihat pekerjaan yang diselesaikan / diserahkan
    // orang lain, dan inilah yang memicu notifikasinya
    setInterval(muat, CFG.refreshMs);
  });

  /* ==========================================================
     LOGIKA
     ========================================================== */
  function setLink(state, txt) {
    var d = $('linkDot'), t = $('linkTxt');
    d.className = 'dot' + (state ? ' ' + state : '');
    t.textContent = txt;
  }

  var _tt;
  function toast(kind, msg) {
    var t = $('toast');
    t.className = 'toast ' + (kind || '') + ' on';
    t.textContent = msg;
    clearTimeout(_tt);
    _tt = setTimeout(function () { t.className = 'toast ' + (kind || ''); }, 3200);
  }

  // satu pembungkus untuk semua POST: selalu balas {ok, body}
  function kirim(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b || {} }; });
    });
  }

  function muat() {
    setLink('wait', 'memuat…');
    fetch(CFG.listUrl + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (!r.ok) throw new Error((b && b.message) || ('HTTP ' + r.status));
          return b;
        });
      })
      .then(function (d) {
        render(d || {});
        setLink('on', 'terhubung');
      })
      .catch(function (e) {
        setLink('off', 'gagal');
        $('tb').innerHTML = '<tr><td colspan="9" class="empty">Gagal memuat — ' + esc(e.message || e) + '.</td></tr>';
        $('cnt').textContent = '';
      });
  }

  function render(d) {
    HARI_INI = d.hari_ini || HARI_INI;
    if (d.aktor) { AKTOR = d.aktor; }
    PERAN = d.peran || PERAN;
    _items = Array.isArray(d.items) ? d.items : [];
    if (Array.isArray(d.pengguna) && d.pengguna.length) { _pengguna = d.pengguna; isiDropdown(); }
    if (d.batas) _batas = d.batas;
    // Notifikasi dihitung dari SELURUH papan, bukan dari hasil saringan:
    // pekerjaan orang lain yang baru selesai tetap perlu diumumkan meskipun
    // saringan sedang menyembunyikan barisnya.
    umumkanSelesai(_items);

    $('hariIni').textContent = tglIndo(HARI_INI) || '—';
    isiFilter();
    gambar();
  }

  /* ---------- gambar tile + tabel sesuai saringan ----------
     Angka tile ikut saringan supaya selalu cocok dengan baris yang terlihat;
     `ringkas` dari server (selalu seluruh papan) sengaja tidak dipakai lagi.
     Aturan telat tetap dibandingkan ke HARI_INI dari server, sama seperti
     warna baris. */
  function gambar() {
    var tampil = _items.filter(cocokFilter);
    var belum = 0, telat = 0, tenggat = 0, kelar = 0;
    tampil.forEach(function (t) {
      if (t.selesai) { kelar++; return; }
      belum++;
      var k = kelas(t);
      if (k === 'telat') telat++;
      else if (k === 'tenggat') tenggat++;
    });
    $('kBelum').textContent = belum;
    $('kTenggat').textContent = tenggat;
    $('kTelat').textContent = telat;
    $('kKelar').textContent = kelar;

    var semua = (FILTER === 'all');
    var lab = labelFilter();
    $('mBelum').textContent = semua ? 'masih terbuka' : 'masih terbuka · ' + lab;
    $('mTenggat').textContent = semua ? 'pengingat tenggat' : 'pengingat · ' + lab;
    $('mTelat').textContent = semua ? 'lewat tenggat / tanggal dicatat' : 'lewat tanggal · ' + lab;
    $('mKelar').textContent = semua ? 'sudah dicentang' : 'sudah dicentang · ' + lab;

    $('cnt').textContent =
      (semua ? _items.length + ' pekerjaan' : tampil.length + ' dari ' + _items.length + ' pekerjaan') +
      (_batas && _items.length >= _batas ? ' (batas ' + _batas + ')' : '');

    $('tb').innerHTML = tampil.length ? tampil.map(baris).join('') : kosong(semua);
  }

  function kosong(semua) {
    // papan yang memang masih kosong bukan salah saringan — jangan sampai
    // pemakai baru disuruh "melihat semua" padahal tidak ada apa-apa di sana
    if (semua || !_items.length) {
      return '<tr><td colspan="8" class="empty">Belum ada pekerjaan yang dicatat. ' +
        'Mulai dengan <b>＋ Tambah Pekerjaan</b>.</td></tr>';
    }
    // papan bersama: jangan sampai terbaca "tidak ada pekerjaan" padahal yang
    // kosong cuma bagian saya — sebutkan sisanya dan sediakan jalan keluarnya
    return '<tr><td colspan="8" class="empty">Tidak ada pekerjaan untuk <b>' + esc(labelFilter()) + '</b>' +
      (_items.length ? ' — papan ini berisi ' + _items.length + ' pekerjaan lain.' : '.') +
      '<br><button class="chip" data-td="all" type="button">Tampilkan semua</button></td></tr>';
  }

  /* ---------- saringan "dikerjakan oleh" ---------- */
  function cocokFilter(t) {
    if (FILTER === 'all') return true;
    if (FILTER === 'me') return !!t.dikerjakan_oleh && String(t.dikerjakan_oleh) === String(AKTOR);
    if (FILTER === 'none') return !t.dikerjakan_oleh;
    return String(t.dikerjakan_oleh || '') === FILTER.slice(2);
  }

  function namaAku() {
    for (var i = 0; i < _pengguna.length; i++) {
      if (_pengguna[i].username === AKTOR) return _pengguna[i].nama;
    }
    return AKTOR;
  }

  function labelFilter() {
    if (FILTER === 'all') return 'semua pengguna';
    if (FILTER === 'me') return namaAku() + ' (saya)';
    if (FILTER === 'none') return 'belum ditentukan';
    var u = FILTER.slice(2);
    var d = daftarSaring();
    for (var i = 0; i < d.length; i++) if (d[i].username === u) return d[i].nama;
    return u;
  }

  // Daftar pilihan = akun aktif (dari server) + siapa pun yang masih tercantum
  // sebagai pelaksana di papan meski akunnya sudah nonaktif/dihapus. Tanpa ini
  // pekerjaan milik akun nonaktif tidak akan pernah bisa disaring keluar.
  function daftarSaring() {
    var out = _pengguna.slice(), punya = {};
    out.forEach(function (u) { punya[u.username] = 1; });
    _items.forEach(function (t) {
      if (t.dikerjakan_oleh && !punya[t.dikerjakan_oleh]) {
        punya[t.dikerjakan_oleh] = 1;
        out.push({ username: t.dikerjakan_oleh, nama: (t.dikerjakan_nama || t.dikerjakan_oleh) + ' · nonaktif' });
      }
    });
    return out;
  }

  function isiFilter() {
    var sel = $('fKerjakan');
    if (!sel) return;
    var daftar = daftarSaring();

    // saringan menunjuk akun yang sudah tidak ada di daftar mana pun:
    // kembalikan ke semua, supaya papan tidak terlihat kosong tanpa sebab
    if (FILTER.indexOf('u:') === 0 && daftar.length) {
      var u = FILTER.slice(2), ada = false;
      for (var i = 0; i < daftar.length; i++) if (daftar[i].username === u) { ada = true; break; }
      if (!ada) setFilter('all', true);
    }

    sel.innerHTML =
      '<option value="all">Semua pengguna</option>' +
      '<option value="me">Saya — ' + esc(namaAku()) + '</option>' +
      '<option value="none">Belum ditentukan</option>' +
      daftar.filter(function (x) { return x.username !== AKTOR; }).map(function (x) {
        return '<option value="u:' + esc(x.username) + '">' + esc(x.nama) + '</option>';
      }).join('');
    sel.value = FILTER;
    // <select> menolak nilai yang tidak ada opsinya: kalau itu terjadi, kotak
    // saringan akan tampil kosong sementara daftarnya tetap tersaring diam-diam
    if (sel.value !== FILTER) setFilter('all', true);
    tandaiChip();
  }

  function tandaiChip() {
    var chips = document.querySelectorAll('.p-head .chip[data-td]');
    Array.prototype.forEach.call(chips, function (c) {
      if (c.getAttribute('data-td') === FILTER) c.classList.add('on');
      else c.classList.remove('on');
    });
  }

  function setFilter(v, diam) {
    if (v === FILTER) return;
    FILTER = v;
    try { localStorage.setItem(FILTER_KEY, v); } catch (e) { /* localStorage diblokir */ }
    var sel = $('fKerjakan');
    if (sel && sel.value !== v) sel.value = v;
    tandaiChip();
    if (!diam) gambar();
  }

  /* ---------- dropdown "dikerjakan oleh" ---------- */
  function isiDropdown() {
    var sel = $('aKerjakan');
    var pilih = sel.value;                       // pertahankan pilihan saat daftar disegarkan
    sel.innerHTML = '<option value="">— belum ditentukan —</option>' +
      _pengguna.map(function (u) {
        return '<option value="' + esc(u.username) + '">' + esc(u.nama) +
          (u.username === AKTOR ? ' (saya)' : '') + '</option>';
      }).join('');
    if (pilih) sel.value = pilih;
  }

  /* ---------- notifikasi "pekerjaan sudah selesai" ----------
     Dipanggil tiap kali daftar selesai dimuat (termasuk polling 60 detik),
     jadi pengguna LAIN yang sedang membuka halaman ini ikut diberi tahu.
     Milik sendiri tidak di-toast dua kali — todoToggle sudah membalas pesannya
     — tapi tetap ditulis ke store notifikasi bersama supaya muncul juga di
     kolom Notifikasi halaman utama. */
  function bacaSeen() { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } }
  function tulisSeen(v) { try { localStorage.setItem(SEEN_KEY, v); } catch (e) {} }

  function notifBersama(level, icon, title, detail, key, href) {
    try {
      var arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
      if (!Array.isArray(arr)) arr = [];
      for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].key === key) return;  // sudah ditulis
      arr.unshift({ ts: Date.now(), level: level, icon: icon, title: title,
        detail: detail || '', read: false, href: href || '', key: key || '' });
      if (arr.length > NOTIF_MAX) arr.length = NOTIF_MAX;
      localStorage.setItem(NOTIF_KEY, JSON.stringify(arr));
    } catch (e) { /* kuota/JSON — jangan ganggu UI */ }
  }

  function umumkanSelesai(items) {
    var sebelum = bacaSeen();
    var maks = sebelum;
    var baru = [];
    items.forEach(function (t) {
      if (!t.selesai || !t.selesai_pada) return;
      if (t.selesai_pada > maks) maks = t.selesai_pada;
      if (sebelum && t.selesai_pada > sebelum) baru.push(t);
    });
    if (maks !== sebelum) tulisSeen(maks);
    if (!sebelum) return;                       // pemuatan pertama: garis dasar saja
    baru.forEach(function (t) {
      var siapa = t.selesai_nama || t.selesai_oleh || 'seseorang';
      notifBersama('ok', '✔', 'Pekerjaan selesai: ' + t.pekerjaan,
        'ditandai selesai oleh ' + siapa, 'todo:sel:' + t.id + ':' + t.selesai_pada, './todo.html');
      if (String(t.selesai_oleh) !== String(AKTOR)) {
        toast('ok', '✔ ' + siapa + ' menyelesaikan "' + t.pekerjaan + '"');
      }
    });
  }

  // kelas baris = aturan warna dari pemilik, dibandingkan ke tanggal SERVER
  function kelas(t) {
    if (t.selesai) return 'kelar';
    if (!HARI_INI) return '';
    if (t.tenggat) return t.tenggat < HARI_INI ? 'telat' : 'tenggat';
    if (t.tgl_tambah && t.tgl_tambah < HARI_INI) return 'telat';
    return '';
  }

  function baris(t) {
    var k = kelas(t);
    var umur = '';
    if (k === 'telat') {
      var n = selisihHari(t.tenggat || t.tgl_tambah, HARI_INI);
      umur = '<span class="umur">' + (t.tenggat ? 'lewat tenggat ' : 'terlambat ') + n + ' hari</span>';
    } else if (k === 'tenggat') {
      var sisa = selisihHari(HARI_INI, t.tenggat);
      umur = '<span class="umur">' + (sisa <= 0 ? 'tenggat hari ini' : 'tenggat ' + sisa + ' hari lagi') + '</span>';
    } else if (k === 'kelar' && t.tgl_selesai && t.tgl_tambah) {
      var l = selisihHari(t.tgl_tambah, t.tgl_selesai);
      umur = '<span class="umur">' + (l <= 0 ? 'selesai hari yang sama' : 'selesai dalam ' + l + ' hari') + '</span>';
    }
    var akuPencatat = String(t.oleh) === String(AKTOR);
    var akuKebagian = t.dikerjakan_oleh && String(t.dikerjakan_oleh) === String(AKTOR);
    var admin = PERAN === 'Administrator';
    var bolehHapus = akuPencatat || admin;
    // yang sedang kebagian juga boleh mengubah — itu justru gunanya: mengoper
    // pekerjaan yang tak sempat dia kerjakan ke orang lain
    var bolehUbah = akuPencatat || akuKebagian || admin;
    var kerja = t.dikerjakan_nama
      ? '<span class="' + (akuKebagian ? 'c-aku' : '') + '">' + esc(t.dikerjakan_nama) + '</span>'
      : '<span class="c-kosong">belum ditentukan</span>';
    return '<tr data-id="' + esc(t.id) + '"' + (k ? ' class="' + k + '"' : '') + '>' +
      '<td class="c-ker">' + dash(t.pekerjaan) + umur + '</td>' +
      '<td class="c-mono">' + (tglIndo(t.tgl_tambah) || '—') + '</td>' +
      '<td class="c-tg">' + (tglIndo(t.tenggat) || '—') + '</td>' +
      '<td class="c-oleh">' + dash(t.oleh_nama) + '</td>' +
      '<td class="c-mono">' + (tglIndo(t.tgl_selesai) || '—') +
        (t.selesai && t.selesai_nama ? '<span class="umur">oleh ' + esc(t.selesai_nama) + '</span>' : '') + '</td>' +
      '<td class="c-oleh">' + kerja + '</td>' +
      '<td class="c-note">' + dash(t.catatan) + '</td>' +
      '<td class="c-chk"><input class="chk" type="checkbox" data-chk="' + esc(t.id) + '"' +
        (t.selesai ? ' checked' : '') +
        ' aria-label="Tandai selesai: ' + esc(t.pekerjaan) + '"></td>' +
      '<td class="c-aksi">' +
        (bolehUbah ? '<button class="ebtn" data-edit="' + esc(t.id) + '" title="Ubah / serahkan ke orang lain">✎</button>' : '') +
        (bolehHapus ? '<button class="dbtn" data-del="' + esc(t.id) + '" title="Hapus catatan ini">🗑</button>' : '') +
      '</td>' +
      '</tr>';
  }

  // centang / lepas centang. Baris dikunci selama permintaan berjalan, dan
  // dikembalikan ke keadaan semula kalau server menolak — supaya kotak centang
  // tidak pernah menampilkan keadaan yang tidak tersimpan.
  function centang(id, mau, box) {
    var tr = box.closest ? box.closest('tr') : null;
    box.disabled = true;
    if (tr) tr.classList.add('sibuk');
    kirim(CFG.toggleUrl, { id: Number(id), selesai: !!mau })
      .then(function (res) {
        box.disabled = false;
        if (tr) tr.classList.remove('sibuk');
        if (res.ok && res.body.status === 'ok') {
          toast('ok', res.body.message || 'Tersimpan.');
          muat();                       // ambil ulang: tgl. selesai & ringkasan dari server
          return;
        }
        box.checked = !mau;
        toast('err', res.body.message || 'Gagal menyimpan centang.');
        if (res.body.status === 'notfound') muat();
      })
      .catch(function (e) {
        box.disabled = false;
        if (tr) tr.classList.remove('sibuk');
        box.checked = !mau;
        toast('err', 'Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
      });
  }

  function hapus(id) {
    var t = null;
    for (var i = 0; i < _items.length; i++) if (String(_items[i].id) === String(id)) { t = _items[i]; break; }
    var nama = t ? t.pekerjaan : 'pekerjaan ini';
    if (!window.confirm('Hapus "' + nama + '" dari daftar?\n\nTindakan ini tidak bisa dibatalkan.')) return;
    kirim(CFG.deleteUrl, { id: Number(id) })
      .then(function (res) {
        if (res.ok && res.body.status === 'ok') { toast('ok', res.body.message || 'Dihapus.'); muat(); }
        else toast('err', res.body.message || 'Gagal menghapus.');
      })
      .catch(function (e) {
        toast('err', 'Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
      });
  }

  function closeMdl() { $('ovl').classList.remove('on'); }
  function mdlErr(msg) { var e = $('addErr'); e.textContent = msg; e.classList.add('on'); }

  function openAdd() {
    MODE = 'add'; EDIT_ID = null;
    $('addErr').classList.remove('on');
    $('mdlTitle').textContent = 'Tambah Pekerjaan';
    $('addSave').textContent = 'Tambahkan';
    $('aKerja').value = '';
    $('aCatatan').value = '';
    $('aTenggat').value = '';
    $('aTenggat').min = HARI_INI || '';   // tenggat tidak boleh sebelum hari ini (server)
    TENGGAT_LAMA = '';
    isiDropdown();
    $('aKerjakan').value = AKTOR;          // bawaan: dikerjakan sendiri
    if ($('aKerjakan').value !== AKTOR) $('aKerjakan').value = '';   // akun tak ada di daftar
    $('aOtomatis').innerHTML =
      'Terisi otomatis saat disimpan:<br>' +
      '· Tgl. ditambahkan <b>' + (tglIndo(HARI_INI) || 'tanggal server hari ini') + '</b><br>' +
      '· Ditambahkan oleh <b>' + esc(AKTOR) + '</b><br>' +
      '· Tgl. selesai <b>saat kolom "clear" dicentang</b>';
    $('ovl').classList.add('on');
    setTimeout(function () { $('aKerja').focus(); }, 30);
  }

  function openEdit(id) {
    var t = null;
    for (var i = 0; i < _items.length; i++) if (String(_items[i].id) === String(id)) { t = _items[i]; break; }
    if (!t) { toast('err', 'Pekerjaan tidak ditemukan — coba Perbarui.'); return; }
    MODE = 'edit'; EDIT_ID = t.id;
    $('addErr').classList.remove('on');
    $('mdlTitle').textContent = 'Ubah Pekerjaan';
    $('addSave').textContent = 'Simpan';
    $('aKerja').value = t.pekerjaan || '';
    $('aCatatan').value = t.catatan || '';
    $('aTenggat').value = t.tenggat || '';
    $('aTenggat').min = HARI_INI || '';
    TENGGAT_LAMA = t.tenggat || '';
    isiDropdown();
    $('aKerjakan').value = t.dikerjakan_oleh || '';
    $('aOtomatis').innerHTML =
      'Dicatat <b>' + esc(t.oleh_nama || t.oleh || '—') + '</b> pada <b>' +
      (tglIndo(t.tgl_tambah) || '—') + '</b>.<br>' +
      'Ganti <b>Dikerjakan Oleh</b> untuk menyerahkan pekerjaan ini ke orang lain.';
    $('ovl').classList.add('on');
    setTimeout(function () { $('aKerjakan').focus(); }, 30);
  }

  function wire() {
    $('btnAdd').addEventListener('click', openAdd);

    // Saringan: chip di kepala panel DAN tombol "Tampilkan semua" pada keadaan
    // kosong ditangani satu delegasi — isi <tbody> digambar ulang tiap polling,
    // jadi listener yang dipasang ke tombolnya sendiri akan hilang.
    document.addEventListener('click', function (e) {
      var b = (e.target && e.target.closest) ? e.target.closest('[data-td]') : null;
      if (b) setFilter(b.getAttribute('data-td'));
    });
    $('fKerjakan').addEventListener('change', function () { setFilter(this.value); });
    $('addCancel').addEventListener('click', closeMdl);
    $('ovl').addEventListener('click', function (e) { if (e.target === $('ovl')) closeMdl(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMdl(); });
    $('addForm').addEventListener('input', function () { $('addErr').classList.remove('on'); });

    // centang + hapus per baris (event delegation — isi tbody digambar ulang)
    $('tb').addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-chk') != null) {
        centang(t.getAttribute('data-chk'), t.checked, t);
      }
    });
    $('tb').addEventListener('click', function (e) {
      var t = e.target;
      var eb = (t && t.getAttribute && t.getAttribute('data-edit') != null)
        ? t : (t && t.closest ? t.closest('[data-edit]') : null);
      if (eb) { openEdit(eb.getAttribute('data-edit')); return; }
      var db = (t && t.getAttribute && t.getAttribute('data-del') != null)
        ? t : (t && t.closest ? t.closest('[data-del]') : null);
      if (db) hapus(db.getAttribute('data-del'));
    });

    $('addForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var save = $('addSave');
      if (save.disabled) return;
      var lbl = save.textContent;

      var pekerjaan = $('aKerja').value.trim();
      var catatan = $('aCatatan').value.trim();
      var kerjakan = $('aKerjakan').value;
      var tgInp = $('aTenggat');
      var tenggat = tgInp.value;
      if (!pekerjaan) { mdlErr('Nama pekerjaan wajib diisi.'); return; }
      if (!tenggat && tgInp.validity && tgInp.validity.badInput) { mdlErr('Tanggal tenggat belum lengkap.'); return; }
      if (tenggat && HARI_INI && tenggat < HARI_INI && tenggat !== TENGGAT_LAMA) {
        mdlErr('Tenggat waktu tidak boleh sebelum hari ini (' + (tglIndo(HARI_INI) || HARI_INI) + ').');
        return;
      }

      var edit = (MODE === 'edit');
      var url = edit ? CFG.updateUrl : CFG.createUrl;
      var body = { pekerjaan: pekerjaan, catatan: catatan, dikerjakan_oleh: kerjakan, tenggat: tenggat };
      if (edit) body.id = EDIT_ID;

      save.disabled = true; save.textContent = 'Menyimpan…';
      kirim(url, body)
        .then(function (res) {
          save.disabled = false; save.textContent = lbl;
          if (res.ok && res.body.status === 'ok') {
            closeMdl();
            var pesan = res.body.message || (edit ? 'Perubahan tersimpan.' : 'Pekerjaan ditambahkan.');
            // tersimpan, tapi saringan yang sedang aktif menyembunyikannya —
            // tanpa keterangan ini barisnya terlihat "hilang" setelah disimpan
            if (res.body.item && !cocokFilter(res.body.item)) {
              pesan += ' Tidak tampil karena saringan "' + labelFilter() + '".';
            }
            toast('ok', pesan);
            muat();
            return;
          }
          mdlErr(res.body.message || (edit ? 'Gagal menyimpan perubahan.' : 'Gagal menambahkan pekerjaan.'));
        })
        .catch(function (e) {
          save.disabled = false; save.textContent = lbl;
          mdlErr('Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
        });
    });
  }

  /* ==========================================================
     STARFIELD — identik dengan index.js/akses.js
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

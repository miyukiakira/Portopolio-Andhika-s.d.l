/* ============================================================
   MAGI//SYSTEM — Absensi
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; absen.html
   hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur:
     1. Isi filter Nama/ID + tanggal (Dari–Sampai, default hari ini)
        → tekan "Cari".
     2. Data absen tampil sebagai tabel; tiap baris punya tombol "Ubah".
     3. "Ubah"   → form terisi, karyawan & tanggal TERKUNCI, hanya
                   kode/jam/surat/catatan yang bisa disunting.
        "Tambah" → form kosong, cari karyawan dulu, lalu isi semuanya.
     4. Simpan mengirim SATU baris ke server, lalu halaman memuat
        ulang hasil pencarian supaya yang tampil = yang tersimpan.

   KENAPA KARYAWAN & TANGGAL TERKUNCI SAAT UBAH:
   tabel karyawan_absen punya UNIQUE (id_ho, tgl) dan penyimpanan
   memakai upsert. Mengganti salah satu dari keduanya berarti menunjuk
   baris LAIN — hasilnya baris baru dibuat dan yang lama tertinggal,
   bukan "pindah". Jadi ganti orang/tanggal = hapus lalu tambah, bukan
   ubah. Ini juga persis sebatas GRANT UPDATE per kolom milik n8n_mbr.

   TERHUBUNG KE n8n:
     "Cari"   -> GET  CFG.fetchUrl    (webhook absen-list)
     "Simpan" -> POST CFG.saveUrl     (webhook absen-save)
     pencarian karyawan pada form Tambah
              -> GET  CFG.karyawanUrl (webhook karyawan-list, dipakai ulang)
   Ketiganya memakai CORS "*" sehingga fetch lintas-origin dari :8088 berhasil.
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    // halaman utama (tombol kembali)
    homePage: './index.html',
    // editor n8n
    n8nBase: MAGI.n8nBase,
    // Endpoint BACKEND (workflow n8n aktif):
    //   fetchUrl    : GET  ?q=&from=&to= → array {idAbsen,id,nama,jabatan,tgl,kode,jam,surat,catatan}
    //   saveUrl     : POST {rows:[{id_ho,tgl,kode,jam,surat,catatan}]} → {status,saved,skipped,message,errors}
    //   karyawanUrl : GET  ?q=          → array karyawan (dipakai ulang dari modul Karyawan)
    fetchUrl: MAGI.url('/webhook/absen-list'),
    saveUrl: MAGI.url('/webhook/absen-save'),
    karyawanUrl: MAGI.url('/webhook/karyawan-list'),
    // kode absen yang sah — HARUS sama dengan konstanta KODE di
    // workflow "Absen Save" (node Bangun Simpan). Ubah di dua tempat.
    codes: ['A', 'PW', 'SP', 'SPS', 'PP', 'DS', 'NS', 'CS', 'OD', 'ON',
            'FB', 'SPL', 'WT', 'BTP', 'CB', 'SK', 'LS', 'TBA'],
    // Warna badge per kode. Sengaja KOSONG: arti tiap kode belum
    // didokumentasikan, jadi semua tampil netral daripada diberi warna
    // yang menyesatkan. Isi nanti, mis. { A:'bad', SK:'warn' }.
    codeColor: {},
    // Kode yang WAJIB disertai surat, dipakai panel "Belum Ada Surat".
    // KOSONG = semua kode ikut didaftar. Sengaja begitu: belum ada aturan
    // tertulis kode mana yang wajib bersurat, dan menebaknya akan
    // MENYEMBUNYIKAN tunggakan — kesalahan yang lebih mahal daripada
    // mendaftar baris yang ternyata tidak perlu surat. Isi mis. ['SK','A']
    // begitu aturannya pasti.
    kodeWajibSurat: []
  };

  /* batas kolom, disamakan dengan skema MySQL karyawan_absen */
  var MAX_CATATAN = 255;
  var MAX_JAM = 99.99;

  /* ==========================================================
     2. STYLE — tema "warm space" (selaras index.js / roster.js)
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

    '.wrap{position:relative;z-index:1;max-width:1500px;margin:0 auto;padding:22px 24px 48px}',

    /* ---------- HEADER ---------- */
    'header.hud{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:14px 20px;margin-bottom:22px;',
    '  border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(255,106,31,.07),rgba(10,8,6,.35));',
    '  box-shadow:inset 0 1px 0 rgba(244,234,219,.06),0 12px 40px rgba(0,0,0,.45)}',
    '.mark{width:46px;height:46px;flex:0 0 auto;filter:drop-shadow(0 0 10px rgba(255,106,31,.55))}',
    '.brand{display:flex;flex-direction:column;line-height:1.1}',
    '.brand .logo{font-size:20px;font-weight:800;letter-spacing:.14em;color:var(--cream)}',
    '.brand .logo b{color:var(--orange);font-weight:800}',
    '.brand .sub{font-family:var(--mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--cream-mute);margin-top:3px}',
    '.hud-spacer{flex:1}',
    '.back{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;',
    '  text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:8px 15px;background:rgba(244,234,219,.04);color:var(--cream-dim);transition:.15s}',
    '.back:hover{color:var(--cream);border-color:var(--line-strong);box-shadow:var(--glow)}',
    '.pill{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 13px;background:rgba(244,234,219,.04);color:var(--cream-dim)}',
    '.dot{width:8px;height:8px;border-radius:50%;background:var(--cream-mute);flex:0 0 auto}',
    '.dot.on{background:var(--ok);box-shadow:0 0 10px var(--ok)}',
    '.dot.off{background:var(--crit);box-shadow:0 0 10px rgba(226,59,50,.7)}',
    '.dot.wait{background:var(--warn);box-shadow:0 0 10px rgba(255,176,58,.7);animation:pulse 1.2s infinite}',
    '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}',

    /* ---------- PANEL ---------- */
    '.panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--panel),var(--panel2));',
    '  box-shadow:0 10px 34px rgba(0,0,0,.4);overflow:hidden;margin-bottom:22px}',
    '.p-head{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.p-head h2{margin:0;font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream)}',
    '.p-head .idx{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--orange)}',
    '.p-head .spacer{flex:1}',
    '.p-body{padding:18px}',

    /* ---------- FILTER ---------- */
    '.filterbar{display:grid;grid-template-columns:minmax(200px,2fr) minmax(140px,1fr) minmax(140px,1fr) auto auto;gap:14px;align-items:end}',
    '@media(max-width:900px){.filterbar{grid-template-columns:1fr 1fr}}',
    '@media(max-width:520px){.filterbar{grid-template-columns:1fr}}',
    '.fld{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.fld label{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:10px 12px;transition:.15s}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.inp:disabled{opacity:.55;cursor:not-allowed}',
    'input[type=date].inp,input[type=number].inp{font-family:var(--mono);color-scheme:dark}',
    'select.inp{font-family:var(--mono);cursor:pointer}',
    'select.inp option{background:var(--panel);color:var(--cream)}',
    'textarea.inp{resize:vertical;min-height:74px;font-family:var(--sans)}',

    /* ---------- TOMBOL ---------- */
    '.btn{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;white-space:nowrap;',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 20px;background:transparent;color:var(--cream-dim);transition:.15s}',
    '.btn:hover:not(:disabled){color:var(--cream);border-color:var(--line-strong)}',
    '.btn.primary{background:linear-gradient(180deg,var(--orange),var(--rust));border-color:transparent;color:#1a0e06;font-weight:700}',
    '.btn.primary:hover:not(:disabled){filter:brightness(1.1);box-shadow:var(--glow)}',
    '.btn.ok{background:linear-gradient(180deg,var(--ok),#3f8f66);border-color:transparent;color:#04140c;font-weight:700}',
    '.btn.ok:hover:not(:disabled){filter:brightness(1.08);box-shadow:0 0 18px rgba(127,214,166,.35)}',
    '.btn.add{border-color:rgba(255,176,58,.45);color:var(--amber)}',
    '.btn.add:hover:not(:disabled){color:#1a0e06;background:linear-gradient(180deg,var(--amber),#b87a1c);border-color:transparent}',
    '.btn:disabled{opacity:.42;cursor:not-allowed}',
    '.btn.mini{padding:7px 13px;font-size:10px;letter-spacing:.12em}',

    /* ---------- TABEL HASIL ---------- */
    '.res-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.res-head .count{font-family:var(--mono);font-size:11px;color:var(--cream-dim)}',
    '.res-head .count b{color:var(--amber)}',
    '.tbl-wrap{overflow-x:auto}',
    'table.absen{width:100%;border-collapse:collapse;min-width:960px}',
    '.absen thead th{position:sticky;top:0;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;',
    '  text-align:left;color:var(--cream-mute);padding:11px 12px;border-bottom:1px solid var(--line-strong);background:var(--panel)}',
    '.absen tbody td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13.5px}',
    '.absen tbody tr{transition:background .15s}',
    '.absen tbody tr:hover{background:rgba(244,234,219,.03)}',
    '.absen tbody tr.just-saved{background:rgba(127,214,166,.10)}',
    '.absen tbody tr.just-saved td:first-child{box-shadow:inset 3px 0 0 var(--ok)}',
    '.c-id{font-family:var(--mono);font-size:12px;color:var(--amber);white-space:nowrap}',
    '.c-name{color:var(--cream);font-weight:600}',
    '.c-role{color:var(--cream-dim);font-size:12.5px}',
    '.c-date{font-family:var(--mono);font-size:12px;color:var(--cream-dim);white-space:nowrap}',
    '.c-num{font-family:var(--mono);font-size:12.5px;color:var(--cream);text-align:right;white-space:nowrap}',
    '.c-note{color:var(--cream-dim);font-size:12.5px;max-width:280px}',
    '.c-act{text-align:right;white-space:nowrap}',
    '.muted{color:var(--cream-mute)}',
    '.kode{display:inline-block;font-family:var(--mono);font-size:11.5px;font-weight:700;letter-spacing:.08em;',
    '  padding:4px 10px;border-radius:7px;border:1px solid var(--line);background:rgba(244,234,219,.05);color:var(--cream)}',
    '.kode.warn{color:var(--amber);border-color:rgba(255,176,58,.4)}',
    '.kode.bad{color:var(--red);border-color:rgba(226,59,50,.45)}',
    '.kode.good{color:var(--ok);border-color:rgba(127,214,166,.4)}',

    /* umur tunggakan surat — angka mentah, tanpa ambang "terlambat":
       belum ada aturan tertulis berapa hari surat harus masuk, jadi
       mewarnainya sama saja mengarang kebijakan. Urutan terlama di atas
       sudah cukup menonjolkan yang perlu dikejar. */
    '.age{font-family:var(--mono);font-size:12px;color:var(--cream-dim);white-space:nowrap}',
    '.age b{color:var(--amber)}',

    /* label "opsional" + ringkasan rentang tanggal pada form Tambah */
    '.opt{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--cream-mute);',
    '  border:1px solid var(--line);border-radius:5px;padding:1px 5px;margin-left:6px;vertical-align:middle}',
    '.rangehint{display:none;margin-top:10px;font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;',
    '  color:var(--cream-dim);border:1px dashed var(--line-strong);border-radius:9px;padding:9px 12px;',
    '  background:rgba(255,106,31,.05)}',
    '.rangehint.on{display:block}',
    '.rangehint b{color:var(--amber)}',
    '.rangehint.bad{border-color:rgba(226,59,50,.5);background:rgba(226,59,50,.07);color:var(--red)}',
    '.rangehint.bad b{color:var(--red)}',

    /* ---------- STATE KOSONG / LOADING ---------- */
    '.state{padding:46px 18px;text-align:center;color:var(--cream-mute);font-family:var(--mono);font-size:12px;letter-spacing:.1em}',
    '.state .big{font-size:34px;opacity:.5;margin-bottom:12px}',
    '.state b{color:var(--amber)}',
    '.spin{display:inline-block;width:26px;height:26px;border:3px solid rgba(255,106,31,.25);border-top-color:var(--orange);',
    '  border-radius:50%;animation:rot .8s linear infinite;margin-bottom:14px}',
    '@keyframes rot{to{transform:rotate(360deg)}}',

    /* ---------- MODAL FORM ---------- */
    '.mask{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;padding:22px;',
    '  background:rgba(6,4,3,.76);backdrop-filter:blur(3px)}',
    '.mask.on{display:flex}',
    '.modal{width:min(680px,96vw);max-height:92vh;overflow-y:auto;border:1px solid var(--line-strong);border-radius:16px;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 26px 70px rgba(0,0,0,.7)}',
    '.m-head{display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.12),transparent)}',
    '.m-head h3{margin:0;font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--cream)}',
    '.m-head .spacer{flex:1}',
    '.m-head .x{cursor:pointer;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--cream-dim);',
    '  font-size:16px;line-height:1;padding:5px 10px;transition:.15s}',
    '.m-head .x:hover{color:var(--cream);border-color:var(--line-strong)}',
    '.m-body{padding:18px 20px}',
    '.m-foot{display:flex;align-items:center;gap:12px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--line)}',
    '.m-foot .note{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);margin-right:auto;letter-spacing:.06em}',
    '.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '@media(max-width:560px){.grid2{grid-template-columns:1fr}}',
    '.gap{margin-top:14px}',

    /* target absen (karyawan + tanggal) di dalam modal */
    '.target{display:flex;align-items:center;gap:13px;padding:13px 15px;border:1px solid var(--line);border-radius:11px;',
    '  background:rgba(244,234,219,.04);margin-bottom:16px}',
    '.target .ava{width:40px;height:40px;flex:0 0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    '  font-family:var(--mono);font-size:14px;font-weight:800;color:#1a0e06;background:linear-gradient(160deg,var(--amber),var(--orange))}',
    '.target .who{min-width:0;flex:1}',
    '.target .who .nm{font-weight:700;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.target .who .meta{font-family:var(--mono);font-size:11px;color:var(--cream-mute);margin-top:2px}',
    '.target .who .meta b{color:var(--amber);font-weight:700}',
    '.lock{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;padding:4px 9px;border-radius:999px;',
    '  border:1px solid var(--line);color:var(--cream-mute);white-space:nowrap}',

    /* pencarian karyawan pada mode Tambah */
    '.findbar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}',
    '.hits{margin-top:12px;border:1px solid var(--line);border-radius:11px;overflow:hidden;max-height:260px;overflow-y:auto}',
    '.hit{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;padding:11px 14px;',
    '  background:transparent;border:0;border-bottom:1px solid var(--line);color:var(--cream);transition:.13s}',
    '.hit:last-child{border-bottom:0}',
    '.hit:hover{background:rgba(255,106,31,.10)}',
    '.hit .col{display:flex;flex-direction:column;min-width:0;flex:1}',
    '.hit .col .n{font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hit .col .i{font-family:var(--mono);font-size:11px;color:var(--amber)}',
    '.hit .j{font-size:12px;color:var(--cream-mute);white-space:nowrap}',
    '.hint{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);letter-spacing:.06em;margin-top:10px}',
    '.err{font-family:var(--mono);font-size:11px;color:var(--red);letter-spacing:.04em;margin-top:12px;display:none}',
    '.err.on{display:block}',

    /* ---------- TOAST ---------- */
    '.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:90;opacity:0;pointer-events:none;',
    '  max-width:min(560px,92vw);font-family:var(--mono);font-size:12px;letter-spacing:.04em;line-height:1.6;padding:13px 18px;border-radius:11px;',
    '  border:1px solid var(--line-strong);background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 18px 50px rgba(0,0,0,.6);transition:.28s}',
    '.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}',
    '.toast.ok{border-color:rgba(127,214,166,.5)}.toast.ok b{color:var(--ok)}',
    '.toast.warn{border-color:rgba(255,176,58,.5)}.toast.warn b{color:var(--amber)}',
    '.toast.crit{border-color:rgba(226,59,50,.6)}.toast.crit b{color:var(--red)}',
    '.toast b{color:var(--amber)}',

    '.foot{margin-top:26px;text-align:center;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--cream-mute)}',
    '.foot a{color:var(--cream-dim);text-decoration:none;border-bottom:1px dotted var(--cream-mute)}',
    '.foot a:hover{color:var(--amber)}',
    '@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('\n');

  /* ==========================================================
     3. MARKUP
     ========================================================== */
  var ICON_MARK =
    '<svg class="mark" viewBox="0 0 48 48" fill="none">' +
    '<path d="M24 3l18 10.5v21L24 45 6 34.5v-21z" stroke="#FF6A1F" stroke-width="1.6"/>' +
    '<path d="M24 11l11 6.4v12.8L24 36.6 13 30.2V17.4z" stroke="#E23B32" stroke-width="1.2" opacity=".75"/>' +
    '<circle cx="24" cy="24" r="3.6" fill="#FFB03A"/>' +
    '<ellipse cx="24" cy="24" rx="17" ry="6.5" stroke="#F4EADB" stroke-width=".9" opacity=".35" transform="rotate(-28 24 24)"/>' +
    '</svg>';

  function codeOptions(sel) {
    var out = '<option value="">— pilih kode —</option>';
    for (var i = 0; i < CFG.codes.length; i++) {
      var c = CFG.codes[i];
      out += '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c + '</option>';
    }
    return out;
  }

  var HTML = [
    '<canvas id="stars"></canvas>',
    '<div class="wrap">',

    /* ---- header ---- */
    '<header class="hud">',
    ICON_MARK,
    '<div class="brand"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
    '<div class="sub">Absensi · Data Master</div></div>',
    '<div class="hud-spacer"></div>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">siap</span></div>',
    '</header>',

    /* ---- panel filter ---- */
    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Filter Pencarian</h2>',
    '<span class="spacer"></span><span class="idx">nama / id · tanggal</span></div>',
    '<div class="p-body">',
    '<div class="filterbar">',
    '<div class="fld"><label for="fQuery">Nama / ID HO</label>',
    '<input class="inp" id="fQuery" type="text" placeholder="mis. Budi atau XYZ00000001" autocomplete="off"></div>',
    '<div class="fld"><label for="fFrom">Tanggal Dari</label>',
    '<input class="inp" id="fFrom" type="date"></div>',
    '<div class="fld"><label for="fTo">Tanggal Sampai</label>',
    '<input class="inp" id="fTo" type="date"></div>',
    '<div class="fld"><button class="btn primary" id="btnSearch">Cari</button></div>',
    '<div class="fld"><button class="btn add" id="btnAdd">+ Tambah</button></div>',
    '</div>',
    '</div></section>',

    /* ---- panel hasil ---- */
    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>Data Absensi</h2>',
    '<span class="spacer"></span>',
    '<span class="res-head"><span class="count" id="resCount"></span></span></div>',
    '<div id="resBody">',
    '<div class="state"><div class="big">▤</div>Masukkan filter lalu tekan <b>Cari</b> untuk menampilkan absensi.</div>',
    '</div>',
    '</section>',

    /* ---- panel surat belum diterima ---- */
    '<section class="panel"><div class="p-head"><span class="idx">03</span><h2>Belum Ada Surat</h2>',
    '<span class="spacer"></span>',
    '<span class="res-head"><span class="count" id="suratCount"></span></span></div>',
    '<div id="suratBody">',
    '<div class="state"><div class="big">✉</div>Daftar muncul setelah pencarian dijalankan.</div>',
    '</div>',
    '</section>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.n8nBase + '" target="_blank" rel="noopener">n8n editor</a> · ',
    '<a href="' + CFG.homePage + '">Mission Control</a> · Absensi</div>',
    '</div>', /* /wrap */

    /* ---- modal form (dipakai untuk Tambah maupun Ubah) ---- */
    '<div class="mask" id="mask">',
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle">Tambah Absensi</h3><span class="spacer"></span>',
    '<span class="lock" id="mMode">baru</span>',
    '<button class="x" id="mClose" title="Tutup">✕</button></div>',
    '<div class="m-body">',

    /* pencarian karyawan — hanya tampil pada mode Tambah */
    '<div id="findWrap">',
    '<div class="findbar">',
    '<div class="fld"><label for="fFind">Cari Karyawan (nama / ID HO)</label>',
    '<input class="inp" id="fFind" type="text" placeholder="ketik nama atau ID HO lalu Enter" autocomplete="off"></div>',
    '<div class="fld"><button class="btn" id="btnFind">Cari</button></div>',
    '</div>',
    '<div id="hits"></div>',
    '<div class="hint">Pilih karyawan dulu, lalu isi tanggal dan kode absennya.</div>',
    '</div>',

    /* target terpilih */
    '<div class="target" id="target" style="display:none">',
    '<div class="ava" id="tAva">?</div>',
    '<div class="who"><div class="nm" id="tNama">—</div>',
    '<div class="meta"><b id="tId">—</b> · <span id="tJab">—</span></div></div>',
    '<span class="lock" id="tLock" style="display:none">terkunci</span>',
    '</div>',

    /* field absen — baris tanggal: awal (wajib) + akhir (opsional, hanya
       pada mode Tambah; mode Ubah menyunting tepat satu baris) */
    '<div class="grid2">',
    '<div class="fld"><label for="fTgl" id="lblTgl">Tanggal</label>',
    '<input class="inp" id="fTgl" type="date"></div>',
    '<div class="fld" id="wrapTglAkhir"><label for="fTglAkhir">Tanggal Sampai <span class="opt">opsional</span></label>',
    '<input class="inp" id="fTglAkhir" type="date" placeholder="kosongkan untuk 1 hari"></div>',
    '</div>',
    '<div class="rangehint" id="rangeHint"></div>',
    '<div class="grid2 gap">',
    '<div class="fld"><label for="fKode">Kode Absen</label>',
    '<select class="inp" id="fKode">' + codeOptions('') + '</select></div>',
    '<div class="fld"><label for="fJam">Jumlah Jam</label>',
    '<input class="inp" id="fJam" type="number" step="0.5" min="0" max="' + MAX_JAM + '" placeholder="kosongkan bila tidak relevan"></div>',
    '</div>',
    '<div class="fld gap"><label for="fSurat">Surat Diterima</label>',
    '<input class="inp" id="fSurat" type="date"></div>',
    '<div class="fld gap"><label for="fCatatan">Catatan</label>',
    '<textarea class="inp" id="fCatatan" maxlength="' + MAX_CATATAN + '" placeholder="opsional, maksimal ' + MAX_CATATAN + ' karakter"></textarea></div>',
    '<div class="err" id="mErr"></div>',
    '</div>',
    '<div class="m-foot"><span class="note" id="mNote">Jumlah jam & surat boleh dikosongkan.</span>',
    '<button class="btn" id="mCancel">Batal</button>',
    '<button class="btn ok" id="mSave">Simpan</button></div>',
    '</div></div>',

    '<div class="toast" id="toast"></div>'
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.getElementById('app').innerHTML = HTML;

  var $ = function (id) { return document.getElementById(id); };

  /* ==========================================================
     4. STARFIELD (latar bintang, selaras index.js)
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
     5. UTIL
     ========================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function setLink(state, txt) {
    $('linkDot').className = 'dot ' + state;
    $('linkTxt').textContent = txt;
  }
  var toastT = null;
  function toast(level, html) {
    var t = $('toast');
    t.className = 'toast ' + level + ' on';
    t.innerHTML = html;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.className = 'toast ' + level; }, 4600);
  }
  function initial(nama) {
    var s = String(nama || '').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ==========================================================
     6. RENDER TABEL
     ========================================================== */
  var current = [];        // baris yang sedang ditampilkan
  var lastSavedKey = '';   // "id|tgl" yang baru saja disimpan → disorot

  function rowKey(r) { return r.id + '|' + r.tgl; }

  function renderTable(rows) {
    current = rows;

    if (!rows.length) {
      $('resBody').innerHTML =
        '<div class="state"><div class="big">∅</div>Tidak ada data absensi untuk filter tersebut.<br>' +
        'Tekan <b>+ Tambah</b> untuk mencatat yang baru.</div>';
      $('resCount').innerHTML = '';
      renderBelumSurat();
      return;
    }

    var body = rows.map(function (r, i) {
      var cls = CFG.codeColor[r.kode] || '';
      var sorot = rowKey(r) === lastSavedKey ? ' class="just-saved"' : '';
      return '<tr' + sorot + '>' +
        '<td class="c-id">' + esc(r.id) + '</td>' +
        '<td class="c-name">' + esc(r.nama) + '</td>' +
        '<td class="c-role">' + (esc(r.jabatan) || '<span class="muted">—</span>') + '</td>' +
        '<td class="c-date">' + esc(r.tgl) + '</td>' +
        '<td><span class="kode ' + cls + '">' + esc(r.kode || '—') + '</span></td>' +
        '<td class="c-num">' + (r.jam !== '' ? esc(r.jam) : '<span class="muted">—</span>') + '</td>' +
        '<td class="c-date">' + (r.surat ? esc(r.surat) : '<span class="muted">—</span>') + '</td>' +
        '<td class="c-note">' + (esc(r.catatan) || '<span class="muted">—</span>') + '</td>' +
        '<td class="c-act"><button class="btn mini" data-idx="' + i + '">Ubah</button></td>' +
        '</tr>';
    }).join('');

    $('resBody').innerHTML =
      '<div class="tbl-wrap"><table class="absen"><thead><tr>' +
      '<th>ID HO</th><th>Nama</th><th>Jabatan</th><th>Tanggal</th><th>Kode</th>' +
      '<th style="text-align:right">Jam</th><th>Surat</th><th>Catatan</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';

    $('resCount').innerHTML = 'Menampilkan <b>' + rows.length + '</b> baris';

    Array.prototype.forEach.call($('resBody').querySelectorAll('.btn.mini'), function (b) {
      b.addEventListener('click', function () {
        bukaModal('edit', current[+b.getAttribute('data-idx')]);
      });
    });

    renderBelumSurat();
  }

  /* ==========================================================
     6b. PANEL "BELUM ADA SURAT"
     ==========================================================
     Baris hasil pencarian yang kolom `surat_diterima`-nya masih kosong —
     yaitu suratnya belum diterima. Dibaca dari `current`, bukan dari
     permintaan terpisah ke server: datanya sudah ada di tangan, dan
     mengambilnya lagi hanya menambah satu jalur yang bisa tidak sinkron
     dengan tabel di atasnya.

     Penyaringan per kode dikendalikan CFG.kodeWajibSurat, yang sengaja
     dibiarkan kosong (= semua kode ikut) selama aturannya belum pasti. */
  var HARI_MS = 86400000;

  function wajibSurat(kode) {
    var w = CFG.kodeWajibSurat || [];
    return !w.length || w.indexOf(kode) >= 0;
  }

  function umurHari(tgl) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl || '');
    if (!m) return null;
    var a = new Date(+m[1], +m[2] - 1, +m[3]);
    var kini = new Date();
    /* dibandingkan pada tengah malam masing-masing supaya jam tidak ikut
       menghitung — "kemarin" harus selalu 1 hari, bukan 0 atau 2 */
    var t = new Date(kini.getFullYear(), kini.getMonth(), kini.getDate());
    return Math.round((t - a) / HARI_MS);
  }

  function labelUmur(n) {
    if (n == null) return '<span class="muted">—</span>';
    if (n < 0) return '<span class="muted">akan datang</span>';
    if (n === 0) return 'hari ini';
    return '<b>' + n + '</b> hari';
  }

  function renderBelumSurat() {
    var idx = [];
    current.forEach(function (r, i) { if (!r.surat && wajibSurat(r.kode)) idx.push(i); });

    /* terlama di atas — itu yang paling perlu dikejar */
    idx.sort(function (a, b) {
      var ta = current[a].tgl || '', tb = current[b].tgl || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    if (!current.length) {
      $('suratBody').innerHTML =
        '<div class="state"><div class="big">✉</div>Daftar muncul setelah pencarian dijalankan.</div>';
      $('suratCount').innerHTML = '';
      return;
    }
    if (!idx.length) {
      $('suratBody').innerHTML =
        '<div class="state"><div class="big">✔</div>Semua absensi pada rentang ini sudah punya tanggal surat.</div>';
      $('suratCount').innerHTML = '<b>0</b> dari ' + current.length + ' baris';
      return;
    }

    var body = idx.map(function (i) {
      var r = current[i];
      var cls = CFG.codeColor[r.kode] || '';
      var sorot = rowKey(r) === lastSavedKey ? ' class="just-saved"' : '';
      return '<tr' + sorot + '>' +
        '<td class="c-id">' + esc(r.id) + '</td>' +
        '<td class="c-name">' + esc(r.nama) + '</td>' +
        '<td class="c-role">' + (esc(r.jabatan) || '<span class="muted">—</span>') + '</td>' +
        '<td class="c-date">' + esc(r.tgl) + '</td>' +
        '<td><span class="kode ' + cls + '">' + esc(r.kode || '—') + '</span></td>' +
        '<td class="age">' + labelUmur(umurHari(r.tgl)) + '</td>' +
        '<td class="c-note">' + (esc(r.catatan) || '<span class="muted">—</span>') + '</td>' +
        '<td class="c-act"><button class="btn mini" data-idx="' + i + '">Isi Surat</button></td>' +
        '</tr>';
    }).join('');

    $('suratBody').innerHTML =
      '<div class="tbl-wrap"><table class="absen"><thead><tr>' +
      '<th>ID HO</th><th>Nama</th><th>Jabatan</th><th>Tanggal</th><th>Kode</th>' +
      '<th>Sudah</th><th>Catatan</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';

    $('suratCount').innerHTML = '<b>' + idx.length + '</b> dari ' + current.length +
      ' baris belum ada surat';

    Array.prototype.forEach.call($('suratBody').querySelectorAll('.btn.mini'), function (b) {
      b.addEventListener('click', function () {
        bukaModal('edit', current[+b.getAttribute('data-idx')]);
      });
    });
  }

  /* ==========================================================
     7. MODAL — Tambah / Ubah
     ========================================================== */
  var mode = 'add';       // 'add' | 'edit'
  var target = null;      // {id_ho, nama, jabatan}

  function setTarget(t) {
    target = t;
    if (!t) { $('target').style.display = 'none'; return; }
    $('target').style.display = 'flex';
    $('tAva').textContent = initial(t.nama);
    $('tNama').textContent = t.nama || '—';
    $('tId').textContent = t.id_ho || '—';
    $('tJab').textContent = t.jabatan || '—';
  }

  function showErr(msg) {
    var e = $('mErr');
    if (!msg) { e.className = 'err'; e.textContent = ''; return; }
    e.className = 'err on';
    e.innerHTML = msg;
  }

  function bukaModal(m, row) {
    mode = m;
    showErr('');
    $('hits').innerHTML = '';
    $('fFind').value = '';

    if (m === 'edit') {
      $('mTitle').textContent = 'Ubah Absensi';
      $('mMode').textContent = 'ubah';
      $('findWrap').style.display = 'none';
      $('tLock').style.display = '';
      setTarget({ id_ho: row.id, nama: row.nama, jabatan: row.jabatan });
      $('lblTgl').textContent = 'Tanggal';
      $('fTgl').value = row.tgl;
      $('fTgl').disabled = true;                 // kunci: bagian dari kunci unik
      /* rentang tidak berlaku saat mengubah: satu baris = satu (id_ho,tgl),
         dan menyunting berarti menimpa baris itu — bukan membuat deret baru */
      $('wrapTglAkhir').style.display = 'none';
      $('fTglAkhir').value = '';
      $('fKode').value = row.kode || '';
      $('fJam').value = row.jam || '';
      $('fSurat').value = row.surat || '';
      $('fCatatan').value = row.catatan || '';
      $('mNote').textContent = 'Karyawan & tanggal terkunci — keduanya kunci baris.';
    } else {
      $('mTitle').textContent = 'Tambah Absensi';
      $('mMode').textContent = 'baru';
      $('findWrap').style.display = '';
      $('tLock').style.display = 'none';
      setTarget(null);
      $('lblTgl').textContent = 'Tanggal Mulai';
      $('fTgl').value = $('fFrom').value || fmtDate(new Date());
      $('fTgl').disabled = false;
      $('wrapTglAkhir').style.display = '';
      $('fTglAkhir').value = '';
      $('fTglAkhir').min = $('fTgl').value;
      $('fKode').value = '';
      $('fJam').value = '';
      $('fSurat').value = '';
      $('fCatatan').value = '';
      $('mNote').textContent = 'Kosongkan "Tanggal Sampai" untuk mencatat satu hari saja.';
    }
    perbaruiRangeHint();

    $('mask').classList.add('on');
    setTimeout(function () { (m === 'edit' ? $('fKode') : $('fFind')).focus(); }, 40);
  }

  function tutupModal() {
    $('mask').classList.remove('on');
    showErr('');
  }

  /* ---- pencarian karyawan (mode Tambah), memakai webhook karyawan-list ---- */
  function cariKaryawan() {
    var q = $('fFind').value.trim();
    if (!q) { showErr('Ketik nama atau ID HO dulu.'); return; }
    showErr('');
    $('btnFind').disabled = true;
    $('hits').innerHTML = '<div class="state"><div class="spin"></div><br>Mencari karyawan…</div>';

    fetch(CFG.karyawanUrl + '?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        $('btnFind').disabled = false;
        if (!Array.isArray(rows)) rows = [];
        if (!rows.length) {
          $('hits').innerHTML = '';
          showErr('Tidak ada karyawan cocok dengan "' + esc(q) + '".');
          return;
        }
        if (rows.length === 1) { pilihKaryawan(rows[0]); return; }
        $('hits').innerHTML = rows.slice(0, 50).map(function (r, i) {
          return '<button class="hit" data-i="' + i + '">' +
            '<div class="col"><span class="n">' + esc(r.nama) + '</span>' +
            '<span class="i">' + esc(r.id_ho) + '</span></div>' +
            '<span class="j">' + (esc(r.jabatan) || '—') + '</span></button>';
        }).join('');
        Array.prototype.forEach.call($('hits').querySelectorAll('.hit'), function (b) {
          b.addEventListener('click', function () { pilihKaryawan(rows[+b.getAttribute('data-i')]); });
        });
      })
      .catch(function (e) {
        $('btnFind').disabled = false;
        $('hits').innerHTML = '';
        showErr('Gagal mencari karyawan — ' + esc(String((e && e.message) || e)) + '.');
      });
  }

  function pilihKaryawan(k) {
    setTarget({ id_ho: k.id_ho, nama: k.nama, jabatan: k.jabatan });
    $('hits').innerHTML = '';
    showErr('');
    $('fKode').focus();
  }

  /* ---- rentang tanggal pada mode Tambah ----
     Kosongkan "Tanggal Sampai" → satu baris. Diisi → satu baris untuk SETIAP
     tanggal dari awal s/d akhir, isinya sama persis, hanya tanggalnya berbeda.
     Dikirim sebagai satu POST berisi banyak baris; workflow "Absen Save"
     memang menerima {rows:[…]} dan mengupsert per (id_ho,tgl), jadi tidak ada
     yang perlu diubah di sisi n8n. */
  var MAX_RENTANG = 7;     // maksimal satu pekan sekali simpan, lihat catatan di bawah

  function deretTanggal(awal, akhir) {
    var out = [], d = new Date(awal + 'T00:00:00'), stop = new Date(akhir + 'T00:00:00');
    while (d <= stop) {
      out.push(fmtDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  /* Ringkasan hidup di bawah kedua field tanggal. Bukan hiasan: baris absensi
     TIDAK BISA dihapus dari halaman ini (n8n_mbr sengaja tanpa grant DELETE),
     jadi salah ketik tanggal hanya bisa dibereskan lewat MySQL sebagai root.
     Menampilkan jumlah baris sebelum Simpan ditekan membuat kekeliruan itu
     tertangkap mata, bukan tertangkap besok. MAX_RENTANG 7 hari memperkecil
     kerusakan terburuknya: salah ketik tahun ditolak mentah, bukan menulis
     ratusan baris. Rentang lebih panjang dicatat per pekan, beberapa kali. */
  function perbaruiRangeHint() {
    var el = $('rangeHint');
    if (mode !== 'add') { el.className = 'rangehint'; el.innerHTML = ''; return; }
    var awal = $('fTgl').value, akhir = $('fTglAkhir').value;
    if (!isTgl(awal) || !akhir) { el.className = 'rangehint'; el.innerHTML = ''; return; }
    if (!isTgl(akhir)) { el.className = 'rangehint'; el.innerHTML = ''; return; }
    if (akhir < awal) {
      el.className = 'rangehint on bad';
      el.innerHTML = 'Tanggal sampai (<b>' + esc(akhir) + '</b>) lebih awal dari tanggal mulai (<b>' +
        esc(awal) + '</b>).';
      return;
    }
    var n = deretTanggal(awal, akhir).length;
    if (n > MAX_RENTANG) {
      el.className = 'rangehint on bad';
      el.innerHTML = 'Rentang <b>' + n + ' hari</b> — maksimal <b>' + MAX_RENTANG +
        '</b> hari dalam sekali simpan.';
      return;
    }
    el.className = 'rangehint on';
    el.innerHTML = 'Akan mencatat <b>' + n + '</b> baris: ' + esc(awal) + ' s/d ' + esc(akhir) +
      ' (isi sama, tanggal berurutan).';
  }

  function isTgl(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

  /* ---- validasi sisi klien (server tetap memvalidasi ulang) ---- */
  function kumpulkan() {
    if (!target || !target.id_ho) return { err: 'Pilih karyawan dulu.' };
    var tgl = $('fTgl').value;
    if (!isTgl(tgl)) return { err: 'Tanggal belum diisi.' };

    /* tanggal akhir hanya berlaku saat menambah; mode Ubah menyunting satu baris */
    var akhir = (mode === 'add') ? $('fTglAkhir').value : '';
    if (akhir && !isTgl(akhir)) return { err: 'Tanggal sampai tidak sah.' };
    if (akhir && akhir < tgl) {
      return { err: 'Tanggal sampai (' + esc(akhir) + ') lebih awal dari tanggal mulai (' + esc(tgl) + ').' };
    }

    var kode = $('fKode').value;
    if (!kode) return { err: 'Kode absen belum dipilih.' };

    var jam = String($('fJam').value).trim().replace(',', '.');
    if (jam !== '') {
      var n = Number(jam);
      if (!isFinite(n)) return { err: 'Jumlah jam bukan angka.' };
      if (n < 0) return { err: 'Jumlah jam tidak boleh negatif.' };
      if (n > MAX_JAM) return { err: 'Jumlah jam maksimal ' + MAX_JAM + '.' };
    }
    var catatan = $('fCatatan').value;
    if (catatan.length > MAX_CATATAN) return { err: 'Catatan maksimal ' + MAX_CATATAN + ' karakter.' };

    var tanggal = akhir ? deretTanggal(tgl, akhir) : [tgl];
    if (tanggal.length > MAX_RENTANG) {
      return { err: 'Rentang ' + tanggal.length + ' hari terlalu panjang — maksimal ' +
                    MAX_RENTANG + ' hari dalam sekali simpan.' };
    }

    var isi = { kode: kode, jam: jam, surat: $('fSurat').value, catatan: catatan };
    return {
      rows: tanggal.map(function (t) {
        return {
          id_ho: target.id_ho, tgl: t, kode: isi.kode,
          jam: isi.jam, surat: isi.surat, catatan: isi.catatan
        };
      })
    };
  }

  function simpan() {
    var hasil = kumpulkan();
    if (hasil.err) { showErr(hasil.err); return; }
    var rows = hasil.rows;
    var awal = rows[0], akhir = rows[rows.length - 1];

    showErr('');
    $('mSave').disabled = true;
    $('mCancel').disabled = true;
    setLink('wait', rows.length > 1 ? 'menyimpan ' + rows.length + ' baris…' : 'menyimpan…');

    fetch(CFG.saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, status: r.status, body: body || {} };
        });
      })
      .then(function (res) {
        $('mSave').disabled = false;
        $('mCancel').disabled = false;
        var b = res.body;
        if (res.ok && b.status === 'ok') {
          setLink('on', 'terhubung');
          /* sorotan hanya bisa menandai satu baris; pilih yang pertama */
          lastSavedKey = awal.id_ho + '|' + awal.tgl;
          tutupModal();
          /* jumlah yang dilaporkan diambil dari JAWABAN SERVER (b.saved), bukan
             dari rows.length — server yang memutuskan berapa yang benar-benar
             masuk (baris tidak sah dilewati, lihat "skip-invalid"). */
          var tersimpan = (b.saved != null) ? b.saved : rows.length;
          /* satu toast saja — toast() menimpa isi sebelumnya, jadi pesan
             "dilewati" digabung, bukan dikirim sebagai toast kedua */
          var pesan = (rows.length > 1)
            ? '<b>Tersimpan</b> — ' + esc(target.nama) + ' · <b>' + esc(String(tersimpan)) + ' baris</b> · ' +
              esc(awal.tgl) + ' s/d ' + esc(akhir.tgl) + ' · ' + esc(awal.kode) + '.'
            : '<b>Tersimpan</b> — ' + esc(target.nama) + ' · ' + esc(awal.tgl) + ' · ' + esc(awal.kode) + '.';
          if (b.skipped) pesan += ' <b>' + esc(String(b.skipped)) + ' baris dilewati.</b>';
          toast(b.skipped ? 'warn' : 'ok', pesan);
          // muat ulang supaya yang tampil = yang benar-benar tersimpan;
          // rentang filter dilebarkan agar SELURUH baris baru ikut terlihat.
          if (awal.tgl < $('fFrom').value) $('fFrom').value = awal.tgl;
          if (akhir.tgl > $('fTo').value) $('fTo').value = akhir.tgl;
          doSearch(true);
        } else {
          setLink('off', 'ditolak');
          var em = (b && b.message) ? b.message : ('HTTP ' + res.status);
          var det = (b && b.errors && b.errors.length)
            ? '<br>' + b.errors.slice(0, 5).map(esc).join('<br>') : '';
          showErr(esc(String(em)) + det);
          toast('crit', '<b>Gagal menyimpan</b> — ' + esc(String(em)) + '.');
        }
      })
      .catch(function (e) {
        $('mSave').disabled = false;
        $('mCancel').disabled = false;
        setLink('off', 'gagal');
        var msg = String((e && e.message) || e);
        showErr('Gagal menghubungi server — ' + esc(msg) + '.');
        toast('crit', '<b>Gagal menyimpan</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.saveUrl) + '</b>.');
      });
  }

  /* ==========================================================
     8. AKSI — Cari
     ========================================================== */
  function doSearch(diam) {
    var q = $('fQuery').value;
    var from = $('fFrom').value;
    var to = $('fTo').value;

    $('btnSearch').disabled = true;
    setLink('wait', 'memuat…');
    $('resBody').innerHTML = '<div class="state"><div class="spin"></div><br>Menarik data absensi dari server…</div>';
    $('resCount').innerHTML = '';
    /* panel surat ikut dikosongkan: kalau tidak, daftar hasil pencarian
       SEBELUMNYA tetap terpampang sementara tabel di atasnya sudah memuat
       yang baru — dua panel bercerita tentang dua pencarian berbeda */
    current = [];
    renderBelumSurat();

    var url = CFG.fetchUrl + '?q=' + encodeURIComponent(q) +
      '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);

    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) rows = [];
        renderTable(rows);
        lastSavedKey = '';
        $('btnSearch').disabled = false;
        setLink('on', 'terhubung');
        if (!rows.length && !diam) toast('warn', 'Tidak ada data absensi untuk filter tersebut.');
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        $('btnSearch').disabled = false;
        setLink('off', 'gagal');
        $('resBody').innerHTML =
          '<div class="state"><div class="big">⚠</div>Gagal memuat absensi dari server.<br>' +
          '<b>' + esc(msg) + '</b><br>Pastikan service <b>magi_api</b> berjalan (endpoint <b>absen-list</b>).</div>';
        $('resCount').innerHTML = '';
        current = [];
        renderBelumSurat();
        toast('crit', '<b>Gagal memuat</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.fetchUrl) + '</b>.');
      });
  }

  /* ==========================================================
     9. LISTENER
     ========================================================== */
  $('btnSearch').addEventListener('click', function () { doSearch(false); });
  $('btnAdd').addEventListener('click', function () { bukaModal('add', null); });
  $('btnFind').addEventListener('click', cariKaryawan);
  $('mClose').addEventListener('click', tutupModal);
  $('mCancel').addEventListener('click', tutupModal);
  $('mSave').addEventListener('click', simpan);

  $('mask').addEventListener('click', function (e) {
    if (e.target === $('mask')) tutupModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('mask').classList.contains('on')) tutupModal();
  });

  /* Enter di field filter = Cari */
  ['fQuery', 'fFrom', 'fTo'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(false); }
    });
  });
  /* Enter di pencarian karyawan = cari karyawan (bukan submit form) */
  $('fFind').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); cariKaryawan(); }
  });

  /* ringkasan rentang ikut berubah tiap kali salah satu tanggal disentuh */
  ['fTgl', 'fTglAkhir'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      /* batas bawah pemilih tanggal akhir mengikuti tanggal mulai, supaya
         rentang terbalik ditolak sebelum sempat diketik */
      if (id === 'fTgl') $('fTglAkhir').min = $('fTgl').value;
      perbaruiRangeHint();
    });
    $(id).addEventListener('change', perbaruiRangeHint);
  });

  /* ==========================================================
     BOOT — tanggal default = hari ini (dari & sampai)
     ========================================================== */
  (function boot() {
    var hariIni = fmtDate(new Date());
    $('fFrom').value = hariIni;
    $('fTo').value = hariIni;
    setLink('on', 'siap');
  })();
})();

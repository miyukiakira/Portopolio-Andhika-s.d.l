/* ============================================================
   MAGI//SYSTEM — Edit Roster
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; roster.html
   hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur:
     1. Isi filter Nama/ID + rentang tanggal → tekan "Cari".
     2. Data roster tampil sebagai list ke bawah
        (ID · Nama · Jabatan · Tanggal · Jadwal).
     3. Kolom "Jadwal" bisa diubah lewat dropdown
        (DS, NS, CS, FB, TR, T). Baris yang berubah ditandai.
     4. Tekan "Simpan" untuk mengirim perubahan ke server.

   TERHUBUNG KE n8n: "Cari" -> GET CFG.fetchUrl (webhook roster-list),
   "Simpan" -> POST CFG.saveUrl (webhook roster-update). Kedua webhook
   memakai CORS "*" sehingga fetch lintas-origin dari :8088 berhasil.
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
    // Endpoint BACKEND (magi-api — butuh hak fitur 'edit-roster'):
    //   fetchUrl : GET  ?q=&from=&to=  → array {id,nama,jabatan,tgl,jadwal}
    //   saveUrl  : POST {changes:[{id,tgl,jadwal}]} → {status,updated,skipped,message,errors}
    fetchUrl: MAGI.url('/webhook/roster-list'),
    saveUrl: MAGI.url('/webhook/roster-update'),
    //   deleteUrl   : POST {id_ho,tgl} → hapus roster orang itu tgl >= tgl
    //   karyawanUrl : GET  ?q= → cari karyawan (dipakai ulang dari halaman Karyawan)
    deleteUrl: MAGI.url('/webhook/roster-delete'),
    karyawanUrl: MAGI.url('/webhook/karyawan-list'),
    // opsi jadwal = katalog kode roster server (GET kode-roster, sumbernya
    // service/lib.js KODE_ROSTER). Daftar di bawah hanya cadangan kalau
    // permintaan katalog gagal — samakan bila katalog berubah.
    kodeUrl: MAGI.url('/webhook/kode-roster'),
    shifts: ['DS', 'NS', 'CS', 'TR', 'PP', 'FB', 'CB', 'T'],
    shiftLabel: {}
  };

  /* ==========================================================
     2. STYLE — tema "warm space" (selaras index.js)
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
    '.filterbar{display:grid;grid-template-columns:minmax(220px,2fr) minmax(150px,1fr) minmax(150px,1fr) auto;gap:14px;align-items:end}',
    '@media(max-width:820px){.filterbar{grid-template-columns:1fr 1fr}}',
    '@media(max-width:520px){.filterbar{grid-template-columns:1fr}}',
    '.fld{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.fld label{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:10px 12px;transition:.15s}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    'input[type=date].inp{font-family:var(--mono);color-scheme:dark}',

    /* ---------- TOMBOL ---------- */
    '.btn{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;white-space:nowrap;',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 20px;background:transparent;color:var(--cream-dim);transition:.15s}',
    '.btn:hover:not(:disabled){color:var(--cream);border-color:var(--line-strong)}',
    '.btn.primary{background:linear-gradient(180deg,var(--orange),var(--rust));border-color:transparent;color:#1a0e06;font-weight:700}',
    '.btn.primary:hover:not(:disabled){filter:brightness(1.1);box-shadow:var(--glow)}',
    '.btn.ok{background:linear-gradient(180deg,var(--ok),#3f8f66);border-color:transparent;color:#04140c;font-weight:700}',
    '.btn.ok:hover:not(:disabled){filter:brightness(1.08);box-shadow:0 0 18px rgba(127,214,166,.35)}',
    '.btn:disabled{opacity:.42;cursor:not-allowed}',

    /* ---------- TABEL HASIL ---------- */
    '.res-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}',
    '.res-head .count{font-family:var(--mono);font-size:11px;color:var(--cream-dim)}',
    '.res-head .count b{color:var(--amber)}',
    '.dirty-pill{font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:3px 10px;border-radius:999px;',
    '  background:rgba(255,176,58,.16);color:var(--amber);border:1px solid rgba(255,176,58,.4);display:none}',
    '.dirty-pill.on{display:inline-block}',
    '.tbl-wrap{overflow-x:auto}',
    'table.roster{width:100%;border-collapse:collapse;min-width:680px}',
    '.roster thead th{position:sticky;top:0;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;',
    '  text-align:left;color:var(--cream-mute);padding:11px 12px;border-bottom:1px solid var(--line-strong);background:var(--panel)}',
    '.roster tbody td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13.5px}',
    '.roster tbody tr{transition:background .15s}',
    '.roster tbody tr:hover{background:rgba(244,234,219,.03)}',
    '.roster tbody tr.changed{background:rgba(255,176,58,.07)}',
    '.roster tbody tr.changed td:first-child{box-shadow:inset 3px 0 0 var(--amber)}',
    '.c-id{font-family:var(--mono);font-size:12px;color:var(--amber);white-space:nowrap}',
    '.c-name{color:var(--cream);font-weight:600}',
    '.c-role{color:var(--cream-dim);font-size:12.5px}',
    '.c-date{font-family:var(--mono);font-size:12px;color:var(--cream-dim);white-space:nowrap}',

    /* dropdown jadwal — warna badge per shift (kelas ditempel via JS) */
    '.sel{font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--cream);cursor:pointer;',
    '  background:rgba(244,234,219,.05);border:1px solid var(--line);border-radius:8px;padding:7px 10px;transition:.15s}',
    '.sel:hover{border-color:var(--line-strong)}',
    '.sel:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.sel option{background:var(--panel);color:var(--cream)}',
    '.sel.s-DS{color:var(--ok);border-color:rgba(127,214,166,.4)}',
    '.sel.s-NS{color:var(--amber);border-color:rgba(255,176,58,.4)}',
    '.sel.s-CS{color:var(--orange);border-color:rgba(255,106,31,.4)}',
    '.sel.s-FB,.sel.s-TR,.sel.s-T{color:var(--cream-mute);border-color:var(--line)}',

    /* ---------- STATE KOSONG / LOADING ---------- */
    '.state{padding:46px 18px;text-align:center;color:var(--cream-mute);font-family:var(--mono);font-size:12px;letter-spacing:.1em}',
    '.state .big{font-size:34px;opacity:.5;margin-bottom:12px}',
    '.state b{color:var(--amber)}',
    '.spin{display:inline-block;width:26px;height:26px;border:3px solid rgba(255,106,31,.25);border-top-color:var(--orange);',
    '  border-radius:50%;animation:rot .8s linear infinite;margin-bottom:14px}',
    '@keyframes rot{to{transform:rotate(360deg)}}',

    /* ---------- BAR AKSI BAWAH ---------- */
    '.savebar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end;padding:14px 18px;border-top:1px solid var(--line)}',
    '.savebar .note{font-family:var(--mono);font-size:11px;color:var(--cream-mute);margin-right:auto}',

    /* ---------- TOMBOL BAHAYA + MODAL HAPUS ---------- */
    '.btn.danger{border-color:rgba(226,59,50,.45);color:var(--red)}',
    '.btn.danger:hover:not(:disabled){background:rgba(226,59,50,.12);border-color:var(--red);color:var(--red)}',
    '.btn.danger.solid{background:linear-gradient(180deg,var(--red),#8f221c);border-color:transparent;color:#fff;font-weight:700}',
    '.btn.danger.solid:hover:not(:disabled){filter:brightness(1.1);box-shadow:0 0 18px rgba(226,59,50,.4)}',
    '.mask{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;padding:22px;',
    '  background:rgba(6,4,3,.72);backdrop-filter:blur(3px)}',
    '.mask.on{display:flex}',
    '.modal{width:min(560px,100%);max-height:88vh;overflow:auto;border:1px solid var(--line-strong);border-radius:16px;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 26px 70px rgba(0,0,0,.7)}',
    '.m-head{display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid var(--line)}',
    '.m-head h3{margin:0;font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--red)}',
    '.m-head .spacer{flex:1}',
    '.m-head .x{background:none;border:none;color:var(--cream-mute);font-size:17px;cursor:pointer;line-height:1}',
    '.m-head .x:hover{color:var(--cream)}',
    '.m-body{padding:18px 20px;display:flex;flex-direction:column;gap:14px}',
    '.m-foot{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid var(--line)}',
    '.m-foot .note{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);margin-right:auto;line-height:1.5}',
    '.findbar{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}',
    '.hits{display:flex;flex-direction:column;gap:6px;max-height:190px;overflow:auto}',
    '.hit{display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;font-family:var(--sans);font-size:13px;',
    '  color:var(--cream);background:rgba(244,234,219,.04);border:1px solid var(--line);border-radius:9px;padding:9px 12px}',
    '.hit:hover{border-color:var(--line-strong)}',
    '.hit .i{font-family:var(--mono);font-size:11px;color:var(--amber)}',
    '.hit .j{margin-left:auto;font-size:11.5px;color:var(--cream-mute)}',
    '.target{display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;',
    '  background:rgba(244,234,219,.03)}',
    '.target .ava{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-family:var(--mono);',
    '  font-size:12px;font-weight:700;color:#1a0e06;background:linear-gradient(180deg,var(--amber),var(--orange))}',
    '.target .nm{font-weight:600}',
    '.target .meta{font-family:var(--mono);font-size:11px;color:var(--cream-mute)}',
    '.target .meta b{color:var(--amber)}',
    '.warnbox{border:1px solid rgba(226,59,50,.45);background:rgba(226,59,50,.08);border-radius:11px;padding:12px 14px;',
    '  font-family:var(--mono);font-size:11.5px;line-height:1.7;color:var(--cream-dim)}',
    '.warnbox b{color:var(--red)}',
    '.warnbox .big{display:block;font-size:20px;color:var(--red);font-weight:700;margin-bottom:4px}',
    '.prevlist{max-height:150px;overflow:auto;font-family:var(--mono);font-size:11px;color:var(--cream-mute);',
    '  border:1px solid var(--line);border-radius:9px;padding:9px 12px;line-height:1.8}',
    '.prevlist b{color:var(--cream-dim)}',
    '.merr{font-family:var(--mono);font-size:11.5px;color:var(--red);display:none}',
    '.merr.on{display:block}',
    '.hint{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);line-height:1.6}',

    /* ---------- TOAST ---------- */
    '.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:80;opacity:0;pointer-events:none;',
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

  var HTML = [
    '<canvas id="stars"></canvas>',
    '<div class="wrap">',

    /* ---- header ---- */
    '<header class="hud">',
    ICON_MARK,
    '<div class="brand"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
    '<div class="sub">Edit Roster · Data Master</div></div>',
    '<div class="hud-spacer"></div>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">siap</span></div>',
    '</header>',

    /* ---- panel filter ---- */
    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Filter Pencarian</h2>',
    '<span class="spacer"></span><span class="idx">nama / id · tanggal</span></div>',
    '<div class="p-body">',
    '<div class="filterbar">',
    '<div class="fld"><label for="fQuery">Nama / ID Karyawan</label>',
    '<input class="inp" id="fQuery" type="text" placeholder="mis. Budi atau HO-1024" autocomplete="off"></div>',
    '<div class="fld"><label for="fFrom">Tanggal Dari</label>',
    '<input class="inp" id="fFrom" type="date"></div>',
    '<div class="fld"><label for="fTo">Tanggal Sampai</label>',
    '<input class="inp" id="fTo" type="date"></div>',
    '<div class="fld"><button class="btn primary" id="btnSearch">Cari</button></div>',
    '</div>',
    '</div></section>',

    /* ---- panel hasil ---- */
    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>Data Roster</h2>',
    '<span class="spacer"></span>',
    '<span class="res-head"><span class="count" id="resCount"></span>',
    '<span class="dirty-pill" id="dirtyPill">0 perubahan</span></span></div>',
    '<div id="resBody">',
    '<div class="state"><div class="big">▤</div>Masukkan filter lalu tekan <b>Cari</b> untuk menampilkan roster.</div>',
    '</div>',
    '<div class="savebar">',
    '<span class="note" id="saveNote">Ubah kolom Jadwal, lalu tekan Simpan untuk mengirim perubahan.</span>',
    '<button class="btn danger" id="btnHapus">Hapus Roster</button>',
    '<button class="btn" id="btnReset" disabled>Batalkan Perubahan</button>',
    '<button class="btn ok" id="btnSave" disabled>Simpan Perubahan</button>',
    '</div>',
    '</section>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.n8nBase + '" target="_blank" rel="noopener">n8n editor</a> · ',
    '<a href="' + CFG.homePage + '">Mission Control</a> · Edit Roster (tampilan)</div>',
    '</div>', /* /wrap */

    /* ---- modal hapus roster ---- */
    '<div class="mask" id="mask">',
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle">Hapus Roster</h3><span class="spacer"></span>',
    '<button class="x" id="mClose" title="Tutup">✕</button></div>',
    '<div class="m-body">',

    /* langkah 1 — pilih karyawan & tanggal */
    '<div id="step1">',
    '<div class="findbar">',
    '<div class="fld"><label for="hFind">Cari Karyawan (nama / ID HO)</label>',
    '<input class="inp" id="hFind" type="text" placeholder="ketik nama atau ID HO lalu Enter" autocomplete="off"></div>',
    '<div class="fld"><button class="btn" id="hCari">Cari</button></div>',
    '</div>',
    '<div class="hits" id="hHits"></div>',
    '<div class="target" id="hTarget" style="display:none">',
    '<div class="ava" id="hAva">?</div>',
    '<div><div class="nm" id="hNama">—</div>',
    '<div class="meta"><b id="hId">—</b> · <span id="hJab">—</span></div></div>',
    '</div>',
    '<div class="fld" style="margin-top:14px"><label for="hTgl">Hapus Mulai Tanggal</label>',
    '<input class="inp" id="hTgl" type="date"></div>',
    '<div class="hint" style="margin-top:10px">Semua roster karyawan ini <b>pada tanggal tersebut dan sesudahnya</b> akan dihapus. Roster sebelum tanggal itu tidak disentuh.</div>',
    '</div>',

    /* langkah 2 — konfirmasi */
    '<div id="step2" style="display:none">',
    '<div class="warnbox" id="hRingkas"></div>',
    '<div class="prevlist" id="hPreview" style="margin-top:12px"></div>',
    '</div>',

    '<div class="merr" id="hErr"></div>',
    '</div>',
    '<div class="m-foot"><span class="note" id="hNote">Pilih karyawan dan tanggal dulu.</span>',
    '<button class="btn" id="hBatal">Batal</button>',
    '<button class="btn danger solid" id="hLanjut" disabled>Hapus Roster</button></div>',
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

  /* ==========================================================
     6. UTIL TANGGAL
     ========================================================== */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ==========================================================
     7. RENDER TABEL + DIRTY TRACKING
     ========================================================== */
  var current = [];   // baris yang sedang ditampilkan (dengan .jadwal terkini)
  var orig = {};      // rowKey → jadwal awal

  function rowKey(r) { return r.id + '|' + r.tgl; }

  function shiftOptions(sel) {
    var daftar = CFG.shifts.slice();
    // kode di data yang (belum) ada di katalog tetap tampil apa adanya —
    // tanpa ini <select> diam-diam menunjukkan opsi pertama (DS)
    if (sel && daftar.indexOf(sel) < 0) daftar.push(sel);
    return daftar.map(function (s) {
      var lbl = CFG.shiftLabel[s];
      return '<option value="' + esc(s) + '"' + (s === sel ? ' selected' : '') +
        (lbl ? ' title="' + esc(lbl) + '"' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  function renderTable(rows) {
    current = rows;
    orig = {};
    rows.forEach(function (r) { orig[rowKey(r)] = r.jadwal; });

    if (!rows.length) {
      $('resBody').innerHTML =
        '<div class="state"><div class="big">∅</div>Tidak ada data roster untuk filter tersebut.</div>';
      $('resCount').innerHTML = '';
      updateDirty();
      return;
    }

    var body = rows.map(function (r, i) {
      return '<tr data-key="' + esc(rowKey(r)) + '">' +
        '<td class="c-id">' + esc(r.id) + '</td>' +
        '<td class="c-name">' + esc(r.nama) + '</td>' +
        '<td class="c-role">' + esc(r.jabatan) + '</td>' +
        '<td class="c-date">' + esc(r.tgl) + '</td>' +
        '<td><select class="sel s-' + esc(r.jadwal) + '" data-idx="' + i + '">' +
        shiftOptions(r.jadwal) + '</select></td>' +
        '</tr>';
    }).join('');

    $('resBody').innerHTML =
      '<div class="tbl-wrap"><table class="roster"><thead><tr>' +
      '<th>ID</th><th>Nama</th><th>Jabatan</th><th>Tanggal</th><th>Jadwal</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';

    $('resCount').innerHTML = 'Menampilkan <b>' + rows.length + '</b> baris';

    // pasang listener pada tiap dropdown
    Array.prototype.forEach.call($('resBody').querySelectorAll('.sel'), function (sel) {
      sel.addEventListener('change', function () {
        var idx = +sel.getAttribute('data-idx');
        var row = current[idx];
        row.jadwal = sel.value;
        sel.className = 'sel s-' + sel.value;                 // perbarui warna badge
        var tr = sel.closest('tr');
        if (orig[rowKey(row)] !== row.jadwal) tr.classList.add('changed');
        else tr.classList.remove('changed');
        updateDirty();
      });
    });
    updateDirty();
  }

  /* daftar baris yang berubah dari data awal */
  function changedRows() {
    return current.filter(function (r) { return orig[rowKey(r)] !== r.jadwal; });
  }
  function updateDirty() {
    var n = changedRows().length;
    var pill = $('dirtyPill');
    pill.textContent = n + ' perubahan';
    pill.className = 'dirty-pill' + (n ? ' on' : '');
    $('btnSave').disabled = n === 0;
    $('btnReset').disabled = n === 0;
  }

  /* ==========================================================
     8. AKSI — Cari, Simpan, Batalkan
     ========================================================== */
  function doSearch() {
    var q = $('fQuery').value;
    var from = $('fFrom').value;
    var to = $('fTo').value;

    $('btnSearch').disabled = true;
    setLink('wait', 'memuat…');
    $('resBody').innerHTML = '<div class="state"><div class="spin"></div><br>Menarik data roster dari server…</div>';
    $('resCount').innerHTML = '';
    updateDirty();

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
        $('btnSearch').disabled = false;
        setLink('on', 'terhubung');
        if (!rows.length) toast('warn', 'Tidak ada data roster untuk filter tersebut.');
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        $('btnSearch').disabled = false;
        setLink('off', 'gagal');
        $('resBody').innerHTML =
          '<div class="state"><div class="big">⚠</div>Gagal memuat roster dari server.<br>' +
          '<b>' + esc(msg) + '</b><br>Pastikan service <b>magi_api</b> berjalan (endpoint <b>roster-list</b>).</div>';
        $('resCount').innerHTML = '';
        current = []; orig = {}; updateDirty();
        toast('crit', '<b>Gagal memuat</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.fetchUrl) + '</b>.');
      });
  }

  function doSave() {
    var changes = changedRows().map(function (r) {
      return { id: r.id, tgl: r.tgl, jadwal: r.jadwal };
    });
    if (!changes.length) return;

    $('btnSave').disabled = true;
    $('btnReset').disabled = true;
    setLink('wait', 'menyimpan…');

    fetch(CFG.saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: changes })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, status: r.status, body: body || {} };
        });
      })
      .then(function (res) {
        var b = res.body;
        if (res.ok && b.status === 'ok') {
          setLink('on', 'terhubung');
          var msg = '<b>' + (b.updated != null ? b.updated : changes.length) + ' perubahan tersimpan</b>';
          if (b.skipped) msg += ' · ' + b.skipped + ' dilewati';
          toast('ok', msg + '.');
          // reset penanda: jadikan nilai sekarang sebagai baseline baru
          current.forEach(function (r) { orig[rowKey(r)] = r.jadwal; });
          Array.prototype.forEach.call($('resBody').querySelectorAll('tr.changed'), function (tr) {
            tr.classList.remove('changed');
          });
          updateDirty();
        } else {
          // gagal / ditolak — perubahan tetap dirty, tombol aktif lagi
          setLink('off', 'ditolak');
          var em = (b && b.message) ? b.message : ('HTTP ' + res.status);
          toast('crit', '<b>Gagal menyimpan</b> — ' + esc(String(em)) + '.');
          updateDirty();
        }
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        setLink('off', 'gagal');
        toast('crit', '<b>Gagal menyimpan</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.saveUrl) + '</b>.');
        updateDirty();
      });
  }

  function doReset() {
    current.forEach(function (r) { r.jadwal = orig[rowKey(r)]; });
    Array.prototype.forEach.call($('resBody').querySelectorAll('tr'), function (tr) {
      var sel = tr.querySelector('.sel');
      if (!sel) return;
      var idx = +sel.getAttribute('data-idx');
      var r = current[idx];
      sel.value = r.jadwal;
      sel.className = 'sel s-' + r.jadwal;
      tr.classList.remove('changed');
    });
    updateDirty();
    toast('warn', 'Perubahan dibatalkan — kembali ke data awal.');
  }

  /* ==========================================================
     8. HAPUS ROSTER (modal dua langkah)
     ==========================================================
     Menghapus SELURUH roster satu karyawan mulai satu tanggal ke depan
     (tgl >= yang diisi). Tidak bisa dibatalkan — halaman ini tidak punya
     jalur untuk mengembalikannya, dan pemulihannya berarti mengimpor ulang
     roster. Karena itu alurnya sengaja dua langkah:

       1. pilih karyawan + tanggal
       2. layar konfirmasi yang menampilkan JUMLAH BARIS NYATA dan daftar
          tanggalnya, baru tombol hapus benar-benar mengirim.

     Pratinjaunya memakai ulang `roster-list` (rentang tgl s/d 9999-12-31),
     jadi yang ditunjukkan adalah baris yang sungguh ada, bukan perkiraan. */
  var HAPUS_SAMPAI = '9999-12-31';
  var hTarget = null;      // {id_ho, nama, jabatan}
  var hRows = null;        // hasil pratinjau; null = belum dipratinjau
  var hStep = 1;

  function hErr(msg) {
    var e = $('hErr');
    if (!msg) { e.className = 'merr'; e.innerHTML = ''; return; }
    e.className = 'merr on';
    e.innerHTML = msg;
  }

  function hSetTarget(t) {
    hTarget = t;
    hRows = null;
    if (!t) { $('hTarget').style.display = 'none'; hUpdate(); return; }
    $('hTarget').style.display = 'flex';
    $('hAva').textContent = (t.nama || '?').trim().charAt(0).toUpperCase() || '?';
    $('hNama').textContent = t.nama || '—';
    $('hId').textContent = t.id_ho || '—';
    $('hJab').textContent = t.jabatan || '—';
    hUpdate();
  }

  /* tombol utama hanya hidup kalau kedua isian lengkap */
  function hUpdate() {
    var siap = !!(hTarget && hTarget.id_ho) && /^\d{4}-\d{2}-\d{2}$/.test($('hTgl').value);
    $('hLanjut').disabled = !siap;
    if (hStep === 1) {
      $('hNote').textContent = siap
        ? 'Tekan Hapus Roster untuk melihat data yang akan terhapus.'
        : 'Pilih karyawan dan tanggal dulu.';
    }
  }

  function hBuka() {
    hStep = 1;
    hTarget = null;
    hRows = null;
    $('step1').style.display = '';
    $('step2').style.display = 'none';
    $('hHits').innerHTML = '';
    $('hFind').value = '';
    $('hTarget').style.display = 'none';
    $('hTgl').value = $('fFrom').value || fmtDate(new Date());
    $('hLanjut').textContent = 'Hapus Roster';
    $('hLanjut').disabled = true;
    hErr('');
    hUpdate();
    $('mask').classList.add('on');
    setTimeout(function () { $('hFind').focus(); }, 40);
  }
  function hTutup() { $('mask').classList.remove('on'); hErr(''); }

  /* pencarian karyawan — memakai ulang webhook karyawan-list */
  function hCariKaryawan() {
    var q = $('hFind').value.trim();
    if (!q) { hErr('Ketik nama atau ID HO dulu.'); return; }
    hErr('');
    $('hCari').disabled = true;
    $('hHits').innerHTML = '<div class="state" style="padding:18px"><div class="spin"></div></div>';

    fetch(CFG.karyawanUrl + '?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        $('hCari').disabled = false;
        if (!Array.isArray(rows)) rows = [];
        if (!rows.length) {
          $('hHits').innerHTML = '';
          hErr('Tidak ada karyawan cocok dengan "' + esc(q) + '".');
          return;
        }
        if (rows.length === 1) {
          $('hHits').innerHTML = '';
          hSetTarget({ id_ho: rows[0].id_ho, nama: rows[0].nama, jabatan: rows[0].jabatan });
          return;
        }
        $('hHits').innerHTML = rows.slice(0, 50).map(function (r, i) {
          return '<button class="hit" data-i="' + i + '"><span>' + esc(r.nama) + '</span>' +
            '<span class="i">' + esc(r.id_ho) + '</span>' +
            '<span class="j">' + (esc(r.jabatan) || '—') + '</span></button>';
        }).join('');
        Array.prototype.forEach.call($('hHits').querySelectorAll('.hit'), function (b) {
          b.addEventListener('click', function () {
            var r = rows[+b.getAttribute('data-i')];
            $('hHits').innerHTML = '';
            hSetTarget({ id_ho: r.id_ho, nama: r.nama, jabatan: r.jabatan });
          });
        });
      })
      .catch(function (e) {
        $('hCari').disabled = false;
        $('hHits').innerHTML = '';
        hErr('Gagal mencari karyawan — ' + esc(String((e && e.message) || e)) + '.');
      });
  }

  /* langkah 1 → 2: ambil baris yang akan terhapus, tampilkan konfirmasi */
  function hPratinjau() {
    var tgl = $('hTgl').value;
    if (!hTarget || !hTarget.id_ho) { hErr('Pilih karyawan dulu.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) { hErr('Tanggal belum diisi.'); return; }
    hErr('');
    $('hLanjut').disabled = true;
    $('hNote').textContent = 'Menghitung data yang akan dihapus…';

    var url = CFG.fetchUrl + '?q=' + encodeURIComponent(hTarget.id_ho) +
      '&from=' + encodeURIComponent(tgl) + '&to=' + HAPUS_SAMPAI;

    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) rows = [];
        /* roster-list mencocokkan q ke nama ATAU id_ho, jadi hasilnya disaring
           lagi di sini — yang dihapus nanti hanya id_ho ini, dan pratinjau
           harus memperlihatkan persis itu */
        rows = rows.filter(function (r) { return String(r.id) === String(hTarget.id_ho); });
        hRows = rows;
        hStep = 2;
        $('step1').style.display = 'none';
        $('step2').style.display = '';

        if (!rows.length) {
          $('hRingkas').innerHTML = '<span class="big">0 baris</span>' +
            'Tidak ada roster <b>' + esc(hTarget.nama) + '</b> pada <b>' + esc(tgl) + '</b> atau sesudahnya. ' +
            'Tidak ada yang akan dihapus.';
          $('hPreview').innerHTML = '';
          $('hLanjut').disabled = true;
          $('hNote').textContent = 'Tidak ada yang perlu dihapus.';
          return;
        }
        var tglAwal = rows[0].tgl, tglAkhir = rows[rows.length - 1].tgl;
        rows.forEach(function (r) {
          if (r.tgl < tglAwal) tglAwal = r.tgl;
          if (r.tgl > tglAkhir) tglAkhir = r.tgl;
        });
        $('hRingkas').innerHTML = '<span class="big">' + rows.length + ' baris roster akan DIHAPUS</span>' +
          '<b>' + esc(hTarget.nama) + '</b> (' + esc(hTarget.id_ho) + ') · ' +
          esc(tglAwal) + ' s/d ' + esc(tglAkhir) + '<br>' +
          'Tindakan ini <b>tidak bisa dibatalkan</b> dari halaman ini.';
        $('hPreview').innerHTML = rows.slice(0, 200).map(function (r) {
          return esc(r.tgl) + ' <b>' + esc(r.jadwal || '—') + '</b>';
        }).join(' · ') + (rows.length > 200 ? ' … dan ' + (rows.length - 200) + ' lainnya' : '');
        $('hLanjut').disabled = false;
        $('hLanjut').textContent = 'Ya, Hapus ' + rows.length + ' Baris';
        $('hNote').textContent = 'Periksa sekali lagi sebelum menekan tombol merah.';
      })
      .catch(function (e) {
        $('hLanjut').disabled = false;
        hErr('Gagal mengambil data yang akan dihapus — ' + esc(String((e && e.message) || e)) + '.');
        $('hNote').textContent = 'Coba lagi.';
      });
  }

  /* langkah 2: benar-benar menghapus */
  function hHapus() {
    if (!hTarget || !hRows || !hRows.length) return;
    var tgl = $('hTgl').value;
    hErr('');
    $('hLanjut').disabled = true;
    $('hBatal').disabled = true;
    setLink('wait', 'menghapus…');
    $('hNote').textContent = 'Menghapus…';

    fetch(CFG.deleteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_ho: hTarget.id_ho, tgl: tgl })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, status: r.status, body: body || {} };
        });
      })
      .then(function (res) {
        $('hBatal').disabled = false;
        var b = res.body;
        if (res.ok && b.status === 'ok') {
          setLink('on', 'terhubung');
          hTutup();
          /* jumlah yang dilaporkan dari SERVER, bukan dari pratinjau: di antara
             pratinjau dan penghapusan, data bisa saja sudah berubah */
          toast('ok', '<b>' + esc(String(b.deleted)) + ' baris roster dihapus</b> — ' +
            esc(hTarget.nama) + ' · ' + esc(tgl) + ' ke depan.');
          doSearch();                     /* tabel dimuat ulang dari server */
        } else {
          setLink('off', 'ditolak');
          $('hLanjut').disabled = false;
          var em = (b && b.message) ? b.message : ('HTTP ' + res.status);
          hErr(esc(String(em)));
          $('hNote').textContent = 'Tidak ada yang dihapus.';
          toast('crit', '<b>Gagal menghapus</b> — ' + esc(String(em)) + '.');
        }
      })
      .catch(function (e) {
        $('hLanjut').disabled = false;
        $('hBatal').disabled = false;
        setLink('off', 'gagal');
        var msg = String((e && e.message) || e);
        hErr('Gagal menghubungi server — ' + esc(msg) + '.');
        toast('crit', '<b>Gagal menghapus</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.deleteUrl) + '</b>.');
      });
  }

  $('btnSearch').addEventListener('click', doSearch);
  $('btnSave').addEventListener('click', doSave);
  $('btnReset').addEventListener('click', doReset);

  $('btnHapus').addEventListener('click', hBuka);
  $('mClose').addEventListener('click', hTutup);
  $('hBatal').addEventListener('click', hTutup);
  $('hCari').addEventListener('click', hCariKaryawan);
  $('hTgl').addEventListener('input', function () { hRows = null; hUpdate(); });
  /* satu tombol, dua arti — langkah 1 memeriksa, langkah 2 menghapus */
  $('hLanjut').addEventListener('click', function () {
    if (hStep === 1) hPratinjau(); else hHapus();
  });
  $('hFind').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); hCariKaryawan(); }
  });
  $('mask').addEventListener('click', function (e) {
    if (e.target === $('mask')) hTutup();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('mask').classList.contains('on')) hTutup();
  });

  /* Enter di field filter = Cari */
  ['fQuery', 'fFrom', 'fTo'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });
  });

  /* peringatkan bila menutup halaman dengan perubahan belum tersimpan */
  window.addEventListener('beforeunload', function (e) {
    if (changedRows().length) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ==========================================================
     BOOT — set tanggal default (hari ini s/d +2 hari)
     ========================================================== */
  (function boot() {
    fetch(CFG.kodeUrl, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (js) {
        if (!js || !Array.isArray(js.kode) || !js.kode.length) return;
        CFG.shifts = js.kode.map(function (k) { return k.kode; });
        js.kode.forEach(function (k) { CFG.shiftLabel[k.kode] = k.label; });
        if (current.length && !changedRows().length) renderTable(current);   // jangan buang perubahan yang belum disimpan
      })
      .catch(function () { /* tetap pakai daftar cadangan */ });
    var today = new Date();
    var plus2 = new Date(today.getTime() + 2 * 86400000);
    $('fFrom').value = fmtDate(today);
    $('fTo').value = fmtDate(plus2);
    setLink('on', 'siap');
  })();
})();

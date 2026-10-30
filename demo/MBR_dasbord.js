/* ============================================================
   MAGI//SYSTEM — MBR (Mealbox Report)
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; MBR_dasbord.html
   hanya shell kosong berisi <div id="app">. Pola sama dengan
   index.js/todo.js.

   2026-10-10 — tampilan disederhanakan ke tema "warm space" dashboard
   utama (cream / orange / merah) supaya lebih ringan. Yang dibuang:
   tema cyberpunk (scanline, grid, vignette, animasi sapuan tak
   henti), boot sequence, pemilih aksen, sparkline (datanya acak),
   mode demo (angka acak saat file-bridge offline), tombol Simulasi
   Notifikasi, dan diagram 9 tahap pipeline — semua tahapnya diturunkan
   dari satu `status`, jadi cukup satu baris status. Bintang latar
   digambar sekali (bukan animasi), dan polling berhenti saat tab
   tidak terlihat.

   Yang TIDAK berubah: alur approve (resume URL + ?approved=1),
   jalankan ulang (/webhook/mbr-run), tiga kejadian yang diteruskan ke
   Konsol Misi (kunci `mbr:<status>:<generatedAt>`), dan pemeriksaan
   selisih MBR vs roster-summary.

   Isi:
     1. KONFIG
     2. STYLE
     3. MARKUP
     4. RENDER       — ringkasan, periode & shift, lokasi
     5. STATUS       — satu baris status + tombol persetujuan
     6. NOTIFIKASI   — log halaman + store bersama (magi.notif.v1)
     7. PERSETUJUAN  — approve / hold / modal
     8. LIVE         — polling mbr_status.json + jalankan ulang
     9. SELISIH      — total karyawan MBR vs roster-summary
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    homePage: './index.html',
    rosterPage: './roster.html',
    mbrPage: './MBR_dasbord.html',
    // file-bridge: ditulis node "Tulis Status Web" / "Status Terkirim" / "Status Kadaluarsa"
    // mbr_status.json ditulis n8n ke Dasbord/, dibaca LEWAT magi-api (butuh login;
    // resumeUrl hanya untuk akun berhak 'mbr') — Caddy menolak berkasnya langsung
    statusUrl: MAGI.url('/webhook/mbr-status'),
    // MASA PERALIHAN: selama magi_api belum dibuat ulang (scripts/pindah-ke-compose.sh)
    // endpoint di atas belum ada -> 404 -> baca berkas lama. Hapus sesudah peralihan.
    statusUrlLama: './mbr_status.json',
    // webhook produksi untuk menjalankan ulang seluruh workflow MBR
    runUrl: MAGI.url('/webhook/mbr-run'),
    // total roster pada tanggal yang sama, untuk pemeriksaan selisih
    rosterUrl: MAGI.url('/webhook/roster-summary'),
    pollMs: 4000,
    feedMax: 60,
    store: 'magi.notif.v1',
    storeMax: 60,
    // cadangan bila snapshot lama belum membawa `email`
    emailTo: 'penerima@example.com',
    emailCc: 'cc@example.com',
    // selisih orang yang masih dianggap aman — baca bagian 9 sebelum mengubah
    TOLERANSI: 0,
    jedaCekMs: 60000,   // jangan tanya roster-summary tiap poll 4 detik
    ceklagiMs: 15000    // jeda coba lagi setelah gagal ambil roster
  };

  /* ==========================================================
     2. STYLE
     ========================================================== */
  var CSS = [
    ':root{',
    '  --void:#0a0806; --panel:#181310; --panel2:#1f1814;',
    '  --line:rgba(244,234,219,.10); --line-strong:rgba(255,106,31,.38);',
    '  --cream:#F4EADB; --cream-dim:#bfae9a; --cream-mute:#7f7264;',
    '  --orange:#FF6A1F; --amber:#FFB03A; --red:#E23B32; --rust:#8f3d18;',
    '  --ok:#7FD6A6; --warn:#FFB03A; --crit:#E23B32;',
    /* satu hue untuk semua batang — sama dengan grafik kehadiran di index.js
       (#e15c1a sudah lolos validator palet untuk latar panel gelap) */
    '  --bar:#e15c1a;',
    '  --sans:ui-sans-serif,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;',
    '  --mono:"DejaVu Sans Mono","Cascadia Code","JetBrains Mono",ui-monospace,"Courier New",monospace;',
    '  --glow:0 0 18px rgba(255,106,31,.35);',
    '}',
    /* scrollbar bawaan ikut gelap (tanpa ini tabel lokasi berbingkai putih) */
    ':root{color-scheme:dark}',
    '*{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    'html,body{margin:0;padding:0;height:100%}',
    'body{background:var(--void);color:var(--cream);font-family:var(--sans);font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}',
    '#stars{position:fixed;inset:0;z-index:0;pointer-events:none}',
    'body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:',
    '  radial-gradient(900px 520px at 78% -12%, rgba(255,106,31,.20), transparent 62%),',
    '  radial-gradient(760px 420px at -8% 108%, rgba(226,59,50,.16), transparent 58%),',
    '  radial-gradient(1200px 700px at 50% 130%, rgba(255,176,58,.07), transparent 60%)}',

    '.wrap{position:relative;z-index:1;max-width:1400px;margin:0 auto;padding:22px 24px 64px}',
    '@media(max-width:560px){.wrap{padding:16px 16px 64px}}',

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
    '.hud-cell{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2}',
    '.hud-cell .k{font-family:var(--mono);font-size:9px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream-mute)}',
    '.hud-cell .v{font-family:var(--mono);font-size:14px;color:var(--amber);letter-spacing:.04em}',
    '.hud-div{width:1px;height:38px;background:linear-gradient(transparent,var(--line-strong),transparent)}',
    '@media(max-width:560px){.hud-div{display:none}.hud-cell{align-items:flex-start}}',
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

    /* ---------- LAYOUT ----------
       Persetujuan di kanan-atas (desktop) dan PALING ATAS di layar sempit:
       batasnya 30 menit, jadi jangan sampai tertimbun di bawah tabel. */
    '.deck{display:grid;grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto 1fr;',
    '  grid-template-areas:"main appr" "main log";gap:22px;align-items:start}',
    '@media(max-width:1040px){.deck{grid-template-columns:minmax(0,1fr);grid-template-rows:none;grid-template-areas:"appr" "main" "log"}}',
    '.main{grid-area:main;display:flex;flex-direction:column;gap:22px;min-width:0}',
    '#pAppr{grid-area:appr}',
    '#pLog{grid-area:log}',

    '.panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--panel),var(--panel2));',
    '  box-shadow:0 10px 34px rgba(0,0,0,.4);overflow:hidden;min-width:0}',
    '.p-head{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.p-head h2{margin:0;font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream)}',
    '.p-head .idx{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--orange)}',
    '.p-head .spacer{flex:1}',
    '.p-head .note-r{font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--cream-mute)}',
    '.p-body{padding:18px}',

    /* ---------- TILE ---------- */
    '.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}',
    '@media(max-width:760px){.tiles{grid-template-columns:repeat(2,1fr)}}',
    '.tile{border:1px solid var(--line);border-radius:12px;padding:14px 15px;background:rgba(244,234,219,.03);min-width:0}',
    '.tile .lab{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.tile .num{font-family:var(--mono);font-size:28px;font-weight:700;line-height:1.1;margin-top:5px;color:var(--cream)}',
    '.tile .num.o{color:var(--orange)}.tile .num.a{color:var(--amber)}',
    '.tile .meta{font-size:11px;color:var(--cream-dim);margin-top:4px}',
    '.subhead{margin:0 0 10px;font-family:var(--mono);font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream-mute)}',
    '.subhead.gap{margin-top:20px}',
    '.tile.mini .lab{font-size:10.5px;letter-spacing:.14em;color:var(--cream-dim)}',
    '.tile.mini .num{font-size:24px}',
    '.meter{height:4px;border-radius:2px;background:rgba(244,234,219,.06);margin-top:10px;overflow:hidden}',
    '.meter i{display:block;height:100%;border-radius:2px;background:var(--bar)}',
    /* warna kode shift mengikuti panel Roster Aktual di dashboard utama */
    '.tile.s-DS{border-color:rgba(127,214,166,.35)}.tile.s-DS .num{color:var(--ok)}',
    '.tile.s-NS{border-color:rgba(255,176,58,.35)}.tile.s-NS .num{color:var(--amber)}',
    '.tile.s-CS{border-color:rgba(255,106,31,.35)}.tile.s-CS .num{color:var(--orange)}',

    /* ---------- TABEL LOKASI ---------- */
    '.tbl{overflow:auto;max-height:640px;border:1px solid var(--line);border-radius:10px;scrollbar-width:thin;scrollbar-color:rgba(255,106,31,.28) transparent}',
    '.loc{width:100%;border-collapse:collapse;min-width:560px;font-size:13px}',
    '.loc th,.loc td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums}',
    '.loc thead th{position:sticky;top:0;z-index:1;background:var(--panel);color:var(--cream-mute);font-size:9.5px;letter-spacing:.14em;',
    '  text-transform:uppercase;border-bottom:1px solid var(--line-strong)}',
    '.loc .n{text-align:left;white-space:nowrap;font-family:var(--sans)}',
    '.loc td.n{color:var(--cream-dim)}',
    '.loc td.z{color:var(--cream-mute);opacity:.35}',
    '.loc td.tot{color:var(--amber);font-weight:700}',
    '.loc .bar{width:26%;min-width:110px;padding-left:2px}',
    '.loc .bar span{display:block;height:8px;border-radius:0 4px 4px 0;background:var(--bar);min-width:2px}',
    '.loc tbody tr:hover{background:rgba(244,234,219,.03)}',
    '.loc tfoot td{position:sticky;bottom:0;background:var(--panel2);border-top:1px solid var(--line-strong);border-bottom:none;color:var(--cream);font-weight:700}',
    /* layar HP: batang disembunyikan (angkanya tetap ada) supaya tabel muat tanpa geser ke samping */
    '@media(max-width:560px){.loc{min-width:0;font-size:12px}.loc th,.loc td{padding:7px 6px}.loc .n{white-space:normal}.loc .bar{display:none}}',
    '.kosong{padding:26px 14px;text-align:center;font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--cream-mute)}',

    /* ---------- STATUS + PERSETUJUAN ---------- */
    '.stat{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:11px;border:1px solid var(--line);',
    '  border-left:3px solid var(--cream-mute);background:rgba(244,234,219,.03)}',
    '.stat .dot{margin-top:6px}',
    '.stat .t{font-weight:700;font-size:15px;color:var(--cream)}',
    '.stat .s{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);margin-top:3px;line-height:1.55}',
    '.stat.ok{border-left-color:var(--ok)}',
    '.stat.warn{border-left-color:var(--warn);background:rgba(255,176,58,.07)}',
    '.stat.crit{border-left-color:var(--crit);background:rgba(226,59,50,.09)}',
    '.kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 14px;margin:16px 0 0;font-size:13px}',
    '.kv dt{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--cream-mute);padding-top:3px}',
    '.kv dd{margin:0;color:var(--cream);word-break:break-word}',
    '.kv dd.m{font-family:var(--mono);font-size:11px;color:var(--cream-dim);word-break:normal;overflow-wrap:anywhere}',
    '.dispatch{display:flex;gap:10px;margin-top:16px}',
    '.dispatch .btn{flex:1}',
    '.dispatch .btn.danger{flex:0 0 auto}',

    '.btn{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:9px;padding:10px 18px;background:transparent;color:var(--cream-dim);transition:.15s}',
    '.btn:hover:not(:disabled){color:var(--cream);border-color:var(--line-strong)}',
    '.btn.primary{background:linear-gradient(180deg,var(--orange),var(--rust));border-color:transparent;color:#1a0e06;font-weight:700}',
    '.btn.primary:hover:not(:disabled){filter:brightness(1.1);box-shadow:var(--glow)}',
    '.btn.danger{border-color:rgba(226,59,50,.5);color:var(--crit)}',
    '.btn.danger:hover:not(:disabled){color:#ffd9d6;border-color:var(--crit);background:rgba(226,59,50,.10)}',
    '.btn:disabled{opacity:.42;cursor:not-allowed}',

    /* ---------- LOG HALAMAN ---------- */
    '.badge{font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:3px 9px;border-radius:999px;',
    '  background:rgba(244,234,219,.10);color:var(--cream-mute)}',
    '.chip{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:999px;padding:5px 11px;background:transparent;color:var(--cream-mute);transition:.15s}',
    '.chip:hover{color:var(--cream);border-color:var(--line-strong)}',
    '.feed{overflow-y:auto;padding:8px 8px 12px;max-height:420px;scrollbar-width:thin;scrollbar-color:rgba(255,106,31,.28) transparent}',
    '.feed::-webkit-scrollbar{width:8px}.feed::-webkit-scrollbar-thumb{background:rgba(255,106,31,.28);border-radius:8px}',
    '.note{display:flex;gap:11px;padding:10px;border-radius:10px;border-left:2px solid var(--cream-mute);',
    '  margin-bottom:6px;background:rgba(244,234,219,.03)}',
    '.note.info{border-left-color:var(--amber)}',
    '.note.ok{border-left-color:var(--ok)}',
    '.note.warn{border-left-color:var(--warn);background:rgba(255,176,58,.07)}',
    '.note.crit{border-left-color:var(--crit);background:rgba(226,59,50,.09)}',
    '.note .ic{font-size:14px;line-height:1.3;flex:0 0 auto;width:20px;text-align:center}',
    '.note .bd{min-width:0;flex:1}',
    '.note .ti{font-size:12.5px;color:var(--cream);font-weight:600;word-break:break-word}',
    '.note .de{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);margin-top:2px;word-break:break-word}',
    '.note .tm{font-family:var(--mono);font-size:9.5px;color:var(--cream-mute);opacity:.75;margin-top:4px;letter-spacing:.08em}',

    /* ---------- MODAL ---------- */
    '.mask{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(6,4,3,.78)}',
    '.mask.on{display:flex}',
    '#selMask{z-index:60}',
    '.modal{width:min(480px,100%);max-height:92vh;display:flex;flex-direction:column;border:1px solid var(--line-strong);border-radius:16px;overflow:hidden;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 30px 80px rgba(0,0,0,.7)}',
    '.m-head{padding:14px 18px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.m-head h3{margin:0;font-family:var(--mono);font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream)}',
    '.m-body{padding:18px;font-size:13px;line-height:1.65;color:var(--cream-dim);overflow:auto}',
    '.m-body b{color:var(--cream)}',
    '.warnrow{margin-top:14px;padding:10px 12px;border-radius:9px;border:1px solid rgba(255,176,58,.4);background:rgba(255,176,58,.07);color:var(--cream);font-size:12px}',
    '.acts{display:flex;gap:10px;justify-content:flex-end;padding:14px 18px;border-top:1px solid var(--line);flex-wrap:wrap}',
    /* papan selisih: modal yang sama, aksen merah */
    '.modal.alarm{width:min(600px,100%);border-color:rgba(226,59,50,.6)}',
    '.modal.alarm .m-head{background:linear-gradient(90deg,rgba(226,59,50,.22),transparent)}',
    '.modal.alarm .m-head h3{color:var(--crit)}',
    '.nums{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
    '.nums div{flex:1;min-width:110px;border:1px solid var(--line);border-radius:10px;padding:9px 12px;text-align:center;background:rgba(244,234,219,.03)}',
    '.nums .k{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.nums .v{display:block;font-family:var(--mono);font-size:26px;font-weight:700;color:var(--cream)}',
    '.nums .sel{border-color:rgba(226,59,50,.5);background:rgba(226,59,50,.09)}',
    '.nums .sel .v{color:var(--crit)}',
    '.seltgl{font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--cream-mute);margin-bottom:10px}',

    '.foot{margin-top:26px;text-align:center;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;color:var(--cream-mute)}',
    '.foot b{color:var(--cream-dim);font-weight:600}',
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

    '<header class="hud">',
    ICON_MARK,
    '<div class="brand"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
    '<div class="sub">MBR · Mealbox Report</div></div>',
    '<div class="hud-spacer"></div>',
    '<div class="hud-cell"><div class="k">Target Laporan</div><div class="v" id="target">—</div></div>',
    '<div class="hud-div"></div>',
    '<div class="hud-cell"><div class="k">Waktu Lokal</div><div class="v" id="clock">--:--:--</div></div>',
    '<button class="rfr" id="btnRun" type="button">▶ Jalankan Ulang MBR</button>',
    '<a class="back" href="' + CFG.homePage + '">← Konsol Misi</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">Menghubungkan…</span></div>',
    '</header>',

    '<div class="deck">',
    '<div class="main">',

    /* ---- 01 ringkasan ---- */
    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Ringkasan Laporan</h2></div>',
    '<div class="p-body"><div class="tiles">',
    '<div class="tile"><div class="lab">Total Karyawan</div><div class="num" id="kEmp">—</div><div class="meta">baris laporan</div></div>',
    '<div class="tile"><div class="lab">Total Mealbox</div><div class="num o" id="kMeal">—</div><div class="meta">B + L + D + M</div></div>',
    '<div class="tile"><div class="lab">Lokasi Aktif</div><div class="num" id="kLoc">—</div><div class="meta">titik distribusi</div></div>',
    '<div class="tile"><div class="lab">Special Cash</div><div class="num a" id="kSc">—</div><div class="meta">override lokasi</div></div>',
    '</div></div></section>',

    /* ---- 02 periode makan & shift ---- */
    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>Periode Makan &amp; Shift</h2></div>',
    '<div class="p-body">',
    '<div class="subhead">Periode makan · porsi dari total mealbox</div>',
    '<div class="tiles" id="periods"></div>',
    '<div class="subhead gap">Shift kerja · porsi dari total karyawan</div>',
    '<div class="tiles" id="shifts"></div>',
    '</div></section>',

    /* ---- 03 lokasi ---- */
    '<section class="panel"><div class="p-head"><span class="idx">03</span><h2>Distribusi per Lokasi</h2>',
    '<span class="spacer"></span><span class="note-r" id="locTotal"></span></div>',
    '<div class="p-body" id="locBox"></div></section>',

    '</div>',

    /* ---- 04 persetujuan ---- */
    '<section class="panel" id="pAppr"><div class="p-head"><span class="idx">04</span><h2>Persetujuan Kirim</h2></div>',
    '<div class="p-body">',
    '<div class="stat" id="stat"><span class="dot" id="statDot"></span>',
    '<div><div class="t" id="statT">Menghubungkan…</div><div class="s" id="statS">membaca mbr_status.json</div></div></div>',
    '<dl class="kv">',
    '<dt>Target</dt><dd id="cTarget">—</dd>',
    '<dt>Mealbox</dt><dd id="cMeal">—</dd>',
    '<dt>Karyawan</dt><dd id="cEmp">—</dd>',
    '<dt>Berkas</dt><dd class="m" id="cFile">—</dd>',
    '<dt>Dibuat</dt><dd class="m" id="cGen">—</dd>',
    '<dt>Kepada</dt><dd class="m" id="cTo">—</dd>',
    '<dt>CC</dt><dd class="m" id="cCc">—</dd>',
    '</dl>',
    '<div class="dispatch">',
    '<button class="btn primary" id="btnApprove" type="button" disabled>Approve &amp; Kirim</button>',
    '<button class="btn danger" id="btnHold" type="button" disabled>Hold</button>',
    '</div>',
    '</div></section>',

    /* ---- 05 log ---- */
    '<section class="panel" id="pLog"><div class="p-head"><span class="idx">05</span><h2>Log Halaman</h2>',
    '<span class="spacer"></span><span class="badge" id="logCount">0</span>',
    '<button class="chip" id="btnReload" type="button" title="Kosongkan log lalu baca ulang mbr_status.json">↻ Muat ulang</button></div>',
    '<div class="kosong" id="feedEmpty">Belum ada kejadian</div>',
    '<div class="feed" id="feed"></div>',
    '</section>',

    '</div>',

    '<div class="foot">MBR · file-bridge <b>mbr_status.json</b> ↔ n8n · persetujuan lewat resume webhook</div>',
    '</div>',

    /* ---- modal konfirmasi (approve / hold) ---- */
    '<div class="mask" id="mask"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle">Konfirmasi</h3></div>',
    '<div class="m-body" id="mBody"></div>',
    '<div class="acts" id="mFoot"></div>',
    '</div></div>',

    /* ---- papan selisih MBR vs roster ---- */
    '<div class="mask" id="selMask"><div class="modal alarm" role="alertdialog" aria-modal="true" aria-labelledby="selJudul">',
    '<div class="m-head"><h3 id="selJudul">⚠ Selisih data · MBR vs Roster</h3></div>',
    '<div class="m-body">',
    '<div class="nums">',
    '<div><span class="k">MBR</span><span class="v" id="selMbr">—</span></div>',
    '<div><span class="k">Roster</span><span class="v" id="selRos">—</span></div>',
    '<div class="sel"><span class="k">Selisih</span><span class="v" id="selSel">—</span></div>',
    '</div>',
    '<div class="seltgl" id="selTgl">—</div>',
    '<div id="selKet"></div>',
    '</div>',
    '<div class="acts"><button class="btn" id="selRoster" type="button">Buka Roster</button>',
    '<button class="btn primary" id="selTutup" type="button">Mengerti — Tutup</button></div>',
    '</div></div>'
  ].join('');

  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  document.getElementById('app').innerHTML = HTML;

  var $ = function (id) { return document.getElementById(id); };

  /* ==========================================================
     4. RENDER
     ========================================================== */
  var S = null;          // snapshot terakhir (hasil mapStatus); null = belum pernah terbaca
  var LIVE = false;      // poll terakhir berhasil
  var dicoba = false;    // sudah ada poll yang selesai (berhasil atau gagal)
  // dipakai bila snapshot belum membawa `target`; bisa beda dengan snapshot
  // kalau tab dibiarkan terbuka melewati tengah malam — snapshot selalu menang
  var TARGET = (function () {
    var d = new Date(); d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  })();

  function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function jam(t) {
    if (!t) return '—';
    var d = new Date(t);
    if (isNaN(d)) return '—';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function setTxt(id, v) { var el = $(id); if (el) el.textContent = v; }

  function mapStatus(js) {
    var k = js.kpi || {}, p = js.periods || {}, s = js.shifts || {}, em = js.email || {};
    return {
      emp: k.emp || 0, meal: k.meal || 0, activeLoc: k.activeLoc || 0, sc: k.sc || 0,
      B: p.B || 0, L: p.L || 0, D: p.D || 0, M: p.M || 0,
      DS: s.DS || 0, NS: s.NS || 0, CS: s.CS || 0, OFF: s.OFF || 0,
      locs: (js.locations || []).map(function (l) {
        return { n: l.n, B: l.B || 0, L: l.L || 0, D: l.D || 0, M: l.M || 0, v: l.v || 0 };
      }),
      file: js.file || '', target: js.target || TARGET, resumeUrl: js.resumeUrl || '',
      flag: js.status || 'idle',
      gen: js.generatedAt || '', genMs: js.generatedAt ? new Date(js.generatedAt).getTime() : 0,
      sentAt: js.sentAt || '', expiredAt: js.expiredAt || '',
      to: em.to || CFG.emailTo, cc: em.cc || CFG.emailCc
    };
  }

  var PERIODE = [
    { k: 'B', lab: 'Pagi' }, { k: 'L', lab: 'Siang' },
    { k: 'D', lab: 'Malam' }, { k: 'M', lab: 'Tengah Malam' }
  ];
  var SHIFT = [
    { k: 'DS', lab: 'Day' }, { k: 'NS', lab: 'Night' },
    { k: 'CS', lab: 'Crossover' }, { k: 'OFF', lab: 'Cuti/Off' }
  ];

  function renderMini(id, defs, total, shiftCls) {
    $(id).innerHTML = defs.map(function (d) {
      var v = S ? S[d.k] : 0;
      var pct = (S && total) ? Math.round(v / total * 100) : 0;
      return '<div class="tile mini' + (shiftCls ? ' s-' + d.k : '') + '">' +
        '<div class="lab">' + d.k + ' · ' + d.lab + '</div>' +
        '<div class="num">' + (S ? fmt(v) : '—') + '</div>' +
        '<div class="meta">' + (S ? pct + '%' : '&nbsp;') + '</div>' +
        '<div class="meter"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
  }

  function renderLoc() {
    var box = $('locBox');
    var locs = S ? S.locs : [];
    if (!locs.length) {
      box.innerHTML = '<div class="kosong">' + (S ? 'Tidak ada lokasi aktif pada laporan ini' : 'Belum ada data — mbr_status.json belum terbaca') + '</div>';
      setTxt('locTotal', '');
      return;
    }
    var max = locs[0].v || 1;
    locs.forEach(function (l) { if (l.v > max) max = l.v; });
    function sel(v) { return '<td' + (v ? '' : ' class="z"') + '>' + fmt(v) + '</td>'; }
    var rows = locs.map(function (l) {
      return '<tr><td class="n" title="' + esc(l.n) + '">' + esc(l.n) + '</td>' +
        sel(l.B) + sel(l.L) + sel(l.D) + sel(l.M) +
        '<td class="tot">' + fmt(l.v) + '</td>' +
        '<td class="bar"><span style="width:' + Math.max(1, l.v / max * 100) + '%"></span></td></tr>';
    }).join('');
    box.innerHTML = '<div class="tbl"><table class="loc">' +
      '<thead><tr><th class="n">Lokasi</th><th>B</th><th>L</th><th>D</th><th>M</th><th>Total</th><th class="bar" aria-hidden="true"></th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td class="n">TOTAL</td><td>' + fmt(S.B) + '</td><td>' + fmt(S.L) + '</td><td>' + fmt(S.D) + '</td><td>' + fmt(S.M) +
      '</td><td>' + fmt(S.meal) + '</td><td></td></tr></tfoot></table></div>';
    setTxt('locTotal', S.activeLoc + ' lokasi · ' + fmt(S.meal) + ' box');
  }

  function renderData() {
    setTxt('target', S ? S.target : TARGET);
    setTxt('kEmp', S ? fmt(S.emp) : '—');
    setTxt('kMeal', S ? fmt(S.meal) : '—');
    setTxt('kLoc', S ? fmt(S.activeLoc) : '—');
    setTxt('kSc', S ? fmt(S.sc) : '—');
    renderMini('periods', PERIODE, S ? S.B + S.L + S.D + S.M : 0, false);
    renderMini('shifts', SHIFT, S ? S.DS + S.NS + S.CS + S.OFF : 0, true);
    renderLoc();
    setTxt('cTarget', S ? S.target : TARGET);
    setTxt('cMeal', S ? fmt(S.meal) + ' box' : '—');
    setTxt('cEmp', S ? fmt(S.emp) + ' orang' : '—');
    setTxt('cFile', (S && S.file) || '—');
    setTxt('cGen', S ? jam(S.gen) : '—');
    setTxt('cTo', S ? S.to : CFG.emailTo);
    setTxt('cCc', S ? S.cc : CFG.emailCc);
  }

  /* ==========================================================
     5. STATUS — satu sumber kebenaran untuk baris status & tombol.
     Persetujuan/penahanan dicatat per snapshot (generatedAt), jadi run
     berikutnya yang datang saat tab masih terbuka otomatis mulai bersih.
     ========================================================== */
  var awaitingFreshSince = null;   // jalankan ulang: abaikan snapshot yang lebih tua dari ini
  var runAt = 0;
  var approvedGen = '';            // snapshot yang approve-nya sedang/sudah dikirim
  var heldGen = '';                // snapshot yang ditahan operator

  function keadaan() {
    if (awaitingFreshSince) return 'run';
    if (!S) return !dicoba ? 'connect' : LIVE ? 'idle' : 'offline';
    if (S.flag === 'pending') {
      if (approvedGen === S.gen) return 'sending';
      if (heldGen === S.gen) return 'held';
      return 'pending';
    }
    if (S.flag === 'sent' || S.flag === 'expired') return S.flag;
    return 'idle';
  }

  function renderStatus() {
    var k = keadaan(), cls = '', dot = '', t = '', s = '';
    if (k === 'run') {
      cls = 'warn'; dot = 'wait'; t = 'Menjalankan ulang…';
      s = 'menunggu snapshot baru dari n8n · dipicu ' + jam(runAt);
    } else if (k === 'connect') {
      t = 'Menghubungkan…'; s = 'membaca mbr_status.json';
    } else if (k === 'offline') {
      cls = 'crit'; dot = 'off'; t = 'File-bridge offline';
      s = 'status MBR tidak terbaca — cek container magi_api (endpoint mbr-status)';
    } else if (k === 'pending') {
      cls = 'warn'; dot = 'wait'; t = 'Menunggu persetujuan';
      s = 'dibuat ' + jam(S.gen) + ' · batas 30 menit, lewat dari itu email tidak dikirim';
    } else if (k === 'held') {
      cls = 'crit'; dot = 'off'; t = 'Ditahan operator';
      s = 'tidak dikirim kecuali di-approve ulang sebelum batas 30 menit';
    } else if (k === 'sending') {
      cls = 'warn'; dot = 'wait'; t = 'Mengirim persetujuan…';
      s = 'n8n mengunduh xlsx lalu mengirim email';
    } else if (k === 'sent') {
      cls = 'ok'; dot = 'on'; t = 'Terkirim';
      s = 'email terkirim ' + jam(S.sentAt) + ' · histori tersimpan';
    } else if (k === 'expired') {
      cls = 'crit'; dot = 'off'; t = 'Dibatalkan';
      s = '30 menit tanpa persetujuan — email tidak dikirim. Jalankan ulang bila masih diperlukan.';
    } else {
      t = 'Belum ada laporan'; s = 'menunggu workflow MBR berjalan';
    }
    $('stat').className = 'stat' + (cls ? ' ' + cls : '');
    $('statDot').className = 'dot' + (dot ? ' ' + dot : '');
    setTxt('statT', t);
    setTxt('statS', s);
    $('btnApprove').disabled = !(k === 'pending' || k === 'held');
    $('btnHold').disabled = (k !== 'pending');
  }

  function setLink() {
    $('linkDot').className = 'dot ' + (LIVE ? 'on' : 'off');
    setTxt('linkTxt', LIVE ? 'File-bridge aktif' : 'File-bridge offline');
  }

  /* ==========================================================
     6. NOTIFIKASI
     Log di panel 05 hanya untuk halaman ini. TIGA kejadian yang menuntut
     tindakan/perhatian orang — (1) MBR minta persetujuan, (2) email
     terkirim, (3) MBR batal karena 30 menit tanpa persetujuan — juga
     diteruskan ke store bersama (localStorage) yang dibaca Konsol Misi,
     lewat argumen `shareKey`. Notifikasi jalannya workflow sengaja TIDAK
     diteruskan.

     Skema objek harus sama dengan notify() di index.js, TERMASUK `key`:
     index.js memantau mbr_status.json sendiri, jadi kejadian yang sama bisa
     ditulis dua kali kalau kedua halaman terbuka. Kunci
     `mbr:<status>:<generatedAt>` membuat penulis kedua mundur.
     ========================================================== */
  function pushSharedNote(level, icon, title, detail, key, href) {
    try {
      var arr = JSON.parse(localStorage.getItem(CFG.store) || '[]');
      if (!Array.isArray(arr)) arr = [];
      if (key && arr.some(function (n) { return n && n.key === key; })) return;   // sudah ditulis halaman lain
      arr.unshift({ ts: Date.now(), level: level, icon: icon, title: title, detail: detail || '',
                    read: false, href: href || '', key: key || '' });
      if (arr.length > CFG.storeMax) arr.length = CFG.storeMax;
      localStorage.setItem(CFG.store, JSON.stringify(arr));
    } catch (e) { /* quota/JSON — abaikan, jangan ganggu UI */ }
  }

  function addNote(type, ico, msg, sub, shareKey, href) {
    var feed = $('feed');
    var el = document.createElement('div');
    el.className = 'note ' + type;
    el.innerHTML = '<span class="ic"></span><div class="bd"><div class="ti"></div>' +
      (sub ? '<div class="de"></div>' : '') + '<div class="tm"></div></div>';
    el.querySelector('.ic').textContent = ico;
    el.querySelector('.ti').textContent = msg;
    if (sub) el.querySelector('.de').textContent = sub;
    el.querySelector('.tm').textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
    feed.insertBefore(el, feed.firstChild);
    while (feed.children.length > CFG.feedMax) feed.removeChild(feed.lastChild);
    hitungLog();
    if (shareKey) pushSharedNote(type, ico, msg, sub, shareKey, href);
  }

  function hitungLog() {
    var n = $('feed').children.length;
    setTxt('logCount', String(n));
    $('feedEmpty').hidden = n > 0;
  }

  /* ==========================================================
     7. PERSETUJUAN
     ========================================================== */
  function openModal(title, bodyHTML, btns) {
    setTxt('mTitle', title);
    $('mBody').innerHTML = bodyHTML;
    var foot = $('mFoot');
    foot.innerHTML = '';
    btns.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (b.cls ? ' ' + b.cls : '');
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      foot.appendChild(btn);
    });
    $('mask').classList.add('on');
    var last = foot.lastChild;
    if (last) last.focus();
  }
  function closeModal() { $('mask').classList.remove('on'); }

  function askApprove() {
    var k = keadaan();
    if (k !== 'pending' && k !== 'held') return;
    openModal('Konfirmasi Pengiriman',
      'Kirim laporan <b>MBR Dept. Mining</b> untuk<br><b>' + esc(S.target) + '</b>?' +
      '<br><br>Total <b>' + fmt(S.meal) + '</b> box · <b>' + fmt(S.emp) + '</b> karyawan.' +
      '<div class="warnrow">⚠ Setelah disetujui, xlsx langsung diunduh dan email dikirim — <b>tidak bisa dibatalkan</b>. ' +
      'Pastikan tanggal target di atas sudah benar.</div>',
      [
        { label: 'Batal', onClick: closeModal },
        { label: 'Ya, Kirim Sekarang', cls: 'primary', onClick: doDispatch }
      ]);
  }

  function doDispatch() {
    closeModal();
    if (!S || !S.resumeUrl) {
      addNote('crit', '!', 'Approve tidak bisa dikirim', 'snapshot tidak membawa resume URL (akun ini berhak MBR?)');
      return;
    }
    var gen = S.gen;
    approvedGen = gen;
    renderStatus();
    addNote('info', '📤', 'Persetujuan dikirim operator', 'memicu resume workflow (Tunggu Persetujuan)');
    // penanda ?approved=1 dibaca node "Disetujui?" agar dibedakan dari timeout (yang TIDAK mengirim)
    var ru = S.resumeUrl + (S.resumeUrl.indexOf('?') >= 0 ? '&' : '?') + 'approved=1';
    /* Fase 1e (2026-08-31) — kegagalan tombol Approve TIDAK boleh dibungkam.
       Satu origin (di balik Caddy) -> mode cors penuh, status HTTP terbaca,
       jadi 404 (blok /webhook-waiting/* lupa dipasang) langsung kelihatan.
       Beda origin (:8088) -> no-cors TETAP wajib, tapi penolakan jaringan
       (gejala WEBHOOK_URL salah) tetap dilaporkan lewat .catch.
       Bila gagal, tombol dibuka lagi supaya operator bisa mencoba ulang. */
    var satuOrigin = (window.MAGI && MAGI.n8nBase === '');
    function gagal(judul, ket) {
      addNote('crit', '!', judul, ket);
      if (approvedGen === gen) { approvedGen = ''; renderStatus(); }
    }
    fetch(ru, satuOrigin ? { method: 'GET' } : { method: 'GET', mode: 'no-cors' })
      .then(function (r) {
        if (satuOrigin && !r.ok) gagal('Approve DITOLAK server (HTTP ' + r.status + ')', 'resume URL: ' + ru);
      })
      .catch(function (e) {
        gagal('Approve GAGAL terkirim — ' + (e && e.message ? e.message : e),
              'periksa WEBHOOK_URL di .env; resume URL: ' + ru);
      });
  }

  /* Hold hanya penanda di halaman ini — n8n tetap menunggu sampai batas
     30 menit. Approve tetap bisa ditekan ("di-approve ulang"). */
  function doHold() {
    if (keadaan() !== 'pending') return;
    var gen = S.gen;
    openModal('Tahan Pengiriman',
      'Tahan pengiriman laporan <b>' + esc(S.target) + '</b>?<br><br>' +
      'Laporan tidak dikirim kecuali di-approve ulang sebelum batas 30 menit; lewat dari itu MBR batal otomatis.',
      [
        { label: 'Batal', onClick: closeModal },
        { label: 'Ya, Tahan', cls: 'danger', onClick: function () {
          closeModal();
          heldGen = gen;
          renderStatus();
          addNote('crit', '✋', 'Pengiriman ditahan operator', 'menunggu approval ulang');
        } }
      ]);
  }

  /* ==========================================================
     8. LIVE — file-bridge ke n8n (mbr_status.json)
     ========================================================== */
  var lastEv = null;    // kejadian terakhir yang sudah dicatat (mbr:<status>:<generatedAt>)
  var lastRaw = '';     // isi file terakhir — render ulang hanya saat berubah

  function applyLive(js) {
    S = mapStatus(js);
    // sedang menjalankan ulang: snapshot lama tetap ditampilkan, tapi status
    // tetap "menjalankan" sampai snapshot baru tiba (jangan approve run lama)
    if (awaitingFreshSince && S.genMs >= awaitingFreshSince) awaitingFreshSince = null;
    renderData();
    renderStatus();
    if (awaitingFreshSince) return;

    var ev = 'mbr:' + S.flag + ':' + S.gen;
    if (ev === lastEv) return;
    lastEv = ev;
    if (S.flag === 'pending') {
      addNote('ok', '✔', 'Pipeline selesai — ' + fmt(S.meal) + ' box siap', 'master MBR + summary terisi');
      addNote('crit', '⏳', 'MBR MENUNGGU PERSETUJUAN ANDA',
        fmt(S.meal) + ' box · ' + S.target + ' · kedaluwarsa 30 menit', ev, CFG.mbrPage);
    } else if (S.flag === 'sent') {
      addNote('ok', '📧', 'Email MBR terkirim', js.email && js.email.to ? 'ke ' + js.email.to : 'Gmail', ev);
      addNote('ok', '💾', 'Histori xlsx tersimpan', S.file);
    } else if (S.flag === 'expired') {
      /* node "Status Kadaluarsa" menulis ini setelah Wait 30 menit habis —
         run berakhir TANPA email (lihat IF "Disetujui?") */
      addNote('crit', '⛔', 'MBR DIBATALKAN — tidak ada persetujuan',
        'batas 30 menit terlewat · email TIDAK dikirim · jalankan ulang bila masih diperlukan', ev);
    }
  }

  function pollStatus(force) {
    if (document.hidden && !force) return;   // tab tak terlihat: hemat, susul saat kembali
    fetch(CFG.statusUrl + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 404 && CFG.statusUrlLama) return fetch(CFG.statusUrlLama + '?t=' + Date.now(), { cache: 'no-store' });
        return r;
      })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
      .then(function (txt) {
        dicoba = true;
        if (txt !== lastRaw || force) { applyLive(JSON.parse(txt)); lastRaw = txt; }
        if (!LIVE) { LIVE = true; setLink(); renderStatus(); }
        cekSelisih();
      })
      .catch(function () {
        dicoba = true;
        LIVE = false; setLink(); renderStatus();
        if (force) addNote('crit', '✖', 'Gagal baca status MBR', 'cek container magi_api (endpoint mbr-status)');
      });
  }

  function triggerRun() {
    runAt = Date.now();
    awaitingFreshSince = runAt - 3000;   // toleransi skew jam
    renderStatus();
    addNote('info', '⚡', 'Menjalankan ulang workflow MBR', 'trigger → /webhook/mbr-run');
    // satu origin (di balik Caddy): status HTTP terbaca — 403 = akun tidak
    // berhak MBR (magi-api menegakkan hak sejak audit 2026-10-13), jangan
    // dilaporkan sebagai "terkirim"
    var satuOrigin = (window.MAGI && MAGI.n8nBase === '');
    fetch(CFG.runUrl + '?t=' + Date.now(), satuOrigin ? { method: 'GET' } : { method: 'GET', mode: 'no-cors' })
      .then(function (r) {
        if (satuOrigin && r.status === 403) { addNote('crit', '✖', 'Tidak berhak menjalankan MBR', 'akun ini tidak punya hak fitur MBR'); return; }
        if (satuOrigin && !r.ok) { addNote('crit', '✖', 'Gagal memicu workflow (HTTP ' + r.status + ')', 'pastikan n8n aktif & webhook terdaftar'); return; }
        addNote('ok', '▶', 'Trigger terkirim ke n8n', 'pipeline mulai berjalan');
      })
      .catch(function () { addNote('crit', '✖', 'Gagal memicu workflow', 'pastikan n8n aktif & webhook terdaftar'); });
  }

  /* ==========================================================
     9. SELISIH — total karyawan MBR (kpi.emp) vs roster-summary pada
     TANGGAL YANG SAMA. Berbeda -> papan peringatan merah.

     ⚠ Kedua angka TIDAK selalu sama, dan itu bukan bug: query MBR memakai
     LEFT JOIN ke karyawan_roster, jadi karyawan aktif yang BELUM punya baris
     roster pada tanggal itu tetap terhitung, sedangkan roster-summary hanya
     menghitung baris roster yang ada. Setel CFG.TOLERANSI kalau selisih
     sekian dianggap normal; 0 = sekecil apa pun tetap diperingatkan.
     Rinciannya: "Masalah - Selisih Total Karyawan MBR vs Roster Aktual".
     ========================================================== */
  var BULAN = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
  };

  /* "Sabtu, 15 Agustus 2026" -> "2026-08-15". Kalau gagal diurai: JANGAN
     membandingkan apa pun — tanggal yang salah memunculkan peringatan palsu,
     dan itu lebih buruk daripada tidak memeriksa. */
  function tglDariTarget(s) {
    if (!s) return null;
    var m = String(s).match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
    if (!m) return null;
    var bl = BULAN[m[2].toLowerCase()];
    if (!bl) return null;
    return m[3] + '-' + ('0' + bl).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  var cache = { tgl: null, total: null, waktu: 0 };   // hasil roster-summary
  var ditutup = {};                                    // "tgl|mbr|roster" yang sudah ditampilkan
  var gagalNotif = false;
  var fokusSebelum = null;

  function cekSelisih() {
    if (!S || !S.emp) return;
    var tglIso = tglDariTarget(S.target);
    if (!tglIso) return;
    var mbr = S.emp, tglTeks = S.target, sekarang = Date.now();
    if (cache.tgl === tglIso && cache.total !== null && (sekarang - cache.waktu) < CFG.jedaCekMs) {
      return bandingkan(mbr, cache.total, tglIso, tglTeks);
    }
    if (cache.tgl === tglIso && cache.total === null && (sekarang - cache.waktu) < CFG.ceklagiMs) return;

    cache.tgl = tglIso; cache.waktu = sekarang;
    fetch(CFG.rosterUrl + '?tgl=' + encodeURIComponent(tglIso) + '&t=' + sekarang, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (js) {
        var total = js && typeof js.total === 'number' ? js.total : null;
        if (total === null) throw new Error('total tidak ada');
        cache.total = total; cache.waktu = Date.now(); gagalNotif = false;
        bandingkan(mbr, total, tglIso, tglTeks);
      })
      .catch(function () {
        cache.total = null; cache.waktu = Date.now();
        if (!gagalNotif) {
          gagalNotif = true;
          addNote('warn', '⚠', 'Tidak bisa membaca roster-summary', 'perbandingan total karyawan dilewati');
        }
      });
  }

  function bandingkan(mbr, roster, tglIso, tglTeks) {
    var selisih = Math.abs(mbr - roster);
    if (selisih <= CFG.TOLERANSI) return;
    var kunci = tglIso + '|' + mbr + '|' + roster;
    if (ditutup[kunci]) return;              // sudah ditampilkan untuk angka yang sama persis
    ditutup[kunci] = true;
    addNote('crit', '⚠', 'SELISIH DATA: MBR ' + mbr + ' vs ROSTER ' + roster, tglIso + ' · selisih ' + selisih + ' orang');
    bukaSelisih(mbr, roster, tglIso, tglTeks);
  }

  function bukaSelisih(mbr, roster, tglIso, tglTeks) {
    var selisih = mbr - roster;
    setTxt('selMbr', fmt(mbr));
    setTxt('selRos', fmt(roster));
    setTxt('selSel', (selisih > 0 ? '+' : '') + selisih);
    setTxt('selTgl', 'Tanggal ' + (tglTeks || tglIso) + ' · ' + tglIso);
    $('selKet').innerHTML = selisih > 0
      ? '<b>MBR menghitung ' + selisih + ' orang lebih banyak daripada roster.</b><br>' +
        'Penyebab lazim: karyawan aktif yang belum punya baris roster pada tanggal ini ' +
        '(tetap masuk laporan dengan kolom makan kosong), atau baris kembar akibat ' +
        'data mess ganda. Periksa lewat Edit Roster.'
      : '<b>Roster menghitung ' + Math.abs(selisih) + ' orang lebih banyak daripada MBR.</b><br>' +
        'Penyebab lazim: roster diubah SETELAH MBR dijalankan, atau ada karyawan ' +
        'ber-roster yang tersaring keluar MBR (mis. DOT baru diisi). ' +
        'Jalankan ulang MBR agar laporannya menyusul.';
    fokusSebelum = document.activeElement;
    $('selMask').classList.add('on');
    $('selTutup').focus();
  }

  function tutupSelisih() {
    $('selMask').classList.remove('on');
    if (fokusSebelum && fokusSebelum.focus) { try { fokusSebelum.focus(); } catch (e) {} }
    fokusSebelum = null;
  }

  /* ==========================================================
     LATAR — bintang digambar SEKALI (ulang hanya saat ukuran jendela
     berubah). Dashboard utama menganimasikannya; di sini sengaja diam
     supaya halaman yang dibiarkan terbuka menunggu approval tetap ringan.
     ========================================================== */
  function bintang() {
    var cv = $('stars');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d'), t = null;
    function gambar() {
      var w = cv.width = window.innerWidth, h = cv.height = window.innerHeight;
      var n = Math.min(180, Math.round(w * h / 10000));
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.fillStyle = (i % 11 === 0 ? 'rgba(255,150,80,' : 'rgba(244,234,219,') + (Math.random() * 0.5 + 0.15) + ')';
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.2 + 0.25, 0, 6.284);
        ctx.fill();
      }
    }
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(gambar, 200); });
    gambar();
  }

  /* ==========================================================
     INIT
     ========================================================== */
  $('btnRun').onclick = triggerRun;
  $('btnApprove').onclick = askApprove;
  $('btnHold').onclick = doHold;
  $('btnReload').onclick = function () {
    $('feed').innerHTML = '';
    hitungLog();
    lastEv = null;
    pollStatus(true);
  };
  $('mask').onclick = function (e) { if (e.target.id === 'mask') closeModal(); };
  $('selMask').onclick = function (e) { if (e.target.id === 'selMask') tutupSelisih(); };
  $('selTutup').onclick = tutupSelisih;
  $('selRoster').onclick = function () { location.href = CFG.rosterPage; };
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('selMask').classList.contains('on')) tutupSelisih(); else closeModal();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollStatus(false); });

  function clock() { setTxt('clock', new Date().toLocaleTimeString('id-ID', { hour12: false })); }
  setInterval(clock, 1000);
  clock();

  bintang();
  renderData();
  renderStatus();
  hitungLog();
  setInterval(function () { pollStatus(false); }, CFG.pollMs);
  pollStatus(false);
})();

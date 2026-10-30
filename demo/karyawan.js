/* ============================================================
   MAGI//SYSTEM — Data Karyawan
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; karyawan.html
   hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur:
     1. Halaman terbuka -> kolom informasi tampil KOSONG (semua
        bernilai "—"), belum ada permintaan ke server.
     2. Masukkan Nama atau ID HO -> tekan Cari.
        - tepat 1 kecocokan  -> profil langsung terisi
        - lebih dari 1       -> daftar pilihan, klik salah satu
        - tidak ada          -> pesan kosong, kolom dikosongkan lagi
     3. "Bersihkan" mengembalikan ke kolom kosong.

   LINGKUP DATA — SENGAJA DIBATASI:
   halaman ini hanya menampilkan data KEPEGAWAIAN karyawan
   (identitas, kepegawaian, masa kontrak, mess, BPJS, SIMPER,
   skill). Data ROSTER (shift per tanggal) dan PEMESANAN MBR
   (meal box) TIDAK ditampilkan di sini dan jangan ditambahkan —
   roster ada di roster.html, MBR ada di MBR_dasbord.html.

   TERHUBUNG KE n8n: GET CFG.fetchUrl (webhook karyawan-list, CORS "*").
   Halaman ini READ-ONLY — tidak ada endpoint tulis.
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
    // Endpoint BACKEND (workflow n8n "Karyawan List"):
    //   GET ?q=  -> array data lengkap karyawan (satu objek per karyawan,
    //               termasuk array "simper" dan "skill")
    fetchUrl: MAGI.url('/webhook/karyawan-list'),
    //   saveUrl : POST {id_ho, changes:{field:nilai}}
    //             -> {status,fields,tables,message,errors}
    saveUrl: MAGI.url('/webhook/karyawan-update')
  };

  /* Kelompok kolom informasi. Urutan di sini = urutan tampil, dan
     dimulai dari Nama sesuai permintaan. Label bebas, kunci harus
     sama dengan nama field dari webhook.
     Menambah field cukup menambah satu baris di sini — fungsi render
     tidak perlu disentuh. JANGAN tambahkan field roster/MBR.

     `edit: true` menandai kelompok yang boleh diubah. Daftar ini HARUS
     tetap sama dengan daftar putih di workflow "Karyawan Update" DAN
     dengan grant kolom user MySQL n8n_mbr. Kalau tidak sinkron,
     perubahan akan ditolak server (422) atau MySQL (ERROR 1143) —
     bukan diam-diam gagal. Field ketiga = tipe input (default teks). */
  var GROUPS = [
    { title: 'Identitas', edit: false, fields: [
      ['nama', 'Nama'], ['id_ho', 'ID HO'], ['id_site', 'ID Site'],
      ['gender', 'Gender'], ['agama', 'Agama'],
      ['marital', 'Marital'], ['marital_status', 'Marital Status']
    ] },
    { title: 'Kepegawaian', edit: true, fields: [
      ['jabatan', 'Jabatan'], ['mpp_position', 'MPP Position'], ['acting', 'Acting'],
      ['mpp_dept', 'Departemen'], ['mpp_section', 'Section'], ['status', 'Status'],
      ['kategori', 'Kategori'], ['kategori_posisi', 'Kategori Posisi'],
      ['poh', 'POH'], ['jam_kerja', 'Jam Kerja', 'number']
    ] },
    { title: 'Masa Kontrak', edit: true, fields: [
      ['doh', 'DOH', 'date'], ['dot', 'DOT', 'date'], ['reason_dot', 'Reason DOT']
    ] },
    { title: 'Mess', edit: true, fields: [
      ['mess', 'Mess'], ['kamar_mess', 'Kamar']
    ] },
    { title: 'BPJS', edit: false, fields: [
      ['bpjs_kes', 'BPJS Kesehatan'], ['status_bpjs_kes', 'Status BPJS Kes'],
      ['bpjs_tk', 'BPJS Ketenagakerjaan'], ['tgl_kepesertaan_bpjs', 'Tgl Kepesertaan']
    ] }
  ];

  /* batas panjang per kolom, disamakan dengan skema MySQL supaya
     kelebihan panjang ketahuan sebelum dikirim, bukan sesudah ditolak */
  var MAXLEN = {
    jabatan: 100, mpp_position: 100, acting: 50, mpp_dept: 50, mpp_section: 100,
    status: 50, kategori: 20, kategori_posisi: 50, poh: 50,
    reason_dot: 50, mess: 50, kamar_mess: 50
  };

  /* Kolom informasi berbentuk tabel (relasi 1:N). Tampil di BAWAH kartu
     GROUPS, satu kartu selebar panel per tabel — di grid kartu 280px
     kolomnya terlalu sempit (Catatan SIMPER tumpah ke kartu Skill).
     Field ketiga 'nw' = jangan dipotong baris (tanggal, kode, nomor),
     'lebar' = teks panjang, diberi lebar minimum supaya tidak jadi kolom
     sempit yang tinggi di layar HP (tabel digeser ke samping).
     Field keempat (opsional) = fungsi it -> teks, untuk kolom turunan.
     rowClass (opsional) = fungsi it -> kelas <tr>. */
  var LISTS = [
    { key: 'simper', title: 'SIMPER / SIMPOL', cols: [
      ['class', 'Class', 'nw'], ['operator', 'Operator'], ['access', 'Access', 'nw'],
      ['no_simpol', 'No. Simpol', 'nw'], ['exp', 'Exp', 'nw'], ['catatan', 'Catatan', 'lebar']
    ] },
    { key: 'skill', title: 'Skill Unit', cols: [
      ['unit', 'Unit'], ['kategori_unit', 'Kategori'],
      ['status', 'Status', 'nw'], ['tgl_ditambah', 'Ditambah', 'nw']
    ] },
    /* masa berlaku & `berlaku` dihitung magi-api (aturan yang sama dengan
       halaman Warning): merah = masih dalam masa sanksi, hijau = selesai
       (tanggal berakhir lewat, atau status Done / Cancel) */
    { key: 'warning', title: 'Warning', cols: [
      ['sanksi', 'Sanksi', 'nw'], ['tgl_war_diberi', 'Diberi', 'nw'], ['berakhir', 'Berlaku s.d.', 'nw'],
      ['sisa_hari', 'Masa', 'nw w-masa', teksSisaWarning], ['pelanggaran', 'Pelanggaran', 'lebar pw'],
      ['nama_pembina', 'Pembina'], ['status', 'Status', 'nw'], ['war_catatan', 'Catatan', 'lebar pw']
    ], rowClass: function (it) { return it.berlaku ? 'w-aktif' : 'w-selesai'; } }
  ];
  /* teks kolom Masa (selaras warning.js): `berakhir` = hari terakhir masa
     berlaku, sisa_hari 0 = hari ini hari terakhir; tidak berlaku padahal
     sisa_hari >= 0 = ditutup lebih awal oleh status Done / Cancel */
  function teksSisaWarning(it) {
    if (it.berlaku) return it.sisa_hari === 0 ? 'hari terakhir' : 'sisa ' + it.sisa_hari + ' hari';
    if (it.sisa_hari >= 0) return 'selesai · ' + it.status;
    return 'selesai ' + (-it.sisa_hari) + ' hari lalu';
  }

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
    '.filterbar{display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:14px;align-items:end}',
    '@media(max-width:620px){.filterbar{grid-template-columns:1fr}}',
    '.fld{display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.fld label{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute)}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:10px 12px;transition:.15s}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.hint{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);margin-top:12px;letter-spacing:.06em}',

    /* ---------- TOMBOL ---------- */
    '.btn{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;white-space:nowrap;',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 20px;background:transparent;color:var(--cream-dim);transition:.15s}',
    '.btn:hover:not(:disabled){color:var(--cream);border-color:var(--line-strong)}',
    '.btn.primary{background:linear-gradient(180deg,var(--orange),var(--rust));border-color:transparent;color:#1a0e06;font-weight:700}',
    '.btn.primary:hover:not(:disabled){filter:brightness(1.1);box-shadow:var(--glow)}',
    '.btn:disabled{opacity:.42;cursor:not-allowed}',

    /* ---------- KEPALA PROFIL ---------- */
    '.pf-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 18px;',
    '  border-bottom:1px solid var(--line);background:rgba(244,234,219,.02)}',
    '.pf-ava{width:52px;height:52px;flex:0 0 auto;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    '  font-family:var(--mono);font-size:18px;font-weight:700;letter-spacing:.04em;color:var(--orange);',
    '  border:1px solid var(--line-strong);background:radial-gradient(circle at 35% 30%,rgba(255,106,31,.22),transparent 70%)}',
    '.pf-ava.blank{color:var(--cream-mute);border-color:var(--line);background:rgba(244,234,219,.03)}',
    '.pf-id{display:flex;flex-direction:column;gap:3px;min-width:0}',
    '.pf-id .nm{font-size:21px;font-weight:800;letter-spacing:.02em;color:var(--cream);word-break:break-word}',
    '.pf-id .nm.blank{color:var(--cream-mute);font-weight:600}',
    '.pf-id .meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:var(--mono);font-size:11px;color:var(--amber)}',
    '.pf-id .meta .sep{color:var(--cream-mute)}',
    '.pf-id .meta .muted{color:var(--cream-mute)}',
    '.pf-head .spacer{flex:1}',
    '.tag-st{font-family:var(--mono);font-size:10px;letter-spacing:.08em;padding:4px 11px;border-radius:999px;white-space:nowrap;',
    '  border:1px solid var(--line);background:rgba(244,234,219,.05);color:var(--cream-dim)}',
    '.tag-st.staff{color:var(--ok);border-color:rgba(127,214,166,.4)}',
    '.tag-st.non{color:var(--amber);border-color:rgba(255,176,58,.35)}',

    /* ---------- KOLOM INFORMASI ---------- */
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;padding:18px}',
    '.card{border:1px solid var(--line);border-radius:11px;background:rgba(244,234,219,.025);padding:14px 16px;min-width:0}',
    /* SIMPER & Skill: satu kartu selebar panel per tabel, di bawah kartu lain */
    '.grid.lists{grid-template-columns:minmax(0,1fr);padding-top:0}',
    '.card h3{margin:0 0 11px;font-family:var(--mono);font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--orange)}',
    '.card.blank h3{color:var(--cream-mute)}',
    '.kv{display:grid;grid-template-columns:minmax(104px,40%) 1fr;gap:7px 12px;align-items:baseline;margin:0}',
    '.kv dt{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream-mute);margin:0}',
    '.kv dd{margin:0;font-size:13px;color:var(--cream);word-break:break-word;',
    '  border-bottom:1px dotted rgba(244,234,219,.09);padding-bottom:3px;min-height:20px}',
    '.kv dd.empty{color:var(--cream-mute)}',
    /* ---------- MODE EDIT ---------- */
    '.card.locked h3::after{content:"terkunci";margin-left:8px;font-size:8.5px;letter-spacing:.16em;',
    '  color:var(--cream-mute);border:1px solid var(--line);border-radius:999px;padding:2px 7px}',
    '.kv dd.ro{color:var(--cream-dim)}',
    '.fin{width:100%;font-family:var(--sans);font-size:13px;color:var(--cream);background:rgba(244,234,219,.06);',
    '  border:1px solid var(--line);border-radius:7px;padding:6px 9px;transition:.15s}',
    '.fin:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.fin.dirty{border-color:rgba(255,176,58,.65);background:rgba(255,176,58,.10)}',
    'input[type=date].fin{font-family:var(--mono);color-scheme:dark}',
    '.kv dd.ed{border-bottom:none;padding-bottom:0}',
    '.dirty-pill{font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:4px 11px;border-radius:999px;',
    '  background:rgba(255,176,58,.16);color:var(--amber);border:1px solid rgba(255,176,58,.4);display:none}',
    '.dirty-pill.on{display:inline-block}',
    '.acts{display:flex;align-items:center;gap:9px;flex-wrap:wrap}',
    '.btn.sm{padding:8px 15px;font-size:10.5px}',
    '.btn.ok{background:linear-gradient(180deg,var(--ok),#3f8f66);border-color:transparent;color:#04140c;font-weight:700}',
    '.btn.ok:hover:not(:disabled){filter:brightness(1.08);box-shadow:0 0 18px rgba(127,214,166,.35)}',
    '.editnote{font-family:var(--mono);font-size:10.5px;color:var(--cream-mute);letter-spacing:.06em;',
    '  padding:0 18px 14px}',
    '.editnote b{color:var(--amber)}',
    /* tabel kecil untuk data 1:N */
    '.tbl{overflow-x:auto;color-scheme:dark;scrollbar-color:rgba(244,234,219,.22) transparent}',
    '.mini{width:100%;min-width:560px;border-collapse:collapse;margin-top:2px}',
    '.mini th{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;text-align:left;',
    '  color:var(--cream-mute);padding:5px 10px;border-bottom:1px solid var(--line);white-space:nowrap}',
    '.mini td{padding:7px 10px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--cream-dim);vertical-align:top}',
    '.mini td.nw{white-space:nowrap}',
    '.mini td.lebar{min-width:240px}',
    '.mini td.pw{white-space:pre-wrap;word-break:break-word}',   /* teks multi-baris (Warning) */
    /* tabel Warning: merah = masih dalam masa sanksi, hijau = selesai */
    '.mini tr.w-aktif td{background:rgba(226,59,50,.08)}',
    '.mini tr.w-aktif td:first-child{box-shadow:inset 3px 0 0 #E23B32}',
    '.mini tr.w-aktif td.w-masa{color:#ff8f86;font-weight:600}',
    '.mini tr.w-selesai td{background:rgba(127,214,166,.06)}',
    '.mini tr.w-selesai td:first-child{box-shadow:inset 3px 0 0 #7FD6A6}',
    '.mini tr.w-selesai td.w-masa{color:#7FD6A6}',
    '.mini tr:last-child td{border-bottom:none}',
    '.none{font-family:var(--mono);font-size:11px;color:var(--cream-mute);letter-spacing:.06em}',

    /* ---------- DAFTAR PILIHAN (kecocokan >1) ---------- */
    '.picker{padding:18px}',
    '.picker .lead{font-family:var(--mono);font-size:11px;color:var(--cream-dim);letter-spacing:.06em;margin-bottom:14px}',
    '.picker .lead b{color:var(--amber)}',
    '.plist{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}',
    '.pitem{display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;font:inherit;color:var(--cream);',
    '  border:1px solid var(--line);border-radius:10px;padding:11px 14px;background:rgba(244,234,219,.03);transition:.15s}',
    '.pitem:hover{border-color:var(--line-strong);background:rgba(255,106,31,.09);transform:translateY(-1px)}',
    '.pitem:focus-visible{outline:2px solid var(--amber);outline-offset:2px}',
    '.pitem .col{display:flex;flex-direction:column;min-width:0;gap:2px}',
    '.pitem .n{font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pitem .i{font-family:var(--mono);font-size:11px;color:var(--amber)}',
    '.pitem .j{font-size:11.5px;color:var(--cream-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pitem .arw{margin-left:auto;color:var(--orange);font-family:var(--mono)}',

    /* ---------- STATE KOSONG / LOADING ---------- */
    '.state{padding:46px 18px;text-align:center;color:var(--cream-mute);font-family:var(--mono);font-size:12px;letter-spacing:.1em}',
    '.state .big{font-size:34px;opacity:.5;margin-bottom:12px}',
    '.state b{color:var(--amber)}',
    '.spin{display:inline-block;width:26px;height:26px;border:3px solid rgba(255,106,31,.25);border-top-color:var(--orange);',
    '  border-radius:50%;animation:rot .8s linear infinite;margin-bottom:14px}',
    '@keyframes rot{to{transform:rotate(360deg)}}',

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
    '<div class="sub">Data Karyawan · Data Master</div></div>',
    '<div class="hud-spacer"></div>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">siap</span></div>',
    '</header>',

    /* ---- panel pencarian ---- */
    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Pencarian Karyawan</h2>',
    '<span class="spacer"></span><span class="idx">nama / id ho</span></div>',
    '<div class="p-body">',
    '<div class="filterbar">',
    '<div class="fld"><label for="fQuery">Nama atau ID HO</label>',
    '<input class="inp" id="fQuery" type="text" placeholder="mis. Budi Santoso atau XYZ00000001" autocomplete="off"></div>',
    '<div class="fld"><button class="btn primary" id="btnSearch">Cari</button></div>',
    '<div class="fld"><button class="btn" id="btnClear">Bersihkan</button></div>',
    '</div>',
    '<div class="hint">Masukkan nama atau ID HO, lalu tekan Cari untuk menampilkan informasi karyawan.</div>',
    '</div></section>',

    /* ---- panel informasi ---- */
    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>Informasi Karyawan</h2>',
    '<span class="spacer"></span><span class="idx" id="pfState">kosong</span></div>',
    '<div id="pfBody"></div>',
    '</section>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.n8nBase + '" target="_blank" rel="noopener">n8n editor</a> · ',
    '<a href="' + CFG.homePage + '">Mission Control</a> · Data Karyawan (baca saja)</div>',
    '</div>', /* /wrap */
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
  /* nilai kosong / null -> null, supaya render bisa menampilkan "—" diredupkan */
  function val(v) {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
  }
  function initial(nama) {
    var parts = String(nama || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function statusClass(st) {
    var s = String(st || '').toLowerCase();
    if (s.indexOf('non') === 0) return 'non';
    if (s.indexOf('staff') >= 0) return 'staff';
    return '';
  }

  /* ==========================================================
     6. RENDER — kolom informasi (kosong maupun terisi)
     ========================================================== */

  /* state halaman */
  var currentRow = null;   // karyawan yang sedang ditampilkan (nilai dari server)
  var editing = false;     // sedang mode ubah?
  var draft = {};          // nilai yang sedang diketik, per field

  /* semua field yang boleh diedit, dari GROUPS (satu sumber kebenaran) */
  function editableFields() {
    var out = [];
    GROUPS.forEach(function (g) {
      if (g.edit) g.fields.forEach(function (f) { out.push(f[0]); });
    });
    return out;
  }

  /* field yang nilainya berbeda dari data server */
  function changedFields() {
    if (!editing || !currentRow) return [];
    return editableFields().filter(function (k) {
      var awal = val(currentRow[k]);
      return String(draft[k] == null ? '' : draft[k]) !== String(awal == null ? '' : awal);
    });
  }

  /* satu kartu berisi pasangan label -> nilai.
     row = {} menghasilkan kartu kosong (semua "—") untuk tampilan awal.
     Saat `editing` dan kelompoknya `edit:true`, nilainya jadi input. */
  function cardKV(grup, row, blank) {
    var bisaEdit = editing && grup.edit && !blank;
    var body = grup.fields.map(function (p) {
      var key = p[0], label = p[1], tipe = p[2] || 'text';

      if (!bisaEdit) {
        var v = blank ? null : val(row[key]);
        return '<dt>' + esc(label) + '</dt>' +
          '<dd class="' + (v === null ? 'empty' : (editing ? 'ro' : '')) + '">' +
          (v === null ? '—' : esc(v)) + '</dd>';
      }

      var cur = draft[key];
      var kotor = String(cur == null ? '' : cur) !== String(val(row[key]) == null ? '' : val(row[key]));
      var attr = ' type="' + tipe + '"' +
        (MAXLEN[key] ? ' maxlength="' + MAXLEN[key] + '"' : '') +
        (tipe === 'number' ? ' min="0" max="24" step="1"' : '');
      return '<dt>' + esc(label) + '</dt>' +
        '<dd class="ed"><input class="fin' + (kotor ? ' dirty' : '') + '" data-f="' + esc(key) + '"' +
        attr + ' value="' + esc(cur == null ? '' : cur) + '"></dd>';
    }).join('');

    var kls = 'card' + (blank ? ' blank' : '') + (editing && !grup.edit && !blank ? ' locked' : '');
    return '<div class="' + kls + '"><h3>' + esc(grup.title) + '</h3>' +
      '<dl class="kv">' + body + '</dl></div>';
  }

  /* satu kartu berisi tabel kecil untuk data 1:N (simper / skill / warning) */
  function cardList(spec, row, blank) {
    var inner;
    if (blank) {
      inner = '<div class="none">—</div>';
    } else {
      var list = Array.isArray(row[spec.key]) ? row[spec.key] : [];
      if (!list.length) {
        inner = '<div class="none">Tidak ada data.</div>';
      } else {
        var head = spec.cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('');
        var body = list.map(function (it) {
          return '<tr' + (spec.rowClass ? ' class="' + spec.rowClass(it) + '"' : '') + '>' + spec.cols.map(function (c) {
            var v = val(c[3] ? c[3](it) : it[c[0]]);
            return '<td' + (c[2] ? ' class="' + c[2] + '"' : '') + '>' + (v === null ? '—' : esc(v)) + '</td>';
          }).join('') + '</tr>';
        }).join('');
        inner = '<div class="tbl"><table class="mini"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
      }
    }
    return '<div class="card' + (blank ? ' blank' : '') + (editing && !blank ? ' locked' : '') +
      '"><h3>' + esc(spec.title) + '</h3>' + inner + '</div>';
  }

  /* kepala profil: nama besar + ID HO + jabatan + badge status + tombol aksi */
  function headHTML(row, blank) {
    if (blank) {
      return '<div class="pf-head">' +
        '<div class="pf-ava blank">—</div>' +
        '<div class="pf-id"><div class="nm blank">Belum ada karyawan dipilih</div>' +
        '<div class="meta"><span class="muted">ID HO —</span><span class="sep">·</span>' +
        '<span class="muted">Jabatan —</span></div></div>' +
        '</div>';
    }
    var st = val(row.status);
    var n = changedFields().length;
    var aksi = editing
      ? '<span class="dirty-pill' + (n ? ' on' : '') + '" id="dirtyPill">' + n + ' perubahan</span>' +
        '<button class="btn sm" id="btnCancel" type="button">Batal</button>' +
        '<button class="btn sm ok" id="btnSave" type="button"' + (n ? '' : ' disabled') + '>Simpan</button>'
      : '<button class="btn sm" id="btnEdit" type="button">Ubah Data</button>';

    return '<div class="pf-head">' +
      '<div class="pf-ava">' + esc(initial(row.nama)) + '</div>' +
      '<div class="pf-id"><div class="nm">' + esc(val(row.nama) || '—') + '</div>' +
      '<div class="meta"><span>' + esc(val(row.id_ho) || '—') + '</span><span class="sep">·</span>' +
      '<span class="muted">' + esc(val(row.jabatan) || '—') + '</span></div></div>' +
      '<div class="spacer"></div>' +
      (st && !editing ? '<span class="tag-st ' + statusClass(st) + '">' + esc(st) + '</span>' : '') +
      '<span class="acts">' + aksi + '</span>' +
      '</div>';
  }

  /* seluruh kolom informasi; blank=true -> kerangka kosong */
  function renderInfo(row, blank) {
    var cards = GROUPS.map(function (g) { return cardKV(g, row || {}, blank); }).join('');
    var lists = LISTS.map(function (l) { return cardList(l, row || {}, blank); }).join('');
    var nota = editing
      ? '<div class="editnote">Hanya <b>Kepegawaian</b>, <b>Masa Kontrak</b>, dan <b>Mess</b> yang bisa diubah. ' +
        'Identitas, BPJS, SIMPER, Skill, dan Warning terkunci baca-saja. Kosongkan kolom untuk menghapus isinya.</div>'
      : '';
    $('pfBody').innerHTML = headHTML(row || {}, blank) +
      '<div class="grid">' + cards + '</div><div class="grid lists">' + lists + '</div>' + nota;
    $('pfState').textContent = blank ? 'kosong'
      : (editing ? 'mode ubah' : String(val(row.id_ho) || '—'));
    wireInfo();
  }

  function renderEmpty() {
    currentRow = null; editing = false; draft = {};
    renderInfo(null, true);
  }

  function renderProfile(row, diam) {
    currentRow = row;
    editing = false;
    draft = {};
    renderInfo(row, false);
    if (!diam) toast('ok', 'Menampilkan data <b>' + esc(row.nama) + '</b> (' + esc(row.id_ho) + ').');
  }

  /* pasang listener untuk tombol + input yang baru saja dirender */
  function wireInfo() {
    var b;
    if ((b = $('btnEdit'))) b.addEventListener('click', mulaiEdit);
    if ((b = $('btnCancel'))) b.addEventListener('click', batalEdit);
    if ((b = $('btnSave'))) b.addEventListener('click', simpanEdit);

    Array.prototype.forEach.call($('pfBody').querySelectorAll('.fin'), function (inp) {
      inp.addEventListener('input', function () {
        draft[inp.getAttribute('data-f')] = inp.value;
        // perbarui penanda tanpa merender ulang (fokus & posisi kursor terjaga)
        var k = inp.getAttribute('data-f');
        var awal = val(currentRow[k]);
        var kotor = String(inp.value) !== String(awal == null ? '' : awal);
        inp.className = 'fin' + (kotor ? ' dirty' : '');
        var n = changedFields().length;
        var pill = $('dirtyPill');
        if (pill) { pill.textContent = n + ' perubahan'; pill.className = 'dirty-pill' + (n ? ' on' : ''); }
        if ($('btnSave')) $('btnSave').disabled = n === 0;
      });
    });
  }

  /* ==========================================================
     6b. MODE UBAH
     ========================================================== */
  function mulaiEdit() {
    if (!currentRow) return;
    editing = true;
    draft = {};
    editableFields().forEach(function (k) {
      var v = val(currentRow[k]);
      draft[k] = v == null ? '' : v;
    });
    renderInfo(currentRow, false);
    var first = $('pfBody').querySelector('.fin');
    if (first) first.focus();
  }

  function batalEdit() {
    if (changedFields().length &&
        !window.confirm('Batalkan perubahan yang belum disimpan?')) return;
    renderProfile(currentRow, true);
    toast('warn', 'Perubahan dibatalkan — kembali ke data tersimpan.');
  }

  function simpanEdit() {
    var ubah = changedFields();
    if (!ubah.length || !currentRow) return;

    var changes = {};
    ubah.forEach(function (k) { changes[k] = draft[k]; });

    $('btnSave').disabled = true;
    if ($('btnCancel')) $('btnCancel').disabled = true;
    setLink('wait', 'menyimpan…');

    fetch(CFG.saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_ho: currentRow.id_ho, changes: changes })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          return { ok: r.ok, status: r.status, body: b || {} };
        });
      })
      .then(function (res) {
        var b = res.body;
        if (res.ok && b.status === 'ok') {
          setLink('on', 'terhubung');
          var pesan = '<b>' + (b.fields != null ? b.fields : ubah.length) + ' field tersimpan</b>';
          if (b.errors && b.errors.length) pesan += ' · ' + b.errors.length + ' ditolak';
          toast(b.errors && b.errors.length ? 'warn' : 'ok', pesan + '.');
          if (b.errors && b.errors.length) console.warn('Ditolak server:', b.errors);
          // tarik ulang dari server supaya yang tampil = yang benar-benar tersimpan
          muatSatu(currentRow.id_ho);
        } else {
          setLink('off', 'ditolak');
          $('btnSave').disabled = false;
          if ($('btnCancel')) $('btnCancel').disabled = false;
          var em = (b && b.message) ? b.message : ('HTTP ' + res.status);
          var det = (b && b.errors && b.errors.length) ? '<br>· ' + b.errors.map(esc).join('<br>· ') : '';
          toast('crit', '<b>Gagal menyimpan</b> — ' + esc(String(em)) + det);
        }
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        setLink('off', 'gagal');
        $('btnSave').disabled = false;
        if ($('btnCancel')) $('btnCancel').disabled = false;
        toast('crit', '<b>Gagal menyimpan</b> — ' + esc(msg) +
          '. Cek endpoint <b>' + esc(CFG.saveUrl) + '</b>.');
      });
  }

  /* ambil ulang satu karyawan (dipakai setelah simpan) */
  function muatSatu(idHo) {
    fetch(CFG.fetchUrl + '?q=' + encodeURIComponent(idHo), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (rows) {
        var hit = (Array.isArray(rows) ? rows : []).filter(function (r) { return r.id_ho === idHo; })[0];
        if (hit) renderProfile(hit, true);
      })
      .catch(function () { /* toast simpan sudah tampil; biarkan data lama di layar */ });
  }

  /* lebih dari satu kecocokan -> minta pengguna memilih */
  function renderPicker(rows) {
    var items = rows.map(function (r, i) {
      return '<button class="pitem" data-idx="' + i + '" type="button">' +
        '<div class="col"><span class="n">' + esc(r.nama) + '</span>' +
        '<span class="i">' + esc(r.id_ho) + '</span></div>' +
        '<span class="j">' + esc(val(r.jabatan) || '—') + '</span>' +
        '<span class="arw">→</span></button>';
    }).join('');

    $('pfBody').innerHTML =
      '<div class="picker"><div class="lead">Ditemukan <b>' + rows.length +
      '</b> karyawan yang cocok — pilih salah satu untuk menampilkan informasinya.</div>' +
      '<div class="plist">' + items + '</div></div>';
    $('pfState').textContent = rows.length + ' kecocokan';

    Array.prototype.forEach.call($('pfBody').querySelectorAll('.pitem'), function (b) {
      b.addEventListener('click', function () {
        renderProfile(rows[+b.getAttribute('data-idx')]);
      });
    });
  }

  /* ==========================================================
     7. AKSI — cari & bersihkan
     ========================================================== */
  function doSearch() {
    // jangan biarkan hasil ketikan hilang tanpa disadari
    if (changedFields().length &&
        !window.confirm('Ada perubahan yang belum disimpan. Tinggalkan dan cari karyawan lain?')) return;

    var q = String($('fQuery').value || '').trim();
    if (!q) {
      renderEmpty();
      setLink('on', 'siap');
      toast('warn', 'Masukkan <b>nama</b> atau <b>ID HO</b> terlebih dahulu.');
      $('fQuery').focus();
      return;
    }

    $('btnSearch').disabled = true;
    setLink('wait', 'memuat…');
    $('pfBody').innerHTML = '<div class="state"><div class="spin"></div><br>Mencari data karyawan…</div>';
    $('pfState').textContent = 'mencari…';

    fetch(CFG.fetchUrl + '?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) rows = [];
        $('btnSearch').disabled = false;
        setLink('on', 'terhubung');

        if (!rows.length) {
          renderEmpty();
          $('pfState').textContent = 'tidak ditemukan';
          toast('warn', 'Tidak ada karyawan dengan nama / ID HO <b>' + esc(q) + '</b>.');
          return;
        }
        if (rows.length === 1) { renderProfile(rows[0]); return; }
        renderPicker(rows);
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        $('btnSearch').disabled = false;
        setLink('off', 'gagal');
        $('pfBody').innerHTML =
          '<div class="state"><div class="big">⚠</div>Gagal memuat data karyawan dari server.<br>' +
          '<b>' + esc(msg) + '</b><br>Pastikan service <b>magi_api</b> berjalan (endpoint <b>karyawan-list</b>).</div>';
        $('pfState').textContent = 'gagal';
        toast('crit', '<b>Gagal memuat</b> — ' + esc(msg) + '. Cek endpoint <b>' + esc(CFG.fetchUrl) + '</b>.');
      });
  }

  function doClear() {
    if (changedFields().length &&
        !window.confirm('Ada perubahan yang belum disimpan. Bersihkan tetap?')) return;
    $('fQuery').value = '';
    renderEmpty();
    setLink('on', 'siap');
    $('fQuery').focus();
  }

  $('btnSearch').addEventListener('click', doSearch);
  $('btnClear').addEventListener('click', doClear);
  $('fQuery').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  /* peringatkan bila menutup halaman dengan perubahan belum tersimpan */
  window.addEventListener('beforeunload', function (e) {
    if (changedFields().length) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ==========================================================
     BOOT — tampilkan kolom informasi KOSONG, tanpa memanggil server
     ========================================================== */
  renderEmpty();
  setLink('on', 'siap');
})();

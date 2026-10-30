/* ============================================================
   MAGI//SYSTEM — Akses & Pengguna
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; akses.html
   hanya shell kosong berisi <div id="app">. Pola sama dengan
   index.js/roster.js/karyawan.js/absen.js.

   Semua akun yang terdaftar di server, dalam tiga kelompok:
     1. Pengguna Dashboard — bisa login ke dashboard (tabel db_mining.app_user).
        Administrator dapat Tambah / Ubah (username·nama·peran·password·hak akses) /
        Hapus lewat modal. Kolom "Hak Akses" = modul Konsol Misi yang boleh dibuka
        akun itu; Administrator selalu penuh.
     2. Akun Layanan/MySQL — root + akun aplikasi (n8n_mbr, magi_api),
        deskripsi statik (service/users.js) + status hidup dari mysql.user.
     3. Akun n8n — akun editor n8n, dibaca read-only dari database.sqlite.

   Sumber data: GET CFG.listUrl (magi-api /webhook/akses-list).
   Tulis: POST akses-create / akses-update / akses-delete (Administrator only).
   ============================================================ */
(function () {
  'use strict';

  var CFG = {
    homePage: './index.html',
    n8nBase: MAGI.n8nBase,
    listUrl: MAGI.url('/webhook/akses-list'),
    createUrl: MAGI.url('/webhook/akses-create'),
    updateUrl: MAGI.url('/webhook/akses-update'),
    deleteUrl: MAGI.url('/webhook/akses-delete'),
  };
  var AKTOR = (window.MAGI && MAGI.actor) || 'anon';
  var _dash = [];    // daftar pengguna dashboard terakhir (untuk tombol Edit)
  var _fitur = [];   // katalog fitur {key,label} dari akses-list
  var MODE = 'add';  // 'add' | 'edit'
  var EDIT_ID = null;
  // hanya Administrator (atau sesi lama) yang boleh menambah/ubah/hapus dari sini
  var BOLEH_KELOLA = (function () {
    try { var p = localStorage.getItem('magi.peran') || ''; return p === '' || p === 'Administrator'; }
    catch (e) { return true; }
  })();

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function dash(s) { s = String(s == null ? '' : s).trim(); return s === '' ? '—' : esc(s); }

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
    '[hidden]{display:none!important}',
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

    '.panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--panel),var(--panel2));',
    '  box-shadow:0 10px 34px rgba(0,0,0,.4);overflow:hidden;margin-bottom:22px}',
    '.p-head{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.p-head h2{margin:0;font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream)}',
    '.p-head .idx{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--orange)}',
    '.p-head .spacer{flex:1}',
    '.p-head .cnt{font-family:var(--mono);font-size:10px;color:var(--cream-mute);letter-spacing:.1em}',
    '.p-body{padding:0}',

    '.tbl-wrap{overflow-x:auto}',
    'table.acc{width:100%;border-collapse:collapse;min-width:640px}',
    '.acc thead th{font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;text-align:left;',
    '  color:var(--cream-mute);padding:11px 14px;border-bottom:1px solid var(--line-strong);background:var(--panel)}',
    '.acc tbody td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:13.5px;color:var(--cream-dim)}',
    '.acc tbody tr:last-child td{border-bottom:none}',
    '.acc tbody tr:hover{background:rgba(244,234,219,.03)}',
    '.c-id{font-family:var(--mono);font-size:12.5px;color:var(--amber);white-space:nowrap}',
    '.c-name{color:var(--cream);font-weight:600}',
    '.c-note{font-size:12px;color:var(--cream-mute);max-width:38ch}',
    '.c-mono{font-family:var(--mono);font-size:12px;color:var(--cream-dim);white-space:nowrap}',

    '.badge{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;',
    '  padding:4px 9px;border-radius:999px;border:1px solid var(--line)}',
    '.badge.role{color:var(--cream-dim)}',
    '.badge.aktif{color:var(--ok);border-color:rgba(127,214,166,.4);background:rgba(127,214,166,.10)}',
    '.badge.kunci{color:var(--crit);border-color:rgba(226,59,50,.4);background:rgba(226,59,50,.10)}',
    '.badge.warn{color:var(--warn);border-color:rgba(255,176,58,.4);background:rgba(255,176,58,.10)}',
    '.badge.na{color:var(--cream-mute)}',
    '.badge.super{color:var(--red);border-color:rgba(226,59,50,.4)}',

    '.empty{padding:22px;font-size:13px;color:var(--cream-mute);text-align:center}',
    '.empty a{color:var(--orange);text-decoration:none}',

    /* tombol "tambah akun" di kepala panel */
    '.addbtn{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;',
    '  cursor:pointer;border:1px solid var(--line-strong);border-radius:999px;padding:7px 13px;',
    '  background:linear-gradient(180deg,var(--orange),var(--rust));color:#1a0e06;font-weight:700;transition:.15s}',
    '.addbtn:hover{filter:brightness(1.1);box-shadow:var(--glow)}',
    '.aksi{display:inline-flex;gap:8px;justify-content:flex-end}',
    '.ebtn,.dbtn{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid var(--line);border-radius:999px;padding:6px 11px;background:rgba(244,234,219,.04);color:var(--cream-dim);transition:.15s;white-space:nowrap}',
    '.ebtn:hover{color:var(--cream);border-color:var(--line-strong)}',
    '.dbtn:hover{color:var(--crit);border-color:rgba(226,59,50,.5);background:rgba(226,59,50,.08)}',

    /* chip hak akses di tabel + checkbox di modal */
    '.hakchips{display:flex;flex-wrap:wrap;gap:5px}',
    '.hakchip{font-family:var(--mono);font-size:9px;letter-spacing:.06em;text-transform:uppercase;',
    '  padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--cream-dim);background:rgba(244,234,219,.04)}',
    '.haks{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:4px}',
    '@media(max-width:420px){.haks{grid-template-columns:1fr}}',
    '.haks label{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--cream-dim);cursor:pointer;user-select:none}',
    '.haks input{width:15px;height:15px;accent-color:var(--orange);cursor:pointer;flex:0 0 auto}',
    '.haks label.mati{opacity:.55;cursor:not-allowed}',
    '.haks label.mati input{cursor:not-allowed}',

    /* toast kecil */
    '.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;max-width:90vw;',
    '  font-family:var(--mono);font-size:12px;padding:12px 18px;border-radius:10px;border:1px solid var(--line-strong);',
    '  background:rgba(24,19,16,.96);color:var(--cream);box-shadow:0 14px 44px rgba(0,0,0,.5);opacity:0;transition:opacity .2s,transform .2s}',
    '.toast.on{opacity:1;transform:translateX(-50%) translateY(-4px)}',
    '.toast.ok{border-color:rgba(127,214,166,.5)}.toast.err{border-color:rgba(226,59,50,.5);color:var(--crit)}',

    /* ---------- POPUP TAMBAH AKUN ---------- */
    '.overlay{position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;padding:20px;',
    '  background:rgba(5,4,3,.72);backdrop-filter:blur(3px)}',
    '.overlay.on{display:flex}',
    '.modal{width:min(94vw,420px);border:1px solid var(--line-strong);border-radius:16px;overflow:hidden;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 26px 70px rgba(0,0,0,.6)}',
    '.modal .m-head{padding:15px 20px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,rgba(255,106,31,.12),transparent);',
    '  font-family:var(--mono);font-size:11.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--cream)}',
    '.modal .m-body{padding:20px}',
    '.modal .fld{margin-bottom:15px}',
    '.modal .fld label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute);margin-bottom:6px}',
    '.modal .fld .opt{color:var(--cream-mute);text-transform:none;letter-spacing:0}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 13px;transition:.15s}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus,.sel:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',
    '.sel{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 13px}',
    '.sel option{background:var(--panel);color:var(--cream)}',
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
    '<div class="sub">Akses &amp; Pengguna · Sistem</div></div>',
    '<div class="hud-spacer"></div>',
    '<button class="rfr" id="btnRefresh">↻ Perbarui</button>',
    '<a class="back" href="' + CFG.homePage + '">← Konsol Misi</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">memuat…</span></div>',
    '</header>',

    '<div class="lead">Daftar <b>semua akun yang terdaftar di server</b>, hanya untuk ditinjau. ',
    'Pengguna dashboard bisa ditambah &amp; diubah dari panel ini (butuh peran Administrator).</div>',

    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Pengguna Dashboard</h2>',
    '<span class="spacer"></span>',
    '<button class="addbtn" id="btnAdd">＋ Tambah Akun</button>',
    '<span class="cnt" id="cDash"></span></div>',
    '<div class="p-body"><div class="tbl-wrap"><table class="acc"><thead><tr>',
    '<th>Username</th><th>Nama</th><th>Peran</th><th>Hak Akses</th><th>Status</th><th>Dibuat</th><th>Oleh</th><th></th>',
    '</tr></thead><tbody id="tbDash"></tbody></table></div></div></section>',

    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>Akun Layanan / MySQL</h2>',
    '<span class="spacer"></span><span class="cnt" id="cSvc"></span></div>',
    '<div class="p-body"><div class="tbl-wrap"><table class="acc"><thead><tr>',
    '<th>Akun</th><th>Sistem</th><th>Peran</th><th>Fungsi</th><th>Status</th><th>Password diubah</th>',
    '</tr></thead><tbody id="tbSvc"></tbody></table></div></div></section>',

    '<section class="panel"><div class="p-head"><span class="idx">03</span><h2>Akun n8n (editor)</h2>',
    '<span class="spacer"></span><span class="cnt" id="cN8n"></span></div>',
    '<div class="p-body" id="bN8n"></div></section>',

    '<div class="foot" id="foot"></div>',

    '</div>',

    /* ---- popup tambah / ubah akun (satu modal, dua mode) ---- */
    '<div class="overlay" id="ovl">',
    '<form class="modal" id="addForm" autocomplete="off" novalidate>',
    '<div class="m-head" id="mdlTitle">Daftarkan Akun Dashboard</div>',
    '<div class="m-body">',
    '<div class="m-err" id="addErr"></div>',
    '<div class="fld"><label for="aUser">Username</label>',
    '<input class="inp" id="aUser" type="text" placeholder="mis. budi.operator" autocomplete="off"></div>',
    '<div class="fld"><label for="aPass" id="aPassLbl">Password <span class="opt">— minimal 8 karakter, bukan username / password umum</span></label>',
    '<input class="inp" id="aPass" type="password" placeholder="••••••••" autocomplete="new-password"></div>',
    '<div class="fld"><label for="aNama">Nama <span class="opt">— opsional</span></label>',
    '<input class="inp" id="aNama" type="text" placeholder="Nama lengkap" autocomplete="off"></div>',
    '<div class="fld"><label for="aPeran">Peran</label>',
    '<select class="sel" id="aPeran"><option value="Operator">Operator</option>',
    '<option value="Administrator">Administrator</option></select></div>',
    '<div class="fld"><label>Hak Akses <span class="opt" id="aHakNote">— modul Konsol Misi yang boleh dibuka</span></label>',
    '<div class="haks" id="aHaks"></div></div>',
    '</div>',
    '<div class="m-foot">',
    '<button class="btn" type="button" id="addCancel">Batal</button>',
    '<button class="btn primary" type="submit" id="addSave">Daftarkan</button>',
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
    wireAdd();
    if (!BOLEH_KELOLA) $('btnAdd').hidden = true;
    $('foot').innerHTML =
      'Pengguna dashboard di tabel <b>db_mining.app_user</b> · akun n8n di ' +
      '<a href="' + esc(CFG.n8nBase) + '" target="_blank" rel="noopener">editor n8n</a> · ' +
      'akun MySQL lewat <b>root</b>. — <a href="' + CFG.homePage + '">Konsol Misi</a>';
    muat();
  });

  /* ==========================================================
     LOGIKA
     ========================================================== */
  function setLink(state, txt) {
    var d = $('linkDot'), t = $('linkTxt');
    d.className = 'dot' + (state ? ' ' + state : '');
    t.textContent = txt;
  }

  function muat() {
    setLink('wait', 'memuat…');
    fetch(CFG.listUrl + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        render(d || {});
        setLink('on', 'terhubung');
      })
      .catch(function (e) {
        setLink('off', 'gagal');
        $('tbDash').innerHTML = row(8, 'Gagal memuat — ' + esc(e.message || e) + '. Cek endpoint ' + esc(CFG.listUrl) + '.');
        $('tbSvc').innerHTML = '';
        $('bN8n').innerHTML = '';
      });
  }

  function row(span, msg) {
    return '<tr><td colspan="' + span + '" class="empty">' + msg + '</td></tr>';
  }

  /* ---- popup tambah / ubah akun ---- */
  var _tt;
  function toast(kind, msg) {
    var t = $('toast');
    t.className = 'toast ' + (kind || '') + ' on';
    t.textContent = msg;
    clearTimeout(_tt);
    _tt = setTimeout(function () { t.className = 'toast ' + (kind || ''); }, 3200);
  }
  function closeMdl() { $('ovl').classList.remove('on'); }
  function mdlErr(msg) { var e = $('addErr'); e.textContent = msg; e.classList.add('on'); }

  // --- checkbox hak akses di modal ---
  var _hakSiap = false;
  function bangunHakBox() {
    if (_hakSiap || !_fitur.length) return;
    $('aHaks').innerHTML = _fitur.map(function (f) {
      return '<label data-k="' + esc(f.key) + '"><input type="checkbox" value="' + esc(f.key) + '">' +
        '<span>' + esc(f.label) + '</span></label>';
    }).join('');
    _hakSiap = true;
  }
  function setHak(list, kunci) {
    bangunHakBox();
    var izin = Array.isArray(list) ? list : [];
    var labs = $('aHaks').querySelectorAll('label');
    Array.prototype.forEach.call(labs, function (lab) {
      var inp = lab.querySelector('input');
      inp.checked = izin.indexOf(inp.value) >= 0;
      inp.disabled = !!kunci;
      lab.className = kunci ? 'mati' : '';
    });
  }
  function hakTerpilih() {
    var out = [];
    Array.prototype.forEach.call($('aHaks').querySelectorAll('input'), function (i) {
      if (i.checked) out.push(i.value);
    });
    return out;
  }
  function syncPeran() {
    // Administrator = semua fitur, checkbox dikunci
    var adm = ($('aPeran').value === 'Administrator');
    if (adm) setHak(_fitur.map(function (f) { return f.key; }), true);
    else {
      var labs = $('aHaks').querySelectorAll('label');
      Array.prototype.forEach.call(labs, function (lab) {
        lab.className = ''; lab.querySelector('input').disabled = false;
      });
    }
    $('aHakNote').textContent = adm
      ? '— Administrator selalu punya akses penuh'
      : '— modul Konsol Misi yang boleh dibuka';
  }

  function keys() { return _fitur.map(function (f) { return f.key; }); }

  function openAdd() {
    MODE = 'add'; EDIT_ID = null;
    $('addErr').classList.remove('on');
    $('mdlTitle').textContent = 'Daftarkan Akun Dashboard';
    $('aPassLbl').innerHTML = 'Password <span class="opt">— minimal 8 karakter, bukan username / password umum</span>';
    $('aUser').value = ''; $('aPass').value = ''; $('aNama').value = ''; $('aPeran').value = 'Operator';
    $('aPass').placeholder = '••••••••';
    $('addSave').textContent = 'Daftarkan';
    setHak(keys(), false);            // default: semua dicentang, admin unchekc yang tak perlu
    syncPeran();
    $('ovl').classList.add('on');
    setTimeout(function () { $('aUser').focus(); }, 30);
  }

  function openEdit(id) {
    var u = null;
    for (var i = 0; i < _dash.length; i++) if (String(_dash[i].id) === String(id)) { u = _dash[i]; break; }
    if (!u) { toast('err', 'Data akun tidak ditemukan — coba Perbarui.'); return; }
    MODE = 'edit'; EDIT_ID = u.id;
    $('addErr').classList.remove('on');
    $('mdlTitle').textContent = 'Ubah Akun — ' + u.username;
    $('aPassLbl').innerHTML = 'Password baru <span class="opt">— kosongkan jika tidak diubah</span>';
    $('aUser').value = u.username;
    $('aPass').value = '';
    $('aPass').placeholder = '(tidak diubah)';
    $('aNama').value = u.nama || '';
    $('aPeran').value = /admin/i.test(u.peran) ? 'Administrator' : 'Operator';
    $('addSave').textContent = 'Simpan';
    setHak(Array.isArray(u.hak) ? u.hak : [], /admin/i.test(u.peran));
    syncPeran();
    $('ovl').classList.add('on');
    setTimeout(function () { $('aNama').focus(); }, 30);
  }

  function hapusAkun(id, username) {
    var nama = username || 'akun ini';
    if (!window.confirm('Hapus akun "' + nama + '"?\n\nTindakan ini tidak bisa dibatalkan.')) return;
    toast('', 'Menghapus…');
    fetch(CFG.deleteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id) }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b || {} }; });
      })
      .then(function (res) {
        if (res.ok && res.body.status === 'ok') {
          toast('ok', res.body.message || ('Akun "' + nama + '" dihapus.'));
          muat();
        } else {
          toast('err', res.body.message || 'Gagal menghapus akun.');
        }
      })
      .catch(function (e) {
        toast('err', 'Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
      });
  }

  function wireAdd() {
    $('btnAdd').addEventListener('click', openAdd);
    $('addCancel').addEventListener('click', closeMdl);
    $('ovl').addEventListener('click', function (e) { if (e.target === $('ovl')) closeMdl(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMdl(); });
    $('addForm').addEventListener('input', function () { $('addErr').classList.remove('on'); });
    $('aPeran').addEventListener('change', syncPeran);

    // tombol Ubah / Hapus per baris (event delegation)
    $('tbDash').addEventListener('click', function (e) {
      var t = e.target;
      function cari(attr) {
        if (t && t.getAttribute && t.getAttribute(attr) != null) return t;
        return (t && t.closest) ? t.closest('[' + attr + ']') : null;
      }
      var eb = cari('data-edit');
      if (eb) { openEdit(eb.getAttribute('data-edit')); return; }
      var db = cari('data-del');
      if (db) hapusAkun(db.getAttribute('data-del'), db.getAttribute('data-user'));
    });

    $('addForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var save = $('addSave');
      if (save.disabled) return;
      var lbl = save.textContent;
      var edit = (MODE === 'edit');

      var username = $('aUser').value.trim();
      var password = $('aPass').value;
      var nama = $('aNama').value.trim();
      var peran = $('aPeran').value;

      if (!edit && (!username || !password)) { mdlErr('Username dan password wajib diisi.'); return; }
      if (edit && !username) { mdlErr('Username tidak boleh kosong.'); return; }

      var hak = hakTerpilih();
      var url, body;
      if (edit) {
        url = CFG.updateUrl;
        body = { id: EDIT_ID, username: username, nama: nama, peran: peran, hak: hak };
        if (password !== '') body.password = password;   // kosong = tidak diubah
      } else {
        url = CFG.createUrl;
        body = { username: username, password: password, nama: nama, peran: peran, hak: hak };
      }

      save.disabled = true; save.textContent = 'Menyimpan…';
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b || {} }; });
        })
        .then(function (res) {
          save.disabled = false; save.textContent = lbl;
          if (res.ok && res.body.status === 'ok') {
            // kalau mengubah AKUN SENDIRI: perbarui identitas klien
            if (edit && res.body.self) {
              try {
                if (res.body.username) { localStorage.setItem('magi.actor', res.body.username); AKTOR = res.body.username; }
                if (res.body.peran) localStorage.setItem('magi.peran', res.body.peran);
                if (Array.isArray(res.body.hak)) localStorage.setItem('magi.hak', JSON.stringify(res.body.hak));
              } catch (e) {}
            }
            closeMdl();
            toast('ok', res.body.message || 'Tersimpan.');
            muat();
            return;
          }
          mdlErr(res.body.message || (edit ? 'Gagal menyimpan perubahan.' : 'Gagal membuat akun.'));
        })
        .catch(function (e) {
          save.disabled = false; save.textContent = lbl;
          mdlErr('Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
        });
    });
  }

  function hakSel(u) {
    if (/admin/i.test(u.peran)) return '<span class="badge super">Semua fitur</span>';
    var list = Array.isArray(u.hak) ? u.hak : [];
    if (!list.length) return '<span class="badge na">—</span>';
    var lab = {};
    _fitur.forEach(function (f) { lab[f.key] = f.label; });
    return '<span class="hakchips">' + list.map(function (k) {
      return '<span class="hakchip">' + esc(lab[k] || k) + '</span>';
    }).join('') + '</span>';
  }

  function render(d) {
    if (Array.isArray(d.fitur) && d.fitur.length) _fitur = d.fitur;

    // 1 — pengguna dashboard
    var dash = Array.isArray(d.dashboard) ? d.dashboard : [];
    _dash = dash;
    $('cDash').textContent = dash.length + ' akun';
    $('tbDash').innerHTML = dash.length ? dash.map(function (u) {
      return '<tr>' +
        '<td class="c-id">' + dash_(u.username) + '</td>' +
        '<td class="c-name">' + dash_(u.nama) + '</td>' +
        '<td><span class="badge ' + (/admin/i.test(u.peran) ? 'super' : 'role') + '">' + dash_(u.peran) + '</span></td>' +
        '<td>' + hakSel(u) + '</td>' +
        '<td>' + (u.aktif ? '<span class="badge aktif">aktif</span>' : '<span class="badge kunci">nonaktif</span>') + '</td>' +
        '<td class="c-mono">' + dash_(u.sejak) + '</td>' +
        '<td class="c-mono">' + dash_(u.dibuat_oleh) + '</td>' +
        '<td>' +
          (u.id != null && BOLEH_KELOLA
            ? '<span class="aksi">' +
                '<button class="ebtn" data-edit="' + esc(u.id) + '">✎ Ubah</button>' +
                '<button class="dbtn" data-del="' + esc(u.id) + '" data-user="' + esc(u.username) + '">🗑 Hapus</button>' +
              '</span>'
            : '') +
        '</td>' +
        '</tr>';
    }).join('') : row(8, 'Belum ada pengguna dashboard.');

    // 2 — akun layanan / MySQL
    var svc = Array.isArray(d.layanan) ? d.layanan : [];
    $('cSvc').textContent = svc.length + ' akun';
    $('tbSvc').innerHTML = svc.length ? svc.map(function (a) {
      return '<tr>' +
        '<td class="c-id">' + dash_(a.akun) + '</td>' +
        '<td class="c-mono">' + dash_(a.sistem) + '</td>' +
        '<td><span class="badge ' + (/super/i.test(a.peran) ? 'super' : 'role') + '">' + dash_(a.peran) + '</span></td>' +
        '<td class="c-note">' + dash_(a.untuk) + '</td>' +
        '<td>' + statusBadge(a.status) + '</td>' +
        '<td class="c-mono">' + dash_(a.pw_diubah) + '</td>' +
        '</tr>';
    }).join('') : row(6, 'Tidak ada data akun MySQL (grant SELECT pada mysql.user belum dipasang).');

    // 3 — akun n8n
    var n = d.n8n;
    if (!Array.isArray(n)) {
      $('cN8n').textContent = 'tidak terbaca';
      $('bN8n').innerHTML = '<div class="empty">Daftar akun n8n tidak dapat dibaca dari service. ' +
        'Kelola langsung di <a href="' + esc(CFG.n8nBase) + '" target="_blank" rel="noopener">editor n8n</a>.</div>';
    } else {
      $('cN8n').textContent = n.length + ' akun';
      $('bN8n').innerHTML =
        '<div class="tbl-wrap"><table class="acc"><thead><tr>' +
        '<th>Email</th><th>Nama</th><th>Peran</th><th>MFA</th><th>Dibuat</th><th>Terakhir aktif</th>' +
        '</tr></thead><tbody>' +
        (n.length ? n.map(function (u) {
          return '<tr>' +
            '<td class="c-id">' + dash_(u.email) + '</td>' +
            '<td class="c-name">' + dash_(u.nama) + '</td>' +
            '<td><span class="badge role">' + dash_((u.peran || '').replace('global:', '')) + '</span></td>' +
            '<td>' + (u.mfa ? '<span class="badge aktif">aktif</span>' : '<span class="badge na">nonaktif</span>') + '</td>' +
            '<td class="c-mono">' + dash_(u.dibuat) + '</td>' +
            '<td class="c-mono">' + dash_(u.terakhir_aktif) + '</td>' +
            '</tr>';
        }).join('') : '<tr><td colspan="6" class="empty">Belum ada akun n8n.</td></tr>') +
        '</tbody></table></div>';
    }
  }

  // pembungkus kecil supaya sel kosong -> "—"
  function dash_(v) { return dash(v); }

  function statusBadge(s) {
    s = String(s || '').toLowerCase();
    if (s === 'aktif') return '<span class="badge aktif">aktif</span>';
    if (s === 'terkunci') return '<span class="badge kunci">terkunci</span>';
    if (s.indexOf('kedaluwarsa') >= 0) return '<span class="badge warn">pw kedaluwarsa</span>';
    if (s === 'tidak ada') return '<span class="badge kunci">tidak ada</span>';
    return '<span class="badge na">' + esc(s || '—') + '</span>';
  }

  /* ==========================================================
     STARFIELD — identik dengan index.js/karyawan.js
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

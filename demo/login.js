/* ============================================================
   MAGI//SYSTEM — Login
   ------------------------------------------------------------
   Seluruh style + markup + logika ada di file ini; login.html
   hanya shell kosong berisi <div id="app"> — pola yang sama dengan
   index.js/roster.js/karyawan.js/absen.js/MBR_dasbord.js.

   Autentikasi di SERVER (magi-api /webhook/login, db_mining.app_user,
   scrypt) yang menerbitkan cookie sesi HttpOnly; setiap endpoint lalu
   menegakkan sesi + hak fitur. Flag sessionStorage di sini hanya penjaga
   tampilan (config.js).
   Audit 2026-10-13: 5 gagal per username / 20 per IP dalam 15 menit ->
   dikunci 15 menit (pesan 429 dari server ditampilkan apa adanya), dan
   login dengan password lemah WAJIB mengganti password dulu (form kedua di
   bawah) — server menolak semua endpoint lain sampai diganti.

   Isi:
     1. KONFIG        — kredensial permulaan + halaman tujuan setelah login
     2. STYLE          — tema "warm space", SAMA seperti halaman lain
     3. MARKUP         — logo NERV + kartu login
     4. STARFIELD      — latar bintang (canvas), disalin dari index.js
     5. LOGIKA         — validasi form, sesi, redirect
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  // Kredensial diperiksa di SERVER: POST ke magi-api /webhook/login yang
  // mencocokkan ke tabel db_mining.app_user (password scrypt). Akun lain
  // didaftarkan dari halaman Akses. Lihat "Pengembangan - Registrasi Akun Dashboard".
  var LOGIN_URL = (window.MAGI && MAGI.url) ? MAGI.url('/webhook/login') : '/webhook/login';
  var GANTI_URL = (window.MAGI && MAGI.url) ? MAGI.url('/webhook/ganti-password') : '/webhook/ganti-password';

  // hanya halaman yang memang ada yang boleh jadi tujuan redirect,
  // supaya ?next= tidak bisa dipakai mengarahkan ke sembarang alamat
  var HALAMAN = ['index.html', 'MBR_dasbord.html', 'roster.html', 'karyawan.html', 'absen.html',
    'akses.html', 'todo.html', 'afl.html', 'simper.html', 'apd.html',
    'warning.html'];
  function tujuan() {
    var n = new URLSearchParams(location.search).get('next') || '';
    n = n.split('/').pop();
    return HALAMAN.indexOf(n) >= 0 ? n : 'index.html';
  }

  /* ==========================================================
     2. STYLE — token & palet SAMA PERSIS dengan index.js dkk.
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

    '.wrap{position:relative;z-index:1;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px}',

    '.nerv{width:min(78vw,340px);height:auto;display:block;margin:0 auto 6px;filter:drop-shadow(0 0 22px rgba(226,59,50,.25))}',
    '.brand2{text-align:center;margin-bottom:30px}',
    '.brand2 .logo{font-size:22px;font-weight:800;letter-spacing:.14em;color:var(--cream)}',
    '.brand2 .logo b{color:var(--orange);font-weight:800}',
    '.brand2 .sub{font-family:var(--mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--cream-mute);margin-top:5px}',

    '.card{width:min(92vw,380px);border:1px solid var(--line);border-radius:16px;',
    '  background:linear-gradient(180deg,var(--panel),var(--panel2));box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden}',
    '.card-head{padding:16px 22px;border-bottom:1px solid var(--line);',
    '  background:linear-gradient(90deg,rgba(255,106,31,.10),transparent)}',
    '.card-head h1{margin:0;font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--cream)}',
    '.card-body{padding:22px}',

    '.field{margin-bottom:16px}',
    '.field label{display:block;font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--cream-mute);margin-bottom:7px}',
    '.inp{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--cream);background:rgba(244,234,219,.04);',
    '  border:1px solid var(--line);border-radius:9px;padding:11px 13px;transition:.15s}',
    '.inp::placeholder{color:var(--cream-mute)}',
    '.inp:focus{outline:none;border-color:var(--line-strong);box-shadow:0 0 0 3px rgba(255,106,31,.12)}',

    '.err{display:none;font-family:var(--mono);font-size:11px;color:var(--crit);background:rgba(226,59,50,.10);',
    '  border:1px solid rgba(226,59,50,.35);border-radius:9px;padding:9px 12px;margin-bottom:16px}',
    '.err.on{display:block}',

    '.btn{width:100%;font-family:var(--mono);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid transparent;border-radius:9px;padding:12px 18px;transition:.15s;',
    '  background:linear-gradient(180deg,var(--orange),var(--rust));color:#1a0e06;font-weight:700}',
    '.btn:hover:not(:disabled){filter:brightness(1.1);box-shadow:var(--glow)}',
    '.btn:disabled{opacity:.5;cursor:not-allowed}',

    '.card.shake{animation:shk .34s}',
    '@keyframes shk{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}',
    '  30%,50%,70%{transform:translateX(-5px)}40%,60%{transform:translateX(5px)}}',

    '.foot{margin-top:22px;font-family:var(--mono);font-size:10px;color:var(--cream-mute);text-align:center;letter-spacing:.04em}',

    '@media (prefers-reduced-motion: reduce){.card.shake{animation:none}}',
  ].join('');

  /* ==========================================================
     3. MARKUP — logo NERV (palet warm-space, bukan warna aslinya)
     ========================================================== */
  var NERV =
    '<svg class="nerv" viewBox="0 0 380 128" role="img" aria-label="NERV">' +
      '<g transform="translate(96,106)">' +
        '<g fill="#E23B32">' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(12)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-6)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-24)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-42)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-60)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-78)"/>' +
          '<path d="M0,0 C -7,-24 -4,-50 0,-70 C 4,-50 7,-24 0,0 Z" transform="rotate(-96)"/>' +
        '</g>' +
        '<g stroke="#0a0806" stroke-width="2.6" stroke-linecap="round">' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(12)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-6)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-24)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-42)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-60)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-78)"/>' +
          '<line x1="0" y1="0" x2="0" y2="-60" transform="rotate(-96)"/>' +
        '</g>' +
      '</g>' +
      '<text x="150" y="78" font-family="Georgia,\'Times New Roman\',serif" font-size="64" font-weight="700" fill="#F4EADB" letter-spacing="3">NERV</text>' +
      '<line x1="150" y1="90" x2="368" y2="90" stroke="#E23B32" stroke-width="2"/>' +
      '<text x="150" y="108" font-family="Georgia,\'Times New Roman\',serif" font-size="10.5" fill="#bfae9a" letter-spacing=".5" textLength="216" lengthAdjust="spacingAndGlyphs">GOD’S IN HIS HEAVEN. ALL’S RIGHT WITH THE WORLD.</text>' +
    '</svg>';

  var HTML = [
    '<canvas id="stars"></canvas>',
    '<div class="wrap">',
      NERV,
      '<div class="brand2"><div class="logo">MAGI<b>//</b>SYSTEM</div>',
      '<div class="sub">Mining Operations · Autentikasi Diperlukan</div></div>',

      '<form class="card" id="loginForm" autocomplete="off" novalidate>',
        '<div class="card-head"><h1>Akses Sistem</h1></div>',
        '<div class="card-body">',
          '<div class="err" id="errBox">Username atau password salah.</div>',
          '<div class="field"><label for="fUser">Username</label>',
            '<input class="inp" id="fUser" name="username" type="text" placeholder="username" autocomplete="username" autofocus></div>',
          '<div class="field"><label for="fPass">Password</label>',
            '<input class="inp" id="fPass" name="password" type="password" placeholder="••••••••" autocomplete="current-password"></div>',
          '<button class="btn" type="submit" id="btnMasuk">Masuk</button>',
        '</div>',
      '</form>',

      '<div class="foot">MAGI//SYSTEM · Mining Operations Control</div>',
    '</div>',
  ].join('');

  document.addEventListener('DOMContentLoaded', function () {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    document.getElementById('app').innerHTML = HTML;
    starfield();
    wireForm();
    // sudah login (mis. tab lain) -> jangan tahan di sini
    try {
      if (sessionStorage.getItem('magi.auth') === '1') location.replace('./' + tujuan());
    } catch (e) {}
  });

  /* ==========================================================
     4. STARFIELD — identik dengan index.js, disalin supaya
        login.js berdiri sendiri (tidak memuat config.js/index.js)
     ========================================================== */
  function starfield() {
    // Digambar SEKALI, ulang hanya saat ukuran jendela berubah. Dulu dianimasikan
    // dengan requestAnimationFrame: canvas selayar penuh digambar ulang 60x/detik
    // tanpa henti, memakan >1 inti CPU di komputer klien (diukur 2026-10-25).
    // Sama dengan latar MBR_dasbord.js.
    var cv = document.getElementById('stars'), ctx = cv.getContext('2d'), tunda = null;
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

  /* ==========================================================
     5. LOGIKA
     ========================================================== */
  function wireForm() {
    var form = document.getElementById('loginForm');
    var card = form; // form ITU kartunya (class "card")
    var errBox = document.getElementById('errBox');
    var btn = document.getElementById('btnMasuk');
    var busy = false;

    function gagal(msg) {
      errBox.textContent = msg || 'Username atau password salah.';
      errBox.classList.add('on');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      document.getElementById('fPass').value = '';
      document.getElementById('fPass').focus();
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (busy) return;
      var u = document.getElementById('fUser').value.trim();
      var p = document.getElementById('fPass').value;
      if (!u || !p) { gagal('Isi username dan password.'); return; }

      busy = true; btn.disabled = true; btn.textContent = 'Memeriksa…';

      fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',   // terima Set-Cookie sesi (magi_sess)
        body: JSON.stringify({ username: u, password: p }),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            return { ok: r.ok, body: body || {} };
          });
        })
        .then(function (res) {
          if (res.ok && res.body.ok && res.body.lemah) {
            // password lemah: sesi sudah terbit tapi server hanya mengizinkan
            // ganti-password — minta password baru dulu, baru masuk
            simpanAkun(res.body, u);
            mintaGanti(p, res.body.username || u);
            return;
          }
          if (res.ok && res.body.ok) {
            try {
              sessionStorage.setItem('magi.auth', '1');
              localStorage.setItem('magi.actor', res.body.username || u);   // tampilan saja; audit memakai cookie sesi
              if (res.body.peran) localStorage.setItem('magi.peran', res.body.peran);
              // fitur Konsol Misi yang boleh dilihat (Administrator = semua)
              localStorage.setItem('magi.hak', JSON.stringify(Array.isArray(res.body.hak) ? res.body.hak : []));
            } catch (e) {}
            btn.textContent = 'Membuka…';
            location.replace('./' + tujuan());
            return;
          }
          busy = false; btn.disabled = false; btn.textContent = 'Masuk';
          gagal(res.body.message || 'Username atau password salah.');
        })
        .catch(function (e) {
          busy = false; btn.disabled = false; btn.textContent = 'Masuk';
          gagal('Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
        });
    });

    // ketikan baru -> sembunyikan pesan galat lama
    form.addEventListener('input', function () { errBox.classList.remove('on'); });
  }

  function simpanAkun(body, u) {
    try {
      localStorage.setItem('magi.actor', body.username || u);
      if (body.peran) localStorage.setItem('magi.peran', body.peran);
      localStorage.setItem('magi.hak', JSON.stringify(Array.isArray(body.hak) ? body.hak : []));
    } catch (e) {}
  }

  /* Form kedua: ganti password lemah (bawaan "admin", sama dengan username,
     < 8 karakter, password umum). Password lama = yang barusan diketik. */
  function mintaGanti(lama, username) {
    var form = document.getElementById('loginForm');
    var errBox = document.getElementById('errBox');
    var fields = form.querySelectorAll('.field');
    Array.prototype.forEach.call(fields, function (f) { f.style.display = 'none'; });
    var btnLama = document.getElementById('btnMasuk');
    btnLama.style.display = 'none';

    var box = document.createElement('div');
    box.innerHTML =
      '<div class="field"><label>Password terlalu mudah ditebak</label>' +
      '<div style="font-size:12px;line-height:1.5;color:#bfae9a;margin-bottom:6px">Akun <b></b> memakai password ' +
      'lemah. Ganti dulu sebelum masuk — minimal 8 karakter, bukan username dan bukan password umum.</div></div>' +
      '<div class="field"><label for="fBaru">Password baru</label>' +
      '<input class="inp" id="fBaru" type="password" autocomplete="new-password"></div>' +
      '<div class="field"><label for="fUlang">Ulangi password baru</label>' +
      '<input class="inp" id="fUlang" type="password" autocomplete="new-password"></div>' +
      '<button class="btn" type="button" id="btnGanti">Simpan &amp; masuk</button>';
    box.querySelector('b').textContent = username;
    btnLama.parentNode.appendChild(box);
    errBox.classList.remove('on');
    document.getElementById('fBaru').focus();

    var sibuk = false;
    function salah(msg) { errBox.textContent = msg; errBox.classList.add('on'); }
    function kirim() {
      if (sibuk) return;
      var baru = document.getElementById('fBaru').value;
      var ulang = document.getElementById('fUlang').value;
      if (baru.length < 8) { salah('Password baru minimal 8 karakter.'); return; }
      if (baru !== ulang) { salah('Kedua isian password baru tidak sama.'); return; }
      sibuk = true;
      var b = document.getElementById('btnGanti');
      b.disabled = true; b.textContent = 'Menyimpan…';
      fetch(GANTI_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ lama: lama, baru: baru }),
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j || {} }; }); })
        .then(function (res) {
          if (res.ok && res.body.ok) {
            try { sessionStorage.setItem('magi.auth', '1'); } catch (e) {}
            b.textContent = 'Membuka…';
            location.replace('./' + tujuan());
            return;
          }
          sibuk = false; b.disabled = false; b.textContent = 'Simpan & masuk';
          salah(res.body.message || 'Gagal mengganti password.');
        })
        .catch(function (e) {
          sibuk = false; b.disabled = false; b.textContent = 'Simpan & masuk';
          salah('Tidak bisa menghubungi server (' + (e && e.message ? e.message : e) + ').');
        });
    }
    document.getElementById('btnGanti').addEventListener('click', kirim);
    ['fBaru', 'fUlang'].forEach(function (id) {
      document.getElementById(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); kirim(); }
      });
    });
  }
})();

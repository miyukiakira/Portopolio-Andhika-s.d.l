/* config.js — satu-satunya tempat alamat backend ditentukan.
   Dimuat SEBELUM berkas halaman di tiap shell HTML.

   Dua bentuk penyajian yang harus sama-sama jalan:
     - di balik reverse proxy  -> https://magi.lan/...      (port kosong)
       dashboard & webhook satu origin, jadi path RELATIF sudah benar.
     - langsung dari busybox   -> http://<host>:8088/...
       n8n ada di host yang sama pada :5678.

   Basisnya dihitung saat runtime, BUKAN ditulis mati sebagai magi.lan.
   Alasannya diagnosis: kalau Caddy yang rusak, dashboard masih terjangkau
   langsung di :8088 lewat SSH tunnel — dengan alamat tertulis-mati, halaman
   yang dipakai mendiagnosis ikut mati bersama hal yang sedang didiagnosis.
   (Alasan aslinya "laptop cadangan" gugur pada 2026-08-25 saat pindahan
   diputuskan satu arah; hasilnya tetap sama dan tidak boleh dibongkar.)

   Semua panggilan /webhook/* menuju service "magi-api" (:3000), bukan
   langsung n8n. magi-api menangani endpoint dashboard sendiri dan hanya
   mem-proxy mbr-run, roster-import, webhook-waiting/* (Approve MBR) dan
   /healthz ke n8n — masing-masing dengan pengecekan sesi + hak fitur.
   Catatan: mode langsung :8088 praktis hanya untuk diagnosis — cookie sesi
   ber-atribut Secure tidak terkirim lewat http, jadi data tetap butuh Caddy. */

/* Gerbang tampilan — dimuat SEBELUM berkas halaman mana pun.
   Ini hanya penjaga "jangan render": flag sessionStorage + hak fitur di
   localStorage (diisi login.js). Penegakan SESUNGGUHNYA ada di magi-api:
   cookie sesi HttpOnly (Keamanan Tahap 1, 2026-09-07) dan hak fitur per
   endpoint (audit 2026-10-13) — mengakali gerbang ini hanya menghasilkan
   halaman kosong yang dijawab 401/403 oleh server. */
(function authGuard() {
  'use strict';
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'login.html') return;               // halaman login sendiri: lolos

  var authed = false;
  try { authed = sessionStorage.getItem('magi.auth') === '1'; } catch (e) {}
  if (!authed) {
    location.replace('./login.html?next=' + encodeURIComponent(page));
    return;                                          // hentikan config.js di sini —
  }                                                   // MAGI tak perlu disiapkan untuk halaman yang tak jadi tampil

  // Gerbang per-fitur: kalau halaman ini butuh fitur yang tidak dimiliki
  // akun (dan bukan Administrator), pentalkan ke landing page. Daftar
  // fitur & pemetaannya sama dengan tombol Konsol Misi di index.js.
  // Sesi lama (belum punya magi.peran) di-grandfather = boleh semua.
  var HAL_FITUR = {
    'MBR_dasbord.html': 'mbr',
    'roster.html': 'edit-roster',
    'karyawan.html': 'karyawan',
    'absen.html': 'absen',
    'akses.html': 'akses',
    'todo.html': 'todo',
    'afl.html': 'afl',
    'simper.html': 'simper',
    'apd.html': 'apd',
    'warning.html': 'warning'
  };
  var perluFitur = HAL_FITUR[page];
  if (perluFitur) {
    var peran = '', hak = null;
    try {
      peran = localStorage.getItem('magi.peran') || '';
      hak = JSON.parse(localStorage.getItem('magi.hak') || 'null');
    } catch (e) {}
    var bolehSemua = (peran === '' || peran === 'Administrator');   // '' = sesi lama
    if (!bolehSemua && (!Array.isArray(hak) || hak.indexOf(perluFitur) < 0)) {
      location.replace('./index.html');
      return;
    }
  }

  // Tombol keluar mengambang — gaya inline (berkas style halaman belum
  // tentu sudah termuat saat baris ini jalan, config.js dimuat lebih dulu).
  document.addEventListener('DOMContentLoaded', function () {
    var who = '';
    try { who = localStorage.getItem('magi.actor') || ''; } catch (e) {}
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = '⎋ Keluar' + (who ? ' · ' + who : '');
    b.setAttribute('aria-label', 'Keluar dari MAGI//SYSTEM');
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;' +
      'font:600 10px/1 "DejaVu Sans Mono",monospace;letter-spacing:.08em;text-transform:uppercase;' +
      'color:#bfae9a;background:rgba(10,8,6,.72);border:1px solid rgba(244,234,219,.14);' +
      'border-radius:999px;padding:8px 14px;cursor:pointer;backdrop-filter:blur(2px)';
    b.onmouseenter = function () { b.style.color = '#F4EADB'; b.style.borderColor = 'rgba(255,106,31,.38)'; };
    b.onmouseleave = function () { b.style.color = '#bfae9a'; b.style.borderColor = 'rgba(244,234,219,.14)'; };
    b.onclick = function () {
      // hapus cookie sesi di server (token stateless — server cukup meng-clear cookie)
      try {
        if (navigator.sendBeacon) navigator.sendBeacon('./webhook/logout');
        else fetch('./webhook/logout', { method: 'POST', keepalive: true });
      } catch (e) {}
      try { sessionStorage.removeItem('magi.auth'); } catch (e) {}
      location.href = './login.html';
    };
    document.body.appendChild(b);
  });
})();

/* Interceptor 401 — 2026-09-07 Keamanan Tahap 1.
   Sejak magi-api mewajibkan cookie sesi di setiap /webhook/*, sesi yang
   kedaluwarsa/dicabut membuat panggilan data menjawab 401. Bungkus fetch
   supaya begitu itu terjadi, pengguna dilempar ke halaman login (bukan
   dibiarkan melihat halaman kosong yang gagal memuat diam-diam).
   Ini enforcement sisi-klien yang sebenarnya sekarang; flag sessionStorage
   di authGuard tinggal penjaga "jangan render" saja.
   403 TIDAK dialihkan — itu "login sah tapi tak berhak" (mis. Operator
   menyentuh endanya Administrator); biar halaman yang menampilkan pesannya. */
(function fetchGuard() {
  'use strict';
  if (typeof window.fetch !== 'function') return;
  var page = location.pathname.split('/').pop() || 'index.html';
  if (page === 'login.html') return;
  var asli = window.fetch.bind(window);
  window.fetch = function (input, init) {
    return asli(input, init).then(function (r) {
      if (r.status === 401) {
        try { sessionStorage.removeItem('magi.auth'); } catch (e) {}
        location.replace('./login.html?next=' + encodeURIComponent(page));
      }
      return r;
    });
  };
})();

(function () {
  'use strict';
  var host = location.protocol + '//' + location.hostname;
  var base = (location.port === '8088')
    ? host + ':3000'                       // magi-api (CRUD + proxy ke n8n)
    : '';                                  // satu origin (di balik proxy) -> path relatif

  // Username akun yang sedang login (diisi login.js) — HANYA untuk tampilan
  // (tombol Keluar, saringan "saya" di To Do List). Identitas untuk audit_log
  // diambil server dari cookie sesi, tidak pernah dari sini. Parameter URL
  // ?actor= dan header X-Actor dibuang pada audit 2026-10-13.
  var actor;
  try { actor = localStorage.getItem('magi.actor') || ''; } catch (e) { actor = ''; }

  window.MAGI = {
    n8nBase: base,
    url: function (path) { return base + path; },
    // Editor n8n TIDAK lewat magi-api/Caddy: ssh -L 5678:127.0.0.1:5678
    // lalu buka http://localhost:5678 di laptop sendiri.
    editorUrl: 'http://localhost:5678',
    actor: actor
  };
})();

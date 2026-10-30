/* ============================================================
   MAGI//SYSTEM — MODE DEMO · util.js
   ------------------------------------------------------------
   Versi portofolio dashboard ini berjalan TANPA server: magi-api,
   MySQL dan n8n digantikan "backend tiruan" di browser (api.js) yang
   membaca/menulis database dummy di localStorage.

   Berkas ini: alat bersama — tanggal, PRNG ber-seed, SHA-256, dan
   penyimpanan database dummy (muat / simpan / reset / geser tanggal).

   Urutan muat di tiap shell HTML (SEBELUM config.js):
     util.js → seed.js → pdf.js → api.js → ui.js → config.js → <halaman>.js
   ============================================================ */
(function () {
  'use strict';
  var D = window.MAGI_DEMO = window.MAGI_DEMO || {};

  D.VERSI = 3;                          // naikkan bila bentuk database dummy berubah
  D.KUNCI_DB = 'magi.demo.db';
  D.KUNCI_SESI = 'magi.demo.sesi';
  D.KUNCI_GAGAL = 'magi.demo.gagal';

  /* ---------------- tanggal ('YYYY-MM-DD', jam lokal browser) ---------------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  D.p2 = p2;
  D.ymd = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  D.hariIni = function () { return D.ymd(new Date()); };
  var RE_TGL = /^(\d{4})-(\d{2})-(\d{2})$/;
  D.isDate = function (s) {
    var m = RE_TGL.exec(String(s || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  };
  /* 'YYYY-MM-DD' <-> nomor hari (UTC), di-cache: roster, AFL dan crosscek
     memanggil geser()/selisih() puluhan ribu kali per permintaan */
  var _keN = new Map(), _dariN = new Map();
  function keN(s) {
    var v = _keN.get(s);
    if (v === undefined) {
      var m = RE_TGL.exec(s);
      v = m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN;
      _keN.set(s, v);
    }
    return v;
  }
  function dariN(n) {
    var v = _dariN.get(n);
    if (v === undefined) { v = new Date(n * 86400000).toISOString().slice(0, 10); _dariN.set(n, v); }
    return v;
  }
  D.geser = function (s, n) {
    var k = keN(String(s || ''));
    return isNaN(k) ? '' : dariN(k + n);
  };
  /* selisih hari b - a */
  D.selisih = function (a, b) { return keN(String(b)) - keN(String(a)); };
  /* + n bulan, tanggal dijepit ke akhir bulan (= DATE_ADD MySQL: 31 Jan + 1 bln = 28 Feb) */
  D.tambahBulan = function (s, n) {
    var m = RE_TGL.exec(s);
    var total = (+m[2] - 1) + n;
    var y = +m[1] + Math.floor(total / 12), bl = ((total % 12) + 12) % 12;
    var akhir = new Date(Date.UTC(y, bl + 1, 0)).getUTCDate();
    return y + '-' + p2(bl + 1) + '-' + p2(Math.min(+m[3], akhir));
  };
  D.akhirBulan = function (s) {
    var m = RE_TGL.exec(s);
    return new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10);
  };
  D.awalBulan = function (s) { return s.slice(0, 8) + '01'; };
  /* jam lokal pada tanggal tertentu -> ms */
  D.pada = function (s, jam, menit, detik) {
    var m = RE_TGL.exec(s);
    return new Date(+m[1], +m[2] - 1, +m[3], jam || 0, menit || 0, detik || 0).getTime();
  };
  /* ms -> 'YYYY-MM-DD HH:MM' / 'YYYY-MM-DD HH:MM:SS' (jam lokal, = DATE_FORMAT MySQL WIB) */
  D.jamMenit = function (ms) {
    var d = new Date(ms);
    return D.ymd(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  D.jamDetik = function (ms) {
    var d = new Date(ms);
    return D.jamMenit(ms) + ':' + p2(d.getSeconds());
  };
  D.iso = function (ms) { return new Date(ms).toISOString(); };

  /* ---------------- PRNG ber-seed (mulberry32) ---------------- */
  D.rng = function (seed) {
    var a = seed >>> 0;
    function r() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    r.int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    r.chance = function (p) { return r() < p; };
    /* pilih berbobot: [[nilai, bobot], ...] */
    r.bobot = function (daftar) {
      var tot = 0, i;
      for (i = 0; i < daftar.length; i++) tot += daftar[i][1];
      var x = r() * tot;
      for (i = 0; i < daftar.length; i++) { x -= daftar[i][1]; if (x < 0) return daftar[i][0]; }
      return daftar[daftar.length - 1][0];
    };
    r.acak = function (arr) {
      var a2 = arr.slice();
      for (var i = a2.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a2[i]; a2[i] = a2[j]; a2[j] = t; }
      return a2;
    };
    return r;
  };

  /* ---------------- SHA-256 (sinkron, tanpa SubtleCrypto) ----------------
     Pengganti scrypt di magi-api asli — cukup untuk demo: password akun
     demo tidak pernah disimpan polos di localStorage. */
  D.sha256 = function (teks) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var bytes = unescape(encodeURIComponent(String(teks)));
    var l = bytes.length, words = [], i;
    for (i = 0; i < l; i++) words[i >> 2] |= (bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[(((l + 8) >> 6) << 4) + 15] = l * 8;
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var j = 0; j < words.length; j += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = words[j + i] | 0;
        else {
          var s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
          var s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  };
  D.hashPassword = function (pw, salt) {
    salt = salt || Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
    return { algo: 'sha256-demo', salt: salt, hash: D.sha256(salt + ':' + pw) };
  };
  D.cekPassword = function (pw, salt, hash) { return D.sha256(salt + ':' + pw) === hash; };

  /* ---------------- geser tanggal database ----------------
     Database dummy dibuat relatif terhadap "hari ini" (db.base). Saat
     dibuka di hari lain, SEMUA nilai tanggal digeser sebanyak selisihnya —
     skenario (roster, cuti bulan depan, SIMPER yang segera habis, AFL yang
     menunggu cetak, ...) tetap terasa "hari ini" tanpa membuang perubahan
     yang dibuat pengunjung. */
  var RE_DT = /^(\d{4}-\d{2}-\d{2})([ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z)?)?$/;
  function geserNilai(v, n) {
    if (typeof v !== 'string' || v.length < 10 || v.length > 24) return v;
    var m = RE_DT.exec(v);
    if (!m || !D.isDate(m[1])) return v;
    if (m[2] && /Z$/.test(m[2])) return new Date(Date.parse(v) + n * 86400000).toISOString();
    return D.geser(m[1], n) + (m[2] || '');
  }
  function jalan(o, n) {
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) o[i] = (o[i] && typeof o[i] === 'object') ? jalan(o[i], n) : geserNilai(o[i], n);
      return o;
    }
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      o[k] = (v && typeof v === 'object') ? jalan(v, n) : geserNilai(v, n);
    });
    return o;
  }
  D.geserDb = function (db, n) { if (n) jalan(db, n); return db; };

  /* ---------------- penyimpanan ---------------- */
  var _db = null;
  D.muat = function () {
    if (_db) return _db;
    var hari = D.hariIni(), db = null;
    try { db = JSON.parse(localStorage.getItem(D.KUNCI_DB) || 'null'); } catch (e) { db = null; }
    if (!db || db.v !== D.VERSI || !D.isDate(db.base)) {
      db = D.seed(hari);
      D._baru = true;
      _db = db;
      D.simpan();
    } else if (db.base !== hari) {
      var n = D.selisih(db.base, hari);
      D.geserDb(db, n);
      db.base = hari;
      _db = db;
      D.simpan();
    }
    _db = db;
    return _db;
  };
  D.simpan = function () {
    if (!_db) return;
    try { localStorage.setItem(D.KUNCI_DB, JSON.stringify(_db)); }
    catch (e) {
      // kuota penuh: buang jejak audit tertua lalu coba lagi
      try {
        _db.audit = _db.audit.slice(-300);
        localStorage.setItem(D.KUNCI_DB, JSON.stringify(_db));
      } catch (e2) { console.warn('[demo] database tidak tersimpan:', e2); }
    }
  };
  /* tab lain mengubah database -> pakai versi terbaru */
  window.addEventListener('storage', function (e) {
    if (e.key === D.KUNCI_DB) _db = null;
  });
  /* hapus SEMUA data demo di browser ini (database, sesi, notifikasi, pilihan tampilan) */
  D.reset = function () {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('magi.') === 0) localStorage.removeItem(k);
      }
      sessionStorage.removeItem('magi.auth');
    } catch (e) {}
    _db = null;
  };
})();

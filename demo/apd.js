/* ============================================================
   MAGI//SYSTEM — APD (Alat Pelindung Diri)
   ------------------------------------------------------------
   Markup + logika ada di file ini; gaya di apd.css;
   apd.html hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur (meniru AFL, tanpa jadwal):
     1. Panel 01 Input APD — cari karyawan (nama / ID HO), centang
        satu atau beberapa APD dari daftar master, "Tambah ke
        Antrean". Satu APD = satu baris karyawan_apd; semua tanggal
        dan centang safety/warehouse masih kosong.
        Daftar master APD dikelola di bagian "Kelola daftar APD".
     2. Panel 02 Antrean Cetak — semua baris yang tgl_diajukan-nya
        masih kosong (dari semua pengguna). Centang yang akan
        dicetak; ✕ menghapus baris yang salah input.
     3. Panel 03 Cetak APD (kanan) — tombol Cetak mengirim baris yang
        dicentang ke magi-api (hanya id baris; datanya dibaca ulang
        dari database dan dikelompokkan per karyawan). Workflow n8n
        "APD" mengisi form "Permintaan Peralatan Keselamatan" (docx
        pemilik di Google Drive) satu per karyawan dan membalas satu
        PDF -> popup Buka PDF / Unduh.

     4. Panel 04 Data APD Karyawan (bawah, selebar halaman) — semua
        APD yang tercatat (antrean, diajukan, diambil, dikembalikan)
        dengan pencarian nama / ID HO. Ceklis per baris yang sudah
        diajukan: Safety → Warehouse → tanggal Diambil (tersimpan
        langsung). EXP & lama pakai dihitung magi-api dari tanggal
        diambil; baris merah = sudah EXP, kuning = hampir EXP, hijau =
        ceklis lengkap. Tanggal dikembalikan diisi saat APD lama
        dikembalikan (mis. penggantian) — baris jadi riwayat (tanpa
        warna, lama pakai berhenti); untuk membetulkan Diambil,
        kosongkan Dikembalikan dulu.

   Sesudah PDF jadi, magi-api mengisi tgl_diajukan = hari ini, jadi
   baris yang dicetak keluar dari antrean. Tanda "dikirim" (dari
   audit_log) hanya muncul kalau PDF jadi tapi tanggalnya gagal
   disimpan — supaya tidak tercetak dua kali tanpa sadar.

   Centang disimpan di memori halaman saja (bawaan tidak ada yang
   dicentang) dan bertahan saat data dimuat ulang.

   Sumber (magi-api, routes/apd.js; semua butuh hak fitur 'apd'):
     GET  apd-list           master APD + antrean + riwayat kirim
     GET  apd-data?q=        semua APD tercatat (panel 04) + EXP, lama pakai, warna
     POST apd-ceklis         {id_kar_apd, safety?|warehouse?|tgl_diambil?|tgl_dikembalikan?} (panel 04)
     GET  apd-karyawan?q=    cari karyawan aktif
     POST apd-tambah         {id_ho, apd:[id_apd,...]}
     POST apd-hapus          {id_kar_apd}
     POST apd-master-tambah  {nama_apd, tipe_apd}
     POST apd-master-hapus   {id_apd}
     POST apd-cetak          {pilih:[id_kar_apd,...]} -> PDF
                             (header X-Magi-Diajukan = baris yang diberi tgl_diajukan)
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    homePage: './index.html',
    listUrl: MAGI.url('/webhook/apd-list'),
    dataUrl: MAGI.url('/webhook/apd-data'),
    ceklisUrl: MAGI.url('/webhook/apd-ceklis'),
    cariUrl: MAGI.url('/webhook/apd-karyawan'),
    tambahUrl: MAGI.url('/webhook/apd-tambah'),
    hapusUrl: MAGI.url('/webhook/apd-hapus'),
    masterTambahUrl: MAGI.url('/webhook/apd-master-tambah'),
    masterHapusUrl: MAGI.url('/webhook/apd-master-hapus'),
    cetakUrl: MAGI.url('/webhook/apd-cetak'),
    namaMaks: 8   // nama karyawan yang dirinci di papan Cetak
  };

  /* ==========================================================
     2. MARKUP
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
    '<div class="sub">APD · Alat Pelindung Diri</div></div>',
    '<div class="hud-spacer"></div>',
    '<button class="rfr" id="btnRefresh" type="button">↻ Perbarui</button>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">memuat…</span></div>',
    '</header>',

    '<div class="lead"><b>1. Input</b> — pilih karyawan, centang APD yang diajukan, lalu <b>Tambah ke Antrean</b>. ',
    '<b>2. Antrean Cetak</b> — semua pengajuan yang <b>belum punya tanggal diajukan</b>; centang yang akan dicetak. ',
    '<b>3. Cetak</b> — tombol di kanan menyusun form <b>Permintaan Peralatan Keselamatan</b> (PDF, satu halaman per karyawan); yang dicetak diberi tanggal diajukan hari ini dan keluar dari antrean.</div>',

    '<div class="deck">',

    /* ---- 01 input ---- */
    '<section class="panel" id="pInput"><div class="p-head"><span class="idx">01</span><h2>Input APD</h2></div>',
    '<div class="p-body">',
    '<div class="sub-h">Karyawan</div>',
    '<div class="cari"><input class="inp" id="fCari" type="text" maxlength="100" placeholder="nama atau ID HO" autocomplete="off" spellcheck="false" aria-label="Nama atau ID HO karyawan">',
    '<button class="btn" id="btnCari" type="button">Cari</button></div>',
    '<div id="karBox"><div class="hint">Ketik nama atau ID HO — lengkap atau sebagian — lalu tekan Cari. Hanya karyawan aktif (tanpa DOT).</div></div>',
    '<div class="sub-h">APD yang diajukan</div>',
    '<div class="cekl" id="apdCek"><div class="none">Memuat daftar APD…</div></div>',
    '<div class="aksi"><button class="btn primary" id="btnTambah" type="button" disabled>＋ Tambah ke Antrean</button></div>',
    '<details class="kelola" id="kelola"><summary id="kelolaSum">Kelola daftar APD</summary>',
    '<form class="mform" id="fMaster" novalidate>',
    '<input class="fin" id="mNama" maxlength="50" placeholder="Nama APD *" aria-label="Nama APD" autocomplete="off">',
    '<input class="fin" id="mTipe" maxlength="50" placeholder="Tipe (opsional)" aria-label="Tipe APD" autocomplete="off">',
    '<button class="btn" id="btnMaster" type="submit">＋ Tambah APD ke daftar</button>',
    '</form>',
    '<ul class="mlist" id="mList"></ul>',
    '</details>',
    '</div></section>',

    /* ---- 02 antrean ---- */
    '<section class="panel" id="pAntre"><div class="p-head"><span class="idx">02</span><h2>Antrean Cetak</h2>',
    '<span class="spacer"></span><span class="cnt" id="aCnt"></span>',
    '<button class="act" id="btnBelum" type="button" title="Centang semua baris yang belum pernah dicetak">Centang yang belum dikirim</button></div>',
    '<div class="tbl"><table class="antre"><thead><tr>',
    '<th class="c-pilih"><label class="pilih-k" title="Centang / lepas semua"><input type="checkbox" id="pilihSemua" aria-label="Centang semua"></label></th>',
    '<th class="c-no">No</th><th>Karyawan</th><th>APD</th><th class="c-st">Status</th><th class="c-a"><span class="sr">Aksi</span></th>',
    '</tr></thead><tbody id="aTb"><tr><td colspan="6" class="empty">Memuat…</td></tr></tbody></table></div>',
    '</section>',

    /* ---- 03 cetak ---- */
    '<section class="panel" id="pCetak"><div class="p-head"><span class="idx">03</span><h2>Cetak APD</h2></div>',
    '<div class="g-body">',
    '<div class="stat" id="stat"><span class="dot" id="statDot"></span>',
    '<div><div class="t" id="statT">Belum ada yang dicentang</div><div class="s" id="statS">centang baris di Antrean Cetak</div></div></div>',
    '<dl class="kv"><dt>APD</dt><dd id="cJml">0</dd><dt>Karyawan</dt><dd id="cKar">0</dd></dl>',
    '<ul class="nlist" id="cNama"></ul>',
    '<div id="cNote"></div>',
    '<div class="dispatch"><button class="btn primary" id="btnCetak" type="button" disabled>🖨 Cetak</button></div>',
    '<div class="g-foot">Form disusun workflow n8n <b>APD</b> dari docx <b>Permintaan_Peralatan_Keselamatan</b> di Google Drive (±6 detik per karyawan, maks. 30 karyawan sekali cetak). Sesudah PDF jadi, baris yang dicetak diberi <b>tanggal diajukan</b> hari ini.</div>',
    '<div class="rw" id="riwayat"></div>',
    '</div></section>',

    '</div>',

    /* ---- 04 data APD karyawan ---- */
    '<section class="panel" id="pData"><div class="p-head"><span class="idx">04</span><h2>Data APD Karyawan</h2>',
    '<span class="spacer"></span><span class="cnt" id="dCnt"></span></div>',
    '<div class="p-body">',
    '<form class="cari-data" id="fData" role="search" novalidate>',
    '<input class="inp" id="dCari" type="search" maxlength="100" placeholder="cari nama atau ID HO karyawan" autocomplete="off" spellcheck="false" aria-label="Cari data APD per nama atau ID HO karyawan">',
    '<button class="btn" id="btnDCari" type="submit">Cari</button>',
    '<button class="btn" id="btnDReset" type="button" hidden>✕ Semua</button>',
    '</form>',
    '<div class="hint" id="dInfo">Memuat…</div>',
    '<div class="legenda" id="dLegenda"><span class="lg merah">sudah EXP</span><span class="lg kuning" id="dLgKuning">EXP ≤ 30 hari lagi</span>',
    '<span class="lg hijau">Safety, Warehouse &amp; Diambil lengkap</span>',
    '<span class="lg-t">Centang Safety → Warehouse → isi tanggal Diambil → tanggal Dikembalikan bila APD lama dikembalikan (tersimpan otomatis; yang dikembalikan jadi riwayat, tidak diwarnai). EXP: Safety Shoes 6 bln (Fleet Lineup, Foreman, Supervisor, Dewatering Crew) / 12 bln lainnya, Helm 24 bln, APD lain tanpa EXP.</span></div>',
    '</div>',
    '<div class="tbl"><table class="antre data"><thead><tr>',
    '<th class="c-no">No</th><th>Karyawan</th><th>APD</th><th class="c-tgl">Diajukan</th>',
    '<th class="c-cek">Safety</th><th class="c-cek">Warehouse</th><th class="c-tgl">Diambil</th><th class="c-tgl">EXP</th>',
    '<th class="c-tgl">Lama Pakai</th><th class="c-tgl">Dikembalikan</th><th class="c-st">Status</th>',
    '</tr></thead><tbody id="dTb"><tr><td colspan="11" class="empty">Memuat…</td></tr></tbody></table></div>',
    '</section>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.homePage + '">Mission Control</a> · APD · setiap input, hapus &amp; cetak tercatat di audit_log</div>',
    '</div>',

    /* ---- popup konfirmasi (hapus / cetak) ---- */
    '<div class="mask" id="mask" hidden>',
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle"></h3><div class="m-sub" id="mSub"></div></div>',
    '<div class="m-body" id="mBody"></div>',
    '<div class="m-err" id="mErr" hidden></div>',
    '<div class="m-foot"><button class="btn" id="mBatal" type="button">Batal</button>',
    '<button class="btn primary" id="mYa" type="button"></button></div>',
    '</div></div>',

    '<div class="toast" id="toast"></div>'
  ].join('\n');

  document.getElementById('app').innerHTML = HTML;
  var $ = function (id) { return document.getElementById(id); };

  /* ==========================================================
     3. STARFIELD (latar bintang, selaras index.js)
     ========================================================== */
  (function starfield() {
    // Digambar SEKALI, ulang hanya saat ukuran jendela berubah (lihat simper.js).
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
     4. UTIL
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
    var parts = String(nama || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  /* 'YYYY-MM-DD HH:MM' (WIB, dari MySQL) -> '25 Okt 2026 14:50' tanpa objek Date */
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function waktuId(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(String(s || ''));
    if (!m) return String(s || '—');
    return (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1] + (m[4] ? ' ' + m[4] : '');
  }
  function labelApd(nama, tipe) {
    return esc(nama) + (tipe ? ' <span class="t">' + esc(tipe) + '</span>' : '');
  }
  /* respons JSON -> body; status HTTP gagal -> Error berisi pesan server */
  function bacaJson(r) {
    return r.json().catch(function () { return {}; }).then(function (b) {
      if (!r.ok) {
        var e = new Error((b && b.message) || ('HTTP ' + r.status));
        e.code = r.status;
        throw e;
      }
      return b;
    });
  }
  function kirim(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(bacaJson);
  }
  /* POST yang dibalas PDF (apd-cetak) -> {blob, nama, diajukan}; gagal -> Error
     berisi pesan server, sama dengan kirim(). diajukan = jumlah baris yang
     diberi tgl_diajukan (header X-Magi-Diajukan; null kalau tidak ada). */
  function kirimPdf(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok || !/application\/pdf/.test(r.headers.get('Content-Type') || '')) {
        return bacaJson(r).then(function () { throw new Error('Balasan bukan PDF (HTTP ' + r.status + ').'); });
      }
      var m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('Content-Disposition') || '');
      var nama = 'permintaan-apd.pdf';
      try { if (m) nama = decodeURIComponent(m[1]); } catch (e) { /* nama bawaan */ }
      var d = r.headers.get('X-Magi-Diajukan');
      return r.blob().then(function (blob) { return { blob: blob, nama: nama, diajukan: d == null ? null : +d }; });
    });
  }
  function pesan(e) { return String((e && e.message) || e); }

  /* ==========================================================
     5. DATA
     ========================================================== */
  var data = { apd: [], antrean: [], riwayat: [] };   // respons apd-list terakhir
  var pilih = {};          // id_kar_apd -> true (dicentang untuk dicetak)
  var kar = null;          // karyawan yang sedang diinput {id_ho, nama, jabatan, dept}
  var cekApd = {};         // id_apd -> true (dicentang di form input)
  var memuat = false;

  function muat() {
    if (memuat) return Promise.resolve();
    memuat = true;
    $('btnRefresh').disabled = true;
    setLink('wait', 'memuat…');
    return fetch(CFG.listUrl, { cache: 'no-store' })
      .then(bacaJson)
      .then(function (b) {
        data = {
          apd: Array.isArray(b.apd) ? b.apd : [],
          antrean: Array.isArray(b.antrean) ? b.antrean : [],
          riwayat: Array.isArray(b.riwayat) ? b.riwayat : []
        };
        // buang centang milik baris yang sudah tidak di antrean
        var ada = {};
        data.antrean.forEach(function (r) { ada[r.id_kar_apd] = true; });
        Object.keys(pilih).forEach(function (k) { if (!ada[k]) delete pilih[k]; });
        var adaApd = {};
        data.apd.forEach(function (a) { adaApd[a.id_apd] = true; });
        Object.keys(cekApd).forEach(function (k) { if (!adaApd[k]) delete cekApd[k]; });
        renderApdCek();
        renderMaster();
        renderAntre();
        renderCetak();
        setLink('on', 'terhubung');
        muatData();
      })
      .catch(function (e) {
        setLink('off', 'gagal');
        $('aTb').innerHTML = '<tr><td colspan="6" class="empty">Gagal memuat antrean APD.<br><b>' + esc(pesan(e)) + '</b></td></tr>';
        toast('crit', '<b>Gagal memuat</b> — ' + esc(pesan(e)));
      })
      .then(function () {
        memuat = false;
        $('btnRefresh').disabled = false;
      });
  }

  /* ==========================================================
     6. PANEL 01 — INPUT
     ========================================================== */
  function renderKar(rows, terpotong) {
    var box = $('karBox');
    if (kar) {
      box.innerHTML = '<div class="kar"><div class="ava">' + esc(initial(kar.nama)) + '</div>' +
        '<div class="col"><span class="n">' + esc(kar.nama) + '</span>' +
        '<span class="i">' + esc(kar.id_ho) + (kar.jabatan ? ' · ' + esc(kar.jabatan) : '') + '</span></div>' +
        '<button class="act" id="btnGanti" type="button">Ganti</button></div>';
      $('btnGanti').addEventListener('click', function () { gantiKar(); });
      return;
    }
    if (!rows) {
      box.innerHTML = '<div class="hint">Ketik nama atau ID HO — lengkap atau sebagian — lalu tekan Cari. Hanya karyawan aktif (tanpa DOT).</div>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="hint">Tidak ada karyawan aktif yang cocok.</div>';
      return;
    }
    box.innerHTML = '<div class="plead">Ditemukan <b>' + rows.length + (terpotong ? '+' : '') + '</b> karyawan' +
      (terpotong ? ' — ketik lebih lengkap' : '') + ', pilih satu:</div><div class="plist">' +
      rows.map(function (r, i) {
        return '<button class="pitem" type="button" data-i="' + i + '"><div class="col">' +
          '<span class="n">' + esc(r.nama) + '</span><span class="i">' + esc(r.id_ho) +
          (r.jabatan ? ' · ' + esc(r.jabatan) : '') + '</span></div><span class="arw">→</span></button>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('.pitem'), function (b) {
      b.addEventListener('click', function () { pilihKar(rows[+b.getAttribute('data-i')]); });
    });
  }
  function pilihKar(r) {
    kar = r;
    cekApd = {};
    renderKar();
    renderApdCek();
  }
  function gantiKar() {
    kar = null;
    cekApd = {};
    renderKar();
    renderApdCek();
    $('fCari').focus();
    $('fCari').select();
  }

  function doCari() {
    if ($('btnCari').disabled) return;
    var qs = String($('fCari').value || '').trim();
    if (!qs) {
      toast('warn', 'Masukkan <b>nama</b> atau <b>ID HO</b> terlebih dahulu.');
      $('fCari').focus();
      return;
    }
    kar = null;
    cekApd = {};
    renderApdCek();
    $('btnCari').disabled = true;
    $('karBox').innerHTML = '<div class="hint">Mencari…</div>';
    fetch(CFG.cariUrl + '?q=' + encodeURIComponent(qs), { cache: 'no-store' })
      .then(bacaJson)
      .then(function (b) {
        var rows = Array.isArray(b.karyawan) ? b.karyawan : [];
        if (rows.length === 1) pilihKar(rows[0]);
        else renderKar(rows, !!b.terpotong);
      })
      .catch(function (e) {
        $('karBox').innerHTML = '<div class="hint">Gagal mencari karyawan — ' + esc(pesan(e)) + '</div>';
      })
      .then(function () { $('btnCari').disabled = false; });
  }

  /* APD milik karyawan terpilih yang masih di antrean -> tidak bisa dipilih lagi
     (server juga menolaknya dengan 409) */
  function apdAntreKar() {
    var s = {};
    if (!kar) return s;
    data.antrean.forEach(function (r) { if (r.id_ho === kar.id_ho) s[r.id_apd] = true; });
    return s;
  }
  function renderApdCek() {
    var box = $('apdCek');
    if (!data.apd.length) {
      box.innerHTML = '<div class="none">Daftar APD masih kosong — tambahkan dulu di <b>Kelola daftar APD</b> di bawah.</div>';
      updateTambah();
      return;
    }
    var antre = apdAntreKar();
    box.innerHTML = data.apd.map(function (a) {
      var sudah = !!antre[a.id_apd];
      var mati = !kar || sudah;
      var on = !mati && !!cekApd[a.id_apd];
      return '<label class="' + (on ? 'on' : '') + (mati ? ' mati' : '') + '">' +
        '<input type="checkbox" data-apd="' + a.id_apd + '"' + (on ? ' checked' : '') + (mati ? ' disabled' : '') + '>' +
        '<span class="n">' + labelApd(a.nama_apd, a.tipe_apd) + '</span>' +
        (sudah ? '<span class="s">sudah di antrean</span>' : '') + '</label>';
    }).join('');
    updateTambah();
  }
  function jumlahCekApd() {
    var antre = apdAntreKar();
    return Object.keys(cekApd).filter(function (k) { return !antre[k]; }).map(Number);
  }
  function updateTambah() {
    $('btnTambah').disabled = !kar || !jumlahCekApd().length;
  }
  $('apdCek').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute('data-apd')) return;
    var id = t.getAttribute('data-apd');
    if (t.checked) cekApd[id] = true; else delete cekApd[id];
    t.parentNode.classList.toggle('on', t.checked);
    updateTambah();
  });

  function doTambah() {
    var ids = jumlahCekApd();
    if (!kar || !ids.length) return;
    var nama = kar.nama;
    $('btnTambah').disabled = true;
    $('btnTambah').textContent = 'Menyimpan…';
    kirim(CFG.tambahUrl, { id_ho: kar.id_ho, apd: ids })
      .then(function (b) {
        toast('ok', '<b>' + esc(nama) + '</b> — ' + esc(b.message || 'ditambahkan ke antrean.'));
        kar = null;
        cekApd = {};
        $('fCari').value = '';
        renderKar();
        return muat().then(function () { $('fCari').focus(); });
      })
      .catch(function (e) {
        toast('crit', '<b>Gagal menambah</b> — ' + esc(pesan(e)));
        if (e && (e.code === 409 || e.code === 422)) muat();
      })
      .then(function () {
        $('btnTambah').textContent = '＋ Tambah ke Antrean';
        updateTambah();
      });
  }

  /* ---- kelola master APD ---- */
  function renderMaster() {
    $('kelolaSum').textContent = 'Kelola daftar APD (' + data.apd.length + ')';
    if (!data.apd.length) $('kelola').open = true;
    $('mList').innerHTML = data.apd.length ? data.apd.map(function (a, i) {
      var dipakai = a.dipakai > 0;
      return '<li><span class="n">' + esc(a.nama_apd) + (a.tipe_apd ? '<span class="t">' + esc(a.tipe_apd) + '</span>' : '') + '</span>' +
        (dipakai ? '<span class="u">dipakai ' + a.dipakai + '×</span>' : '') +
        '<button class="ibtn" type="button" data-mhapus="' + i + '"' + (dipakai ? ' disabled title="Masih dipakai di data pengajuan"' : ' title="Hapus dari daftar"') +
        ' aria-label="Hapus ' + esc(a.nama_apd) + ' dari daftar">✕</button></li>';
    }).join('') : '<li><span class="none">Belum ada APD di daftar.</span></li>';
  }
  $('mList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-mhapus]') : null;
    if (!b || b.disabled) return;
    var a = data.apd[+b.getAttribute('data-mhapus')];
    if (!a) return;
    bukaPopup('Hapus APD dari Daftar', a.nama_apd + (a.tipe_apd ? ' · ' + a.tipe_apd : ''),
      'Hapus <b>' + esc(a.nama_apd) + (a.tipe_apd ? ' (' + esc(a.tipe_apd) + ')' : '') + '</b> dari daftar APD? ' +
      'APD yang sudah dipakai di data pengajuan tidak bisa dihapus.',
      function () { return kirim(CFG.masterHapusUrl, { id_apd: a.id_apd }); },
      { tombol: 'Hapus', sibuk: 'Menghapus…', bahaya: true });
  });
  $('fMaster').addEventListener('submit', function (e) {
    e.preventDefault();
    var nm = String($('mNama').value || '').trim(), tipe = String($('mTipe').value || '').trim();
    if (!nm) { toast('warn', '<b>Nama APD</b> wajib diisi.'); $('mNama').focus(); return; }
    $('btnMaster').disabled = true;
    kirim(CFG.masterTambahUrl, { nama_apd: nm, tipe_apd: tipe })
      .then(function (b) {
        toast('ok', '<b>Berhasil</b> — ' + esc(b.message || 'APD ditambahkan.'));
        $('mNama').value = '';
        $('mTipe').value = '';
        $('mNama').focus();
        return muat();
      })
      .catch(function (er) { toast('crit', '<b>Gagal</b> — ' + esc(pesan(er))); })
      .then(function () { $('btnMaster').disabled = false; });
  });

  /* ==========================================================
     7. PANEL 02 — ANTREAN CETAK
     ========================================================== */
  function renderAntre() {
    var rows = data.antrean;
    var nOrang = {};
    rows.forEach(function (r) { nOrang[r.id_ho] = true; });
    $('aCnt').textContent = rows.length + ' APD · ' + Object.keys(nOrang).length + ' karyawan';
    $('btnBelum').disabled = !rows.some(function (r) { return !r.terkirim; });
    if (!rows.length) {
      $('aTb').innerHTML = '<tr><td colspan="6" class="empty">Antrean kosong — semua pengajuan sudah punya tanggal diajukan, ' +
        'atau belum ada yang diinput. Mulai dari panel <b>01 Input APD</b>.</td></tr>';
      updatePilihSemua();
      return;
    }
    $('aTb').innerHTML = rows.map(function (r, i) {
      var on = !!pilih[r.id_kar_apd];
      var st = r.terkirim
        ? '<span class="bdg warn">dikirim ' + esc(waktuId(r.terkirim.pada)) + '</span><span class="kc">oleh ' + esc(r.terkirim.oleh || '—') + '</span>'
        : '<span class="bdg">belum dikirim</span>';
      return '<tr class="' + (on ? 'on' : '') + '">' +
        '<td class="c-pilih"><input type="checkbox" data-id="' + r.id_kar_apd + '"' + (on ? ' checked' : '') +
        ' aria-label="Cetak ' + esc(r.nama) + ' — ' + esc(r.nama_apd) + '"></td>' +
        '<td class="c-no">' + (i + 1) + '</td>' +
        '<td><span class="nm">' + esc(r.nama) + '</span><span class="kc">' + esc(r.id_ho) +
        (r.jabatan ? ' · ' + esc(r.jabatan) : '') + '</span></td>' +
        '<td><span class="ap">' + esc(r.nama_apd) + '</span>' + (r.tipe_apd ? '<span class="kc">' + esc(r.tipe_apd) + '</span>' : '') +
        '<span class="st-m">' + st + '</span></td>' +
        '<td class="c-st">' + st + '</td>' +
        '<td class="c-a"><button class="ibtn" type="button" data-hapus="' + i + '" title="Hapus dari antrean"' +
        ' aria-label="Hapus ' + esc(r.nama_apd) + ' milik ' + esc(r.nama) + ' dari antrean">✕</button></td></tr>';
    }).join('');
    updatePilihSemua();
  }
  function updatePilihSemua() {
    var n = data.antrean.length, k = jumlahPilih();
    var c = $('pilihSemua');
    c.disabled = !n;
    c.checked = n > 0 && k === n;
    c.indeterminate = k > 0 && k < n;
  }
  function jumlahPilih() { return Object.keys(pilih).length; }

  $('aTb').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute('data-id')) return;
    var id = t.getAttribute('data-id');
    if (t.checked) pilih[id] = true; else delete pilih[id];
    t.closest('tr').classList.toggle('on', t.checked);
    updatePilihSemua();
    renderCetak();
  });
  $('aTb').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-hapus]') : null;
    if (!b) return;
    var r = data.antrean[+b.getAttribute('data-hapus')];
    if (!r) return;
    bukaPopup('Hapus dari Antrean', r.nama + ' · ' + r.id_ho,
      'Hapus <b>' + esc(r.nama_apd) + (r.tipe_apd ? ' (' + esc(r.tipe_apd) + ')' : '') + '</b> milik <b>' + esc(r.nama) + '</b> dari antrean cetak? ' +
      (r.terkirim ? 'Baris ini <b>sudah pernah dikirim</b> ke n8n (' + esc(waktuId(r.terkirim.pada)) + '). ' : '') +
      'Isi baris tercatat di audit_log.',
      function () {
        return kirim(CFG.hapusUrl, { id_kar_apd: r.id_kar_apd }).then(function (b2) {
          delete pilih[r.id_kar_apd];
          return b2;
        });
      },
      { tombol: 'Hapus', sibuk: 'Menghapus…', bahaya: true });
  });
  $('pilihSemua').addEventListener('change', function () {
    var on = this.checked;
    pilih = {};
    if (on) data.antrean.forEach(function (r) { pilih[r.id_kar_apd] = true; });
    renderAntre();
    renderCetak();
  });
  $('btnBelum').addEventListener('click', function () {
    pilih = {};
    data.antrean.forEach(function (r) { if (!r.terkirim) pilih[r.id_kar_apd] = true; });
    renderAntre();
    renderCetak();
  });

  /* ==========================================================
     8. PANEL 03 — CETAK
     ========================================================== */
  var sibukCetak = false;

  /* baris antrean yang dicentang, dikelompokkan per karyawan (urutan antrean) */
  function kelompokPilih() {
    var urut = [], per = {};
    data.antrean.forEach(function (r) {
      if (!pilih[r.id_kar_apd]) return;
      if (!per[r.id_ho]) { per[r.id_ho] = { id_ho: r.id_ho, nama: r.nama, apd: [], terkirim: 0 }; urut.push(per[r.id_ho]); }
      per[r.id_ho].apd.push(r);
      if (r.terkirim) per[r.id_ho].terkirim++;
    });
    return urut;
  }

  function renderCetak() {
    var g = kelompokPilih();
    var n = g.reduce(function (s, k) { return s + k.apd.length; }, 0);
    var lagi = g.reduce(function (s, k) { return s + k.terkirim; }, 0);
    $('cJml').textContent = n;
    $('cKar').textContent = g.length;
    $('stat').className = 'stat' + (n ? ' ok' : '');
    $('statDot').className = 'dot' + (n ? ' on' : '');
    $('statT').textContent = n ? 'Siap dicetak' : 'Belum ada yang dicentang';
    $('statS').textContent = n ? n + ' APD untuk ' + g.length + ' karyawan' : 'centang baris di Antrean Cetak';
    $('cNama').innerHTML = g.slice(0, CFG.namaMaks).map(function (k) {
      return '<li><span class="n">' + esc(k.nama) + '</span><span class="j">' + k.apd.length + ' APD</span></li>';
    }).join('') + (g.length > CFG.namaMaks ? '<li class="lagi">＋ ' + (g.length - CFG.namaMaks) + ' karyawan lainnya</li>' : '');
    $('cNote').innerHTML = lagi
      ? '<div class="gnote amber"><b>' + lagi + ' APD</b> yang dicentang sudah pernah dicetak tapi tanggal diajukannya belum tersimpan — kalau dicetak, form-nya tercetak lagi.</div>'
      : '';
    $('btnCetak').disabled = !n || sibukCetak;
    renderRiwayat();
  }

  function renderRiwayat() {
    var r = data.riwayat;
    $('riwayat').innerHTML = '<div class="rw-h">Cetakan terakhir</div>' + (r.length
      ? '<ul>' + r.map(function (x) {
          return '<li><b>' + x.jumlah + ' APD</b> · ' + x.karyawan + ' karyawan' +
            '<span class="w">' + esc(waktuId(x.pada)) + ' WIB · ' + esc(x.nama || x.oleh) + '</span></li>';
        }).join('') + '</ul>'
      : '<div class="none">Belum pernah ada yang dicetak.</div>');
  }

  function tanyaCetak() {
    var g = kelompokPilih();
    if (!g.length) return;
    var n = g.reduce(function (s, k) { return s + k.apd.length; }, 0);
    var ids = [];
    g.forEach(function (k) { k.apd.forEach(function (r) { ids.push(r.id_kar_apd); }); });
    var isi = 'Cetak form <b>Permintaan Peralatan Keselamatan</b> untuk <b>' + g.length + ' karyawan</b> (' + n + ' APD)?' +
      '<ul class="m-list">' + g.map(function (k) {
        return '<li><span class="n">' + esc(k.nama) + '</span><span class="i">' + esc(k.id_ho) + '</span>' +
          '<span class="a">' + k.apd.map(function (r) {
            return esc(r.nama_apd) + (r.tipe_apd ? ' (' + esc(r.tipe_apd) + ')' : '') + (r.terkirim ? ' — sudah pernah dicetak' : '');
          }).join(' · ') + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="m-foot-note">Satu halaman per karyawan, ±6 detik per karyawan. Sesudah PDF jadi, baris ini diberi ' +
      'tanggal diajukan hari ini dan keluar dari antrean — simpan / cetak PDF-nya sebelum menutup popup.</div>';
    bukaPopup('Konfirmasi Cetak APD', n + ' APD · ' + g.length + ' karyawan', isi, function () {
      sibukCetak = true;
      return kirimPdf(CFG.cetakUrl, { pilih: ids }).then(function (b) {
        pilih = {};
        return b;
      }).then(function (b) { sibukCetak = false; return b; }, function (e) { sibukCetak = false; throw e; });
    }, { tombol: '🖨 Cetak PDF', sibuk: 'Menyusun form…', selesai: function (b) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(b.blob);
      var kurang = b.diajukan != null && b.diajukan < n;
      $('mBody').innerHTML = '<b>Form siap</b> — ' + esc(b.nama) + ' (' + Math.max(1, Math.round(b.blob.size / 1024)) + ' KB, ' +
        g.length + ' halaman).' +
        '<div class="m-pdf"><a class="btn primary" id="mBukaPdf" href="' + pdfUrl + '" target="_blank" rel="noopener">Buka PDF</a>' +
        '<a class="btn" href="' + pdfUrl + '" download="' + esc(b.nama) + '">⤓ Unduh</a></div>' +
        (kurang
          ? '<div class="m-note">PDF jadi, tetapi <b>tanggal diajukan hanya tersimpan untuk ' + b.diajukan + ' dari ' + n + ' APD</b> — ' +
            'sisanya tetap di antrean dengan tanda <b>dikirim</b>. Hubungi admin (hak tulis tgl_diajukan magi-api).</div>'
          : '<div class="m-note ok">' + n + ' APD diberi tanggal diajukan hari ini dan keluar dari antrean.</div>') +
        '<div class="m-foot-note">Cetak dari penampil PDF (Ctrl+P). Berkas sementara di Google Drive sudah dibuang ke Trash.</div>';
      $('mBukaPdf').focus();
    } });
  }
  var pdfUrl = null;     // object URL PDF terakhir (dilepas saat cetak berikutnya)

  /* ==========================================================
     8b. PANEL 04 — DATA APD KARYAWAN
     ========================================================== */
  var dataQ = '';        // kata cari yang sedang ditampilkan ('' = data terbaru)
  var dataSeq = 0;       // hanya balasan permintaan terakhir yang digambar
  var dataT = null;      // tunda ketik
  var dataBaris = [];    // baris yang sedang tampil (urutan tabel)
  var hariIni = '';      // CURDATE server (batas atas tanggal diambil)

  function muatData(qBaru) {
    if (qBaru != null) dataQ = String(qBaru).trim();
    var seq = ++dataSeq;
    $('dInfo').textContent = dataQ ? 'Mencari "' + dataQ + '"…' : 'Memuat…';
    $('btnDReset').hidden = !dataQ;
    return fetch(CFG.dataUrl + '?q=' + encodeURIComponent(dataQ), { cache: 'no-store' })
      .then(bacaJson)
      .then(function (b) { if (seq === dataSeq) renderData(b); })
      .catch(function (e) {
        if (seq !== dataSeq) return;
        $('dCnt').textContent = '';
        $('dInfo').textContent = '';
        $('dTb').innerHTML = '<tr><td colspan="11" class="empty">Gagal memuat data APD.<br><b>' + esc(pesan(e)) + '</b></td></tr>';
      });
  }

  var STATUS = {
    antrean: ['', 'antrean'],
    diajukan: ['warn', 'diajukan'],
    diambil: ['ok', 'diambil'],
    dikembalikan: ['mute', 'dikembalikan']
  };
  function tglSel(s) { return s ? esc(waktuId(s)) : '<span class="kosong">—</span>'; }
  // {bulan, hari, total_hari} -> '1 thn 2 bln 5 hr'
  function lamaTeks(l) {
    if (!l) return '<span class="kosong">—</span>';
    var t = Math.floor(l.bulan / 12), bl = l.bulan % 12, out = [];
    if (t) out.push(t + ' thn');
    if (bl) out.push(bl + ' bln');
    if (l.hari || !out.length) out.push(l.hari + ' hr');
    return '<span title="' + l.total_hari + ' hari">' + out.join(' ') + '</span>';
  }
  function expSel(r) {
    if (!r.masa_bulan) return '<span class="kosong" title="APD ini tidak punya masa EXP">tanpa EXP</span>';
    if (!r.tgl_exp) return '<span class="kosong" title="EXP dihitung dari tanggal diambil">' + r.masa_bulan + ' bln sejak diambil</span>';
    var s = r.sisa_hari, ket;
    if (r.tgl_dikembalikan) ket = '';
    else if (s < 0) ket = 'lewat ' + (-s) + ' hari';
    else if (s === 0) ket = 'EXP hari ini';
    else ket = 'sisa ' + s + ' hari';
    return esc(waktuId(r.tgl_exp)) + (ket ? '<span class="kc">' + ket + ' · ' + r.masa_bulan + ' bln</span>' : '');
  }

  function barisHtml(r, i) {
    var st = STATUS[r.status] || ['', r.status];
    var bdg = '<span class="bdg ' + st[0] + '">' + esc(st[1]) + '</span>';
    // Urutan Safety -> Warehouse -> Diambil -> Dikembalikan: isian terkunci
    // selama langkah sesudahnya masih terisi (dibetulkan dari belakang).
    var ubah = r.bisa_ubah, kembali = !!r.tgl_dikembalikan;
    var kunciS = !ubah || r.warehouse;
    var kunciW = !ubah || (!r.safety && !r.warehouse) || !!r.tgl_diambil;
    var kunciD = !ubah || !r.warehouse || kembali;
    var kunciK = !ubah || !r.tgl_diambil;
    var alasan = !r.tgl_diajukan ? 'Belum diajukan — cetak dulu dari Antrean Cetak' : '';
    var lbl = esc(r.nama_apd) + ' milik ' + esc(r.nama);
    return '<tr class="' + (r.warna ? 'w-' + r.warna : '') + '" data-baris="' + i + '">' +
      '<td class="c-no">' + (i + 1) + '</td>' +
      '<td><span class="nm">' + esc(r.nama) + (r.aktif ? '' : ' <span class="bdg mute" title="Sudah DOT (tidak aktif)">DOT</span>') + '</span>' +
      '<span class="kc">' + esc(r.id_ho) + (r.jabatan ? ' · ' + esc(r.jabatan) : '') + '</span></td>' +
      '<td><span class="ap">' + labelApd(r.nama_apd, r.tipe_apd) + '</span><span class="st-m">' + bdg + '</span></td>' +
      '<td class="c-tgl">' + tglSel(r.tgl_diajukan) + '</td>' +
      '<td class="c-cek"><input type="checkbox" data-cek="safety"' + (r.safety ? ' checked' : '') + (kunciS ? ' disabled' : '') +
        ' title="' + esc(alasan || (r.warehouse ? 'Lepas Warehouse dulu' : 'Form sudah di Safety')) + '" aria-label="Safety — ' + lbl + '"></td>' +
      '<td class="c-cek"><input type="checkbox" data-cek="warehouse"' + (r.warehouse ? ' checked' : '') + (kunciW ? ' disabled' : '') +
        ' title="' + esc(alasan || (r.tgl_diambil ? 'Kosongkan tanggal diambil dulu' : !r.safety ? 'Centang Safety dulu' : 'Form sudah di Warehouse')) +
        '" aria-label="Warehouse — ' + lbl + '"></td>' +
      '<td class="c-tgl">' + (ubah
        ? '<input class="tgl-in" type="date" data-cek="tgl_diambil" value="' + esc(r.tgl_diambil || '') + '"' +
          ' min="' + esc(r.tgl_diajukan) + '" max="' + esc(hariIni) + '"' +
          (kunciD ? ' disabled title="' + (kembali ? 'Kosongkan tanggal dikembalikan dulu' : 'Centang Warehouse dulu') + '"' : '') +
          ' aria-label="Tanggal diambil — ' + lbl + '">'
        : tglSel(r.tgl_diambil)) + '</td>' +
      '<td class="c-tgl">' + expSel(r) + '</td>' +
      '<td class="c-tgl">' + lamaTeks(r.lama) + '</td>' +
      '<td class="c-tgl">' + (ubah
        ? '<input class="tgl-in" type="date" data-cek="tgl_dikembalikan" value="' + esc(r.tgl_dikembalikan || '') + '"' +
          ' min="' + esc(r.tgl_diambil || r.tgl_diajukan) + '" max="' + esc(hariIni) + '"' +
          (kunciK ? ' disabled title="Isi tanggal diambil dulu"' : ' title="APD lama dikembalikan (mis. saat penggantian)"') +
          ' aria-label="Tanggal dikembalikan — ' + lbl + '">'
        : tglSel(r.tgl_dikembalikan)) + '</td>' +
      '<td class="c-st">' + bdg + '</td></tr>';
  }

  function renderData(b) {
    var rows = Array.isArray(b.data) ? b.data : [];
    var total = Number(b.total) || 0, orang = Number(b.karyawan) || 0;
    var w = b.warna || {};
    hariIni = b.hari_ini || hariIni;
    dataBaris = rows;
    if (b.batas_dekat) $('dLgKuning').textContent = 'EXP ≤ ' + b.batas_dekat + ' hari lagi';
    $('dCnt').textContent = total + ' APD · ' + orang + ' karyawan';
    var hit = (w.merah ? '<span class="h-merah">' + w.merah + ' sudah EXP</span>' : '') +
      (w.kuning ? '<span class="h-kuning">' + w.kuning + ' hampir EXP</span>' : '');
    $('dInfo').innerHTML = (b.q
      ? (total ? '<b>' + total + ' APD</b> milik <b>' + orang + ' karyawan</b> cocok dengan "' + esc(b.q) + '"' : 'Tidak ada data APD untuk "' + esc(b.q) + '".') +
        (b.terpotong ? ' — ditampilkan ' + rows.length + ' pertama, persempit pencarian.' : '')
      : (b.terpotong ? 'Menampilkan ' + rows.length + ' dari ' + total + ' data — cari nama / ID HO untuk melihat sisanya.'
                     : 'Semua APD yang tercatat; yang sudah / hampir EXP paling atas. Cari nama atau ID HO untuk melihat APD satu karyawan.')) +
      (hit ? ' ' + hit : '');
    if (!rows.length) {
      $('dTb').innerHTML = '<tr><td colspan="11" class="empty">' +
        (b.q ? 'Tidak ada karyawan dengan nama / ID HO "' + esc(b.q) + '" yang punya data APD.' : 'Belum ada APD yang tercatat.') + '</td></tr>';
      return;
    }
    $('dTb').innerHTML = rows.map(barisHtml).join('');
  }

  // Ceklis: tiap perubahan langsung disimpan (apd-ceklis). Selama menyimpan,
  // isian baris itu dikunci; gagal -> baris dikembalikan ke nilai sebelumnya.
  function simpanCeklis(el) {
    var tr = el.closest('tr');
    var i = +tr.getAttribute('data-baris');
    var r = dataBaris[i];
    if (!r) return;
    var kunci = el.getAttribute('data-cek');
    clearTimeout(tundaTgl);
    var body = { id_kar_apd: r.id_kar_apd };
    body[kunci] = el.type === 'checkbox' ? el.checked : (el.value || null);
    tr.classList.add('simpan');
    Array.prototype.forEach.call(tr.querySelectorAll('input'), function (x) { x.disabled = true; });
    kirim(CFG.ceklisUrl, body).then(function (b) {
      if (b.baris) dataBaris[i] = b.baris;
      tr.outerHTML = barisHtml(dataBaris[i], i);
      toast('ok', '<b>Tersimpan</b> — ' + esc(b.message || 'ceklis disimpan.'));
    }).catch(function (e) {
      tr.outerHTML = barisHtml(r, i);
      toast('crit', '<b>Gagal menyimpan</b> — ' + esc(pesan(e)));
      if (e && (e.code === 404 || e.code === 409)) muatData();
    });
  }
  // Tanggal diambil / dikembalikan: Chrome memicu 'change' di tengah mengetik (tahun "0002"),
  // jadi disimpan sesudah jeda singkat atau saat keluar dari isian, dan hanya
  // bila tanggalnya di antara tanggal diajukan dan hari ini. Keluar dengan
  // tanggal di luar rentang -> dikembalikan ke nilai tersimpan.
  var tundaTgl = null;
  function cekTgl(el, keluar) {
    var tr = el.closest ? el.closest('tr') : null;
    if (!tr || !document.body.contains(el) || tr.classList.contains('simpan')) return;
    var r = dataBaris[+tr.getAttribute('data-baris')];
    if (!r) return;
    var kolom = el.getAttribute('data-cek');            // tgl_diambil | tgl_dikembalikan
    var v = el.value || '';
    if (v === (r[kolom] || '')) { el.classList.remove('salah'); return; }
    var ok = !v || (v >= el.min && v <= el.max);
    el.classList.toggle('salah', !ok);
    if (ok) { simpanCeklis(el); return; }
    if (keluar) {
      el.value = r[kolom] || '';
      el.classList.remove('salah');
      toast('warn', '<b>Tanggal ' + (kolom === 'tgl_dikembalikan' ? 'dikembalikan' : 'diambil') + '</b> harus antara ' +
        esc(waktuId(el.min)) + ' dan hari ini.');
    }
  }
  function jadwalTgl(el, keluar) {
    clearTimeout(tundaTgl);
    tundaTgl = setTimeout(function () { cekTgl(el, keluar); }, keluar ? 0 : 900);
  }
  $('dTb').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-cek')) return;
    if (t.type === 'checkbox') simpanCeklis(t); else jadwalTgl(t, false);
  });
  $('dTb').addEventListener('focusout', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('tgl-in')) jadwalTgl(t, true);
  });

  $('fData').addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(dataT);
    muatData($('dCari').value);
  });
  // ketik -> cari otomatis sesudah jeda singkat (kosongkan = kembali ke data terbaru)
  $('dCari').addEventListener('input', function () {
    clearTimeout(dataT);
    var v = this.value.trim();
    if (v === dataQ) return;
    dataT = setTimeout(function () { muatData(v); }, 400);
  });
  $('btnDReset').addEventListener('click', function () {
    clearTimeout(dataT);
    $('dCari').value = '';
    muatData('');
    $('dCari').focus();
  });

  /* ==========================================================
     9. POPUP — konfirmasi bersama (hapus / cetak)
     ========================================================== */
  var popup = null;      // {jalan: fn -> Promise, tombol, sibuk, selesai?}
  var asalFokus = null;

  function bukaPopup(judul, sub, isi, jalan, pil) {
    pil = pil || {};
    // selesai(hasil): popup TETAP terbuka sesudah berhasil dan menampilkan hasil
    // (cetak PDF); tanpa itu popup ditutup dengan toast "Berhasil".
    popup = { jalan: jalan, tombol: pil.tombol || 'Ya', sibuk: pil.sibuk || 'Memproses…', selesai: pil.selesai };
    asalFokus = document.activeElement;
    $('mTitle').textContent = judul;
    $('mSub').textContent = sub || '';
    $('mBody').innerHTML = isi;
    $('mErr').hidden = true;
    $('mYa').disabled = false;
    $('mYa').hidden = false;
    $('mBatal').textContent = 'Batal';
    $('mYa').textContent = popup.tombol;
    $('mYa').className = 'btn ' + (pil.bahaya ? 'bahaya' : 'primary');
    $('mask').hidden = false;
    document.body.classList.add('modal-on');
    $('mBatal').focus();
  }
  function tutupPopup() {
    if (!popup) return;
    popup = null;
    $('mask').hidden = true;
    document.body.classList.remove('modal-on');
    if (asalFokus && document.body.contains(asalFokus)) asalFokus.focus();
  }
  $('mBatal').addEventListener('click', function () { if (!$('mYa').disabled) tutupPopup(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup && !$('mYa').disabled) tutupPopup();
  });
  $('mYa').addEventListener('click', function () {
    if (!popup || $('mYa').disabled) return;
    var p = popup;
    $('mErr').hidden = true;
    $('mYa').disabled = true;
    $('mBatal').disabled = true;
    $('mYa').textContent = p.sibuk;
    setLink('wait', p.sibuk.toLowerCase());
    renderCetak();
    p.jalan().then(function (b) {
      $('mBatal').disabled = false;
      if (p.selesai && popup === p) {
        $('mYa').hidden = true;
        $('mYa').disabled = false;
        $('mBatal').textContent = 'Tutup';
        p.selesai(b);
        renderCetak();
        muat();
        return;
      }
      tutupPopup();
      toast('ok', '<b>Berhasil</b> — ' + esc(b.message || 'selesai.'));
      muat();
    }).catch(function (e) {
      setLink('off', 'ditolak');
      $('mBatal').disabled = false;
      $('mYa').disabled = false;
      $('mYa').textContent = p.tombol;
      $('mErr').textContent = pesan(e);
      $('mErr').hidden = false;
      renderCetak();
      // 404/409 = data di layar sudah basi (diubah orang lain): segarkan di belakang popup
      if (e && (e.code === 409 || e.code === 404)) muat();
    });
  });

  /* ==========================================================
     10. PASANG & BOOT
     ========================================================== */
  $('btnRefresh').addEventListener('click', muat);
  $('btnCari').addEventListener('click', doCari);
  $('fCari').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCari(); }
  });
  $('btnTambah').addEventListener('click', doTambah);
  $('btnCetak').addEventListener('click', tanyaCetak);

  renderRiwayat();
  muat();
  $('fCari').focus();
})();

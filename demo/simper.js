/* ============================================================
   MAGI//SYSTEM — SIMPER
   ------------------------------------------------------------
   Markup + logika ada di file ini; gaya di simper.css;
   simper.html hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur:
     1. Halaman terbuka -> kartu SIMPER & Skill tampil KOSONG,
        belum ada permintaan ke server.
     2. Masukkan nama atau ID HO -> tekan Cari (atau Enter).
        - ID cocok persis / tepat 1 kecocokan -> data langsung tampil
        - beberapa karyawan cocok             -> daftar pilihan
        - tidak ada                           -> pesan kosong
     3. Karyawan tampil -> popup:
        - "＋ Tambah SIMPER" (belum punya) / "✎ Ubah" + "✕ Hapus" (sudah
          punya) — satu karyawan hanya satu baris SIMPER (UNIQUE id_ho)
        - "＋ Tambah Skill" — pilih unit dari tabel unit; unit yang
          sudah dimiliki tidak bisa dipilih lagi
        - ✎ / ✕ di tiap baris skill — ubah status & tanggal, atau hapus
          (selalu lewat popup konfirmasi). Unit tidak bisa diganti:
          unit salah = hapus lalu tambah yang benar.
        Sesudah tersimpan, data karyawan itu dimuat ulang dari server.
     4. "Bersihkan" mengembalikan ke kartu kosong.
     5. Panel 03 Ringkasan dimuat saat halaman dibuka dan sesudah setiap
        simpan/hapus: SIMPER kedaluwarsa / habis <= 30 hari, SIMPER
        bercatatan, jumlah per status skill, orang per unit (bisa
        disaring, mis. "xcmg"). HANYA karyawan aktif — yang punya DOT
        tidak dihitung (disaring server, lib.dotFilter). Klik nama di
        ringkasan -> karyawan itu dibuka di panel 02.

   Sumber (magi-api, routes/simper.js; semua butuh hak fitur 'simper'):
     GET  simper-list?q=   cari per nama / ID HO
     GET  simper-ringkasan panel Ringkasan
     GET  unit-list        isi dropdown unit (dimuat sekali, saat
                           popup Tambah Skill pertama dibuka)
     POST simper-simpan    {mode:'tambah'|'ubah', id_ho, ...kolom}
     POST simper-hapus     {id_ho}
     POST skill-tambah     {id_ho, skill:id_unit, status, tgl_ditambah}
     POST skill-ubah       {id_skill, id_ho, status, tgl_ditambah}
     POST skill-hapus      {id_skill, id_ho}

   Status masa berlaku memakai sisa_hari dari server (DATEDIFF
   terhadap CURDATE() MySQL), bukan jam browser; begitu juga
   tanggal bawaan "Tanggal Ditambah" (hari_ini dari server).
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    homePage: './index.html',
    //   GET ?q=<nama|id_ho> -> {hari_ini, terpotong, karyawan:[{id_ho,nama,jabatan,simper|null,skill:[]}]}
    fetchUrl: MAGI.url('/webhook/simper-list'),
    ringkasUrl: MAGI.url('/webhook/simper-ringkasan'),
    unitUrl: MAGI.url('/webhook/unit-list'),
    simperUrl: MAGI.url('/webhook/simper-simpan'),
    simperHapusUrl: MAGI.url('/webhook/simper-hapus'),
    skillUrl: MAGI.url('/webhook/skill-tambah'),
    skillUbahUrl: MAGI.url('/webhook/skill-ubah'),
    skillHapusUrl: MAGI.url('/webhook/skill-hapus'),
    // SIMPER yang habis dalam sekian hari ditandai kuning
    segeraHari: 30
  };

  /* isi kartu SIMPER — urutan = urutan tampil, kunci = field dari server */
  var SIMPER_FIELDS = [
    ['operator', 'Operator'], ['access', 'Access'], ['class', 'Class'],
    ['no_simpol', 'No. Simpol', 'm'], ['exp', 'Masa Berlaku', 'exp'], ['catatan', 'Catatan', 'cat']
  ];
  /* Pilihan ENUM — HARUS sama dengan kolom database dan daftar di
     service/routes/simper.js (server menolak nilai lain dengan 422). */
  var ACCESS = ['Pit Access', 'Full Access'];
  var CLASS = ['BII', 'BII Umum', 'A', 'C'];
  var STATUS_SKILL = ['Full', 'Training', 'Parsial'];
  /* warna lencana status skill */
  var SKILL_KELAS = { 'Full': 'ok', 'Training': 'warn', 'Parsial': 'blue' };

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
    '<div class="sub">SIMPER &amp; Skill · Kompetensi</div></div>',
    '<div class="hud-spacer"></div>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">siap</span></div>',
    '</header>',

    '<section class="panel"><div class="p-head"><span class="idx">01</span><h2>Pencarian SIMPER</h2>',
    '<span class="spacer"></span><span class="idx">nama / id ho</span></div>',
    '<div class="p-body">',
    '<div class="filterbar">',
    '<div class="fld"><label for="fQuery">Nama atau ID HO</label>',
    '<input class="inp" id="fQuery" type="text" maxlength="100" placeholder="mis. Budi Santoso atau XYZ00000001" autocomplete="off" spellcheck="false"></div>',
    '<div class="fld"><button class="btn primary" id="btnSearch" type="button">Cari</button></div>',
    '<div class="fld"><button class="btn" id="btnClear" type="button">Bersihkan</button></div>',
    '</div>',
    '<div class="hint">Ketik nama atau ID HO — lengkap atau sebagian — lalu tekan Cari.</div>',
    '</div></section>',

    '<section class="panel"><div class="p-head"><span class="idx">02</span><h2>SIMPER &amp; Skill Karyawan</h2>',
    '<span class="spacer"></span><span class="idx" id="pfState">kosong</span></div>',
    '<div id="pfBody"></div>',
    '</section>',

    '<section class="panel" id="pRingkas"><div class="p-head"><span class="idx">03</span><h2>Ringkasan SIMPER &amp; Skill</h2>',
    '<span class="spacer"></span><span class="idx" id="rkState">memuat…</span>',
    '<button class="act" id="btnRingkas" type="button">↻ Muat ulang</button></div>',
    '<div class="rk-ket">Hanya karyawan aktif — yang punya data DOT (sudah berhenti) tidak dihitung.</div>',
    '<div id="rkBody"><div class="state"><div class="spin"></div><br>Memuat ringkasan…</div></div>',
    '</section>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.homePage + '">Mission Control</a> · SIMPER &amp; Skill</div>',
    '</div>',

    /* ---- popup (satu untuk SIMPER & Skill, isinya diganti per form) ---- */
    '<div class="mask" id="mask" hidden>',
    '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">',
    '<div class="m-head"><h3 id="mTitle"></h3><div class="m-sub" id="mSub"></div></div>',
    '<form id="mForm" novalidate>',
    '<div class="m-body" id="mBody"></div>',
    '<div class="m-err" id="mErr" hidden></div>',
    '<div class="m-foot"><button class="btn" id="mBatal" type="button">Batal</button>',
    '<button class="btn primary" id="mSimpan" type="submit"></button></div>',
    '</form></div></div>',

    '<div class="toast" id="toast"></div>'
  ].join('\n');

  document.getElementById('app').innerHTML = HTML;
  var $ = function (id) { return document.getElementById(id); };

  /* ==========================================================
     3. STARFIELD (latar bintang, selaras index.js)
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
  function val(v) {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
  }
  function initial(nama) {
    var parts = String(nama || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  /* 'YYYY-MM-DD' -> '31 Jan 2027' tanpa objek Date (tidak bergeser zona waktu) */
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tglId(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m || m[1] === '0000') return null;
    return (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1];
  }
  /* masa berlaku dari sisa_hari server -> {k: kelas warna, t: teks} */
  function statusExp(simper) {
    if (!simper || simper.sisa_hari == null) return null;
    var d = simper.sisa_hari;
    if (d < 0) return { k: 'crit', t: 'Kedaluwarsa ' + (-d) + ' hari lalu' };
    if (d === 0) return { k: 'crit', t: 'Habis hari ini' };
    if (d <= CFG.segeraHari) return { k: 'warn', t: 'Habis dalam ' + d + ' hari' };
    return { k: 'ok', t: 'Berlaku · sisa ' + d + ' hari' };
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

  /* ==========================================================
     5. RENDER
     ========================================================== */
  var cur = null;        // karyawan yang sedang tampil (data server)
  var hariIni = '';      // tanggal server dari respons simper-list terakhir

  function headHTML(row) {
    if (!row) {
      return '<div class="pf-head"><div class="pf-ava blank">—</div>' +
        '<div class="pf-id"><div class="nm blank">Belum ada karyawan dipilih</div>' +
        '<div class="meta"><span class="muted">ID HO —</span><span class="sep">·</span>' +
        '<span class="muted">Jabatan —</span></div></div></div>';
    }
    var st = statusExp(row.simper);
    var lencana = !row.simper ? '<span class="bdg">Belum ada SIMPER</span>'
      : (st ? '<span class="bdg ' + st.k + '">' + esc(st.t) + '</span>' : '');
    return '<div class="pf-head">' +
      '<div class="pf-ava">' + esc(initial(row.nama)) + '</div>' +
      '<div class="pf-id"><div class="nm">' + esc(val(row.nama) || '—') + '</div>' +
      '<div class="meta"><span>' + esc(row.id_ho) + '</span><span class="sep">·</span>' +
      '<span class="muted">' + esc(val(row.jabatan) || '—') + '</span></div></div>' +
      '<div class="spacer"></div>' + lencana + '</div>';
  }

  /* kepala kartu: judul, keterangan kecil opsional, tombol aksi opsional */
  function cardHead(judul, ket, tombol) {
    return '<div class="c-head"><h3>' + judul + '</h3><span class="sp"></span>' +
      (ket ? '<span class="n">' + ket + '</span>' : '') + (tombol || '') + '</div>';
  }

  function cardSimper(row) {
    var blank = !row;
    var s = row && row.simper;
    var inner;
    if (!blank && !s) {
      inner = '<div class="none">Belum ada data SIMPER untuk karyawan ini.</div>';
    } else {
      inner = '<dl class="kv">' + SIMPER_FIELDS.map(function (f) {
        var key = f[0], label = f[1], jenis = f[2] || '';
        var v = blank ? null : val(s[key]);
        var isi = v === null ? '—' : esc(v);
        if (jenis === 'exp' && v !== null) {
          var st = statusExp(s);
          isi = esc(tglId(v) || v) + (st ? '<span class="sub ' + st.k + '">' + esc(st.t) + '</span>' : '');
        }
        var kls = v === null ? 'empty' : (jenis === 'm' ? 'm' : (jenis === 'cat' ? 'cat' : ''));
        return '<dt>' + esc(label) + '</dt><dd class="' + kls + '">' + isi + '</dd>';
      }).join('') + '</dl>';
    }
    var tombol = blank ? '' : (s
      ? '<button class="act" id="btnSimper" type="button">✎ Ubah</button>' +
        '<button class="act bahaya" id="btnHapusSimper" type="button">✕ Hapus</button>'
      : '<button class="act" id="btnSimper" type="button">＋ Tambah SIMPER</button>');
    return '<div class="card' + (blank ? ' blank' : '') + '">' +
      cardHead('SIMPER / SIMPOL', '', tombol) + inner + '</div>';
  }

  function cardSkill(row) {
    var blank = !row;
    var list = (row && Array.isArray(row.skill)) ? row.skill : [];
    var inner;
    if (blank) {
      inner = '<div class="none">—</div>';
    } else if (!list.length) {
      inner = '<div class="none">Belum ada skill unit yang tercatat.</div>';
    } else {
      inner = '<div class="tbl"><table class="mini"><thead><tr>' +
        '<th>Unit</th><th class="k">Kategori</th><th>Status</th><th class="t">Ditambah</th>' +
        '<th class="a"><span class="sr">Aksi</span></th></tr></thead><tbody>' +
        list.map(function (k, i) {
          var st = val(k.status);
          var kat = esc(val(k.kategori) || '—');
          var tgl = esc(tglId(k.tgl_ditambah) || '—');
          return '<tr><td class="u">' + esc(k.unit) + '<span class="kc">' + kat + ' · ' + tgl + '</span></td>' +
            '<td class="k">' + kat + '</td>' +
            '<td>' + (st ? '<span class="bdg sm ' + (SKILL_KELAS[st] || '') + '">' + esc(st) + '</span>' : '—') + '</td>' +
            '<td class="t">' + tgl + '</td>' +
            '<td class="a"><button class="ibtn" type="button" data-ubah="' + i + '" title="Ubah skill ' + esc(k.unit) + '"' +
            ' aria-label="Ubah skill ' + esc(k.unit) + '">✎</button>' +
            '<button class="ibtn bahaya" type="button" data-hapus="' + i + '" title="Hapus skill ' + esc(k.unit) + '"' +
            ' aria-label="Hapus skill ' + esc(k.unit) + '">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return '<div class="card' + (blank ? ' blank' : '') + '">' +
      cardHead('Skill Unit', blank ? '' : list.length + ' unit',
        blank ? '' : '<button class="act" id="btnSkill" type="button">＋ Tambah Skill</button>') +
      inner + '</div>';
  }

  function renderRow(row) {
    cur = row || null;
    $('pfBody').innerHTML = headHTML(row) +
      '<div class="grid">' + cardSimper(row) + cardSkill(row) + '</div>';
    $('pfState').textContent = row ? row.id_ho : 'kosong';
    if ($('btnSimper')) $('btnSimper').addEventListener('click', bukaSimper);
    if ($('btnHapusSimper')) $('btnHapusSimper').addEventListener('click', bukaHapusSimper);
    if ($('btnSkill')) $('btnSkill').addEventListener('click', bukaSkill);
    Array.prototype.forEach.call($('pfBody').querySelectorAll('[data-ubah]'), function (b) {
      b.addEventListener('click', function () { bukaUbahSkill(cur.skill[+b.getAttribute('data-ubah')]); });
    });
    Array.prototype.forEach.call($('pfBody').querySelectorAll('[data-hapus]'), function (b) {
      b.addEventListener('click', function () { bukaHapusSkill(cur.skill[+b.getAttribute('data-hapus')]); });
    });
  }

  function renderPicker(rows, terpotong) {
    cur = null;
    $('pfBody').innerHTML =
      '<div class="picker"><div class="lead">Ditemukan <b>' + rows.length + (terpotong ? '+' : '') +
      '</b> karyawan yang cocok' + (terpotong ? ' (hanya ' + rows.length + ' pertama ditampilkan — ketik lebih lengkap)' : '') +
      ' — pilih salah satu.</div><div class="plist">' +
      rows.map(function (r, i) {
        return '<button class="pitem" data-idx="' + i + '" type="button">' +
          '<div class="col"><span class="n">' + esc(r.nama) + '</span>' +
          '<span class="i">' + esc(r.id_ho) + '</span>' +
          '<span class="j">' + esc(val(r.jabatan) || '—') + '</span></div>' +
          '<span class="arw">→</span></button>';
      }).join('') + '</div></div>';
    $('pfState').textContent = rows.length + (terpotong ? '+' : '') + ' kecocokan';
    Array.prototype.forEach.call($('pfBody').querySelectorAll('.pitem'), function (b) {
      b.addEventListener('click', function () {
        renderRow(rows[+b.getAttribute('data-idx')]);
      });
    });
  }

  /* ==========================================================
     6. CARI, MUAT ULANG & BERSIHKAN
     ========================================================== */
  function doSearch() {
    if ($('btnSearch').disabled) return;            // permintaan sebelumnya masih jalan
    var q = String($('fQuery').value || '').trim();
    if (!q) {
      renderRow(null);
      toast('warn', 'Masukkan <b>nama</b> atau <b>ID HO</b> terlebih dahulu.');
      $('fQuery').focus();
      return;
    }
    $('btnSearch').disabled = true;
    setLink('wait', 'memuat…');
    $('pfBody').innerHTML = '<div class="state"><div class="spin"></div><br>Mencari data SIMPER…</div>';
    $('pfState').textContent = 'mencari…';

    fetch(CFG.fetchUrl + '?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then(bacaJson)
      .then(function (b) {
        var rows = Array.isArray(b.karyawan) ? b.karyawan : [];
        hariIni = b.hari_ini || hariIni;
        $('btnSearch').disabled = false;
        setLink('on', 'terhubung');
        if (!rows.length) {
          renderRow(null);
          $('pfState').textContent = 'tidak ditemukan';
          toast('warn', 'Tidak ada karyawan dengan nama / ID HO <b>' + esc(q) + '</b>.');
          return;
        }
        if (rows.length === 1) { renderRow(rows[0]); return; }
        renderPicker(rows, !!b.terpotong);
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e);
        cur = null;
        $('btnSearch').disabled = false;
        setLink('off', 'gagal');
        $('pfBody').innerHTML =
          '<div class="state"><div class="big">⚠</div>Gagal memuat data SIMPER dari server.<br>' +
          '<b>' + esc(msg) + '</b></div>';
        $('pfState').textContent = 'gagal';
      });
  }

  /* tarik ulang satu karyawan (sesudah simpan / bila server menolak
     karena data di layar sudah basi) supaya yang tampil = yang tersimpan */
  function muatUlang(id) {
    return fetch(CFG.fetchUrl + '?q=' + encodeURIComponent(id), { cache: 'no-store' })
      .then(bacaJson)
      .then(function (b) {
        hariIni = b.hari_ini || hariIni;
        var hit = (b.karyawan || []).filter(function (r) { return r.id_ho === id; })[0];
        if (hit) renderRow(hit);
      })
      .catch(function () {
        toast('warn', 'Data tersimpan, tetapi gagal dimuat ulang — tekan <b>Cari</b>.');
      });
  }

  function doClear() {
    $('fQuery').value = '';
    renderRow(null);
    setLink('on', 'siap');
    $('fQuery').focus();
  }

  /* ==========================================================
     7. POPUP — kerangka bersama
     ========================================================== */
  var popup = null;      // {simpan: fn -> Promise|null, tombol, sibuk} untuk popup yang sedang terbuka
  var asalFokus = null;  // tombol yang membuka popup (fokus dikembalikan saat tutup)

  function opsi(daftar, pilih, kosong) {
    return (kosong ? '<option value="">' + esc(kosong) + '</option>' : '') +
      daftar.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === pilih ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
  }
  /* pil (opsional): {tombol: label tombol utama, sibuk: label saat jalan,
     bahaya: true -> tombol merah}. Bawaan: Simpan / Menyimpan…  */
  function bukaPopup(judul, isi, simpan, pil) {
    pil = pil || {};
    popup = { simpan: simpan, tombol: pil.tombol || 'Simpan', sibuk: pil.sibuk || 'Menyimpan…' };
    asalFokus = document.activeElement;
    $('mTitle').textContent = judul;
    $('mSub').textContent = cur.nama + ' · ' + cur.id_ho;
    $('mBody').innerHTML = isi;
    $('mErr').hidden = true;
    $('mSimpan').disabled = false;
    $('mSimpan').textContent = popup.tombol;
    $('mSimpan').className = 'btn ' + (pil.bahaya ? 'bahaya' : 'primary');
    $('mask').hidden = false;
    document.body.classList.add('modal-on');
    // popup tanpa isian (konfirmasi hapus): fokus ke Batal, bukan ke tombol berbahaya
    var f = $('mBody').querySelector('input,select,textarea') || $('mBatal');
    f.focus();
  }
  function tutupPopup() {
    if (!popup) return;
    popup = null;
    $('mask').hidden = true;
    document.body.classList.remove('modal-on');
    if (asalFokus && document.body.contains(asalFokus)) asalFokus.focus();
  }
  function salahPopup(msg) {
    $('mErr').textContent = msg;
    $('mErr').hidden = false;
  }
  function nilai(nama) {
    var el = $('mForm').elements[nama];
    return el ? String(el.value || '').trim() : '';
  }

  $('mBatal').addEventListener('click', tutupPopup);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popup && !$('mSimpan').disabled) tutupPopup();
  });
  $('mForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!popup || $('mSimpan').disabled) return;
    $('mErr').hidden = true;
    var id = cur.id_ho;
    var jalan = popup.simpan();
    if (!jalan) return;                     // ditolak validasi di browser
    $('mSimpan').disabled = true;
    $('mSimpan').textContent = popup.sibuk;
    setLink('wait', popup.sibuk.toLowerCase());
    jalan.then(function (b) {
      setLink('on', 'terhubung');
      tutupPopup();
      toast('ok', '<b>Berhasil</b> — ' + esc(b.message || 'data diperbarui.'));
      muatUlang(id);
      muatRingkasan();
    }).catch(function (err) {
      setLink('off', 'ditolak');
      $('mSimpan').disabled = false;
      if (popup) $('mSimpan').textContent = popup.tombol;
      salahPopup(String((err && err.message) || err));
      // 409/404 = data di layar sudah basi (diubah orang lain): segarkan
      // kartunya di belakang popup supaya tombolnya ikut benar
      if (err && (err.code === 409 || err.code === 404)) muatUlang(id);
    });
  });

  /* ==========================================================
     8. POPUP SIMPER — tambah (belum punya) / ubah (sudah punya)
     ========================================================== */
  function bukaSimper() {
    if (!cur) return;
    var s = cur.simper || {};
    var mode = cur.simper ? 'ubah' : 'tambah';
    var isi =
      '<div class="fld"><label for="sOperator">Operator</label>' +
      '<input class="fin" id="sOperator" name="operator" maxlength="50" value="' + esc(s.operator) + '" placeholder="mis. DT"></div>' +
      '<div class="fld"><label for="sNo">No. Simpol</label>' +
      '<input class="fin m" id="sNo" name="no_simpol" maxlength="50" value="' + esc(s.no_simpol) + '" spellcheck="false"></div>' +
      '<div class="fld"><label for="sAccess">Access</label>' +
      '<select class="fin" id="sAccess" name="access">' + opsi(ACCESS, s.access, '— pilih —') + '</select></div>' +
      '<div class="fld"><label for="sClass">Class</label>' +
      '<select class="fin" id="sClass" name="class">' + opsi(CLASS, s['class'], '— pilih —') + '</select></div>' +
      '<div class="fld"><label for="sExp">Masa Berlaku (Exp)</label>' +
      '<input class="fin" id="sExp" name="exp" type="date" value="' + esc(s.exp) + '"></div>' +
      '<div class="fld full"><label for="sCat">Catatan</label>' +
      '<textarea class="fin" id="sCat" name="catatan" maxlength="1000" rows="3">' + esc(s.catatan) + '</textarea></div>' +
      '<div class="m-note">Kolom yang dikosongkan disimpan kosong. Satu karyawan hanya punya satu data SIMPER.</div>';

    bukaPopup(mode === 'tambah' ? 'Tambah SIMPER' : 'Ubah SIMPER', isi, function () {
      var data = { mode: mode, id_ho: cur.id_ho };
      ['operator', 'no_simpol', 'access', 'class', 'exp', 'catatan'].forEach(function (k) { data[k] = nilai(k); });
      var exp = $('sExp');
      if (exp.value === '' && exp.validity && exp.validity.badInput) {
        salahPopup('Tanggal masa berlaku belum lengkap.');
        return null;
      }
      if (!['operator', 'no_simpol', 'access', 'class', 'exp', 'catatan'].some(function (k) { return data[k]; })) {
        salahPopup('Isi minimal satu kolom.');
        return null;
      }
      return kirim(CFG.simperUrl, data);
    });
  }

  function bukaHapusSimper() {
    if (!cur || !cur.simper) return;
    var s = cur.simper;
    var ringkas = [
      ['No. Simpol', s.no_simpol], ['Class', s['class']], ['Access', s.access],
      ['Masa Berlaku', tglId(s.exp) || s.exp]
    ].map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd' + (val(p[1]) ? '' : ' class="empty"') + '>' + esc(val(p[1]) || '—') + '</dd>';
    }).join('');
    var isi =
      '<div class="fld full"><dl class="kv">' + ringkas + '</dl></div>' +
      '<div class="m-konfirm">Hapus data SIMPER milik <b>' + esc(cur.nama) + '</b>? ' +
      'Skill unit karyawan ini <b>tidak</b> ikut terhapus. ' +
      'Kalau SIMPER-nya hanya diperpanjang, pakai <b>Ubah</b> saja — tidak perlu dihapus.</div>';

    bukaPopup('Hapus SIMPER', isi, function () {
      return kirim(CFG.simperHapusUrl, { id_ho: cur.id_ho });
    }, { tombol: 'Hapus', sibuk: 'Menghapus…', bahaya: true });
  }

  /* ==========================================================
     9. POPUP SKILL — pilih unit dari tabel unit
     ========================================================== */
  var units = null;      // cache unit-list (dimuat sekali)

  function opsiUnit() {
    var punya = {};
    (cur.skill || []).forEach(function (k) { punya[k.id_unit] = k.status || true; });
    var grup = {}, urut = [];
    units.forEach(function (u) {
      var g = u.kategori || 'Tanpa kategori';
      if (!grup[g]) { grup[g] = []; urut.push(g); }
      grup[g].push(u);
    });
    return '<option value="">— pilih unit —</option>' + urut.map(function (g) {
      return '<optgroup label="' + esc(g) + '">' + grup[g].map(function (u) {
        var ada = punya[u.id_unit];
        return '<option value="' + u.id_unit + '"' + (ada ? ' disabled' : '') + '>' +
          esc(u.unit) + (ada ? ' — sudah ada' : '') + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  function bukaSkill() {
    if (!cur) return;
    var isi =
      '<div class="fld full"><label for="kUnit">Unit <span class="req">*</span></label>' +
      '<select class="fin" id="kUnit" name="skill"' + (units ? '' : ' disabled') + '>' +
      (units ? opsiUnit() : '<option value="">memuat daftar unit…</option>') + '</select></div>' +
      '<div class="fld"><label for="kStatus">Status <span class="req">*</span></label>' +
      '<select class="fin" id="kStatus" name="status">' + opsi(STATUS_SKILL, '', '— pilih —') + '</select></div>' +
      '<div class="fld"><label for="kTgl">Tanggal Ditambah</label>' +
      '<input class="fin" id="kTgl" name="tgl_ditambah" type="date" value="' + esc(hariIni) + '"' +
      (hariIni ? ' max="' + esc(hariIni) + '"' : '') + '></div>' +
      '<div class="m-note">Unit yang sudah tercatat untuk karyawan ini tidak bisa dipilih lagi. ' +
      'Tanggal kosong = hari ini.</div>';

    bukaPopup('Tambah Skill', isi, function () {
      if (!nilai('skill')) { salahPopup('Pilih unit terlebih dahulu.'); return null; }
      if (!nilai('status')) { salahPopup('Pilih status skill.'); return null; }
      return kirim(CFG.skillUrl, {
        id_ho: cur.id_ho, skill: Number(nilai('skill')),
        status: nilai('status'), tgl_ditambah: nilai('tgl_ditambah')
      });
    });

    if (!units) {
      fetch(CFG.unitUrl, { cache: 'no-store' })
        .then(bacaJson)
        .then(function (b) {
          units = Array.isArray(b.unit) ? b.unit : [];
          var sel = $('kUnit');
          if (!sel || !popup) return;          // popup sudah ditutup
          sel.innerHTML = opsiUnit();
          sel.disabled = false;
          sel.focus();
        })
        .catch(function (e) {
          salahPopup('Gagal memuat daftar unit — ' + String((e && e.message) || e));
        });
    }
  }

  /* ==========================================================
     10. POPUP UBAH / HAPUS SKILL
     ========================================================== */
  function infoUnit(k) {
    return '<div class="ro"><b>' + esc(k.unit) + '</b><span>' + esc(val(k.kategori) || '—') + '</span></div>';
  }

  function bukaUbahSkill(k) {
    if (!cur || !k) return;
    var isi =
      '<div class="fld full"><label>Unit</label>' + infoUnit(k) + '</div>' +
      '<div class="fld"><label for="kStatus">Status <span class="req">*</span></label>' +
      '<select class="fin" id="kStatus" name="status">' + opsi(STATUS_SKILL, k.status, '') + '</select></div>' +
      '<div class="fld"><label for="kTgl">Tanggal Ditambah <span class="req">*</span></label>' +
      '<input class="fin" id="kTgl" name="tgl_ditambah" type="date" value="' + esc(k.tgl_ditambah) + '"' +
      (hariIni ? ' max="' + esc(hariIni) + '"' : '') + '></div>' +
      '<div class="m-note">Unit tidak bisa diganti di sini — kalau unitnya salah, hapus skill ini lalu tambah yang benar.</div>';

    bukaPopup('Ubah Skill', isi, function () {
      if (!nilai('tgl_ditambah')) { salahPopup('Tanggal ditambah wajib diisi.'); return null; }
      return kirim(CFG.skillUbahUrl, {
        id_skill: k.id_skill, id_ho: cur.id_ho,
        status: nilai('status'), tgl_ditambah: nilai('tgl_ditambah')
      });
    });
  }

  function bukaHapusSkill(k) {
    if (!cur || !k) return;
    var isi =
      '<div class="fld full"><label>Unit</label>' + infoUnit(k) + '</div>' +
      '<div class="m-konfirm">Hapus skill ini dari <b>' + esc(cur.nama) + '</b>? ' +
      'Status <b>' + esc(val(k.status) || '—') + '</b>, ditambah <b>' + esc(tglId(k.tgl_ditambah) || '—') + '</b>. ' +
      'Data yang terhapus tidak bisa dikembalikan dari halaman ini.</div>';

    bukaPopup('Hapus Skill', isi, function () {
      return kirim(CFG.skillHapusUrl, { id_skill: k.id_skill, id_ho: cur.id_ho });
    }, { tombol: 'Hapus', sibuk: 'Menghapus…', bahaya: true });
  }

  /* ==========================================================
     11. RINGKASAN (panel 03)
     ========================================================== */
  var rkData = null;     // respons simper-ringkasan terakhir
  var rkSaring = '';     // teks saringan tabel unit (bertahan saat dimuat ulang)

  function tile(lab, n, kls, sub) {
    return '<div class="tile' + (kls ? ' ' + kls : '') + '"><div class="lab">' + esc(lab) + '</div>' +
      '<div class="num">' + n + '</div><div class="meta">' + esc(sub) + '</div></div>';
  }
  /* nama yang bisa diklik -> dibuka di panel 02 */
  function linkOrang(r) {
    return '<button class="nm-link" type="button" data-buka="' + esc(r.id_ho) + '">' + esc(r.nama) + '</button>' +
      '<span class="sub2">' + esc(r.id_ho) + (r.jabatan ? ' · ' + esc(r.jabatan) : '') + '</span>';
  }

  function renderRingkas(d) {
    rkData = d;
    var t = d.total;
    var tiles = [
      tile('Karyawan aktif', t.karyawan_aktif, '', t.punya_simper + ' punya SIMPER · ' + t.punya_skill + ' punya skill'),
      tile('SIMPER kedaluwarsa', t.kedaluwarsa, t.kedaluwarsa ? 'crit' : '', 'sudah lewat masa berlaku'),
      tile('Habis ≤ ' + d.batas_hari + ' hari', t.segera, t.segera ? 'warn' : '', 'segera diperpanjang'),
      tile('SIMPER bercatatan', t.catatan, '', 'kolom catatan terisi')
    ].concat(d.status.map(function (s) {
      return tile('Skill ' + s.status, s.skill, s.skill ? SKILL_KELAS[s.status] : '', s.orang + ' orang');
    })).join('');

    var exp = d.exp.length
      ? '<div class="tbl"><table class="mini"><thead><tr><th>Karyawan</th><th class="t">Exp</th><th class="s">Status</th></tr></thead><tbody>' +
        d.exp.map(function (r) {
          var st = statusExp(r);
          var tgl = esc(tglId(r.exp) || r.exp);
          var bdg = '<span class="bdg sm ' + st.k + '">' + esc(st.t) + '</span>';
          return '<tr><td>' + linkOrang(r) + '<span class="kc">' + tgl + bdg + '</span></td>' +
            '<td class="t">' + tgl + '</td><td class="s">' + bdg + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="none">Tidak ada SIMPER yang kedaluwarsa atau habis dalam ' + d.batas_hari + ' hari.</div>';

    var cat = d.catatan.length
      ? '<ul class="cat-list">' + d.catatan.map(function (r) {
          return '<li>' + linkOrang(r) + '<div class="cat-isi">' + esc(r.catatan) + '</div></li>';
        }).join('') + '</ul>'
      : '<div class="none">Belum ada SIMPER yang punya catatan.</div>';

    $('rkBody').innerHTML =
      '<div class="tiles">' + tiles + '</div>' +
      '<div class="rk-grid">' +
      '<div class="card">' + cardHead('Masa Berlaku Dekat', d.exp.length + ' orang') + exp + '</div>' +
      '<div class="card">' + cardHead('Catatan SIMPER', d.catatan.length + ' orang') + cat + '</div>' +
      '<div class="card full">' + cardHead('Orang per Unit', '',
        '<input class="fin sm" id="rkCari" type="search" placeholder="saring unit, mis. xcmg" autocomplete="off" spellcheck="false">') +
      '<div class="tbl"><table class="mini"><thead><tr><th>Unit</th><th class="k">Kategori</th>' +
      '<th class="r">Orang</th><th class="r">Full</th><th class="r"><span class="pj">Training</span><span class="pd">Trn</span></th>' +
      '<th class="r"><span class="pj">Parsial</span><span class="pd">Prs</span></th></tr></thead>' +
      '<tbody id="rkUnit"></tbody></table></div><div class="none" id="rkUnitKosong" hidden></div></div>' +
      '</div>';

    $('rkCari').value = rkSaring;
    $('rkCari').addEventListener('input', function () { rkSaring = this.value; renderUnit(); });
    Array.prototype.forEach.call($('rkBody').querySelectorAll('[data-buka]'), function (b) {
      b.addEventListener('click', function () { bukaKaryawan(b.getAttribute('data-buka')); });
    });
    renderUnit();
  }

  /* tanpa saringan: hanya unit yang punya orang. Dengan saringan: semua unit
     yang cocok, termasuk yang 0 orang (supaya "xcmg berapa?" tetap terjawab). */
  function renderUnit() {
    var q = String(rkSaring || '').trim().toLowerCase();
    var rows = rkData.unit.filter(function (u) {
      if (!q) return u.orang > 0;
      return (u.unit + ' ' + u.kategori).toLowerCase().indexOf(q) >= 0;
    });
    var angka = function (n, kls) {
      return '<td class="r num' + (n ? (kls ? ' ' + kls : '') : ' nol') + '">' + n + '</td>';
    };
    $('rkUnit').innerHTML = rows.map(function (u) {
      return '<tr><td class="u">' + esc(u.unit) + '<span class="kc">' + esc(u.kategori || '—') + '</span></td>' +
        '<td class="k">' + esc(u.kategori || '—') + '</td>' +
        angka(u.orang, 'tot') + angka(u.full, 'ok') + angka(u.training, 'warn') + angka(u.parsial, 'blue') + '</tr>';
    }).join('');
    var kosong = $('rkUnitKosong');
    kosong.hidden = rows.length > 0;
    kosong.textContent = q ? 'Tidak ada unit yang cocok dengan "' + rkSaring.trim() + '".' : 'Belum ada skill unit yang tercatat.';
  }

  function muatRingkasan() {
    $('rkState').textContent = 'memuat…';
    $('btnRingkas').disabled = true;
    fetch(CFG.ringkasUrl, { cache: 'no-store' })
      .then(bacaJson)
      .then(function (d) {
        renderRingkas(d);
        $('rkState').textContent = 'per ' + (tglId(d.hari_ini) || d.hari_ini);
      })
      .catch(function (e) {
        $('rkBody').innerHTML = '<div class="state"><div class="big">⚠</div>Gagal memuat ringkasan.<br><b>' +
          esc(String((e && e.message) || e)) + '</b></div>';
        $('rkState').textContent = 'gagal';
      })
      .then(function () { $('btnRingkas').disabled = false; });
  }

  /* klik nama di ringkasan: cari ID-nya, lalu gulir ke panel 02 */
  function bukaKaryawan(id) {
    $('fQuery').value = id;
    doSearch();
    $('pfBody').parentNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ==========================================================
     12. PASANG & BOOT
     ========================================================== */
  $('btnSearch').addEventListener('click', doSearch);
  $('btnClear').addEventListener('click', doClear);
  $('fQuery').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  $('btnRingkas').addEventListener('click', muatRingkasan);

  /* kartu karyawan kosong (tanpa memanggil server) + ringkasan dimuat */
  renderRow(null);
  muatRingkasan();
  setLink('on', 'siap');
  $('fQuery').focus();
})();

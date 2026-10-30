/* ============================================================
   MAGI//SYSTEM — Warning (surat peringatan karyawan)
   ------------------------------------------------------------
   Markup + logika ada di file ini; gaya di warning.css;
   warning.html hanya shell kosong berisi <div id="app">.
   Tanpa aset eksternal (busybox httpd hanya melayani folder ini).

   Alur (kerangka — logika lanjutan menyusul):
     1. Panel 01 Input Warning (atas, selebar halaman) — cari
        karyawan (nama / ID HO), isi pelanggaran, sanksi, tanggal
        diberi (bawaan hari ini), pembina (karyawan aktif berstatus
        Staff / Sr.Staff), catatan dan status (kosong / Done /
        Cancel), lalu "Simpan Warning". Satu simpan = satu baris
        karyawan_warning.
     2. Panel 02 Daftar Warning (bawah, selebar halaman) — warning
        terbaru dari semua karyawan, bisa disaring per nama / ID /
        isi; 🖨 mencetak form warning sebagai PDF (magi-api -> workflow
        n8n "Cetak Form Warning" yang mengisi Google Sheet "Tamplate
        form warning": tab Konseling untuk Verbal / Konseling, tab
        Warning untuk Pertama / Kedua / Ketiga), ✉ mengirim email
        warning (magi-api -> workflow n8n "Email Warning" yang mengisi
        template email lalu mengirimnya lewat Gmail ke alamat yang
        ditulis tetap di workflow itu),
        ✎ membuka popup ubah (semua isian kecuali karyawan, mis.
        status jadi Done / Cancel), ✕ menghapus baris yang salah
        input. Kiriman email & cetakan yang berhasil tercatat di bawah
        status ("✉ …" / "🖨 …", dari audit_log). Kolom Masa Berlaku = tanggal sanksi
        terakhir (tgl diberi + Verbal/Konseling 3, Pertama 4, Kedua 5,
        Ketiga 6 bulan - 1 hari — dihitung magi-api) dan sisa harinya; baris
        merah = masih dalam masa sanksi, hijau = sudah selesai (tanggal
        berakhir sudah lewat, atau status Done / Cancel).

   Sumber (magi-api, routes/warning.js; semua butuh hak fitur 'warning'):
     GET  warning-list          katalog sanksi + pembina + daftar warning
     GET  warning-karyawan?q=   cari karyawan aktif
     POST warning-tambah        {id_ho, pelanggaran, sanksi, tgl_war_diberi,
                                 pembina, war_catatan, status}
     POST warning-ubah          {id_warning, ...isian yang sama tanpa id_ho}
     POST warning-email         {id_warning} -> n8n "Email Warning"
     POST warning-cetak         {id_warning} -> n8n "Cetak Form Warning" -> PDF
     POST warning-hapus         {id_warning}
   ============================================================ */
(function () {
  'use strict';

  /* ==========================================================
     1. KONFIG
     ========================================================== */
  var CFG = {
    homePage: './index.html',
    listUrl: MAGI.url('/webhook/warning-list'),
    cariUrl: MAGI.url('/webhook/warning-karyawan'),
    tambahUrl: MAGI.url('/webhook/warning-tambah'),
    ubahUrl: MAGI.url('/webhook/warning-ubah'),
    emailUrl: MAGI.url('/webhook/warning-email'),
    cetakUrl: MAGI.url('/webhook/warning-cetak'),
    hapusUrl: MAGI.url('/webhook/warning-hapus')
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
    '<div class="sub">Warning · Surat Peringatan</div></div>',
    '<div class="hud-spacer"></div>',
    '<button class="rfr" id="btnRefresh" type="button">↻ Perbarui</button>',
    '<a class="back" href="' + CFG.homePage + '">← Mission Control</a>',
    '<div class="pill"><span class="dot" id="linkDot"></span><span id="linkTxt">memuat…</span></div>',
    '</header>',

    '<div class="lead"><b>1. Input</b> — pilih karyawan, isi pelanggaran, sanksi, tanggal, dan pembina (staff), lalu <b>Simpan Warning</b>. ',
    '<b>2. Daftar Warning</b> — semua warning yang sudah dicatat, terbaru di atas; <b>🖨</b> untuk mencetak form (PDF), <b>✉</b> untuk mengirim email warning, <b>✎</b> untuk mengubah (mis. status <b>Done</b> / <b>Cancel</b>), <b>✕</b> untuk menghapus.</div>',

    '<div class="deck">',

    /* ---- 01 input ---- */
    '<section class="panel" id="pInput"><div class="p-head"><span class="idx">01</span><h2>Input Warning</h2></div>',
    '<form class="p-body ingrid" id="fWarning" novalidate>',
    '<div class="kol">',
    '<div class="fld"><label for="fCari">Karyawan <span class="req">*</span></label>',
    '<div class="cari"><input class="inp" id="fCari" type="text" maxlength="100" placeholder="nama atau ID HO" autocomplete="off" spellcheck="false">',
    '<button class="btn" id="btnCari" type="button">Cari</button></div></div>',
    '<div id="karBox"></div>',
    '</div>',
    '<div class="kol">',
    '<div class="fld"><label for="fPelanggaran">Pelanggaran <span class="req">*</span></label>',
    '<textarea class="txa tinggi" id="fPelanggaran" maxlength="2000" placeholder="uraian pelanggaran"></textarea></div>',
    '<div class="fld"><label for="fCatatan">Catatan</label>',
    '<textarea class="txa" id="fCatatan" maxlength="2000" placeholder="opsional"></textarea></div>',
    '</div>',
    '<div class="kol">',
    '<div class="fgrid">',
    '<div class="fld"><label for="fSanksi">Sanksi <span class="req">*</span></label>',
    '<select class="sel" id="fSanksi"><option value="">— pilih —</option></select></div>',
    '<div class="fld"><label for="fTgl">Tanggal diberi</label>',
    '<input class="inp" id="fTgl" type="date"></div>',
    '</div>',
    '<div class="fld"><label for="fPembina">Pembina <span class="req">*</span></label>',
    '<select class="sel" id="fPembina"><option value="">— pilih staff —</option></select></div>',
    '<div class="fld"><label for="fStatus">Status</label>',
    '<select class="sel" id="fStatus"><option value="">—</option></select></div>',
    '<div class="aksi"><button class="btn primary" id="btnSimpan" type="submit" disabled>＋ Simpan Warning</button></div>',
    '</div>',
    '</form></section>',

    /* ---- 02 daftar ---- */
    '<section class="panel" id="pDaftar"><div class="p-head"><span class="idx">02</span><h2>Daftar Warning</h2>',
    '<span class="spacer"></span><span class="cnt" id="dCnt"></span>',
    '<input class="inp saring" id="fSaring" type="search" placeholder="saring nama / ID / isi" autocomplete="off" spellcheck="false" aria-label="Saring daftar warning"></div>',
    '<div class="tbl"><table class="daftar"><thead><tr>',
    '<th class="c-no">No</th><th>Karyawan</th><th>Sanksi</th><th>Diberi</th><th>Masa Berlaku</th><th>Pelanggaran</th>',
    '<th>Pembina</th><th>Catatan</th><th>Status</th><th class="c-a"><span class="sr">Aksi</span></th>',
    '</tr></thead><tbody id="dTb"><tr><td colspan="10" class="empty">Memuat…</td></tr></tbody></table></div>',
    '<div class="potong" id="dPotong" hidden></div>',
    '</section>',

    '</div>',

    '<div class="foot">MAGI//SYSTEM · <a href="' + CFG.homePage + '">Mission Control</a> · Warning · setiap input, ubah, hapus, cetak &amp; kirim email tercatat di audit_log</div>',
    '</div>',

    /* ---- popup bersama (hapus / ubah) ---- */
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
  /* 'YYYY-MM-DD' -> '28 Okt 2026' tanpa objek Date */
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tglId(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return String(s || '—');
    return (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1];
  }
  /* 'YYYY-MM-DD HH:MM' (WIB, dari MySQL) -> '28 Okt 2026 14:50' */
  function waktuId(s) {
    var m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(String(s || ''));
    return m ? tglId(m[1]) + ' ' + m[2] : tglId(s);
  }
  function badgeSanksi(s) {
    return '<span class="bdg s-' + esc(String(s || '').toLowerCase()) + '">' + esc(s) + '</span>';
  }
  function badgeStatus(s) {
    return s ? '<span class="bdg st-' + esc(String(s).toLowerCase()) + '">' + esc(s) + '</span>' : '—';
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
  /* POST yang dibalas PDF (warning-cetak) -> {blob, nama}; gagal -> Error
     berisi pesan server, sama dengan kirim(). */
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
      var nama = 'form-warning.pdf';
      try { if (m) nama = decodeURIComponent(m[1]); } catch (e) { /* nama bawaan */ }
      return r.blob().then(function (blob) { return { blob: blob, nama: nama }; });
    });
  }
  function pesan(e) { return String((e && e.message) || e); }

  /* ==========================================================
     5. DATA
     ========================================================== */
  var data = { hari_ini: '', sanksi: [], masa_bulan: {}, pilihan_status: [], pembina: [], warning: [], terpotong: false };   // respons warning-list terakhir
  var kar = null;          // karyawan yang sedang diinput {id_ho, nama, jabatan, dept}
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
          hari_ini: String(b.hari_ini || ''),
          sanksi: Array.isArray(b.sanksi) ? b.sanksi : [],
          masa_bulan: b.masa_bulan && typeof b.masa_bulan === 'object' ? b.masa_bulan : {},
          pilihan_status: Array.isArray(b.pilihan_status) ? b.pilihan_status : [],
          pembina: Array.isArray(b.pembina) ? b.pembina : [],
          warning: Array.isArray(b.warning) ? b.warning : [],
          terpotong: !!b.terpotong
        };
        if (!$('fTgl').value) $('fTgl').value = data.hari_ini;
        renderSanksi();
        renderPembina();
        renderStatus();
        renderDaftar();
        setLink('on', 'terhubung');
      })
      .catch(function (e) {
        setLink('off', 'gagal');
        $('dTb').innerHTML = '<tr><td colspan="10" class="empty">Gagal memuat daftar warning.<br><b>' + esc(pesan(e)) + '</b></td></tr>';
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
    renderKar();
    renderPembina();
    updateSimpan();
    $('fPelanggaran').focus();
  }
  function gantiKar() {
    kar = null;
    renderKar();
    renderPembina();
    updateSimpan();
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
    renderPembina();
    updateSimpan();
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

  /* Pembangun <option> — dipakai form input dan popup ubah */
  function opsiSanksi(pilih) {
    return '<option value="">— pilih —</option>' + data.sanksi.map(function (s) {
      var bln = data.masa_bulan[s];
      return '<option value="' + esc(s) + '"' + (s === pilih ? ' selected' : '') + '>' + esc(s) +
        (bln ? ' · ' + bln + ' bulan' : '') + '</option>';
    }).join('');
  }
  /* staff aktif; `diri` (karyawan yang diberi warning) tidak bisa dipilih.
     namaLama: pembina yang sudah tercatat tapi kini bukan staff aktif — tetap
     ditawarkan di popup ubah supaya bisa dipertahankan (server mengizinkan). */
  function opsiPembina(pilih, diri, namaLama) {
    var ada = data.pembina.some(function (p) { return p.id_ho === pilih; });
    var html = '<option value="">' + (data.pembina.length ? '— pilih staff —' : '— belum ada staff aktif —') + '</option>';
    if (pilih && !ada && namaLama != null) {
      html += '<option value="' + esc(pilih) + '" selected>' + esc(namaLama || pilih) + ' · ' + esc(pilih) + ' (bukan staff aktif lagi)</option>';
    }
    return html + data.pembina.map(function (p) {
      var mati = !!diri && p.id_ho === diri;
      return '<option value="' + esc(p.id_ho) + '"' + (p.id_ho === pilih && !mati ? ' selected' : '') + (mati ? ' disabled' : '') + '>' +
        esc(p.nama) + ' · ' + esc(p.id_ho) + (p.jabatan ? ' · ' + esc(p.jabatan) : '') + '</option>';
    }).join('');
  }
  function opsiStatus(pilih) {
    return '<option value="">—</option>' + data.pilihan_status.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === pilih ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
  }

  /* dropdown form input diisi ulang setiap muat(); pilihan yang masih ada dipertahankan */
  function renderSanksi() {
    $('fSanksi').innerHTML = opsiSanksi($('fSanksi').value);
    updateSimpan();
  }
  /* karyawan yang sedang diinput tidak bisa menjadi pembinanya sendiri */
  function renderPembina() {
    $('fPembina').innerHTML = opsiPembina($('fPembina').value, kar && kar.id_ho);
    updateSimpan();
  }
  function renderStatus() {
    $('fStatus').innerHTML = opsiStatus($('fStatus').value);
  }

  function isiForm() {
    return {
      pelanggaran: String($('fPelanggaran').value || '').trim(),
      sanksi: $('fSanksi').value,
      tgl_war_diberi: $('fTgl').value,
      pembina: $('fPembina').value,
      war_catatan: String($('fCatatan').value || '').trim(),
      status: String($('fStatus').value || '').trim()
    };
  }
  var sibukSimpan = false;
  function updateSimpan() {
    var f = isiForm();
    $('btnSimpan').disabled = sibukSimpan || !kar || !f.pelanggaran || !f.sanksi || !f.pembina;
  }
  ['fPelanggaran', 'fSanksi', 'fPembina'].forEach(function (id) {
    $(id).addEventListener('input', updateSimpan);
    $(id).addEventListener('change', updateSimpan);
  });

  function kosongkanForm() {
    kar = null;
    $('fCari').value = '';
    $('fPelanggaran').value = '';
    $('fSanksi').value = '';
    $('fTgl').value = data.hari_ini;
    $('fPembina').value = '';
    $('fCatatan').value = '';
    $('fStatus').value = '';
    renderKar();
    renderPembina();
  }

  function doSimpan(e) {
    if (e) e.preventDefault();
    var f = isiForm();
    if (sibukSimpan || !kar || !f.pelanggaran || !f.sanksi || !f.pembina) return;
    var nama = kar.nama;
    sibukSimpan = true;
    updateSimpan();
    $('btnSimpan').textContent = 'Menyimpan…';
    kirim(CFG.tambahUrl, {
      id_ho: kar.id_ho, pelanggaran: f.pelanggaran, sanksi: f.sanksi, tgl_war_diberi: f.tgl_war_diberi,
      pembina: f.pembina, war_catatan: f.war_catatan, status: f.status
    })
      .then(function (b) {
        toast('ok', '<b>' + esc(nama) + '</b> — ' + esc(b.message || 'warning dicatat.'));
        kosongkanForm();
        return muat().then(function () { $('fCari').focus(); });
      })
      .catch(function (er) {
        toast('crit', '<b>Gagal menyimpan</b> — ' + esc(pesan(er)));
        // 422 bisa berarti daftar pembina di layar sudah basi
        if (er && er.code === 422) muat();
      })
      .then(function () {
        sibukSimpan = false;
        $('btnSimpan').textContent = '＋ Simpan Warning';
        updateSimpan();
      });
  }

  /* ==========================================================
     7. PANEL 02 — DAFTAR WARNING
     ========================================================== */
  function cocok(w, kata) {
    if (!kata) return true;
    return [w.nama, w.id_ho, w.pelanggaran, w.sanksi, w.nama_pembina, w.pembina, w.war_catatan, w.status,
      w.berlaku ? 'masih berlaku' : 'selesai']
      .join(' ').toLowerCase().indexOf(kata) >= 0;
  }
  /* berlaku & sisa_hari dari magi-api; `berakhir` = hari terakhir masa
     berlaku, jadi sisa_hari 0 = hari ini hari terakhir. Tidak berlaku padahal
     sisa_hari >= 0 = ditutup lebih awal oleh status Done / Cancel. */
  function teksSisa(w) {
    if (w.berlaku) return w.sisa_hari === 0 ? 'hari terakhir' : 'sisa ' + w.sisa_hari + ' hari';
    if (w.sisa_hari >= 0) return 'selesai · status ' + w.status;
    return 'selesai ' + (-w.sisa_hari) + ' hari lalu';
  }
  function renderDaftar() {
    var kata = String($('fSaring').value || '').trim().toLowerCase();
    var rows = data.warning.filter(function (w) { return cocok(w, kata); });
    var aktif = data.warning.filter(function (w) { return w.berlaku; }).length;
    $('dCnt').textContent = (kata ? rows.length + ' dari ' : '') + data.warning.length + ' warning · ' +
      aktif + ' masih berlaku · ' + (data.warning.length - aktif) + ' selesai';
    $('dPotong').hidden = !data.terpotong;
    $('dPotong').textContent = data.terpotong ? 'Hanya ' + data.warning.length + ' warning terbaru yang ditampilkan.' : '';
    if (!rows.length) {
      $('dTb').innerHTML = '<tr><td colspan="10" class="empty">' + (data.warning.length
        ? 'Tidak ada warning yang cocok dengan saringan.'
        : 'Belum ada warning yang dicatat. Mulai dari panel <b>01 Input Warning</b>.') + '</td></tr>';
      return;
    }
    $('dTb').innerHTML = rows.map(function (w, i) {
      return '<tr class="' + (w.berlaku ? 'aktif' : 'selesai') + '">' +
        '<td class="c-no">' + (i + 1) + '</td>' +
        '<td><span class="nm">' + esc(w.nama) + '</span><span class="kc">' + esc(w.id_ho) +
        (w.jabatan ? ' · ' + esc(w.jabatan) : '') + '</span></td>' +
        '<td>' + badgeSanksi(w.sanksi) + '</td>' +
        '<td class="c-tgl">' + esc(tglId(w.tgl_war_diberi)) + '</td>' +
        '<td class="c-masa"><span class="ms">s.d. ' + esc(tglId(w.berakhir)) + '</span>' +
        '<span class="kc">' + (w.masa_bulan ? w.masa_bulan + ' bulan · ' : '') + esc(teksSisa(w)) + '</span></td>' +
        '<td class="c-lebar">' + esc(w.pelanggaran) + '</td>' +
        '<td><span class="nm">' + esc(w.nama_pembina || '—') + '</span><span class="kc">' + esc(w.pembina) + '</span></td>' +
        '<td class="c-lebar">' + (w.war_catatan ? esc(w.war_catatan) : '—') + '</td>' +
        '<td>' + badgeStatus(w.status) +
        (w.email ? '<span class="kc em" title="Email warning terkirim ' + w.email.kali + '×">✉ ' + esc(waktuId(w.email.pada)) +
          (w.email.kali > 1 ? ' (' + w.email.kali + '×)' : '') + '</span>' : '') +
        (w.cetak ? '<span class="kc ct" title="Form warning dicetak ' + w.cetak.kali + '×">🖨 ' + esc(waktuId(w.cetak.pada)) +
          (w.cetak.kali > 1 ? ' (' + w.cetak.kali + '×)' : '') + '</span>' : '') + '</td>' +
        '<td class="c-a"><div class="aksi4"><button class="ibtn cetak" type="button" data-cetak="' + w.id_warning + '" title="Cetak form warning (PDF)"' +
        ' aria-label="Cetak form warning ' + esc(w.sanksi) + ' milik ' + esc(w.nama) + '">🖨</button>' +
        '<button class="ibtn email" type="button" data-email="' + w.id_warning + '" title="Kirim email warning"' +
        ' aria-label="Kirim email warning ' + esc(w.sanksi) + ' milik ' + esc(w.nama) + '">✉</button>' +
        '<button class="ibtn ubah" type="button" data-ubah="' + w.id_warning + '" title="Ubah warning"' +
        ' aria-label="Ubah warning ' + esc(w.sanksi) + ' milik ' + esc(w.nama) + '">✎</button>' +
        '<button class="ibtn" type="button" data-hapus="' + w.id_warning + '" title="Hapus warning"' +
        ' aria-label="Hapus warning ' + esc(w.sanksi) + ' milik ' + esc(w.nama) + '">✕</button></div></td></tr>';
    }).join('');
  }
  $('fSaring').addEventListener('input', renderDaftar);
  function cariWarning(idw) {
    return data.warning.filter(function (x) { return x.id_warning === idw; })[0];
  }
  $('dTb').addEventListener('click', function (e) {
    var ct = e.target.closest ? e.target.closest('[data-cetak]') : null;
    if (ct) {
      var wc = cariWarning(+ct.getAttribute('data-cetak'));
      if (wc) bukaCetak(wc);
      return;
    }
    var em = e.target.closest ? e.target.closest('[data-email]') : null;
    if (em) {
      var we = cariWarning(+em.getAttribute('data-email'));
      if (we) bukaEmail(we);
      return;
    }
    var u = e.target.closest ? e.target.closest('[data-ubah]') : null;
    if (u) {
      var wu = cariWarning(+u.getAttribute('data-ubah'));
      if (wu) bukaUbah(wu);
      return;
    }
    var b = e.target.closest ? e.target.closest('[data-hapus]') : null;
    if (!b) return;
    var w = cariWarning(+b.getAttribute('data-hapus'));
    if (!w) return;
    bukaPopup('Hapus Warning', w.nama + ' · ' + w.id_ho,
      'Hapus warning <b>' + esc(w.sanksi) + '</b> tanggal <b>' + esc(tglId(w.tgl_war_diberi)) + '</b> milik <b>' + esc(w.nama) + '</b>? ' +
      'Isi baris tercatat di audit_log.',
      function () { return kirim(CFG.hapusUrl, { id_warning: w.id_warning }); },
      { tombol: 'Hapus', sibuk: 'Menghapus…', bahaya: true });
  });

  /* Popup kirim email: data dibaca ulang magi-api dari database (bukan dari
     layar), lalu workflow n8n "Email Warning" mengisi template & mengirim.
     Penerima diatur di workflow itu, bukan di sini. */
  function bukaEmail(w) {
    var isi = 'Kirim email warning <b>' + esc(w.sanksi) + '</b> milik <b>' + esc(w.nama) + '</b> (' + esc(w.id_ho) + ')?' +
      '<ul class="m-list">' +
      '<li><span class="k">Diberi</span>' + esc(tglId(w.tgl_war_diberi)) + '</li>' +
      '<li><span class="k">Masa berlaku</span>s.d. ' + esc(tglId(w.berakhir)) + ' — ' + esc(teksSisa(w)) + '</li>' +
      '<li><span class="k">Pelanggaran</span>' + esc(w.pelanggaran) + '</li>' +
      '<li><span class="k">Pembina</span>' + esc(w.nama_pembina || w.pembina) + '</li>' +
      '</ul>' +
      (w.email ? '<div class="m-note">Warning ini <b>sudah pernah dikirim ' + w.email.kali + '×</b>, terakhir ' +
        esc(waktuId(w.email.pada)) + ' WIB — kalau dilanjutkan, email dikirim lagi.</div>' : '') +
      '<div class="m-foot-note">Isi email dibentuk dan dikirim oleh workflow n8n <b>Email Warning</b>; alamat penerima diatur di workflow itu.</div>';
    bukaPopup('Kirim Email Warning', w.nama + ' · ' + w.id_ho, isi, function () {
      return kirim(CFG.emailUrl, { id_warning: w.id_warning });
    }, { tombol: '✉ Kirim Email', sibuk: 'Mengirim…' });
  }

  /* Popup cetak form: data dibaca ulang magi-api dari database, workflow n8n
     "Cetak Form Warning" mengisi salinan Google Sheet "Tamplate form warning"
     (tab Konseling untuk Verbal / Konseling, tab Warning untuk Pertama / Kedua /
     Ketiga) lalu membalas dengan PDF-nya. Hasilnya tampil sebagai tombol Buka /
     Unduh di popup: membuka tab baru otomatis sesudah menunggu ±15 detik
     diblokir browser karena bukan lagi akibat klik. */
  var FORM = { Verbal: 'Formulir Pembinaan/Konseling', Konseling: 'Formulir Pembinaan/Konseling',
    Pertama: 'Surat Peringatan Pertama', Kedua: 'Surat Peringatan Kedua', Ketiga: 'Surat Peringatan Ketiga' };
  var pdfUrl = null;     // object URL PDF terakhir (dilepas saat cetak berikutnya)
  function bukaCetak(w) {
    var isi = 'Cetak <b>' + esc(FORM[w.sanksi] || w.sanksi) + '</b> untuk <b>' + esc(w.nama) + '</b> (' + esc(w.id_ho) + ')?' +
      '<ul class="m-list">' +
      '<li><span class="k">Sanksi</span>' + esc(w.sanksi) + '</li>' +
      '<li><span class="k">Diberi</span>' + esc(tglId(w.tgl_war_diberi)) + '</li>' +
      '<li><span class="k">Pelanggaran</span>' + esc(w.pelanggaran) + '</li>' +
      '<li><span class="k">Pembina</span>' + esc(w.nama_pembina || w.pembina) + '</li>' +
      '</ul>' +
      (w.cetak ? '<div class="m-note">Form ini <b>sudah pernah dicetak ' + w.cetak.kali + '×</b>, terakhir ' +
        esc(waktuId(w.cetak.pada)) + ' WIB.</div>' : '') +
      '<div class="m-foot-note">Form disusun workflow n8n <b>Cetak Form Warning</b> dari Google Sheet ' +
      '<b>Tamplate form warning</b> — butuh ±10–20 detik.</div>';
    bukaPopup('Cetak Form Warning', w.nama + ' · ' + w.id_ho, isi, function () {
      return kirimPdf(CFG.cetakUrl, { id_warning: w.id_warning });
    }, { tombol: '🖨 Cetak PDF', sibuk: 'Menyusun form…', selesai: function (b) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(b.blob);
      $('mBody').innerHTML = '<b>Form siap</b> — ' + esc(b.nama) + ' (' + Math.max(1, Math.round(b.blob.size / 1024)) + ' KB).' +
        '<div class="m-pdf"><a class="btn primary" id="mBukaPdf" href="' + pdfUrl + '" target="_blank" rel="noopener">Buka PDF</a>' +
        '<a class="btn" href="' + pdfUrl + '" download="' + esc(b.nama) + '">⤓ Unduh</a></div>' +
        '<div class="m-foot-note">Cetak dari penampil PDF (Ctrl+P). Salinan Google Sheet yang dipakai sudah dibuang ke Trash Drive.</div>';
      $('mBukaPdf').focus();
      toast('ok', '<b>Form siap</b> — ' + esc(b.nama));
    } });
  }

  /* Popup ubah: semua isian kecuali karyawan. Nilai teks diisi lewat .value
     (bukan disisipkan ke HTML) supaya isi apa pun tampil apa adanya. */
  function bukaUbah(w) {
    var isi = '<div class="mform">' +
      '<div class="fld"><label for="uPelanggaran">Pelanggaran <span class="req">*</span></label>' +
      '<textarea class="txa" id="uPelanggaran" maxlength="2000"></textarea></div>' +
      '<div class="fgrid">' +
      '<div class="fld"><label for="uSanksi">Sanksi <span class="req">*</span></label>' +
      '<select class="sel" id="uSanksi">' + opsiSanksi(w.sanksi) + '</select></div>' +
      '<div class="fld"><label for="uTgl">Tanggal diberi <span class="req">*</span></label>' +
      '<input class="inp" id="uTgl" type="date"></div>' +
      '</div>' +
      '<div class="fld"><label for="uPembina">Pembina <span class="req">*</span></label>' +
      '<select class="sel" id="uPembina">' + opsiPembina(w.pembina, w.id_ho, w.nama_pembina) + '</select></div>' +
      '<div class="fld"><label for="uCatatan">Catatan</label>' +
      '<textarea class="txa" id="uCatatan" maxlength="2000"></textarea></div>' +
      '<div class="fld"><label for="uStatus">Status</label>' +
      '<select class="sel" id="uStatus">' + opsiStatus(w.status) + '</select></div>' +
      '</div>';
    bukaPopup('Ubah Warning', w.nama + ' · ' + w.id_ho, isi, function () {
      return kirim(CFG.ubahUrl, {
        id_warning: w.id_warning,
        pelanggaran: String($('uPelanggaran').value || '').trim(),
        sanksi: $('uSanksi').value,
        tgl_war_diberi: $('uTgl').value,
        pembina: $('uPembina').value,
        war_catatan: String($('uCatatan').value || '').trim(),
        status: $('uStatus').value
      });
    }, { tombol: 'Simpan Perubahan', sibuk: 'Menyimpan…', fokus: 'uStatus' });
    $('uPelanggaran').value = w.pelanggaran;
    $('uTgl').value = w.tgl_war_diberi;
    $('uCatatan').value = w.war_catatan;
  }

  /* ==========================================================
     8. POPUP — bersama (konfirmasi hapus / kirim email / cetak, form ubah)
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
    $(pil.fokus || 'mBatal').focus();
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
    p.jalan().then(function (b) {
      $('mBatal').disabled = false;
      if (p.selesai && popup === p) {
        $('mYa').hidden = true;
        $('mYa').disabled = false;
        $('mBatal').textContent = 'Tutup';
        p.selesai(b);
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
      // 404 = data di layar sudah basi (dihapus orang lain), 422 = daftar pembina
      // mungkin basi: segarkan di belakang popup. Kirim email yang gagal juga
      // tercatat (audit_log) tapi tidak mengubah tanda "✉ terkirim".
      if (e && (e.code === 404 || e.code === 422)) muat();
    });
  });

  /* ==========================================================
     9. PASANG & BOOT
     ========================================================== */
  $('btnRefresh').addEventListener('click', muat);
  $('btnCari').addEventListener('click', doCari);
  $('fCari').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doCari(); }
  });
  $('fWarning').addEventListener('submit', doSimpan);

  renderKar();
  muat();
  $('fCari').focus();
})();

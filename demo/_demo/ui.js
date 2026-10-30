/* ============================================================
   MAGI//SYSTEM — MODE DEMO · ui.js
   ------------------------------------------------------------
   Tambahan tampilan khusus versi portofolio (halaman asli tidak
   diubah):
     - pil "DEMO" di kiri bawah: penjelasan, panduan coba-coba,
       reset data, kembali ke portofolio
     - halaman login: kartu akun demo + masuk otomatis lewat
       ?demo=admin|operator (dipakai tautan di portofolio)
     - modal Import Roster: unduh contoh berkas roster (.csv)
   ============================================================ */
(function () {
  'use strict';
  var D = window.MAGI_DEMO;
  var halaman = location.pathname.split('/').pop() || 'index.html';
  var AKUN = {
    admin: { u: 'andhika', p: 'MagiAdmin2026', label: 'Administrator', ket: 'semua modul + kelola akun' },
    operator: { u: 'siti', p: 'MagiOperator2026', label: 'Operator', ket: 'hak terbatas: MBR, roster, karyawan, absensi, AFL, to do' }
  };
  var PORTOFOLIO = '../index.html';

  /* tautan portofolio ?demo=... : lupakan sesi lama SEBELUM login.js memeriksanya */
  var mintaDemo = new URLSearchParams(location.search).get('demo');
  if (halaman === 'login.html' && AKUN[mintaDemo]) {
    try { sessionStorage.removeItem('magi.auth'); localStorage.removeItem(D.KUNCI_SESI); } catch (e) {}
  }

  var CSS = [
    '.dm-pil{position:fixed;left:14px;bottom:14px;z-index:9998;display:flex;align-items:center;gap:8px;cursor:pointer;',
    '  font:700 10px/1 "DejaVu Sans Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#1a0e06;',
    '  background:linear-gradient(180deg,#FFB03A,#FF6A1F);border:0;border-radius:999px;padding:8px 13px;box-shadow:0 6px 22px rgba(255,106,31,.35)}',
    '.dm-pil .t{width:7px;height:7px;border-radius:50%;background:#1a0e06;box-shadow:0 0 0 3px rgba(26,14,6,.18)}',
    '.dm-pil:focus-visible{outline:2px solid #F4EADB;outline-offset:3px}',
    '.dm-panel{position:fixed;left:14px;bottom:52px;z-index:9998;width:min(370px,calc(100vw - 28px));max-height:calc(100vh - 80px);overflow:auto;',
    '  background:linear-gradient(180deg,#1d1612,#141010);color:#F4EADB;border:1px solid rgba(255,106,31,.38);border-radius:14px;',
    '  box-shadow:0 24px 70px rgba(0,0,0,.65);font:13px/1.55 ui-sans-serif,"Inter","Segoe UI",Roboto,Arial,sans-serif;display:none}',
    '.dm-panel.on{display:block}',
    '.dm-h{padding:13px 16px;border-bottom:1px solid rgba(244,234,219,.1);background:linear-gradient(90deg,rgba(255,106,31,.14),transparent)}',
    '.dm-h b{font:700 11px/1 "DejaVu Sans Mono",ui-monospace,monospace;letter-spacing:.22em;color:#FFB03A}',
    '.dm-h div{font-size:11.5px;color:#bfae9a;margin-top:6px}',
    '.dm-b{padding:12px 16px 16px}',
    '.dm-b p{margin:0 0 10px;color:#d9cbb8;font-size:12.5px}',
    '.dm-k{font:600 9.5px/1 "DejaVu Sans Mono",ui-monospace,monospace;letter-spacing:.2em;text-transform:uppercase;color:#7f7264;margin:14px 0 8px}',
    '.dm-ol{margin:0;padding:0;list-style:none;counter-reset:dm}',
    '.dm-ol li{counter-increment:dm;position:relative;padding:7px 0 7px 28px;border-top:1px dashed rgba(244,234,219,.08);font-size:12.5px;color:#d9cbb8}',
    '.dm-ol li:before{content:counter(dm);position:absolute;left:0;top:7px;width:19px;height:19px;border-radius:50%;background:rgba(255,106,31,.16);',
    '  color:#FFB03A;font:700 10px/19px "DejaVu Sans Mono",monospace;text-align:center}',
    '.dm-ol a{color:#F4EADB;font-weight:600;text-decoration:none;border-bottom:1px solid rgba(255,176,58,.45)}',
    '.dm-ol a:hover{color:#FFB03A}',
    '.dm-akt{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '.dm-btn{font:600 10.5px/1 "DejaVu Sans Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-decoration:none;',
    '  border:1px solid rgba(244,234,219,.16);border-radius:9px;padding:9px 12px;background:rgba(244,234,219,.04);color:#F4EADB}',
    '.dm-btn:hover{border-color:rgba(255,106,31,.6);color:#FFB03A}',
    '.dm-btn.merah{border-color:rgba(226,59,50,.5);color:#ff9d95}',
    '.dm-siapa{font:11px/1.4 "DejaVu Sans Mono",ui-monospace,monospace;color:#bfae9a;background:rgba(244,234,219,.04);border:1px solid rgba(244,234,219,.08);',
    '  border-radius:8px;padding:8px 10px;margin-top:4px}',
    '.dm-siapa b{color:#F4EADB}',
    '.dm-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9999;max-width:min(560px,calc(100vw - 32px));',
    '  background:#1d1612;color:#F4EADB;border:1px solid rgba(255,176,58,.5);border-radius:12px;padding:12px 16px;',
    '  font:13px/1.5 ui-sans-serif,"Inter","Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.6);display:flex;gap:12px;align-items:flex-start}',
    '.dm-toast b{color:#FFB03A}',
    '.dm-toast button{flex:0 0 auto;background:none;border:0;color:#bfae9a;font-size:16px;cursor:pointer;line-height:1}',
    /* kartu akun demo di halaman login */
    '.dm-login{width:min(92vw,380px);margin:18px auto 0;border:1px dashed rgba(255,176,58,.45);border-radius:14px;padding:14px 16px;',
    '  background:rgba(255,176,58,.05);font:12.5px/1.5 ui-sans-serif,"Inter","Segoe UI",Roboto,Arial,sans-serif;color:#d9cbb8}',
    '.dm-login .j{font:700 9.5px/1 "DejaVu Sans Mono",monospace;letter-spacing:.24em;text-transform:uppercase;color:#FFB03A;margin-bottom:10px}',
    '.dm-akun{display:block;width:100%;text-align:left;cursor:pointer;margin-top:8px;border:1px solid rgba(244,234,219,.14);border-radius:10px;',
    '  padding:10px 12px;background:rgba(10,8,6,.55);color:#F4EADB;font:inherit;transition:.15s}',
    '.dm-akun:hover{border-color:rgba(255,106,31,.6);box-shadow:0 0 18px rgba(255,106,31,.2)}',
    '.dm-akun b{display:block;font-size:13px}',
    '.dm-akun code{font:11px "DejaVu Sans Mono",monospace;color:#FFB03A}',
    '.dm-akun span{display:block;font-size:11.5px;color:#bfae9a}',
    '.dm-login .c{margin-top:10px;font-size:11px;color:#7f7264}',
    '.dm-login a{color:#bfae9a}',
    /* contoh roster di modal Import */
    '.dm-csv{margin-top:12px;padding:10px 12px;border:1px dashed rgba(255,176,58,.45);border-radius:10px;background:rgba(255,176,58,.06);',
    '  font-size:12px;color:#d9cbb8;display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
    '.dm-csv button{font:600 10px/1 "DejaVu Sans Mono",monospace;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;',
    '  border:1px solid rgba(255,106,31,.6);border-radius:8px;padding:8px 11px;background:transparent;color:#FFB03A}',
    '@media print{.dm-pil,.dm-panel,.dm-toast{display:none!important}}'
  ].join('\n');

  function el(tag, cls, html) { var x = document.createElement(tag); if (cls) x.className = cls; if (html != null) x.innerHTML = html; return x; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function toast(html, ms) {
    var t = el('div', 'dm-toast', '<div>' + html + '</div>');
    var x = el('button', '', '×');
    x.setAttribute('aria-label', 'Tutup');
    x.onclick = function () { t.remove(); };
    t.appendChild(x);
    document.body.appendChild(t);
    if (ms) setTimeout(function () { t.remove(); }, ms);
  }
  D.toast = toast;

  function pasangPil() {
    var sesi = D.sesi ? D.sesi() : null;
    var pil = el('button', 'dm-pil', '<span class="t"></span>Demo');
    pil.type = 'button';
    pil.setAttribute('aria-expanded', 'false');
    pil.setAttribute('aria-label', 'Panel mode demo');
    var p = el('div', 'dm-panel');
    p.setAttribute('role', 'dialog');
    p.innerHTML =
      '<div class="dm-h"><b>MAGI//SYSTEM · MODE DEMO</b><div>Versi portofolio — tanpa server, tanpa data asli.</div></div>' +
      '<div class="dm-b">' +
      '<p>Semua karyawan, roster, cuti, SIMPER, APD dan warning di sini <b>fiktif</b>. magi-api, MySQL dan n8n ' +
      'disimulasikan di browser dengan aturan yang sama dengan kode aslinya; perubahan Anda tersimpan di browser ini saja.</p>' +
      (sesi ? '<div class="dm-siapa">Masuk sebagai <b>' + esc(sesi.u) + '</b> · ' + esc(sesi.peran) + '</div>' : '') +
      '<div class="dm-k">Coba ini</div><ol class="dm-ol">' +
      '<li><a href="./MBR_dasbord.html">MBR</a> — tinjau pesanan mealbox besok, lalu <b>Approve &amp; Kirim</b> (batas 30 menit).</li>' +
      '<li><a href="./afl.html">AFL</a> — centang karyawan, tekan <b>Cetak</b>, tunggu PDF jadi lalu unduh. Ada juga tanggal cuti yang <b>terlewat</b> untuk “Proses susulan”.</li>' +
      '<li><a href="./roster.html">Edit Roster</a> — ubah shift, simpan, lalu lihat panel <b>Roster Aktual</b> di Konsol Misi ikut berubah.</li>' +
      '<li><a href="./apd.html">APD</a> — tambah APD ke antrean, <b>Cetak PDF</b>, lalu ceklis Safety → Warehouse → Diambil.</li>' +
      '<li><a href="./warning.html">Warning</a> — catat surat peringatan, cetak formnya, kirim email (simulasi).</li>' +
      '<li><a href="./login.html?demo=operator">Masuk sebagai Operator</a> — modul tanpa hak terkunci dan “server” menolak dengan 403.</li>' +
      '</ol>' +
      '<div class="dm-akt">' +
      '<a class="dm-btn" href="' + PORTOFOLIO + '">← Portofolio</a>' +
      '<a class="dm-btn" href="./index.html">Konsol Misi</a>' +
      '<button class="dm-btn merah" type="button" id="dmReset">↺ Reset data</button>' +
      '</div></div>';
    document.body.appendChild(p);
    document.body.appendChild(pil);
    function buka(on) { p.classList.toggle('on', on); pil.setAttribute('aria-expanded', on ? 'true' : 'false'); }
    pil.onclick = function (e) { e.stopPropagation(); buka(!p.classList.contains('on')); };
    document.addEventListener('click', function (e) { if (p.classList.contains('on') && !p.contains(e.target)) buka(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') buka(false); });
    p.querySelector('#dmReset').onclick = function () {
      if (!confirm('Kembalikan semua data demo ke keadaan awal? Perubahan dan sesi login di browser ini dihapus.')) return;
      D.reset();
      location.href = './login.html';
    };
  }

  function pasangLogin() {
    var form = document.getElementById('loginForm');
    if (!form) return;
    var k = el('div', 'dm-login');
    k.innerHTML = '<div class="j">Akun demo</div>' +
      Object.keys(AKUN).map(function (key) {
        var a = AKUN[key];
        return '<button type="button" class="dm-akun" data-akun="' + key + '"><b>Masuk sebagai ' + a.label + '</b>' +
          '<code>' + a.u + ' · ' + a.p + '</code><span>' + a.ket + '</span></button>';
      }).join('') +
      '<div class="c">Data fiktif · tersimpan hanya di browser ini · <a href="' + PORTOFOLIO + '">kembali ke portofolio</a></div>';
    form.parentNode.insertBefore(k, form.nextSibling);
    function masuk(key) {
      var a = AKUN[key];
      var u = document.getElementById('fUser'), pw = document.getElementById('fPass');
      if (!a || !u || !pw) return;
      u.value = a.u; pw.value = a.p;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
    k.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-akun]') : null;
      if (b) masuk(b.getAttribute('data-akun'));
    });
    if (AKUN[mintaDemo]) setTimeout(function () { masuk(mintaDemo); }, 350);
  }

  function pasangContohRoster() {
    var hint = document.querySelector('#mask .hint');
    if (!hint) return;
    var box = el('div', 'dm-csv', '<span>Mode demo: berkas diproses di browser dengan aturan node <b>Validasi</b> yang sama (.csv langsung, .xlsx lewat SheetJS).</span>');
    var b = el('button', '', '⤓ Contoh roster .csv');
    b.type = 'button';
    b.onclick = function (e) {
      e.stopPropagation();
      var db = D.muat(), h = D.hariIni();
      var dot = {};
      db.kontrak.forEach(function (k) { if (k.dot) dot[k.id_ho] = 1; });
      var orang = db.karyawan.filter(function (k) { return !dot[k.id_ho] && !D.isStaff(k.status); }).slice(10, 16);
      var tgl = [];
      for (var i = 1; i <= 7; i++) tgl.push(D.geser(h, i));
      var balik = { DS: 'D', NS: 'N', CS: 'O' };
      var rows = [['ID HO'].concat(tgl)];
      orang.forEach(function (k) {
        rows.push([k.id_ho].concat(tgl.map(function (t) { var c = D.rGet(db, k.id_ho, t); return balik[c] || c; })));
      });
      rows.push(['XYZ99999999'].concat(tgl.map(function () { return 'D'; })));   // contoh baris yang ditolak
      var csv = rows.map(function (r) { return r.join(','); }).join('\n') + '\n';
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'contoh-roster-' + tgl[0] + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    };
    box.appendChild(b);
    hint.parentNode.insertBefore(box, hint);
  }

  window.addEventListener('load', function () {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    pasangPil();
    if (halaman === 'login.html') pasangLogin();
    if (halaman === 'index.html') {
      pasangContohRoster();
      var kunci = 'magi.demo.sambut';
      var sudah = null;
      try { sudah = localStorage.getItem(kunci); } catch (e) {}
      if (!sudah) {
        try { localStorage.setItem(kunci, '1'); } catch (e) {}
        toast('<b>Selamat datang di demo MAGI//SYSTEM.</b> Semua data fiktif. Buka pil <b>DEMO</b> di kiri bawah untuk panduan singkat.', 9000);
      }
    }
  });
})();

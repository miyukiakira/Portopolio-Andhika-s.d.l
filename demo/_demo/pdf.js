/* ============================================================
   MAGI//SYSTEM — MODE DEMO · pdf.js
   ------------------------------------------------------------
   Di sistem asli, form AFL / Travel Request / APD / Warning diisi n8n
   ke template Google Sheets lalu diekspor jadi PDF. Di demo tidak ada
   Google, jadi PDF-nya disusun langsung di browser oleh penulis PDF
   mini di bawah (tanpa pustaka luar: font standar Helvetica,
   WinAnsiEncoding, stream tanpa kompresi).
   Isian per sel mengikuti node "Siapkan Dokumen" (selAfl / selTr).
   ============================================================ */
(function () {
  'use strict';
  var D = window.MAGI_DEMO;
  var W = 595.28, H = 841.89;

  /* ---------------- lebar glyph (AFM standar, 32..126) ---------------- */
  var LEBAR = {
    F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
      556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
      556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
      556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
      667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
      611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
  };
  LEBAR.F3 = LEBAR.F1;
  var TINGGI = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xB7: 278 };
  var PETA = { '–': 0x96, '—': 0x97, '•': 0x95, '·': 0xB7, '’': 0x92, '‘': 0x91,
    '“': 0x93, '”': 0x94, '…': 0x85, '€': 0x80 };
  var GANTI = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '↗': '->', '↙': '<-', '≠': '!=',
    '✓': 'v', '✔': 'v', '✕': 'x', '✖': 'x', '●': 'o', '○': 'o' };

  /* teks JS -> byte WinAnsi (string berisi kode 0..255) */
  function enc(t) {
    var out = '';
    t = String(t == null ? '' : t);
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i), c = t.charCodeAt(i);
      if (c >= 32 && c < 127) out += ch;
      else if (PETA[ch]) out += String.fromCharCode(PETA[ch]);
      else if (c >= 0xA0 && c <= 0xFF) out += ch;
      else if (GANTI[ch]) out += GANTI[ch];
      else if (c === 9) out += ' ';
      else out += '?';
    }
    return out;
  }
  function lebar(t, font, size) {
    var b = enc(t), tabel = LEBAR[font] || LEBAR.F1, w = 0;
    for (var i = 0; i < b.length; i++) {
      var c = b.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? tabel[c - 32] : (TINGGI[c] || 556);
    }
    return w * size / 1000;
  }
  function lit(b) {
    var o = '(';
    for (var i = 0; i < b.length; i++) {
      var c = b.charCodeAt(i), ch = b.charAt(i);
      if (ch === '\\' || ch === '(' || ch === ')') o += '\\' + ch;
      else if (c < 32 || c > 126) o += '\\' + ('00' + c.toString(8)).slice(-3);
      else o += ch;
    }
    return o + ')';
  }
  function n(v) { return (Math.round(v * 100) / 100).toString(); }
  function warna(c, kecil) { return n(c[0]) + ' ' + n(c[1]) + ' ' + n(c[2]) + ' ' + (kecil ? 'rg' : 'RG'); }
  function potong(t, font, size, maks) {
    t = String(t == null ? '' : t);
    if (lebar(t, font, size) <= maks) return t;
    while (t.length > 1 && lebar(t + '…', font, size) > maks) t = t.slice(0, -1);
    return t + '…';
  }

  /* ---------------- halaman (koordinat dari kiri-ATAS, satuan pt) ---------------- */
  function Halaman() { this.ops = []; }
  Halaman.prototype.teks = function (x, y, t, o) {
    o = o || {};
    var size = o.size || 9, font = o.bold ? 'F2' : (o.miring ? 'F3' : 'F1');
    if (o.maks) t = potong(t, font, size, o.maks);
    var w = lebar(t, font, size);
    if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
    this.ops.push(warna(o.warna || [0.1, 0.09, 0.08], true) + ' BT /' + font + ' ' + n(size) + ' Tf ' + n(x) + ' ' + n(H - y) + ' Td ' +
      lit(enc(t)) + ' Tj ET');
    return w;
  };
  /* bungkus teks ke lebar w; kembali y sesudah baris terakhir */
  Halaman.prototype.paragraf = function (x, y, w, t, o) {
    o = o || {};
    var size = o.size || 9, font = o.bold ? 'F2' : (o.miring ? 'F3' : 'F1'), lh = o.lh || size * 1.38, self = this;
    String(t == null ? '' : t).split('\n').forEach(function (par) {
      var kata = par.split(/\s+/).filter(Boolean), baris = '';
      if (!kata.length) { y += lh; return; }
      kata.forEach(function (k) {
        var coba = baris ? baris + ' ' + k : k;
        if (lebar(coba, font, size) > w && baris) { self.teks(x, y, baris, o); y += lh; baris = k; }
        else baris = coba;
      });
      if (baris) { self.teks(x, y, baris, o); y += lh; }
    });
    return y;
  };
  Halaman.prototype.kotak = function (x, y, w, h, o) {
    o = o || {};
    var op = '';
    if (o.isi) op += warna(o.isi, true) + ' ';
    if (o.garis !== null) op += warna(o.garis || [0.35, 0.32, 0.29]) + ' ' + n(o.tebal || 0.6) + ' w ';
    op += n(x) + ' ' + n(H - y - h) + ' ' + n(w) + ' ' + n(h) + ' re ' + (o.isi ? (o.garis === null ? 'f' : 'B') : 'S');
    this.ops.push(op);
  };
  Halaman.prototype.garis = function (x1, y1, x2, y2, o) {
    o = o || {};
    this.ops.push((o.putus ? '[2 2] 0 d ' : '') + warna(o.warna || [0.35, 0.32, 0.29]) + ' ' + n(o.tebal || 0.6) + ' w ' +
      n(x1) + ' ' + n(H - y1) + ' m ' + n(x2) + ' ' + n(H - y2) + ' l S' + (o.putus ? ' [] 0 d' : ''));
  };
  Halaman.prototype.tandaAir = function (t) {
    var a = 33 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var w = lebar(t, 'F2', 46);
    var x = W / 2 - c * w / 2, y = H / 2 - s * w / 2;
    this.ops.unshift('q ' + warna([0.93, 0.91, 0.88], true) + ' BT /F2 46 Tf ' + n(c) + ' ' + n(s) + ' ' + n(-s) + ' ' + n(c) + ' ' +
      n(x) + ' ' + n(y) + ' Tm ' + lit(enc(t)) + ' Tj ET Q');
  };

  function Dokumen(judul) { this.hal = []; this.judul = judul || 'Dokumen'; }
  Dokumen.prototype.halaman = function () { var h = new Halaman(); this.hal.push(h); return h; };
  Dokumen.prototype.bytes = function () {
    var objs = [], out = '%PDF-1.4\n%' + String.fromCharCode(0xE2, 0xE3, 0xCF, 0xD3) + '\n', off = [];
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    var kids = this.hal.map(function (_, i) { return (7 + i * 2) + ' 0 R'; }).join(' ');
    objs.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + this.hal.length + ' >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    // /Info memakai PDFDocEncoding (bukan WinAnsi) -> cukup ASCII
    objs.push('<< /Title ' + lit(enc(this.judul).replace(/[^\x20-\x7e]/g, '-')) + ' /Producer (MAGI//SYSTEM demo pdf.js) /Creator (MAGI//SYSTEM) >>');
    this.hal.forEach(function (h, i) {
      var isi = h.ops.join('\n');
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ' + (8 + i * 2) + ' 0 R >>');
      objs.push('<< /Length ' + isi.length + ' >>\nstream\n' + isi + '\nendstream');
    });
    objs.forEach(function (o, i) { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    off.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var b = new Uint8Array(out.length);
    for (var i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 0xff;
    return b;
  };
  D.Dokumen = Dokumen;

  /* ==========================================================
     KOMPONEN FORM
     ========================================================== */
  var TINTA = [0.12, 0.1, 0.09], REDUP = [0.45, 0.41, 0.37], AKSEN = [0.86, 0.36, 0.1], LATAR = [0.98, 0.95, 0.91];
  var M = 40, LB = W - 2 * M;
  var BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var BLP = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  function pecah(s) { return /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); }
  // '2026-11-12' -> '12-Nov-26' (gaya template AFL)
  function tglPendek(s) { var m = pecah(s); return m ? (+m[3]) + '-' + BL[+m[2] - 1] + '-' + m[1].slice(2) : ''; }
  function tglPanjang(s) { var m = pecah(s); return m ? (+m[3]) + ' ' + BLP[+m[2] - 1] + ' ' + m[1] : ''; }
  function namaHari(s) { var m = pecah(s); return m ? HARI[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : ''; }
  function kosong(v) { return v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v)); }

  function kepala(p, kode, noHal) {
    p.tandaAir('DEMO · DATA FIKTIF');
    p.kotak(M, 30, 34, 34, { isi: AKSEN, garis: null });
    p.teks(M + 17, 52, 'XYZ', { size: 10, bold: true, warna: [1, 1, 1], align: 'center' });
    p.teks(M + 44, 42, 'PT XYZ MINING CONTRACTOR', { size: 10.5, bold: true, warna: TINTA });
    p.teks(M + 44, 55, 'Departemen Mining · Site Tabalong, Kalimantan Selatan (perusahaan fiktif)', { size: 7.5, warna: REDUP });
    p.kotak(W - M - 150, 30, 150, 34, { garis: [0.6, 0.56, 0.52] });
    p.teks(W - M - 142, 43, kode, { size: 8.5, bold: true, warna: TINTA });
    p.teks(W - M - 142, 56, noHal, { size: 7.5, warna: REDUP });
    p.garis(M, 74, W - M, 74, { warna: AKSEN, tebal: 1.4 });
  }
  function judul(p, y, a, b) {
    p.teks(W / 2, y, a, { size: 17, bold: true, align: 'center', warna: TINTA });
    if (b) p.teks(W / 2, y + 15, b, { size: 8.5, miring: true, align: 'center', warna: REDUP });
  }
  function seksi(p, y, t) {
    p.kotak(M, y, LB, 15, { isi: [0.18, 0.15, 0.13], garis: null });
    p.teks(M + 7, y + 10.6, t.toUpperCase(), { size: 7.5, bold: true, warna: [0.98, 0.94, 0.88] });
    return y + 15;
  }
  /* kotak isian: label kecil di atas, nilai di bawah */
  function isian(p, x, y, w, h, label, nilai, o) {
    o = o || {};
    p.kotak(x, y, w, h, { garis: [0.62, 0.58, 0.54], tebal: 0.5 });
    p.teks(x + 5, y + 9, label, { size: 6.4, bold: true, warna: REDUP });
    var v = kosong(nilai) ? (o.kosong || '') : String(nilai);
    if (o.wrap) p.paragraf(x + 5, y + 21, w - 10, v, { size: o.size || 9, warna: TINTA, lh: 11.5 });
    else p.teks(x + 5, y + h - 8, v, { size: o.size || 9.5, bold: !!o.bold, warna: kosong(nilai) ? REDUP : TINTA, maks: w - 10 });
  }
  function baris(p, x, y, cells, h, o) {
    o = o || {};
    var cx = x;
    cells.forEach(function (c) {
      p.kotak(cx, y, c.w, h, { isi: o.isi || null, garis: [0.62, 0.58, 0.54], tebal: 0.5 });
      var tx = c.align === 'right' ? cx + c.w - 5 : (c.align === 'center' ? cx + c.w / 2 : cx + 5);
      p.teks(tx, y + h / 2 + 3.2, c.t == null ? '' : String(c.t), { size: o.size || 8.6, bold: !!(o.bold || c.bold), align: c.align,
        warna: c.warna || TINTA, maks: c.w - 10 });
      cx += c.w;
    });
    return y + h;
  }
  function tandaTangan(p, y, daftar) {
    var w = LB / daftar.length;
    daftar.forEach(function (d, i) {
      var x = M + i * w;
      p.kotak(x, y, w, 78, { garis: [0.62, 0.58, 0.54], tebal: 0.5 });
      p.teks(x + w / 2, y + 12, d[0], { size: 7.4, bold: true, align: 'center', warna: REDUP });
      p.garis(x + 14, y + 60, x + w - 14, y + 60, { putus: true });
      p.teks(x + w / 2, y + 71, d[1] || '( .................................. )', { size: 7.6, align: 'center', warna: TINTA, maks: w - 12 });
    });
    return y + 78;
  }
  function kaki(p, teksKiri, i, n) {
    p.garis(M, H - 38, W - M, H - 38, { warna: [0.8, 0.76, 0.72] });
    p.teks(M, H - 26, teksKiri, { size: 6.8, warna: REDUP, maks: LB - 60 });
    p.teks(W - M, H - 26, 'Hal ' + i + ' / ' + n, { size: 6.8, warna: REDUP, align: 'right' });
  }
  function cap(waktu) {
    var d = waktu ? new Date(waktu) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return D.jamMenit(d.getTime()) + ' WIB';
  }

  /* ==========================================================
     AFL + TRAVEL REQUEST
     ========================================================== */
  function halAfl(p, k, o, idx, tot) {
    var sc = String(k.status_cuti || '').trim().toUpperCase() === 'TR';
    var travel = sc ? 'Travel Day' : '';
    kepala(p, 'FORM HR-AFL', 'Run #' + o.run + ' · ' + (idx + 1) + ' dari ' + tot);
    judul(p, 100, 'APPLICATION FOR LEAVE (AFL)', 'Formulir permohonan cuti lapangan (Field Break) — diisi otomatis dari roster');
    var y = seksi(p, 126, 'Data karyawan');
    isian(p, M, y + 4, LB * 0.62, 32, 'NAMA', k.nama, { bold: true });
    isian(p, M + LB * 0.62 + 4, y + 4, LB * 0.38 - 4, 32, 'ID HO / ID SITE', k.id_ho);
    isian(p, M, y + 40, LB * 0.62, 32, 'JABATAN', k.jabatan);
    isian(p, M + LB * 0.62 + 4, y + 40, LB * 0.38 - 4, 32, 'DEPARTEMEN', 'Mining');
    isian(p, M, y + 76, LB * 0.31, 32, 'POH (POINT OF HIRE)', k.poh);
    isian(p, M + LB * 0.31 + 4, y + 76, LB * 0.31 - 4, 32, 'STATUS', k.status);
    isian(p, M + LB * 0.62 + 4, y + 76, LB * 0.38 - 4, 32, 'MESS', k.mess, { kosong: '—' });
    y = seksi(p, y + 118, 'Alasan cuti');
    isian(p, M, y + 4, LB, 30, 'ALASAN', k.alasan, { kosong: '(hari kerja tidak diketahui — isi saat koreksi)', bold: true });
    y = seksi(p, y + 44, 'Jadwal cuti');
    var cw = [LB * 0.34, LB * 0.22, LB * 0.18, LB * 0.26];
    y = baris(p, M, y + 4, [{ w: cw[0], t: 'KETERANGAN' }, { w: cw[1], t: 'TANGGAL' }, { w: cw[2], t: 'HARI' }, { w: cw[3], t: 'CATATAN' }], 16,
      { isi: LATAR, bold: true, size: 7 });
    [['Hari terakhir bekerja', k.akhir_kerja, travel], ['Mulai cuti (Leave start)', k.awal_cuti, ''],
      ['Akhir cuti (Leave end)', k.akhir_cuti, kosong(k.akhir_cuti) ? 'roster belum lengkap' : ''],
      ['Kembali bekerja', k.masuk_kembali, travel]].forEach(function (r) {
      y = baris(p, M, y, [{ w: cw[0], t: r[0] }, { w: cw[1], t: tglPendek(r[1]) || '—', bold: true }, { w: cw[2], t: namaHari(r[1]) || '—' },
        { w: cw[3], t: r[2], warna: AKSEN }], 19);
    });
    y = baris(p, M, y, [{ w: cw[0], t: 'Total hari kerja' }, { w: cw[1], t: kosong(k.total_h_kerja) ? '—' : k.total_h_kerja + ' Days', bold: true },
      { w: cw[2] + cw[3], t: 'syarat ' + (k.syarat_h_kerja || '—') + ' hari (' + (k.status || '-') + ')' }], 19);
    y = baris(p, M, y, [{ w: cw[0], t: 'Total cuti' }, { w: cw[1], t: kosong(k.total_cuti) ? '—' : k.total_cuti + ' Days', bold: true },
      { w: cw[2] + cw[3], t: 'FB berturut-turut dari tanggal mulai' }], 19);
    y = seksi(p, y + 12, 'Roster (leave) — diisi HR');
    var kurang = (kosong(k.total_h_kerja) || kosong(k.syarat_h_kerja)) ? '' : Math.max(0, Number(k.syarat_h_kerja) - Number(k.total_h_kerja));
    var hr = [['Entitlement', kosong(k.cuti_seharusnya) ? '—' : Number(k.cuti_seharusnya).toFixed(2).replace('.', ',')],
      ['Due date', tglPendek(k.awal_cuti_seharusnya) || '—'], ['This leave approved', kosong(k.total_cuti) ? '—' : k.total_cuti + ' FB'],
      ['Balance', kurang === '' ? '—' : String(kurang)], ['Last Field Break', tglPendek(k.mulai_kerja ? D.geser(k.mulai_kerja, -1) : '') || '—'],
      ['Next leave', tglPendek(k.awal_cuti_berikutnya) || '—']];
    var y0 = y + 4;
    hr.forEach(function (r, i) {
      var col = i % 2, row = Math.floor(i / 2);
      baris(p, M + col * (LB / 2), y0 + row * 19, [{ w: LB / 4, t: r[0] }, { w: LB / 4, t: r[1], bold: true }], 19);
    });
    y = y0 + 3 * 19 + 14;
    tandaTangan(p, y, [['DIAJUKAN OLEH', k.nama], ['DIPERIKSA (FOREMAN / SPV)'], ['DISETUJUI (SUPERINTENDENT)'], ['HR & GA']]);
    kaki(p, 'Dicetak MAGI//SYSTEM · mode demo portofolio · ' + (o.oleh ? 'oleh ' + o.oleh + ' · ' : '') + cap(o.pada) + ' · data fiktif', idx + 1, tot);
  }
  function halTr(p, k, o, idx, tot) {
    var sc = String(k.status_cuti || '').trim().toUpperCase() === 'TR';
    kepala(p, 'FORM HR-TR', 'Run #' + o.run + ' · ' + (idx + 1) + ' dari ' + tot);
    judul(p, 100, 'TRAVEL REQUEST', 'Permohonan perjalanan cuti — karyawan POH di luar Tabalong / Balangan');
    var y = seksi(p, 126, 'Data karyawan');
    isian(p, M, y + 4, LB * 0.62, 32, 'NAMA', k.nama, { bold: true });
    isian(p, M + LB * 0.62 + 4, y + 4, LB * 0.38 - 4, 32, 'ID', k.id_ho);
    isian(p, M, y + 40, LB * 0.31, 32, 'POH', k.poh, { bold: true });
    isian(p, M + LB * 0.31 + 4, y + 40, LB * 0.31 - 4, 32, 'JABATAN', k.jabatan);
    isian(p, M + LB * 0.62 + 4, y + 40, LB * 0.38 - 4, 32, 'DEPARTEMEN', 'Mining');
    y = seksi(p, y + 86, 'Rencana perjalanan');
    var cw = [LB * 0.14, LB * 0.5, LB * 0.18, LB * 0.18];
    y = baris(p, M, y + 4, [{ w: cw[0], t: 'ARAH' }, { w: cw[1], t: 'RUTE / JALUR' }, { w: cw[2], t: 'TANGGAL' }, { w: cw[3], t: 'HARI' }], 16,
      { isi: LATAR, bold: true, size: 7 });
    var tb = sc ? k.akhir_kerja : k.awal_cuti, tk = sc ? k.masuk_kembali : k.akhir_cuti;
    y = baris(p, M, y, [{ w: cw[0], t: 'Berangkat' }, { w: cw[1], t: k.jalur_berangkat || '(jalur kosong — isi saat koreksi)', warna: k.jalur_berangkat ? TINTA : AKSEN },
      { w: cw[2], t: tglPendek(tb) || '—', bold: true }, { w: cw[3], t: namaHari(tb) || '—' }], 22);
    y = baris(p, M, y, [{ w: cw[0], t: 'Balik' }, { w: cw[1], t: k.jalur_balik || '(jalur kosong — isi saat koreksi)', warna: k.jalur_balik ? TINTA : AKSEN },
      { w: cw[2], t: tglPendek(tk) || '—', bold: true }, { w: cw[3], t: namaHari(tk) || '—' }], 22);
    y += 10;
    p.kotak(M, y, LB, 66, { garis: [0.62, 0.58, 0.54], tebal: 0.5 });
    p.teks(M + 5, y + 9, 'DETAIL OF REASON / PURPOSE', { size: 6.4, bold: true, warna: REDUP });
    p.paragraf(M + 5, y + 23, LB - 10, 'Cuti lapangan (Field Break) ' + (tglPanjang(k.awal_cuti) || '—') + ' s/d ' + (tglPanjang(k.akhir_cuti) || '—') +
      '\nMess : ' + (String(k.mess || '').trim() || '-') + '\nNo. Telp : ' + (k.no_telp || '-'), { size: 8.8, lh: 12 });
    y += 76;
    if (sc) {
      p.kotak(M, y, LB, 26, { isi: [1, 0.95, 0.88], garis: AKSEN, tebal: 0.6 });
      p.teks(M + 8, y + 16.5, 'SPECIAL CASE · TRAVEL DAY — berangkat di hari terakhir kerja, balik di hari kembali bekerja (tab "special chase").',
        { size: 7.8, bold: true, warna: [0.55, 0.22, 0.05], maks: LB - 16 });
      y += 34;
    } else if (k.sumber_jalur) {
      p.teks(M, y + 8, 'Sumber jalur: tab "' + k.sumber_jalur + '" (spreadsheet Tamplate AFL)', { size: 7.4, miring: true, warna: REDUP });
      y += 18;
    }
    if (k.catatan_jalur) { p.teks(M, y + 8, 'Catatan: ' + k.catatan_jalur, { size: 7.6, bold: true, warna: AKSEN, maks: LB }); y += 18; }
    tandaTangan(p, y + 10, [['PEMOHON', k.nama], ['ATASAN LANGSUNG'], ['TRAVEL DESK / HR']]);
    kaki(p, 'Dicetak MAGI//SYSTEM · mode demo portofolio · ' + cap(o.pada) + ' · data fiktif — dicetak bolak-balik dengan AFL', idx + 1, tot);
  }
  D.pdfAfl = function (orang, o) {
    o = o || {};
    var doc = new Dokumen('AFL ' + (o.luar ? 'POH Luar' : 'POH Tabalong-Balangan') + ' — run ' + o.run);
    var tot = orang.length * (o.luar ? 2 : 1), i = 0;
    if (!orang.length) {
      var p0 = doc.halaman(); kepala(p0, 'FORM HR-AFL', '-'); judul(p0, 120, 'Tidak ada karyawan', 'kelompok ini kosong'); return doc.bytes();
    }
    orang.forEach(function (k) {
      halAfl(doc.halaman(), k, o, i++, tot);
      if (o.luar) halTr(doc.halaman(), k, o, i++, tot);
    });
    return doc.bytes();
  };

  /* ==========================================================
     APD — "Permintaan Peralatan Keselamatan"
     ========================================================== */
  D.pdfApd = function (karyawan, o) {
    o = o || {};
    var doc = new Dokumen('Permintaan Peralatan Keselamatan ' + (o.tanggal || ''));
    karyawan.forEach(function (k, idx) {
      var p = doc.halaman();
      kepala(p, 'FORM HSE-APD', 'Tanggal ' + tglPendek(o.tanggal));
      judul(p, 100, 'PERMINTAAN PERALATAN KESELAMATAN', 'Personal Protective Equipment (PPE) request — satu formulir per karyawan');
      var y = seksi(p, 126, 'Data karyawan');
      isian(p, M, y + 4, LB * 0.5, 32, 'NAMA', k.nama, { bold: true });
      isian(p, M + LB * 0.5 + 4, y + 4, LB * 0.25 - 4, 32, 'ID HO', k.id_ho);
      isian(p, M + LB * 0.75 + 4, y + 4, LB * 0.25 - 4, 32, 'ID SITE', k.id_site);
      isian(p, M, y + 40, LB * 0.5, 32, 'JABATAN / POSISI', k.mpp_position || k.jabatan);
      isian(p, M + LB * 0.5 + 4, y + 40, LB * 0.5 - 4, 32, 'DEPARTEMEN / SECTION', (k.mpp_dept || '-') + ' / ' + (k.mpp_section || '-'));
      isian(p, M, y + 76, LB * 0.25, 32, 'STATUS', k.status);
      isian(p, M + LB * 0.25 + 4, y + 76, LB * 0.25 - 4, 32, 'KATEGORI', k.kategori);
      isian(p, M + LB * 0.5 + 4, y + 76, LB * 0.25 - 4, 32, 'POH', k.poh);
      isian(p, M + LB * 0.75 + 4, y + 76, LB * 0.25 - 4, 32, 'TGL. MULAI KERJA', tglPendek(k.doh), { kosong: '—' });
      y = seksi(p, y + 122, 'Daftar APD yang diminta');
      var cw = [LB * 0.07, LB * 0.3, LB * 0.18, LB * 0.18, LB * 0.09, LB * 0.18];
      y = baris(p, M, y + 4, [{ w: cw[0], t: 'NO', align: 'center' }, { w: cw[1], t: 'NAMA APD' }, { w: cw[2], t: 'TIPE / UKURAN' },
        { w: cw[3], t: 'TERAKHIR DITERIMA' }, { w: cw[4], t: 'JML', align: 'center' }, { w: cw[5], t: 'JENIS' }], 16, { isi: LATAR, bold: true, size: 7 });
      k.apd.forEach(function (a, i) {
        y = baris(p, M, y, [{ w: cw[0], t: String(i + 1), align: 'center' }, { w: cw[1], t: a.nama_apd, bold: true }, { w: cw[2], t: a.tipe_apd || '—' },
          { w: cw[3], t: a.terakhir ? tglPendek(a.terakhir) : 'belum pernah' }, { w: cw[4], t: '1', align: 'center' },
          { w: cw[5], t: a.terakhir ? 'Penggantian' : 'Baru', warna: a.terakhir ? AKSEN : TINTA }], 20);
      });
      for (var i = k.apd.length; i < 6; i++) {
        y = baris(p, M, y, [{ w: cw[0], t: '' }, { w: cw[1], t: '' }, { w: cw[2], t: '' }, { w: cw[3], t: '' }, { w: cw[4], t: '' }, { w: cw[5], t: '' }], 20);
      }
      y = p.paragraf(M, y + 16, LB, 'Catatan: APD lama wajib dikembalikan ke Warehouse saat mengambil APD pengganti. Masa pakai Safety Shoes 6 bulan ' +
        '(Fleet Lineup / Foreman / Supervisor / Dewatering) atau 12 bulan (jabatan lain); Helm 24 bulan.', { size: 7.8, miring: true, warna: REDUP, lh: 10.5 });
      tandaTangan(p, y + 10, [['PEMOHON', k.nama], ['ATASAN LANGSUNG'], ['SAFETY (HSE)'], ['WAREHOUSE']]);
      kaki(p, 'Diajukan ' + tglPanjang(o.tanggal) + ' · dicetak MAGI//SYSTEM (mode demo) oleh ' + (o.oleh || '-') + ' · data fiktif', idx + 1, karyawan.length);
    });
    return doc.bytes();
  };

  /* ==========================================================
     WARNING — Pembinaan Verbal / Konseling / SP-1..3
     ========================================================== */
  var JUDUL_WAR = { Verbal: ['FORMULIR PEMBINAAN VERBAL', 'Teguran lisan yang dicatat'], Konseling: ['FORMULIR KONSELING', 'Pembinaan karyawan'],
    Pertama: ['SURAT PERINGATAN PERTAMA (SP-1)', 'Peringatan tertulis tingkat 1'], Kedua: ['SURAT PERINGATAN KEDUA (SP-2)', 'Peringatan tertulis tingkat 2'],
    Ketiga: ['SURAT PERINGATAN KETIGA (SP-3)', 'Peringatan tertulis tingkat terakhir'] };
  D.pdfWarning = function (w, o) {
    o = o || {};
    var doc = new Dokumen((D.JENIS_FORM[w.sanksi] || w.sanksi) + ' ' + w.nama);
    var p = doc.halaman(), j = JUDUL_WAR[w.sanksi] || [w.sanksi, ''];
    var m = pecah(w.tgl_war_diberi);
    var romawi = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    kepala(p, 'FORM HR-' + (D.JENIS_FORM[w.sanksi] || '').toUpperCase().replace(/\s+/g, ''),
      'No. ' + ('00' + w.id_warning).slice(-3) + '/HR-MIN/' + (m ? romawi[+m[2] - 1] + '/' + m[1] : '-'));
    judul(p, 100, j[0], j[1]);
    var y = seksi(p, 126, 'Diberikan kepada');
    isian(p, M, y + 4, LB * 0.5, 32, 'NAMA', w.nama, { bold: true });
    isian(p, M + LB * 0.5 + 4, y + 4, LB * 0.25 - 4, 32, 'ID SITE', w.id_site || w.id_ho);
    isian(p, M + LB * 0.75 + 4, y + 4, LB * 0.25 - 4, 32, 'DEPARTEMEN', w.dept);
    isian(p, M, y + 40, LB, 32, 'POSISI', w.mpp_position || w.jabatan);
    y = seksi(p, y + 86, 'Pelanggaran');
    p.kotak(M, y + 4, LB, 70, { garis: [0.62, 0.58, 0.54], tebal: 0.5 });
    p.paragraf(M + 8, y + 20, LB - 16, w.pelanggaran, { size: 9.6, lh: 13 });
    y = seksi(p, y + 86, 'Sanksi & masa berlaku');
    isian(p, M, y + 4, LB * 0.25, 32, 'SANKSI', w.sanksi + ' (' + (D.JENIS_FORM[w.sanksi] || '-') + ')', { bold: true });
    isian(p, M + LB * 0.25 + 4, y + 4, LB * 0.25 - 4, 32, 'TANGGAL DIBERI', tglPanjang(w.tgl_war_diberi));
    isian(p, M + LB * 0.5 + 4, y + 4, LB * 0.25 - 4, 32, 'MASA BERLAKU', w.masa_bulan + ' bulan');
    isian(p, M + LB * 0.75 + 4, y + 4, LB * 0.25 - 4, 32, 'BERLAKU S/D', tglPanjang(w.berakhir), { bold: true });
    isian(p, M, y + 40, LB * 0.5, 32, 'PEMBINA', w.nama_pembina);
    isian(p, M + LB * 0.5 + 4, y + 40, LB * 0.5 - 4, 32, 'JABATAN PEMBINA', w.jabatan_pembina);
    isian(p, M, y + 76, LB, 44, 'CATATAN', w.war_catatan, { wrap: true, kosong: '—' });
    y += 134;
    var berat = ['Pertama', 'Kedua', 'Ketiga'].indexOf(w.sanksi) >= 0;
    y = p.paragraf(M, y, LB, (berat
      ? 'Surat peringatan ini berlaku sejak tanggal diberikan sampai dengan ' + tglPanjang(w.berakhir) + '. Apabila dalam masa berlaku ' +
        'tersebut karyawan kembali melakukan pelanggaran, perusahaan dapat memberikan sanksi yang lebih berat sesuai Peraturan Perusahaan.'
      : 'Pembinaan ini dicatat sebagai bagian dari upaya perbaikan perilaku kerja. Karyawan diharapkan tidak mengulangi pelanggaran ' +
        'yang sama; pelanggaran berulang dalam masa berlaku (' + w.masa_bulan + ' bulan) dapat ditingkatkan menjadi Surat Peringatan.'),
      { size: 8.6, lh: 12, warna: TINTA });
    tandaTangan(p, y + 12, [['KARYAWAN YBS', w.nama], ['PEMBINA', w.nama_pembina], ['DEPT. HEAD MINING'], ['HR & GA']]);
    kaki(p, 'Dicetak MAGI//SYSTEM · mode demo portofolio · oleh ' + (o.oleh || '-') + ' · ' + cap() + ' · data fiktif', 1, 1);
    return doc.bytes();
  };
})();

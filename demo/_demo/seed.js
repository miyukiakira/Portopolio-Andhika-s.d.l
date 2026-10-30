/* ============================================================
   MAGI//SYSTEM — MODE DEMO · seed.js
   ------------------------------------------------------------
   1. KONSTANTA domain  — salinan service/lib.js, routes/*.js dan
                          node Code workflow n8n (API/*.json)
   2. ROSTER            — penyimpanan ringkas per karyawan + util
   3. LOGIKA WORKFLOW   — query "Roster FB bulan depan" (AFL) dan
                          "db_mining" + "Logic pesan" (MBR) versi JS
   4. SEED              — pembuat database dummy yang deterministik
                          (PRNG ber-seed), relatif terhadap hari ini

   SEMUA nama, ID, nomor, dan kejadian di sini FIKTIF.
   ============================================================ */
(function () {
  'use strict';
  var D = window.MAGI_DEMO;

  /* ==========================================================
     1. KONSTANTA
     ========================================================== */
  // service/lib.js KODE_ROSTER
  D.KODE_ROSTER = [
    { kode: 'DS', label: 'Day Shift', kerja: true, makan: true },
    { kode: 'NS', label: 'Night Shift', kerja: true, makan: true },
    { kode: 'CS', label: 'Crossover', kerja: true, makan: true },
    { kode: 'TR', label: 'Training', kerja: true, makan: false },
    { kode: 'PP', label: 'PP (hari kerja)', kerja: true, makan: false },
    { kode: 'FB', label: 'Field Break', kerja: false, makan: false },
    { kode: 'CB', label: 'Company Business', kerja: false, makan: false },
    { kode: 'T', label: 'Off', kerja: false, makan: false }
  ];
  D.ROSTER_SHIFTS = D.KODE_ROSTER.map(function (k) { return k.kode; });
  D.SHIFT_KERJA = ['DS', 'NS', 'CS'];
  D.KODE_KERJA_AFL = ['DS', 'NS', 'CS', 'TR', 'PP'];
  D.ABSEN_CODES = ['A', 'PW', 'SP', 'SPS', 'PP', 'DS', 'NS', 'CS', 'OD', 'ON', 'FB', 'SPL', 'WT', 'BTP', 'CB', 'SK', 'LS', 'TBA'];

  // service/fitur.js
  D.FITUR = [
    { key: 'mbr', label: 'MBR' },
    { key: 'import-roster', label: 'Import Roster' },
    { key: 'edit-roster', label: 'Edit Roster' },
    { key: 'karyawan', label: 'Data Karyawan' },
    { key: 'absen', label: 'Absensi' },
    { key: 'akses', label: 'Akses & Pengguna' },
    { key: 'todo', label: 'To Do List' },
    { key: 'afl', label: 'AFL' },
    { key: 'simper', label: 'SIMPER & Skill' },
    { key: 'apd', label: 'APD' },
    { key: 'warning', label: 'Warning' }
  ];
  D.SEMUA_HAK = D.FITUR.map(function (f) { return f.key; });

  // routes/warning.js
  D.MASA_BULAN = { Verbal: 3, Konseling: 3, Pertama: 4, Kedua: 5, Ketiga: 6 };
  D.SANKSI = Object.keys(D.MASA_BULAN);
  D.JENIS_FORM = { Verbal: 'Pembinaan Verbal', Konseling: 'Konseling', Pertama: 'SP-1', Kedua: 'SP-2', Ketiga: 'SP-3' };
  D.STATUS_PEMBINA = ['Staff', 'Sr.Staff'];

  // workflow MBR — node "Summary" LOKASI_LIST (nama mess/camp sudah generik di repo)
  D.LOKASI_MBR = ['Office', 'Coal Mine', 'Pit Service', 'OB Mine', 'CAMP AREA FACILITY', 'PONDOK EARTHWORK',
    'OB Mining Spare', 'Snack Hot Seat OB Mining', 'Snack Hot Seat Coal Mining',
    'Mess XYZ Alpha A', 'Mess XYZ Alpha B', 'Mess XYZ Alpha D', 'Mess XYZ Bravo C', 'Mess XYZ Camp Charlie',
    'Mess XYZ Delta A', 'Mess XYZ Delta B', 'Mess XYZ Delta C', 'Mess XYZ Delta D', 'Mess XYZ Delta E',
    'Mess XYZ Delta F', 'Mess XYZ Delta G', 'Mess XYZ Echo VIP', 'Mess XYZ Foxtrot C', 'Mess XYZ Foxtrot D',
    'Mess XYZ Foxtrot G', 'Mess XYZ Foxtrot F', 'Mess XYZ Golf VIP', 'Mess XYZ Hotel', 'XYZ MainCamp', 'Mess Mining'];
  D.LUAR_MESS = 'Tinggal di luar mess';

  D.isStaff = function (status) { return ['Staff', 'Sr.Staff'].indexOf(String(status || '').trim()) >= 0; };
  // routes/afl.js pohLokal — sama dengan node IF "POH Tabalong/Balangan?"
  D.pohLokal = function (poh) {
    return ['tabalong', 'balangan'].indexOf(String(poh == null ? '' : poh).trim().toLowerCase()
      .replace(/^(kabupaten|kab\.?)\s*/, '')) >= 0;
  };

  /* ==========================================================
     2. ROSTER — satu string kode per karyawan
        db.roster[id_ho] = { s: 'YYYY-MM-DD' (tanggal huruf pertama), c: 'DDDDNNN..FFF' }
        satu huruf = satu hari; '.' = tidak ada baris roster.
        (75 ribu baris karyawan_roster muat dalam ±70 KB localStorage)
     ========================================================== */
  var KE_HURUF = { DS: 'D', NS: 'N', CS: 'C', TR: 'R', PP: 'P', FB: 'F', CB: 'B', T: 'T' };
  var KE_KODE = {}; Object.keys(KE_HURUF).forEach(function (k) { KE_KODE[KE_HURUF[k]] = k; });
  D.KE_HURUF = KE_HURUF;

  D.rGet = function (db, id, tgl) {
    var r = db.roster[id];
    if (!r) return '';
    var i = D.selisih(r.s, tgl);
    if (i < 0 || i >= r.c.length) return '';
    return KE_KODE[r.c.charAt(i)] || '';
  };
  /* kode '' = hapus baris hari itu */
  D.rSet = function (db, id, tgl, kode) {
    var h = kode ? KE_HURUF[kode] : '.';
    if (!h) return;
    var r = db.roster[id];
    if (!r) {
      if (!kode) return;
      r = db.roster[id] = { s: tgl, c: '' };
    }
    var i = D.selisih(r.s, tgl);
    if (i < 0) { r.c = new Array(-i + 1).join('.') + r.c; r.s = tgl; i = 0; }
    if (i >= r.c.length) r.c += new Array(i - r.c.length + 1).join('.') + '.';
    r.c = r.c.slice(0, i) + h + r.c.slice(i + 1);
    D.rRapikan(db, id);
  };
  D.rRapikan = function (db, id) {
    var r = db.roster[id];
    if (!r) return;
    var a = r.c.search(/[^.]/);
    if (a < 0) { delete db.roster[id]; return; }
    var z = r.c.length - 1;
    while (z > a && r.c.charAt(z) === '.') z--;
    r.s = D.geser(r.s, a);
    r.c = r.c.slice(a, z + 1);
  };
  /* tanggal terakhir yang punya roster (satu orang / semua orang) */
  D.rAkhir = function (db, id) {
    var r = db.roster[id];
    return r ? D.geser(r.s, r.c.length - 1) : '';
  };
  D.rAkhirSemua = function (db) {
    var m = '';
    Object.keys(db.roster).forEach(function (id) { var t = D.rAkhir(db, id); if (t > m) m = t; });
    return m;
  };
  /* semua baris roster satu orang dalam [dari, sampai] -> [{tgl, shift}] */
  D.rBaris = function (db, id, dari, sampai) {
    var r = db.roster[id], out = [];
    if (!r) return out;
    var i0 = Math.max(0, D.selisih(r.s, dari));
    var i1 = Math.min(r.c.length - 1, D.selisih(r.s, sampai));
    for (var i = i0; i <= i1; i++) {
      var h = r.c.charAt(i);
      if (h !== '.') out.push({ tgl: D.geser(r.s, i), shift: KE_KODE[h] });
    }
    return out;
  };

  /* ==========================================================
     KARYAWAN AKTIF — lib.dotFilter: DOT kosong = aktif
     ========================================================== */
  D.kontrakOf = function (db, id) {
    var pick = null;
    db.kontrak.forEach(function (k) { if (k.id_ho === id && (!pick || k.id_maskon > pick.id_maskon)) pick = k; });
    return pick;
  };
  D.aktif = function (db, id) {
    for (var i = 0; i < db.kontrak.length; i++) {
      var k = db.kontrak[i];
      if (k.id_ho === id && k.dot && String(k.dot) !== '0000-00-00') return false;
    }
    return true;
  };
  D.messOf = function (db, id) {
    var pick = null;
    db.mess.forEach(function (m) { if (m.id_ho === id && (!pick || m.id_mess > pick.id_mess)) pick = m; });
    return pick;
  };
  D.karOf = function (db, id) {
    if (!db._idx || db._idxN !== db.karyawan.length) {
      var x = {};
      db.karyawan.forEach(function (k) { x[k.id_ho] = k; });
      Object.defineProperty(db, '_idx', { value: x, writable: true, configurable: true, enumerable: false });
      Object.defineProperty(db, '_idxN', { value: db.karyawan.length, writable: true, configurable: true, enumerable: false });
    }
    return db._idx[id] || null;
  };

  /* ==========================================================
     3a. AFL — query "Roster FB bulan depan" + "Logika POH Luar"
         + "Logika Alasan" (API/AFL.json), per daftar tanggal mulai cuti
     ========================================================== */
  D.jendelaAfl = function (hari) {
    // routes/afl.js jendelaRun: (R-1 + 1 bln, R + 1 bln]
    var dari = D.tambahBulan(D.geser(hari, -1), 1), sampai = D.tambahBulan(hari, 1), out = [];
    for (var d = D.geser(dari, 1); d && d <= sampai; d = D.geser(d, 1)) out.push(d);
    return out;
  };

  function itemAfl(db, k, awal) {
    var id = k.id_ho;
    var fb = function (d) { return D.rGet(db, id, d) === 'FB'; };
    var kerja = function (d) { return D.KODE_KERJA_AFL.indexOf(D.rGet(db, id, d)) >= 0; };
    var r = db.roster[id];
    var lengkap = D.rAkhir(db, id) >= D.geser(awal, 14);
    var akhirCuti = awal;
    while (fb(D.geser(akhirCuti, 1))) akhirCuti = D.geser(akhirCuti, 1);
    var total = 0;
    for (var i = 0; i < 14; i++) if (fb(D.geser(awal, i))) total++;
    var cutiLalu = null, akhirKerja = null, d;
    for (d = D.geser(awal, -1); r && d >= r.s; d = D.geser(d, -1)) {
      if (!akhirKerja && kerja(d)) akhirKerja = d;
      if (fb(d)) { cutiLalu = d; break; }
    }
    if (!akhirKerja && cutiLalu) {
      for (d = D.geser(cutiLalu, -1); r && d >= r.s; d = D.geser(d, -1)) if (kerja(d)) { akhirKerja = d; break; }
    }
    var masuk = null;
    for (i = 1; i <= 14; i++) { d = D.geser(akhirCuti, i); if (kerja(d)) { masuk = d; break; } }
    var staff = D.isStaff(k.status);
    var syarat = staff ? 56 : 70, pembagi = staff ? 4 : 5;
    var hKerja = (cutiLalu && akhirKerja) ? D.selisih(cutiLalu, akhirKerja) : null;
    var m = D.messOf(db, id);
    return {
      id_ho: id, nama: k.nama, jabatan: k.jabatan || '', status: k.status || '',
      awal_cuti: awal,
      roster_lengkap: lengkap ? 1 : 0,
      akhir_cuti: lengkap ? akhirCuti : null,
      total_cuti: lengkap ? total : null,
      masuk_kembali: lengkap ? masuk : null,
      mulai_kerja: cutiLalu ? D.geser(cutiLalu, 1) : null,
      akhir_kerja: akhirKerja,
      total_h_kerja: hKerja,
      syarat_h_kerja: syarat,
      memenuhi_syarat: hKerja === null ? null : (hKerja >= syarat ? 1 : 0),
      cuti_seharusnya: hKerja === null ? null : Math.floor(hKerja / pembagi),
      awal_cuti_seharusnya: cutiLalu ? D.geser(cutiLalu, 1 + syarat) : null,
      awal_cuti_berikutnya: (lengkap && masuk) ? D.geser(masuk, syarat) : null,
      poh: k.poh || '',
      mess: m ? (m.mess || '') : '',
      no_telp: null
    };
  }

  /* tanggal = daftar 'YYYY-MM-DD'; opsi.lewatiTercetak = run susulan */
  D.hitungAfl = function (db, tanggal, opsi) {
    opsi = opsi || {};
    var set = {}; tanggal.forEach(function (t) { set[t] = 1; });
    var tercetak = {};
    if (opsi.lewatiTercetak) db.afl.forEach(function (a) { tercetak[a.id_ho + '|' + a.awal_cuti] = 1; });
    var hasil = [], dot = {};
    db.kontrak.forEach(function (x) { if (x.dot && String(x.dot) !== '0000-00-00') dot[x.id_ho] = 1; });
    db.karyawan.forEach(function (k) {
      if (dot[k.id_ho]) return;
      tanggal.forEach(function (t) {
        if (D.rGet(db, k.id_ho, t) !== 'FB' || D.rGet(db, k.id_ho, D.geser(t, -1)) === 'FB') return;
        if (tercetak[k.id_ho + '|' + t]) return;
        hasil.push(itemAfl(db, k, t));
      });
    });
    hasil.sort(function (a, b) { return a.awal_cuti < b.awal_cuti ? -1 : a.awal_cuti > b.awal_cuti ? 1 : (a.id_ho < b.id_ho ? -1 : 1); });
    var lokal = hasil.filter(function (x) { return D.pohLokal(x.poh); });
    var luar = hasil.filter(function (x) { return !D.pohLokal(x.poh); }).map(function (x) { return logikaPohLuar(db, x); });
    return lokal.concat(luar).map(logikaAlasan);
  };

  var norm = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var isi = function (v) { var s = String(v == null ? '' : v).trim(); return s === '' ? null : s; };
  function logikaPohLuar(db, k) {
    var s = null, r = null;
    db.sheet.special.forEach(function (x) { if (norm(x.id_ho) === norm(k.id_ho)) s = x; });
    db.sheet.rute.forEach(function (x) { if (norm(x.POH) === norm(k.poh)) r = x; });
    var catatan = [], o = { status_cuti: null, jalur_berangkat: null, jalur_balik: null, sumber_jalur: null, catatan_jalur: null };
    if (s) {
      o.jalur_berangkat = isi(s.Berangkat); o.jalur_balik = isi(s.Balik);
      o.sumber_jalur = 'special chase'; o.status_cuti = 'TR';
      if (!o.jalur_berangkat || !o.jalur_balik) catatan.push('jalur di special chase kosong');
    } else if (r) {
      o.jalur_berangkat = isi(r.Berangkat); o.jalur_balik = isi(r.Balik); o.sumber_jalur = 'rute travel';
    } else {
      catatan.push('POH "' + (k.poh || '-') + '" tidak ada di Rute travel');
    }
    o.catatan_jalur = catatan.length ? catatan.join(' · ') : null;
    return Object.assign({}, k, o);
  }
  function logikaAlasan(k) {
    var a = null;
    if (k.total_h_kerja !== null && k.syarat_h_kerja !== null) {
      a = k.total_h_kerja === k.syarat_h_kerja ? 'Field Break as Schedule' : 'Field Break penyesuayan roster';
    }
    return Object.assign({}, k, { alasan: a });
  }
  D.kunciAfl = function (j) {
    return String(j && j.id_ho != null ? j.id_ho : '') + '|' +
      String(j && (j.awal_cuti != null ? j.awal_cuti : (j.tgl != null ? j.tgl : '')));
  };
  /* node "Siapkan Dokumen" + "Ringkas Dokumen": satu berkas per kelompok POH */
  D.dokumenAfl = function (karyawan, runId) {
    var luarKah = function (k) { return Object.prototype.hasOwnProperty.call(k, 'jalur_berangkat'); };
    var BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    var panjang = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? (+m[3]) + ' ' + BL[+m[2] - 1] + ' ' + m[1] : ''; };
    return [
      { jenis: 'lokal', judul: 'POH Tabalong-Balangan', tr: false, orang: karyawan.filter(function (k) { return !luarKah(k); }) },
      { jenis: 'luar', judul: 'POH Luar (AFL+TR bolak-balik)', tr: true, orang: karyawan.filter(luarKah) }
    ].filter(function (g) { return g.orang.length; }).map(function (g) {
      var awal = g.orang.map(function (k) { return k.awal_cuti; }).filter(Boolean).sort();
      var label = !awal.length ? '' : (awal[0] === awal[awal.length - 1] ? panjang(awal[0]) : panjang(awal[0]) + ' - ' + panjang(awal[awal.length - 1]));
      var dasar = 'AFL ' + label + ' - ' + g.judul + ' (run ' + runId + ')';
      var hal = g.orang.length * (g.tr ? 2 : 1);
      return { jenis: g.jenis, judul: g.judul, jumlah_orang: g.orang.length, halaman: hal,
        nama_pdf: dasar + '.pdf', ukuran: (18 + hal * 9) + ' KB', link_pdf: null, link_sheet: null };
    });
  };

  /* ==========================================================
     3b. MBR — query "db_mining" + "Special cash" + "Logic pesan"
         + "Siapkan Status Web" (API/MBR _system.json)
     ========================================================== */
  D.targetMbr = function (tgl) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl);
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  D.hitungMbr = function (db, tgl) {
    var rows = [];
    var sc = {};
    db.sheet.specialCash.forEach(function (s) { sc[s.id_ho] = s; });
    db.karyawan.forEach(function (k) {
      if (!D.aktif(db, k.id_ho)) return;
      var messRows = db.mess.filter(function (m) { return m.id_ho === k.id_ho; });
      if (!messRows.length) messRows = [{ mess: null }];
      messRows.forEach(function (m) {
        var shift = D.rGet(db, k.id_ho, tgl);
        var su = shift.toUpperCase().trim();
        var mess = m.mess || '', section = k.mpp_section || '';
        var luar = mess.toLowerCase().trim() === D.LUAR_MESS.toLowerCase();
        var s = sc[k.id_ho], adaSc = !!(s && String(s.Status || '').trim());
        var pagi = ['DS', 'NS', 'CS'].indexOf(su) >= 0 && !luar;
        var siang = su === 'DS' || (['NS', 'CS'].indexOf(su) >= 0 && !luar);
        var tengah = su === 'NS';
        rows.push({
          shift: shift,
          B: pagi ? (adaSc ? (s['SC. Makan Pagi'] || mess) : mess) : '',
          L: siang ? (adaSc ? (s['SC. Makan  Siang'] || section) : section) : '',
          D: pagi ? (adaSc ? (s['SC. Makan Mala'] || mess) : mess) : '',
          M: tengah ? (adaSc ? (s['SC. Makan Tengah Malam'] || section) : section) : ''
        });
      });
    });
    var B = 0, L = 0, Dn = 0, M = 0, loc = {}, sh = { DS: 0, NS: 0, CS: 0, OFF: 0 };
    function bump(n, key) {
      n = String(n || '').trim(); if (!n) return;
      if (!loc[n]) loc[n] = { B: 0, L: 0, D: 0, M: 0, total: 0 };
      loc[n][key]++; loc[n].total++;
    }
    rows.forEach(function (r) {
      if (r.B) { B++; bump(r.B, 'B'); }
      if (r.L) { L++; bump(r.L, 'L'); }
      if (r.D) { Dn++; bump(r.D, 'D'); }
      if (r.M) { M++; bump(r.M, 'M'); }
      var x = String(r.shift || '').toUpperCase();
      if (x === 'DS') sh.DS++; else if (x === 'NS') sh.NS++; else if (x === 'CS') sh.CS++; else sh.OFF++;
    });
    var locations = Object.keys(loc).map(function (n) {
      var c = loc[n]; return { n: n, B: c.B, L: c.L, D: c.D, M: c.M, v: c.total };
    }).sort(function (a, b) { return b.v - a.v; });
    var target = D.targetMbr(tgl);
    return {
      target: target, file: 'MBR_Mining_' + target + '.xlsx',
      kpi: { emp: rows.length, meal: B + L + Dn + M, activeLoc: locations.filter(function (l) { return l.v > 0; }).length,
        sc: db.sheet.specialCash.filter(function (s) { return String(s.Status || '').trim() !== ''; }).length },
      periods: { B: B, L: L, D: Dn, M: M }, shifts: sh, locations: locations,
      email: { to: 'tim.katering@example.com', cc: 'admin.mining@example.com' }
    };
  };

  /* ==========================================================
     4. SEED — database dummy
     ========================================================== */
  var NAMA_L = ['Agus', 'Ahmad', 'Akhmad', 'Alfian', 'Andi', 'Ardiansyah', 'Arif', 'Ariyanto', 'Bambang', 'Bayu', 'Budi',
    'Dedi', 'Dimas', 'Dwi', 'Eko', 'Fajar', 'Ferry', 'Fikri', 'Firman', 'Gilang', 'Hadi', 'Hafiz', 'Hairul', 'Hendra',
    'Ilham', 'Imam', 'Irfan', 'Iwan', 'Johan', 'Joko', 'Junaidi', 'Lukman', 'Mahyudin', 'Muhammad', 'M. Rizky', 'Nanda',
    'Noorhadi', 'Rahmadi', 'Rahmat', 'Rendy', 'Rio', 'Rizal', 'Rudi', 'Saipul', 'Samsul', 'Sandi', 'Slamet', 'Syahrani',
    'Taufik', 'Teguh', 'Wahyu', 'Yogi', 'Yudi', 'Yusuf', 'Zainal', 'Galih', 'Heru', 'Krisna', 'Oki', 'Putra', 'Reza',
    'Sigit', 'Tri', 'Wawan', 'Yoga', 'Aldi', 'Bima', 'Candra', 'Dani', 'Erwin', 'Fadli', 'Gusti', 'Hamdan', 'Indra'];
  var NAMA_P = ['Ayu', 'Dewi', 'Fitri', 'Indah', 'Lestari', 'Maya', 'Nur', 'Putri', 'Rina', 'Sari', 'Wulan', 'Yuni',
    'Ratna', 'Nadia', 'Melati', 'Anisa'];
  var NAMA_B = ['Saputra', 'Pratama', 'Hidayat', 'Santoso', 'Wijaya', 'Setiawan', 'Kurniawan', 'Ramadhan', 'Nugroho',
    'Firmansyah', 'Hakim', 'Prasetyo', 'Gunawan', 'Maulana', 'Syahputra', 'Rahman', 'Hasibuan', 'Siregar', 'Lubis',
    'Nasution', 'Rahmadani', 'Noor', 'Fauzi', 'Aditya', 'Permana', 'Susanto', 'Wibowo', 'Kusuma', 'Effendi', 'Akbar',
    'Anshari', 'Fahmi', 'Rasyid', 'Mahmud', 'Iskandar', 'Halim', 'Arsyad', 'Maulidi', 'Sitorus', 'Simanjuntak',
    'Purnomo', 'Hartono', 'Sulistyo', 'Hermawan', 'Rusdi', 'Saleh', 'Daulay', 'Pangaribuan', 'Tambunan', 'Ginting'];

  // [jabatan, status, kategori_posisi, sections, bobot, kode operator SIMPER, kategori unit skill]
  var JAB = [
    ['Operator Dump Truck', 'Non Staff', 'Operator', ['OB Mine', 'OB Mine', 'Coal Mine', 'OB Mining Spare'], 30, 'DT', 'Dump Truck'],
    ['Operator Excavator', 'Non Staff', 'Operator', ['OB Mine', 'Coal Mine'], 10, 'EXCA', 'Excavator'],
    ['Operator Dozer', 'Non Staff', 'Operator', ['OB Mine', 'Coal Mine', 'PONDOK EARTHWORK'], 6, 'DZ', 'Dozer'],
    ['Operator Grader', 'Non Staff', 'Operator', ['Pit Service'], 3, 'GD', 'Grader'],
    ['Operator Wheel Loader', 'Non Staff', 'Operator', ['Coal Mine'], 3, 'WL', 'Wheel Loader'],
    ['Operator Water Truck', 'Non Staff', 'Operator', ['Pit Service'], 3, 'WT', 'Support'],
    ['Operator Compactor', 'Non Staff', 'Operator', ['PONDOK EARTHWORK', 'Pit Service'], 2, 'CP', 'Compactor'],
    ['Driver LV', 'Non Staff', 'Operator', ['Pit Service', 'Office'], 4, 'LV', 'Support'],
    ['Dewatering Crew', 'Non Staff', 'Operator', ['Pit Service'], 5, 'DW', ''],
    ['Fleet Lineup', 'Non Staff', 'Support', ['Office'], 3, 'LV', ''],
    ['Checker Produksi', 'Non Staff', 'Support', ['Coal Mine', 'OB Mine'], 4, 'LV', ''],
    ['Pitman', 'Non Staff', 'Support', ['Coal Mine', 'OB Mine'], 3, '', ''],
    ['Admin Mining', 'Non Staff', 'Support', ['Office'], 2, '', ''],
    ['Mining Production Clerk', 'Non Staff', 'Support', ['Office'], 2, '', ''],
    ['Crew Camp Facility', 'Non Staff', 'Support', ['CAMP AREA FACILITY'], 3, '', ''],
    ['Foreman Production', 'Staff', 'Supervisory', ['OB Mine', 'Coal Mine'], 5, 'LV', ''],
    ['Foreman Dewatering', 'Staff', 'Supervisory', ['Pit Service'], 1, 'LV', ''],
    ['Supervisor Production', 'Sr.Staff', 'Supervisory', ['OB Mine', 'Coal Mine'], 2, 'LV', ''],
    ['Supervisor Pit Service', 'Sr.Staff', 'Supervisory', ['Pit Service'], 1, 'LV', ''],
    ['Mine Planning Engineer', 'Staff', 'Engineering', ['Office'], 1, '', ''],
    ['Surveyor', 'Staff', 'Engineering', ['Pit Service'], 1, 'LV', ''],
    ['Safety Officer Mining', 'Staff', 'Supervisory', ['Office'], 1, 'LV', ''],
    ['Section Head Mining', 'Sr.Staff', 'Management', ['Office'], 1, 'LV', '']
  ];
  var POH = [['Tabalong', 44], ['Balangan', 12], ['Kab. Tabalong', 3], ['Hulu Sungai Utara', 7], ['Banjarmasin', 8],
    ['Balikpapan', 4], ['Samarinda', 3], ['Palangka Raya', 3], ['Jakarta', 3], ['Surabaya', 3], ['Makassar', 3],
    ['Yogyakarta', 2], ['Medan', 2], ['Bandung', 1]];
  // tab "Rute travel" (Bandung sengaja tidak ada: contoh catatan "POH tidak ada di Rute travel")
  var RUTE = [
    ['Hulu Sungai Utara', 'Travel Tanjung – Amuntai', 'Travel Amuntai – Tanjung'],
    ['Banjarmasin', 'Travel Tanjung – Banjarmasin', 'Travel Banjarmasin – Tanjung'],
    ['Balikpapan', 'Travel Tanjung – Balikpapan', 'Travel Balikpapan – Tanjung'],
    ['Samarinda', 'Travel Tanjung – Samarinda', 'Travel Samarinda – Tanjung'],
    ['Palangka Raya', 'Travel Tanjung – Palangka Raya', 'Travel Palangka Raya – Tanjung'],
    ['Jakarta', 'Travel Tanjung – BDJ · Pesawat BDJ – CGK', 'Pesawat CGK – BDJ · Travel BDJ – Tanjung'],
    ['Surabaya', 'Travel Tanjung – BDJ · Pesawat BDJ – SUB', 'Pesawat SUB – BDJ · Travel BDJ – Tanjung'],
    ['Makassar', 'Travel Tanjung – BDJ · Pesawat BDJ – UPG', 'Pesawat UPG – BDJ · Travel BDJ – Tanjung'],
    ['Yogyakarta', 'Travel Tanjung – BDJ · Pesawat BDJ – YIA', 'Pesawat YIA – BDJ · Travel BDJ – Tanjung'],
    ['Medan', 'Travel Tanjung – BDJ · Pesawat BDJ – CGK – KNO', 'Pesawat KNO – CGK – BDJ · Travel BDJ – Tanjung']
  ];
  var MESS = [['Mess XYZ Alpha A', 8], ['Mess XYZ Alpha B', 8], ['Mess XYZ Alpha D', 6], ['Mess XYZ Bravo C', 7],
    ['Mess XYZ Camp Charlie', 9], ['Mess XYZ Delta A', 6], ['Mess XYZ Delta B', 6], ['Mess XYZ Delta C', 5],
    ['Mess XYZ Delta D', 4], ['Mess XYZ Delta E', 4], ['Mess XYZ Foxtrot C', 5], ['Mess XYZ Foxtrot D', 4],
    ['Mess XYZ Hotel', 3], ['XYZ MainCamp', 6], ['Mess Mining', 7], ['Mess XYZ Echo VIP', 1], ['Mess XYZ Golf VIP', 1],
    [D.LUAR_MESS, 8]];
  var UNIT = [
    ['Dump Truck', ['KOMATSU HD785-7', 'CAT 777E', 'SANY SKT90S', 'XCMG XDE130', 'SCANIA P410 (Hauling)']],
    ['Excavator', ['KOMATSU PC2000-8', 'KOMATSU PC1250-8', 'HITACHI EX2600-7', 'CAT 395', 'LIUGONG 970E', 'XCMG XE700D']],
    ['Dozer', ['KOMATSU D375A-6', 'CAT D10T2', 'SHANTUI SD32']],
    ['Grader', ['CAT 16M', 'KOMATSU GD825A-2']],
    ['Wheel Loader', ['CAT 988K', 'LIUGONG 856H']],
    ['Compactor', ['BOMAG BW211D', 'SAKAI SV525D']],
    ['Support', ['WATER TRUCK 20 KL', 'FUEL TRUCK 16 KL', 'LV TOYOTA HILUX', 'BUS KARYAWAN']]
  ];
  var APD = [['Safety Shoes', 'Lace-up'], ['Safety Shoes', 'Boot'], ['Helm', 'Putih'], ['Helm', 'Kuning'], ['Tali Helm', ''],
    ['Rompi Reflektif', 'L'], ['Rompi Reflektif', 'XL'], ['Kacamata Safety', 'Gelap'], ['Kacamata Safety', 'Bening'],
    ['Sarung Tangan', 'Kain'], ['Sarung Tangan', 'Kulit'], ['Earplug', ''], ['Masker Debu', 'N95'], ['Jas Hujan', 'L'],
    ['Coverall', 'XL'], ['Senter Kepala', '']];
  var PELANGGARAN = [
    'Tidak memakai APD lengkap (kacamata safety) saat berada di area loading point',
    'Over speed LV di jalan hauling — 52 km/j di zona batas 40 km/j (tercatat GPS)',
    'Terlambat masuk shift 3 kali dalam satu bulan tanpa pemberitahuan',
    'Mangkir kerja 2 hari berturut-turut tanpa keterangan',
    'Menggunakan HP saat mengoperasikan unit di area tambang',
    'Tidak melakukan P2H unit sebelum operasi',
    'Melanggar jarak aman antar unit di jalan tambang (kurang dari 50 m)',
    'Tidur di kabin saat jam kerja (unit dalam kondisi standby)',
    'Membawa penumpang tanpa izin di unit LV operasional',
    'Tidak mengikuti safety talk pagi tanpa alasan yang sah',
    'Parkir unit di area terlarang (bawah high wall)',
    'Tidak melapor near miss di area disposal'
  ];

  D.seed = function (B) {
    var r = D.rng(20261030);
    var sekarang = Date.now();
    var db = {
      v: D.VERSI, base: B,
      seq: { maskon: 0, mess: 0, bpjs: 0, simper: 0, skill: 0, unit: 0, apd: 0, kapd: 0, warning: 0, absen: 0,
        afl: 0, audit: 0, user: 0, todo: 0, exec: 3100 },
      karyawan: [], mess: [], bpjs: [], kontrak: [], roster: {}, unit: [], simper: [], skill: [], apd: [], kapd: [],
      warning: [], absen: [], afl: [], audit: [], user: [], todo: [], exec: [], mbr: null,
      sheet: { rute: [], special: [], specialCash: [] }
    };
    var DARI = D.geser(B, -175), SAMPAI = D.geser(B, 88);
    var IP = ['192.168.1.21', '192.168.1.23', '192.168.1.35', '192.168.1.42'];

    /* ---------- pengguna dashboard (app_user) ---------- */
    var USER = [
      ['andhika', 'Andhika Samuel', 'Administrator', null, 'MagiAdmin2026', 1, -55],
      ['siti', 'Siti Rahmawati', 'Operator', ['mbr', 'edit-roster', 'karyawan', 'absen', 'todo', 'afl'], 'MagiOperator2026', 1, -53],
      ['budi.s', 'Budi Santoso', 'Operator', ['mbr', 'import-roster', 'edit-roster', 'todo', 'apd'], 'MagiBudi2026x', 1, -40],
      ['dewi', 'Dewi Lestari', 'Operator', ['simper', 'apd', 'warning', 'todo', 'karyawan'], 'MagiDewi2026x', 1, -31],
      ['magang', 'Peserta Magang', 'Operator', ['todo'], 'MagangDemo2026', 0, -20]
    ];
    USER.forEach(function (u) {
      var h = D.hashPassword(u[4]);
      db.user.push({ id: ++db.seq.user, username: u[0], nama: u[1], peran: u[2],
        hak_akses: u[2] === 'Administrator' ? D.SEMUA_HAK.slice() : u[3], pass_algo: h.algo, pass_salt: h.salt,
        pass_hash: h.hash, aktif: u[5], dibuat_oleh: u[0] === 'andhika' ? null : 'andhika',
        dibuat: D.jamDetik(D.pada(D.geser(B, u[6]), 9, 12 + u[6] % 20, 7)) });
    });
    var NAMA_USER = {}; db.user.forEach(function (u) { NAMA_USER[u.username] = u.nama; });

    /* ---------- karyawan ---------- */
    var dipakai = {}, idNum = 20160, siteNum = 230114;
    function namaBaru(perempuan) {
      for (var i = 0; i < 200; i++) {
        var n = r.pick(perempuan ? NAMA_P : NAMA_L) + ' ' + r.pick(NAMA_B);
        if (r.chance(0.12) && !perempuan) n = r.pick(NAMA_L) + ' ' + n;
        if (!dipakai[n]) { dipakai[n] = 1; return n; }
      }
      return 'Karyawan ' + (++idNum);
    }
    var bobotJab = JAB.map(function (j, i) { return [i, j[4]]; });
    var N = 246;
    var karyawan = [];
    for (var i = 0; i < N; i++) {
      var j = i === 0 ? JAB.length - 1 : (i === 1 ? -1 : r.bobot(bobotJab));
      var jab = j < 0 ? ['Superintendent Mining', 'Sr.Staff', 'Management', ['Office'], 0, 'LV', ''] : JAB[j];
      var perempuanP = /Admin|Clerk/.test(jab[0]) ? 0.55 : (/Engineer|Safety|Checker|Surveyor/.test(jab[0]) ? 0.25 : 0.015);
      var perempuan = r.chance(perempuanP);
      idNum += r.int(3, 41);
      siteNum += r.int(1, 9);
      var doh = D.geser(B, -r.int(70, 2400));
      var k = {
        id_ho: 'XYZ000' + idNum, id_site: siteNum, nama: namaBaru(perempuan), jabatan: jab[0],
        mpp_position: jab[0], acting: '', mpp_dept: 'Mining', mpp_section: r.pick(jab[3]),
        status: jab[1], kategori: D.selisih(doh, B) > 1100 ? 'PKWTT' : 'PKWT', kategori_posisi: jab[2],
        poh: r.bobot(POH), jam_kerja: D.isStaff(jab[1]) ? 10 : 12,
        agama: r.bobot([['Islam', 85], ['Kristen', 9], ['Katolik', 3], ['Hindu', 2], ['Buddha', 1]]),
        _op: jab[5], _unit: jab[6], _p: perempuan, _doh: doh, _dot: null
      };
      karyawan.push(k);
    }
    karyawan.sort(function (a, b) { return a.id_ho < b.id_ho ? -1 : 1; });
    // beberapa acting
    karyawan.filter(function (k) { return k.jabatan === 'Operator Dump Truck'; }).slice(3, 5).forEach(function (k) { k.acting = 'Acting Foreman'; });
    // karyawan baru (doh < 60 hari) & yang sudah berhenti (DOT)
    var calon = r.acak(karyawan.filter(function (k) { return !D.isStaff(k.status); }));
    var baru = calon.slice(0, 4), berhenti = calon.slice(4, 14);
    baru.forEach(function (k) { k._doh = D.geser(B, -r.int(28, 58)); k.kategori = 'PKWT'; });
    berhenti.forEach(function (k, n) { k._dot = D.geser(B, -r.int(4, 150)); k._reason = ['Resign', 'Habis Kontrak', 'Resign', 'PHK'][n % 4]; });
    var aktifList = karyawan.filter(function (k) { return !k._dot; });
    var lokalKah = function (k) { return D.pohLokal(k.poh); };

    /* ---------- tabel anak: kontrak, mess, bpjs ---------- */
    karyawan.forEach(function (k) {
      db.kontrak.push({ id_maskon: ++db.seq.maskon, id_ho: k.id_ho, doh: k._doh, reason_dot: k._dot ? k._reason : null, dot: k._dot });
      var mess = r.bobot(MESS);
      if (D.isStaff(k.status) && r.chance(0.5)) mess = r.pick(['Mess XYZ Echo VIP', 'Mess XYZ Golf VIP', 'XYZ MainCamp']);
      db.mess.push({ id_mess: ++db.seq.mess, id_ho: k.id_ho, mess: mess,
        kamar_mess: mess === D.LUAR_MESS ? null : String.fromCharCode(65 + r.int(0, 5)) + '-' + r.int(1, 32) });
      var nikah = r.chance(0.68);
      var anak = nikah ? r.int(0, 3) : 0;
      db.bpjs.push({ id_bpjs: ++db.seq.bpjs, id_ho: k.id_ho, bpjs_kes: 1000000000 + r.int(0, 999999999),
        status_bpjs_kes: k._dot ? 'Tidak Aktif' : (r.chance(0.97) ? 'Aktif' : 'Proses'), bpjs_tk: 19000000 + r.int(0, 8999999),
        tgl_kepesertaan_bpjs: D.geser(k._doh, r.int(10, 45)) <= B ? D.geser(k._doh, r.int(10, 45)) : null,
        gender: k._p ? 'Perempuan' : 'Laki-laki', marital: nikah ? 'K/' + anak : 'TK/0', marital_status: anak });
    });

    /* ---------- roster ---------- */
    var JUMLAH_FB = 14;
    function genRoster(k, anchor, kerjaSebelum) {
      var staff = D.isStaff(k.status);
      var dasar = staff ? 56 : 70;
      var fase = r.int(0, 13), crewCs = r.chance(0.35);
      var kode = {};
      function panjang() {
        if (r.chance(staff ? 0.85 : 0.8)) return dasar;
        return dasar + r.pick([-6, -4, -3, -2, 2, 3, 4, 7]);
      }
      function kerja(dari, n) {
        for (var x = 0; x < n; x++) {
          var t = D.geser(dari, x), c;
          if (staff) c = 'DS';
          else { var f = (x + fase) % 14; c = f < 7 ? 'DS' : 'NS'; if (f === 7 && crewCs) c = 'CS'; }
          if (x > 0 && x < n - 1) {
            var u = r();
            if (u < 0.007) c = 'TR'; else if (u < 0.010) c = 'PP'; else if (u < 0.013) c = 'CB'; else if (u < 0.024) c = 'T';
          }
          kode[t] = c;
        }
      }
      function fbIsi(dari) { for (var x = 0; x < JUMLAH_FB; x++) kode[D.geser(dari, x)] = 'FB'; }
      var d = anchor;
      while (d <= SAMPAI) { fbIsi(d); d = D.geser(d, JUMLAH_FB); var w = panjang(); kerja(d, w); d = D.geser(d, w); }
      d = D.geser(anchor, -1);
      var pertama = true;
      while (d >= DARI) {
        var w2 = pertama && kerjaSebelum ? kerjaSebelum : panjang();
        pertama = false;
        var mulai = D.geser(d, -(w2 - 1));
        kerja(mulai, w2);
        d = D.geser(mulai, -1);
        var mfb = D.geser(d, -(JUMLAH_FB - 1));
        fbIsi(mfb);
        d = D.geser(mfb, -1);
      }
      var awal = k._doh > DARI ? k._doh : DARI;
      var akhir = k._dot && k._dot < SAMPAI ? k._dot : SAMPAI;
      var s = '';
      for (var t = awal; t <= akhir; t = D.geser(t, 1)) s += kode[t] ? KE_HURUF[kode[t]] : '.';
      db.roster[k.id_ho] = { s: awal, c: s };
      D.rRapikan(db, k.id_ho);
    }
    // tanggal kunci skenario demo
    var BESOK = D.geser(B, 1);
    var AFL_HARI_INI = D.tambahBulan(B, 1);
    var AFL_KEMARIN = D.jendelaAfl(D.geser(B, -1));
    var HARI_MATI = D.geser(B, -4);                         // server mati saat jadwal AFL 08:00
    var AFL_TERLEWAT = D.jendelaAfl(HARI_MATI);
    var paksa = {};   // id_ho -> {anchor, kerja}
    var siapPaksa = r.acak(aktifList.filter(function (k) { return !D.isStaff(k.status) && baru.indexOf(k) < 0; }));
    var ambilPaksa = function (lokal) {
      for (var x = 0; x < siapPaksa.length; x++) {
        var k = siapPaksa[x];
        if (!paksa[k.id_ho] && lokalKah(k) === lokal) return k;
      }
      return siapPaksa.filter(function (k) { return !paksa[k.id_ho]; })[0];
    };
    function setPaksa(k, anchor, kerja, poh) { paksa[k.id_ho] = { anchor: anchor, kerja: kerja }; if (poh) k.poh = poh; }
    // berangkat cuti BESOK (crosscek): 2 POH luar + 1 lokal
    setPaksa(ambilPaksa(false), BESOK, 70, 'Jakarta');
    setPaksa(ambilPaksa(false), BESOK, 70, 'Banjarmasin');
    setPaksa(ambilPaksa(true), BESOK, 70);
    // balik cuti BESOK (blok FB B-12 .. B+1)
    setPaksa(ambilPaksa(false), D.geser(B, -12), 70, 'Surabaya');
    setPaksa(ambilPaksa(true), D.geser(B, -12), 70);
    // run AFL hari ini (menunggu cetak): mulai cuti tepat sebulan lagi
    setPaksa(ambilPaksa(true), AFL_HARI_INI, 70);
    setPaksa(ambilPaksa(true), AFL_HARI_INI, 73);
    setPaksa(ambilPaksa(false), AFL_HARI_INI, 70, 'Balikpapan');
    var kSpecial = ambilPaksa(false); setPaksa(kSpecial, AFL_HARI_INI, 66, 'Makassar');
    var kBandung = ambilPaksa(false); setPaksa(kBandung, AFL_HARI_INI, 70, 'Bandung');
    // run AFL kemarin (sudah dicetak)
    setPaksa(ambilPaksa(true), AFL_KEMARIN[AFL_KEMARIN.length - 1], 70);
    setPaksa(ambilPaksa(false), AFL_KEMARIN[AFL_KEMARIN.length - 1], 70, 'Hulu Sungai Utara');
    // tanggal yang terlewat (jadwal AFL tidak jalan)
    setPaksa(ambilPaksa(true), AFL_TERLEWAT[AFL_TERLEWAT.length - 1], 70);
    setPaksa(ambilPaksa(false), AFL_TERLEWAT[AFL_TERLEWAT.length - 1], 68, 'Samarinda');

    karyawan.forEach(function (k) {
      var p = paksa[k.id_ho];
      if (p) return genRoster(k, p.anchor, p.kerja);
      var siklus = (D.isStaff(k.status) ? 56 : 70) + JUMLAH_FB;
      var anchor = baru.indexOf(k) >= 0 ? D.geser(k._doh, r.int(40, 66)) : D.geser(B, r.int(0, siklus - 1));
      genRoster(k, anchor);
    });

    /* ---------- karyawan final (kolom tabel saja) ---------- */
    karyawan.forEach(function (k) {
      db.karyawan.push({ id_ho: k.id_ho, id_site: k.id_site, nama: k.nama, jabatan: k.jabatan, mpp_position: k.mpp_position,
        acting: k.acting || null, mpp_dept: k.mpp_dept, mpp_section: k.mpp_section, status: k.status, kategori: k.kategori,
        kategori_posisi: k.kategori_posisi, poh: k.poh, jam_kerja: k.jam_kerja, agama: k.agama });
    });

    /* ---------- sheet Google (Rute travel, special chase, Special cash) ---------- */
    RUTE.forEach(function (x) { db.sheet.rute.push({ POH: x[0], Berangkat: x[1], Balik: x[2] }); });
    db.sheet.special.push({ id_ho: kSpecial.id_ho, nama: kSpecial.nama, Berangkat: 'Travel Tanjung – BDJ · Pesawat BDJ – UPG (Travel Day)', Balik: 'Pesawat UPG – BDJ · Travel BDJ – Tanjung (Travel Day)' });
    var kSc2 = aktifList.filter(function (k) { return k.poh === 'Medan'; })[0];
    if (kSc2) db.sheet.special.push({ id_ho: kSc2.id_ho, nama: kSc2.nama, Berangkat: 'Pesawat BDJ – CGK – KNO (Travel Day)', Balik: '' });
    aktifList.filter(function (k) { return ['DS', 'NS'].indexOf(D.rGet(db, k.id_ho, BESOK)) >= 0 && !D.isStaff(k.status); })
      .slice(5, 8).forEach(function (k, n) {
        db.sheet.specialCash.push({ id_ho: k.id_ho, Nama: k.nama, Status: 'Aktif',
          'SC. Makan Pagi': n === 0 ? 'PONDOK EARTHWORK' : '', 'SC. Makan  Siang': ['Snack Hot Seat OB Mining', 'Snack Hot Seat Coal Mining', 'PONDOK EARTHWORK'][n],
          'SC. Makan Mala': n === 2 ? 'XYZ MainCamp' : '', 'SC. Makan Tengah Malam': n === 1 ? 'Snack Hot Seat Coal Mining' : '' });
      });

    /* ---------- unit & skill & SIMPER ---------- */
    var unitPerKat = {};
    UNIT.forEach(function (g) {
      unitPerKat[g[0]] = [];
      g[1].forEach(function (u) {
        var o = { id_unit: ++db.seq.unit, unit: u, kategori: g[0] };
        db.unit.push(o);
        if (u !== 'XCMG XE700D') unitPerKat[g[0]].push(o);
      });
    });
    var CATATAN_SIMPER = ['Menunggu tes ulang praktik unit HD', 'Kartu hilang — pengajuan cetak ulang', 'Pembatasan: hanya area disposal',
      'Perpanjangan sudah diajukan ke KTT', 'Tes medical ulang (tekanan darah)', 'Belum ikut induksi unit baru'];
    var nCat = 0, nExp = 0, nSegera = 0;
    karyawan.forEach(function (k) {
      if (!k._op || (k._dot && r.chance(0.4))) return;
      if (!r.chance(D.isStaff(k.status) ? 0.7 : 0.9)) return;
      var exp;
      var u = r();
      if (u < 0.035 && nExp < 6) { exp = D.geser(B, -r.int(2, 45)); nExp++; }
      else if (u < 0.09 && nSegera < 9) { exp = D.geser(B, r.int(0, 29)); nSegera++; }
      else exp = D.geser(B, r.int(35, 720));
      var lv = k._op === 'LV' || D.isStaff(k.status);
      db.simper.push({ id_simper: ++db.seq.simper, id_ho: k.id_ho, operator: k._op,
        access: lv ? (r.chance(0.7) ? 'Full Access' : 'Pit Access') : (r.chance(0.6) ? 'Pit Access' : 'Full Access'),
        class: lv ? r.pick(['A', 'BII Umum']) : r.pick(['BII Umum', 'BII', 'BII Umum']),
        no_simpol: 'SMP-' + String(100000 + r.int(0, 899999)), exp: exp,
        catatan: (r.chance(0.035) && nCat < CATATAN_SIMPER.length) ? CATATAN_SIMPER[nCat++] : null });
      if (!k._unit) return;
      var pilihan = r.acak(unitPerKat[k._unit]).slice(0, r.int(1, Math.min(3, unitPerKat[k._unit].length)));
      if (k._unit === 'Dump Truck' && r.chance(0.25)) pilihan.push(unitPerKat.Support[0]);
      if (k._unit === 'Excavator' && r.chance(0.2)) pilihan.push(unitPerKat['Wheel Loader'][0]);
      pilihan.forEach(function (un, n) {
        db.skill.push({ id_skill: ++db.seq.skill, id_ho: k.id_ho, tgl_ditambah: D.geser(B, -r.int(4, 900)), skill: un.id_unit,
          status: n === 0 ? r.bobot([['Full', 85], ['Training', 10], ['Parsial', 5]]) : r.bobot([['Full', 45], ['Training', 35], ['Parsial', 20]]) });
      });
    });

    /* ---------- absensi (hanya mencatat ketidakhadiran) ---------- */
    var CATATAN_ABSEN = {
      SK: ['Demam, surat dokter klinik site', 'Sakit gigi — rujukan RS Tanjung', 'ISPA, istirahat 1 hari', 'Diare, surat klinik'],
      A: ['Tanpa keterangan', 'Tidak bisa dihubungi', ''],
      PW: ['Pulang awal — urusan keluarga', 'Izin pulang cepat, anak sakit', 'Izin ke bank'],
      SP: ['Izin acara keluarga (pernikahan)', 'Izin duka — keluarga meninggal'],
      LS: ['Libur susulan pengganti CB', 'Libur susulan'],
      TBA: ['Menunggu konfirmasi atasan', 'Belum ada kabar — dicek ulang'],
      OD: ['Dinas luar — pelatihan K3 di Banjarmasin', 'Dinas luar — perpanjangan SIMPER'],
      SPS: ['Izin sekolah/ujian']
    };
    for (var h = -62; h <= 0; h++) {
      var tgl = D.geser(B, h);
      var kandidat = aktifList.filter(function (k) { return D.SHIFT_KERJA.indexOf(D.rGet(db, k.id_ho, tgl)) >= 0; });
      var n = h === 0 ? 1 : r.int(1, 6);
      r.acak(kandidat).slice(0, n).forEach(function (k) {
        var kode = r.bobot([['SK', 38], ['A', 14], ['PW', 15], ['SP', 10], ['LS', 7], ['TBA', 6], ['OD', 7], ['SPS', 3]]);
        var surat = null;
        if (['SK', 'SP', 'PW', 'SPS', 'OD'].indexOf(kode) >= 0 && r.chance(0.78)) {
          var s2 = D.geser(tgl, r.int(0, 3));
          if (s2 <= B) surat = s2;
        }
        db.absen.push({ id_absen: ++db.seq.absen, id_ho: k.id_ho, tgl: tgl, absen_code: kode,
          jam: kode === 'PW' ? r.pick([2, 3, 4, 4.5, 6]) : (kode === 'SK' && r.chance(0.2) ? 12 : null),
          surat_diterima: surat, catatan: r.pick(CATATAN_ABSEN[kode] || ['']) || null });
      });
    }

    /* ---------- APD ---------- */
    APD.forEach(function (a) { db.apd.push({ id_apd: ++db.seq.apd, nama_apd: a[0], tipe_apd: a[1] || null }); });
    var apdId = function (nama, tipe) {
      for (var x = 0; x < db.apd.length; x++) if (db.apd[x].nama_apd === nama && (db.apd[x].tipe_apd || '') === (tipe || '')) return db.apd[x].id_apd;
      return null;
    };
    var JAB6 = /fleet\s*-?\s*line\s*-?\s*up|foreman|supervisor|dewatering/i;
    function kapd(id, apd, diajukan, safety, wh, diambil, kembali) {
      var o = { id_kar_apd: ++db.seq.kapd, id_ho: id, apd: apd, tgl_diajukan: diajukan || null, safety: safety ? 1 : 0,
        warehouse: wh ? 1 : 0, tgl_diambil: diambil || null, tgl_dikembalikan: kembali || null };
      db.kapd.push(o);
      return o;
    }
    var diajukanBaru = [];
    aktifList.forEach(function (k) {
      var bulan = JAB6.test(k.jabatan) ? 6 : 12;
      var tipe = r.chance(0.7) ? 'Lace-up' : 'Boot';
      var umur = r.int(10, bulan * 30 + 18);
      var ambil = D.geser(B, -umur);
      if (ambil < k._doh) ambil = D.geser(k._doh, 2);
      var ajukan = D.geser(ambil, -r.int(2, 9));
      // pasangan sebelumnya yang sudah dikembalikan (riwayat)
      if (D.selisih(k._doh, ajukan) > bulan * 30 + 20 && r.chance(0.55)) {
        var lamaAmbil = D.geser(ambil, -(bulan * 30 + r.int(-10, 25)));
        kapd(k.id_ho, apdId('Safety Shoes', tipe), D.geser(lamaAmbil, -r.int(2, 8)), 1, 1, lamaAmbil, ambil);
      }
      kapd(k.id_ho, apdId('Safety Shoes', tipe), ajukan, 1, 1, ambil, null);
      if (r.chance(0.75)) {
        var hAmbil = D.geser(B, -r.int(20, 745));
        if (hAmbil < k._doh) hAmbil = D.geser(k._doh, 3);
        kapd(k.id_ho, apdId('Helm', D.isStaff(k.status) ? 'Putih' : 'Kuning'), D.geser(hAmbil, -r.int(1, 6)), 1, 1, hAmbil, null);
      }
      [['Rompi Reflektif', r.chance(0.6) ? 'L' : 'XL', 0.45], ['Kacamata Safety', r.chance(0.5) ? 'Gelap' : 'Bening', 0.35],
        ['Sarung Tangan', 'Kulit', 0.25], ['Earplug', '', 0.15]].forEach(function (x) {
        if (!r.chance(x[2])) return;
        var a2 = D.geser(B, -r.int(5, 300));
        if (a2 < k._doh) return;
        kapd(k.id_ho, apdId(x[0], x[1]), D.geser(a2, -r.int(1, 6)), 1, 1, a2, null);
      });
    });
    // sudah diajukan (dicetak) beberapa hari lalu, ceklis belum lengkap
    r.acak(aktifList).slice(0, 7).forEach(function (k, n) {
      var aj = D.geser(B, -r.int(1, 6));
      diajukanBaru.push(kapd(k.id_ho, apdId(r.pick(['Rompi Reflektif', 'Kacamata Safety', 'Sarung Tangan']), r.pick(['L', 'Gelap', 'Kulit'])) ||
        apdId('Jas Hujan', 'L'), aj, n % 3 !== 0, n % 3 === 2, null, null));
    });
    // antrean cetak (tgl_diajukan masih kosong)
    r.acak(aktifList).slice(0, 4).forEach(function (k, n) {
      kapd(k.id_ho, apdId('Safety Shoes', 'Lace-up'), null, 0, 0, null, null);
      if (n % 2 === 0) kapd(k.id_ho, apdId('Rompi Reflektif', 'XL'), null, 0, 0, null, null);
      if (n === 1) kapd(k.id_ho, apdId('Jas Hujan', 'L'), null, 0, 0, null, null);
    });

    /* ---------- warning ---------- */
    var pembina = aktifList.filter(function (k) { return D.isStaff(k.status); });
    var kandidatWar = r.acak(aktifList.filter(function (k) { return !D.isStaff(k.status); }));
    function warn(k, sanksi, hariLalu, status, idxPel, catatan) {
      var pb = r.pick(pembina.filter(function (p) { return p.id_ho !== k.id_ho; }));
      var o = { id_warning: ++db.seq.warning, id_ho: k.id_ho, pelanggaran: PELANGGARAN[idxPel % PELANGGARAN.length],
        sanksi: sanksi, tgl_war_diberi: D.geser(B, -hariLalu), pembina: pb.id_ho, war_catatan: catatan || null, status: status || null };
      db.warning.push(o);
      return o;
    }
    // eskalasi satu orang: Verbal -> Pertama -> Kedua
    var kEsk = kandidatWar[0];
    warn(kEsk, 'Verbal', 150, 'Done', 2, 'Sudah dibina langsung oleh foreman');
    warn(kEsk, 'Pertama', 70, null, 2, 'Terlambat lagi 3x di bulan berikutnya');
    var wEsk = warn(kEsk, 'Kedua', 9, null, 3, 'Eskalasi dari SP-1 — mangkir 2 hari');
    var daftarWar = [
      ['Konseling', 25, null, 0], ['Pertama', 40, null, 1], ['Verbal', 15, null, 5], ['Konseling', 60, 'Done', 9],
      ['Pertama', 110, null, 6], ['Ketiga', 30, null, 7], ['Verbal', 200, 'Done', 4], ['Pertama', 180, 'Done', 1],
      ['Konseling', 5, null, 10], ['Kedua', 130, null, 8], ['Verbal', 95, 'Cancel', 11], ['Pertama', 12, null, 4],
      ['Verbal', 230, 'Done', 0], ['Konseling', 140, null, 9], ['Pertama', 3, null, 1], ['Kedua', 220, 'Done', 6]
    ];
    var wDaftar = daftarWar.map(function (x, n) { return warn(kandidatWar[n + 1], x[0], x[1], x[2], x[3]); });
    // satu warning milik karyawan yang sudah DOT (tidak dihitung dashboard)
    warn(berhenti[0], 'Pertama', 20, null, 3, 'Diberikan sebelum karyawan resign');

    /* ---------- AFL tercetak (karyawan_afl) ---------- */
    var JADWAL_SEJAK = D.geser(B, -45);
    var awalAfl = D.awalBulan(D.tambahBulan(B, -2));
    var tanggalAfl = [];
    for (var t2 = awalAfl; t2 <= AFL_HARI_INI; t2 = D.geser(t2, 1)) {
      if (t2 === AFL_HARI_INI || AFL_TERLEWAT.indexOf(t2) >= 0) continue;
      tanggalAfl.push(t2);
    }
    var semuaAfl = D.hitungAfl(db, tanggalAfl);
    var tidakTercetak = r.acak(semuaAfl.filter(function (a) { return a.awal_cuti < D.geser(B, -20); })).slice(0, 2)
      .map(function (a) { return D.kunciAfl(a); });
    var ALASAN_REV = ['Akhir cuti salah — roster berubah sesudah dicetak', 'Tanda tangan supervisor belum ada',
      'Jalur travel diganti (tiket pesawat penuh)', 'Hari kerja kurang 2 hari — cek ulang roster'];
    var crossMerah = null;
    semuaAfl.forEach(function (a) {
      if (tidakTercetak.indexOf(D.kunciAfl(a)) >= 0) return;
      // hari run yang menjangkau awal cuti ini
      var R = D.tambahBulan(a.awal_cuti, -1);
      if (D.jendelaAfl(R).indexOf(a.awal_cuti) < 0) R = D.geser(R, 1);
      if (R > B) R = B;
      var oleh = r.chance(0.6) ? 'Siti Rahmawati' : 'Andhika Samuel';
      var pada = D.pada(R, 8, r.int(20, 59), r.int(0, 59));
      var umur = D.selisih(R, B);
      var status;
      if (a.awal_cuti < D.geser(B, -14)) status = r.bobot([['full', 84], ['revisi', 5], ['lapangan', 8], ['nihil', 3]]);
      else if (umur >= 15) status = r.bobot([['full', 30], ['lapangan', 45], ['revisi', 6], ['nihil', 19]]);
      else status = r.bobot([['full', 12], ['lapangan', 38], ['revisi', 6], ['nihil', 44]]);
      var o = { id_afl: ++db.seq.afl, id_ho: a.id_ho, awal_cuti: a.awal_cuti, akhir_cuti: a.akhir_cuti,
        total_h_kerja: a.total_h_kerja, total_cuti: a.total_cuti, alasan: a.alasan,
        jalur_berangkat: a.jalur_berangkat || null, jalur_balik: a.jalur_balik || null,
        special_case: String(a.status_cuti || '').toUpperCase() === 'TR' ? 1 : 0, cetak: 1,
        dari_lapangan: status === 'full' || status === 'lapangan' || (status === 'revisi' && r.chance(0.5)) ? 1 : 0,
        full_approve: status === 'full' ? 1 : 0, revisi: status === 'revisi' ? 1 : 0,
        alasan_revisi: status === 'revisi' ? r.pick(ALASAN_REV) : null,
        dicetak_pada: D.jamDetik(pada) + '.000', dicetak_oleh: oleh };
      // crosscek: satu yang berangkat besok — roster berubah sesudah AFL dicetak
      if (a.awal_cuti === BESOK && !crossMerah && !D.pohLokal(a.poh)) {
        crossMerah = o;
        o.akhir_cuti = D.geser(a.akhir_cuti, 2); o.total_cuti = 14; o.full_approve = 0; o.revisi = 0; o.dari_lapangan = 1; o.alasan_revisi = null;
      }
      db.afl.push(o);
    });

    /* ---------- eksekusi n8n: AFL (10 hari terakhir), MBR, Import Roster ---------- */
    function idExec() { db.seq.exec += r.int(2, 4); return db.seq.exec; }
    for (var hr = -10; hr <= 0; hr++) {                    // = jendela pemantau aflTerlewat (10 hari)
      var R2 = D.geser(B, hr);
      // MBR 09:00 (hari ini dibuat di bawah)
      if (hr < 0) {
        var mMulai = D.pada(R2, 9, 0, 2);
        db.exec.push({ id: idExec(), wf: 'mbr', status: 'success', mode: 'trigger', mulai: D.iso(mMulai), selesai: D.iso(mMulai + r.int(14, 26) * 60000) });
      }
      if (R2 === HARI_MATI) continue;                     // server mati 05.10–08.45: jadwal AFL 08:00 terlewat
      var mulai = hr === 0 ? Math.min(D.pada(R2, 8, 0, 1), sekarang - 20 * 60000) : D.pada(R2, 8, 0, 1);
      var items = D.hitungAfl(db, D.jendelaAfl(R2));
      var e = { id: idExec(), wf: 'afl', status: 'success', mode: 'trigger', mulai: D.iso(mulai), selesai: null,
        tunggu: null, items: items, body: null, dicetak: null, dokumen: null, simpan: null, pemicu: null, susulan: null };
      if (!items.length) {
        e.selesai = D.iso(mulai + 4000);
      } else if (hr === 0) {
        e.status = 'waiting';
        e.tunggu = D.iso(mulai + 23 * 3600000);
      } else {
        var olehNama = r.chance(0.6) ? ['siti', 'Siti Rahmawati'] : ['andhika', 'Andhika Samuel'];
        var cetakPada = mulai + r.int(35, 140) * 60000;
        e.body = { cetak: true, oleh: olehNama[0], nama: olehNama[1], pada: D.iso(cetakPada) };
        e.dicetak = items.map(D.kunciAfl);
        e.dokumen = D.dokumenAfl(items, e.id);
        e.simpan = { keadaan: 'siap', jumlah: items.length };
        e.selesai = D.iso(cetakPada + 26000);
      }
      db.exec.push(e);
    }
    var impMulai = D.pada(D.geser(B, -3), 14, 12, 40);
    db.exec.push({ id: idExec(), wf: 'impor', status: 'success', mode: 'webhook', mulai: D.iso(impMulai), selesai: D.iso(impMulai + 3800) });
    db.exec.sort(function (a, b) { return a.id - b.id; });
    db.jadwalAflSejak = JADWAL_SEJAK;

    // MBR hari ini: menunggu persetujuan (batas 30 menit)
    var gen = sekarang - 3 * 60000;
    db.mbr = Object.assign({ exec: idExec(), tgl: BESOK, status: 'pending', generatedAt: D.iso(gen), sentAt: null, expiredAt: null,
      kirimPada: null, berikutPada: null, execBaru: null }, D.hitungMbr(db, BESOK));
    db.exec.push({ id: db.mbr.exec, wf: 'mbr', status: 'waiting', mode: 'trigger', mulai: D.iso(gen - 70000), selesai: null });

    /* ---------- jejak audit (audit_log) ---------- */
    function audit(ts, action, actor, idHo, ok, detail) {
      db.audit.push({ id: ++db.seq.audit, ts: D.jamDetik(ts) + '.000', action: action, actor: actor, source_ip: r.pick(IP),
        id_ho: idHo || null, ok: ok ? 1 : 0, detail: detail || null });
    }
    var log = [];
    // riwayat cetak APD (5 terakhir) — memakai baris yang sudah diajukan
    var grupAju = {};
    diajukanBaru.forEach(function (o) { (grupAju[o.tgl_diajukan] = grupAju[o.tgl_diajukan] || []).push(o); });
    Object.keys(grupAju).sort().forEach(function (tg) {
      var rows = grupAju[tg];
      log.push([D.pada(tg, 10, r.int(5, 50), 3), 'apd-cetak', 'budi.s', null, 1, { ukuran: 61234, diajukan: rows.length,
        jumlah: rows.length, karyawan: rows.length, nama: 'Budi Santoso', tanggal: tg,
        id_kar_apd: rows.map(function (x) { return x.id_kar_apd; }), id_ho: rows.map(function (x) { return x.id_ho; }) }]);
    });
    // email & cetak warning
    [wEsk].concat(wDaftar.slice(0, 6)).forEach(function (w, n) {
      if (w.status === 'Cancel') return;
      var ts = D.pada(w.tgl_war_diberi, 13, 10 + n * 3, 0);
      log.push([ts, 'warning-cetak', 'dewi', w.id_ho, 1, { ukuran: 48211, id_warning: w.id_warning, sanksi: w.sanksi, nama: 'Dewi Lestari' }]);
      if (n % 2 === 0) log.push([ts + 600000, 'warning-email', 'dewi', w.id_ho, 1, { kepada: 'hrd@example.com', id_warning: w.id_warning, sanksi: w.sanksi, nama: 'Dewi Lestari' }]);
    });
    // login & perubahan harian
    for (var hl = -6; hl <= 0; hl++) {
      var tg2 = D.geser(B, hl);
      log.push([D.pada(tg2, 7, 41, 12), 'login', 'siti', null, 1, { hasil: 'sukses' }]);
      log.push([D.pada(tg2, 8, 3, 50), 'login', 'andhika', null, 1, { hasil: 'sukses' }]);
      if (hl === -2) log.push([D.pada(tg2, 7, 40, 2), 'login', 'siti', null, 0, { hasil: 'password salah' }]);
    }
    log.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (x) { audit(x[0], x[1], x[2], x[3], x[4], x[5]); });

    /* ---------- To Do List ---------- */
    var TODO = [
      // [pekerjaan, catatan, oleh, dikerjakan, hariTambah, tenggatHari|null, selesaiHari|null]
      ['Import roster periode bulan depan', 'File dari planning sudah masuk email — cek format kolom tanggal (General) sebelum diunggah.', 'andhika', 'budi.s', -3, 4, null],
      ['Follow up surat sakit 3 karyawan', 'Lihat panel "Belum Ada Surat" di halaman Absensi.', 'siti', 'siti', -5, null, null],
      ['Perpanjangan SIMPER yang habis ≤ 30 hari', 'Daftar ada di panel Ringkasan halaman SIMPER. Koordinasi dengan KTT.', 'andhika', 'dewi', -2, 9, null],
      ['Cetak & kirim AFL ke lapangan', 'Run AFL pagi ini menunggu cetak.', 'andhika', 'siti', 0, 0, null],
      ['Rekap absensi minggu lalu untuk payroll', '', 'siti', 'siti', -8, null, -6],
      ['Update data mess karyawan baru', '4 karyawan baru belum punya kamar.', 'andhika', 'budi.s', -1, null, null],
      ['Serahkan form APD ke Safety & Warehouse', 'Form yang dicetak minggu ini.', 'budi.s', 'budi.s', -4, null, -1],
      ['Cek selisih MBR vs roster sebelum approve', 'Kalau ada karyawan aktif tanpa roster, isi dulu lewat Edit Roster.', 'andhika', null, -1, null, null],
      ['Backup manual database sebelum update magi-api', 'scripts/backup-semua.sh lalu uji restore di container uji.', 'andhika', 'andhika', -10, null, -9],
      ['Rapat koordinasi admin Dept. Mining', 'Agenda: alur warning & email ke HR.', 'dewi', 'andhika', -6, -1, null],
      ['Input warning hasil inspeksi KTT', '', 'dewi', 'dewi', -12, null, -11],
      ['Revisi AFL yang ditandai oranye', 'Lihat panel Catatan AFL — saring "Revisi".', 'siti', 'siti', -2, 2, null],
      ['Bersihkan antrean cetak APD yang dobel', '', 'budi.s', 'dewi', -7, null, -3]
    ];
    TODO.forEach(function (t, n) {
      var tambah = D.geser(B, t[4]);
      var o = { id: ++db.seq.todo, pekerjaan: t[0], catatan: t[1] || null,
        tenggat: t[5] === null ? null : D.geser(B, t[5]), tgl_tambah: tambah, oleh: t[2], oleh_nama: NAMA_USER[t[2]],
        dikerjakan_oleh: t[3], dikerjakan_nama: t[3] ? NAMA_USER[t[3]] : null, selesai: 0, tgl_selesai: null,
        selesai_oleh: null, selesai_nama: null, selesai_pada: null,
        dibuat: D.jamDetik(D.pada(tambah, 8, 10 + n * 3, 0)) + '.000', diubah: D.jamDetik(D.pada(tambah, 8, 10 + n * 3, 0)) + '.000' };
      if (t[6] !== null) {
        var ts = D.geser(B, t[6]);
        o.selesai = 1; o.tgl_selesai = ts; o.selesai_oleh = t[3] || t[2]; o.selesai_nama = NAMA_USER[t[3] || t[2]];
        o.selesai_pada = D.jamDetik(D.pada(ts, 15, 20 + n, 11)) + '.' + String(100 + n * 37).slice(-3);
      }
      db.todo.push(o);
    });

    return db;
  };
})();

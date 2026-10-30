/* ============================================================
   MAGI//SYSTEM — MODE DEMO · api.js
   ------------------------------------------------------------
   "magi-api" versi browser. window.fetch dibungkus: setiap panggilan
   ke /webhook/*, /webhook-waiting/* dan /healthz dijawab di sini dari
   database dummy (util.js/seed.js) — halaman dashboard ASLI tidak
   diubah sama sekali.

   Port dari service/server.js + service/routes/*.js:
     - gerbang sesi (401), wajib ganti password lemah (403), hak fitur
       per rute (HAK_RUTE, 403), proxy n8n terbatas (aturanProxy)
     - validasi, bentuk respons, kode HTTP, dan audit_log per rute
   Pengganti n8n/Google: MBR (persetujuan 30 menit), AFL (gerbang cetak,
   jalankan ulang, susulan), Import Roster (CSV/XLSX), cetak PDF (pdf.js).
   ============================================================ */
(function () {
  'use strict';
  var D = window.MAGI_DEMO;
  var IP = '192.168.1.23';
  var TTL_MS = 12 * 3600 * 1000;

  /* ==========================================================
     SESI (pengganti cookie HttpOnly magi_sess)
     ========================================================== */
  function bacaSesi() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(D.KUNCI_SESI) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s.exp !== 'number' || s.exp <= Date.now()) return null;
    return s;
  }
  function tulisSesi(p) {
    var s = { u: String(p.u), peran: p.peran === 'Administrator' ? 'Administrator' : 'Operator',
      hak: Array.isArray(p.hak) ? p.hak.map(String) : [], exp: Date.now() + TTL_MS };
    if (p.g) s.g = 1;
    try { localStorage.setItem(D.KUNCI_SESI, JSON.stringify(s)); } catch (e) {}
  }
  function hapusSesi() { try { localStorage.removeItem(D.KUNCI_SESI); } catch (e) {} }
  D.sesi = bacaSesi;

  /* ==========================================================
     UTIL
     ========================================================== */
  var teks = function (v) { return v == null ? '' : String(v).trim(); };
  var s = function (v) { return v == null ? '' : String(v); };
  function tolak(salah) { return { code: 422, json: { status: 'invalid', message: salah.join(' · '), errors: salah } }; }
  // collation utf8mb4_0900_ai_ci: tidak peka huruf besar/kecil & aksen
  function lipat(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function mengandung(hay, q) { return lipat(hay).indexOf(lipat(q)) >= 0; }
  function sama(a, b) { return lipat(a) === lipat(b); }
  var KOLASI = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('id', { sensitivity: 'base' }) : null;
  function urutNama(a, b) { return KOLASI ? KOLASI.compare(String(a), String(b)) : String(a).localeCompare(String(b)); }
  function hari() { return D.hariIni(); }
  function salin(o) { return JSON.parse(JSON.stringify(o)); }

  function audit(db, o) {
    var ctx = o.ctx || {};
    db.audit.push({ id: ++db.seq.audit, ts: D.jamDetik(Date.now()) + '.' + D.p2(Date.now() % 100) + '0',
      action: o.action, actor: ctx.actor || null, source_ip: IP, id_ho: o.id_ho || null, ok: o.ok === false ? 0 : 1,
      detail: o.detail == null ? null : salin(o.detail) });
    if (db.audit.length > 1500) db.audit.splice(0, db.audit.length - 1500);
  }
  function namaPengguna(db, ctx) {
    var u = db.user.filter(function (x) { return sama(x.username, ctx.actor); })[0];
    return (u && u.nama && String(u.nama).trim()) || ctx.actor;
  }
  function setDot(db) {
    var x = {};
    db.kontrak.forEach(function (k) { if (k.dot && String(k.dot) !== '0000-00-00') x[k.id_ho] = 1; });
    return x;
  }
  function validId(db) {
    var x = {};
    db.karyawan.forEach(function (k) { x[k.id_ho] = 1; });
    return x;
  }
  function bolehFitur(ctx, f) {
    if (!ctx) return false;
    if (ctx.peran === 'Administrator') return true;
    return Array.isArray(ctx.hak) && ctx.hak.indexOf(f) >= 0;
  }
  function orderRange(a, b) { return a > b ? [b, a] : [a, b]; }

  /* ==========================================================
     TRANSISI WAKTU — pengganti eksekusi n8n yang berjalan sendiri
     ========================================================== */
  function tick(db) {
    var kini = Date.now(), ubah = false;
    var m = db.mbr;
    if (m) {
      if (m.berikutPada && Date.parse(m.berikutPada) <= kini) {       // Jalankan Ulang MBR selesai
        var gen = Date.parse(m.berikutPada);
        var tgl = D.geser(D.ymd(new Date(gen)), 1);
        if (m.exec && m.exec !== m.execBaru) selesaiExec(db, m.exec, 'success', D.iso(gen));   // run lama digantikan
        Object.assign(m, D.hitungMbr(db, tgl), { tgl: tgl, status: 'pending', generatedAt: D.iso(gen), sentAt: null,
          expiredAt: null, kirimPada: null, berikutPada: null, exec: m.execBaru });
        db.exec.forEach(function (e) { if (e.id === m.execBaru) e.status = 'waiting'; });
        ubah = true;
      }
      if (m.status === 'pending' && m.kirimPada && Date.parse(m.kirimPada) <= kini) {   // Approve -> email terkirim
        m.status = 'sent'; m.sentAt = m.kirimPada; m.kirimPada = null;
        selesaiExec(db, m.exec, 'success', m.sentAt);
        ubah = true;
      }
      if (m.status === 'pending' && Date.parse(m.generatedAt) + 30 * 60000 <= kini) {   // Wait 30 menit habis
        m.status = 'expired'; m.expiredAt = D.iso(Date.parse(m.generatedAt) + 30 * 60000);
        selesaiExec(db, m.exec, 'success', m.expiredAt);
        ubah = true;
      }
    }
    db.exec.forEach(function (e) {
      if (e.wf !== 'afl') return;
      if (e.status === 'running' && e.fase === 'sql' && Date.parse(e.selesaiPada) <= kini) {
        e.items = e.susulan ? D.hitungAfl(db, e.susulan, { lewatiTercetak: true }) : D.hitungAfl(db, D.jendelaAfl(D.ymd(new Date(Date.parse(e.mulai)))));
        if (!e.items.length) { e.status = 'success'; e.selesai = e.selesaiPada; e.fase = 'selesai'; }
        else { e.status = 'waiting'; e.fase = 'tunggu'; e.tunggu = D.iso(Date.parse(e.selesaiPada) + 23 * 3600000); }
        ubah = true;
      }
      if (e.status === 'waiting' && e.tunggu && Date.parse(e.tunggu) <= kini) {   // batas 23 jam
        e.status = 'success'; e.gerbangLewat = true; e.body = {}; e.selesai = e.tunggu; e.fase = 'selesai';
        ubah = true;
      }
      if (e.status === 'running' && e.fase === 'cetak' && Date.parse(e.selesaiPada) <= kini) {
        var kirim = (e.items || []).filter(function (j) { return (e.dicetak || []).indexOf(D.kunciAfl(j)) >= 0; });
        e.dokumen = D.dokumenAfl(kirim, e.id);
        e.simpan = { keadaan: 'siap', jumlah: kirim.length };
        simpanAfl(db, kirim, e.body.nama || e.body.oleh);
        e.status = 'success'; e.selesai = e.selesaiPada; e.fase = 'selesai';
        ubah = true;
      }
    });
    return ubah;
  }
  function selesaiExec(db, id, status, pada) {
    db.exec.forEach(function (e) { if (e.id === id) { e.status = status; e.selesai = pada; } });
  }
  /* node "Siapkan Simpan" + "Simpan ke karyawan_afl": upsert per (id_ho, awal_cuti) */
  function simpanAfl(db, rows, oleh) {
    var kini = D.jamDetik(Date.now()) + '.000';
    rows.forEach(function (k) {
      var ada = db.afl.filter(function (a) { return a.id_ho === k.id_ho && a.awal_cuti === k.awal_cuti; })[0];
      var nilai = { akhir_cuti: k.akhir_cuti || null, total_h_kerja: k.total_h_kerja == null ? null : k.total_h_kerja,
        total_cuti: k.total_cuti == null ? null : k.total_cuti, alasan: k.alasan || null,
        jalur_berangkat: k.jalur_berangkat || null, jalur_balik: k.jalur_balik || null,
        special_case: String(k.status_cuti || '').toUpperCase() === 'TR' ? 1 : 0, cetak: 1 };
      if (ada) Object.assign(ada, nilai);
      else db.afl.push(Object.assign({ id_afl: ++db.seq.afl, id_ho: k.id_ho, awal_cuti: k.awal_cuti, dari_lapangan: 0,
        full_approve: 0, revisi: 0, alasan_revisi: null, dicetak_pada: kini, dicetak_oleh: oleh || null }, nilai));
    });
  }

  /* ==========================================================
     ROUTES
     ========================================================== */
  var R = {};

  /* ---------------- roster ---------------- */
  R['GET /webhook/roster-list'] = function (ctx, db) {
    var qs = teks(ctx.query.q);
    var from = teks(ctx.query.from), to = teks(ctx.query.to);
    if (!D.isDate(from)) from = hari();
    if (!D.isDate(to)) to = D.geser(hari(), 2);
    var rg = orderRange(from, to); from = rg[0]; to = rg[1];
    // ORDER BY nama, tgl LIMIT 2000 — urutkan karyawannya dulu (baris per orang sudah urut tanggal)
    var out = [];
    db.karyawan.filter(function (k) { return !qs || mengandung(k.nama, qs) || mengandung(k.id_ho, qs); })
      .sort(function (a, b) { return urutNama(a.nama, b.nama); })
      .forEach(function (k) {
        if (out.length >= 2000) return;
        D.rBaris(db, k.id_ho, from, to).forEach(function (b) {
          out.push({ id: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), tgl: b.tgl, jadwal: b.shift });
        });
      });
    return { json: out.slice(0, 2000) };
  };

  R['POST /webhook/roster-update'] = function (ctx, db) {
    var src = Array.isArray(ctx.body && ctx.body.changes) ? ctx.body.changes : [];
    var valid = validId(db), errors = [], seen = {}, urut = [];
    src.forEach(function (r, idx) {
      r = r || {};
      var id = String(r.id == null ? '' : r.id).trim(), tgl = String(r.tgl == null ? '' : r.tgl).trim(),
        shift = String(r.jadwal == null ? '' : r.jadwal).trim(), bad = [];
      if (!id) bad.push('id kosong');
      else if (id.length > 20) bad.push('id > 20 karakter');
      else if (!valid[id]) bad.push('id "' + id + '" tidak terdaftar di karyawan');
      if (!tgl) bad.push('tgl kosong'); else if (!D.isDate(tgl)) bad.push('tgl "' + tgl + '" bukan YYYY-MM-DD');
      if (!shift) bad.push('jadwal kosong');
      else if (D.ROSTER_SHIFTS.indexOf(shift.toUpperCase()) < 0) bad.push('jadwal "' + shift + '" tidak valid');
      if (bad.length) { if (errors.length < 50) errors.push({ baris: idx + 1, id: id, tgl: tgl, jadwal: shift, masalah: bad }); return; }
      var key = id + '|' + tgl;
      if (!seen[key]) urut.push(key);
      seen[key] = { id_ho: id, tgl: tgl, shift: shift.toUpperCase() };
    });
    var clean = urut.map(function (k) { return seen[k]; });
    var skipped = src.length - clean.length;
    if (!clean.length) {
      var message = 'Tidak ada perubahan valid untuk disimpan' + (src.length ? ' dari ' + src.length + ' baris' : '') + '.';
      audit(db, { action: 'roster-update', ctx: ctx, ok: false, detail: { totalRows: src.length, errors: errors.length } });
      return { code: 422, json: { status: 'invalid', message: message, skipped: skipped, totalRows: src.length, errors: errors } };
    }
    clean.forEach(function (r) {
      D.rSet(db, r.id_ho, r.tgl, r.shift);
      audit(db, { action: 'roster-update', ctx: ctx, id_ho: r.id_ho, detail: { tgl: r.tgl, shift: r.shift } });
    });
    return { json: { status: 'ok', updated: clean.length, skipped: skipped,
      message: clean.length + ' perubahan disimpan' + (skipped ? '; ' + skipped + ' dilewati (invalid)' : ''), errors: errors } };
  };

  R['POST /webhook/roster-delete'] = function (ctx, db) {
    var b = ctx.body || {};
    var id = String(b.id_ho != null ? b.id_ho : '').trim(), tgl = String(b.tgl != null ? b.tgl : '').trim(), errors = [];
    if (!id) errors.push('id_ho wajib diisi'); else if (id.length > 20) errors.push('id_ho maksimal 20 karakter');
    if (!tgl) errors.push('tgl wajib diisi'); else if (!D.isDate(tgl)) errors.push('tgl harus format YYYY-MM-DD');
    if (errors.length) {
      audit(db, { action: 'roster-delete', ctx: ctx, id_ho: id || null, ok: false, detail: { errors: errors } });
      return { code: 422, json: { status: 'invalid', message: errors.join('; '), errors: errors } };
    }
    var rows = D.rBaris(db, id, tgl, '9999-12-31');
    var n = rows.length, awal = n ? rows[0].tgl : '', akhir = n ? rows[n - 1].tgl : '';
    var r = db.roster[id];
    if (r && n) {
      var i = D.selisih(r.s, tgl);
      r.c = i <= 0 ? '' : r.c.slice(0, i);
      D.rRapikan(db, id);
    }
    audit(db, { action: 'roster-delete', ctx: ctx, id_ho: id, detail: { tgl: tgl, deleted: n, awal: awal, akhir: akhir } });
    return { json: { status: 'ok', deleted: n, id_ho: id, tgl: tgl, awal: awal, akhir: akhir,
      message: n ? (n + ' baris roster dihapus (' + awal + ' s/d ' + akhir + ')') : 'Tidak ada baris roster yang cocok — tidak ada yang dihapus' } };
  };

  R['GET /webhook/roster-summary'] = function (ctx, db) {
    var tgl = teks(ctx.query.tgl);
    var d = D.isDate(tgl) ? tgl : D.geser(hari(), 1);
    var dot = setDot(db), kel = {}, shiftTotals = {}, roleMap = {}, total = 0;
    Object.keys(db.roster).forEach(function (id) {
      if (dot[id]) return;
      var code = D.rGet(db, id, d);
      if (!code) return;
      var k = D.karOf(db, id);
      var jab = (k && String(k.jabatan || '').trim()) || '(tanpa jabatan)';
      var kat = k && D.isStaff(k.status) ? 'Staff' : 'Non Staff';
      shiftTotals[code] = (shiftTotals[code] || 0) + 1;
      if (!roleMap[jab]) roleMap[jab] = { jabatan: jab, total: 0, counts: {} };
      roleMap[jab].counts[code] = (roleMap[jab].counts[code] || 0) + 1;
      roleMap[jab].total++;
      total++;
      var g = kel[kat] || (kel[kat] = { kategori: kat, total: 0, counts: {}, roleMap: {} });
      g.total++;
      g.counts[code] = (g.counts[code] || 0) + 1;
      if (!g.roleMap[jab]) g.roleMap[jab] = { jabatan: jab, total: 0, counts: {} };
      g.roleMap[jab].counts[code] = (g.roleMap[jab].counts[code] || 0) + 1;
      g.roleMap[jab].total++;
    });
    var PRIOR = ['DS', 'NS', 'CS'], present = Object.keys(shiftTotals);
    var shiftCodes = PRIOR.filter(function (c) { return present.indexOf(c) >= 0; })
      .concat(present.filter(function (c) { return PRIOR.indexOf(c) < 0; }).sort());
    var urutJab = function (a, b) { return b.total - a.total || a.jabatan.localeCompare(b.jabatan); };
    var label = {};
    D.KODE_ROSTER.forEach(function (k) { label[k.kode] = k.label; });
    return { json: {
      tgl: d, total: total, shiftCodes: shiftCodes,
      shifts: shiftCodes.map(function (c) { return { shift: c, jumlah: shiftTotals[c] }; }),
      roles: Object.keys(roleMap).map(function (k) { return roleMap[k]; }).sort(urutJab),
      kelompok: ['Staff', 'Non Staff'].filter(function (k) { return kel[k]; }).map(function (k) {
        return { kategori: k, total: kel[k].total, counts: kel[k].counts,
          roles: Object.keys(kel[k].roleMap).map(function (x) { return kel[k].roleMap[x]; }).sort(urutJab) };
      }),
      label: label
    } };
  };

  R['GET /webhook/kode-roster'] = function () { return { json: { kode: salin(D.KODE_ROSTER) } }; };

  /* ---------------- karyawan ---------------- */
  function hakPenuhKaryawan(ctx) { return !ctx || ctx.peran === 'Administrator' || (Array.isArray(ctx.hak) && ctx.hak.indexOf('karyawan') >= 0); }

  R['GET /webhook/karyawan-list'] = function (ctx, db) {
    var qs = teks(ctx.query.q);
    var cocok = db.karyawan.filter(function (k) { return !qs || mengandung(k.nama, qs) || mengandung(k.id_ho, qs); })
      .sort(function (a, b) { return urutNama(a.nama, b.nama); }).slice(0, 2000);
    if (!hakPenuhKaryawan(ctx)) {
      return { json: cocok.map(function (k) { return { id_ho: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan) }; }) };
    }
    var ids = {}; cocok.forEach(function (k) { ids[k.id_ho] = 1; });
    var pickMax = function (arr, key) {
      var m = {};
      arr.forEach(function (x) { if (ids[x.id_ho] && (!m[x.id_ho] || x[key] > m[x.id_ho][key])) m[x.id_ho] = x; });
      return m;
    };
    var mess = pickMax(db.mess, 'id_mess'), bpjs = pickMax(db.bpjs, 'id_bpjs'), kon = pickMax(db.kontrak, 'id_maskon');
    var gS = {}, gK = {}, unit = {};
    db.unit.forEach(function (u) { unit[u.id_unit] = u; });
    db.simper.slice().sort(function (a, b) { return a.id_simper - b.id_simper; }).forEach(function (x) {
      if (ids[x.id_ho]) (gS[x.id_ho] = gS[x.id_ho] || []).push(x);
    });
    db.skill.slice().sort(function (a, b) { return a.id_skill - b.id_skill; }).forEach(function (x) {
      if (ids[x.id_ho]) (gK[x.id_ho] = gK[x.id_ho] || []).push(x);
    });
    var gW = {};
    ambilWarning(db, function (w) { return !!ids[w.id_ho]; }, 'idho').forEach(function (w) { (gW[w.id_ho] = gW[w.id_ho] || []).push(w); });
    var num = function (v) { return v == null || v === '' ? null : Number(v); };
    return { json: cocok.map(function (k) {
      var m = mess[k.id_ho] || {}, b = bpjs[k.id_ho] || {}, c = kon[k.id_ho] || {}, id = k.id_ho;
      return {
        id_ho: id, id_site: s(k.id_site), nama: s(k.nama), gender: s(b.gender), agama: s(k.agama),
        marital: s(b.marital), marital_status: num(b.marital_status),
        jabatan: s(k.jabatan), mpp_position: s(k.mpp_position), acting: s(k.acting),
        mpp_dept: s(k.mpp_dept), mpp_section: s(k.mpp_section), status: s(k.status),
        kategori: s(k.kategori), kategori_posisi: s(k.kategori_posisi), poh: s(k.poh), jam_kerja: num(k.jam_kerja),
        doh: s(c.doh), dot: s(c.dot), reason_dot: s(c.reason_dot),
        mess: s(m.mess), kamar_mess: s(m.kamar_mess),
        bpjs_kes: s(b.bpjs_kes), status_bpjs_kes: s(b.status_bpjs_kes), bpjs_tk: s(b.bpjs_tk),
        tgl_kepesertaan_bpjs: s(b.tgl_kepesertaan_bpjs),
        simper: (gS[id] || []).map(function (r) {
          return { operator: s(r.operator), access: s(r.access), class: s(r.class), no_simpol: s(r.no_simpol), exp: s(r.exp), catatan: s(r.catatan) };
        }),
        skill: (gK[id] || []).map(function (r) {
          var u = unit[r.skill] || {};
          return { unit: s(u.unit), kategori_unit: s(u.kategori), status: s(r.status), tgl_ditambah: s(r.tgl_ditambah) };
        }),
        warning: (gW[id] || []).map(function (r) {
          return { sanksi: r.sanksi, tgl_war_diberi: r.tgl_war_diberi, berakhir: r.berakhir, masa_bulan: r.masa_bulan,
            sisa_hari: r.sisa_hari, berlaku: r.berlaku, pelanggaran: r.pelanggaran, nama_pembina: r.nama_pembina,
            pembina: r.pembina, status: r.status, war_catatan: r.war_catatan };
        })
      };
    }) };
  };

  var SPEC = [
    { nama: 'karyawan', fields: { jabatan: { max: 100 }, mpp_position: { max: 100 }, acting: { max: 50 }, mpp_dept: { max: 50 },
      mpp_section: { max: 100 }, status: { max: 50 }, kategori: { max: 20 }, kategori_posisi: { max: 50 }, poh: { max: 50 },
      jam_kerja: { int: true } } },
    { nama: 'masa_kontrak', butuh: 'kontrak', key: 'id_maskon', fields: { doh: { date: true }, dot: { date: true }, reason_dot: { max: 50 } } },
    { nama: 'mess', butuh: 'mess', key: 'id_mess', fields: { mess: { max: 50 }, kamar_mess: { max: 50 } } }
  ];
  R['POST /webhook/karyawan-update'] = function (ctx, db) {
    var b = ctx.body || {};
    var id = String(b.id_ho != null ? b.id_ho : '').trim();
    var changes = (b.changes && typeof b.changes === 'object') ? b.changes : {};
    var errors = [];
    if (!id) return { code: 422, json: { status: 'invalid', id_ho: id, message: 'id_ho kosong.', errors: errors } };
    var k = D.karOf(db, id);
    if (!k) return { code: 422, json: { status: 'invalid', id_ho: id, message: 'ID HO ' + id + ' tidak terdaftar di tabel karyawan.', errors: errors } };
    var known = {};
    SPEC.forEach(function (sp) { Object.keys(sp.fields).forEach(function (f) { known[f] = 1; }); });
    Object.keys(changes).forEach(function (f) {
      if (!known[f]) errors.push('Field "' + f + '" tidak boleh diubah dari halaman ini (di luar daftar putih).');
    });
    var plans = [], tables = [], total = 0;
    SPEC.forEach(function (sp) {
      var set = {}, n = 0;
      Object.keys(sp.fields).forEach(function (f) {
        if (!Object.prototype.hasOwnProperty.call(changes, f)) return;
        var rule = sp.fields[f];
        var v = String(changes[f] == null ? '' : changes[f]).trim();
        if (v === '') { set[f] = null; n++; return; }
        if (rule.int) {
          if (!/^\d{1,4}$/.test(v)) { errors.push('Field "' + f + '" harus angka bulat: "' + v + '".'); return; }
          set[f] = parseInt(v, 10); n++; return;
        }
        if (rule.date) {
          if (!D.isDate(v)) { errors.push('Field "' + f + '" harus format YYYY-MM-DD: "' + v + '".'); return; }
          set[f] = v; n++; return;
        }
        if (rule.max && v.length > rule.max) { errors.push('Field "' + f + '" melebihi ' + rule.max + ' karakter (' + v.length + ').'); return; }
        set[f] = v; n++;
      });
      var target = k;
      if (n && sp.butuh) {
        target = null;
        db[sp.butuh].forEach(function (x) { if (x.id_ho === id && (!target || x[sp.key] > target[sp.key])) target = x; });
        if (!target) {
          errors.push('Karyawan ini belum punya baris di tabel "' + sp.nama + '", jadi field-nya tidak bisa diperbarui (butuh hak INSERT yang sengaja tidak diberikan).');
          return;
        }
      }
      if (n) { plans.push({ target: target, set: set }); tables.push(sp.nama); total += n; }
    });
    if (total === 0) {
      var message = errors.length ? 'Tidak ada perubahan yang sah untuk disimpan.' : 'Tidak ada perubahan yang dikirim.';
      audit(db, { action: 'karyawan-update', ctx: ctx, id_ho: id, ok: false, detail: { errors: errors.length } });
      return { code: 422, json: { status: 'invalid', id_ho: id, message: message, errors: errors } };
    }
    plans.forEach(function (p) { Object.assign(p.target, p.set); });
    audit(db, { action: 'karyawan-update', ctx: ctx, id_ho: id, detail: { tables: tables, fields: total, changes: changes } });
    return { json: { status: 'ok', id_ho: id, fields: total, tables: tables, errors: errors,
      message: total + ' field diperbarui pada ' + tables.length + ' tabel' + (errors.length ? ' (' + errors.length + ' ditolak)' : '') + '.' } };
  };

  /* ---------------- absen ---------------- */
  R['GET /webhook/absen-list'] = function (ctx, db) {
    var qs = teks(ctx.query.q), from = teks(ctx.query.from), to = teks(ctx.query.to);
    if (!D.isDate(from)) from = hari();
    if (!D.isDate(to)) to = from;
    var rg = orderRange(from, to); from = rg[0]; to = rg[1];
    var out = [];
    db.absen.forEach(function (a) {
      if (a.tgl < from || a.tgl > to) return;
      var k = D.karOf(db, a.id_ho);
      if (!k) return;
      if (qs && !mengandung(k.nama, qs) && !mengandung(a.id_ho, qs)) return;
      out.push({ idAbsen: String(a.id_absen), id: a.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), tgl: a.tgl,
        kode: s(a.absen_code), jam: a.jam == null || a.jam === '' ? '' : String(Number(a.jam)),
        surat: a.surat_diterima == null ? '' : String(a.surat_diterima), catatan: s(a.catatan) });
    });
    out.sort(function (a, b) { return (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) || urutNama(a.nama, b.nama); });
    return { json: out.slice(0, 2000) };
  };

  R['POST /webhook/absen-save'] = function (ctx, db) {
    var raw = Array.isArray(ctx.body && ctx.body.rows) ? ctx.body.rows : [];
    var valid = validId(db), errors = [], seen = {}, urut = [], skipped = 0;
    var tolakBaris = function (i, sebab) { skipped++; if (errors.length < 50) errors.push('baris ' + (i + 1) + ': ' + sebab); };
    raw.forEach(function (r, i) {
      r = r || {};
      var id = String(r.id_ho == null ? '' : r.id_ho).trim(), tgl = String(r.tgl == null ? '' : r.tgl).trim(),
        kode = String(r.kode == null ? '' : r.kode).trim(), jam = String(r.jam == null ? '' : r.jam).trim(),
        srt = String(r.surat == null ? '' : r.surat).trim(), cat = String(r.catatan == null ? '' : r.catatan).trim();
      if (!id) return tolakBaris(i, 'id_ho kosong');
      if (id.length > 20) return tolakBaris(i, 'id_ho lebih dari 20 karakter');
      if (!valid[id]) return tolakBaris(i, 'id_ho "' + id + '" tidak ada di tabel karyawan');
      if (!D.isDate(tgl)) return tolakBaris(i, 'tgl "' + tgl + '" bukan format YYYY-MM-DD');
      if (!kode) return tolakBaris(i, 'kode absen kosong');
      if (D.ABSEN_CODES.indexOf(kode) < 0) return tolakBaris(i, 'kode absen "' + kode + '" tidak dikenal');
      if (srt && !D.isDate(srt)) return tolakBaris(i, 'surat diterima "' + srt + '" bukan format YYYY-MM-DD');
      if (cat.length > 255) return tolakBaris(i, 'catatan lebih dari 255 karakter');
      if (jam !== '') {
        jam = jam.replace(',', '.');
        var nJ = Number(jam);
        if (!isFinite(nJ)) return tolakBaris(i, 'jam "' + jam + '" bukan angka');
        if (nJ < 0) return tolakBaris(i, 'jam tidak boleh negatif');
        if (nJ > 99.99) return tolakBaris(i, 'jam lebih dari 99.99');
        jam = nJ.toFixed(2);
      }
      var key = id + '|' + tgl;
      if (!seen[key]) urut.push(key);
      seen[key] = { id: id, tgl: tgl, kode: kode, jam: jam, srt: srt, cat: cat };
    });
    var clean = urut.map(function (k) { return seen[k]; });
    if (!clean.length) {
      var message = raw.length ? ('Tidak ada baris yang valid dari ' + raw.length + ' baris dikirim') : 'Tidak ada baris dikirim';
      audit(db, { action: 'absen-save', ctx: ctx, ok: false, detail: { totalRows: raw.length, errors: errors.length } });
      return { code: 422, json: { status: 'invalid', message: message, skipped: skipped, totalRows: raw.length, errors: errors } };
    }
    clean.forEach(function (r) {
      var ada = db.absen.filter(function (a) { return a.id_ho === r.id && a.tgl === r.tgl; })[0];
      var v = { absen_code: r.kode, jam: r.jam === '' ? null : Number(r.jam), surat_diterima: r.srt || null, catatan: r.cat || null };
      if (ada) Object.assign(ada, v);
      else db.absen.push(Object.assign({ id_absen: ++db.seq.absen, id_ho: r.id, tgl: r.tgl }, v));
      audit(db, { action: 'absen-save', ctx: ctx, id_ho: r.id, detail: { tgl: r.tgl, kode: r.kode } });
    });
    return { json: { status: 'ok', saved: clean.length, skipped: skipped,
      message: clean.length + ' baris absen disimpan' + (skipped ? ', ' + skipped + ' dilewati' : ''), errors: errors } };
  };

  R['GET /webhook/absen-rate'] = function (ctx, db) {
    var from = teks(ctx.query.from), to = teks(ctx.query.to);
    if (!D.isDate(from)) from = D.geser(hari(), -1);
    if (!D.isDate(to)) to = from;
    var rg = orderRange(from, to); from = rg[0]; to = rg[1];
    var dot = setDot(db), absen = {};
    db.absen.forEach(function (a) { if (a.tgl >= from && a.tgl <= to) absen[a.id_ho + '|' + a.tgl] = a.absen_code || ''; });
    var perShift = {};
    D.SHIFT_KERJA.forEach(function (x) { perShift[x] = { shift: x, roster: 0, kode: {}, hari: {} }; });
    var tglSet = {};
    Object.keys(db.roster).forEach(function (id) {
      if (dot[id]) return;
      D.rBaris(db, id, from, to).forEach(function (b) {
        var sObj = perShift[b.shift];
        if (!sObj) return;
        var kode = absen[id + '|' + b.tgl] || '';
        tglSet[b.tgl] = 1;
        if (!sObj.hari[b.tgl]) sObj.hari[b.tgl] = { tgl: b.tgl, roster: 0, kode: {} };
        sObj.roster++; sObj.hari[b.tgl].roster++;
        if (kode !== '') {
          sObj.kode[kode] = (sObj.kode[kode] || 0) + 1;
          sObj.hari[b.tgl].kode[kode] = (sObj.hari[b.tgl].kode[kode] || 0) + 1;
        }
      });
    });
    var tanggal = Object.keys(tglSet).sort();
    var jumlah = function (o) { var c = 0; Object.keys(o).forEach(function (k) { c += o[k]; }); return c; };
    return { json: { from: from, to: to, tanggal: tanggal, shifts: D.SHIFT_KERJA.map(function (x) {
      var src = perShift[x];
      return { shift: x, roster: src.roster, catatan: jumlah(src.kode), kode: src.kode, hari: tanggal.map(function (t) {
        var h = src.hari[t] || { tgl: t, roster: 0, kode: {} };
        return { tgl: t, roster: h.roster, catatan: jumlah(h.kode), kode: h.kode };
      }) };
    }) } };
  };

  /* ---------------- auth (service/auth.js) ---------------- */
  var UMUM = ['admin', 'administrator', 'password', 'passw0rd', 'magi', 'magi123', 'magisystem', 'admin123', 'admin1234',
    '123456', '1234567', '12345678', '123456789', '1234567890', 'qwerty', 'qwerty123', '111111', '000000', 'abc123',
    'abcd1234', 'operator', 'rahasia', 'bismillah'];
  function passwordLemah(pw, username) {
    var p = String(pw == null ? '' : pw), low = p.toLowerCase();
    if (p.length < 8) return true;
    if (username && low === String(username).toLowerCase()) return true;
    if (/^(.)\1+$/.test(p)) return true;
    return UMUM.indexOf(low) >= 0;
  }
  function cekUsername(u) {
    u = String(u == null ? '' : u).trim();
    if (!u) return 'username kosong';
    if (u.length < 3) return 'username minimal 3 karakter';
    if (u.length > 60) return 'username maksimal 60 karakter';
    if (!/^[a-zA-Z0-9._-]+$/.test(u)) return 'username hanya boleh huruf, angka, titik, garis bawah, atau strip';
    return null;
  }
  function cekPassword(p, username) {
    p = String(p == null ? '' : p);
    if (p.length < 8) return 'password minimal 8 karakter';
    if (p.length > 200) return 'password terlalu panjang';
    if (passwordLemah(p, username)) return 'password terlalu mudah ditebak (sama dengan username / password umum)';
    return null;
  }
  function normPeran(p) { p = String(p == null ? '' : p).trim(); return ['Administrator', 'Operator'].indexOf(p) >= 0 ? p : 'Operator'; }
  function efektifHak(peran, raw) {
    if (String(peran) === 'Administrator') return D.SEMUA_HAK.slice();
    if (raw == null) return D.SEMUA_HAK.slice();
    var arr = Array.isArray(raw) ? raw : [];
    return D.SEMUA_HAK.filter(function (k) { return arr.indexOf(k) >= 0; });
  }
  function normHak(list) {
    var arr = (Array.isArray(list) ? list : []).map(String);
    return D.SEMUA_HAK.filter(function (k) { return arr.indexOf(k) >= 0; });
  }

  /* penguncian login: 5 gagal / username, 20 / IP, jendela 15 menit */
  var JENDELA = 15 * 60000;
  function bacaGagal() {
    var g;
    try { g = JSON.parse(localStorage.getItem(D.KUNCI_GAGAL) || 'null'); } catch (e) { g = null; }
    return g && g.u ? g : { u: {}, ip: {} };
  }
  function tulisGagal(g) { try { localStorage.setItem(D.KUNCI_GAGAL, JSON.stringify(g)); } catch (e) {} }
  function terkunci(map, k, maks) {
    var x = map[k];
    if (!x || Date.now() - x.t > JENDELA || x.n < maks) return 0;
    return Math.max(1, Math.ceil((x.t + JENDELA - Date.now()) / 60000));
  }
  function catatGagal(map, k) {
    var x = map[k];
    if (!x || Date.now() - x.t > JENDELA) x = { n: 0, t: 0 };
    x.n++; x.t = Date.now(); map[k] = x;
  }

  R['POST /webhook/login'] = function (ctx, db) {
    var b = ctx.body || {};
    var username = String(b.username != null ? b.username : '').trim(), password = String(b.password != null ? b.password : '');
    var kunciU = username.toLowerCase();
    if (!username || !password) return { code: 400, json: { ok: false, message: 'username & password wajib diisi' } };
    var g = bacaGagal();
    var menit = Math.max(terkunci(g.u, kunciU, 5), terkunci(g.ip, IP, 20));
    if (menit) {
      audit(db, { action: 'login', ctx: { actor: username }, ok: false, detail: { hasil: 'terkunci' } });
      return { code: 429, json: { ok: false, message: 'Terlalu banyak percobaan gagal — coba lagi dalam ' + menit + ' menit.' } };
    }
    var u = db.user.filter(function (x) { return sama(x.username, username); })[0];
    var ok = !!u && Number(u.aktif) === 1 && D.cekPassword(password, u.pass_salt, u.pass_hash);
    audit(db, { action: 'login', ctx: { actor: username }, ok: ok,
      detail: { hasil: ok ? 'sukses' : (u ? (Number(u.aktif) !== 1 ? 'nonaktif' : 'password salah') : 'user tidak ada') } });
    if (!ok) {
      catatGagal(g.u, kunciU); catatGagal(g.ip, IP); tulisGagal(g);
      return { code: 401, json: { ok: false, message: 'Username atau password salah.' } };
    }
    delete g.u[kunciU]; delete g.ip[IP]; tulisGagal(g);
    var peran = u.peran || 'Operator', hak = efektifHak(u.peran, u.hak_akses), lemah = passwordLemah(password, u.username);
    tulisSesi({ u: u.username, peran: peran, hak: hak, g: lemah });
    return { json: { ok: true, username: u.username, nama: u.nama || '', peran: peran, hak: hak, lemah: lemah } };
  };
  R['POST /webhook/logout'] = function (ctx, db) {
    audit(db, { action: 'logout', ctx: ctx, ok: true });
    hapusSesi();
    return { json: { ok: true } };
  };
  R['POST /webhook/ganti-password'] = function (ctx, db) {
    var b = ctx.body || {};
    var lama = String(b.lama == null ? '' : b.lama), baru = String(b.baru == null ? '' : b.baru);
    var kunciU = String(ctx.actor || '').toLowerCase();
    if (!lama || !baru) return { code: 400, json: { ok: false, message: 'Password lama & baru wajib diisi.' } };
    var g = bacaGagal();
    var menit = terkunci(g.u, kunciU, 5);
    if (menit) return { code: 429, json: { ok: false, message: 'Terlalu banyak percobaan gagal — coba lagi dalam ' + menit + ' menit.' } };
    var u = db.user.filter(function (x) { return sama(x.username, ctx.actor); })[0];
    if (!u || Number(u.aktif) !== 1) return { code: 403, json: { ok: false, message: 'Akun tidak aktif.' } };
    if (!D.cekPassword(lama, u.pass_salt, u.pass_hash)) {
      catatGagal(g.u, kunciU); tulisGagal(g);
      audit(db, { action: 'ganti-password', ctx: ctx, ok: false, detail: { hasil: 'password lama salah' } });
      return { code: 401, json: { ok: false, message: 'Password lama salah.' } };
    }
    var salah = cekPassword(baru, u.username);
    if (salah) return { code: 422, json: { ok: false, message: salah } };
    if (baru === lama) return { code: 422, json: { ok: false, message: 'Password baru harus berbeda dari yang lama.' } };
    var h = D.hashPassword(baru);
    u.pass_algo = h.algo; u.pass_salt = h.salt; u.pass_hash = h.hash;
    delete g.u[kunciU]; tulisGagal(g);
    audit(db, { action: 'ganti-password', ctx: ctx, ok: true });
    tulisSesi({ u: u.username, peran: ctx.peran, hak: ctx.hak });
    return { json: { ok: true, message: 'Password diganti.' } };
  };

  /* ---------------- akses ---------------- */
  var SERVICE_ACCOUNTS = [
    { key: 'magi_api@%', sistem: 'MySQL', peran: 'Aplikasi', untuk: 'service magi-api :3000 — CRUD dashboard + audit_log + app_user + app_todo', pw: -48 },
    { key: 'n8n_mbr@%', sistem: 'MySQL', peran: 'Aplikasi', untuk: 'kredensial MySQL di n8n — MBR (baca), Import Roster (upsert roster), AFL (simpan cetakan)', pw: -17 },
    { key: 'root@localhost', sistem: 'MySQL', peran: 'Superuser', untuk: 'administrasi database dari dalam container (docker exec, backup, healthcheck)', pw: -17 }
  ];
  function adminAktif(db, ctx) {
    if (!ctx || ctx.peran !== 'Administrator') return null;
    var a = String(ctx.actor || '').trim();
    if (!a || a === 'anon') return null;
    return db.user.filter(function (u) { return sama(u.username, a) && Number(u.aktif) === 1 && u.peran === 'Administrator'; })[0] || null;
  }
  R['GET /webhook/akses-list'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'akses')) return { code: 403, json: { status: 'forbidden', message: 'Tidak berhak melihat daftar akses.' } };
    var dashboard = db.user.slice().sort(function (a, b) { return a.dibuat < b.dibuat ? -1 : a.dibuat > b.dibuat ? 1 : a.id - b.id; })
      .map(function (u) {
        return { id: u.id, username: u.username, nama: u.nama || '', peran: u.peran || 'Operator', hak: efektifHak(u.peran, u.hak_akses),
          aktif: Number(u.aktif) === 1, sejak: String(u.dibuat || '').slice(0, 10), dibuat_oleh: u.dibuat_oleh || '' };
      });
    var layanan = SERVICE_ACCOUNTS.slice().sort(function (a, b) { return a.key < b.key ? -1 : 1; }).map(function (a) {
      return { akun: a.key, sistem: a.sistem, peran: a.peran, untuk: a.untuk, status: 'aktif', pw_diubah: D.geser(hari(), a.pw) };
    });
    var n8n = [{ email: 'admin.n8n@example.com', nama: 'Andhika Samuel', peran: 'global:owner', aktif: true, mfa: true,
      dibuat: D.geser(hari(), -160), terakhir_aktif: D.geser(hari(), -1) }];
    return { json: { dashboard: dashboard, layanan: layanan, n8n: n8n, fitur: salin(D.FITUR) } };
  };
  R['POST /webhook/akses-create'] = function (ctx, db) {
    var b = ctx.body || {};
    var username = String(b.username == null ? '' : b.username).trim(), password = String(b.password == null ? '' : b.password);
    var nama = String(b.nama == null ? '' : b.nama).trim().slice(0, 100), peran = normPeran(b.peran);
    var pembuat = adminAktif(db, ctx);
    if (!pembuat) {
      audit(db, { action: 'akses-create', ctx: ctx, ok: false, detail: { alasan: 'bukan Administrator', actor: ctx.actor } });
      return { code: 403, json: { status: 'forbidden', message: 'Hanya Administrator yang boleh menambah akun.' } };
    }
    var errors = [], e;
    if ((e = cekUsername(username))) errors.push(e);
    if ((e = cekPassword(password, username))) errors.push(e);
    if (errors.length) return { code: 422, json: { status: 'invalid', message: errors.join('; '), errors: errors } };
    if (db.user.some(function (u) { return sama(u.username, username); })) {
      return { code: 409, json: { status: 'exists', message: 'Username "' + username + '" sudah dipakai.' } };
    }
    var h = D.hashPassword(password);
    var hakStore = peran === 'Administrator' ? D.SEMUA_HAK.slice() : normHak(b.hak);
    db.user.push({ id: ++db.seq.user, username: username, nama: nama || null, peran: peran, hak_akses: hakStore,
      pass_algo: h.algo, pass_salt: h.salt, pass_hash: h.hash, aktif: 1, dibuat_oleh: pembuat.username,
      dibuat: D.jamDetik(Date.now()) + '.000' });
    audit(db, { action: 'akses-create', ctx: ctx, ok: true, detail: { username: username, peran: peran, hak: hakStore, oleh: pembuat.username } });
    return { json: { status: 'ok', message: 'Akun "' + username + '" dibuat.', user: { username: username, nama: nama, peran: peran, hak: hakStore } } };
  };
  R['POST /webhook/akses-update'] = function (ctx, db) {
    var b = ctx.body || {};
    var id = parseInt(b.id, 10);
    var pembuat = adminAktif(db, ctx);
    if (!pembuat) {
      audit(db, { action: 'akses-update', ctx: ctx, ok: false, detail: { alasan: 'bukan Administrator', actor: ctx.actor } });
      return { code: 403, json: { status: 'forbidden', message: 'Hanya Administrator yang boleh mengubah akun.' } };
    }
    if (!id || id < 1) return { code: 422, json: { status: 'invalid', message: 'id akun tidak valid.', errors: ['id akun tidak valid'] } };
    var trg = db.user.filter(function (u) { return u.id === id; })[0];
    if (!trg) return { code: 404, json: { status: 'notfound', message: 'Akun tidak ditemukan.' } };
    var errors = [], set = {}, perub = {}, e;
    var nu = String(b.username == null ? '' : b.username).trim();
    if (nu && nu !== trg.username) {
      if ((e = cekUsername(nu))) errors.push(e);
      else if (db.user.some(function (u) { return u.id !== id && sama(u.username, nu); })) errors.push('Username "' + nu + '" sudah dipakai.');
      else { set.username = nu; perub.username = nu; }
    }
    if (b.nama != null) {
      var nn = String(b.nama).trim().slice(0, 100);
      if (nn !== (trg.nama || '')) { set.nama = nn || null; perub.nama = nn; }
    }
    var np = String(b.peran == null ? '' : b.peran).trim(), peranFinal = trg.peran;
    if (np && normPeran(np) !== trg.peran) {
      var target = normPeran(np);
      if (trg.peran === 'Administrator' && target !== 'Administrator') {
        var sisa = db.user.filter(function (u) { return u.peran === 'Administrator' && Number(u.aktif) === 1 && u.id !== id; }).length;
        if (!sisa) errors.push('Tidak bisa menurunkan peran Administrator aktif terakhir.');
      }
      set.peran = target; perub.peran = target; peranFinal = target;
    }
    var wantHak = null;
    if (peranFinal === 'Administrator') wantHak = D.SEMUA_HAK.slice();
    else if (Array.isArray(b.hak)) wantHak = normHak(b.hak);
    if (wantHak !== null) {
      if (JSON.stringify(wantHak) !== JSON.stringify(efektifHak(trg.peran, trg.hak_akses)) || perub.peran) {
        set.hak_akses = wantHak; perub.hak = wantHak;
      }
    }
    var pw = String(b.password == null ? '' : b.password);
    if (pw !== '') {
      if ((e = cekPassword(pw, perub.username || trg.username))) errors.push(e);
      else { var h = D.hashPassword(pw); set.pass_algo = h.algo; set.pass_salt = h.salt; set.pass_hash = h.hash; perub.password = true; }
    }
    if (errors.length) return { code: 422, json: { status: 'invalid', message: errors.join('; '), errors: errors } };
    var self = trg.username === pembuat.username;
    if (!Object.keys(set).length) {
      return { json: { status: 'ok', message: 'Tidak ada perubahan.', id: id, username: trg.username, peran: trg.peran,
        hak: efektifHak(trg.peran, trg.hak_akses), self: self } };
    }
    var lamaUser = trg.username;
    Object.assign(trg, set);
    audit(db, { action: 'akses-update', ctx: ctx, ok: true, detail: { id: id, target: lamaUser, perubahan: Object.keys(perub),
      oleh: pembuat.username, username_baru: perub.username, peran_baru: perub.peran, hak_baru: perub.hak } });
    var hakKini = perub.hak || efektifHak(trg.peran, trg.hak_akses);
    // (demo) cookie sesi ikut diperbarui saat Administrator mengubah akunnya sendiri
    if (self) tulisSesi({ u: trg.username, peran: trg.peran, hak: hakKini });
    return { json: { status: 'ok', message: 'Akun "' + trg.username + '" diperbarui.', id: id, username: trg.username,
      peran: trg.peran, hak: hakKini, self: self, perubahan: Object.keys(perub) } };
  };
  R['POST /webhook/akses-delete'] = function (ctx, db) {
    var id = parseInt((ctx.body || {}).id, 10);
    var pembuat = adminAktif(db, ctx);
    if (!pembuat) {
      audit(db, { action: 'akses-delete', ctx: ctx, ok: false, detail: { alasan: 'bukan Administrator', actor: ctx.actor } });
      return { code: 403, json: { status: 'forbidden', message: 'Hanya Administrator yang boleh menghapus akun.' } };
    }
    if (!id || id < 1) return { code: 422, json: { status: 'invalid', message: 'id akun tidak valid.' } };
    var trg = db.user.filter(function (u) { return u.id === id; })[0];
    if (!trg) return { code: 404, json: { status: 'notfound', message: 'Akun tidak ditemukan.' } };
    if (trg.username === pembuat.username) return { code: 400, json: { status: 'forbidden', message: 'Tidak bisa menghapus akun yang sedang Anda pakai.' } };
    if (trg.peran === 'Administrator' && Number(trg.aktif) === 1 &&
        !db.user.some(function (u) { return u.peran === 'Administrator' && Number(u.aktif) === 1 && u.id !== id; })) {
      return { code: 422, json: { status: 'invalid', message: 'Tidak bisa menghapus Administrator aktif terakhir.' } };
    }
    db.user = db.user.filter(function (u) { return u.id !== id; });
    audit(db, { action: 'akses-delete', ctx: ctx, ok: true, detail: { id: id, username: trg.username, peran: trg.peran, oleh: pembuat.username } });
    return { json: { status: 'ok', message: 'Akun "' + trg.username + '" dihapus.', id: id, username: trg.username } };
  };

  /* ---------------- to do ---------------- */
  var tolakTodo = { code: 403, json: { status: 'forbidden', message: 'Tidak berhak membuka To Do List.' } };
  function bentukTodo(t) {
    return { id: t.id, pekerjaan: t.pekerjaan, catatan: t.catatan || '', tenggat: t.tenggat || '', tgl_tambah: t.tgl_tambah || '',
      oleh: t.oleh || '', oleh_nama: t.oleh_nama || t.oleh || '', dikerjakan_oleh: t.dikerjakan_oleh || '',
      dikerjakan_nama: t.dikerjakan_nama || t.dikerjakan_oleh || '', selesai: Number(t.selesai) === 1,
      tgl_selesai: t.tgl_selesai || '', selesai_oleh: t.selesai_oleh || '', selesai_nama: t.selesai_nama || t.selesai_oleh || '',
      selesai_pada: t.selesai_pada ? String(t.selesai_pada).slice(0, 19) : '' };
  }
  function penugasan(db, v) {
    var u = String(v == null ? '' : v).trim();
    if (!u) return { ok: true, oleh: null, nama: null };
    var r = db.user.filter(function (x) { return sama(x.username, u) && Number(x.aktif) === 1; })[0];
    if (!r) return { ok: false };
    return { ok: true, oleh: r.username, nama: ((r.nama && String(r.nama).trim()) || r.username).slice(0, 100) };
  }
  function bacaTenggat(v, h, lama) {
    var t = String(v == null ? '' : v).trim();
    if (!t) return { ok: true, nilai: null };
    if (!D.isDate(t)) return { ok: false, pesan: 'Tenggat waktu "' + t + '" bukan tanggal yang sah.' };
    if (t < h && t !== (lama || '')) return { ok: false, pesan: 'Tenggat waktu tidak boleh sebelum hari ini (' + h + ').' };
    return { ok: true, nilai: t };
  }
  R['GET /webhook/todo-list'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'todo')) return tolakTodo;
    var h = hari();
    var items = db.todo.slice().sort(function (a, b) {
      return (a.selesai - b.selesai) || (a.tgl_tambah < b.tgl_tambah ? -1 : a.tgl_tambah > b.tgl_tambah ? 1 : 0) || (a.id - b.id);
    }).slice(0, 500).map(bentukTodo);
    var belum = 0, telat = 0, tenggat = 0, selesai = 0;
    items.forEach(function (t) {
      if (t.selesai) { selesai++; return; }
      belum++;
      if (t.tenggat ? t.tenggat < h : (t.tgl_tambah && t.tgl_tambah < h)) telat++;
      else if (t.tenggat) tenggat++;
    });
    var pengguna = db.user.filter(function (u) { return Number(u.aktif) === 1; }).map(function (u) {
      return { username: u.username, nama: (u.nama && String(u.nama).trim()) || u.username };
    }).sort(function (a, b) { return urutNama(a.nama, b.nama); });
    return { json: { status: 'ok', hari_ini: h, aktor: ctx.actor, peran: ctx.peran || '', items: items, pengguna: pengguna,
      ringkas: { total: items.length, belum: belum, telat: telat, tenggat: tenggat, selesai: selesai }, batas: 500 } };
  };
  R['POST /webhook/todo-create'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'todo')) return tolakTodo;
    var b = ctx.body || {};
    var pekerjaan = String(b.pekerjaan == null ? '' : b.pekerjaan).trim(), catatan = String(b.catatan == null ? '' : b.catatan).trim();
    var errors = [];
    if (!pekerjaan) errors.push('Nama pekerjaan wajib diisi.');
    if (pekerjaan.length > 200) errors.push('Nama pekerjaan maksimal 200 karakter.');
    if (catatan.length > 2000) errors.push('Catatan maksimal 2000 karakter.');
    var tugas = penugasan(db, b.dikerjakan_oleh);
    if (!tugas.ok) errors.push('Pengguna yang dipilih tidak ada atau tidak aktif.');
    var tg = bacaTenggat(b.tenggat, hari(), null);
    if (!tg.ok) errors.push(tg.pesan);
    if (errors.length) return { code: 422, json: { status: 'invalid', message: errors.join(' '), errors: errors } };
    var kini = D.jamDetik(Date.now()) + '.000';
    var t = { id: ++db.seq.todo, pekerjaan: pekerjaan, catatan: catatan || null, tenggat: tg.nilai, tgl_tambah: hari(),
      oleh: ctx.actor, oleh_nama: namaPengguna(db, ctx), dikerjakan_oleh: tugas.oleh, dikerjakan_nama: tugas.nama,
      selesai: 0, tgl_selesai: null, selesai_oleh: null, selesai_nama: null, selesai_pada: null, dibuat: kini, diubah: kini };
    db.todo.push(t);
    audit(db, { action: 'todo-create', ctx: ctx, ok: true, detail: { id: t.id, pekerjaan: pekerjaan, dikerjakan_oleh: tugas.oleh, tenggat: tg.nilai } });
    return { json: { status: 'ok', message: 'Pekerjaan "' + pekerjaan + '" ditambahkan.', item: bentukTodo(t) } };
  };
  R['POST /webhook/todo-update'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'todo')) return tolakTodo;
    var b = ctx.body || {};
    var id = parseInt(b.id, 10);
    if (!id || id < 1) return { code: 422, json: { status: 'invalid', message: 'id pekerjaan tidak valid.' } };
    var trg = db.todo.filter(function (t) { return t.id === id; })[0];
    if (!trg) return { code: 404, json: { status: 'notfound', message: 'Pekerjaan tidak ditemukan — mungkin sudah dihapus.' } };
    var milik = String(trg.oleh) === String(ctx.actor), kebagian = trg.dikerjakan_oleh && String(trg.dikerjakan_oleh) === String(ctx.actor);
    if (!milik && !kebagian && ctx.peran !== 'Administrator') {
      audit(db, { action: 'todo-update', ctx: ctx, ok: false, detail: { id: id, alasan: 'bukan pencatat / bukan yang kebagian / bukan Administrator' } });
      return { code: 403, json: { status: 'forbidden', message: 'Hanya pencatatnya, yang sedang kebagian, atau Administrator yang boleh mengubah.' } };
    }
    var errors = [], set = {}, perub = {};
    if (b.pekerjaan != null) {
      var np = String(b.pekerjaan).trim();
      if (!np) errors.push('Nama pekerjaan tidak boleh kosong.');
      else if (np.length > 200) errors.push('Nama pekerjaan maksimal 200 karakter.');
      else if (np !== trg.pekerjaan) { set.pekerjaan = np; perub.pekerjaan = np; }
    }
    if (b.catatan != null) {
      var nc = String(b.catatan).trim();
      if (nc.length > 2000) errors.push('Catatan maksimal 2000 karakter.');
      else if (nc !== (trg.catatan || '')) { set.catatan = nc || null; perub.catatan = true; }
    }
    if (b.tenggat !== undefined) {
      var tg = bacaTenggat(b.tenggat, hari(), trg.tenggat);
      if (!tg.ok) errors.push(tg.pesan);
      else if ((tg.nilai || '') !== (trg.tenggat || '')) { set.tenggat = tg.nilai; perub.tenggat = tg.nilai; }
    }
    if (b.dikerjakan_oleh !== undefined) {
      var tugas = penugasan(db, b.dikerjakan_oleh);
      if (!tugas.ok) errors.push('Pengguna yang dipilih tidak ada atau tidak aktif.');
      else if ((tugas.oleh || '') !== (trg.dikerjakan_oleh || '')) {
        set.dikerjakan_oleh = tugas.oleh; set.dikerjakan_nama = tugas.nama;
        perub.dikerjakan_oleh = tugas.oleh; perub.dari = trg.dikerjakan_oleh || null;
      }
    }
    if (errors.length) return { code: 422, json: { status: 'invalid', message: errors.join(' '), errors: errors } };
    if (!Object.keys(set).length) return { json: { status: 'ok', message: 'Tidak ada perubahan.', item: bentukTodo(trg) } };
    var tenggatLama = trg.tenggat;
    Object.assign(trg, set, { diubah: D.jamDetik(Date.now()) + '.000' });
    audit(db, { action: 'todo-update', ctx: ctx, ok: true, detail: { id: id, pekerjaan: trg.pekerjaan, perubahan: Object.keys(perub),
      diserahkan_ke: perub.dikerjakan_oleh, dari: perub.dari,
      tenggat: perub.tenggat !== undefined ? { dari: tenggatLama || null, jadi: perub.tenggat } : undefined } });
    var item = bentukTodo(trg);
    var pesan = perub.dikerjakan_oleh !== undefined
      ? (item.dikerjakan_nama ? 'Pekerjaan diserahkan ke ' + item.dikerjakan_nama + '.' : 'Penugasan dilepas — pekerjaan belum ditentukan pelaksananya.')
      : 'Perubahan tersimpan.';
    return { json: { status: 'ok', message: pesan, item: item, perubahan: Object.keys(perub) } };
  };
  R['POST /webhook/todo-toggle'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'todo')) return tolakTodo;
    var b = ctx.body || {};
    var id = parseInt(b.id, 10);
    if (!id || id < 1) return { code: 422, json: { status: 'invalid', message: 'id pekerjaan tidak valid.' } };
    var v = b.selesai, selesai = (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;
    var trg = db.todo.filter(function (t) { return t.id === id; })[0];
    if (!trg) return { code: 404, json: { status: 'notfound', message: 'Pekerjaan tidak ditemukan — mungkin sudah dihapus.' } };
    if (Number(trg.selesai) === selesai) return { json: { status: 'ok', message: 'Tidak ada perubahan.', item: bentukTodo(trg), hari_ini: hari() } };
    var kini = Date.now();
    Object.assign(trg, { selesai: selesai, tgl_selesai: selesai ? hari() : null, selesai_oleh: selesai ? ctx.actor : null,
      selesai_nama: selesai ? namaPengguna(db, ctx) : null,
      selesai_pada: selesai ? D.jamDetik(kini) + '.' + ('00' + (kini % 1000)).slice(-3) : null, diubah: D.jamDetik(kini) + '.000' });
    audit(db, { action: 'todo-toggle', ctx: ctx, ok: true, detail: { id: id, pekerjaan: trg.pekerjaan, selesai: selesai === 1, tgl_selesai: trg.tgl_selesai } });
    return { json: { status: 'ok', message: selesai ? 'Pekerjaan "' + trg.pekerjaan + '" ditandai selesai.' : 'Tanda selesai dilepas.',
      item: bentukTodo(trg), hari_ini: hari() } };
  };
  R['POST /webhook/todo-delete'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'todo')) return tolakTodo;
    var id = parseInt((ctx.body || {}).id, 10);
    if (!id || id < 1) return { code: 422, json: { status: 'invalid', message: 'id pekerjaan tidak valid.' } };
    var trg = db.todo.filter(function (t) { return t.id === id; })[0];
    if (!trg) return { code: 404, json: { status: 'notfound', message: 'Pekerjaan tidak ditemukan — mungkin sudah dihapus.' } };
    if (String(trg.oleh) !== String(ctx.actor) && ctx.peran !== 'Administrator') {
      audit(db, { action: 'todo-delete', ctx: ctx, ok: false, detail: { id: id, alasan: 'bukan pencatat / bukan Administrator' } });
      return { code: 403, json: { status: 'forbidden', message: 'Hanya pencatatnya atau Administrator yang boleh menghapus.' } };
    }
    db.todo = db.todo.filter(function (t) { return t.id !== id; });
    audit(db, { action: 'todo-delete', ctx: ctx, ok: true, detail: { id: id, pekerjaan: trg.pekerjaan, oleh: trg.oleh } });
    return { json: { status: 'ok', message: 'Pekerjaan "' + trg.pekerjaan + '" dihapus.', id: id } };
  };

  /* ---------------- AFL ---------------- */
  var tolakAfl = function (m) { return { code: 403, json: { status: 'forbidden', message: m || 'Tidak berhak membuka AFL.' } }; };
  var WF_AFL = { id: 'aFl7kQ2mZ8xR4tW1', nama: 'AFL', aktif: true };
  function execAfl(db) { return db.exec.filter(function (e) { return e.wf === 'afl'; }).sort(function (a, b) { return b.id - a.id; }); }
  function metaExec(e) { return { id: e.id, status: e.status, mode: e.mode, mulai: e.mulai || '', selesai: e.selesai || '' }; }
  function sampaiGerbang(e) { return e.status === 'waiting' || !!e.gerbangLewat || !!e.body; }

  R['GET /webhook/afl-list'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl();
    var h = hari(), dari = D.awalBulan(D.tambahBulan(h, 1)), sampai = D.akhirBulan(dari);
    var dot = setDot(db), items = [];
    db.karyawan.forEach(function (k) {
      if (dot[k.id_ho]) return;
      D.rBaris(db, k.id_ho, dari, sampai).forEach(function (b) {
        if (b.shift !== 'FB' || D.rGet(db, k.id_ho, D.geser(b.tgl, -1)) === 'FB') return;
        items.push({ id_ho: k.id_ho, nama: k.nama || '', jabatan: k.jabatan || '', poh: k.poh || '', mulai: b.tgl });
      });
    });
    items.sort(function (a, b) { return (a.mulai < b.mulai ? -1 : a.mulai > b.mulai ? 1 : 0) || urutNama(a.nama, b.nama); });
    return { json: { hari_ini: h, bulan: dari.slice(0, 7), dari: dari, sampai: sampai, roster_sampai: D.rAkhirSemua(db), batas: 2000,
      items: items.slice(0, 2000) } };
  };

  function keadaanGerbang(e) {
    var g = { keadaan: '', batas: '', oleh: '', nama: '', pada: '', error: '', node_akhir: '', dicetak: null };
    var n = (e.items || []).length;
    if (e.status === 'waiting') { g.keadaan = 'menunggu'; g.batas = e.tunggu; return g; }
    if (e.gerbangLewat || e.body) {
      var b = e.body || {};
      if (b.cetak === true) {
        g.keadaan = 'dicetak'; g.oleh = String(b.oleh || ''); g.nama = String(b.nama || ''); g.pada = String(b.pada || '');
        g.dicetak = Array.isArray(e.dicetak) ? e.dicetak.slice() : null;
      } else if (e.status === 'running') g.keadaan = 'berjalan';
      else { g.keadaan = 'kedaluwarsa'; g.pada = e.selesai || ''; }
      return g;
    }
    if (e.status === 'running') g.keadaan = 'berjalan';
    else if (e.status === 'error') { g.keadaan = 'gagal'; g.error = e.error || ''; }
    else if (n === 0) g.keadaan = 'kosong';
    else g.keadaan = 'tanpa';
    return g;
  }

  function aflTerlewat(db) {
    var kini = new Date(), h = hari();
    var mulai = D.geser(h, -10);
    if (db.jadwalAflSejak && mulai < db.jadwalAflSejak) mulai = db.jadwalAflSejak;
    var akhir = (kini.getHours() + kini.getMinutes() / 60) >= 8 + 1 / 3 ? h : D.geser(h, -1);
    var tercakup = {}, hariJalan = {};
    db.exec.forEach(function (e) {
      if (e.wf !== 'afl' || !e.items) return;
      var hr = D.ymd(new Date(Date.parse(e.mulai)));
      if (hr < D.geser(mulai, -1)) return;
      if (e.susulan) e.susulan.forEach(function (t) { tercakup[t] = 1; });
      else { hariJalan[hr] = 1; D.jendelaAfl(hr).forEach(function (t) { tercakup[t] = 1; }); }
    });
    var hariL = [], tanggal = [];
    for (var r = mulai; r <= akhir; r = D.geser(r, 1)) {
      var kurang = D.jendelaAfl(r).filter(function (t) { return !tercakup[t]; });
      if (!kurang.length) continue;
      if (!hariJalan[r]) hariL.push(r);
      kurang.forEach(function (t) { if (tanggal.indexOf(t) < 0) tanggal.push(t); });
    }
    tanggal.sort();
    return { hari: hariL, tanggal: tanggal, sejak: mulai, sampai_hari: akhir };
  }
  D.aflTerlewat = aflTerlewat;

  function itemsTampil(e) {
    return (e.items || []).map(function (j) {
      var it = Object.assign({}, j, { id_ho: s(j.id_ho), tgl: s(j.awal_cuti != null ? j.awal_cuti : j.tgl), shift: 'FB',
        nama: s(j.nama), jabatan: s(j.jabatan), poh: s(j.poh) });
      it.kunci = D.kunciAfl(j);
      return it;
    });
  }

  R['GET /webhook/afl-run'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl();
    var minta = Number(ctx.query.id) || 0;
    var rows = execAfl(db).slice(0, 10);
    var akhir = rows[0] || null, calon = [], cadangan = null, pilih = null;
    rows.forEach(function (e) {
      if (!e.items && e.status !== 'running') return;
      if (sampaiGerbang(e) || (e.status === 'success' && e.items && !e.items.length)) calon.push(e);
      if (!cadangan && e.items) cadangan = e;
    });
    if (minta) {
      pilih = calon.filter(function (e) { return e.id === minta; })[0] ||
        execAfl(db).filter(function (e) { return e.id === minta && e.items; })[0] || null;
    }
    if (!pilih && calon.length) pilih = calon[0];
    if (!pilih && cadangan) pilih = cadangan;
    var menungguLain = [], riwayat = [];
    calon.forEach(function (e) {
      if (pilih && e.id === pilih.id) return;
      if (e.status === 'waiting') {
        menungguLain.push({ id: e.id, mulai: e.mulai, batas: e.tunggu, jumlah: (e.items || []).length });
        return;
      }
      if (!e.dokumen) return;
      var g = keadaanGerbang(e);
      riwayat.push({ id: e.id, mulai: e.mulai, oleh: g.nama || g.oleh, pada: g.pada, dokumen: e.dokumen.map(function (d) {
        return { jenis: d.jenis, judul: d.judul, jumlah_orang: d.jumlah_orang, halaman: d.halaman, link_pdf: d.link_pdf };
      }) });
    });
    var out = {
      workflow: salin(WF_AFL), terlewat: aflTerlewat(db), dilihat: minta && pilih && pilih.id === minta ? minta : 0,
      menunggu_lain: menungguLain, riwayat: riwayat,
      terakhir: akhir ? Object.assign(metaExec(akhir), { error: akhir.error || '' }) : null,
      hasil: null, catatan: ''
    };
    if (pilih && pilih.items) {
      var raw = pilih.items;
      var g = keadaanGerbang(pilih);
      var h = Object.assign(metaExec(pilih), {
        node: raw.length ? 'Siapkan Cetak' : 'Roster FB bulan depan', jumlah: raw.length, json: salin(raw),
        items: itemsTampil(pilih), gerbang: g, pemicu: pilih.pemicu ? salin(pilih.pemicu) : null,
        dokumen: null, dokumen_keadaan: '', dokumen_error: '', simpan: null
      });
      if (pilih.dokumen) { h.dokumen = salin(pilih.dokumen); h.dokumen_keadaan = 'siap'; }
      else if (g.keadaan === 'dicetak' && pilih.status === 'running') h.dokumen_keadaan = 'membuat';
      if (pilih.simpan) h.simpan = salin(pilih.simpan);
      out.hasil = h;
    } else if (pilih && pilih.status === 'running') {
      out.catatan = 'Run #' + pilih.id + ' sedang menarik data roster…';
    }
    return { json: out };
  };

  R['POST /webhook/afl-cetak'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl('Tidak berhak mencetak AFL.');
    var b = ctx.body || {};
    var id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return { code: 400, json: { status: 'error', message: 'id eksekusi tidak sah.' } };
    var e = db.exec.filter(function (x) { return x.id === id; })[0];
    if (!e || e.wf !== 'afl') return { code: 404, json: { status: 'error', message: 'Eksekusi #' + id + ' bukan run workflow AFL.' } };
    if (e.status !== 'waiting') return { code: 409, json: { status: 'conflict', message: 'Run #' + id + ' sudah tidak menunggu cetak (status: ' + e.status + ').' } };
    var daftar = e.items || [], kirim = daftar, batal = [];
    if (b.pilih !== undefined) {
      if (!Array.isArray(b.pilih)) return { code: 400, json: { status: 'error', message: 'pilih harus berupa daftar.' } };
      var mau = b.pilih.map(String), ada = daftar.map(D.kunciAfl);
      if (mau.some(function (k) { return ada.indexOf(k) < 0; })) {
        return { code: 409, json: { status: 'conflict', message: 'Pilihan tidak cocok dengan isi run #' + id + ' (muat ulang halaman).' } };
      }
      if (!mau.length) return { code: 400, json: { status: 'error', message: 'Tidak ada karyawan yang dicentang untuk dicetak.' } };
      kirim = daftar.filter(function (j) { return mau.indexOf(D.kunciAfl(j)) >= 0; });
      batal = daftar.filter(function (j) { return mau.indexOf(D.kunciAfl(j)) < 0; });
    }
    var nama = namaPengguna(db, ctx), pada = D.iso(Date.now());
    e.status = 'running'; e.fase = 'cetak'; e.gerbangLewat = true; e.tunggu = null;
    e.body = { cetak: true, oleh: ctx.actor, nama: nama, pada: pada };
    e.dicetak = kirim.map(D.kunciAfl);
    e.selesaiPada = D.iso(Date.now() + 2500 + 1200 * kirim.length);
    audit(db, { action: 'afl-cetak', ctx: ctx, ok: true, detail: { eksekusi: id, jumlah: kirim.length, total: daftar.length,
      tidak_dicetak: batal.map(function (t) { return t.id_ho; }) } });
    return { json: { status: 'ok', message: 'Run #' + id + ' dilanjutkan — ' + kirim.length + ' dari ' + daftar.length + ' karyawan diteruskan ke node berikutnya.',
      id: id, oleh: ctx.actor, nama: nama, pada: pada, jumlah: kirim.length, tidak_dicetak: batal.length } };
  };

  R['POST /webhook/afl-jalankan'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl('Tidak berhak menjalankan workflow AFL.');
    var b = ctx.body || {}, susulan = null;
    if (b.susulan === true) {
      susulan = aflTerlewat(db);
      if (!susulan.tanggal.length) return { code: 409, json: { status: 'conflict', message: 'Tidak ada tanggal cuti yang terlewat — semua sudah diproses.' } };
    }
    if (b.tutup !== undefined && !Array.isArray(b.tutup)) return { code: 400, json: { status: 'error', message: 'tutup harus berupa daftar id eksekusi.' } };
    var tutup = (b.tutup || []).map(Number).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (tutup.some(function (x) { return !Number.isInteger(x) || x <= 0; })) return { code: 400, json: { status: 'error', message: 'id eksekusi di tutup tidak sah.' } };
    var jalan = execAfl(db).filter(function (e) { return e.status === 'running'; }).map(function (e) { return e.id; });
    if (jalan.length) return { code: 409, json: { status: 'conflict', message: 'Run #' + jalan.join(', #') + ' masih berjalan — tunggu sampai selesai.' } };
    var ditutup = [];
    for (var i = 0; i < tutup.length; i++) {
      var r = db.exec.filter(function (e) { return e.id === tutup[i] && e.wf === 'afl' && e.status === 'waiting'; })[0];
      if (!r) return { code: 409, json: { status: 'conflict', message: 'Run #' + tutup[i] + ' sudah tidak menunggu cetak (muat ulang halaman).' } };
      ditutup.push(r);
    }
    var nama = namaPengguna(db, ctx), kini = Date.now(), pada = D.iso(kini);
    db.seq.exec += 1;
    var e = { id: ++db.seq.exec, wf: 'afl', status: 'running', fase: 'sql', mode: 'webhook', mulai: pada, selesai: null, tunggu: null,
      items: null, body: null, dicetak: null, dokumen: null, simpan: null,
      pemicu: { oleh: ctx.actor, nama: nama, pada: pada, susulan: !!susulan, tanggal: susulan ? susulan.tanggal.slice() : [] },
      susulan: susulan ? susulan.tanggal.slice() : null, selesaiPada: D.iso(kini + 3200) };
    db.exec.push(e);
    var hasilTutup = ditutup.map(function (x) {
      x.status = 'success'; x.gerbangLewat = true; x.fase = 'selesai'; x.tunggu = null; x.selesai = pada;
      x.body = { cetak: false, oleh: ctx.actor, nama: nama, pada: pada, alasan: 'ditutup: diganti jalankan ulang' };
      return { id: x.id, ok: true, http: 200 };
    });
    // simpan riwayat eksekusi seperlunya (n8n memangkas eksekusi lama)
    var afl = execAfl(db);
    if (afl.length > 25) {
      var buang = afl.slice(25).map(function (x) { return x.id; });
      db.exec = db.exec.filter(function (x) { return buang.indexOf(x.id) < 0; });
    }
    audit(db, { action: 'afl-jalankan', ctx: ctx, ok: true, detail: { ditutup: hasilTutup, susulan: susulan ? susulan.tanggal : undefined } });
    return { json: { status: 'ok',
      message: (susulan ? 'AFL susulan dijalankan untuk ' + susulan.tanggal.length + ' tanggal cuti' : 'Workflow AFL dijalankan ulang') +
        (hasilTutup.length ? ' — run #' + hasilTutup.map(function (x) { return x.id; }).join(', #') + ' ditutup tanpa dicetak' : '') + '.',
      oleh: ctx.actor, nama: nama, pada: pada, ditutup: hasilTutup } };
  };

  R['GET /webhook/afl-pdf'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl();
    var id = Number(ctx.query.id), jenis = String(ctx.query.jenis || '');
    if (!Number.isInteger(id) || id <= 0 || !/^(lokal|luar)$/.test(jenis)) return { code: 400, json: { status: 'error', message: 'id/jenis tidak sah.' } };
    var e = db.exec.filter(function (x) { return x.id === id && x.wf === 'afl'; })[0];
    if (!e) return { code: 404, json: { status: 'error', message: 'Run #' + id + ' tidak ditemukan.' } };
    var dok = (e.dokumen || []).filter(function (d) { return d.jenis === jenis; })[0];
    if (!dok) return { code: 404, json: { status: 'error', message: 'PDF ' + jenis + ' tidak ada di run #' + id + '.' } };
    var luarKah = function (k) { return Object.prototype.hasOwnProperty.call(k, 'jalur_berangkat'); };
    var orang = (e.items || []).filter(function (j) { return (e.dicetak || []).indexOf(D.kunciAfl(j)) >= 0; })
      .filter(function (k) { return jenis === 'luar' ? luarKah(k) : !luarKah(k); });
    var bytes = D.pdfAfl(orang, { run: id, luar: jenis === 'luar', oleh: (e.body && e.body.nama) || '', pada: e.body && e.body.pada });
    return { raw: bytes, type: 'application/pdf', filename: dok.nama_pdf, inline: String(ctx.query.lihat || '') === '1' };
  };

  var BATAS_HARI_AFL = 15;
  function warnaAfl(r) {
    if (Number(r.full_approve) === 1) return 'hijau';
    if (Number(r.revisi) === 1) return 'oranye';
    if (Number(r.dari_lapangan) !== 1 && r.umur_hari != null && Number(r.umur_hari) >= BATAS_HARI_AFL) return 'merah';
    return '';
  }
  function bentukCatatan(db, a) {
    var k = D.karOf(db, a.id_ho) || {};
    var umur = a.dicetak_pada ? D.selisih(String(a.dicetak_pada).slice(0, 10), hari()) : null;
    var o = { id_afl: a.id_afl, id_ho: String(a.id_ho), nama: String(k.nama || '').trim(), jabatan: String(k.jabatan || '').trim(),
      poh: String(k.poh || '').trim(), awal_cuti: a.awal_cuti || '', akhir_cuti: a.akhir_cuti || '',
      total_h_kerja: a.total_h_kerja == null ? null : a.total_h_kerja, total_cuti: a.total_cuti == null ? null : a.total_cuti,
      alasan: a.alasan || '', cetak: Number(a.cetak) === 1, dari_lapangan: Number(a.dari_lapangan) === 1,
      full_approve: Number(a.full_approve) === 1, revisi: Number(a.revisi) === 1, alasan_revisi: a.alasan_revisi || '',
      dicetak_pada: a.dicetak_pada ? String(a.dicetak_pada).slice(0, 16) : '', dicetak_oleh: a.dicetak_oleh || '', umur_hari: umur };
    o.warna = warnaAfl(Object.assign({}, a, { umur_hari: umur }));
    return o;
  }
  R['GET /webhook/afl-catatan'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl();
    var items = db.afl.slice().sort(function (a, b) {
      var x = a.dicetak_pada ? 0 : 1, y = b.dicetak_pada ? 0 : 1;
      return (x - y) || (a.dicetak_pada < b.dicetak_pada ? 1 : a.dicetak_pada > b.dicetak_pada ? -1 : 0) || (b.id_afl - a.id_afl);
    }).slice(0, 1000).map(function (a) { return bentukCatatan(db, a); });
    var ringkas = { total: items.length, hijau: 0, oranye: 0, merah: 0, lain: 0 };
    items.forEach(function (x) { ringkas[x.warna || 'lain']++; });
    return { json: { hari_ini: hari(), batas_hari: BATAS_HARI_AFL, batas: 1000, ringkas: ringkas, items: items } };
  };
  R['POST /webhook/afl-catatan-ubah'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl('Tidak berhak mengubah catatan AFL.');
    var b = ctx.body || {};
    var id = Number(b.id_afl);
    if (!Number.isInteger(id) || id <= 0) return { code: 400, json: { status: 'error', message: 'id_afl tidak sah.' } };
    var ubah = {}, n = 0;
    var KOL = ['dari_lapangan', 'full_approve', 'revisi'];
    for (var i = 0; i < KOL.length; i++) {
      var kol = KOL[i];
      if (b[kol] === undefined) continue;
      if (typeof b[kol] !== 'boolean') return { code: 400, json: { status: 'error', message: kol + ' harus true/false.' } };
      ubah[kol] = b[kol]; n++;
    }
    if (b.alasan_revisi !== undefined) {
      if (b.alasan_revisi !== null && typeof b.alasan_revisi !== 'string') return { code: 400, json: { status: 'error', message: 'alasan_revisi harus teks.' } };
      var t = b.alasan_revisi === null ? '' : String(b.alasan_revisi).trim();
      if (t.length > 2000) return { code: 400, json: { status: 'error', message: 'alasan_revisi maksimal 2000 karakter.' } };
      ubah.alasan_revisi = t; n++;
    }
    if (!n) return { code: 400, json: { status: 'error', message: 'Tidak ada yang diubah.' } };
    var a = db.afl.filter(function (x) { return x.id_afl === id; })[0];
    if (!a) return { code: 404, json: { status: 'error', message: 'Catatan AFL #' + id + ' tidak ada.' } };
    var sebelum = {};
    Object.keys(ubah).forEach(function (k) {
      sebelum[k] = k === 'alasan_revisi' ? (a.alasan_revisi || '') : Number(a[k]) === 1;
      a[k] = k === 'alasan_revisi' ? (ubah[k] || null) : (ubah[k] ? 1 : 0);
    });
    audit(db, { action: 'afl-catatan-ubah', ctx: ctx, id_ho: a.id_ho, ok: true, detail: { id_afl: id, awal_cuti: a.awal_cuti, sebelum: sebelum, sesudah: ubah } });
    return { json: { status: 'ok', item: bentukCatatan(db, a) } };
  };

  function statusAfl(a) {
    if (!a || Number(a.cetak) !== 1) return 'belum';
    if (Number(a.full_approve) === 1) return 'full_approve';
    if (Number(a.revisi) === 1) return 'revisi';
    if (Number(a.dari_lapangan) === 1) return 'kembali';
    return 'dicetak';
  }
  R['GET /webhook/afl-rekap'] = function (ctx, db) {
    var h = hari(), batasJadwal = D.tambahBulan(h, 1), bulanDepan = D.awalBulan(batasJadwal), sampai = D.akhirBulan(bulanDepan);
    var minAfl = null;
    db.afl.forEach(function (a) { if (!minAfl || a.awal_cuti < minAfl) minAfl = a.awal_cuti; });
    var dari = minAfl ? D.awalBulan(minAfl) : bulanDepan;
    if (dari > bulanDepan) dari = bulanDepan;
    var palingAwal = D.tambahBulan(bulanDepan, -11);
    if (dari < palingAwal) dari = palingAwal;
    var dot = setDot(db), semua = {};
    db.karyawan.forEach(function (k) {
      if (dot[k.id_ho]) return;
      D.rBaris(db, k.id_ho, dari, sampai).forEach(function (b) {
        if (b.shift === 'FB' && D.rGet(db, k.id_ho, D.geser(b.tgl, -1)) !== 'FB') semua[k.id_ho + '|' + b.tgl] = null;
      });
    });
    db.afl.forEach(function (a) { if (a.awal_cuti >= dari && a.awal_cuti <= sampai) semua[a.id_ho + '|' + a.awal_cuti] = a; });
    var KUNCI = ['belum', 'dicetak', 'kembali', 'revisi', 'full_approve'];
    var kosong = function (bl) { var o = { bulan: bl, total: 0, belum_waktunya: 0, sudah_waktunya: 0 }; KUNCI.forEach(function (k) { o[k] = 0; }); return o; };
    var perBulan = {}, urut = [];
    for (var d = dari; d <= bulanDepan; d = D.tambahBulan(d, 1)) { perBulan[d.slice(0, 7)] = kosong(d.slice(0, 7)); urut.push(d.slice(0, 7)); }
    var total = kosong('total');
    Object.keys(semua).forEach(function (kunci) {
      var awal = kunci.split('|')[1], o = perBulan[awal.slice(0, 7)];
      if (!o) return;
      var st = statusAfl(semua[kunci]);
      [o, total].forEach(function (x) {
        x.total++; x[st]++;
        if (st === 'belum') x[awal > batasJadwal ? 'belum_waktunya' : 'sudah_waktunya']++;
      });
    });
    return { json: { hari_ini: h, batas_jadwal: batasJadwal, roster_sampai: D.rAkhirSemua(db), dari: dari, sampai: sampai,
      status: KUNCI, bulan: urut.map(function (b) { return perBulan[b]; }), total: total } };
  };

  /* crosscek cuti — routes/afl.js cekCuti / blokFb / jalurTravel */
  var BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function tglId(x) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x || '')); return m ? Number(m[3]) + ' ' + BULAN_ID[Number(m[2]) - 1] + ' ' + m[1] : '—'; }
  function blokFb(hr, tgl) {
    var fb = function (d) { return hr[d] && hr[d].indexOf('FB') >= 0; };
    if (!fb(tgl)) return null;
    var awal = tgl, akhir = tgl, i;
    while (fb(D.geser(awal, -1))) awal = D.geser(awal, -1);
    while (fb(D.geser(akhir, 1))) akhir = D.geser(akhir, 1);
    var jumlah = 0;
    for (i = 0; i < 14; i++) if (fb(D.geser(awal, i))) jumlah++;
    var masuk = null;
    for (i = 1; i <= 14 && !masuk; i++) {
      var d = D.geser(akhir, i);
      if (hr[d] && D.KODE_KERJA_AFL.some(function (k) { return hr[d].indexOf(k) >= 0; })) masuk = d;
    }
    return { awal: awal, akhir: akhir, jumlah: jumlah, masuk: masuk };
  }
  function kodeHari(hr, d) { return hr[d] ? hr[d].slice().sort().join('/') : ''; }
  function cekCuti(jenis, tgl, hr, afls) {
    var masalah = [];
    var merah = function (t) { masalah.push({ tingkat: 'merah', teks: t }); };
    var amber = function (t) { masalah.push({ tingkat: 'amber', teks: t }); };
    var blok = blokFb(hr, tgl), kunciAfl = jenis === 'berangkat' ? 'awal_cuti' : 'akhir_cuti';
    var jarak = function (a, b) { return Math.abs(D.selisih(a, b)); };
    var afl = null;
    if (blok) afl = afls.filter(function (a) { return a.awal_cuti === blok.awal; })[0] ||
      afls.filter(function (a) { return a.awal_cuti <= blok.akhir && (a.akhir_cuti || a.awal_cuti) >= blok.awal; })[0] || null;
    if (!afl) afl = afls.filter(function (a) { return a[kunciAfl] === tgl; })[0] || null;
    if (!afl) afl = afls.filter(function (a) { return jarak(a.awal_cuti, tgl) <= 14; })
      .sort(function (a, b) { return jarak(a.awal_cuti, tgl) - jarak(b.awal_cuti, tgl); })[0] || null;
    var kode = kodeHari(hr, tgl);
    if (!blok) merah(kode ? 'Roster ' + tglId(tgl) + ' bukan FB (kode ' + kode + ')' : 'Roster ' + tglId(tgl) + ' kosong');
    else if (jenis === 'berangkat' && blok.awal !== tgl) merah('Roster: cuti sudah mulai ' + tglId(blok.awal) + ', bukan ' + tglId(tgl));
    else if (jenis === 'balik' && blok.akhir !== tgl) merah('Roster: cuti masih sampai ' + tglId(blok.akhir));
    if (!afl) merah('Tidak ada AFL untuk cuti ini');
    else {
      if (blok && afl.awal_cuti !== blok.awal) merah('Awal cuti AFL ' + tglId(afl.awal_cuti) + ' ≠ roster ' + tglId(blok.awal));
      if (!afl.akhir_cuti) amber('AFL tanpa akhir cuti (roster belum lengkap saat dicetak)');
      else if (blok && afl.akhir_cuti !== blok.akhir) merah('Akhir cuti AFL ' + tglId(afl.akhir_cuti) + ' ≠ roster ' + tglId(blok.akhir));
      if (blok && afl.total_cuti != null && afl.awal_cuti === blok.awal && Number(afl.total_cuti) !== blok.jumlah) {
        merah('Jumlah cuti AFL ' + afl.total_cuti + ' hari ≠ roster ' + blok.jumlah + ' hari');
      }
      if (jenis === 'berangkat') {
        if (Number(afl.revisi) === 1 && Number(afl.full_approve) !== 1) amber('AFL ditandai revisi');
        if (Number(afl.full_approve) !== 1) amber('AFL belum full approve');
      }
    }
    return {
      status: masalah.some(function (x) { return x.tingkat === 'merah'; }) ? 'tidak_sesuai' : (masalah.length ? 'peringatan' : 'sesuai'),
      masalah: masalah,
      roster: { kode: kode, kode_sebelum: kodeHari(hr, D.geser(tgl, -1)), kode_sesudah: kodeHari(hr, D.geser(tgl, 1)),
        awal: blok ? blok.awal : null, akhir: blok ? blok.akhir : null, jumlah: blok ? blok.jumlah : null, masuk_kembali: blok ? blok.masuk : null },
      afl: afl ? { id_afl: afl.id_afl, awal_cuti: afl.awal_cuti, akhir_cuti: afl.akhir_cuti || null,
        total_cuti: afl.total_cuti == null ? null : Number(afl.total_cuti), dari_lapangan: Number(afl.dari_lapangan) === 1,
        full_approve: Number(afl.full_approve) === 1, revisi: Number(afl.revisi) === 1,
        jalur_berangkat: afl.jalur_berangkat || null, jalur_balik: afl.jalur_balik || null, special_case: Number(afl.special_case) === 1 } : null
    };
  }
  function jalurTravel(k, afl, roster, sheet) {
    var masalah = [], dariSheet = null, n = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
    var i2 = function (v) { var t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
    if (sheet) {
      var sc = sheet.special.filter(function (x) { return n(x.id_ho) === n(k.id_ho); })[0];
      var rt = sheet.rute.filter(function (x) { return n(x.POH) === n(k.poh); })[0];
      if (sc) dariSheet = { berangkat: i2(sc.Berangkat), balik: i2(sc.Balik), special: true };
      else if (rt) dariSheet = { berangkat: i2(rt.Berangkat), balik: i2(rt.Balik), special: false };
    }
    var tercetak = afl && (afl.jalur_berangkat || afl.jalur_balik || afl.special_case)
      ? { berangkat: afl.jalur_berangkat, balik: afl.jalur_balik, special: !!afl.special_case } : null;
    var pakai = tercetak || dariSheet;
    if (!pakai || (!pakai.berangkat && !pakai.balik)) {
      masalah.push({ tingkat: 'amber', teks: 'Jalur travel tidak diketahui' +
        (sheet && !dariSheet ? ' — POH "' + (k.poh || '-') + '" tidak ada di Rute travel' : '') +
        (pakai && pakai.special ? ' — jalur di special chase kosong' : '') });
    }
    if (tercetak && dariSheet) {
      if ((tercetak.berangkat || '') !== (dariSheet.berangkat || '') || (tercetak.balik || '') !== (dariSheet.balik || '')) {
        masalah.push({ tingkat: 'amber', teks: 'Jalur di sheet sekarang ' + (dariSheet.berangkat || '—') + ' / ' + (dariSheet.balik || '—') + ', beda dengan TR tercetak' });
      }
      if (tercetak.special !== dariSheet.special) {
        masalah.push({ tingkat: 'amber', teks: dariSheet.special ? 'Kini terdaftar di special chase (TR tercetak bukan special case)' : 'Tidak lagi di special chase (TR tercetak special case)' });
      }
    }
    var special = pakai ? !!pakai.special : false;
    var awal = (roster && roster.awal) || (afl && afl.awal_cuti) || null;
    var akhir = (roster && roster.akhir) || (afl && afl.akhir_cuti) || null;
    var masuk = (roster && roster.masuk_kembali) || (akhir ? D.geser(akhir, 1) : null);
    return { jalur: { berangkat: pakai ? pakai.berangkat : null, balik: pakai ? pakai.balik : null, special: special,
      sumber: tercetak ? 'tercetak' : (dariSheet ? 'sheet' : null), sheet_run: !tercetak && dariSheet && sheet ? sheet.run : null,
      tgl_berangkat: awal ? (special ? D.geser(awal, -1) : awal) : null, tgl_balik: special ? masuk : akhir }, masalah: masalah };
  }
  R['GET /webhook/afl-crosscek'] = function (ctx, db) {
    if (!bolehFitur(ctx, 'afl')) return tolakAfl();
    var minta = String(ctx.query.tgl || '');
    if (minta && !/^\d{4}-\d{2}-\d{2}$/.test(minta)) return { code: 400, json: { status: 'error', message: 'tgl harus berformat YYYY-MM-DD.' } };
    var h = hari(), besok = D.geser(h, 1), rosterSampai = D.rAkhirSemua(db);
    var tgl = minta || besok;
    if (!D.isDate(tgl)) return { code: 400, json: { status: 'error', message: 'tgl tidak sah.' } };
    var kemarin = D.geser(tgl, -1), lusa = D.geser(tgl, 1), dot = setDot(db);
    var berangkat = {}, balik = {};
    db.karyawan.forEach(function (k) {
      if (dot[k.id_ho] || D.rGet(db, k.id_ho, tgl) !== 'FB') return;
      if (D.rGet(db, k.id_ho, kemarin) !== 'FB') berangkat[k.id_ho] = 1;
      if (D.rGet(db, k.id_ho, lusa) !== 'FB') balik[k.id_ho] = 1;
    });
    db.afl.forEach(function (a) {
      if (a.awal_cuti === tgl) berangkat[a.id_ho] = 1;
      if (a.akhir_cuti === tgl) balik[a.id_ho] = 1;
    });
    var ids = Object.keys(berangkat).concat(Object.keys(balik)).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var hrMap = {}, aflMap = {};
    ids.forEach(function (id) {
      var m = {};
      D.rBaris(db, id, D.geser(tgl, -45), D.geser(tgl, 45)).forEach(function (b) { (m[b.tgl] = m[b.tgl] || []).push(b.shift); });
      hrMap[id] = m;
      aflMap[id] = db.afl.filter(function (a) { return a.id_ho === id && a.awal_cuti >= D.geser(tgl, -45) && a.awal_cuti <= D.geser(tgl, 45); })
        .sort(function (a, b) { return a.awal_cuti < b.awal_cuti ? -1 : 1; });
    });
    var URUT = { tidak_sesuai: 0, peringatan: 1, sesuai: 2 };
    var sheet = null, runSheet = execAfl(db).filter(function (e) { return e.items; })[0];
    if (ids.some(function (id) { return !D.pohLokal((D.karOf(db, id) || {}).poh); })) {
      sheet = { run: runSheet ? runSheet.id : null, waktu: runSheet ? runSheet.mulai : null, rute: db.sheet.rute, special: db.sheet.special };
    }
    var susun = function (set) {
      return Object.keys(set).map(function (id) {
        var k = D.karOf(db, id) || {}, tr = !D.pohLokal(k.poh);
        var o = Object.assign({ id_ho: id, nama: String(k.nama || '').trim(), jabatan: String(k.jabatan || '').trim(),
          poh: String(k.poh || '').trim(), travel_request: tr }, cekCuti(set === berangkat ? 'berangkat' : 'balik', tgl, hrMap[id] || {}, aflMap[id] || []));
        o.jalur = null;
        if (tr) {
          var j = jalurTravel({ id_ho: id, poh: k.poh }, o.afl, o.roster, sheet);
          o.jalur = j.jalur;
          o.masalah = o.masalah.concat(j.masalah);
          if (o.status === 'sesuai' && j.masalah.length) o.status = 'peringatan';
        }
        return o;
      }).sort(function (x, y) { return (Number(y.travel_request) - Number(x.travel_request)) || (URUT[x.status] - URUT[y.status]) || x.nama.localeCompare(y.nama); });
    };
    var bA = susun(berangkat), bK = susun(balik);
    var hitung = function (st) { return bA.concat(bK).filter(function (x) { return x.status === st; }).length; };
    return { json: { tanggal: tgl, hari_ini: h, besok: besok, roster_sampai: rosterSampai, roster_lusa_ada: !!(rosterSampai && rosterSampai >= lusa),
      sheet: sheet ? { run: sheet.run, waktu: sheet.waktu } : null,
      ringkas: { berangkat: bA.length, balik: bK.length, berangkat_tr: bA.filter(function (x) { return x.travel_request; }).length,
        balik_tr: bK.filter(function (x) { return x.travel_request; }).length, tidak_sesuai: hitung('tidak_sesuai'),
        peringatan: hitung('peringatan'), sesuai: hitung('sesuai') },
      berangkat: bA, balik: bK } };
  };

  /* ---------------- SIMPER & skill ---------------- */
  var ACCESS = ['Pit Access', 'Full Access'], CLASS = ['BII', 'BII Umum', 'A', 'C'], STATUS_SKILL = ['Full', 'Training', 'Parsial'];
  R['GET /webhook/simper-list'] = function (ctx, db) {
    var qs = String(ctx.query.q || '').trim().slice(0, 100);
    if (!qs) return { code: 400, json: { status: 'error', message: 'Masukkan nama atau ID HO.' } };
    var rows = db.karyawan.filter(function (k) { return mengandung(k.id_ho, qs) || mengandung(k.nama, qs); })
      .sort(function (a, b) { return (sama(b.id_ho, qs) - sama(a.id_ho, qs)) || urutNama(a.nama, b.nama) || (a.id_ho < b.id_ho ? -1 : 1); })
      .slice(0, 51);
    var persis = rows.filter(function (k) { return sama(k.id_ho, qs); });
    if (persis.length) rows = persis;
    var terpotong = rows.length > 50;
    rows = rows.slice(0, 50);
    var unit = {}; db.unit.forEach(function (u) { unit[u.id_unit] = u; });
    var h = hari();
    return { json: { hari_ini: h, terpotong: terpotong, karyawan: rows.map(function (k) {
      var sp = db.simper.filter(function (x) { return x.id_ho === k.id_ho; })[0];
      var sk = db.skill.filter(function (x) { return x.id_ho === k.id_ho && unit[x.skill]; }).map(function (x) {
        var u = unit[x.skill];
        return { id_skill: x.id_skill, id_unit: u.id_unit, unit: u.unit, kategori: u.kategori || '', status: x.status || '', tgl_ditambah: x.tgl_ditambah || '' };
      }).sort(function (a, b) { return a.kategori.localeCompare(b.kategori) || a.unit.localeCompare(b.unit) || a.id_skill - b.id_skill; });
      return { id_ho: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan),
        simper: sp ? { operator: s(sp.operator), access: s(sp.access), class: s(sp.class), no_simpol: s(sp.no_simpol),
          exp: s(sp.exp), sisa_hari: sp.exp ? D.selisih(h, sp.exp) : null, catatan: s(sp.catatan) } : null,
        skill: sk };
    }) } };
  };
  function hitungRingkasan(db) {
    var dot = setDot(db), h = hari();
    var aktif = db.karyawan.filter(function (k) { return !dot[k.id_ho]; });
    var orang = function (k) { return { id_ho: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan) }; };
    var sim = db.simper.filter(function (x) { return !dot[x.id_ho] && D.karOf(db, x.id_ho); }).map(function (x) {
      var k = D.karOf(db, x.id_ho);
      return { k: k, exp: x.exp || null, sisa_hari: x.exp ? D.selisih(h, x.exp) : null, catatan: String(x.catatan || '').trim() };
    }).sort(function (a, b) { return (String(a.exp || '') < String(b.exp || '') ? -1 : String(a.exp || '') > String(b.exp || '') ? 1 : 0) || urutNama(a.k.nama, b.k.nama); });
    var exp = sim.filter(function (r) { return r.sisa_hari != null && r.sisa_hari <= 30; })
      .map(function (r) { return Object.assign(orang(r.k), { exp: r.exp, sisa_hari: r.sisa_hari }); });
    var catatan = sim.filter(function (r) { return r.catatan; }).map(function (r) { return Object.assign(orang(r.k), { catatan: r.catatan }); });
    var perStatus = {}, punya = {};
    db.skill.forEach(function (x) {
      if (dot[x.id_ho] || !D.karOf(db, x.id_ho)) return;
      var st = x.status || '';
      var p = perStatus[st] || (perStatus[st] = { skill: 0, orangSet: {} });
      p.skill++; p.orangSet[x.id_ho] = 1; punya[x.id_ho] = 1;
    });
    var unit = db.unit.map(function (u) {
      var o = {}, f = {}, t = {}, p = {};
      db.skill.forEach(function (x) {
        if (x.skill !== u.id_unit || dot[x.id_ho] || !D.karOf(db, x.id_ho)) return;
        o[x.id_ho] = 1;
        if (x.status === 'Full') f[x.id_ho] = 1; else if (x.status === 'Training') t[x.id_ho] = 1; else if (x.status === 'Parsial') p[x.id_ho] = 1;
      });
      var n = function (z) { return Object.keys(z).length; };
      return { id_unit: u.id_unit, unit: u.unit, kategori: u.kategori || '', orang: n(o), full: n(f), training: n(t), parsial: n(p) };
    }).sort(function (a, b) { return (b.orang - a.orang) || a.unit.localeCompare(b.unit); });
    return {
      hari_ini: h, batas_hari: 30,
      total: { karyawan_aktif: aktif.length, punya_simper: sim.length, punya_skill: Object.keys(punya).length,
        kedaluwarsa: exp.filter(function (r) { return r.sisa_hari < 0; }).length, segera: exp.filter(function (r) { return r.sisa_hari >= 0; }).length,
        catatan: catatan.length },
      exp: exp, catatan: catatan,
      status: STATUS_SKILL.map(function (x) {
        var p = perStatus[x];
        return { status: x, skill: p ? p.skill : 0, orang: p ? Object.keys(p.orangSet).length : 0 };
      }),
      unit: unit
    };
  }
  R['GET /webhook/simper-ringkasan'] = function (ctx, db) { return { json: hitungRingkasan(db) }; };
  R['GET /webhook/simper-angka'] = function (ctx, db) {
    var r = hitungRingkasan(db);
    return { json: { hari_ini: r.hari_ini, batas_hari: r.batas_hari, total: r.total, status: r.status,
      unit: r.unit.filter(function (u) { return u.orang > 0; }).map(function (u) {
        return { unit: u.unit, kategori: u.kategori, orang: u.orang, full: u.full, training: u.training, parsial: u.parsial };
      }) } };
  };
  R['GET /webhook/unit-list'] = function (ctx, db) {
    return { json: { unit: db.unit.slice().sort(function (a, b) { return (a.kategori || '').localeCompare(b.kategori || '') || a.unit.localeCompare(b.unit); })
      .map(function (u) { return { id_unit: u.id_unit, unit: u.unit, kategori: u.kategori || '' }; }) } };
  };
  R['POST /webhook/simper-simpan'] = function (ctx, db) {
    var b = ctx.body || {}, mode = b.mode === 'ubah' ? 'ubah' : 'tambah', id = teks(b.id_ho);
    var v = { operator: teks(b.operator), access: teks(b.access), class: teks(b.class), no_simpol: teks(b.no_simpol), exp: teks(b.exp), catatan: teks(b.catatan) };
    var salah = [];
    if (!D.karOf(db, id)) salah.push('ID HO "' + id + '" tidak ada di data karyawan');
    if (v.operator.length > 50) salah.push('Operator maksimal 50 karakter');
    if (v.access && ACCESS.indexOf(v.access) < 0) salah.push('Access harus ' + ACCESS.join(' / '));
    if (v.class && CLASS.indexOf(v.class) < 0) salah.push('Class harus ' + CLASS.join(' / '));
    if (v.no_simpol.length > 50) salah.push('No. Simpol maksimal 50 karakter');
    if (v.exp && !D.isDate(v.exp)) salah.push('Masa berlaku "' + v.exp + '" bukan tanggal yang sah');
    if (v.catatan.length > 1000) salah.push('Catatan maksimal 1000 karakter');
    if (!Object.keys(v).some(function (k) { return v[k]; })) salah.push('Isi minimal satu kolom');
    if (salah.length) { audit(db, { action: 'simper-' + mode, ctx: ctx, id_ho: id || null, ok: false, detail: { errors: salah } }); return tolak(salah); }
    var nilai = {}; Object.keys(v).forEach(function (k) { nilai[k] = v[k] === '' ? null : v[k]; });
    var ada = db.simper.filter(function (x) { return x.id_ho === id; })[0];
    if (mode === 'tambah') {
      if (ada) return { code: 409, json: { status: 'conflict', message: 'Karyawan ini sudah punya SIMPER — cari ulang, lalu pakai tombol Ubah.' } };
      db.simper.push(Object.assign({ id_simper: ++db.seq.simper, id_ho: id }, nilai));
    } else {
      if (!ada) return { code: 404, json: { status: 'not_found', message: 'SIMPER karyawan ini sudah tidak ada — cari ulang, lalu pakai tombol Tambah.' } };
      Object.assign(ada, nilai);
    }
    audit(db, { action: 'simper-' + mode, ctx: ctx, id_ho: id, detail: v });
    return { json: { status: 'ok', message: 'SIMPER ' + (mode === 'tambah' ? 'ditambahkan' : 'diperbarui') + '.' } };
  };
  R['POST /webhook/simper-hapus'] = function (ctx, db) {
    var id = teks((ctx.body || {}).id_ho);
    var lama = db.simper.filter(function (x) { return x.id_ho === id; })[0];
    if (!lama) return { code: 404, json: { status: 'not_found', message: 'SIMPER karyawan ini sudah tidak ada (mungkin baru dihapus orang lain) — data dimuat ulang.' } };
    db.simper = db.simper.filter(function (x) { return x !== lama; });
    audit(db, { action: 'simper-hapus', ctx: ctx, id_ho: id, detail: { operator: lama.operator, access: lama.access, class: lama.class,
      no_simpol: lama.no_simpol, exp: lama.exp, catatan: lama.catatan } });
    return { json: { status: 'ok', message: 'SIMPER dihapus.' } };
  };
  var SKILL_HILANG = { code: 404, json: { status: 'not_found', message: 'Skill ini sudah tidak ada (mungkin baru dihapus orang lain) — data dimuat ulang.' } };
  R['POST /webhook/skill-tambah'] = function (ctx, db) {
    var b = ctx.body || {}, id = teks(b.id_ho), unit = Number(b.skill), status = teks(b.status), tgl = teks(b.tgl_ditambah), h = hari();
    var salah = [], namaUnit = '';
    if (!D.karOf(db, id)) salah.push('ID HO "' + id + '" tidak ada di data karyawan');
    if (!Number.isInteger(unit) || unit <= 0) salah.push('Pilih unit');
    else {
      var u = db.unit.filter(function (x) { return x.id_unit === unit; })[0];
      if (!u) salah.push('Unit tidak dikenal (id ' + unit + ')'); else namaUnit = u.unit;
    }
    if (STATUS_SKILL.indexOf(status) < 0) salah.push('Status harus ' + STATUS_SKILL.join(' / '));
    if (tgl && !D.isDate(tgl)) salah.push('Tanggal ditambah "' + tgl + '" bukan tanggal yang sah');
    else if (tgl > h) salah.push('Tanggal ditambah tidak boleh sesudah hari ini (' + h + ')');
    if (salah.length) { audit(db, { action: 'skill-tambah', ctx: ctx, id_ho: id || null, ok: false, detail: { errors: salah } }); return tolak(salah); }
    if (!tgl) tgl = h;
    var ada = db.skill.filter(function (x) { return x.id_ho === id && x.skill === unit; })[0];
    if (ada) return { code: 409, json: { status: 'conflict', message: 'Skill ' + namaUnit + ' sudah tercatat untuk karyawan ini (status ' + (ada.status || '—') + ').' } };
    db.skill.push({ id_skill: ++db.seq.skill, id_ho: id, tgl_ditambah: tgl, skill: unit, status: status });
    audit(db, { action: 'skill-tambah', ctx: ctx, id_ho: id, detail: { skill: unit, unit: namaUnit, status: status, tgl_ditambah: tgl } });
    return { json: { status: 'ok', message: 'Skill ' + namaUnit + ' (' + status + ') ditambahkan.' } };
  };
  function cariSkill(db, idSkill, id) {
    var x = db.skill.filter(function (k) { return k.id_skill === idSkill && k.id_ho === id; })[0];
    if (!x) return null;
    var u = db.unit.filter(function (z) { return z.id_unit === x.skill; })[0];
    return u ? { row: x, unit: u.unit } : null;
  }
  R['POST /webhook/skill-ubah'] = function (ctx, db) {
    var b = ctx.body || {}, idSkill = Number(b.id_skill), id = teks(b.id_ho), status = teks(b.status), tgl = teks(b.tgl_ditambah), h = hari();
    var salah = [];
    if (!Number.isInteger(idSkill) || idSkill <= 0) salah.push('id_skill tidak sah');
    if (STATUS_SKILL.indexOf(status) < 0) salah.push('Status harus ' + STATUS_SKILL.join(' / '));
    if (!tgl) salah.push('Tanggal ditambah wajib diisi');
    else if (!D.isDate(tgl)) salah.push('Tanggal ditambah "' + tgl + '" bukan tanggal yang sah');
    else if (tgl > h) salah.push('Tanggal ditambah tidak boleh sesudah hari ini (' + h + ')');
    if (salah.length) { audit(db, { action: 'skill-ubah', ctx: ctx, id_ho: id || null, ok: false, detail: { id_skill: b.id_skill, errors: salah } }); return tolak(salah); }
    var c = cariSkill(db, idSkill, id);
    if (!c) return SKILL_HILANG;
    if (c.row.status === status && c.row.tgl_ditambah === tgl) return { json: { status: 'ok', message: 'Tidak ada perubahan pada skill ' + c.unit + '.' } };
    var dari = { status: c.row.status, tgl_ditambah: c.row.tgl_ditambah };
    c.row.status = status; c.row.tgl_ditambah = tgl;
    audit(db, { action: 'skill-ubah', ctx: ctx, id_ho: id, detail: { id_skill: idSkill, unit: c.unit, dari: dari, jadi: { status: status, tgl_ditambah: tgl } } });
    return { json: { status: 'ok', message: 'Skill ' + c.unit + ' diubah (' + (dari.status !== status ? dari.status + ' → ' + status : 'tanggal ' + tgl) + ').' } };
  };
  R['POST /webhook/skill-hapus'] = function (ctx, db) {
    var b = ctx.body || {}, idSkill = Number(b.id_skill), id = teks(b.id_ho);
    if (!Number.isInteger(idSkill) || idSkill <= 0) return tolak(['id_skill tidak sah']);
    var c = cariSkill(db, idSkill, id);
    if (!c) return SKILL_HILANG;
    db.skill = db.skill.filter(function (x) { return x !== c.row; });
    audit(db, { action: 'skill-hapus', ctx: ctx, id_ho: id, detail: { id_skill: idSkill, unit: c.unit, status: c.row.status, tgl_ditambah: c.row.tgl_ditambah } });
    return { json: { status: 'ok', message: 'Skill ' + c.unit + ' dihapus.' } };
  };

  /* ---------------- APD ---------------- */
  var JABATAN_6_BULAN = /fleet\s*-?\s*line\s*-?\s*up|foreman|supervisor|dewatering/i;
  function masaExpBulan(namaApd, jabatan) {
    var n = String(namaApd || '').toLowerCase();
    if (/sepatu|shoe/.test(n)) return JABATAN_6_BULAN.test(String(jabatan || '')) ? 6 : 12;
    if (/helm/.test(n) && !/tali|strap/.test(n)) return 24;
    return null;
  }
  function lamaPakai(dari, sampai) {
    if (!dari || sampai < dari) return null;
    var bl = 0;
    while (D.tambahBulan(dari, bl + 1) <= sampai) bl++;
    return { bulan: bl, hari: D.selisih(D.tambahBulan(dari, bl), sampai), total_hari: D.selisih(dari, sampai) };
  }
  function barisApd(db, ka, h, dot) {
    var k = D.karOf(db, ka.id_ho) || {}, a = db.apd.filter(function (x) { return x.id_apd === ka.apd; })[0] || {};
    var o = { id_kar_apd: ka.id_kar_apd, id_ho: ka.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), dept: s(k.mpp_dept), aktif: !dot[ka.id_ho],
      id_apd: ka.apd, nama_apd: s(a.nama_apd), tipe_apd: s(a.tipe_apd), tgl_diajukan: ka.tgl_diajukan || null,
      safety: !!Number(ka.safety), warehouse: !!Number(ka.warehouse), tgl_diambil: ka.tgl_diambil || null, tgl_dikembalikan: ka.tgl_dikembalikan || null };
    o.status = o.tgl_dikembalikan ? 'dikembalikan' : o.tgl_diambil ? 'diambil' : o.tgl_diajukan ? 'diajukan' : 'antrean';
    o.masa_bulan = masaExpBulan(o.nama_apd, o.jabatan);
    o.tgl_exp = o.masa_bulan && o.tgl_diambil ? D.tambahBulan(o.tgl_diambil, o.masa_bulan) : null;
    o.sisa_hari = o.tgl_exp ? D.selisih(h, o.tgl_exp) : null;
    o.lama = o.tgl_diambil ? lamaPakai(o.tgl_diambil, o.tgl_dikembalikan || h) : null;
    o.bisa_ubah = !!o.tgl_diajukan;
    o.warna = o.tgl_dikembalikan ? '' : o.sisa_hari != null && o.sisa_hari <= 0 ? 'merah'
      : o.sisa_hari != null && o.sisa_hari <= 30 ? 'kuning' : o.safety && o.warehouse && o.tgl_diambil ? 'hijau' : '';
    return o;
  }
  function labelApd(a) { return a.nama_apd + (a.tipe_apd ? ' (' + a.tipe_apd + ')' : ''); }
  R['GET /webhook/apd-list'] = function (ctx, db) {
    var apd = db.apd.slice().sort(function (a, b) { return a.nama_apd.localeCompare(b.nama_apd) || String(a.tipe_apd || '').localeCompare(String(b.tipe_apd || '')); });
    var terkirim = {}, riwayat = [];
    db.audit.filter(function (x) { return x.action === 'apd-cetak' && x.ok === 1; }).sort(function (a, b) { return b.id - a.id; }).slice(0, 50)
      .forEach(function (x) {
        var d = x.detail || {};
        var ids = Array.isArray(d.id_kar_apd) ? d.id_kar_apd : [];
        ids.forEach(function (id) { if (!terkirim[id]) terkirim[id] = { pada: String(x.ts).slice(0, 16), oleh: String(d.nama || x.actor || '') }; });
        riwayat.push({ pada: String(x.ts).slice(0, 16), oleh: String(x.actor || ''), nama: String(d.nama || x.actor || ''),
          jumlah: Number(d.jumlah) || ids.length, karyawan: Number(d.karyawan) || 0 });
      });
    var antre = db.kapd.filter(function (x) { return !x.tgl_diajukan && D.karOf(db, x.id_ho); }).map(function (x) {
      var k = D.karOf(db, x.id_ho), a = db.apd.filter(function (z) { return z.id_apd === x.apd; })[0] || {};
      return { id_kar_apd: x.id_kar_apd, id_ho: x.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), dept: s(k.mpp_dept),
        id_apd: x.apd, nama_apd: s(a.nama_apd), tipe_apd: s(a.tipe_apd), terkirim: terkirim[x.id_kar_apd] || null };
    }).sort(function (a, b) { return urutNama(a.nama, b.nama) || (a.id_ho < b.id_ho ? -1 : a.id_ho > b.id_ho ? 1 : 0) || a.nama_apd.localeCompare(b.nama_apd) || a.id_kar_apd - b.id_kar_apd; });
    return { json: { hari_ini: hari(), apd: apd.map(function (a) {
      return { id_apd: a.id_apd, nama_apd: a.nama_apd, tipe_apd: s(a.tipe_apd), dipakai: db.kapd.filter(function (x) { return x.apd === a.id_apd; }).length };
    }), antrean: antre, riwayat: riwayat.slice(0, 5) } };
  };
  R['GET /webhook/apd-data'] = function (ctx, db) {
    var qs = String(ctx.query.q || '').trim().slice(0, 100), h = hari(), dot = setDot(db);
    var rows = db.kapd.filter(function (x) {
      var k = D.karOf(db, x.id_ho);
      return k && (!qs || mengandung(k.id_ho, qs) || mengandung(k.nama, qs));
    });
    var orang = {}; rows.forEach(function (x) { orang[x.id_ho] = 1; });
    var total = rows.length;
    rows.sort(function (a, b) {
      var c = 0;
      if (qs) {
        c = urutNama(D.karOf(db, a.id_ho).nama, D.karOf(db, b.id_ho).nama) || (a.id_ho < b.id_ho ? -1 : a.id_ho > b.id_ho ? 1 : 0);
        if (c) return c;
      }
      var ka = a.tgl_dikembalikan ? 1 : 0, kb = b.tgl_dikembalikan ? 1 : 0;
      if (ka !== kb) return ka - kb;
      var na = a.tgl_diajukan ? 0 : 1, nb = b.tgl_diajukan ? 0 : 1;
      if (na !== nb) return nb - na;
      if ((a.tgl_diajukan || '') !== (b.tgl_diajukan || '')) return (a.tgl_diajukan || '') < (b.tgl_diajukan || '') ? 1 : -1;
      return b.id_kar_apd - a.id_kar_apd;
    });
    rows = rows.slice(0, 1000);
    var data = rows.map(function (x, i) { var o = barisApd(db, x, h, dot); o._i = i; return o; });
    var kelompok = {};
    data.forEach(function (d) { if (!(d.id_ho in kelompok)) kelompok[d.id_ho] = d._i; });
    var PER = { merah: 0, kuning: 1 }, rank = function (w) { return w in PER ? PER[w] : 9; };
    data.sort(function (x, y) { return (qs ? kelompok[x.id_ho] - kelompok[y.id_ho] : 0) || (rank(x.warna) - rank(y.warna)) || (x._i - y._i); });
    var warna = { merah: 0, kuning: 0, hijau: 0 };
    data.forEach(function (d) { if (d.warna) warna[d.warna]++; delete d._i; });
    return { json: { q: qs, hari_ini: h, batas_dekat: 30, total: total, karyawan: Object.keys(orang).length, terpotong: total > rows.length, warna: warna, data: data } };
  };
  R['POST /webhook/apd-ceklis'] = function (ctx, db) {
    var b = ctx.body || {}, idk = Number(b.id_kar_apd), h = hari();
    if (!Number.isInteger(idk) || idk <= 0) return tolak(['id_kar_apd tidak sah']);
    var ka = db.kapd.filter(function (x) { return x.id_kar_apd === idk; })[0];
    if (!ka || !D.karOf(db, ka.id_ho)) return { code: 404, json: { status: 'not found', message: 'Data APD itu sudah tidak ada (muat ulang halaman).' } };
    var dot = setDot(db), lama = barisApd(db, ka, h, dot);
    if (!lama.tgl_diajukan) return { code: 409, json: { status: 'conflict', message: 'APD ini belum diajukan — cetak dulu dari Antrean Cetak.' } };
    var KOL = ['safety', 'warehouse', 'tgl_diambil', 'tgl_dikembalikan'], salah = [], baru = {};
    KOL.forEach(function (k) { baru[k] = lama[k]; });
    ['safety', 'warehouse'].forEach(function (k) {
      if (!(k in b)) return;
      if (typeof b[k] !== 'boolean') salah.push(k + ' harus true/false'); else baru[k] = b[k];
    });
    [['tgl_diambil', 'diambil'], ['tgl_dikembalikan', 'dikembalikan']].forEach(function (x) {
      if (!(x[0] in b)) return;
      var t = b[x[0]] == null ? '' : String(b[x[0]]).trim();
      if (t && !D.isDate(t)) salah.push('tanggal ' + x[1] + ' tidak sah'); else baru[x[0]] = t || null;
    });
    if (salah.length) return tolak(salah);
    var berubah = KOL.filter(function (k) { return baru[k] !== lama[k]; });
    if (!berubah.length) return { json: { status: 'ok', message: 'Tidak ada perubahan.', baris: lama } };
    if (baru.warehouse && !baru.safety) salah.push('centang Safety dulu sebelum Warehouse');
    if (baru.tgl_diambil && !baru.warehouse) salah.push('centang Warehouse dulu sebelum mengisi tanggal diambil');
    if (baru.tgl_dikembalikan && !baru.tgl_diambil) salah.push('isi tanggal diambil dulu sebelum tanggal dikembalikan');
    if (lama.tgl_dikembalikan && baru.tgl_dikembalikan && berubah.some(function (k) { return k !== 'tgl_dikembalikan'; })) {
      salah.push('APD ini sudah dikembalikan — kosongkan tanggal dikembalikan dulu untuk mengubah ceklis lainnya');
    }
    if (baru.tgl_diambil && baru.tgl_diambil < lama.tgl_diajukan) salah.push('tanggal diambil tidak boleh sebelum tanggal diajukan (' + lama.tgl_diajukan + ')');
    if (baru.tgl_diambil && baru.tgl_diambil > h) salah.push('tanggal diambil tidak boleh melewati hari ini');
    if (baru.tgl_dikembalikan && baru.tgl_diambil && baru.tgl_dikembalikan < baru.tgl_diambil) salah.push('tanggal dikembalikan tidak boleh sebelum tanggal diambil (' + baru.tgl_diambil + ')');
    if (baru.tgl_dikembalikan && baru.tgl_dikembalikan > h) salah.push('tanggal dikembalikan tidak boleh melewati hari ini');
    if (salah.length) return tolak(salah);
    berubah.forEach(function (k) { ka[k] = (k === 'safety' || k === 'warehouse') ? (baru[k] ? 1 : 0) : baru[k]; });
    var hasil = barisApd(db, ka, h, dot);
    var ambil = function (x) { var o = {}; KOL.forEach(function (k) { o[k] = x[k]; }); return o; };
    audit(db, { action: 'apd-ceklis', ctx: ctx, id_ho: lama.id_ho, detail: { id_kar_apd: idk, nama_apd: lama.nama_apd, tipe_apd: lama.tipe_apd,
      sebelum: ambil(lama), sesudah: ambil(hasil), tgl_exp: hasil.tgl_exp } });
    return { json: { status: 'ok', message: lama.nama_apd + (lama.tipe_apd ? ' (' + lama.tipe_apd + ')' : '') + ' — ' + lama.nama + ' disimpan.', baris: hasil } };
  };
  function cariKaryawanAktif(ctx, db) {
    var qs = String(ctx.query.q || '').trim().slice(0, 100);
    if (!qs) return { code: 400, json: { status: 'error', message: 'Masukkan nama atau ID HO.' } };
    var dot = setDot(db);
    var rows = db.karyawan.filter(function (k) { return !dot[k.id_ho] && (mengandung(k.id_ho, qs) || mengandung(k.nama, qs)); })
      .sort(function (a, b) { return (sama(b.id_ho, qs) - sama(a.id_ho, qs)) || urutNama(a.nama, b.nama) || (a.id_ho < b.id_ho ? -1 : 1); })
      .slice(0, 31);
    var persis = rows.filter(function (k) { return sama(k.id_ho, qs); });
    if (persis.length) rows = persis;
    return { json: { terpotong: rows.length > 30, karyawan: rows.slice(0, 30).map(function (k) {
      return { id_ho: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), dept: s(k.mpp_dept) };
    }) } };
  }
  R['GET /webhook/apd-karyawan'] = cariKaryawanAktif;
  R['POST /webhook/apd-tambah'] = function (ctx, db) {
    var b = ctx.body || {}, id = teks(b.id_ho);
    var daftar = Array.isArray(b.apd) ? b.apd : [b.apd];
    var ids = daftar.map(Number).filter(function (x, i, a) { return a.indexOf(x) === i; });
    var salah = [], nama = {};
    if (!D.karOf(db, id)) salah.push('ID HO "' + id + '" tidak ada di data karyawan');
    if (!ids.length || ids.some(function (x) { return !Number.isInteger(x) || x <= 0; })) salah.push('Pilih minimal satu APD');
    if (!salah.length) {
      db.apd.forEach(function (a) { if (ids.indexOf(a.id_apd) >= 0) nama[a.id_apd] = labelApd(a); });
      var asing = ids.filter(function (x) { return !nama[x]; });
      if (asing.length) salah.push('APD tidak dikenal (id ' + asing.join(', ') + ') — muat ulang halaman');
    }
    if (salah.length) { audit(db, { action: 'apd-tambah', ctx: ctx, id_ho: id || null, ok: false, detail: { apd: ids, errors: salah } }); return tolak(salah); }
    var dobel = db.kapd.filter(function (x) { return x.id_ho === id && ids.indexOf(x.apd) >= 0 && !x.tgl_diajukan; });
    if (dobel.length) return { code: 409, json: { status: 'conflict', message: 'Sudah ada di antrean cetak untuk karyawan ini: ' + dobel.map(function (x) { return nama[x.apd]; }).join(', ') + '.' } };
    var baris = ids.map(function (a) {
      var o = { id_kar_apd: ++db.seq.kapd, id_ho: id, apd: a, tgl_diajukan: null, safety: 0, warehouse: 0, tgl_diambil: null, tgl_dikembalikan: null };
      db.kapd.push(o);
      return o.id_kar_apd;
    });
    audit(db, { action: 'apd-tambah', ctx: ctx, id_ho: id, detail: { apd: ids, id_kar_apd: baris } });
    return { json: { status: 'ok', message: ids.length + ' APD ditambahkan ke antrean cetak: ' + ids.map(function (x) { return nama[x]; }).join(', ') + '.', id_kar_apd: baris } };
  };
  R['POST /webhook/apd-hapus'] = function (ctx, db) {
    var idk = Number((ctx.body || {}).id_kar_apd);
    if (!Number.isInteger(idk) || idk <= 0) return tolak(['id_kar_apd tidak sah']);
    var ka = db.kapd.filter(function (x) { return x.id_kar_apd === idk && !x.tgl_diajukan; })[0];
    if (!ka) return { code: 404, json: { status: 'not_found', message: 'Baris ini sudah tidak ada di antrean (mungkin baru dihapus orang lain) — data dimuat ulang.' } };
    var a = db.apd.filter(function (x) { return x.id_apd === ka.apd; })[0] || {};
    db.kapd = db.kapd.filter(function (x) { return x !== ka; });
    audit(db, { action: 'apd-hapus', ctx: ctx, id_ho: ka.id_ho, detail: { id_kar_apd: idk, apd: ka.apd, nama_apd: a.nama_apd, tipe_apd: s(a.tipe_apd) } });
    return { json: { status: 'ok', message: labelApd(a) + ' dihapus dari antrean.' } };
  };
  R['POST /webhook/apd-master-tambah'] = function (ctx, db) {
    var b = ctx.body || {}, nm = teks(b.nama_apd), tipe = teks(b.tipe_apd), salah = [];
    if (!nm) salah.push('Nama APD wajib diisi');
    if (nm.length > 50) salah.push('Nama APD maksimal 50 karakter');
    if (tipe.length > 50) salah.push('Tipe APD maksimal 50 karakter');
    if (salah.length) return tolak(salah);
    var label = nm + (tipe ? ' (' + tipe + ')' : '');
    if (db.apd.some(function (a) { return sama(a.nama_apd, nm) && sama(a.tipe_apd || '', tipe); })) {
      return { code: 409, json: { status: 'conflict', message: 'APD ' + label + ' sudah ada di daftar.' } };
    }
    var o = { id_apd: ++db.seq.apd, nama_apd: nm, tipe_apd: tipe || null };
    db.apd.push(o);
    audit(db, { action: 'apd-master-tambah', ctx: ctx, detail: { id_apd: o.id_apd, nama_apd: nm, tipe_apd: tipe } });
    return { json: { status: 'ok', message: 'APD ' + label + ' ditambahkan ke daftar.', id_apd: o.id_apd } };
  };
  R['POST /webhook/apd-master-hapus'] = function (ctx, db) {
    var ida = Number((ctx.body || {}).id_apd);
    if (!Number.isInteger(ida) || ida <= 0) return tolak(['id_apd tidak sah']);
    var a = db.apd.filter(function (x) { return x.id_apd === ida; })[0];
    if (!a) return { code: 404, json: { status: 'not_found', message: 'APD ini sudah tidak ada di daftar — data dimuat ulang.' } };
    if (db.kapd.some(function (x) { return x.apd === ida; })) {
      return { code: 409, json: { status: 'conflict', message: 'APD ' + labelApd(a) + ' masih dipakai di data pengajuan — tidak bisa dihapus.' } };
    }
    db.apd = db.apd.filter(function (x) { return x !== a; });
    audit(db, { action: 'apd-master-hapus', ctx: ctx, detail: { id_apd: ida, nama_apd: a.nama_apd, tipe_apd: s(a.tipe_apd) } });
    return { json: { status: 'ok', message: 'APD ' + labelApd(a) + ' dihapus dari daftar.' } };
  };
  R['POST /webhook/apd-cetak'] = function (ctx, db) {
    var b = ctx.body || {};
    if (!Array.isArray(b.pilih)) return { code: 400, json: { status: 'error', message: 'pilih harus berupa daftar.' } };
    var ids = b.pilih.map(Number).filter(function (x, i, a) { return a.indexOf(x) === i; });
    if (!ids.length) return { code: 400, json: { status: 'error', message: 'Tidak ada baris yang dicentang untuk dicetak.' } };
    if (ids.some(function (x) { return !Number.isInteger(x) || x <= 0; })) return { code: 400, json: { status: 'error', message: 'id baris tidak sah.' } };
    if (ids.length > 500) return { code: 400, json: { status: 'error', message: 'Maksimal 500 baris per sekali cetak.' } };
    var rows = db.kapd.filter(function (x) { return ids.indexOf(x.id_kar_apd) >= 0 && !x.tgl_diajukan && D.karOf(db, x.id_ho); });
    if (rows.length !== ids.length) return { code: 409, json: { status: 'conflict', message: (ids.length - rows.length) + ' baris yang dicentang sudah tidak ada di antrean (muat ulang halaman).' } };
    var per = {}, urut = [];
    rows.slice().sort(function (a, b) { return urutNama(D.karOf(db, a.id_ho).nama, D.karOf(db, b.id_ho).nama) || a.id_kar_apd - b.id_kar_apd; }).forEach(function (x) {
      var k = D.karOf(db, x.id_ho);
      if (!per[x.id_ho]) {
        var kon = D.kontrakOf(db, x.id_ho);
        per[x.id_ho] = { id_ho: k.id_ho, id_site: k.id_site == null ? null : Number(k.id_site), nama: s(k.nama), jabatan: s(k.jabatan),
          mpp_position: s(k.mpp_position), mpp_dept: s(k.mpp_dept), mpp_section: s(k.mpp_section), status: s(k.status),
          kategori: s(k.kategori), poh: s(k.poh), doh: kon && kon.doh ? kon.doh : null, apd: [] };
        urut.push(x.id_ho);
      }
      var a = db.apd.filter(function (z) { return z.id_apd === x.apd; })[0] || {};
      var terakhir = null;
      db.kapd.forEach(function (p) {
        if (p.id_ho !== x.id_ho || !p.tgl_diajukan) return;
        var pa = db.apd.filter(function (z) { return z.id_apd === p.apd; })[0] || {};
        if (pa.nama_apd !== a.nama_apd) return;
        var t = p.tgl_diambil || p.tgl_diajukan;
        if (!terakhir || t > terakhir) terakhir = t;
      });
      per[x.id_ho].apd.push({ id_kar_apd: x.id_kar_apd, id_apd: x.apd, nama_apd: s(a.nama_apd), tipe_apd: s(a.tipe_apd), terakhir: terakhir });
    });
    var karyawan = urut.map(function (id) { return per[id]; });
    if (karyawan.length > 30) return { code: 400, json: { status: 'error', message: 'Maksimal 30 karyawan per sekali cetak (tercentang ' + karyawan.length + ') — cetak bertahap.' } };
    var nama = namaPengguna(db, ctx), tanggal = hari();
    var bytes = D.pdfApd(karyawan, { tanggal: tanggal, oleh: nama });
    var idKar = rows.map(function (x) { return x.id_kar_apd; });
    rows.forEach(function (x) { x.tgl_diajukan = tanggal; });
    audit(db, { action: 'apd-cetak', ctx: ctx, detail: { ukuran: bytes.length, diajukan: rows.length, jumlah: rows.length, karyawan: karyawan.length,
      nama: nama, tanggal: tanggal, id_kar_apd: idKar, id_ho: urut } });
    var berkas = 'Permintaan APD ' + (karyawan.length === 1 ? karyawan[0].nama + ' (' + karyawan[0].id_ho + ') ' : karyawan.length + ' karyawan ') + tanggal + '.pdf';
    return { raw: bytes, type: 'application/pdf', filename: berkas, inline: true, jeda: 900 + 450 * karyawan.length,
      headers: { 'X-Magi-Diajukan': String(rows.length), 'X-Magi-Karyawan': String(karyawan.length) } };
  };

  /* ---------------- Warning ---------------- */
  var STATUS_WAR = ['Done', 'Cancel'];
  function masihBerlaku(sisa, status) { return Number(sisa) >= 0 && STATUS_WAR.indexOf(String(status || '')) < 0; }
  function daftarPembina(db) {
    var dot = setDot(db);
    return db.karyawan.filter(function (k) { return D.STATUS_PEMBINA.indexOf(k.status) >= 0 && !dot[k.id_ho]; })
      .sort(function (a, b) { return urutNama(a.nama, b.nama) || (a.id_ho < b.id_ho ? -1 : 1); });
  }
  /* routes/warning.js ambilWarning — berakhir = tgl diberi + masa sanksi - 1 hari */
  function ambilWarning(db, saring, urut) {
    var h = hari();
    var rows = db.warning.filter(function (w) { return D.karOf(db, w.id_ho) && (!saring || saring(w)); }).map(function (w) {
      var k = D.karOf(db, w.id_ho), p = D.karOf(db, w.pembina) || {};
      var berakhir = D.geser(D.tambahBulan(w.tgl_war_diberi, D.MASA_BULAN[w.sanksi] || 0), -1);
      var sisa = D.selisih(h, berakhir);
      return { id_warning: w.id_warning, id_ho: w.id_ho, id_site: k.id_site == null ? '' : String(k.id_site), nama: s(k.nama),
        jabatan: s(k.jabatan), mpp_position: s(k.mpp_position), dept: s(k.mpp_dept), pelanggaran: s(w.pelanggaran), sanksi: w.sanksi,
        tgl_war_diberi: w.tgl_war_diberi, pembina: w.pembina, nama_pembina: s(p.nama), jabatan_pembina: s(p.mpp_position || p.jabatan),
        war_catatan: s(w.war_catatan), status: s(w.status), masa_bulan: D.MASA_BULAN[w.sanksi] || 0, berakhir: berakhir,
        sisa_hari: sisa, berlaku: masihBerlaku(sisa, w.status) };
    });
    if (urut === 'idho') rows.sort(function (a, b) { return (a.id_ho < b.id_ho ? -1 : a.id_ho > b.id_ho ? 1 : 0) || (a.tgl_war_diberi < b.tgl_war_diberi ? 1 : a.tgl_war_diberi > b.tgl_war_diberi ? -1 : 0) || b.id_warning - a.id_warning; });
    else rows.sort(function (a, b) { return (a.tgl_war_diberi < b.tgl_war_diberi ? 1 : a.tgl_war_diberi > b.tgl_war_diberi ? -1 : 0) || b.id_warning - a.id_warning; });
    return rows;
  }
  R['GET /webhook/warning-list'] = function (ctx, db) {
    var rows = ambilWarning(db);
    var email = {}, cetak = {};
    db.audit.forEach(function (x) {
      if ((x.action !== 'warning-email' && x.action !== 'warning-cetak') || x.ok !== 1 || !x.detail) return;
      var m = x.action === 'warning-email' ? email : cetak, idw = Number(x.detail.id_warning);
      var o = m[idw] || (m[idw] = { pada: '', kali: 0 });
      o.kali++;
      var p = String(x.ts).slice(0, 16);
      if (p > o.pada) o.pada = p;
    });
    rows.forEach(function (w) { w.email = email[w.id_warning] || null; w.cetak = cetak[w.id_warning] || null; });
    return { json: { hari_ini: hari(), sanksi: D.SANKSI.slice(), masa_bulan: salin(D.MASA_BULAN), pilihan_status: STATUS_WAR.slice(),
      pembina: daftarPembina(db).map(function (k) { return { id_ho: k.id_ho, nama: s(k.nama), jabatan: s(k.jabatan), status: s(k.status) }; }),
      terpotong: rows.length > 500, warning: rows.slice(0, 500) } };
  };
  R['GET /webhook/warning-angka'] = function (ctx, db) {
    var bolehNama = bolehFitur(ctx, 'warning'), dot = setDot(db);
    var berlaku = ambilWarning(db, function (w) { return !dot[w.id_ho]; }).filter(function (w) { return w.berlaku; });
    var orang = {}; berlaku.forEach(function (w) { orang[w.id_ho] = 1; });
    var kirim = db.audit.filter(function (x) { return x.action === 'warning-email' && x.ok === 1; }).sort(function (a, b) { return b.id - a.id; }).slice(0, 20);
    return { json: {
      hari_ini: hari(), karyawan_aktif: db.karyawan.filter(function (k) { return !dot[k.id_ho]; }).length,
      orang: Object.keys(orang).length, warning: berlaku.length,
      sanksi: D.SANKSI.map(function (x) {
        var o = {}; berlaku.filter(function (w) { return w.sanksi === x; }).forEach(function (w) { o[w.id_ho] = 1; });
        return { sanksi: x, orang: Object.keys(o).length };
      }),
      terkirim: kirim.map(function (x) {
        var d = x.detail || {}, k = x.id_ho ? D.karOf(db, x.id_ho) : null;
        return Object.assign({ id: x.id, pada: String(x.ts).slice(0, 16), sanksi: String(d.sanksi || ''), oleh: String(d.nama || x.actor || '') },
          bolehNama ? { karyawan: k ? s(k.nama) : '' } : {});
      })
    } };
  };
  R['GET /webhook/warning-karyawan'] = cariKaryawanAktif;
  var WAR_HILANG = { code: 404, json: { status: 'not_found', message: 'Warning ini sudah tidak ada (mungkin baru dihapus orang lain) — data dimuat ulang.' } };
  function bacaFormWar(b) {
    return { pelanggaran: teks(b.pelanggaran), sanksi: teks(b.sanksi), tgl_war_diberi: teks(b.tgl_war_diberi), pembina: teks(b.pembina),
      war_catatan: teks(b.war_catatan) || null, status: teks(b.status) || null };
  }
  function periksaWar(db, id, f, opsi) {
    opsi = opsi || {};
    var salah = [];
    if (!f.pelanggaran) salah.push('Pelanggaran wajib diisi');
    if (f.pelanggaran.length > 2000) salah.push('Pelanggaran maksimal 2000 karakter');
    if (D.SANKSI.indexOf(f.sanksi) < 0) salah.push('Sanksi harus salah satu dari: ' + D.SANKSI.join(', '));
    if (!f.tgl_war_diberi) { if (opsi.wajibTgl) salah.push('Tanggal diberi wajib diisi'); }
    else if (!D.isDate(f.tgl_war_diberi)) salah.push('Tanggal diberi tidak sah');
    if (!f.pembina) salah.push('Pembina wajib dipilih');
    else if (f.pembina === id) salah.push('Pembina tidak boleh karyawan yang diberi warning');
    else if (f.pembina !== opsi.pembinaLama && !daftarPembina(db).some(function (k) { return k.id_ho === f.pembina; })) {
      salah.push('Pembina "' + f.pembina + '" bukan karyawan aktif berstatus Staff / Sr.Staff');
    }
    if (f.war_catatan && f.war_catatan.length > 2000) salah.push('Catatan maksimal 2000 karakter');
    if (f.status && STATUS_WAR.indexOf(f.status) < 0) salah.push('Status harus kosong, ' + STATUS_WAR.join(' atau '));
    return salah;
  }
  R['POST /webhook/warning-tambah'] = function (ctx, db) {
    var b = ctx.body || {}, id = teks(b.id_ho), f = bacaFormWar(b);
    var salah = D.karOf(db, id) ? [] : ['ID HO "' + id + '" tidak ada di data karyawan'];
    salah = salah.concat(periksaWar(db, id, f));
    if (salah.length) {
      audit(db, { action: 'warning-tambah', ctx: ctx, id_ho: id || null, ok: false, detail: { sanksi: f.sanksi, pembina: f.pembina, tgl_war_diberi: f.tgl_war_diberi, errors: salah } });
      return tolak(salah);
    }
    var o = { id_warning: ++db.seq.warning, id_ho: id, pelanggaran: f.pelanggaran, sanksi: f.sanksi, tgl_war_diberi: f.tgl_war_diberi || hari(),
      pembina: f.pembina, war_catatan: f.war_catatan, status: f.status };
    db.warning.push(o);
    audit(db, { action: 'warning-tambah', ctx: ctx, id_ho: id, detail: { id_warning: o.id_warning, sanksi: f.sanksi, pembina: f.pembina, tgl_war_diberi: f.tgl_war_diberi || null, status: f.status } });
    return { json: { status: 'ok', message: 'Warning ' + f.sanksi + ' dicatat.', id_warning: o.id_warning } };
  };
  R['POST /webhook/warning-ubah'] = function (ctx, db) {
    var b = ctx.body || {}, idw = Number(b.id_warning);
    if (!Number.isInteger(idw) || idw <= 0) return tolak(['id_warning tidak sah']);
    var lama = db.warning.filter(function (w) { return w.id_warning === idw; })[0];
    if (!lama) return WAR_HILANG;
    var f = bacaFormWar(b);
    var salah = periksaWar(db, lama.id_ho, f, { wajibTgl: true, pembinaLama: lama.pembina });
    if (salah.length) { audit(db, { action: 'warning-ubah', ctx: ctx, id_ho: lama.id_ho, ok: false, detail: { id_warning: idw, errors: salah } }); return tolak(salah); }
    var LABEL = { pelanggaran: 'pelanggaran', sanksi: 'sanksi', tgl_war_diberi: 'tanggal diberi', pembina: 'pembina', war_catatan: 'catatan', status: 'status' };
    var beda = Object.keys(LABEL).filter(function (k) { return (lama[k] == null ? null : String(lama[k])) !== f[k]; });
    if (!beda.length) return { json: { status: 'ok', message: 'Tidak ada perubahan pada warning ini.' } };
    var dari = {}, jadi = {};
    beda.forEach(function (k) { dari[k] = lama[k]; jadi[k] = f[k]; });
    var statusLama = lama.status;
    Object.keys(LABEL).forEach(function (k) { lama[k] = f[k]; });
    audit(db, { action: 'warning-ubah', ctx: ctx, id_ho: lama.id_ho, detail: { id_warning: idw, dari: dari, jadi: jadi } });
    var ket = beda.map(function (k) { return k === 'status' ? 'status ' + (statusLama || '—') + ' → ' + (f.status || '—') : LABEL[k]; });
    return { json: { status: 'ok', message: 'Warning diubah: ' + ket.join(', ') + '.' } };
  };
  R['POST /webhook/warning-hapus'] = function (ctx, db) {
    var idw = Number((ctx.body || {}).id_warning);
    if (!Number.isInteger(idw) || idw <= 0) return tolak(['id_warning tidak sah']);
    var l = db.warning.filter(function (w) { return w.id_warning === idw; })[0];
    if (!l) return WAR_HILANG;
    db.warning = db.warning.filter(function (w) { return w !== l; });
    audit(db, { action: 'warning-hapus', ctx: ctx, id_ho: l.id_ho, detail: Object.assign({ id_warning: idw }, l) });
    return { json: { status: 'ok', message: 'Warning ' + l.sanksi + ' (' + l.tgl_war_diberi + ') dihapus.' } };
  };
  R['POST /webhook/warning-email'] = function (ctx, db) {
    var idw = Number((ctx.body || {}).id_warning);
    if (!Number.isInteger(idw) || idw <= 0) return tolak(['id_warning tidak sah']);
    var w = ambilWarning(db, function (x) { return x.id_warning === idw; })[0];
    if (!w) return WAR_HILANG;
    var nama = namaPengguna(db, ctx);
    audit(db, { action: 'warning-email', ctx: ctx, id_ho: w.id_ho, detail: { kepada: 'hrd@example.com', id_warning: idw, sanksi: w.sanksi, nama: nama } });
    return { json: { status: 'ok', message: 'Email warning ' + w.sanksi + ' untuk ' + w.nama + ' dikirim ke hrd@example.com — simulasi: mode demo tidak mengirim email sungguhan.' }, jeda: 1400 };
  };
  R['POST /webhook/warning-cetak'] = function (ctx, db) {
    var idw = Number((ctx.body || {}).id_warning);
    if (!Number.isInteger(idw) || idw <= 0) return tolak(['id_warning tidak sah']);
    var w = ambilWarning(db, function (x) { return x.id_warning === idw; })[0];
    if (!w) return WAR_HILANG;
    var nama = namaPengguna(db, ctx);
    var bytes = D.pdfWarning(w, { oleh: nama });
    audit(db, { action: 'warning-cetak', ctx: ctx, id_ho: w.id_ho, detail: { ukuran: bytes.length, id_warning: idw, sanksi: w.sanksi, nama: nama } });
    var berkas = (D.JENIS_FORM[w.sanksi] || w.sanksi) + ' ' + w.nama + ' (' + (w.id_site || w.id_ho) + ') ' + w.tgl_war_diberi + '.pdf';
    return { raw: bytes, type: 'application/pdf', filename: berkas, inline: true, jeda: 1600 };
  };

  /* ---------------- sistem ---------------- */
  R['GET /webhook/mbr-status'] = function (ctx, db) {
    var m = db.mbr;
    if (!m) return { code: 404, json: { status: 'not found', message: 'mbr_status.json belum ada.' } };
    var target = D.targetMbr(m.tgl);
    var js = { status: m.status, generatedAt: m.generatedAt, target: target, file: 'MBR_Mining_' + target + '.xlsx',
      resumeUrl: '/webhook-waiting/' + m.exec, kpi: m.kpi, periods: m.periods, shifts: m.shifts, locations: m.locations, email: m.email };
    if (m.sentAt) js.sentAt = m.sentAt;
    if (m.expiredAt) js.expiredAt = m.expiredAt;
    if (!bolehFitur(ctx, 'mbr')) delete js.resumeUrl;
    return { json: salin(js) };
  };
  R['GET /webhook/sistem-status'] = function (ctx, db) {
    var peringatan = [];
    var tambah = function (t, k, j, d) { peringatan.push({ tingkat: t, kode: k, judul: j, detail: d || '' }); };
    var terlewat = aflTerlewat(db);
    var kini = Date.now(), h = hari();
    function ringkas(kunci, label, jadwal) {
      var rows = db.exec.filter(function (e) { return e.wf === kunci; }).sort(function (a, b) { return b.id - a.id; });
      var akhir = rows[0] || null, sukses = rows.filter(function (e) { return e.status === 'success'; })[0];
      var beruntun = 0;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].status === 'waiting' || rows[i].status === 'running') continue;
        if (rows[i].status === 'error') beruntun++; else break;
      }
      var lewat = [];
      if (jadwal) {
        var j = Number(jadwal.slice(0, 2));
        var trig = {};
        rows.forEach(function (e) { if (e.mode === 'trigger') trig[D.ymd(new Date(Date.parse(e.mulai)))] = 1; });
        for (var x = 7; x >= 0; x--) {
          var hr = D.geser(h, -x);
          if (hr < D.geser(h, -9)) continue;
          if (hr === h && new Date(kini).getHours() * 60 + new Date(kini).getMinutes() < j * 60 + 20) continue;
          if (!trig[hr]) lewat.push(hr);
        }
      }
      return { kunci: kunci, label: label, ada: true, nama: label === 'MBR' ? 'MBR _system' : label, aktif: true, jadwal: jadwal || '',
        terakhir: akhir ? { id: akhir.id, status: akhir.status, mode: akhir.mode, mulai: akhir.mulai, selesai: akhir.selesai || '', error: akhir.error || '' } : null,
        sukses_terakhir: sukses ? (sukses.selesai || sukses.mulai) : '', error_beruntun: beruntun, google_putus: false, jadwal_terlewat: lewat };
    }
    var workflow = [ringkas('mbr', 'MBR', '09:00 WIB'), ringkas('afl', 'AFL', '08:00 WIB'), ringkas('impor', 'Import Roster', '')];
    workflow.forEach(function (w) {
      if (w.kunci === 'afl') w.jadwal_terlewat = w.jadwal_terlewat.filter(function (x) { return terlewat.hari.indexOf(x) >= 0; });
      if (w.jadwal_terlewat.length) {
        tambah('warn', 'jadwal-' + w.kunci + '-' + w.jadwal_terlewat[w.jadwal_terlewat.length - 1],
          'Jadwal ' + w.label + ' (' + w.jadwal + ') tidak jalan ' + w.jadwal_terlewat.length + ' kali',
          'Tanggal: ' + w.jadwal_terlewat.join(', ') + ' — kemungkinan server mati pada jam jadwal.');
      }
    });
    if (terlewat.tanggal.length) {
      tambah('warn', 'afl-susulan-' + terlewat.tanggal[terlewat.tanggal.length - 1], 'AFL: ' + terlewat.tanggal.length + ' tanggal cuti belum diproses',
        'Cuti mulai ' + terlewat.tanggal[0] + (terlewat.tanggal.length > 1 ? ' s/d ' + terlewat.tanggal[terlewat.tanggal.length - 1] : '') +
        ' — buka halaman AFL, tombol "Proses susulan".');
    }
    var bk = D.pada(h, 2, 0, 14);
    if (bk > kini - 5 * 60000) bk = D.pada(D.geser(h, -1), 2, 0, 14);
    var backup = { ada: true, ok_terakhir: true, pesan: 'OK: db_mining + n8n_data + Dasbord', sukses_terakhir: D.iso(bk),
      umur_jam: Math.round((kini - bk) / 360000) / 10, ukuran: 57409536, salinan: 'ok: /mnt/cadangan/magi' };
    return { json: { waktu: D.iso(kini), peringatan: peringatan, workflow: workflow,
      afl_susulan: { tanggal: terlewat.tanggal, hari: terlewat.hari }, backup: backup } };
  };

  /* ---------------- proxy n8n (MBR, Import Roster, approve) ---------------- */
  var PROXY = {};
  PROXY['GET /webhook/mbr-run'] = function (ctx, db) {
    var m = db.mbr, kini = Date.now();
    db.seq.exec += 1;
    m.execBaru = ++db.seq.exec;
    m.berikutPada = D.iso(kini + 4500);
    db.exec.push({ id: m.execBaru, wf: 'mbr', status: 'running', mode: 'webhook', mulai: D.iso(kini), selesai: null });
    return { json: { message: 'Workflow was started' } };
  };
  PROXY['WAIT'] = function (ctx, db, id) {
    var m = db.mbr;
    var e = db.exec.filter(function (x) { return x.id === id; })[0];
    if (!e || e.wf !== 'mbr') return { code: 404, json: { status: 'not found' } };
    if (!m || m.exec !== id || m.status !== 'pending') {
      return { code: 409, json: { code: 409, message: 'The execution "' + id + '" is not waiting (status: ' + e.status + ').' } };
    }
    if (String(ctx.query.approved || '') !== '1') {
      return { code: 200, json: { message: 'Resumed tanpa penanda approved — node "Disetujui?" mengambil cabang FALSE (tidak mengirim).' } };
    }
    m.kirimPada = D.iso(Date.now() + 3500);
    return { json: { message: 'Workflow was resumed' } };
  };
  PROXY['POST /webhook/roster-import'] = function (ctx, db) {
    return D.bacaBerkasRoster(ctx.form).then(function (baris) {
      // node "Unpivot Matriks" + "Validasi" (API/Import_Roster.json)
      var SHIFT_MAP = { D: 'DS', N: 'NS', O: 'CS' };
      var src = [];
      baris.forEach(function (j) {
        var keys = Object.keys(j);
        if (!keys.length) return;
        var idKey = keys.filter(function (k) { return /id[_ ]?ho|^nik$|^id$/i.test(String(k).trim()); })[0] || keys[0];
        var id = String(j[idKey] == null ? '' : j[idKey]).trim();
        if (!id) return;
        keys.forEach(function (k) {
          if (k === idKey) return;
          var tgl = keTanggal(k);
          if (!tgl) return;
          var shift = String(j[k] == null ? '' : j[k]).trim();
          if (!shift) return;
          shift = SHIFT_MAP[shift.toUpperCase()] || shift;
          src.push({ id_ho: id, tgl: tgl, shift: shift });
        });
      });
      var valid = validId(db), errors = [], seen = {}, clean = [];
      src.forEach(function (r, idx) {
        var bad = [];
        if (!r.id_ho) bad.push('id_ho kosong');
        else if (r.id_ho.length > 20) bad.push('id_ho > 20 karakter');
        else if (!valid[r.id_ho]) bad.push('id_ho "' + r.id_ho + '" tidak terdaftar di karyawan');
        if (!r.tgl) bad.push('tgl kosong'); else if (!D.isDate(r.tgl)) bad.push('tgl "' + r.tgl + '" bukan DATE');
        if (!r.shift) bad.push('shift kosong');
        else if (D.ROSTER_SHIFTS.indexOf(r.shift.toUpperCase()) < 0) bad.push('kode shift "' + r.shift + '" tidak dikenal (sah: ' + D.ROSTER_SHIFTS.join('/') + ')');
        if (bad.length) { if (errors.length < 50) errors.push({ baris: idx + 1, id_ho: r.id_ho, tgl: r.tgl, shift: r.shift, masalah: bad }); return; }
        var key = r.id_ho + '|' + r.tgl;
        if (!seen[key]) { seen[key] = 1; clean.push({ id_ho: r.id_ho, tgl: r.tgl, shift: r.shift.toUpperCase() }); }
      });
      var skipped = src.length - clean.length;
      var kini = Date.now();
      db.seq.exec += 1;
      db.exec.push({ id: ++db.seq.exec, wf: 'impor', status: 'success', mode: 'webhook', mulai: D.iso(kini - 2500), selesai: D.iso(kini) });
      if (!clean.length) {
        return { code: 422, json: { status: 'invalid', message: 'Tidak ada baris valid untuk diimpor' + (src.length ? ' dari ' + src.length + ' baris' : '') + '.',
          skipped: skipped, totalRows: src.length, errors: errors } };
      }
      clean.forEach(function (r) { D.rSet(db, r.id_ho, r.tgl, r.shift); });
      var dates = clean.map(function (r) { return r.tgl; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      var orang = clean.map(function (r) { return r.id_ho; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).length;
      return { json: { status: 'ok', imported: clean.length, skipped: skipped, dates: dates,
        message: clean.length + ' baris diimpor untuk ' + dates.length + ' tanggal (' + orang + ' karyawan); roster lain tidak terhapus' + (skipped ? '; ' + skipped + ' baris dilewati (invalid)' : ''),
        errors: errors }, jeda: 1500 };
    });
  };
  function keTanggal(v) {
    if (v == null || v === '') return null;
    var t = String(v).trim(), m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    if (/^\d+(\.\d+)?$/.test(t)) {
      var n = parseFloat(t);
      if (n >= 20000 && n <= 90000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
      return null;
    }
    var d2 = new Date(t);
    if (!isNaN(d2.getTime()) && /\d{4}/.test(t) && /[-\/A-Za-z]/.test(t)) return d2.toISOString().slice(0, 10);
    return null;
  }
  /* berkas unggahan -> baris objek {judul kolom: isi}; .csv dibaca langsung,
     .xlsx/.xls lewat SheetJS (dimuat saat dibutuhkan) */
  D.bacaBerkasRoster = function (form) {
    var f = form && form.get ? form.get('file') : null;
    if (!f || typeof f.text !== 'function') return Promise.resolve([]);
    if (/\.csv$/i.test(f.name || '')) {
      return f.text().then(function (txt) {
        var lines = txt.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) return [];
        var sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
        var head = lines[0].split(sep).map(function (x) { return x.replace(/^"|"$/g, '').trim(); });
        return lines.slice(1).map(function (l) {
          var c = l.split(sep), o = {};
          head.forEach(function (hd, i) { o[hd] = (c[i] || '').replace(/^"|"$/g, '').trim(); });
          return o;
        });
      });
    }
    return muatSheetJs().then(function (XLSX) {
      return f.arrayBuffer().then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        return XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
      });
    });
  };
  var _xlsx = null;
  function muatSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsx) return _xlsx;
    _xlsx = new Promise(function (ok, gagal) {
      var sc = document.createElement('script');
      sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      sc.onload = function () { window.XLSX ? ok(window.XLSX) : gagal(new Error('SheetJS tidak termuat')); };
      sc.onerror = function () { _xlsx = null; gagal(new Error('pembaca XLSX tidak bisa dimuat (offline?) — unggah sebagai .csv')); };
      document.head.appendChild(sc);
    });
    return _xlsx;
  }

  /* ==========================================================
     DISPATCHER — urutan pemeriksaan = service/server.js
     ========================================================== */
  var HAK_RUTE = {
    'GET /webhook/roster-list': ['edit-roster'], 'POST /webhook/roster-update': ['edit-roster'], 'POST /webhook/roster-delete': ['edit-roster'],
    'GET /webhook/karyawan-list': ['karyawan', 'absen', 'edit-roster'], 'POST /webhook/karyawan-update': ['karyawan'],
    'POST /webhook/absen-save': ['absen'],
    'GET /webhook/simper-list': ['simper'], 'GET /webhook/simper-ringkasan': ['simper'], 'GET /webhook/unit-list': ['simper'],
    'POST /webhook/simper-simpan': ['simper'], 'POST /webhook/simper-hapus': ['simper'], 'POST /webhook/skill-tambah': ['simper'],
    'POST /webhook/skill-ubah': ['simper'], 'POST /webhook/skill-hapus': ['simper'],
    'GET /webhook/apd-list': ['apd'], 'GET /webhook/apd-data': ['apd'], 'POST /webhook/apd-ceklis': ['apd'], 'GET /webhook/apd-karyawan': ['apd'],
    'POST /webhook/apd-tambah': ['apd'], 'POST /webhook/apd-hapus': ['apd'], 'POST /webhook/apd-master-tambah': ['apd'],
    'POST /webhook/apd-master-hapus': ['apd'], 'POST /webhook/apd-cetak': ['apd'],
    'GET /webhook/warning-list': ['warning'], 'GET /webhook/warning-karyawan': ['warning'], 'POST /webhook/warning-tambah': ['warning'],
    'POST /webhook/warning-ubah': ['warning'], 'POST /webhook/warning-hapus': ['warning'], 'POST /webhook/warning-email': ['warning'],
    'POST /webhook/warning-cetak': ['warning']
  };
  var PUBLIC = { 'POST /webhook/login': 1, 'POST /webhook/logout': 1, 'GET /healthz': 1 };
  function bolehHak(sess, daftar) {
    if (!daftar) return true;
    if (!sess) return false;
    if (sess.peran === 'Administrator') return true;
    var hak = Array.isArray(sess.hak) ? sess.hak : [];
    return daftar.some(function (h) { return hak.indexOf(h) >= 0; });
  }
  function aturanProxy(method, path) {
    if (method === 'GET' && path === '/healthz') return { hak: null, fn: function () { return { json: { status: 'ok' } }; } };
    if (method === 'GET' && path === '/webhook/mbr-run') return { hak: ['mbr'], fn: PROXY['GET /webhook/mbr-run'] };
    if (method === 'POST' && path === '/webhook/roster-import') return { hak: ['import-roster'], fn: PROXY['POST /webhook/roster-import'] };
    var m = /^\/webhook-waiting\/(\d+)$/.exec(path);
    if (m && (method === 'GET' || method === 'POST')) {
      var id = Number(m[1]);
      return { hak: ['mbr'], fn: function (ctx, db) { return PROXY.WAIT(ctx, db, id); } };
    }
    return null;
  }
  D.ROUTES = R;

  function proses(method, path, query, body) {
    var key = method + ' ' + path;
    var db = D.muat();
    var berubah = tick(db);
    var sess = bacaSesi();
    var hasil;
    if (!PUBLIC[key] && !sess) hasil = { code: 401, json: { ok: false, status: 'unauthorized', message: 'Sesi tidak valid — silakan login.' } };
    else if (sess && sess.g && key !== 'POST /webhook/ganti-password' && key !== 'POST /webhook/logout' && !PUBLIC[key]) {
      hasil = { code: 403, json: { ok: false, status: 'ganti_password', message: 'Password akun ini lemah — ganti dulu di halaman login.' } };
    } else {
      var ctx = { query: query || {}, ip: IP, actor: sess ? String(sess.u).slice(0, 100) : 'anon', peran: sess ? sess.peran : null,
        hak: sess ? sess.hak : null, body: null, form: null };
      var handler = R[key];
      if (!handler) {
        var at = aturanProxy(method, path);
        if (!at) hasil = { code: 404, json: { status: 'not found' } };
        else if (!bolehHak(sess, at.hak)) hasil = { code: 403, json: { status: 'forbidden', message: 'Akun ini tidak berhak memakai fitur tersebut.' } };
        else handler = at.fn;
      } else if (!bolehHak(sess, HAK_RUTE[key])) {
        hasil = { code: 403, json: { status: 'forbidden', message: 'Akun ini tidak berhak memakai fitur tersebut.' } };
        handler = null;
      }
      if (!hasil && handler) {
        if (method === 'POST') {
          if (body && typeof FormData !== 'undefined' && body instanceof FormData) { ctx.form = body; ctx.body = {}; }
          else if (typeof body === 'string' && body.length) {
            try { ctx.body = JSON.parse(body); }
            catch (e) { hasil = { code: 400, json: { status: 'error', message: 'body bukan JSON yang sah' } }; }
          } else ctx.body = {};
        }
        if (!hasil) {
          try { hasil = handler(ctx, db); }
          catch (e) {
            console.error('[demo] ' + key, e);
            hasil = { code: 500, json: { status: 'error', message: 'Kesalahan server (kode demo) — ' + (e && e.message ? e.message : e) } };
          }
        }
      }
    }
    return Promise.resolve(hasil).then(function (h) {
      if (berubah || method !== 'GET' || key === 'GET /webhook/mbr-run' || /^GET \/webhook-waiting\//.test(key)) D.simpan();
      return h;
    }, function (e) {
      return { code: 500, json: { status: 'error', message: String(e && e.message ? e.message : e) } };
    });
  }

  function keResponse(r) {
    var code = r.code || 200;
    if (r.raw) {
      var aman = String(r.filename || 'berkas').replace(/[^\w .()+-]/g, '_');
      var h = Object.assign({}, r.headers || {}, {
        'Content-Type': r.type || 'application/octet-stream',
        'Content-Disposition': (r.inline ? 'inline' : 'attachment') + '; filename="' + aman + '"; filename*=UTF-8\'\'' + encodeURIComponent(r.filename || aman),
        'Cache-Control': 'no-store'
      });
      return new Response(new Blob([r.raw], { type: r.type }), { status: code, headers: h });
    }
    return new Response(JSON.stringify(r.json), { status: code, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  /* panggil "server" — dipakai shim fetch & tautan unduhan */
  D.panggil = function (method, path, query, body) {
    var mulai = Date.now();
    return proses(method, path, query, body).then(function (h) {
      var jeda = (h && h.jeda) || (method === 'GET' ? 90 + Math.random() * 160 : 220 + Math.random() * 260);
      var sisa = Math.max(0, jeda - (Date.now() - mulai));
      return new Promise(function (ok) { setTimeout(function () { ok(h); }, sisa); });
    });
  };
  D.panggilSinkron = function (method, path, query) {
    var db = D.muat(); tick(db);
    var sess = bacaSesi();
    if (!sess) return { code: 401, json: { message: 'Sesi tidak valid — silakan login.' } };
    var ctx = { query: query || {}, ip: IP, actor: String(sess.u), peran: sess.peran, hak: sess.hak, body: null };
    var fn = R[method + ' ' + path];
    return fn ? fn(ctx, db) : { code: 404, json: { status: 'not found' } };
  };

  function cocok(u) {
    if (u.origin !== location.origin) return null;
    var p = u.pathname, m;
    if ((m = /\/(webhook-waiting\/\d+)$/.exec(p))) return '/' + m[1];
    if ((m = /\/(webhook\/[a-z0-9-]+)$/.exec(p))) return '/' + m[1];
    if (/\/healthz$/.test(p)) return '/healthz';
    return null;
  }
  function queryDari(u) { var o = {}; u.searchParams.forEach(function (v, k) { o[k] = v; }); return o; }

  /* ---------------- shim fetch & sendBeacon ---------------- */
  var asli = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var u;
    try { u = new URL(url, location.href); } catch (e) { return asli(input, init); }
    var path = cocok(u);
    if (!path) return asli ? asli(input, init) : Promise.reject(new Error('fetch tidak tersedia'));
    init = init || {};
    var method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    return D.panggil(method, path, queryDari(u), init.body).then(keResponse);
  };
  if (navigator.sendBeacon) {
    var beaconAsli = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      var u;
      try { u = new URL(url, location.href); } catch (e) { return beaconAsli(url, data); }
      var path = cocok(u);
      if (!path) return beaconAsli(url, data);
      // sinkron: halaman langsung pindah sesudah beacon
      if (path === '/webhook/logout') {
        try { var db = D.muat(); R['POST /webhook/logout']({ actor: (bacaSesi() || {}).u || 'anon' }, db); D.simpan(); } catch (e) {}
        return true;
      }
      D.panggil('POST', path, queryDari(u), typeof data === 'string' ? data : '');
      return true;
    };
  }

  /* ---------------- tautan unduhan PDF (afl-pdf memakai <a href>, bukan fetch) ---------------- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (er) { return; }
    var path = cocok(u);
    if (!path) return;
    e.preventDefault();
    var r = D.panggilSinkron('GET', path, queryDari(u));
    if (!r.raw) { alert((r.json && r.json.message) || ('HTTP ' + (r.code || 500))); return; }
    var url = URL.createObjectURL(new Blob([r.raw], { type: r.type }));
    if (r.inline || a.target === '_blank') { window.open(url, '_blank', 'noopener'); return; }
    var dl = document.createElement('a');
    dl.href = url; dl.download = r.filename || 'berkas.pdf';
    document.body.appendChild(dl); dl.click(); dl.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }, true);
})();

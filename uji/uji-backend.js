// Uji backend tiruan MAGI//SYSTEM (demo/_demo/*.js) tanpa browser.
// Menjalankan setiap rute magi-api + alur n8n tiruan (MBR, AFL, import roster, PDF)
// dan memeriksa validasi, kode HTTP, hak akses, serta jejak audit.
//   node uji/uji-backend.js        (Node 18+, tanpa npm install)
// PDF hasil uji disimpan di folder sementara sistem (magi-demo-uji).
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const os = require('os');
const File = globalThis.File || require('buffer').File;
globalThis.File = File;
const DEMO = path.join(__dirname, '..', 'demo', '_demo');

function buatKonteks(halaman) {
  const store = {};
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  const ss = { _s: {}, getItem(k) { return k in this._s ? this._s[k] : null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
  const href = 'http://localhost:8080/demo/' + (halaman || 'index.html');
  const loc = new URL(href);
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, Blob, Response, FormData, File,
    JSON, Math, Date, Promise, Uint8Array, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, isNaN, isFinite,
    parseInt, parseFloat, encodeURIComponent, decodeURIComponent, unescape, escape,
    localStorage: ls, sessionStorage: ss,
    location: { href, origin: loc.origin, pathname: loc.pathname, search: loc.search, protocol: loc.protocol, hostname: loc.hostname, port: loc.port },
    navigator: {},
    document: { addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} }, querySelector: () => null, getElementById: () => null },
    fetch: () => Promise.reject(new Error('jaringan tidak dipakai dalam uji')),
    addEventListener() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['util.js', 'seed.js', 'pdf.js', 'api.js']) {
    vm.runInContext(fs.readFileSync(path.join(DEMO, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

async function panggil(ctx, method, url, body) {
  const init = { method };
  if (body !== undefined) init.body = (body instanceof FormData) ? body : JSON.stringify(body);
  const r = await ctx.fetch(url, init);
  const ct = r.headers.get('Content-Type') || '';
  let isi;
  if (/json/.test(ct)) isi = await r.json();
  else isi = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ct, headers: r.headers, isi };
}


const OUT = path.join(os.tmpdir(), 'magi-demo-uji');
fs.mkdirSync(OUT, { recursive: true });
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
let gagal = 0, lulus = 0;
function cek(kond, pesan, data) {
  if (kond) { lulus++; console.log('  ✓ ' + pesan); }
  else { gagal++; console.log('  ✗ ' + pesan + (data !== undefined ? ' → ' + JSON.stringify(data).slice(0, 400) : '')); }
}

(async () => {
  const t0 = Date.now();
  const w = buatKonteks('index.html');
  const D = w.MAGI_DEMO;
  const P = (m, u, b) => panggil(w, m, u, b);

  console.log('— gerbang sesi');
  let r = await P('GET', '/webhook/roster-summary');
  cek(r.status === 401, 'tanpa sesi -> 401', r.status);
  r = await P('POST', '/webhook/login', { username: 'andhika', password: 'salah-sekali' });
  cek(r.status === 401 && r.isi.ok === false, 'password salah -> 401', r.isi);
  r = await P('POST', '/webhook/login', { username: 'andhika', password: 'MagiAdmin2026' });
  cek(r.status === 200 && r.isi.ok && r.isi.peran === 'Administrator' && r.isi.hak.length === 11 && r.isi.lemah === false, 'login admin', r.isi);
  const db = D.muat();
  console.log('  seed: ' + db.karyawan.length + ' karyawan, ' + Object.keys(db.roster).length + ' roster, ' + db.absen.length + ' absen, ' +
    db.afl.length + ' afl, ' + db.kapd.length + ' apd, ' + db.warning.length + ' warning, ' + db.exec.length + ' exec; ukuran ' +
    Math.round(JSON.stringify(db).length / 1024) + ' KB; dibuat dalam ' + (Date.now() - t0) + ' ms');

  console.log('— dashboard utama');
  r = await P('GET', '/webhook/roster-summary?t=1');
  cek(r.status === 200 && r.isi.total > 200 && r.isi.shifts.length >= 3, 'roster-summary besok total=' + r.isi.total + ' shifts=' + r.isi.shifts.map((s) => s.shift + ':' + s.jumlah).join(','));
  cek(r.isi.kelompok.length === 2, 'kelompok Staff/Non Staff', r.isi.kelompok.map((k) => k.kategori));
  const totalBesok = r.isi.total;
  r = await P('GET', '/webhook/mbr-status?t=1');
  cek(r.status === 200 && r.isi.status === 'pending' && r.isi.resumeUrl, 'mbr-status pending', r.isi.status);
  cek(r.isi.kpi.emp === totalBesok, 'MBR emp == roster total (tanpa selisih) ' + r.isi.kpi.emp + ' vs ' + totalBesok);
  console.log('    target=' + r.isi.target + ' meal=' + r.isi.kpi.meal + ' loc=' + r.isi.kpi.activeLoc + ' sc=' + r.isi.kpi.sc);
  const mbr1 = r.isi;
  r = await P('GET', '/webhook/sistem-status?t=1');
  cek(r.status === 200 && r.isi.workflow.length === 3, 'sistem-status', r.isi);
  console.log('    peringatan: ' + r.isi.peringatan.map((p) => p.judul).join(' | '));
  cek(r.isi.peringatan.some((p) => /AFL/.test(p.judul)), 'ada peringatan AFL (jadwal terlewat / susulan)');
  const d0 = D.hariIni();
  const minggu = D.geser(d0, -6);
  r = await P('GET', '/webhook/absen-list?from=' + minggu + '&to=' + d0);
  cek(r.status === 200 && Array.isArray(r.isi) && r.isi.length > 5, 'absen-list 7 hari: ' + r.isi.length + ' baris');
  r = await P('GET', '/webhook/absen-rate?from=' + minggu + '&to=' + d0);
  cek(r.status === 200 && r.isi.shifts.length === 3 && r.isi.tanggal.length === 7, 'absen-rate', r.isi.tanggal);
  console.log('    DS roster=' + r.isi.shifts[0].roster + ' catatan=' + r.isi.shifts[0].catatan + ' · NS roster=' + r.isi.shifts[1].roster);
  r = await P('GET', '/webhook/afl-rekap?t=1');
  cek(r.status === 200 && r.isi.bulan.length >= 3, 'afl-rekap bulan=' + r.isi.bulan.map((b) => b.bulan + ':' + b.total).join(','));
  r = await P('GET', '/webhook/simper-angka');
  cek(r.status === 200 && r.isi.total.punya_simper > 50, 'simper-angka', r.isi.total);
  console.log('    ' + JSON.stringify(r.isi.total));
  r = await P('GET', '/webhook/warning-angka');
  cek(r.status === 200 && r.isi.orang > 3, 'warning-angka orang=' + r.isi.orang + ' warning=' + r.isi.warning + ' terkirim=' + r.isi.terkirim.length);
  r = await P('GET', '/webhook/todo-list');
  cek(r.status === 200 && r.isi.items.length >= 10 && r.isi.pengguna.length === 4, 'todo-list', r.isi.ringkas);
  r = await P('GET', '/healthz');
  cek(r.status === 200, 'healthz');

  console.log('— roster');
  r = await P('GET', '/webhook/kode-roster');
  cek(r.isi.kode.length === 8, 'kode-roster');
  r = await P('GET', '/webhook/roster-list?q=&from=' + d0 + '&to=' + D.geser(d0, 2));
  cek(r.status === 200 && r.isi.length > 600, 'roster-list 3 hari: ' + r.isi.length);
  const satu = r.isi[0];
  const shiftBaru = satu.jadwal === 'DS' ? 'NS' : 'DS';
  r = await P('POST', '/webhook/roster-update', { changes: [{ id: satu.id, tgl: satu.tgl, jadwal: shiftBaru }, { id: 'XYZ999', tgl: d0, jadwal: 'DS' }] });
  cek(r.status === 200 && r.isi.updated === 1 && r.isi.skipped === 1, 'roster-update 1 ok 1 ditolak', r.isi);
  cek(D.rGet(D.muat(), satu.id, satu.tgl) === shiftBaru, 'perubahan roster tersimpan');
  r = await P('POST', '/webhook/roster-update', { changes: [{ id: satu.id, tgl: '2026-02-31', jadwal: 'XX' }] });
  cek(r.status === 422 && r.isi.status === 'invalid', 'roster-update semua invalid -> 422');
  r = await P('GET', '/webhook/roster-list?q=' + satu.id + '&from=' + D.geser(d0, 60) + '&to=9999-12-31');
  const nAkan = r.isi.length;
  r = await P('POST', '/webhook/roster-delete', { id_ho: satu.id, tgl: D.geser(d0, 60) });
  cek(r.status === 200 && r.isi.deleted === nAkan && nAkan > 0, 'roster-delete ' + r.isi.deleted + ' == pratinjau ' + nAkan, r.isi);

  console.log('— karyawan');
  r = await P('GET', '/webhook/karyawan-list?q=');
  cek(r.status === 200 && r.isi.length === 246 && Array.isArray(r.isi[0].simper), 'karyawan-list penuh: ' + r.isi.length);
  const kw = r.isi.find((k) => k.warning.length && k.simper.length) || r.isi[3];
  console.log('    contoh: ' + kw.nama + ' · ' + kw.jabatan + ' · mess=' + kw.mess + ' · simper=' + kw.simper.length + ' skill=' + kw.skill.length + ' warning=' + kw.warning.length);
  r = await P('POST', '/webhook/karyawan-update', { id_ho: kw.id_ho, changes: { jabatan: 'Operator Dump Truck Senior', kamar_mess: 'B-07', jam_kerja: 'abc', hacker: 1 } });
  cek(r.status === 200 && r.isi.fields === 2 && r.isi.errors.length === 2, 'karyawan-update 2 field + 2 ditolak', r.isi);

  console.log('— absen');
  r = await P('POST', '/webhook/absen-save', { rows: [{ id_ho: kw.id_ho, tgl: d0, kode: 'SK', jam: '4,5', surat: '', catatan: 'uji' }, { id_ho: kw.id_ho, tgl: d0, kode: 'ZZ' }] });
  cek(r.status === 200 && r.isi.saved === 1 && r.isi.skipped === 1, 'absen-save', r.isi);
  r = await P('GET', '/webhook/absen-list?q=' + encodeURIComponent(kw.nama) + '&from=' + d0 + '&to=' + d0);
  cek(r.isi.length === 1 && r.isi[0].jam === '4.5', 'absen tersimpan jam 4.5', r.isi);

  console.log('— akses');
  r = await P('GET', '/webhook/akses-list');
  cek(r.status === 200 && r.isi.dashboard.length === 5 && r.isi.layanan.length === 3 && r.isi.fitur.length === 11, 'akses-list');
  r = await P('POST', '/webhook/akses-create', { username: 'tamu', password: 'admin123', nama: 'Tamu', peran: 'Operator', hak: ['todo'] });
  cek(r.status === 422, 'akses-create password umum ditolak', r.isi);
  r = await P('POST', '/webhook/akses-create', { username: 'tamu.uji', password: 'TamuUji2026!', nama: 'Tamu Uji', peran: 'Operator', hak: ['todo', 'absen', 'ngawur'] });
  cek(r.status === 200 && r.isi.user.hak.join() === 'absen,todo', 'akses-create', r.isi);
  r = await P('GET', '/webhook/akses-list');
  const tamu = r.isi.dashboard.find((u) => u.username === 'tamu.uji');
  r = await P('POST', '/webhook/akses-update', { id: tamu.id, nama: 'Tamu Uji 2', hak: ['todo'] });
  cek(r.status === 200 && r.isi.perubahan.includes('hak'), 'akses-update', r.isi);
  r = await P('POST', '/webhook/akses-delete', { id: 1 });
  cek(r.status === 400, 'tidak bisa hapus diri sendiri', r.isi);
  r = await P('POST', '/webhook/akses-delete', { id: tamu.id });
  cek(r.status === 200, 'akses-delete');

  console.log('— to do');
  r = await P('POST', '/webhook/todo-create', { pekerjaan: 'Uji tugas', catatan: 'c', dikerjakan_oleh: 'siti', tenggat: D.geser(d0, 3) });
  cek(r.status === 200 && r.isi.item.dikerjakan_nama === 'Siti Rahmawati', 'todo-create', r.isi);
  const idT = r.isi.item.id;
  r = await P('POST', '/webhook/todo-create', { pekerjaan: 'x', tenggat: D.geser(d0, -3) });
  cek(r.status === 422, 'todo tenggat lampau ditolak');
  r = await P('POST', '/webhook/todo-update', { id: idT, dikerjakan_oleh: 'dewi' });
  cek(r.status === 200 && /Dewi/.test(r.isi.message), 'todo-update serahkan', r.isi.message);
  r = await P('POST', '/webhook/todo-toggle', { id: idT, selesai: true });
  cek(r.status === 200 && r.isi.item.selesai && r.isi.item.selesai_pada.length === 19, 'todo-toggle', r.isi.item);
  r = await P('POST', '/webhook/todo-delete', { id: idT });
  cek(r.status === 200, 'todo-delete');

  console.log('— SIMPER');
  r = await P('GET', '/webhook/simper-list?q=xyz000');
  cek(r.status === 200 && r.isi.karyawan.length === 50 && r.isi.terpotong, 'simper-list sebagian terpotong 50');
  r = await P('GET', '/webhook/simper-ringkasan');
  cek(r.status === 200 && r.isi.exp.length > 3 && r.isi.unit.length > 20, 'simper-ringkasan exp=' + r.isi.exp.length + ' catatan=' + r.isi.catatan.length);
  r = await P('GET', '/webhook/unit-list');
  const unitId = r.isi.unit[0].id_unit;
  const tanpa = D.muat().karyawan.find((k) => !D.muat().simper.some((s) => s.id_ho === k.id_ho));
  r = await P('POST', '/webhook/simper-simpan', { mode: 'tambah', id_ho: tanpa.id_ho, operator: 'DT', access: 'Pit Access', class: 'BII Umum', no_simpol: 'SMP-1', exp: D.geser(d0, 100), catatan: '' });
  cek(r.status === 200, 'simper tambah', r.isi);
  r = await P('POST', '/webhook/simper-simpan', { mode: 'tambah', id_ho: tanpa.id_ho, operator: 'DT' });
  cek(r.status === 409, 'simper tambah dobel -> 409');
  r = await P('POST', '/webhook/simper-simpan', { mode: 'ubah', id_ho: tanpa.id_ho, operator: 'DT', access: 'Semua', exp: '' });
  cek(r.status === 422, 'access tidak sah -> 422');
  r = await P('POST', '/webhook/skill-tambah', { id_ho: tanpa.id_ho, skill: unitId, status: 'Training' });
  cek(r.status === 200, 'skill-tambah', r.isi);
  r = await P('GET', '/webhook/simper-list?q=' + tanpa.id_ho);
  cek(r.isi.karyawan.length === 1 && r.isi.karyawan[0].skill.length === 1 && r.isi.karyawan[0].simper.sisa_hari === 100, 'simper-list persis', r.isi.karyawan[0]);
  const sk = r.isi.karyawan[0].skill[0];
  r = await P('POST', '/webhook/skill-ubah', { id_skill: sk.id_skill, id_ho: tanpa.id_ho, status: 'Full', tgl_ditambah: d0 });
  cek(r.status === 200 && /Training → Full/.test(r.isi.message), 'skill-ubah', r.isi.message);
  r = await P('POST', '/webhook/skill-hapus', { id_skill: sk.id_skill, id_ho: tanpa.id_ho });
  cek(r.status === 200, 'skill-hapus');
  r = await P('POST', '/webhook/simper-hapus', { id_ho: tanpa.id_ho });
  cek(r.status === 200, 'simper-hapus');

  console.log('— APD');
  r = await P('GET', '/webhook/apd-list');
  cek(r.status === 200 && r.isi.apd.length === 16 && r.isi.antrean.length >= 4 && r.isi.riwayat.length >= 1, 'apd-list antrean=' + r.isi.antrean.length + ' riwayat=' + r.isi.riwayat.length);
  r = await P('GET', '/webhook/apd-data?q=');
  cek(r.status === 200 && r.isi.data.length > 300, 'apd-data warna=' + JSON.stringify(r.isi.warna) + ' total=' + r.isi.total);
  r = await P('GET', '/webhook/apd-karyawan?q=' + encodeURIComponent(kw.nama.split(' ')[0]));
  cek(r.status === 200 && r.isi.karyawan.length >= 1, 'apd-karyawan');
  r = await P('POST', '/webhook/apd-tambah', { id_ho: kw.id_ho, apd: [1, 6] });
  cek(r.status === 200 && r.isi.id_kar_apd.length === 2, 'apd-tambah', r.isi);
  const idKar = r.isi.id_kar_apd;
  r = await P('POST', '/webhook/apd-tambah', { id_ho: kw.id_ho, apd: [1] });
  cek(r.status === 409, 'apd-tambah dobel -> 409');
  r = await P('POST', '/webhook/apd-cetak', { pilih: idKar });
  cek(r.status === 200 && /pdf/.test(r.ct) && r.headers.get('X-Magi-Diajukan') === '2', 'apd-cetak PDF ' + (r.isi.length / 1024).toFixed(1) + ' KB');
  fs.writeFileSync(OUT + '/apd.pdf', r.isi);
  r = await P('POST', '/webhook/apd-ceklis', { id_kar_apd: idKar[0], warehouse: true });
  cek(r.status === 422, 'ceklis warehouse sebelum safety ditolak', r.isi);
  r = await P('POST', '/webhook/apd-ceklis', { id_kar_apd: idKar[0], safety: true });
  r = await P('POST', '/webhook/apd-ceklis', { id_kar_apd: idKar[0], warehouse: true });
  r = await P('POST', '/webhook/apd-ceklis', { id_kar_apd: idKar[0], tgl_diambil: d0 });
  cek(r.status === 200 && r.isi.baris.status === 'diambil' && r.isi.baris.warna === 'hijau' && r.isi.baris.tgl_exp, 'ceklis lengkap -> hijau, exp ' + r.isi.baris.tgl_exp, r.isi);
  r = await P('POST', '/webhook/apd-master-tambah', { nama_apd: 'Face Shield', tipe_apd: '' });
  cek(r.status === 200, 'apd-master-tambah');
  r = await P('POST', '/webhook/apd-master-hapus', { id_apd: r.isi.id_apd });
  cek(r.status === 200, 'apd-master-hapus');
  r = await P('POST', '/webhook/apd-master-hapus', { id_apd: 1 });
  cek(r.status === 409, 'apd master dipakai -> 409');
  r = await P('GET', '/webhook/apd-list');
  const hapusAntre = r.isi.antrean[0];
  r = await P('POST', '/webhook/apd-hapus', { id_kar_apd: hapusAntre.id_kar_apd });
  cek(r.status === 200, 'apd-hapus antrean');

  console.log('— Warning');
  r = await P('GET', '/webhook/warning-list');
  cek(r.status === 200 && r.isi.warning.length >= 18 && r.isi.pembina.length > 10, 'warning-list ' + r.isi.warning.length + ' · berlaku=' + r.isi.warning.filter((x) => x.berlaku).length);
  const pb = r.isi.pembina[0];
  r = await P('POST', '/webhook/warning-tambah', { id_ho: kw.id_ho, pelanggaran: 'Uji', sanksi: 'Pertama', tgl_war_diberi: '', pembina: pb.id_ho });
  cek(r.status === 200, 'warning-tambah', r.isi);
  const idW = r.isi.id_warning;
  r = await P('POST', '/webhook/warning-tambah', { id_ho: kw.id_ho, pelanggaran: 'Uji', sanksi: 'Pertama', pembina: kw.id_ho });
  cek(r.status === 422, 'pembina bukan staff / diri sendiri ditolak');
  r = await P('POST', '/webhook/warning-ubah', { id_warning: idW, pelanggaran: 'Uji ubah', sanksi: 'Kedua', tgl_war_diberi: d0, pembina: pb.id_ho, war_catatan: '', status: 'Done' });
  cek(r.status === 200 && /status — → Done/.test(r.isi.message), 'warning-ubah', r.isi.message);
  r = await P('POST', '/webhook/warning-email', { id_warning: idW });
  cek(r.status === 200, 'warning-email (simulasi)');
  r = await P('POST', '/webhook/warning-cetak', { id_warning: idW });
  cek(r.status === 200 && /pdf/.test(r.ct), 'warning-cetak PDF');
  fs.writeFileSync(OUT + '/warning.pdf', r.isi);
  r = await P('GET', '/webhook/warning-list');
  const w1 = r.isi.warning.find((x) => x.id_warning === idW);
  cek(w1.email && w1.email.kali === 1 && w1.cetak && w1.cetak.kali === 1, 'jejak email/cetak di warning-list', w1);
  r = await P('POST', '/webhook/warning-hapus', { id_warning: idW });
  cek(r.status === 200, 'warning-hapus');

  console.log('— AFL');
  r = await P('GET', '/webhook/afl-list');
  cek(r.status === 200 && r.isi.items.length > 40, 'afl-list bulan ' + r.isi.bulan + ': ' + r.isi.items.length + ' cuti, roster_sampai=' + r.isi.roster_sampai);
  r = await P('GET', '/webhook/afl-run');
  cek(r.status === 200 && r.isi.hasil && r.isi.hasil.gerbang.keadaan === 'menunggu', 'afl-run menunggu', r.isi.hasil && r.isi.hasil.gerbang);
  const run = r.isi.hasil;
  console.log('    run #' + run.id + ' · ' + run.jumlah + ' orang · riwayat=' + r.isi.riwayat.length + ' · terlewat=' + JSON.stringify(r.isi.terlewat.tanggal));
  run.items.forEach((it) => console.log('      ' + it.id_ho + ' ' + it.nama + ' | ' + it.poh + ' | ' + it.alasan + ' | hk=' + it.total_h_kerja + ' | ' + (it.jalur_berangkat || '-') + (it.catatan_jalur ? ' [' + it.catatan_jalur + ']' : '') + (it.status_cuti ? ' TR' : '')));
  cek(r.isi.terlewat.tanggal.length >= 1, 'ada tanggal terlewat');
  r = await P('GET', '/webhook/afl-crosscek');
  cek(r.status === 200 && r.isi.ringkas.berangkat >= 3 && r.isi.ringkas.balik >= 2, 'crosscek besok ' + JSON.stringify(r.isi.ringkas));
  cek(r.isi.ringkas.tidak_sesuai >= 1, 'crosscek ada yang tidak sesuai (merah)');
  r = await P('GET', '/webhook/afl-catatan');
  cek(r.status === 200 && r.isi.items.length > 50, 'afl-catatan ' + JSON.stringify(r.isi.ringkas));
  const c1 = r.isi.items.find((x) => !x.full_approve);
  r = await P('POST', '/webhook/afl-catatan-ubah', { id_afl: c1.id_afl, full_approve: true });
  cek(r.status === 200 && r.isi.item.warna === 'hijau', 'afl-catatan-ubah -> hijau');
  const pilih = run.items.slice(1).map((x) => x.kunci);
  r = await P('POST', '/webhook/afl-cetak', { id: run.id, pilih: ['XYZ|2020-01-01'] });
  cek(r.status === 409, 'pilihan asing -> 409');
  r = await P('POST', '/webhook/afl-cetak', { id: run.id, pilih: pilih });
  cek(r.status === 200 && r.isi.jumlah === pilih.length, 'afl-cetak', r.isi);
  r = await P('GET', '/webhook/afl-run');
  cek(r.isi.hasil.gerbang.keadaan === 'dicetak' && r.isi.hasil.dokumen_keadaan === 'membuat', 'segera sesudah cetak: membuat PDF', r.isi.hasil.gerbang);
  await tunggu(2600 + 1200 * pilih.length + 300);
  r = await P('GET', '/webhook/afl-run');
  cek(r.isi.hasil.dokumen_keadaan === 'siap' && r.isi.hasil.simpan.keadaan === 'siap', 'dokumen siap', r.isi.hasil.dokumen);
  const dok = r.isi.hasil.dokumen;
  for (const d of dok) {
    const p = await P('GET', '/webhook/afl-pdf?id=' + run.id + '&jenis=' + d.jenis);
    cek(p.status === 200 && /pdf/.test(p.ct), 'afl-pdf ' + d.jenis + ' (' + d.jumlah_orang + ' orang, ' + d.halaman + ' hal)');
    fs.writeFileSync(OUT + '/afl-' + d.jenis + '.pdf', p.isi);
  }
  r = await P('POST', '/webhook/afl-jalankan', { susulan: true });
  cek(r.status === 200 && /susulan/.test(r.isi.message), 'afl-jalankan susulan', r.isi);
  await tunggu(3500);
  r = await P('GET', '/webhook/afl-run');
  cek(r.isi.terlewat.tanggal.length === 0, 'sesudah susulan tidak ada tanggal terlewat', r.isi.terlewat);
  console.log('    run susulan #' + (r.isi.hasil && r.isi.hasil.id) + ' keadaan=' + (r.isi.hasil && r.isi.hasil.gerbang.keadaan) + ' jumlah=' + (r.isi.hasil && r.isi.hasil.jumlah));
  r = await P('POST', '/webhook/afl-jalankan', { tutup: [r.isi.hasil.id] });
  cek(r.status === 200 && /ditutup/.test(r.isi.message), 'jalankan ulang + tutup run menunggu', r.isi.message);
  await tunggu(3500);
  r = await P('GET', '/webhook/afl-run');
  cek(r.isi.hasil.gerbang.keadaan === 'menunggu' && r.isi.hasil.mode === 'webhook' && r.isi.hasil.pemicu.nama === 'Andhika Samuel', 'run baru menunggu cetak', r.isi.hasil.gerbang);
  r = await P('GET', '/webhook/sistem-status');
  cek(!r.isi.peringatan.some((p) => /AFL/.test(p.judul)), 'peringatan AFL hilang sesudah susulan', r.isi.peringatan);

  console.log('— MBR');
  r = await P('GET', mbr1.resumeUrl + '?approved=1');
  cek(r.status === 200, 'approve diterima', r.isi);
  await tunggu(3800);
  r = await P('GET', '/webhook/mbr-status');
  cek(r.isi.status === 'sent' && r.isi.sentAt, 'MBR terkirim', r.isi.status);
  r = await P('GET', mbr1.resumeUrl + '?approved=1');
  cek(r.status === 409, 'approve ulang -> 409');
  r = await P('GET', '/webhook/mbr-run?t=1');
  cek(r.status === 200, 'mbr-run');
  await tunggu(4800);
  r = await P('GET', '/webhook/mbr-status');
  cek(r.isi.status === 'pending' && r.isi.resumeUrl !== mbr1.resumeUrl, 'snapshot baru pending', r.isi.resumeUrl);

  console.log('— Import roster (CSV)');
  const tgl = [1, 2, 3].map((i) => D.geser(d0, 40 + i));
  const ids = D.muat().karyawan.slice(5, 8).map((k) => k.id_ho);
  const csv = 'ID HO,' + tgl.join(',') + '\n' + ids.map((id) => id + ',D,N,O').join('\n') + '\nXYZ99999999,D,D,D\n';
  const fd = new FormData();
  fd.append('file', new File([csv], 'roster.csv', { type: 'text/csv' }), 'roster.csv');
  r = await P('POST', '/webhook/roster-import', fd);
  cek(r.status === 200 && r.isi.imported === 9 && r.isi.skipped === 3 && r.isi.dates.length === 3, 'import 9 ok 3 dilewati', r.isi);
  cek(D.rGet(D.muat(), ids[0], tgl[2]) === 'CS', 'O dipetakan ke CS');

  console.log('— Operator (hak terbatas)');
  r = await P('POST', '/webhook/logout');
  r = await P('GET', '/webhook/todo-list');
  cek(r.status === 401, 'sesudah logout -> 401');
  r = await P('POST', '/webhook/login', { username: 'siti', password: 'MagiOperator2026' });
  cek(r.isi.ok && r.isi.peran === 'Operator', 'login operator', r.isi.hak);
  r = await P('GET', '/webhook/karyawan-list?q=a');
  cek(r.status === 200 && r.isi.length > 0, 'operator dengan hak karyawan: data penuh', Object.keys(r.isi[0]).length);
  r = await P('GET', '/webhook/simper-list?q=a');
  cek(r.status === 403, 'simper-list -> 403');
  r = await P('GET', '/webhook/akses-list');
  cek(r.status === 403, 'akses-list -> 403');
  r = await P('POST', '/webhook/roster-import', new FormData());
  cek(r.status === 403, 'roster-import tanpa hak -> 403');
  r = await P('GET', '/webhook/mbr-status');
  cek(r.status === 200 && !!r.isi.resumeUrl, 'operator berhak mbr melihat resumeUrl');
  r = await P('POST', '/webhook/login', { username: 'dewi', password: 'MagiDewi2026x' });
  r = await P('GET', '/webhook/mbr-status');
  cek(r.status === 200 && !r.isi.resumeUrl, 'tanpa hak mbr: resumeUrl disembunyikan');
  r = await P('GET', '/webhook/karyawan-list?q=a');
  cek(r.status === 200, 'dewi punya hak karyawan');
  r = await P('POST', '/webhook/login', { username: 'budi.s', password: 'MagiBudi2026x' });
  r = await P('GET', '/webhook/karyawan-list?q=a');
  cek(r.status === 200 && Object.keys(r.isi[0]).length === 3, 'hak edit-roster saja: karyawan-list dipangkas 3 kolom', r.isi[0]);
  r = await P('POST', '/webhook/login', { username: 'magang', password: 'MagangDemo2026' });
  cek(r.status === 401, 'akun nonaktif tidak bisa login');
  for (let i = 0; i < 5; i++) await P('POST', '/webhook/login', { username: 'siti', password: 'salah' + i });
  r = await P('POST', '/webhook/login', { username: 'siti', password: 'MagiOperator2026' });
  cek(r.status === 429, 'penguncian 5 gagal -> 429', r.isi);

  console.log('— geser tanggal (buka lagi 3 hari kemudian)');
  const json = w.localStorage.getItem(D.KUNCI_DB);
  const db2 = JSON.parse(json);
  db2.base = D.geser(db2.base, -3);
  D.geserDb(db2, -3); db2.base = D.geser(D.hariIni(), -3);
  w.localStorage.setItem(D.KUNCI_DB, JSON.stringify(db2));
  const w2 = buatKonteks('index.html');
  w2.localStorage.setItem(w2.MAGI_DEMO.KUNCI_DB, JSON.stringify(db2));
  const D2 = w2.MAGI_DEMO;
  const dbBaru = D2.muat();
  cek(dbBaru.base === D2.hariIni(), 'base digeser ke hari ini');
  await panggil(w2, 'POST', '/webhook/login', { username: 'andhika', password: 'MagiAdmin2026' });
  r = await panggil(w2, 'GET', '/webhook/roster-summary');
  cek(r.isi.total === totalBesok || Math.abs(r.isi.total - totalBesok) < 3, 'roster besok tetap konsisten sesudah geser: ' + r.isi.total);

  console.log('\nHASIL: ' + lulus + ' lulus, ' + gagal + ' gagal (' + ((Date.now() - t0) / 1000).toFixed(1) + ' dtk)');
  process.exit(gagal ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });

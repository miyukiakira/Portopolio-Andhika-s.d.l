# Portofolio — Andhika Samuel Daya Lelunu

Website portofolio statis (HTML/CSS/JS murni, tanpa build step) berisi profil dari CV
dan studi kasus **MAGI//SYSTEM**, lengkap dengan **live demo** dashboard aslinya yang
berjalan 100% di browser dengan data fiktif.

```
website/
├── index.html              halaman portofolio
├── assets/
│   ├── css/porto.css       gaya (tema "warm space", selaras MAGI//SYSTEM)
│   ├── js/data.js          ★ SEMUA ISI HALAMAN (profil, pengalaman, keahlian, kontak, ...)
│   ├── js/porto.js         mengisi halaman dari data.js + interaksi (menu, animasi, angka)
│   ├── img/                foto, favicon, og.png (pratinjau saat link dibagikan)
│   └── doc/                CV (PDF) untuk tombol "Unduh CV"
├── demo/                   dashboard MAGI//SYSTEM — salinan Dasbord/ ASLI
│   ├── *.html / *.js / *.css   tidak diubah (hanya 5 tag <script> demo di tiap .html)
│   └── _demo/              "backend tiruan" khusus versi portofolio
│       ├── util.js         tanggal, PRNG, SHA-256, simpan/geser database di localStorage
│       ├── seed.js         data dummy + logika workflow n8n (MBR, AFL) versi JS
│       ├── api.js          port service/server.js + routes/*.js (59 rute + proxy n8n)
│       ├── pdf.js          penulis PDF mini: form AFL, Travel Request, APD, Warning
│       └── ui.js           pil DEMO, akun demo di login, contoh roster .csv
├── uji/uji-backend.js      106 uji otomatis untuk backend tiruan (Node 18+)
├── .gitignore              berkas yang tidak ikut ter-upload (.env, node_modules, ...)
└── .nojekyll               wajib untuk GitHub Pages (folder _demo/ diawali garis bawah)
```

## Menjalankan di komputer sendiri

Butuh server HTTP biasa (jangan dibuka lewat `file://`):

```bash
cd website
python3 -m http.server 8080
# buka http://localhost:8080
```

## Akun demo

| Peran | Username | Password | Hak |
|---|---|---|---|
| Administrator | `andhika` | `MagiAdmin2026` | semua modul + kelola akun |
| Operator | `siti` | `MagiOperator2026` | MBR, Edit Roster, Karyawan, Absensi, AFL, To Do |
| Operator | `budi.s` | `MagiBudi2026x` | MBR, Import/Edit Roster, To Do, APD |
| Operator | `dewi` | `MagiDewi2026x` | SIMPER, APD, Warning, To Do, Karyawan |

Tautan `demo/login.html?demo=admin&next=simper.html` langsung masuk sebagai Administrator
lalu membuka modul tersebut (dipakai kartu modul di portofolio).

## Cara kerja demo

- **Halaman dashboard tidak diubah.** `_demo/api.js` dimuat sebelum `config.js` dan
  membungkus `window.fetch`: setiap panggilan `/webhook/*`, `/webhook-waiting/*`, dan
  `/healthz` dijawab di browser dengan bentuk respons, kode HTTP, validasi, hak fitur
  (`HAK_RUTE`), dan `audit_log` yang sama dengan magi-api asli.
- **n8n disimulasikan:** MBR menunggu persetujuan (kedaluwarsa 30 menit, "Jalankan Ulang"
  membuat snapshot baru), AFL menunggu Cetak lalu "membuat PDF" beberapa detik, ada satu
  hari jadwal AFL yang "terlewat" (server mati) untuk mencoba **Proses susulan**, dan
  Import Roster memproses `.csv` langsung atau `.xlsx` lewat SheetJS (dimuat dari CDN).
- **Data dummy deterministik:** 246 karyawan fiktif (10 sudah berhenti/DOT), roster ±8 bulan,
  absensi, SIMPER & skill unit, APD, warning, AFL tercetak, to-do, dan jejak audit.
  Semua tanggal relatif terhadap hari ini — kalau situs dibuka lagi besok, database
  **digeser otomatis** sehingga skenarionya tetap "hari ini" tanpa membuang perubahan.
- **Penyimpanan:** perubahan pengunjung tersimpan di `localStorage` browser masing-masing.
  Pil **DEMO** (kiri bawah) → *Reset data* mengembalikan ke keadaan awal.
- Email warning hanya **disimulasikan** (tidak ada email sungguhan yang terkirim).

## Uji

```bash
node uji/uji-backend.js     # 106 pemeriksaan: semua rute, validasi, hak akses, alur n8n, PDF
```

## Upload ke GitHub

Folder ini sudah berupa repo Git (branch `main`). Sekali saja:

```bash
cd website
git config user.email "email-anda@contoh.com"   # bila belum pernah diatur
git add -A
git commit -m "Portofolio pertama"
```

Lalu buat repo **kosong** di https://github.com/new (tanpa README/.gitignore/lisensi),
misalnya bernama `portofolio`, dan sambungkan:

```bash
git remote add origin https://github.com/USERNAME/portofolio.git
git push -u origin main
```

Perubahan berikutnya cukup: `git add -A && git commit -m "pesan" && git push`.

## Hosting

- **GitHub Pages (gratis):** di repo → *Settings → Pages → Build and deployment →
  Source: Deploy from a branch*, pilih `main` dan folder `/ (root)`, *Save*. Setelah
  ±1 menit situs aktif di `https://USERNAME.github.io/portofolio/`. File `.nojekyll`
  sudah ada (tanpanya folder `_demo/` tidak ikut terbit). Nama repo
  `USERNAME.github.io` membuat situsnya tampil di `https://USERNAME.github.io/`.
- **Netlify / Vercel / Cloudflare Pages:** impor repo GitHub-nya (atau seret folder
  `website/`), *build command* dikosongkan, *publish directory* = root repo.

Semua tautan memakai path relatif, jadi situs berjalan sama baiknya di domain sendiri
maupun di sub-folder `/portofolio/`.

Setelah alamat situs diketahui, ubah `og:image` di `<head>` `index.html` menjadi URL
lengkap (mis. `https://USERNAME.github.io/portofolio/assets/img/og.png`) supaya
gambar pratinjau muncul saat tautan dibagikan di WhatsApp/LinkedIn.

## Mengubah isi

- **Teks, daftar, dan kontak: cukup edit `assets/js/data.js`** — tidak perlu menyentuh
  HTML. Tambah pengalaman/keahlian/sertifikasi = tambah satu baris `{ ... }` di daftarnya;
  kolom yang dikosongkan (`''`) otomatis disembunyikan (mis. `github`, `cv`).
  Setelah mengedit, cek salah ketik: `node --check assets/js/data.js`. Bila ada koma atau
  kutip yang hilang, halaman menampilkan kotak merah "Isi portofolio gagal dimuat".
- Judul bagian, kartu live demo, diagram arsitektur, dan potongan kode ada di `index.html`;
  judul tab dan meta pratinjau tautan juga di `<head>` `index.html`.
- Foto: ganti `assets/img/foto.jpg` (persegi, ±600×600).
- CV: ganti `assets/doc/CV-Andhika-Samuel-Daya-Lelunu.pdf`. Catatan: CV memuat nomor
  telepon, alamat, dan tanggal lahir — isi `cv: ''` di `data.js` bila tidak ingin
  dibagikan secara publik (hapus juga berkas PDF-nya sebelum di-push).
- Data dummy: `demo/_demo/seed.js`. Setelah mengubah bentuk data, naikkan `D.VERSI`
  di `util.js` supaya browser pengunjung membuat database baru.

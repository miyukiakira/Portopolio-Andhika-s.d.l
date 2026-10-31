/* Portofolio Andhika Samuel — mengisi halaman dari data.js, lalu interaksi ringan (tanpa pustaka).
   Setiap elemen ber-atribut data-isi="nama" diisi oleh ISI.nama(data) di bawah. */
(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  const gerakMin = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- helper ---------------- */
  const attr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const list = (arr, fn) => (arr || []).map(fn).join('');
  const jika = (syarat, html) => (syarat ? html : '');
  const tampilUrl = u => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const namaLengkap = p => `${p.namaDepan} ${p.namaBelakang}`;
  const tombolCv = (p, kelas, teks) => jika(p.cv, `<a class="${kelas}" href="${attr(p.cv)}" download>${teks}</a>`);

  /* ikon kartu modul — nama yang tidak dikenal memakai ikon hex */
  const IKON = {
    mbr: '<path d="M6 3v6a2 2 0 0 0 4 0V3"/><path d="M8 3v18"/><path d="M17 3c-1.7 0-3 2-3 5s1 4 2.2 4.3L16 21"/>',
    roster: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    karyawan: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    absen: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/><path d="M8.5 14.5l2.2 2.2L15.5 12"/>',
    afl: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="m9 15.5 2 2 4-4"/>',
    simper: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="10.5" r="2"/><path d="M5 15.5c.6-1.4 1.7-2.1 3-2.1s2.4.7 3 2.1"/><path d="M14 10h4.5"/><path d="M14 13.5h3"/>',
    apd: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M2.5 16h19v2.5h-19z"/><path d="M10 8.4V5.5h4v2.9"/><path d="M7.5 10.5l1 3"/><path d="M16.5 10.5l-1 3"/>',
    warning: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5"/><path d="M12 17h.01"/>',
    todo: '<path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><path d="m3 6 1.6 1.6L8 4.2"/><path d="m3 12 1.6 1.6L8 10.2"/><path d="m3 18 1.6 1.6L8 16.2"/>',
    akses: '<path d="M2 18v3c0 .55.45 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r="1"/>'
  };
  const ikon = k => IKON[k]
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[k]}</svg>`
    : '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 3l18 10.5v21L24 45 6 34.5v-21z" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="currentColor"/></svg>';

  const pItem = x => `<div class="p-item"><b>${x.nama}</b><span>${x.ket}</span><em>${x.waktu}</em></div>`;
  const proyek = pr => `
    <div class="lm-proyek">
      <h4>${pr.nama}${jika(pr.ket, ` <span>· ${pr.ket}</span>`)}</h4>
      <ul>${list(pr.poin, y => `<li>${y}</li>`)}</ul>
      ${pr.tautan ? `<a class="tautan" href="${attr(pr.tautan.href)}">${pr.tautan.teks}</a>` : ''}
    </div>`;

  /* ---------------- pengisi per bagian ---------------- */
  const ISI = {
    merek: d => d.profil.namaDepan.split(' ').join('<b>.</b>'),
    namaLengkap: d => namaLengkap(d.profil),

    hero: ({ profil: p }) => `
      <p class="eyebrow">${p.tagline}</p>
      <h1>${p.namaDepan}<br><span>${p.namaBelakang}</span>${jika(p.gelar, `<small>${p.gelar}</small>`)}</h1>
      <p class="lead">${p.lead}</p>
      <div class="aksi">
        <a class="tombol utama" href="demo/login.html">Coba live demo Magi System <span aria-hidden="true">→</span></a>
        <a class="tombol" href="#magi">Lihat studi kasus</a>
        ${tombolCv(p, 'tombol hantu', 'Unduh CV (PDF)')}
      </div>
      <ul class="meta-hero">
        ${jika(p.status, `<li><span class="titik"></span>${p.status}</li>`)}
        ${jika(p.lokasi, `<li>${p.lokasi}</li>`)}
      </ul>`,

    orbit: ({ profil: p }) => `
      <svg class="cincin" viewBox="0 0 400 400" aria-hidden="true">
        <circle cx="200" cy="200" r="196" stroke="rgba(226,59,50,.35)" stroke-width="1" fill="none"/>
        <circle cx="200" cy="200" r="180" stroke="#FF6A1F" stroke-width="2" fill="none" stroke-dasharray="6 10"/>
        <ellipse cx="200" cy="200" rx="198" ry="70" stroke="rgba(244,234,219,.18)" stroke-width="1" fill="none" transform="rotate(-28 200 200)"/>
      </svg>
      <img src="${attr(p.foto)}" width="600" height="600" alt="Foto ${attr(namaLengkap(p))}">
      ${list((p.lencana || []).slice(0, 4), (t, i) => `<span class="lencana l${i + 1}">${t}</span>`)}`,

    angka: (d, el) => {
      el.style.setProperty('--n', d.angka.length);
      return list(d.angka, a => `
        <div><dt>${a.label}</dt><dd data-hitung="${a.nilai}" data-awalan="${attr(a.awalan)}">${a.awalan || ''}${a.nilai}</dd><dd class="ket">${a.ket}</dd></div>`);
    },

    tentang: ({ tentang: t }) => `<p class="besar">${t.pembuka}</p>${list(t.paragraf, x => `<p>${x}</p>`)}`,

    nilai: d => list(d.tentang.nilai, n => `<article><h3><span>${n.ikon}</span>${n.judul}</h3><p>${n.teks}</p></article>`),

    fotoLebar: ({ tentang: t }, el) => {
      if (!t.foto) { el.remove(); return ''; }
      return `<img src="${attr(t.foto)}" width="1600" height="597" loading="lazy" alt="${attr(t.fotoAlt)}">${jika(t.fotoKet, `<figcaption>${t.fotoKet}</figcaption>`)}`;
    },

    intro: d => d.magi.intro,

    banding: d => `<div class="b-kepala"><span>Sebelum — banyak Excel</span><span>Sesudah — Magi System</span></div>` +
      list(d.magi.banding, ([sebelum, sesudah]) => `<div class="b-baris"><p>${sebelum}</p><p>${sesudah}</p></div>`),

    jumlahModul: d => String(d.magi.modul.length),

    modul: d => list(d.magi.modul, m => `
      <a class="m-kartu muncul" href="demo/login.html?demo=admin&amp;next=${encodeURIComponent(m.halaman)}">
        ${ikon(m.ikon)}
        <h4>${m.nama}</h4><p>${m.teks}</p><span>${m.halaman} →</span>
      </a>`),

    sorotan: d => list(d.magi.sorotan, s => `<article class="muncul"><h4>${s.judul}</h4><p>${s.teks}</p></article>`),

    keamanan: d => list(d.magi.keamanan, x => `<li>${x}</li>`),

    stack: d => list(d.magi.stack, x => `<li>${x}</li>`),

    catatanAi: (d, el) => {
      if (!d.magi.catatanAi) { el.remove(); return ''; }
      return d.magi.catatanAi;
    },

    pengalaman: d => list(d.pengalaman, x => `
      <li class="muncul">
        <div class="lm-waktu">${x.waktu}</div>
        <div class="lm-isi">
          <h3>${x.jabatan}</h3>
          <p class="lm-tempat">${x.tempat}</p>
          ${jika(x.ringkas, `<p>${x.ringkas}</p>`)}
          ${jika((x.tugas || []).length, `<ul class="lm-tugas">${list(x.tugas, y => `<li>${y}</li>`)}</ul>`)}
          ${x.proyek ? proyek(x.proyek) : ''}
        </div>
      </li>`),

    keahlian: d => list(d.keahlian, k => `<div class="k-grup muncul"><h3>${k.grup}</h3><ul>${list(k.isi, x => `<li>${x}</li>`)}</ul></div>`),

    sedangBelajar: (d, el) => {
      if (!(d.sedangBelajar || []).length) { el.remove(); return ''; }
      return `<span>Sedang dipelajari</span> ${d.sedangBelajar.join(' · ')}`;
    },

    pendidikan: d => list(d.pendidikan, pItem),
    sertifikasi: d => list(d.sertifikasi, pItem),

    ajakan: d => d.kontak.ajakan,

    kontak: ({ kontak: k, profil: p }) => `
      ${jika(k.email, `<li><span>Email</span><a href="mailto:${attr(k.email)}">${k.email}</a></li>`)}
      ${jika(k.linkedin, `<li><span>LinkedIn</span><a href="${attr(k.linkedin)}" target="_blank" rel="noopener">${tampilUrl(k.linkedin)}</a></li>`)}
      ${jika(k.github, `<li><span>GitHub</span><a href="${attr(k.github)}" target="_blank" rel="noopener">${tampilUrl(k.github)}</a></li>`)}
      ${jika(k.lokasi, `<li><span>Lokasi</span><p>${k.lokasi}</p></li>`)}
      <li class="kontak-aksi">
        ${jika(k.email, `<a class="tombol utama" href="mailto:${attr(k.email)}">Kirim email</a>`)}
        ${tombolCv(p, 'tombol', 'Unduh CV')}
      </li>`
  };

  /* ---------------- isi halaman ---------------- */
  const data = window.PORTO;
  if (data) {
    document.querySelectorAll('[data-isi]').forEach(el => {
      const isi = ISI[el.dataset.isi];
      if (!isi) { console.warn(`[porto] tidak ada pengisi untuk data-isi="${el.dataset.isi}"`); return; }
      try { el.innerHTML = isi(data, el); }
      catch (e) { console.error(`[porto] bagian "${el.dataset.isi}" gagal diisi — periksa data.js`, e); }
    });
  } else {
    document.getElementById('isi').insertAdjacentHTML('afterbegin',
      '<div class="galat-data wadah" role="alert"><b>Isi portofolio gagal dimuat.</b> Periksa <code>assets/js/data.js</code> — ' +
      'biasanya ada koma, tanda kutip, atau kurung yang hilang. Jalankan <code>node --check assets/js/data.js</code> untuk menemukan barisnya.</div>');
  }

  /* latar bintang — digambar sekali, ulang hanya saat ukuran jendela berubah (sama dengan MAGI//SYSTEM) */
  const cv = document.getElementById('bintang');
  if (cv?.getContext) {
    const ctx = cv.getContext('2d');
    let tunda = null;
    const gambar = () => {
      const w = cv.width = window.innerWidth, h = cv.height = window.innerHeight;
      const n = Math.min(200, Math.round(w * h / 9500));
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.fillStyle = (i % 11 === 0 ? 'rgba(255,150,80,' : 'rgba(244,234,219,') + (Math.random() * 0.5 + 0.15) + ')';
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.2 + 0.25, 0, 6.284);
        ctx.fill();
      }
    };
    window.addEventListener('resize', () => { clearTimeout(tunda); tunda = setTimeout(gambar, 200); });
    gambar();
  }

  /* navigasi: garis bawah saat menggulir, menu ponsel, tautan aktif */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('gulir', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = document.getElementById('burger'), menu = document.getElementById('menu');
  const aturMenu = buka => {
    menu.classList.toggle('buka', buka);
    burger.setAttribute('aria-expanded', String(buka));
    burger.setAttribute('aria-label', buka ? 'Tutup menu' : 'Buka menu');
  };
  burger.addEventListener('click', () => aturMenu(!menu.classList.contains('buka')));
  menu.addEventListener('click', e => { if (e.target.closest('a')) aturMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') aturMenu(false); });

  const tautan = [...menu.querySelectorAll('a[href^="#"]')];
  if ('IntersectionObserver' in window) {
    const aktif = new IntersectionObserver(entri => {
      entri.forEach(en => {
        if (!en.isIntersecting) return;
        const id = '#' + en.target.id;
        tautan.forEach(a => a.classList.toggle('aktif', a.getAttribute('href') === id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    tautan.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) aktif.observe(s); });

    /* muncul saat terlihat */
    const muncul = new IntersectionObserver(entri => {
      entri.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('tampak'); muncul.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    document.querySelectorAll('.muncul').forEach(el => muncul.observe(el));

    /* hitung naik angka hero */
    const angka = new IntersectionObserver(entri => {
      entri.forEach(en => {
        if (!en.isIntersecting) return;
        angka.unobserve(en.target);
        if (gerakMin) return;
        const el = en.target, akhir = Number(el.dataset.hitung), awalan = el.dataset.awalan || '';
        const t0 = performance.now(), lama = 1100;
        const langkah = t => {
          const p = Math.min(1, (t - t0) / lama), e = 1 - Math.pow(1 - p, 3);
          el.textContent = awalan + Math.round(akhir * e);
          if (p < 1) requestAnimationFrame(langkah);
        };
        requestAnimationFrame(langkah);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-hitung]').forEach(el => angka.observe(el));
  } else {
    document.querySelectorAll('.muncul').forEach(el => el.classList.add('tampak'));
  }

  const th = document.getElementById('tahun');
  if (th) th.textContent = String(new Date().getFullYear());
})();

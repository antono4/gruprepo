#!/usr/bin/env node
/**
 * Perbarui data repository di index.html langsung dari GitHub API.
 * Dipanggil otomatis oleh GitHub Actions setiap 10 menit (lihat .github/workflows/update.yml).
 */
const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, '..', 'index.html');
const API = 'https://api.github.com/users/antono4/repos';

function pick(r) {
  return {
    name: r.name,
    html_url: r.html_url,
    description: r.description ?? null,
    fork: r.fork,
    language: r.language ?? null,
    stargazers_count: r.stargazers_count,
    forks_count: r.forks_count,
    pushed_at: r.pushed_at,
    updated_at: r.updated_at,
    archived: r.archived,
    license: r.license ? (r.license.spdx_id ? { spdx_id: r.license.spdx_id, key: r.license.spdx_id.toLowerCase() } : r.license.key ? { spdx_id: r.license.key, key: r.license.key } : null) : null,
    owner: r.owner ? { avatar_url: r.owner.avatar_url } : null,
  };
}

async function fetchAllRepos() {
  const out = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${API}?per_page=100&page=${page}`, { headers: { 'User-Agent': 'gruprepo-updater', Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    out.push(...json);
    if (json.length < 100) break;
    page++;
  }
  return out;
}

function stats(list) {
  const orig = list.filter(r => !r.fork);
  return {
    total: list.length,
    original: orig.length,
    fork: list.filter(r => r.fork).length,
    stars: list.reduce((s, r) => s + (r.stargazers_count || 0), 0),
  };
}

function statsSnippetHtml(s) {
  return `<div class="hero-stats">
          <div class="stat-pill"><b>${s.total}</b><span>repositori</span></div>
          <div class="stat-pill"><b>${s.original}</b><span>original</span></div>
          <div class="stat-pill"><b>${s.stars}</b><span>⭐ total</span></div>
          <div class="stat-pill"><b>${s.fork}</b><span>fork</span></div>
        </div>`;
}

function extractStatsSnippet(html) {
  // Ambil blok <div class="hero-stats"> ... </div> penutup terluar
  const start = html.indexOf('<div class="hero-stats">');
  if (start === -1) return null;
  let i = start + '<div class="hero-stats">'.length;
  let depth = 1;
  while (i < html.length && depth > 0) {
    const open = html.indexOf('<div', i);
    const close = html.indexOf('</div>', i);
    if (close === -1) return null;
    if (open !== -1 && open < close) { depth++; i = open + 5; }
    else { depth--; i = close + '</div>'.length; }
  }
  return html.slice(start, i);
}

async function main() {
  let html = fs.readFileSync(INDEX, 'utf8');

  const fresh = await fetchAllRepos();
  if (!fresh.length) throw new Error('Tidak ada data repository dari GitHub API');

  const dataByKey = new Map();
  const match = html.match(/const DATA = (\[.*?\]);\n/s);
  if (match) {
    try {
      const old = JSON.parse(match[1]);
      for (const r of old) dataByKey.set(`${r.fork ? 'f' : 'o'}:${r.name}`, r);
    } catch (e) {
      console.warn('Data lama tidak bisa dibaca, memakai data baru saja:', e.message);
    }
  }

  // Gabungkan: nilai API terbaru menang, repositori baru ditempatkan di depan, urutan lama dipertahankan
  const merged = [];
  const seen = new Set();
  for (const r of fresh) {
    const key = `${r.fork ? 'f' : 'o'}:${r.name}`;
    if (dataByKey.has(key)) {
      merged.push({ ...dataByKey.get(key), ...pick(r) });
    } else {
      merged.push(pick(r));
    }
    seen.add(key);
  }
  for (const [key, r] of dataByKey) if (!seen.has(key)) merged.push(r);

  const json = JSON.stringify(merged);
  const dataLine = `const DATA = ${json};`;
  if (match) {
    html = html.replace(match[0], dataLine + '\n');
  } else {
    html = html.replace('</script>', dataLine + '\n</script>');
  }

  const s = stats(merged);
  const snippet = extractStatsSnippet(html);
  if (snippet) html = html.replace(snippet, statsSnippetHtml(s));

  html = html.replace(/(\d[\d.,]*)\s*repository publik tersedia/, `${s.total} repository publik tersedia`);

  const readme = path.join(__dirname, '..', 'README.md');
  if (fs.existsSync(readme)) {
    let rd = fs.readFileSync(readme, 'utf8');
    rd = rd.replace(/\|\s*Total repository\s*\|\s*\*\*[\d\.,]*\*\*/, `| Total repository | **${s.total}**`);
    rd = rd.replace(/\|\s*Repository original\s*\|\s*\*\*[\d\.,]*\*\*/, `| Repository original | **${s.original}**`);
    rd = rd.replace(/\|\s*Fork & kontribusi\s*\|\s*\*\*[\d\.,]*\*\*/, `| Fork & kontribusi | **${s.fork}**`);
    rd = rd.replace(/\|\s*Total ⭐\s*\|\s*\*\*[\d\.,]*\*\*/, `| Total ⭐ | **${s.stars}**`);
    fs.writeFileSync(readme, rd);
  }

  fs.writeFileSync(INDEX, html);
  console.log(`OK: ${s.total} repositori (${s.original} original, ${s.fork} fork), ${s.stars} ⭐`);
}

main().catch(err => { console.error(err); process.exit(1); });
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.TMDB_API_KEY || "";
if (!API_KEY) {
  console.error("Missing TMDB_API_KEY env var.");
  process.exit(1);
}

const YEAR_START = 2000;
const CURRENT_YEAR = new Date().getFullYear();
const TODAY_STR = new Date().toISOString().slice(0, 10);
const OUT_FILE = path.join(process.cwd(), 'movies.json');

const MAX_CONCURRENT = 4;
const RETRIES = 3;

async function fetchWithRetry(url, retries = RETRIES, baseDelay = 500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      return res;
    } catch (e) {
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Failed after retries: ${url}`);
}

async function fetchAllWithLimit(urls, limit, handler) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      try {
        const res = await fetchWithRetry(url);
        const data = await res.json();
        await handler(data, url);
      } catch (e) {
        console.warn('Fetch failed:', url, e.message || e);
      }
    }
  });
  await Promise.all(workers);
}

function normalizeDateForSort(raw) {
  if (!raw) return '0000-01-01';
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '0000-01-01';
}

function languageRank(lang) {
  const l = (lang || '').toLowerCase();
  if (l === 'hi') return 0;
  if (l === 'en') return 1;
  return 2;
}

function sortMovies(list) {
  const unique = new Map();
  list.forEach(m => {
    if (!unique.has(m.id)) unique.set(m.id, m);
  });
  return Array.from(unique.values()).sort((a, b) => {
    const dateDiff = new Date(normalizeDateForSort(b.date)) - new Date(normalizeDateForSort(a.date));
    if (dateDiff !== 0) return dateDiff;
    const popDiff = (b.popularity || 0) - (a.popularity || 0);
    if (popDiff !== 0) return popDiff;
    const langDiff = languageRank(a.language) - languageRank(b.language);
    if (langDiff !== 0) return langDiff;
    return (a.title || '').localeCompare(b.title || '');
  });
}

function toMovieObj(movie, fallbackYear) {
  const title = movie.title;
  const posterPath = movie.poster_path;
  const poster = posterPath
    ? `https://image.tmdb.org/t/p/w500${posterPath}`
    : 'https://via.placeholder.com/500x750?text=No+Image';

  return {
    id: movie.id,
    title: title,
    poster: poster,
    details: `${(movie.genre_ids || []).join(', ')} | ${movie.overview ? movie.overview.substring(0, 80) + '...' : 'No description'}`,
    date: movie.release_date || `${fallbackYear || ''}`.trim(),
    popularity: typeof movie.popularity === 'number' ? movie.popularity : 0,
    language: (movie.original_language || '').toLowerCase(),
    overview: movie.overview || '',
    link: `/movie/${(title || '').toLowerCase().replace(/\s+/g, '-')}`
  };
}

async function main() {
  const urls = [];
  for (let year = CURRENT_YEAR; year >= 2015; year--) {
    for (let page = 1; page <= 3; page++) {
      urls.push(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&primary_release_year=${year}&sort_by=popularity.desc&release_date.lte=${TODAY_STR}&page=${page}`);
    }
  }
  for (let year = 2014; year >= YEAR_START; year--) {
    urls.push(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&primary_release_year=${year}&sort_by=popularity.desc&release_date.lte=${TODAY_STR}&page=1`);
  }

  const movies = [];
  await fetchAllWithLimit(urls, MAX_CONCURRENT, (data) => {
    if (data && data.results) {
      data.results.forEach(m => {
        if (!m.release_date || m.release_date > TODAY_STR) return;
        movies.push(toMovieObj(m, (m.release_date || '').slice(0, 4)));
      });
    }
  });

  const sorted = sortMovies(movies);
  fs.writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2));
  console.log(`Saved ${sorted.length} movies to ${OUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

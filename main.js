// 🎬 Vegamovies - Movie Database
// Static JSON data only
// Date: February 2026
let movies = [];
let currentMovies = [];
let currentPage = 1;
const MOVIES_PER_PAGE = 15;
const FIRST_PAGE_SIZE = 40;
let pinnedFirstPageIds = [];
let currentMoviesIsDefault = true;

function languageRank(lang) {
    const l = (lang || "").toLowerCase();
    if (l === "hi") return 0;
    if (l === "en") return 1;
    return 2;
}

function sortMoviesList(list) {
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
        return (a.title || "").localeCompare(b.title || "");
    });
}

const CACHE_KEY = "vega_cached_movies_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const TODAY_STR = new Date().toISOString().slice(0, 10);
const PREFERRED_LANGS = ["hi", "ta", "te", "ml", "kn"]; // Hindi + South languages
const INCLUDE_HINDI_HOLLYWOOD = true;
const STATIC_MOVIES_URL = "/movies.json";

// ============================================
// CACHE HELPERS
// ============================================

function getCachedMovies() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.movies) || !parsed.timestamp) return null;
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
        return parsed.movies;
    } catch (error) {
        console.warn("Cache read failed:", error);
        return null;
    }
}

function setCachedMovies(list) {
    try {
        const payload = { timestamp: Date.now(), movies: list };
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("Cache write failed:", error);
    }
}

// ============================================
// MOVIE OBJECT BUILDER
// ============================================

function toMovieObj(movie, genreMap, fallbackYear) {
    const title = movie.title;
    const posterPath = movie.poster_path;
    const poster = posterPath
        ? `https://image.tmdb.org/t/p/w500${posterPath}`
        : "https://via.placeholder.com/500x750?text=No+Image";

    let genres = [];
    if (movie.genre_ids && movie.genre_ids.length > 0) {
        genres = movie.genre_ids.map(id => genreMap[id] || "Movie").filter(g => g);
    }

    const category = genres.length > 0 ? genres[0].toLowerCase() : "hollywood";
    const platformName = getRandomPlatform();

    const rawDate = movie.release_date || `${fallbackYear || ""}`.trim();

    return {
        id: movie.id,
        title: title,
        poster: poster,
        details: `${genres.join(", ")} | ${platformName} | ${movie.overview ? movie.overview.substring(0, 80) + "..." : "No description"}`,
        date: rawDate,
        popularity: typeof movie.popularity === "number" ? movie.popularity : 0,
        language: (movie.original_language || "").toLowerCase(),
        overview: movie.overview || "",
        category: category,
        platform: platformName.toLowerCase().replace(/\s+/g, "-").replace("+", ""),
        platformName: platformName,
        genres: genres,
        link: `/movie/${title.toLowerCase().replace(/\s+/g, "-")}`
    };
}

// ============================================
// DATE NORMALIZATION
// ============================================

function normalizeDateForSort(raw) {
    if (!raw) return "0000-01-01";
    // Year only
    if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
    // Full date
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return "0000-01-01";
}

function formatMovieDate(raw) {
    if (!raw) return "Unknown";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}$/.test(raw)) return raw;
    return "Unknown";
}

function isReleased(rawDate) {
    const normalized = normalizeDateForSort(rawDate);
    if (normalized === "0000-01-01") return false;
    return normalized <= TODAY_STR;
}

function isPreferredMovie(movieObj) {
    const lang = (movieObj.language || "").toLowerCase();
    if (PREFERRED_LANGS.includes(lang)) return true;
    if (!INCLUDE_HINDI_HOLLYWOOD) return false;
    if (lang !== "en") return false;
    const text = `${movieObj.title || ""} ${movieObj.overview || ""} ${movieObj.details || ""}`.toLowerCase();
    return text.includes("hindi") || text.includes("dubbed");
}

function applyPinnedOrder(list) {
    if (!Array.isArray(list)) return [];
    if (!pinnedFirstPageIds.length) return list;
    if (!currentMoviesIsDefault) return list;
    const byId = new Map(list.map(m => [m.id, m]));
    const pinned = pinnedFirstPageIds.map(id => byId.get(id)).filter(Boolean);
    const pinnedSet = new Set(pinnedFirstPageIds);
    const rest = list.filter(m => !pinnedSet.has(m.id));
    return [...pinned, ...rest];
}

function setMoviesAndRefresh(list, { cache = true, pinFirstPage = false } = {}) {
    const sourceList = Array.isArray(list) ? list : [];
    const releasedList = sourceList.filter(m => isReleased(m.date));
    movies = sortMoviesList(releasedList);
    currentMovies = [...movies];
    currentMoviesIsDefault = true;
    currentPage = 1;
    if (pinFirstPage) {
        const preferred = releasedList.filter(isPreferredMovie);
        const base = preferred.length ? sortMoviesList(preferred) : movies;
        pinnedFirstPageIds = base.slice(0, FIRST_PAGE_SIZE).map(m => m.id);
    }
    if (cache && movies.length) {
        setCachedMovies(movies);
    }
    loadMovies(currentMovies, currentPage);
}

// ============================================
// AVAILABLE PLATFORMS - RANDOM
// ============================================

const PLATFORMS = ['Netflix', 'Amazon Prime', 'Disney+', 'MX Player'];

function getRandomPlatform() {
    return PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)];
}

// ============================================
// OPTIONAL STATIC DATA (SEO-FRIENDLY)
// ============================================

async function fetchStaticMovies() {
    try {
        const response = await fetch(STATIC_MOVIES_URL, { cache: "no-store" });
        if (!response.ok) return false;
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return false;
        setMoviesAndRefresh(data, { cache: false, pinFirstPage: true });
        console.log(`✅ Static movies loaded: ${data.length}`);
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================
// INITIALIZE APPLICATION
// ============================================

function initializeApp() {
    const moviesGrid = document.getElementById('moviesGrid');
    
    if (moviesGrid) {
        currentMovies = [...movies];
        currentMoviesIsDefault = true;
        loadMovies(currentMovies, currentPage);
        setupEventListeners();
        setupAnimations();
        console.log('✅ Application initialized successfully');
    }
}

// ============================================
// LOAD MOVIES WITH PAGINATION
// ============================================

function loadMovies(moviesToShow = currentMovies || movies, page = 1) {
    const moviesGrid = document.getElementById('moviesGrid');
    if (!moviesGrid) return;
    
    moviesGrid.innerHTML = '';
    
    const moviesToDisplay = moviesToShow.length > 0 ? moviesToShow : movies;
    const orderedMovies = applyPinnedOrder(moviesToDisplay);
    let startIdx = 0;
    let endIdx = 0;
    if (page === 1) {
        startIdx = 0;
        endIdx = FIRST_PAGE_SIZE;
    } else {
        const base = FIRST_PAGE_SIZE;
        const offset = (page - 2) * MOVIES_PER_PAGE;
        startIdx = base + offset;
        endIdx = startIdx + MOVIES_PER_PAGE;
    }
    const pageMovies = orderedMovies.slice(startIdx, endIdx);

    pageMovies.forEach((movie, index) => {
        const movieCard = createMovieCard(movie, index);
        moviesGrid.appendChild(movieCard);
    });
    
    renderPagination(orderedMovies.length, page);
    animateCards();
}

// ============================================
// RENDER PAGINATION BUTTONS
// ============================================

function renderPagination(totalMovies, page) {
    const remaining = Math.max(0, totalMovies - FIRST_PAGE_SIZE);
    const totalPages = 1 + Math.ceil(remaining / MOVIES_PER_PAGE);
    let pagination = document.querySelector('.pagination');
    
    if (!pagination) {
        const moviesGrid = document.getElementById('moviesGrid');
        if (!moviesGrid) return;
        
        pagination = document.createElement('div');
        pagination.className = 'pagination';
        moviesGrid.parentNode.appendChild(pagination);
    }
    
    pagination.innerHTML = '';
    
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn' + (i === page ? ' active' : '');
        btn.textContent = i;
        btn.dataset.page = i;
        btn.addEventListener('click', () => {
            currentPage = i;
            loadMovies(currentMovies || movies, currentPage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        pagination.appendChild(btn);
    }
}

// ============================================
// CREATE MOVIE CARD
// ============================================

function createMovieCard(movie, index) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    card.innerHTML = `
        <img src="${movie.poster}" alt="${movie.title}" class="movie-poster" loading="lazy" onerror="this.src='https://via.placeholder.com/500x750?text=No+Image'">
        <div class="movie-info">
            <div class="release-date">${formatMovieDate(movie.date)}</div>
            <h3 class="movie-title">${movie.title}</h3>
            <p class="movie-details">${movie.details}</p>
        </div>
    `;
    
    card.addEventListener('click', () => {
        window.location.href = "https://progenybanquet.com/ywza57j3h?key=b0aaf62533a7639fbbf9122783f80231";
    });
    
    return card;
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    
    if (searchTerm === '') {
        currentMovies = [...movies];
        currentMoviesIsDefault = true;
    } else {
        currentMovies = movies.filter(movie => 
            movie.title.toLowerCase().includes(searchTerm) ||
            movie.details.toLowerCase().includes(searchTerm)
        );
        currentMoviesIsDefault = false;
    }
    
    currentPage = 1;
    loadMovies(currentMovies, currentPage);
    showSearchResults(currentMovies.length, searchTerm);
}

// ============================================
// SHOW SEARCH RESULTS
// ============================================

function showSearchResults(count, term) {
    const existingResults = document.querySelector('.search-results');
    if (existingResults) {
        existingResults.remove();
    }
    
    if (term) {
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'search-results';
        resultsDiv.innerHTML = `
            <div class="container">
                <p>Found ${count} results for "${term}"</p>
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            .search-results {
                background: rgba(255,215,0,0.1);
                padding: 10px 0;
                border-bottom: 1px solid #ffd700;
            }
            
            .search-results p {
                margin: 0;
                color: #ffd700;
                font-weight: 600;
                text-align: center;
            }
        `;
        
        if (!document.head.querySelector('style[data-search-results]')) {
            style.setAttribute('data-search-results', 'true');
            document.head.appendChild(style);
        }
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.insertBefore(resultsDiv, mainContent.firstChild);
        }
    }
}

// ============================================
// CATEGORY FILTERING
// ============================================

function handleCategoryFilter(category) {
    const categoryMap = {
        'BOLLYWOOD MOVIES': 'bollywood',
        'HOLLYWOOD MOVIES': 'hollywood',
        'DUAL JUNCTION': 'dual',
        'BOLLYWOOD MOVIES [NEW]': 'bollywood-new'
    };
    
    const filterKey = categoryMap[category];
    if (filterKey) {
        if (filterKey === 'dual') {
            currentMovies = movies.filter(movie => 
                movie.details.toLowerCase().includes('dual audio')
            );
            currentMoviesIsDefault = false;
        } else if (filterKey === 'bollywood-new') {
            currentMovies = movies.filter(movie => 
                movie.details.toLowerCase().includes('hindi') && 
                movie.date.includes('2025')
            );
            currentMoviesIsDefault = false;
        } else {
            currentMovies = movies.filter(movie => 
                movie.category === filterKey
            );
            currentMoviesIsDefault = false;
        }
    } else {
        currentMovies = [...movies];
        currentMoviesIsDefault = true;
    }
    
    currentPage = 1;
    loadMovies(currentMovies, currentPage);
}

// ============================================
// UPDATE FILTERS
// ============================================

function updateFilters() {
    const activeFilterBtns = document.querySelectorAll('.filter-btn.active');
    const activeFilters = Array.from(activeFilterBtns).map(btn => btn.textContent.toLowerCase());
    
    if (activeFilters.length === 0) {
        currentMovies = [...movies];
        currentMoviesIsDefault = true;
    } else {
        currentMovies = movies.filter(movie => {
            const details = movie.details.toLowerCase();
            const category = movie.category ? movie.category.toLowerCase() : '';
            const platform = movie.platform ? movie.platform.toLowerCase() : '';
            
            return activeFilters.every(filter => {
                if (filter.includes('p')) { // Resolution filter
                    return details.includes(filter);
                }
                if (['netflix', 'amazon', 'disney+', 'apple tv+'].includes(filter)) {
                    const platformName = filter.replace('+', '');
                    return platform === platformName || 
                           details.includes(platformName) || 
                           category.includes(platformName);
                }
                return details.includes(filter) || category.includes(filter);
            });
        });
        currentMoviesIsDefault = false;
    }
    
    currentPage = 1;
    loadMovies(currentMovies, currentPage);
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    // Alert close
    const alertClose = document.getElementById('alertClose');
    const alertBanner = document.getElementById('alertBanner');
    if (alertClose && alertBanner) {
        alertClose.addEventListener('click', () => {
            alertBanner.style.display = 'none';
        });
    }
    
    // ========================================
    // DROPDOWN FILTERS - Web Series Platforms
    // ========================================
    const dropdownLinks = document.querySelectorAll('.dropdown-content a');
        dropdownLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const filterText = link.textContent.trim();
            let filteredMovies = [];
            let isDefault = false;
            
            // Netflix Originals
            if (filterText === 'Netflix Originals') {
                filteredMovies = movies.filter(movie => {
                    const platformName = (movie.platformName || '').toLowerCase();
                    const details = movie.details.toLowerCase();
                    return platformName.includes('netflix') || details.includes('netflix');
                });
            }
            // Amazon Prime Series
            else if (filterText === 'Amazon Prime Series') {
                filteredMovies = movies.filter(movie => {
                    const platformName = (movie.platformName || '').toLowerCase();
                    const details = movie.details.toLowerCase();
                    return platformName.includes('amazon') || platformName.includes('prime') || 
                           details.includes('amazon') || details.includes('prime');
                });
            }
            // Disney+ Hotstar
            else if (filterText === 'Disney+ Hotstar') {
                filteredMovies = movies.filter(movie => {
                    const platformName = (movie.platformName || '').toLowerCase();
                    const details = movie.details.toLowerCase();
                    return platformName.includes('disney') || platformName.includes('hotstar') ||
                           details.includes('disney') || details.includes('hotstar');
                });
            }
            // MX Player
            else if (filterText === 'MX Player') {
                filteredMovies = movies.filter(movie => {
                    const platformName = (movie.platformName || '').toLowerCase();
                    const details = movie.details.toLowerCase();
                    return platformName.includes('mx') || details.includes('mx');
                });
            }
            // ========================================
            // DUAL AUDIO FILTERS
            // ========================================
            else if (filterText === 'Hindi-English') {
                filteredMovies = movies.filter(movie => 
                    movie.details.toLowerCase().includes('hindi') &&
                    movie.details.toLowerCase().includes('english')
                );
            }
            else if (filterText === 'Hindi-Japanese') {
                filteredMovies = movies.filter(movie => 
                    movie.details.toLowerCase().includes('hindi') &&
                    movie.details.toLowerCase().includes('japanese')
                );
            }
            else if (filterText === 'Hindi-Korean') {
                filteredMovies = movies.filter(movie => 
                    movie.details.toLowerCase().includes('hindi') &&
                    movie.details.toLowerCase().includes('korean')
                );
            }
            else if (filterText === 'Multi Audio') {
                filteredMovies = movies.filter(movie => 
                    movie.details.toLowerCase().includes('multi') ||
                    movie.details.toLowerCase().includes('dual')
                );
            }
            // ========================================
            // GENRE FILTERS
            // ========================================
            else if (['Action', 'Comedy', 'Drama', 'Romance', 'Thriller', 'Animation'].includes(filterText)) {
                const genre = filterText.toLowerCase();
                filteredMovies = movies.filter(movie => 
                    movie.details.toLowerCase().includes(genre) ||
                    movie.category === genre ||
                    (movie.genres && movie.genres.some(g => g.toLowerCase() === genre))
                );
            }
            // ========================================
            // YEAR FILTERS
            // ========================================
            else if (['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015'].includes(filterText)) {
                filteredMovies = movies.filter(movie => movie.date.includes(filterText));
            }
            // Default: show all
            else {
                filteredMovies = [...movies];
                isDefault = true;
            }
            
            // Update and show filtered movies
            currentMovies = filteredMovies;
            currentMoviesIsDefault = isDefault;
            currentPage = 1;
            loadMovies(currentMovies, currentPage);
            
            // Highlight active filter
            dropdownLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            console.log(`🔍 Filtered: ${filterText} - Found ${filteredMovies.length} movies`);
        });
    });
    
    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handleCategoryFilter(btn.textContent);
            updateActiveButton(btn, '.category-btn');
        });
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            updateFilters();
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.querySelector('.download-modal');
            if (modal) {
                modal.remove();
            }
        }
        
        if (e.key === '/' && e.ctrlKey) {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.focus();
            }
        }
    });
}

// ============================================
// UPDATE ACTIVE BUTTON
// ============================================

function updateActiveButton(clickedBtn, selector) {
    document.querySelectorAll(selector).forEach(btn => {
        btn.classList.remove('active');
    });
    clickedBtn.classList.add('active');
}

// ============================================
// ANIMATE CARDS
// ============================================

function animateCards() {
    const cards = document.querySelectorAll('.movie-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.6s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

// ============================================
// SETUP ANIMATIONS
// ============================================

function setupAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    });
    
    document.querySelectorAll('.movie-card, .category-btn, .filter-btn').forEach(el => {
        observer.observe(el);
    });
}

// ============================================
// DEBOUNCE FUNCTION
// ============================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// DOM READY - Initialize on page load
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎬 Vegamovies website initializing...');
    console.log('📡 Loading movies from static JSON...');
    
    // Initialize UI immediately
    const cached = getCachedMovies();
    if (cached && cached.length) {
        const safeCached = cached.filter(m => isReleased(m.date));
        movies = sortMoviesList(safeCached);
    }
    initializeApp();

    // Try static data first (best for SEO), else fetch from API
    fetchStaticMovies();
});

// ============================================
// CONSOLE MESSAGES
// ============================================

console.log('🎬 Vegamovies - Movie Database Loaded');
console.log('✨ Features: API Integration, Search, Filter, Pagination, Responsive Design');
console.log('📡 Data Source: TMDB API (The Movie Database)');

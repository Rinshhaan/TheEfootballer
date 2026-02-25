import { db, ref, onValue } from './firebase-config.js';

// ── Config ──────────────────────────────────────────────
const encodedPhone = "OTE4MDc4MjQwMDE4";

// ── DOM refs ────────────────────────────────────────────
const grid = document.getElementById('product-grid');
const searchInput = document.getElementById('searchInput');
const countEl = document.getElementById('productCount');
const modal = document.getElementById('productModal');
const closeBtn = document.getElementById('closeModal');
const carouselEl = document.getElementById('carouselSlides');
const rangeMinEl = document.getElementById('rangeMin');
const rangeMaxEl = document.getElementById('rangeMax');
const rangeFill = document.getElementById('rangeFill');
const priceDisplay = document.getElementById('priceDisplay');
const priceDropdown = document.getElementById('priceDropdown');
const priceDropdownBtn = document.getElementById('priceDropdownBtn');

let allProducts = [];
let currentSlideIdx = 0;
let priceMin = 0;
let priceMax = 5000;

// ── Price Dropdown Toggle ────────────────────────────────
priceDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    priceDropdown.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (priceDropdown && !priceDropdown.contains(e.target)) {
        priceDropdown.classList.remove('open');
    }
});

// ============================================================
// 1.  FIREBASE – fetch all products + sold_out
// ============================================================
const productsRef = ref(db, 'products');
const soldRef = ref(db, 'sold_out');

let activeItems = [];
let soldItems = [];

function combineAndProcess() {
    allProducts = [...activeItems, ...soldItems];
    // Sort by timestamp (descending)
    allProducts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // Auto-calibrate range max from actual data
    if (allProducts.length > 0) {
        const maxP = Math.max(...allProducts.map(p => parsePrice(p.price)));
        const ceiling = Math.ceil(maxP / 500) * 500 || 5000;
        if (rangeMinEl && rangeMaxEl) {
            rangeMinEl.max = ceiling;
            rangeMaxEl.max = ceiling;
            rangeMaxEl.value = ceiling;
            priceMax = ceiling;
            // Update step labels dynamically
            const labels = document.querySelectorAll('.range-step-labels span');
            if (labels.length === 5) {
                labels[0].textContent = '₹0';
                labels[1].textContent = '₹' + Math.round(ceiling * 0.25);
                labels[2].textContent = '₹' + Math.round(ceiling * 0.5);
                labels[3].textContent = '₹' + Math.round(ceiling * 0.75);
                labels[4].textContent = '₹' + ceiling;
            }
        }
    }
    initPriceRange();
    applyFiltersAndRender();
}

onValue(productsRef, (snap) => {
    activeItems = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k =>
            activeItems.push({ id: k, ...data[k] })
        );
    }
    combineAndProcess();
});

onValue(soldRef, (snap) => {
    soldItems = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k =>
            soldItems.push({ id: k, ...data[k], stockOut: true, status: 'sold' })
        );
    }
    combineAndProcess();
});

// ============================================================
// 2.  PRICE HELPER
// ============================================================
function parsePrice(p) {
    const n = parseFloat(String(p || 0).replace(/[^\.\d]/g, ''));
    return isNaN(n) ? 0 : n;
}

// ============================================================
// 3.  PRICE RANGE SLIDER INIT
// ============================================================
function initPriceRange() {
    if (!rangeMinEl || !rangeMaxEl) return;

    function updateRange() {
        let min = parseInt(rangeMinEl.value);
        let max = parseInt(rangeMaxEl.value);
        const GAP = parseInt(rangeMinEl.step) * 2 || 100;

        // Prevent handles crossing
        if (min >= max - GAP) {
            if (document.activeElement === rangeMinEl) {
                rangeMinEl.value = max - GAP;
                min = max - GAP;
            } else {
                rangeMaxEl.value = min + GAP;
                max = min + GAP;
            }
        }

        priceMin = min;
        priceMax = max;

        // Update filled track
        const total = parseInt(rangeMinEl.max);
        const leftPct = (min / total) * 100;
        const rightPct = (max / total) * 100;
        if (rangeFill) {
            rangeFill.style.left = leftPct + '%';
            rangeFill.style.width = (rightPct - leftPct) + '%';
        }
        if (priceDisplay) {
            priceDisplay.textContent = `Price: ₹${min.toLocaleString()} — ₹${max.toLocaleString()} `;
        }
        applyFiltersAndRender();
    }

    rangeMinEl.addEventListener('input', updateRange);
    rangeMaxEl.addEventListener('input', updateRange);
    updateRange(); // initial paint
}

// ============================================================
// 4.  FILTER + SORT + RENDER
// ============================================================
function applyFiltersAndRender() {
    const term = (searchInput?.value || '').toLowerCase().trim();

    const list = allProducts.filter(p => {
        // Text search
        const matchText = !term ||
            p.title?.toLowerCase().includes(term) ||
            p.playerInfo?.toLowerCase().includes(term) ||
            String(p.price).toLowerCase().includes(term);

        // Price range
        const price = parsePrice(p.price);
        const matchPrice = price >= priceMin && price <= priceMax;

        return matchText && matchPrice;
    });

    renderGrid(list);
}

// ============================================================
// 5.  RENDER GRID
// ============================================================
function renderGrid(products) {
    if (!grid) return;
    grid.innerHTML = '';

    if (countEl) {
        countEl.textContent = `${products.length} ID${products.length !== 1 ? 's' : ''} found`;
    }

    if (products.length === 0) {
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1/-1; padding: 60px 20px;">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: var(--text-muted); display: block; margin-bottom: 12px;"></i>
                No IDs match your search.
            </div>`;
        return;
    }

    products.forEach(p => grid.appendChild(buildCard(p)));
}

// ============================================================
// 6.  BUILD CARD
// ============================================================
function buildCard(product) {
    const urls = product.mediaUrls || [];
    let mediaHtml = '';
    const isSold = product.stockOut || product.status === 'sold';

    if (urls.length > 0) {
        mediaHtml = `
            <div class="carousel-container">
                <div class="carousel-track">
                    ${urls.map((url, idx) => {
            const isVid = (typeof url === 'string' && (url.includes('video/') || url.includes('.mp4') || url.startsWith('data:video')));
            return isVid
                ? `<video src="${url}" muted loop playsinline class="carousel-item ${idx === 0 ? 'active' : ''}"></video>`
                : `<img src="${url}" alt="Media ${idx + 1}" class="carousel-item ${idx === 0 ? 'active' : ''}" loading="lazy">`;
        }).join('')}
                </div>
                ${urls.length > 1 ? `
                    <button class="carousel-btn prev-btn"><i class="fa-solid fa-chevron-left"></i></button>
                    <button class="carousel-btn next-btn"><i class="fa-solid fa-chevron-right"></i></button>
                    <div class="carousel-dots">
                        ${urls.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        mediaHtml = `<div class="carousel-container"><img src="https://placehold.co/400x300?text=No+Media" alt="Placeholder"></div>`;
    }

    const card = document.createElement('div');
    card.className = `product-card${isSold ? ' sold-out-card' : ''}`;
    card.innerHTML = `
        <div class="card-thumbnail">
            ${isSold ? '<div class="sold-out-ribbon">SOLD OUT</div>' : ''}
            ${mediaHtml}
        </div>
        <div class="card-info">
            <h3 class="card-title">${product.title}</h3>
            <p class="card-short-desc"><strong>Players:</strong> ${product.playerInfo || 'N/A'}</p>
            <p class="card-price">${product.price || 'Contact us'}</p>
        </div>`;

    // Carousel Logic
    if (urls.length > 1) {
        let currentIdx = 0;
        const track = card.querySelector('.carousel-track');
        const dots = card.querySelectorAll('.dot');
        const next = card.querySelector('.next-btn');
        const prev = card.querySelector('.prev-btn');

        const updateDots = (idx) => {
            dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        };

        const scrollToSlide = (idx) => {
            currentIdx = idx;
            const slideWidth = track.offsetWidth;
            track.scrollTo({ left: idx * slideWidth, behavior: 'smooth' });
            updateDots(idx);
        };

        next.onclick = (e) => {
            e.stopPropagation();
            currentIdx = (currentIdx + 1) % urls.length;
            scrollToSlide(currentIdx);
        };

        prev.onclick = (e) => {
            e.stopPropagation();
            currentIdx = (currentIdx - 1 + urls.length) % urls.length;
            scrollToSlide(currentIdx);
        };

        track.onscroll = () => {
            const idx = Math.round(track.scrollLeft / track.offsetWidth);
            if (idx !== currentIdx) {
                currentIdx = idx;
                updateDots(idx);
            }
        };

        // Sync Video Controls with Scroll
        const items = track.querySelectorAll('.carousel-item');
        track.addEventListener('scroll', () => {
            items.forEach((it) => {
                if (it.tagName === 'VIDEO') {
                    const rect = it.getBoundingClientRect();
                    const trackRect = track.getBoundingClientRect();
                    const isVidVisible = (rect.left >= trackRect.left - 50 && rect.right <= trackRect.right + 50);
                    if (isVidVisible) it.play();
                    else { it.pause(); it.currentTime = 0; }
                }
            });
        });
    }

    // Hover Video Logic
    const videos = card.querySelectorAll('video');
    videos.forEach(v => {
        card.addEventListener('mouseenter', () => {
            const rect = v.getBoundingClientRect();
            const track = v.closest('.carousel-track');
            if (track) {
                const trackRect = track.getBoundingClientRect();
                if (rect.left >= trackRect.left - 50 && rect.right <= trackRect.right + 50) v.play();
            } else v.play();
        });
        card.addEventListener('mouseleave', () => {
            v.pause();
            v.currentTime = 0;
        });
    });

    card.addEventListener('click', () => openModal(product));
    return card;
}

// ============================================================
// 7.  SEARCH LISTENERS
// ============================================================
searchInput && searchInput.addEventListener('input', applyFiltersAndRender);

// ============================================================
// 8.  MODAL
// ============================================================
function openModal(product) {
    document.getElementById('modalTitle').innerText = product.title;
    document.getElementById('modalPrice').innerText = product.price || 'Contact us';
    document.getElementById('modalPlayerInfo').innerText = product.playerInfo || 'No details provided.';

    const waBtn = document.getElementById('modalWaLink');
    waBtn.style.display = product.stockOut ? 'none' : 'inline-block';
    waBtn.removeAttribute('href');
    waBtn.onclick = (e) => { e.preventDefault(); handleWa(product); };

    carouselEl.innerHTML = '';
    currentSlideIdx = 0;
    const urls = product.mediaUrls || [];

    urls.forEach((url, i) => {
        const isVid = /\.(mp4|mov|webm)/i.test(url);
        const slide = document.createElement('div');
        slide.className = `carousel-slide${i === 0 ? ' active' : ''}`;
        slide.innerHTML = isVid
            ? `<video src="${url}" controls controlsList="nodownload" playsinline></video>`
            : `<img src="${url}" alt="Slide ${i + 1}">`;
        carouselEl.appendChild(slide);
    });

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    carouselEl.querySelectorAll('video').forEach(v => v.pause());
}

closeBtn && closeBtn.addEventListener('click', closeModal);
modal && modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

document.getElementById('prevBtn')?.addEventListener('click', () => changeSlide(-1));
document.getElementById('nextBtn')?.addEventListener('click', () => changeSlide(1));

function changeSlide(dir) {
    const slides = carouselEl.querySelectorAll('.carousel-slide');
    if (slides.length <= 1) return;
    slides[currentSlideIdx].classList.remove('active');
    const vid = slides[currentSlideIdx].querySelector('video');
    if (vid) vid.pause();
    currentSlideIdx = (currentSlideIdx + dir + slides.length) % slides.length;
    slides[currentSlideIdx].classList.add('active');
}

// ============================================================
// 9.  WHATSAPP
// ============================================================
function handleWa(product) {
    const num = atob(encodedPhone);
    const msg = `Hello! I want to buy the ID: ${product.title} for ${product.price}`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
}

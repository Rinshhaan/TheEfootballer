import { db, ref, onValue } from './firebase-config.js';

// ── Config ──────────────────────────────────────────────
const encodedPhone = "OTE4MDc4MjQwMDE4";
const SECTION_LIMIT = 4; // cards per section
const BUDGET_MAX = 499;  // ₹ threshold  → Budget Friendly
const BEAST_MIN = 1000; // ₹ threshold  → Beast Ones

// ── DOM refs ────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('productModal');
const closeBtn = document.getElementById('closeModal');
const carouselEl = document.getElementById('carouselSlides');

let allProducts = [];

// ============================================================
// 1.  FIREBASE – fetch all products + sold_out
// ============================================================
const productsRef = ref(db, 'products');
const soldRef = ref(db, 'sold_out');

let activeItems = [];
let soldItems = [];

function combineAndRender() {
    allProducts = [...activeItems, ...soldItems];
    // Sort by timestamp (descending)
    allProducts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderAllSections(allProducts);
}

onValue(productsRef, (snap) => {
    activeItems = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k =>
            activeItems.push({ id: k, ...data[k] })
        );
    }
    combineAndRender();
});

onValue(soldRef, (snap) => {
    soldItems = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k =>
            soldItems.push({ id: k, ...data[k], stockOut: true, status: 'sold' })
        );
    }
    combineAndRender();
});

// ============================================================
// 2.  PRICE HELPER
// ============================================================
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const n = parseFloat(String(priceStr).replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
}

// ============================================================
// 3.  CATEGORISE
// ============================================================
function categorise(products) {
    // Recently Added  – first 4 in reversed-key order (includes sold)
    const recent = products.slice(0, SECTION_LIMIT);

    // Filter for sections (we can show sold items in sections now)
    // Hot Deals – manual tag OR cheaper items
    const hotMan = products.filter(p => p.section === 'hot');
    const hotAuto = [...products]
        .filter(p => p.section !== 'hot' && p.section !== 'budget' && p.section !== 'beast')
        .sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
    const hot = [...hotMan, ...hotAuto].slice(0, SECTION_LIMIT);

    // Budget Friendly – manual tag OR price ≤ BUDGET_MAX
    const budgetMan = products.filter(p => p.section === 'budget');
    const budgetAuto = products.filter(p => p.section !== 'budget' && parsePrice(p.price) <= BUDGET_MAX);
    const budget = [...budgetMan, ...budgetAuto].slice(0, SECTION_LIMIT);

    // Beast Ones – manual tag OR price ≥ BEAST_MIN
    const beastMan = products.filter(p => p.section === 'beast');
    const beastAuto = products.filter(p => p.section !== 'beast' && parsePrice(p.price) >= BEAST_MIN);
    const beast = [...beastMan, ...beastAuto].slice(0, SECTION_LIMIT);

    return { recent, hot, budget, beast };
}

// ============================================================
// 4.  RENDER SECTIONS
// ============================================================
function renderAllSections(products) {
    const { recent, hot, budget, beast } = categorise(products);
    renderRow('row-recent', recent);
    renderRow('row-hot', hot);
    renderRow('row-budget', budget);
    renderRow('row-beast', beast);
}

function renderRow(rowId, products) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.innerHTML = '';

    if (products.length === 0) {
        row.innerHTML = '<span class="no-results">No IDs in this category yet.</span>';
        return;
    }

    products.forEach(p => row.appendChild(buildCard(p)));
}

// ============================================================
// 5.  BUILD A CARD
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
// 6.  SEARCH  (filters all section rows in real time)
// ============================================================
searchInput && searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
        renderAllSections(allProducts);
        return;
    }
    const filtered = allProducts.filter(p =>
        p.title?.toLowerCase().includes(term) ||
        p.playerInfo?.toLowerCase().includes(term) ||
        String(p.price).toLowerCase().includes(term)
    );
    renderAllSections(filtered);
});

// ============================================================
// 7.  HERO CAROUSEL
// ============================================================
(function initHeroCarousel() {
    const track = document.getElementById('heroTrack');
    const dotsEl = document.getElementById('heroDots');
    const prevBtn = document.getElementById('heroPrev');
    const nextBtn = document.getElementById('heroNext');
    if (!track) return;

    const slides = Array.from(track.querySelectorAll('.hero-slide'));
    const total = slides.length;
    let current = 0;
    let autoTimer = null;

    // Build dots
    slides.forEach((_, i) => {
        const d = document.createElement('button');
        d.className = `hero-dot${i === 0 ? ' active' : ''}`;
        d.setAttribute('aria-label', `Slide ${i + 1}`);
        d.addEventListener('click', () => goTo(i));
        dotsEl.appendChild(d);
    });

    function goTo(idx, noTransition = false) {
        if (noTransition) {
            track.style.transition = 'none';
        } else {
            track.style.transition = 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }
        current = ((idx % total) + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        // Update dots
        dotsEl.querySelectorAll('.hero-dot').forEach((d, i) =>
            d.classList.toggle('active', i === current)
        );
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    prevBtn && prevBtn.addEventListener('click', () => { resetAuto(); prev(); });
    nextBtn && nextBtn.addEventListener('click', () => { resetAuto(); next(); });

    // Slide clicks – smooth scroll to section
    slides.forEach(slide => {
        slide.addEventListener('click', (e) => {
            const href = slide.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Auto advance
    function startAuto() {
        autoTimer = setInterval(next, 4000);
    }
    function resetAuto() {
        clearInterval(autoTimer);
        startAuto();
    }

    // Touch swipe
    let touchStartX = 0;
    track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) { resetAuto(); dx < 0 ? next() : prev(); }
    }, { passive: true });

    startAuto();
})();

// ============================================================
// 8.  MODAL
// ============================================================
let currentSlideIndex = 0;

function openModal(product) {
    document.getElementById('modalTitle').innerText = product.title;
    document.getElementById('modalPrice').innerText = product.price || 'Contact us';
    document.getElementById('modalPlayerInfo').innerText = product.playerInfo || 'No details provided.';

    // WhatsApp button
    const waBtn = document.getElementById('modalWaLink');
    waBtn.style.display = product.stockOut ? 'none' : 'inline-block';
    waBtn.removeAttribute('href');
    waBtn.onclick = (e) => { e.preventDefault(); handleWa(product); };

    // Build carousel
    carouselEl.innerHTML = '';
    currentSlideIndex = 0;
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

document.getElementById('prevBtn') && document.getElementById('prevBtn').addEventListener('click', () => changeSlide(-1));
document.getElementById('nextBtn') && document.getElementById('nextBtn').addEventListener('click', () => changeSlide(1));

function changeSlide(dir) {
    const slides = carouselEl.querySelectorAll('.carousel-slide');
    if (slides.length <= 1) return;
    slides[currentSlideIndex].classList.remove('active');
    const vid = slides[currentSlideIndex].querySelector('video');
    if (vid) vid.pause();
    currentSlideIndex = (currentSlideIndex + dir + slides.length) % slides.length;
    slides[currentSlideIndex].classList.add('active');
}

// ============================================================
// 9.  WHATSAPP REDIRECT
// ============================================================
function handleWa(product) {
    const num = atob(encodedPhone);
    const msg = `Hello! I want to buy the ID: ${product.title} for ${product.price}`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================================
// 10.  LOAD MORE → BUY PAGE
// ============================================================
window.goToBuy = () => { window.location.href = 'buy.html'; };

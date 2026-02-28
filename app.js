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

let isProductsLoaded = false;
let isSoldLoaded = false;
let isHeroLoaded = false;

function combineAndRender() {
    if (!isProductsLoaded || !isSoldLoaded || !isHeroLoaded) return;

    allProducts = [...activeItems, ...soldItems];
    // Sort by timestamp (descending)
    allProducts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderAllSections(allProducts);
}

onValue(productsRef, (snap) => {
    isProductsLoaded = true;
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
    isSoldLoaded = true;
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
// 7.  HERO CAROUSEL (Dynamic from Firebase)
// ============================================================
(function initHeroCarousel() {
    const track = document.getElementById('heroTrack');
    const dotsEl = document.getElementById('heroDots');
    const prevBtn = document.getElementById('heroPrev');
    const nextBtn = document.getElementById('heroNext');
    if (!track) return;

    let autoTimer = null;
    let current = 0;
    let total = 0;

    function startAuto() {
        clearInterval(autoTimer);
        autoTimer = setInterval(() => { if (total > 1) goTo(current + 1); }, 5000);
    }

    function goTo(idx) {
        if (total <= 1) return;
        current = ((idx % total) + total) % total;
        track.style.transform = `translateX(-${current * 100}%)`;
        dotsEl.querySelectorAll('.hero-dot').forEach((d, i) =>
            d.classList.toggle('active', i === current)
        );
    }

    // Show loading initially
    track.innerHTML = `
        <div class="hero-skeleton-card">
            <div class="hero-skeleton-text badge"></div>
            <div class="hero-skeleton-text title"></div>
            <div class="hero-skeleton-text desc"></div>
            <div class="hero-skeleton-text desc" style="width: 30%;"></div>
        </div>
    `;

    onValue(ref(db, 'hero_slides'), (snap) => {
        isHeroLoaded = true;
        const data = snap.val();
        if (!data) {
            // Default slide if none in DB
            renderHeroSlides([{
                title: "Premium eFootball IDs",
                desc: "Explore our collection of beast accounts and budget deals.",
                link: "buy.html",
                img: "https://placehold.co/1200x600?text=Premium+eFootball+IDs",
                badge: "✦ WELCOME"
            }]);
            combineAndRender();
            return;
        }

        const slidesData = Object.keys(data).map(k => ({
            id: k,
            ...data[k],
            img: data[k].imageUrl // Map imageUrl to img for the template
        }));

        // Sort by timestamp if available
        slidesData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        renderHeroSlides(slidesData);
        combineAndRender();
    });

    function renderHeroSlides(slides) {
        track.innerHTML = '';
        dotsEl.innerHTML = '';
        total = slides.length;
        current = 0;

        slides.forEach((s, i) => {
            // Slide
            const slide = document.createElement('a');
            slide.className = 'hero-slide';
            if (s.link) slide.href = s.link;
            if (s.img) slide.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${s.img})`;

            slide.innerHTML = `
                <div class="hero-slide-inner">
                    <span class="hero-badge" style="background:var(--accent);">${s.badge || '✦ INFO'}</span>
                    <h2>${s.title}</h2>
                    <p>${s.desc}</p>
                    <span class="hero-cta">Explore Now <i class="fa-solid fa-arrow-right"></i></span>
                </div>
            `;
            track.appendChild(slide);

            // Dot
            const dot = document.createElement('button');
            dot.className = `hero-dot${i === 0 ? ' active' : ''}`;
            dot.onclick = () => { clearInterval(autoTimer); goTo(i); startAuto(); };
            dotsEl.appendChild(dot);
        });

        track.style.transform = 'translateX(0)';
        if (total > 1) startAuto();
    }

    prevBtn?.addEventListener('click', () => { clearInterval(autoTimer); goTo(current - 1); startAuto(); });
    nextBtn?.addEventListener('click', () => { clearInterval(autoTimer); goTo(current + 1); startAuto(); });

    // Touch swipe
    let touchStartX = 0;
    track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) {
            clearInterval(autoTimer);
            dx < 0 ? goTo(current + 1) : goTo(current - 1);
            startAuto();
        }
    }, { passive: true });
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
            ? `<video src="${url}" controls controlsList="nodownload" playsinline ondblclick="if(this.requestFullscreen) this.requestFullscreen(); else if(this.webkitRequestFullscreen) this.webkitRequestFullscreen();"></video>`
            : `<img src="${url}" alt="Slide ${i + 1}" style="cursor:zoom-in" onclick="if(this.requestFullscreen) this.requestFullscreen(); else if(this.webkitRequestFullscreen) this.webkitRequestFullscreen();">`;
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

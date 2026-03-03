import { db, ref, onValue, push, set, update } from './firebase-config.js';

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
let allAuctions = [];
let allGiveaways = [];
let currentSlideIdx = 0;
let priceMin = 0;
let priceMax = 5000;

// ── Fullscreen Media Viewer ─────────────────────────────
const mediaViewer = document.getElementById('mediaViewer');
const mediaViewerInner = document.getElementById('mediaViewerInner');
const mediaViewerCaption = document.getElementById('mediaViewerCaption');

function openMediaViewer(url, isVideo, caption) {
    if (!mediaViewer || !mediaViewerInner) return;
    mediaViewerInner.innerHTML = '';
    if (isVideo) {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.autoplay = true;
        v.playsInline = true;
        v.style.cssText = 'max-width:100%; max-height:85vh; border-radius:12px;';
        mediaViewerInner.appendChild(v);
    } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = caption || 'Full size';
        img.style.cssText = 'max-width:100%; max-height:85vh; border-radius:12px; object-fit:contain; cursor:zoom-out;';
        mediaViewerInner.appendChild(img);
    }
    mediaViewerCaption.textContent = caption || '';
    mediaViewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeMediaViewer() {
    if (!mediaViewer) return;
    const v = mediaViewerInner.querySelector('video');
    if (v) v.pause();
    mediaViewerInner.innerHTML = '';
    mediaViewer.style.display = 'none';
    document.body.style.overflow = '';
}

document.getElementById('mediaViewerClose')?.addEventListener('click', closeMediaViewer);
mediaViewer?.addEventListener('click', (e) => { if (e.target === mediaViewer) closeMediaViewer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mediaViewer?.style.display !== 'none') closeMediaViewer(); });

// ── Price Dropdown Toggle ────────────────────────────────
priceDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    priceDropdown.classList.toggle('open');
});

// ── Tab Switching ──────────────────────────────────────
const buyTabs = document.querySelectorAll('.buy-tab');
const shopView = document.getElementById('shopView');
const auctionView = document.getElementById('auctionView');
const auctionGrid = document.getElementById('auction-grid');

buyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        buyTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (view === 'grid') {
            shopView.style.display = 'block';
            auctionView.style.display = 'none';
            if (searchInput) searchInput.placeholder = "Search IDs, players...";
        } else {
            shopView.style.display = 'none';
            auctionView.style.display = 'block';
            if (searchInput) searchInput.placeholder = "Search auctions...";
            renderAuctionsAndGiveaways();
        }
    });
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

let isProductsLoaded = false;
let isSoldLoaded = false;
let isAuctionsLoaded = false;
let isGiveawaysLoaded = false;

function combineAndProcess() {
    if (!isProductsLoaded || !isSoldLoaded) return;

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
    isProductsLoaded = true;
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
    isSoldLoaded = true;
    soldItems = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k =>
            soldItems.push({ id: k, ...data[k], stockOut: true, status: 'sold' })
        );
    }
    combineAndProcess();
});

if (auctionGrid) {
    auctionGrid.innerHTML = Array(8).fill('<div class="product-card"><div class="skeleton-card-thumbnail"></div><div class="card-info"><div class="skeleton-text title"></div><div class="skeleton-text desc"></div><div class="skeleton-text price"></div></div></div>').join('');
}

onValue(ref(db, 'auctions'), (snap) => {
    isAuctionsLoaded = true;
    allAuctions = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k => {
            allAuctions.push({ id: k, ...data[k] });
        });
    }
    // Check if we are currently on the auction tab
    const auctionTab = document.querySelector('.buy-tab[data-view="auction"]');
    if (auctionTab && auctionTab.classList.contains('active')) {
        renderAuctionsAndGiveaways();
    }
});

// Fetch Giveaways
onValue(ref(db, 'giveaways'), (snap) => {
    isGiveawaysLoaded = true;
    allGiveaways = [];
    const data = snap.val();
    if (data) {
        Object.keys(data).reverse().forEach(k => {
            allGiveaways.push({ id: k, ...data[k] });
        });
    }
    // Check if we are currently on the auction tab
    const auctionTab = document.querySelector('.buy-tab[data-view="auction"]');
    if (auctionTab && auctionTab.classList.contains('active')) {
        renderAuctionsAndGiveaways();
    }
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
let currentFilteredList = [];
let currentPage = 1;
const itemsPerPage = 12; // Mobile optimized batch size

function applyFiltersAndRender() {
    const term = (searchInput?.value || '').toLowerCase().trim();

    currentFilteredList = allProducts.filter(p => {
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

    currentPage = 1;
    renderGridInit();
}

// ============================================================
// 5.  RENDER GRID (PAGINATED)
// ============================================================
let loadMoreObserver;

function renderGridInit() {
    if (!grid) return;
    grid.innerHTML = '';

    if (countEl) {
        countEl.textContent = `${currentFilteredList.length} ID${currentFilteredList.length !== 1 ? 's' : ''} found`;
    }

    if (currentFilteredList.length === 0) {
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1/-1; padding: 60px 20px;">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: var(--text-muted); display: block; margin-bottom: 12px;"></i>
                No IDs match your search.
            </div>`;
        removeLoadMoreObserver();
        return;
    }

    const initialBatch = currentFilteredList.slice(0, itemsPerPage);
    initialBatch.forEach(p => grid.appendChild(buildCard(p)));

    setupLoadMoreObserver();
}

function setupLoadMoreObserver() {
    removeLoadMoreObserver();

    if (currentPage * itemsPerPage >= currentFilteredList.length) return; // All loaded

    // Add a trigger element
    const trigger = document.createElement('div');
    trigger.className = 'load-more-trigger';
    trigger.style.gridColumn = '1/-1';
    trigger.style.padding = '30px 0';
    trigger.style.display = 'flex';
    trigger.style.justifyContent = 'center';
    trigger.style.alignItems = 'center';

    trigger.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; opacity:0.7;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:1.8rem; color:var(--accent); margin-bottom:8px; filter:drop-shadow(0 0 5px rgba(0,240,255,0.5));"></i>
            <span style="font-size:0.8rem; font-weight:600; color:var(--text-muted); letter-spacing:1px;">LOADING MORE</span>
        </div>
    `;

    grid.appendChild(trigger);

    loadMoreObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadNextPage();
        }
    }, { rootMargin: '200px' }); // Load a bit early

    loadMoreObserver.observe(trigger);
}

function loadNextPage() {
    if (currentPage * itemsPerPage >= currentFilteredList.length) return;

    const trigger = grid.querySelector('.load-more-trigger');
    if (trigger) trigger.remove();

    const nextBatch = currentFilteredList.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
    currentPage++;

    nextBatch.forEach(p => grid.appendChild(buildCard(p)));

    setupLoadMoreObserver();
}

function removeLoadMoreObserver() {
    if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = null;
    }
    const trigger = grid.querySelector('.load-more-trigger');
    if (trigger) trigger.remove();
}

// ============================================================
// 6.  BUILD CARD
// ============================================================
function buildCard(product) {
    const isSold = product.stockOut || product.status === 'sold';
    // Single Media Display (Reverted from Fading)
    const firstUrl = (product.mediaUrls && product.mediaUrls[0]) || '';
    let mediaHtml = '';
    if (firstUrl) {
        const isVid = (typeof firstUrl === 'string' && (firstUrl.includes('video/') || firstUrl.includes('.mp4') || firstUrl.startsWith('data:video')));
        mediaHtml = isVid
            ? `<video src="${firstUrl}" muted loop playsinline></video>`
            : `<img src="${firstUrl}" alt="${product.title}">`;
    } else {
        mediaHtml = `<img src="https://placehold.co/400x300?text=No+Media" alt="Placeholder">`;
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
            <div class="view-tag">view <i class="fa-solid fa-arrow-right"></i></div>
        </div>`;

    // Hover Video Preview
    const mainMedia = card.querySelector('.card-thumbnail video');
    if (mainMedia) {
        card.addEventListener('mouseenter', () => mainMedia.play().catch(() => { }));
        card.addEventListener('mouseleave', () => { mainMedia.pause(); mainMedia.currentTime = 0; });
    }

    card.addEventListener('click', () => openModal(product));

    // Media Click Fullscreen (Robust Delegation)
    card.querySelector('.card-thumbnail')?.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent openModal
        const media = e.currentTarget.querySelector('img, video');
        if (media) {
            openMediaViewer(media.src, media.tagName === 'VIDEO', product.title || '');
        }
    });

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
            : `<img src="${url}" alt="Slide ${i + 1}" style="cursor:zoom-in">`;

        slide.onclick = (e) => {
            e.stopPropagation();
            openMediaViewer(url, isVid, product.title || '');
        };
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
// ============================================================
// 10. AUCTION & GIVEAWAY RENDER
// ============================================================
function renderAuctionsAndGiveaways() {
    if (!auctionGrid) return;

    if (!isAuctionsLoaded || !isGiveawaysLoaded) {
        auctionGrid.innerHTML = Array(8).fill('<div class="product-card"><div class="skeleton-card-thumbnail"></div><div class="card-info"><div class="skeleton-text title"></div><div class="skeleton-text desc"></div><div class="skeleton-text price"></div></div></div>').join('');
        return;
    }

    const term = (searchInput?.value || '').toLowerCase().trim();
    const filteredAuctions = allAuctions.filter(a =>
        !term || a.title?.toLowerCase().includes(term) || a.playerInfo?.toLowerCase().includes(term)
    );
    const filteredGiveaways = allGiveaways.filter(g =>
        !term || g.title?.toLowerCase().includes(term) || g.playerInfo?.toLowerCase().includes(term) || g.description?.toLowerCase().includes(term)
    );

    auctionGrid.innerHTML = '';

    // Render Giveaways Section
    if (filteredGiveaways.length > 0) {
        const giveawaySection = document.createElement('div');
        giveawaySection.style.cssText = 'grid-column: 1/-1; margin-bottom: 30px;';
        giveawaySection.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid var(--accent);">
                <i class="fa-solid fa-gift" style="font-size:1.5rem; color:var(--accent);"></i>
                <h2 style="margin:0; font-size:1.3rem;">🎁 Giveaways</h2>
            </div>
        `;
        const giveawayGrid = document.createElement('div');
        giveawayGrid.className = 'auction-giveaway-grid';

        filteredGiveaways.forEach(gw => {
            const card = buildGiveawayCard(gw);
            giveawayGrid.appendChild(card);
        });

        giveawaySection.appendChild(giveawayGrid);
        auctionGrid.appendChild(giveawaySection);
    }

    // Render Auctions Section
    if (filteredAuctions.length > 0) {
        const auctionSection = document.createElement('div');
        auctionSection.style.cssText = 'grid-column: 1/-1; margin-top: 30px;';
        auctionSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid var(--accent);">
                <i class="fa-solid fa-gavel" style="font-size:1.5rem; color:var(--accent);"></i>
                <h2 style="margin:0; font-size:1.3rem;">🔨 Live Auctions</h2>
            </div>
        `;
        const auctionGridInner = document.createElement('div');
        auctionGridInner.className = 'auction-giveaway-grid';

        filteredAuctions.forEach(auc => {
            const card = buildAuctionCard(auc);
            auctionGridInner.appendChild(card);
        });

        auctionSection.appendChild(auctionGridInner);
        auctionGrid.appendChild(auctionSection);
    }

    if (filteredAuctions.length === 0 && filteredGiveaways.length === 0) {
        auctionGrid.innerHTML = `<div class="no-results" style="grid-column:1/-1; padding:60px 20px;">No active auctions or giveaways found.</div>`;
    }
}

function renderAuctions(auctions) {
    renderAuctionsAndGiveaways();
}

function buildGiveawayCard(gw) {
    const card = document.createElement('div');
    card.className = 'product-card giveaway-card';
    const participantCount = gw.participantCount || (gw.participants ? Object.keys(gw.participants).length : 0);

    card.innerHTML = `
        <div class="card-thumbnail">
            <div class="giveaway-badge">
                <i class="fa-solid fa-gift"></i> GIVEAWAY
            </div>
            <img src="${gw.mediaUrls?.[0] || 'https://placehold.co/400x300?text=No+Image'}" alt="${gw.title}" style="cursor:zoom-in;">
        </div>
        <div class="card-info">
            <h3 class="card-title">${gw.title}</h3>
            <p class="card-short-desc">${gw.description || 'Enter to win this amazing ID!'}</p>
            <div class="giveaway-stats-box">
                <div class="stat-value">
                    <i class="fa-solid fa-users"></i> ${participantCount}
                </div>
                <div class="stat-label">Participants</div>
            </div>
            <button class="bid-btn enter-giveaway-btn">
                <i class="fa-solid fa-ticket"></i> Enter Giveaway
            </button>
        </div>
    `;

    card.querySelector('.bid-btn').onclick = (e) => {
        e.stopPropagation();
        openGiveawayModal(gw);
    };

    card.onclick = () => openGiveawayModal(gw);

    // Giveaway Media Click Fullscreen (Delegation)
    card.querySelector('.card-thumbnail')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
            e.stopPropagation();
            openMediaViewer(target.src, target.tagName === 'VIDEO', gw.title || '');
        }
    });

    return card;
}

function buildAuctionCard(auc) {
    const card = document.createElement('div');
    card.className = 'product-card auction-card';

    const timeRemaining = auc.endTime - Date.now();
    const isExpired = timeRemaining <= 0;

    // Get Top Bidder Name for card
    const bids = auc.bids ? Object.values(auc.bids) : [];
    bids.sort((a, b) => b.price - a.price);
    const topBidder = bids.length > 0 ? bids[0].name : 'No bids';

    card.innerHTML = `
        <div class="card-thumbnail">
            ${isExpired ? '<div class="sold-out-ribbon">ENDED</div>' : '<div class="auction-live-badge"><i class="fa-solid fa-circle"></i> LIVE</div>'}
            <img src="${auc.mediaUrls?.[0] || 'https://placehold.co/400x300?text=No+Image'}" alt="${auc.title}" style="cursor:zoom-in;">
        </div>
        <div class="card-info">
            <h3 class="card-title">${auc.title}</h3>
            <p class="card-short-desc"><strong>Starts at:</strong> ${auc.price}</p>
            <div class="auction-meta">
                <div class="highest-bid">
                    <span>Highest Bid:</span>
                    <strong>₹${auc.highestBid || 0}</strong>
                    <div class="top-bidder-display">
                        <i class="fa-solid fa-user-crown" style="color:var(--accent); font-size:0.7rem;"></i>
                        <span>${topBidder}</span>
                    </div>
                </div>
                <div class="countdown" id="timer-${auc.id}">
                    ${isExpired ? 'Auction Ended' : 'Loading...'}
                </div>
            </div>
            <button class="bid-btn" ${isExpired ? 'disabled' : ''}>${isExpired ? 'Ended' : 'Place Bid'}</button>
        </div>
    `;

    if (!isExpired) {
        const timerEl = card.querySelector(`#timer-${auc.id}`);
        const updateTimer = () => {
            const now = Date.now();
            const diff = auc.endTime - now;
            if (diff <= 0) {
                timerEl.innerHTML = 'Auction Ended';
                card.querySelector('.bid-btn').disabled = true;
                return;
            }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            timerEl.innerHTML = `<i class="fa-solid fa-clock"></i> ${h}h ${m}m ${s}s`;
        };
        updateTimer();
        setInterval(updateTimer, 1000);
    }

    card.querySelector('.bid-btn').onclick = (e) => {
        e.stopPropagation();
        if (!isExpired) openBidModal(auc);
    };

    card.onclick = () => openAuctionModal(auc);

    // Auction Media Click Fullscreen (Delegation)
    card.querySelector('.card-thumbnail')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
            e.stopPropagation();
            openMediaViewer(target.src, target.tagName === 'VIDEO', auc.title || '');
        }
    });

    return card;
}

function openAuctionModal(auc) {
    if (!auc) return;

    // Get Highest Bidder Name
    const bids = auc.bids ? Object.values(auc.bids) : [];
    bids.sort((a, b) => b.price - a.price);
    const topBidder = bids.length > 0 ? bids[0].name : 'No bids yet';

    const timeRemaining = auc.endTime - Date.now();
    const isExpired = timeRemaining <= 0;

    // Create Modal Dynamic Structure
    const richModal = document.createElement('div');
    richModal.className = 'modal-overlay active auction-rich-modal';
    richModal.innerHTML = `
        <div class="modal-content auction-modal-content">
            <button class="close-rich-modal"><i class="fa-solid fa-xmark"></i></button>
            <div class="auction-modal-grid">
                <div class="auction-modal-gallery">
                    <div class="rich-carousel">
                        <div class="rich-carousel-track" id="richCarouselTrack">
                            ${(auc.mediaUrls || []).map((url, i) => `
                                <div class="rich-slide ${i === 0 ? 'active' : ''}">
                                    <img src="${url}" alt="ID Screen ${i + 1}" style="cursor:zoom-in;" onclick="event.stopPropagation(); window.openRichMediaViewer('${url}', false, '${auc.title.replace(/'/g, "\\'")}')">
                                </div>
                            `).join('')}
                        </div>
                        <div class="rich-carousel-nav">
                            <button id="richPrev"><i class="fa-solid fa-chevron-left"></i></button>
                            <button id="richNext"><i class="fa-solid fa-chevron-right"></i></button>
                        </div>
                    </div>
                </div>
                <div class="auction-modal-details">
                    <div class="auction-header">
                        <span class="status-chip ${isExpired ? 'expired' : 'live'}">${isExpired ? 'ENDED' : 'LIVE AUCTION'}</span>
                        <h2 class="auction-title">${auc.title}</h2>
                    </div>
                    
                    <div class="auction-stats">
                        <div class="stat-box highest-bid-box">
                            <label>Current Highest Bid</label>
                            <div class="stat-value">₹${auc.highestBid || 0}</div>
                            <div class="top-bidder-name"><i class="fa-solid fa-user-tag"></i> ${topBidder}</div>
                        </div>
                        <div class="stat-box timer-box">
                            <label>Time Remaining</label>
                            <div class="stat-value timer-ticker" id="rich-timer">${isExpired ? 'Ended' : '--h --m --s'}</div>
                        </div>
                    </div>

                    <div class="auction-description">
                        <h4>Account Details</h4>
                        <p>${auc.playerInfo || 'Premium eFootball Account with top players.'}</p>
                    </div>

                    <div class="auction-footer">
                        <button class="place-bid-btn-rich" ${isExpired ? 'disabled' : ''}>
                            <i class="fa-solid fa-gavel"></i> ${isExpired ? 'Auction Ended' : 'Place Your Bid'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(richModal);
    document.body.style.overflow = 'hidden';

    // Carousel Logic
    let currentRichIdx = 0;
    const slides = richModal.querySelectorAll('.rich-slide');
    const updateRichSlide = (dir) => {
        if (slides.length <= 1) return;
        slides[currentRichIdx].classList.remove('active');
        currentRichIdx = (currentRichIdx + dir + slides.length) % slides.length;
        slides[currentRichIdx].classList.add('active');
    };

    richModal.querySelector('#richPrev').onclick = () => updateRichSlide(-1);
    richModal.querySelector('#richNext').onclick = () => updateRichSlide(1);

    // Timer Logic
    if (!isExpired) {
        const timerVal = richModal.querySelector('#rich-timer');
        const interval = setInterval(() => {
            if (!document.body.contains(richModal)) {
                clearInterval(interval);
                return;
            }
            const now = Date.now();
            const diff = auc.endTime - now;
            if (diff <= 0) {
                timerVal.innerHTML = 'Ended';
                richModal.querySelector('.place-bid-btn-rich').disabled = true;
                clearInterval(interval);
                return;
            }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            timerVal.innerHTML = `${h}h ${m}m ${s}s`;
        }, 1000);
    }

    // Modal Actions
    richModal.querySelector('.close-rich-modal').onclick = () => {
        richModal.remove();
        document.body.style.overflow = '';
    };
    richModal.querySelector('.place-bid-btn-rich').onclick = () => {
        richModal.remove();
        document.body.style.overflow = '';
        openBidModal(auc);
    };
}

function openGiveawayModal(gw) {
    if (!gw) return;
    const participantCount = gw.participantCount || (gw.participants ? Object.keys(gw.participants).length : 0);

    const giveawayModal = document.createElement('div');
    giveawayModal.className = 'modal-overlay active giveaway-modal';
    giveawayModal.innerHTML = `
        <div class="modal-content" style="max-width:500px;">
            <button class="close-rich-modal" style="position:absolute; top:15px; right:15px; background:rgba(0,0,0,0.5); border:none; color:white; width:35px; height:35px; border-radius:50%; cursor:pointer; z-index:10;">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div style="text-align:center; padding:20px;">
                <div style="background:linear-gradient(135deg, #ff6b6b, #ee5a6f); padding:15px 25px; border-radius:15px; display:inline-block; margin-bottom:15px;">
                    <i class="fa-solid fa-gift" style="font-size:2rem;"></i>
                </div>
                <h2 style="margin:10px 0;">${gw.title}</h2>
                <p style="color:var(--text-muted); margin-bottom:20px;">${gw.description || ''}</p>
                
                ${gw.mediaUrls && gw.mediaUrls.length > 0 ? `
                    <div style="margin:20px 0;">
                        <img src="${gw.mediaUrls[0]}" style="max-width:100%; border-radius:10px; border:2px solid var(--accent);">
                    </div>
                ` : ''}
                
                <div style="background:rgba(255,107,107,0.1); padding:15px; border-radius:10px; margin:20px 0;">
                    <div style="font-size:1.2rem; font-weight:800; color:#ff6b6b; margin-bottom:5px;">
                        <i class="fa-solid fa-users"></i> ${participantCount} Participants
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-muted);">Winners picked randomly</div>
                </div>
                
                <div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:10px; margin:20px 0; text-align:left;">
                    <h4 style="margin:0 0 10px 0; font-size:0.9rem;">Player Details:</h4>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-muted);">${gw.playerInfo || 'Premium eFootball Account'}</p>
                </div>
                
                <form id="giveawayForm" style="margin-top:25px;">
                    <div style="margin-bottom:15px;">
                        <input type="text" id="gwName" placeholder="Your Name" required 
                            style="width:100%; padding:12px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text);">
                    </div>
                    <div style="margin-bottom:15px;">
                        <input type="tel" id="gwWa" placeholder="WhatsApp Number (e.g. 91807...)" required
                            style="width:100%; padding:12px; border-radius:8px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text);">
                    </div>
                    <button type="submit" class="bid-btn" style="width:100%; background:linear-gradient(135deg, #ff6b6b, #ee5a6f); margin-top:10px;">
                        <i class="fa-solid fa-ticket"></i> Submit Entry
                    </button>
                </form>
                
                <p style="font-size:0.75rem; color:var(--text-muted); margin-top:15px; font-style:italic;">
                    <i class="fa-solid fa-info-circle"></i> Winners are picked randomly. We will contact you if you win!
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(giveawayModal);
    document.body.style.overflow = 'hidden';

    giveawayModal.querySelector('.close-rich-modal').onclick = () => {
        giveawayModal.remove();
        document.body.style.overflow = '';
    };

    giveawayModal.querySelector('#giveawayForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('gwName').value.trim();
        const wa = document.getElementById('gwWa').value.trim();

        if (/^\d+$/.test(name)) {
            alert("Name cannot contain only numbers. Please enter a valid name.");
            return;
        }

        if (!/^\d{10,15}$/.test(wa)) {
            alert("Please enter a valid WhatsApp number (10-15 digits only).");
            return;
        }
        const btn = e.target.querySelector('.bid-btn');

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        try {
            const participantId = push(ref(db, `giveaways/${gw.id}/participants`)).key;
            await set(ref(db, `giveaways/${gw.id}/participants/${participantId}`), {
                name,
                wa,
                timestamp: Date.now()
            });

            await update(ref(db, `giveaways/${gw.id}`), {
                participantCount: participantCount + 1
            });

            alert("Entry submitted successfully! Good luck! 🎉");
            giveawayModal.remove();
            document.body.style.overflow = '';
        } catch (err) {
            alert("Failed to submit entry. Please try again.");
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-ticket"></i> Submit Entry';
        }
    };
}

function openBidModal(auc) {
    const bidModal = document.createElement('div');
    bidModal.className = 'modal-overlay active bid-popup';
    bidModal.innerHTML = `
        <div class="modal-content" style="max-width:350px;">
            <h2 style="margin-bottom:15px; font-size:1.2rem;">Bid for ${auc.title}</h2>
            <div style="background:rgba(0,0,0,0.15); padding:10px; border-radius:10px; margin-bottom:15px;">
                <p style="font-size:0.9rem; color:var(--text-muted);">Current Highest Bid:</p>
                <p style="font-size:1.5rem; color:var(--accent); font-weight:bold;">₹${auc.highestBid}</p>
            </div>
            <form id="bidForm">
                <div class="form-group"><label>Your Name</label><input type="text" id="bidName" required></div>
                <div class="form-group"><label>WhatsApp Number</label><input type="tel" id="bidWa" placeholder="e.g. 91807..." required></div>
                <div class="form-group">
                    <label>Bid Amount (₹)</label>
                    <input type="number" id="bidAmount" min="${auc.highestBid + 1}" value="${auc.highestBid + 10}" required>
                    <small style="color:var(--text-muted);">Must be higher than ₹${auc.highestBid}</small>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px;">
                    <button type="button" class="cancel-btn-modal" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                    <button type="submit" class="save-btn-modal" style="flex:1; background:var(--accent); color:white; border:none; padding:10px; border-radius:8px; font-weight:600;">Submit Bid</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(bidModal);

    const form = bidModal.querySelector('#bidForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const amt = parseInt(document.getElementById('bidAmount').value);
        const name = document.getElementById('bidName').value.trim();
        const wa = document.getElementById('bidWa').value.trim();

        if (/^\d+$/.test(name)) {
            alert("Name cannot contain only numbers. Please enter a valid name.");
            return;
        }

        if (!/^\d{10,15}$/.test(wa)) {
            alert("Please enter a valid WhatsApp number (10-15 digits only).");
            return;
        }
        const btn = form.querySelector('.save-btn-modal');

        if (amt <= auc.highestBid) {
            alert(`Bid must be higher than ₹${auc.highestBid}`);
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        try {
            // Add bid record
            await push(ref(db, `auctions/${auc.id}/bids`), {
                name, wa, price: amt, timestamp: Date.now()
            });
            // Update highest bid
            await update(ref(db, `auctions/${auc.id}`), {
                highestBid: amt
            });
            alert("Bid placed successfully!");
            bidModal.remove();
        } catch (err) {
            alert("Failed to place bid. Try again.");
            btn.disabled = false;
            btn.textContent = "Submit Bid";
        }
    };
}

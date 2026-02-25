import { db, ref, onValue, set, push, remove, update } from './firebase-config.js';

const tabs = document.querySelectorAll('.admin-tab');
const contents = document.querySelectorAll('.admin-tab-content');
const editModal = document.getElementById('adminEditModal');
const editForm = document.getElementById('adminEditForm');
const closeM = document.getElementById('closeAdminModal');
const revEl = document.getElementById('totalRevenue');
const searchInp = document.getElementById('adminSearch');

// ── Feedback Helpers ─────────────────────────────────────
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
        btn.classList.add('is-loading');
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.original || 'Save Changes';
        btn.classList.remove('is-loading');
        btn.disabled = false;
    }
}

// ── Admin Security ──────────────────────────────────────
const loginOverlay = document.getElementById('adminLoginOverlay');
const loginForm = document.getElementById('adminLoginForm');
const loginPass = document.getElementById('adminPass');
const loginErr = document.getElementById('loginError');
const mainContent = document.getElementById('adminMainContent');

// Correct SHA-256 hash for 'admin123'
const ADMIN_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

const authBtnText = document.getElementById('authBtnText');
const adminAuthBtn = document.getElementById('adminAuthBtn');

function updateAuthUI() {
    const isAuth = sessionStorage.getItem('adminAuth') === 'true';
    if (isAuth) {
        loginOverlay.style.display = 'none';
        mainContent.style.display = 'block';
        if (authBtnText) authBtnText.innerText = 'Logout';
        if (adminAuthBtn) adminAuthBtn.classList.add('logged-in');
    } else {
        loginOverlay.style.display = 'flex';
        mainContent.style.display = 'none';
        if (authBtnText) authBtnText.innerText = 'Login';
        if (adminAuthBtn) adminAuthBtn.classList.remove('logged-in');
    }
}

adminAuthBtn?.addEventListener('click', () => {
    if (sessionStorage.getItem('adminAuth') === 'true') {
        sessionStorage.removeItem('adminAuth');
        updateAuthUI();
        showToast("Logged out successfully", "info");
    } else {
        loginOverlay.style.display = 'flex';
    }
});

function checkAuth() {
    updateAuthUI();
}

loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const hash = CryptoJS.SHA256(loginPass.value).toString();
    if (hash === ADMIN_HASH) {
        sessionStorage.setItem('adminAuth', 'true');
        updateAuthUI();
        showToast("Login Successful", "success");
    } else {
        loginErr.innerText = "Invalid access password.";
        loginPass.value = '';
        showToast("Invalid password", "error");
    }
});

checkAuth();

// ── Tab Switching ──────────────────────────────────────
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${target}`).classList.add('active');
        // Refresh filter when tab changes
        applySearch();
    });
});

// ── Global State for Search ──────────────────────────────
let rawData = {
    waiting_list: [],
    products: [],
    auctioned: [],
    sold_out: []
};

// ── Data Fetchers ──────────────────────────────────────
function initFetch(path, containerId, templateFn, stateKey) {
    onValue(ref(db, path), (snap) => {
        const data = snap.val();
        rawData[stateKey] = [];
        if (data) {
            Object.keys(data).reverse().forEach(key => {
                rawData[stateKey].push({ id: key, ...data[key] });
            });
        }
        applySearch(); // Update view whenever data changes
    });
}

function parsePrice(p) {
    if (!p) return 0;
    return parseInt(p.toString().replace(/[^0-9]/g, '')) || 0;
}

function formatDate(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hh = d.getHours();
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm} ${ampm}`;
}

function applySearch() {
    const term = searchInp.value.toLowerCase().trim();
    const activeTab = document.querySelector('.admin-tab.active').dataset.tab;
    const activeKey = activeTab === 'sold' ? 'sold_out' : (activeTab === 'current' ? 'products' : (activeTab === 'waiting' ? 'waiting_list' : 'auctioned'));

    const containerId = activeTab === 'sold' ? 'soldList' : (activeTab === 'current' ? 'currentList' : (activeTab === 'waiting' ? 'waitingList' : 'auctionedList'));
    const templateFn = activeTab === 'sold' ? soldTpl : (activeTab === 'current' ? currentTpl : (activeTab === 'waiting' ? waitingTpl : auctionTpl));

    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const list = rawData[activeKey].filter(p => {
        const match = !term ||
            (p.title || '').toLowerCase().includes(term) ||
            (p.price || '').toLowerCase().includes(term) ||
            (p.sellerName || '').toLowerCase().includes(term) ||
            (p.sellerWa || '').toLowerCase().includes(term) ||
            (p.id || '').toLowerCase().includes(term);
        return match;
    });

    if (list.length === 0) {
        container.innerHTML = '<p class="empty-msg">No matching items found.</p>';
        if (activeKey === 'sold_out') revEl.innerText = '₹0';
        return;
    }

    let totalRev = 0;
    list.forEach(item => {
        container.appendChild(templateFn(item));
        if (activeKey === 'sold_out') totalRev += parsePrice(item.price);
    });

    if (activeKey === 'sold_out') revEl.innerText = `₹${totalRev.toLocaleString()}`;
}

searchInp.addEventListener('input', applySearch);

// ── Templates ──────────────────────────────────────────
const waitingTpl = (item) => buildAdminCard(item, 'waiting_list', ['approve', 'delete']);
const currentTpl = (item) => buildAdminCard(item, 'products', ['edit', 'sold', 'delete']);
const auctionTpl = (item) => buildAdminCard(item, 'auctioned', ['edit', 'sold', 'delete']);
const soldTpl = (item) => buildAdminCard(item, 'sold_out', ['delete']);

function buildAdminCard(item, fromPath, actions) {
    const cardWrap = document.createElement('div');
    cardWrap.className = 'admin-card-wrap';

    // Media Carousel Logic
    let mediaHtml = '';
    const urls = item.mediaUrls || [];

    if (urls.length > 0) {
        mediaHtml = `
            <div class="carousel-container">
                <div class="carousel-track">
                    ${urls.map((url, idx) => {
            const isVid = (typeof url === 'string' && (url.includes('video/') || url.includes('.mp4') || url.startsWith('data:video')));
            return isVid
                ? `<video src="${url}" muted loop playsinline class="carousel-item ${idx === 0 ? 'active' : ''}"></video>`
                : `<img src="${url}" alt="Media ${idx + 1}" class="carousel-item ${idx === 0 ? 'active' : ''}">`;
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

    const isSold = fromPath === 'sold_out' || item.status === 'sold' || item.stockOut;

    cardWrap.innerHTML = `
        ${isSold ? '<div class="sold-out-ribbon">SOLD OUT</div>' : ''}
        ${mediaHtml}
        <div class="admin-card-content">
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-solid fa-heading"></i> TITLE</div>
                <div class="value-side">${item.title || 'Untitled ID'}</div>
            </div>
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-solid fa-tag"></i> PRICE</div>
                <div class="value-side price-val">${item.price || 'Contact'}</div>
            </div>
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-solid fa-circle-info"></i> STATUS</div>
                <div class="value-side">
                    <span class="status-badge ${isSold ? 'sold' : ''}">${isSold ? 'SOLD' : 'LIVE'}</span>
                </div>
            </div>
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-solid fa-calendar-days"></i> TIME</div>
                <div class="value-side">${formatDate(item.timestamp)}</div>
            </div>
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-solid fa-user"></i> SELLER</div>
                <div class="value-side">${item.sellerName || 'Anon'}</div>
            </div>
            <div class="admin-card-row">
                <div class="label-side"><i class="fa-brands fa-whatsapp"></i> CONTACT</div>
                <div class="value-side">${item.sellerWa || 'NA'}</div>
            </div>

            <div class="admin-card-actions">
                <span>ACTIONS</span>
                <div class="footer-actions"></div>
            </div>
        </div>
    `;

    // Carousel Funcitonality
    if (urls.length > 1) {
        let currentIdx = 0;
        const track = cardWrap.querySelector('.carousel-track');
        const dots = cardWrap.querySelectorAll('.dot');
        const next = cardWrap.querySelector('.next-btn');
        const prev = cardWrap.querySelector('.prev-btn');

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

        // Update dots on manual scroll
        track.onscroll = () => {
            const idx = Math.round(track.scrollLeft / track.offsetWidth);
            if (idx !== currentIdx) {
                currentIdx = idx;
                updateDots(idx);
            }
        };

        // Play/Pause videos on scroll
        const items = track.querySelectorAll('.carousel-item');
        track.addEventListener('scroll', () => {
            items.forEach((it, i) => {
                if (it.tagName === 'VIDEO') {
                    const idx = Math.round(track.scrollLeft / track.offsetWidth);
                    if (i === idx) {
                        it.play().catch(() => { });
                    } else {
                        it.pause();
                        it.currentTime = 0;
                    }
                }
            });
        });
    }

    // Add Admin Actions
    const footerActions = cardWrap.querySelector('.footer-actions');
    actions.forEach(act => {
        const btn = document.createElement('button');

        if (act === 'approve') {
            btn.className = 'btn-styled btn-green';
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else if (act === 'edit') {
            btn.className = 'btn-styled btn-blue';
            btn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        } else if (act === 'delete') {
            btn.className = 'btn-styled btn-red';
            btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        } else if (act === 'sold') {
            btn.className = 'btn-styled btn-green';
            btn.innerHTML = '<i class="fa-solid fa-hand-holding-dollar"></i>';
        }

        btn.onclick = (e) => {
            e.stopPropagation();
            handleAction(act, item, fromPath);
        };
        footerActions.appendChild(btn);
    });

    // Hover Video support (for the currently active slide)
    cardWrap.addEventListener('mouseenter', () => {
        const video = cardWrap.querySelector('.carousel-item.active');
        if (video && video.tagName === 'VIDEO') video.play().catch(() => { });
    });
    cardWrap.addEventListener('mouseleave', () => {
        const video = cardWrap.querySelector('.carousel-item.active');
        if (video && video.tagName === 'VIDEO') {
            video.pause();
            video.currentTime = 0;
        }
    });

    return cardWrap;
}

async function handleAction(act, item, fromPath, btnEl) {
    if (act === 'delete') {
        if (confirm('Permanently delete this listing?')) {
            setLoading(btnEl, true);
            try {
                await remove(ref(db, `${fromPath}/${item.id}`));
                showToast("Listing Deleted", "success");
            } catch (err) {
                showToast("Deletion Failed", "error");
                setLoading(btnEl, false);
            }
        }
    }
    else if (act === 'approve' || act === 'edit') {
        openEditModal(item, fromPath);
    }
    else if (act === 'sold') {
        if (confirm('Mark this ID as Sold Out?')) {
            setLoading(btnEl, true);
            try {
                const soldItem = {
                    ...item,
                    status: 'sold',
                    soldDate: Date.now(),
                    stockOut: true
                };
                const itemId = item.id;
                delete soldItem.id;

                // Push to sold_out and remove from original path
                await set(push(ref(db, 'sold_out')), soldItem);
                await remove(ref(db, `${fromPath}/${itemId}`));
                showToast("Item Marked as Sold", "success");
            } catch (err) {
                showToast("Action Failed", "error");
                setLoading(btnEl, false);
            }
        }
    }
}

// ── Modal Logic ────────────────────────────────────────
let editingMediaUrls = [];

function renderEditMedia() {
    const gal = document.getElementById('editMediaGallery');
    if (!gal) return;
    gal.innerHTML = '';
    editingMediaUrls.forEach((url, idx) => {
        const item = document.createElement('div');
        item.className = 'edit-media-item';
        const isVid = (typeof url === 'string' && (url.includes('video/') || url.includes('.mp4') || url.startsWith('data:video')));

        item.innerHTML = `
            ${isVid ? `<video src="${url}"></video>` : `<img src="${url}">`}
            <button type="button" class="remove-media-btn" onclick="removeEditingMedia(${idx})">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        gal.appendChild(item);
    });
}

window.removeEditingMedia = (idx) => {
    editingMediaUrls.splice(idx, 1);
    renderEditMedia();
};

const editUploadArea = document.getElementById('editUploadArea');
const editFileInput = document.getElementById('editFileInput');
const editUploadStatus = document.getElementById('editUploadStatus');

editUploadArea?.addEventListener('click', () => editFileInput.click());

editFileInput?.addEventListener('change', async () => {
    const files = Array.from(editFileInput.files);
    if (files.length === 0) return;

    editUploadStatus.innerText = `Processing ${files.length} files...`;
    try {
        const newUrls = await Promise.all(files.map(file => toBase64(file)));
        editingMediaUrls = [...editingMediaUrls, ...newUrls];
        renderEditMedia();
        editUploadStatus.innerText = "Upload successful (pending save)";
        setTimeout(() => { editUploadStatus.innerText = ""; }, 3000);
    } catch (err) {
        editUploadStatus.innerText = "Upload failed";
        showToast("Media process failed", "error");
    }
    editFileInput.value = ''; // Reset input
});

function toBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function openEditModal(item, fromPath) {
    document.getElementById('editItemId').value = item.id;
    document.getElementById('editItemType').value = fromPath;
    document.getElementById('editTitle').value = item.title || '';
    document.getElementById('editPlayers').value = item.playerInfo || '';
    document.getElementById('editPrice').value = parsePrice(item.price);
    document.getElementById('editSellerName').value = item.sellerName || '';
    document.getElementById('editSellerWa').value = item.sellerWa || '';
    document.getElementById('editSection').value = item.section || 'auto';
    document.getElementById('editStock').checked = item.stockOut === true;

    // Update Save button text based on context
    const saveBtn = editForm.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.innerText = fromPath === 'waiting_list' ? 'Approve & Post' : 'Save Changes';
    }

    editingMediaUrls = [...(item.mediaUrls || [])];
    renderEditMedia();

    editModal.classList.add('active');
}

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editItemId').value;
    const fromPath = document.getElementById('editItemType').value;
    const isMarkedSoldNow = document.getElementById('editStock').checked;
    const saveBtn = editForm.querySelector('.save-btn');

    setLoading(saveBtn, true);

    onValue(ref(db, `${fromPath}/${id}`), async (snap) => {
        const original = snap.val();
        if (!original) {
            showToast("Item not found", "error");
            setLoading(saveBtn, false);
            return;
        }

        try {
            const updated = {
                ...original,
                title: document.getElementById('editTitle').value,
                playerInfo: document.getElementById('editPlayers').value,
                price: `₹${document.getElementById('editPrice').value}`,
                sellerName: document.getElementById('editSellerName').value,
                sellerWa: document.getElementById('editSellerWa').value,
                section: document.getElementById('editSection').value,
                stockOut: isMarkedSoldNow,
                mediaUrls: editingMediaUrls, // Save updated media list
                status: fromPath === 'waiting_list' ? 'current' : original.status
            };

            // If it's a new Sold Out check, move it
            if (isMarkedSoldNow && fromPath !== 'sold_out') {
                updated.status = 'sold';
                updated.soldDate = Date.now();
                updated.timestamp = Date.now(); // Unified timestamp
                await set(push(ref(db, 'sold_out')), updated);
                await remove(ref(db, `${fromPath}/${id}`));
                showToast("Item moved to Sold Out", "success");
            } else if (fromPath === 'waiting_list') {
                await set(push(ref(db, 'products')), updated);
                await remove(ref(db, `waiting_list/${id}`));
                showToast("Item Approved & Posted", "success");
            } else {
                await update(ref(db, `${fromPath}/${id}`), updated);
                showToast("Update Successful", "success");
            }

            editModal.classList.remove('active');
        } catch (err) {
            showToast("Update Failed", "error");
        } finally {
            setLoading(saveBtn, false);
        }
    }, { onlyOnce: true });
});

closeM.onclick = () => editModal.classList.remove('active');

// ── Init ───────────────────────────────────────────────
initFetch('waiting_list', 'waitingList', waitingTpl, 'waiting_list');
initFetch('products', 'currentList', currentTpl, 'products');
initFetch('auctioned', 'auctionedList', auctionTpl, 'auctioned');
initFetch('sold_out', 'soldList', soldTpl, 'sold_out');

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
        const targetContent = document.getElementById(`tab-${target}`);
        if (targetContent) targetContent.classList.add('active');
        // Refresh filter when tab changes
        applySearch();
    });
});

// ── Global State for Search ──────────────────────────────
let rawData = {
    waiting_list: [],
    products: [],
    auction_ids: [],
    sold_out: [],
    hero_slides: [],
    giveaways: []
};

let loadedStates = {
    waiting_list: false,
    products: false,
    auction_ids: false,
    sold_out: false,
    hero_slides: false,
    giveaways: false
};

// ── Data Fetchers ──────────────────────────────────────
function initFetch(path, containerId, templateFn, stateKey) {
    const container = document.getElementById(containerId);
    if (container) {
        let titleColor = stateKey === 'auction_ids' ? '#ff6b6b' : 'var(--accent)';
        let shadowColor = stateKey === 'auction_ids' ? 'rgba(255,107,107,0.6)' : 'rgba(0,240,255,0.6)';
        container.innerHTML = `
            <div class="loading-skeleton" style="grid-column: 1/-1; padding: 60px 0; display: flex; align-items: center; justify-content: center;">
                <div style="text-align:center;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 3rem; color: ${titleColor}; margin-bottom: 15px; filter: drop-shadow(0 0 10px ${shadowColor});"></i>
                    <p style="color:var(--text-muted); font-size:1.1rem; font-weight:600; letter-spacing:1px; text-transform:uppercase;">Fetching ${stateKey.replace('_', ' ')}...</p>
                </div>
            </div>
        `;
    }

    onValue(ref(db, path), (snap) => {
        const data = snap.val();
        loadedStates[stateKey] = true;
        rawData[stateKey] = [];
        if (data) {
            Object.keys(data).reverse().forEach(key => {
                rawData[stateKey].push({ id: key, ...data[key] });
            });
        }

        if (stateKey === 'auction_ids') {
            updateAuctionStats(rawData[stateKey]);
        }
        if (stateKey === 'hero_slides') {
            updateHeroStats(rawData[stateKey]);
        }
        if (stateKey === 'giveaways') {
            // Giveaways are displayed in auction tab, so trigger search update
            applySearch();
        }

        applySearch(); // Update view whenever data changes
    });
}

function updateAuctionStats(auctions) {
    const statsContainer = document.getElementById('auctionStatsSummary');
    if (!statsContainer) return;

    const totalActive = auctions.filter(a => (a.endTime || 0) > Date.now()).length;
    const totalBids = auctions.reduce((acc, a) => acc + Object.keys(a.bids || {}).length, 0);
    const highestBidsTotal = auctions.reduce((acc, a) => acc + (a.highestBid || 0), 0);

    statsContainer.innerHTML = `
        <div class="stat-pill">
            <i class="fa-solid fa-fire-pulse"></i> Active: <strong>${totalActive}</strong>
        </div>
        <div class="stat-pill">
            <i class="fa-solid fa-users-viewfinder"></i> Total Bids: <strong>${totalBids}</strong>
        </div>
        <div class="stat-pill">
            <i class="fa-solid fa-money-bill-trend-up"></i> Total Value: <strong>₹${highestBidsTotal.toLocaleString()}</strong>
        </div>
    `;
}

function updateHeroStats(slides) {
    const statsContainer = document.getElementById('heroStatsSummary');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
        <div class="stat-pill">
            <i class="fa-solid fa-images"></i> Total Slides: <strong>${slides.length}</strong>
        </div>
        <div class="stat-pill">
            <i class="fa-solid fa-eye"></i> Active: <strong>${slides.length}</strong>
        </div>
    `;
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
    const tabMap = {
        'waiting': { key: 'waiting_list', container: 'waitingList', tpl: waitingTpl },
        'current': { key: 'products', container: 'currentList', tpl: currentTpl },
        'auction-manage': { key: 'auction_ids', container: 'auctionManageList', tpl: auctionManageTpl, includeGiveaways: true },
        'sold': { key: 'sold_out', container: 'soldList', tpl: soldTpl },
        'hero': { key: 'hero_slides', container: 'heroListContainer', tpl: heroTpl }
    };

    const currentTab = tabMap[activeTab];
    if (!currentTab) return;

    const activeKey = currentTab.key;
    const containerId = currentTab.container;
    const templateFn = currentTab.tpl;

    if (!loadedStates[activeKey] || (currentTab.includeGiveaways && !loadedStates['giveaways'])) {
        return; // Retain skeleton loaders until fully loaded
    }

    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    let list = rawData[activeKey].filter(p => {
        const match = !term ||
            (p.title || '').toLowerCase().includes(term) ||
            (p.price || '').toLowerCase().includes(term) ||
            (p.sellerName || '').toLowerCase().includes(term) ||
            (p.sellerWa || '').toLowerCase().includes(term) ||
            (p.id || '').toLowerCase().includes(term);
        return match;
    });

    // Filter auctions by ended status if on auction tab
    if (activeKey === 'auction_ids') {
        const showEnded = document.getElementById('showEndedAuctions')?.checked || false;
        list = list.filter(auction => {
            const isExpired = (auction.endTime || 0) < Date.now();
            return showEnded ? true : !isExpired; // If checkbox checked, show all; otherwise only active
        });
    }

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

    // Add giveaways to auction tab if enabled
    if (currentTab.includeGiveaways && rawData.giveaways) {
        rawData.giveaways.forEach(gw => {
            container.appendChild(giveawayTpl(gw));
        });
    }

    if (activeKey === 'sold_out') revEl.innerText = `₹${totalRev.toLocaleString()}`;
}

searchInp.addEventListener('input', applySearch);

// Toggle ended auctions display
document.getElementById('showEndedAuctions')?.addEventListener('change', applySearch);

// ── Templates ──────────────────────────────────────────
const waitingTpl = (item) => buildAdminCard(item, 'waiting_list', ['approve', 'delete']);
const currentTpl = (item) => buildAdminCard(item, 'products', ['edit', 'sold', 'delete']);
const soldTpl = (item) => buildAdminCard(item, 'sold_out', ['delete']);

// ── Giveaway Template ──────────────────────────────────
const giveawayTpl = (item) => {
    const card = document.createElement('div');
    card.className = 'auction-admin-card';
    const participantCount = item.participantCount || (item.participants ? Object.keys(item.participants).length : 0);

    const urls = item.mediaUrls || [];
    let mediaHtml = urls.length > 0
        ? `<img src="${urls[0]}" style="width:100%; height:200px; object-fit:cover; border-radius:10px;">`
        : `<div style="width:100%; height:200px; background:rgba(255,107,107,0.1); display:flex; align-items:center; justify-content:center; border-radius:10px;"><i class="fa-solid fa-gift" style="font-size:3rem; color:#ff6b6b;"></i></div>`;

    card.innerHTML = `
        <div class="auction-card-media">
            ${mediaHtml}
            <div style="position:absolute; top:15px; right:15px; z-index:10;">
                <span class="auction-type-badge" style="background:linear-gradient(135deg, #ff6b6b, #ee5a6f);">🎁 GIVEAWAY</span>
            </div>
        </div>
        <div class="auction-card-body">
            <h4 class="auction-id-title">${item.title || 'Giveaway'}</h4>
            <div class="auction-desc-box">${item.description || 'No description'}</div>
            <div class="auction-desc-box" style="margin-top:10px;"><strong>Players:</strong> ${item.playerInfo || 'N/A'}</div>
            <div style="background:rgba(255,107,107,0.1); padding:15px; border-radius:8px; margin-top:15px; text-align:center;">
                <div style="font-size:1.5rem; font-weight:800; color:#ff6b6b;">
                    <i class="fa-solid fa-users"></i> ${participantCount}
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted);">Participants</div>
            </div>
        </div>
        <div class="admin-card-footer">
            <button class="save-btn view-participants-btn" style="flex:1;">
                <i class="fa-solid fa-users"></i> View Participants (${participantCount})
            </button>
            <button class="save-btn edit-giveaway-btn">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="delete-auc-btn" title="Delete Giveaway">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;

    card.querySelector('.view-participants-btn').onclick = (e) => {
        e.stopPropagation();
        viewGiveawayParticipants(item);
    };

    card.querySelector('.edit-giveaway-btn').onclick = (e) => {
        e.stopPropagation();
        openEditGiveawayModal(item);
    };

    card.querySelector('.delete-auc-btn').onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Delete this giveaway?')) {
            setLoading(e.currentTarget, true);
            try {
                await remove(ref(db, `giveaways/${item.id}`));
                showToast("Giveaway Deleted", "success");
            } catch (err) {
                showToast("Deletion Failed", "error");
                setLoading(e.currentTarget, false);
            }
        }
    };

    return card;
};

// View Giveaway Participants
window.viewGiveawayParticipants = function (giveaway) {
    const participants = giveaway.participants ? Object.entries(giveaway.participants).map(([pid, p]) => ({ pid, ...p })) : [];
    const participantCount = participants.length;

    let listHtml = participants.map((p, i) => `
        <div class="bid-row" data-participant-id="${p.pid}">
            <div class="bid-name" style="font-weight:600;">${p.name || 'Unknown'}</div>
            <a href="https://wa.me/${p.wa || ''}" target="_blank" class="bid-phone">
                <i class="fa-brands fa-whatsapp"></i> ${p.wa || 'N/A'}
            </a>
            <div style="color:var(--text-muted); font-size:0.75rem;">${formatDate(p.timestamp)}</div>
            <button class="remove-bid-btn" onclick="window.removeParticipant('${giveaway.id}', '${p.pid}')" title="Remove" style="background:rgba(255,0,0,0.2); color:#ff5555; border:none; padding:5px 10px; border-radius:5px; cursor:pointer;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('') || '<p style="padding:40px; text-align:center; color:var(--text-muted); opacity:0.5;">No participants yet.</p>';

    const participantModal = document.createElement('div');
    participantModal.className = 'admin-edit-modal active';
    participantModal.innerHTML = `
        <div class="modal-content" style="max-width:650px; padding:0; overflow:hidden;">
            <div style="padding:20px 25px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;"><i class="fa-solid fa-users"></i> Participants - ${giveaway.title || 'Giveaway'}</h3>
                <span class="bid-count-badge" style="background:linear-gradient(135deg, #ff6b6b, #ee5a6f); color:#fff; font-weight:800;">${participantCount} ENTRIES</span>
            </div>
            <div class="bid-table-header" style="display:grid; grid-template-columns:2fr 1.5fr 1.5fr auto; gap:10px; padding:15px 25px; background:rgba(0,0,0,0.2); font-weight:600; font-size:0.85rem; text-transform:uppercase;">
                <div>Name</div>
                <div>WhatsApp</div>
                <div>Entry Time</div>
                <div style="text-align:center;">Action</div>
            </div>
            <div style="max-height:450px; overflow-y:auto; background:rgba(0,0,0,0.1);">
                ${listHtml}
            </div>
            <div style="padding:15px 25px; background:rgba(0,0,0,0.2);">
                <button class="save-btn" style="width:100%;" onclick="this.closest('.admin-edit-modal').remove()">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(participantModal);
};

window.removeParticipant = async function (giveawayId, participantId) {
    if (!confirm('Remove this participant?')) return;
    try {
        await remove(ref(db, `giveaways/${giveawayId}/participants/${participantId}`));
        const giveawayRef = ref(db, `giveaways/${giveawayId}`);
        onValue(giveawayRef, async (snap) => {
            const giveaway = snap.val();
            if (!giveaway) return;
            const count = giveaway.participants ? Object.keys(giveaway.participants).length : 0;
            await update(giveawayRef, { participantCount: count });
            showToast("Participant removed", "success");
            setTimeout(() => {
                const modal = document.querySelector('.admin-edit-modal.active');
                if (modal) modal.remove();
                const giveawayData = { id: giveawayId, ...giveaway };
                window.viewGiveawayParticipants(giveawayData);
            }, 500);
        }, { onlyOnce: true });
    } catch (err) {
        showToast("Failed to remove participant", "error");
    }
};

function openEditGiveawayModal(item) {
    const modal = document.createElement('div');
    modal.className = 'admin-edit-modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Edit Giveaway</h3>
            <form id="editGwForm">
                <div class="form-group"><label>Title</label><input type="text" id="egwTitle" value="${item.title || ''}" required></div>
                <div class="form-group"><label>Description</label><textarea id="egwDesc" required>${item.description || ''}</textarea></div>
                <div class="form-group"><label>Player Details</label><textarea id="egwPlayers" required>${item.playerInfo || ''}</textarea></div>
                <div class="form-group">
                    <label>Images</label>
                    <div class="upload-area" id="egwUploadArea"><i class="fa-solid fa-cloud-arrow-up"></i> Add More Images</div>
                    <div id="egwPreview" class="edit-media-gallery" style="margin-top:10px;"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    let egwMedia = [...(item.mediaUrls || [])];
    const renderPrev = () => {
        modal.querySelector('#egwPreview').innerHTML = egwMedia.map((url, i) => `
            <div class="edit-media-item">
                <img src="${url}">
                <button type="button" class="del-media" onclick="window.removeEgwMedia(${i})">×</button>
            </div>
        `).join('');
    };
    window.removeEgwMedia = (i) => { egwMedia.splice(i, 1); renderPrev(); };
    renderPrev();

    modal.querySelector('#egwUploadArea').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
        inp.onchange = async (e) => {
            for (const f of e.target.files) {
                if (f.size > 7 * 1024 * 1024) {
                    alert(`File "${f.name}" is too large. Max 7MB.`);
                    continue;
                }
                const b64 = await toBase64(f);
                if (b64.length > 10485760) {
                    alert(`File "${f.name}" exceeds size limit.`);
                    continue;
                }
                egwMedia.push(b64);
            }
            renderPrev();
        };
        inp.click();
    };

    modal.querySelector('#editGwForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);
        try {
            await update(ref(db, `giveaways/${item.id}`), {
                title: document.getElementById('egwTitle').value,
                description: document.getElementById('egwDesc').value,
                playerInfo: document.getElementById('egwPlayers').value,
                mediaUrls: egwMedia
            });
            showToast("Giveaway Updated", "success");
            modal.remove();
        } catch (err) { showToast("Update Failed", "error"); }
        finally { setLoading(btn, false); }
    };
}

const heroTpl = (item) => {
    const card = document.createElement('div');
    card.className = 'hero-admin-card';
    card.innerHTML = `
        <img src="${item.imageUrl || 'https://placehold.co/800x400?text=No+Image'}" class="hero-card-img">
        <div class="hero-card-body">
            <span class="hero-badge-tag">${item.badge || '✦ HERO SLIDE'}</span>
            <h4 class="hero-card-title">${item.title || 'Untitled Slide'}</h4>
            <p class="hero-card-desc">${item.desc || 'No description provided.'}</p>
            <div class="hero-card-link"><i class="fa-solid fa-link"></i> ${item.link || '#'}</div>
            <div class="admin-card-footer" style="padding:15px 0 0; background:none; border:none;">
                <button class="save-btn edit-hero-btn">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="delete-auc-btn delete-hero-btn">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;

    card.querySelector('.edit-hero-btn').onclick = (e) => {
        e.stopPropagation();
        openEditHeroModal(item);
    };

    card.querySelector('.delete-hero-btn').onclick = (e) => {
        e.stopPropagation();
        if (confirm('Delete this hero slide?')) {
            remove(ref(db, `hero_slides/${item.id}`));
            showToast("Hero Slide Deleted", "success");
        }
    };

    return card;
};

const auctionManageTpl = (item) => {
    const card = document.createElement('div');
    card.className = 'auction-admin-card';

    // ── Media Layer ─────────────────────────────────────
    const urls = item.mediaUrls || [];
    let mediaHtml = '';
    if (urls.length > 0) {
        mediaHtml = `
            <div class="carousel-container" style="height:100%;">
                <div class="carousel-track" style="height:100%;">
                    ${urls.map((url, idx) => {
            const isVid = (typeof url === 'string' && (url.includes('video/') || url.includes('.mp4') || url.startsWith('data:video')));
            return isVid
                ? `<video src="${url}" muted loop playsinline class="carousel-item ${idx === 0 ? 'active' : ''}" style="height:100%; object-fit:cover;"></video>`
                : `<img src="${url}" alt="Media ${idx + 1}" class="carousel-item ${idx === 0 ? 'active' : ''}" style="height:100%; object-fit:cover;">`;
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
        mediaHtml = `<div class="carousel-container"><img src="https://placehold.co/400x300?text=No+Media" style="height:100%; object-fit:cover;"></div>`;
    }

    // ── Data Prep ────────────────────────────────────────
    const bids = item.bids ? Object.values(item.bids) : [];
    bids.sort((a, b) => b.price - a.price);
    const topBidder = bids.length > 0 ? bids[0].name : 'No bids';
    const isExpired = item.endTime < Date.now();

    // ── Ledger Logic (Last 5 Bids) ───────────────────────
    const ledgerHtml = bids.slice(0, 5).map(b => `
        <div class="ledger-row">
            <span class="name">${b.name}</span>
            <a href="https://wa.me/${b.wa}" target="_blank" style="color:var(--text-muted); font-size:0.7rem;"><i class="fa-brands fa-whatsapp"></i></a>
            <span class="price">₹${b.price}</span>
        </div>
    `).join('') || '<div style="padding:20px; text-align:center; font-size:0.75rem; color:var(--text-muted); opacity:0.5;">Awaiting Bids...</div>';

    card.innerHTML = `
        <div class="auction-card-media">
            ${mediaHtml}
            <div style="position:absolute; top:15px; right:15px; z-index:10;">
                 <span class="auction-type-badge">${isExpired ? 'Ended' : 'Active Auction'}</span>
            </div>
        </div>
        <div class="auction-card-body">
            <div class="auction-badge-row">
                <h4 class="auction-id-title">${item.title || 'Elite Account'}</h4>
            </div>
            
            <div class="auction-desc-box">
                ${item.playerInfo || 'View account details and player stats here.'}
            </div>

            <div class="auction-grid-stats">
                <div class="stat-box">
                    <span class="label">Start Price</span>
                    <span class="value">${item.price || '₹0'}</span>
                </div>
                <div class="stat-box">
                    <span class="label">Current Bid</span>
                    <span class="value accent">₹${item.highestBid || 0}</span>
                </div>
                <div class="stat-box" style="grid-column: span 2;">
                    <span class="label"><i class="fa-solid fa-clock"></i> Ends In</span>
                    <span class="value" id="admin-timer-${item.id}" style="font-family:'JetBrains Mono', monospace; font-size:1rem;">Calculating...</span>
                </div>
            </div>

            <div class="bid-ledger-wrap">
                <div class="ledger-header">
                    <span>LATEST BIDS</span>
                    <span>${bids.length} TOTAL</span>
                </div>
                <div class="ledger-list">
                    ${ledgerHtml}
                </div>
            </div>
            
            ${isExpired ? `
                <div style="padding:15px; background:rgba(255,0,0,0.1); border-radius:8px; margin-top:15px; text-align:center;">
                    <strong style="color:#ff5555;">Auction Ended</strong>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:5px;">
                        Ended on ${formatDate(item.endTime)}
                    </p>
                </div>
            ` : ''}
        </div>
        <div class="admin-card-footer">
            <button class="save-btn full-bid-list-btn" style="flex:1;">
                <i class="fa-solid fa-users"></i> Bids
            </button>
            <button class="save-btn edit-auc-btn">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="delete-auc-btn" title="Delete Auction">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;

    // ── Button Listeners ─────────────────────────────────
    card.querySelector('.full-bid-list-btn').onclick = (e) => {
        e.stopPropagation();
        viewBidders(item);
    };

    card.querySelector('.edit-auc-btn').onclick = (e) => {
        e.stopPropagation();
        openEditAuctionModal(item);
    };

    card.querySelector('.delete-auc-btn').onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Permanently delete this auction?')) {
            setLoading(e.currentTarget, true);
            try {
                await remove(ref(db, `auctions/${item.id}`));
                showToast("Auction Deleted", "success");
            } catch (err) {
                showToast("Deletion Failed", "error");
                setLoading(e.currentTarget, false);
            }
        }
    };

    // Initialize Timer
    if (!isExpired) {
        const timerEl = card.querySelector(`#admin-timer-${item.id}`);
        const updateAdminTimer = () => {
            const now = Date.now();
            const diff = item.endTime - now;
            if (diff <= 0) {
                timerEl.innerHTML = '<span style="color:#ff0055;">EXPIRED</span>';
                return;
            }
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            timerEl.innerHTML = `${h}h ${m}m ${s}s`;
        };
        updateAdminTimer();
        const interval = setInterval(() => {
            if (!document.body.contains(timerEl)) { clearInterval(interval); return; }
            updateAdminTimer();
        }, 1000);
    } else {
        card.querySelector(`#admin-timer-${item.id}`).innerHTML = '<span style="color:#ff0055;">ENDED</span>';
    }

    // Initialize Carousel
    if (urls.length > 1) {
        let currentIdx = 0;
        const track = card.querySelector('.carousel-track');
        const dots = card.querySelectorAll('.dot');
        const next = card.querySelector('.next-btn');
        const prev = card.querySelector('.prev-btn');

        const updateDots = (idx) => dots.forEach((d, i) => d.classList.toggle('active', i === idx));
        const scrollToSlide = (idx) => {
            currentIdx = idx;
            const slideWidth = track.offsetWidth;
            track.scrollTo({ left: idx * slideWidth, behavior: 'smooth' });
            updateDots(idx);
        };

        next.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx + 1) % urls.length; scrollToSlide(currentIdx); };
        prev.onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx - 1 + urls.length) % urls.length; scrollToSlide(currentIdx); };
    }

    return card;
};

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
initFetch('auctions', 'auctionManageList', auctionManageTpl, 'auction_ids');
initFetch('sold_out', 'soldList', soldTpl, 'sold_out');
initFetch('hero_slides', 'heroListContainer', heroTpl, 'hero_slides');
initFetch('giveaways', 'auctionManageList', giveawayTpl, 'giveaways');

// ── Hero Slide Modals ──────────────────────────
function openEditHeroModal(item) {
    const modal = document.createElement('div');
    modal.className = 'admin-edit-modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Edit Hero Slide</h3>
            <form id="editHeroForm">
                <div class="form-group"><label>Title</label><input type="text" id="ehTitle" value="${item.title || ''}" required></div>
                <div class="form-group"><label>Description</label><textarea id="ehDesc" required>${item.desc || ''}</textarea></div>
                <div class="form-group"><label>Badge</label><input type="text" id="ehBadge" value="${item.badge || '✦ HERO'}" required></div>
                <div class="form-group"><label>Link URL</label><input type="text" id="ehLink" value="${item.link || '#'}" required></div>
                <div class="form-group">
                    <label>Image</label>
                    <div class="upload-area" id="ehUploadArea"><i class="fa-solid fa-image"></i> Change Slide Image</div>
                    <div id="ehPreview" class="edit-media-gallery" style="margin-top:10px;"><div class="edit-media-item"><img src="${item.imageUrl || ''}"></div></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Update Slide</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    let ehImgBase64 = item.imageUrl || '';
    modal.querySelector('#ehUploadArea').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async (e) => {
            if (e.target.files[0]) {
                ehImgBase64 = await toBase64(e.target.files[0]);
                modal.querySelector('#ehPreview').innerHTML = `<div class="edit-media-item"><img src="${ehImgBase64}"></div>`;
            }
        };
        inp.click();
    };

    modal.querySelector('#editHeroForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);
        try {
            const data = {
                title: document.getElementById('ehTitle').value,
                desc: document.getElementById('ehDesc').value,
                badge: document.getElementById('ehBadge').value,
                link: document.getElementById('ehLink').value,
                imageUrl: ehImgBase64,
                updatedAt: Date.now()
            };
            await update(ref(db, `hero_slides/${item.id}`), data);
            showToast("Hero Slide Updated", "success");
            modal.remove();
        } catch (err) { showToast("Update Failed", "error"); }
        finally { setLoading(btn, false); }
    };
}

document.getElementById('addHeroBtn')?.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'admin-edit-modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Add New Hero Slide</h3>
            <form id="addHeroForm">
                <div class="form-group"><label>Title</label><input type="text" id="ahTitle" required></div>
                <div class="form-group"><label>Description</label><textarea id="ahDesc" required></textarea></div>
                <div class="form-group"><label>Badge</label><input type="text" id="ahBadge" value="✦ DISCOVER" required></div>
                <div class="form-group"><label>Link URL</label><input type="text" id="ahLink" value="#" required></div>
                <div class="form-group">
                    <label>Slide Image</label>
                    <div class="upload-area" id="ahUploadArea"><i class="fa-solid fa-cloud-arrow-up"></i> Select Image</div>
                    <div id="ahPreview" class="edit-media-gallery" style="margin-top:10px;"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Add Slide</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    let ahImgBase64 = '';
    modal.querySelector('#ahUploadArea').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async (e) => {
            if (e.target.files[0]) {
                ahImgBase64 = await toBase64(e.target.files[0]);
                modal.querySelector('#ahPreview').innerHTML = `<div class="edit-media-item"><img src="${ahImgBase64}"></div>`;
            }
        };
        inp.click();
    };

    modal.querySelector('#addHeroForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);
        try {
            const data = {
                title: document.getElementById('ahTitle').value,
                desc: document.getElementById('ahDesc').value,
                badge: document.getElementById('ahBadge').value,
                link: document.getElementById('ahLink').value,
                imageUrl: ahImgBase64,
                timestamp: Date.now()
            };
            await push(ref(db, 'hero_slides'), data);
            showToast("Hero Slide Added", "success");
            modal.remove();
        } catch (err) { showToast("Failed to add slide", "error"); }
        finally { setLoading(btn, false); }
    };
});

// ── Auction Edit Modal ─────────────────────────
function openEditAuctionModal(item) {
    const currentEndTime = item.endTime || Date.now();
    const remainingMs = Math.max(0, currentEndTime - Date.now());
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    const modal = document.createElement('div');
    modal.className = 'admin-edit-modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:600px; max-height:90vh; overflow-y:auto;">
            <h3>Edit Auction Details</h3>
            <form id="editAucForm">
                <div class="form-group"><label>Title</label><input type="text" id="eaTitle" value="${item.title || ''}" required></div>
                <div class="form-group"><label>Players Info</label><textarea id="eaPlayers" required>${item.playerInfo || ''}</textarea></div>
                <div class="form-group"><label>Starting Price (₹)</label><input type="text" id="eaPrice" value="${item.price || '₹0'}" required></div>
                
                <div class="form-group row-group">
                    <div class="input-wrap">
                        <label>Extend Time (Hours)</label>
                        <input type="number" id="eaHours" value="0" min="0" placeholder="Add hours">
                    </div>
                    <div class="input-wrap">
                        <label>Extend Time (Minutes)</label>
                        <input type="number" id="eaMinutes" value="0" min="0" placeholder="Add minutes">
                    </div>
                </div>
                <div class="form-group">
                    <label style="font-size:0.85rem; color:var(--text-muted);">
                        Current remaining: ${remainingHours}h ${remainingMinutes}m
                    </label>
                </div>
                
                <div class="form-group">
                    <label>Media Gallery</label>
                    <div class="upload-area" id="eaUploadArea"><i class="fa-solid fa-cloud-arrow-up"></i> Add More Media</div>
                    <div id="eaPreview" class="edit-media-gallery" style="margin-top:10px;"></div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    let eaMedia = [...(item.mediaUrls || [])];
    const renderPrev = () => {
        modal.querySelector('#eaPreview').innerHTML = eaMedia.map((url, i) => {
            const isVid = (typeof url === 'string' && (url.includes('video/') || url.includes('.mp4') || url.startsWith('data:video')));
            return `
                <div class="edit-media-item">
                    ${isVid ? `<video src="${url}" style="max-height:100px;"></video>` : `<img src="${url}">`}
                    <button type="button" class="del-media" onclick="window.removeEaMedia(${i})">×</button>
                </div>
            `;
        }).join('');
    };
    window.removeEaMedia = (i) => { eaMedia.splice(i, 1); renderPrev(); };
    renderPrev();

    modal.querySelector('#eaUploadArea').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*,video/*'; inp.multiple = true;
        inp.onchange = async (e) => {
            for (const f of e.target.files) { eaMedia.push(await toBase64(f)); }
            renderPrev();
        };
        inp.click();
    };

    modal.querySelector('#editAucForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);
        try {
            const addHours = parseInt(document.getElementById('eaHours').value) || 0;
            const addMinutes = parseInt(document.getElementById('eaMinutes').value) || 0;
            const timeExtension = (addHours * 60 * 60 * 1000) + (addMinutes * 60 * 1000);
            const newEndTime = currentEndTime + timeExtension;

            const upd = {
                title: document.getElementById('eaTitle').value,
                playerInfo: document.getElementById('eaPlayers').value,
                price: document.getElementById('eaPrice').value,
                mediaUrls: eaMedia,
                endTime: newEndTime
            };
            await update(ref(db, `auctions/${item.id}`), upd);
            showToast("Auction Updated", "success");
            modal.remove();
        } catch (err) { showToast("Update Failed", "error"); }
        finally { setLoading(btn, false); }
    };
}

// ── Auction Participant Modal ────────────────────────────
window.viewBidders = function (auction) {
    const bids = auction.bids ? Object.entries(auction.bids).map(([bidId, bid]) => ({ bidId, ...bid })) : [];
    const sortedBids = [...bids].sort((a, b) => b.price - a.price); // Highest price first

    let listHtml = sortedBids.map((b, i) => `
        <div class="bid-row ${i === 0 ? 'highest-bid-row' : ''}" data-bid-id="${b.bidId}">
            <div class="bid-name" style="font-weight:600;">${b.name || 'Unknown'}</div>
            <a href="https://wa.me/${b.wa || ''}" target="_blank" class="bid-phone">
                <i class="fa-brands fa-whatsapp"></i> ${b.wa || 'N/A'}
            </a>
            <div class="bid-price" style="color:var(--accent); font-weight:800; text-align:right;">₹${b.price || 0}</div>
            <button class="remove-bid-btn" onclick="window.removeBid('${auction.id}', '${b.bidId}')" title="Remove Bid" style="background:rgba(255,0,0,0.2); color:#ff5555; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; margin-left:10px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('') || '<p style="padding:40px; text-align:center; color:var(--text-muted); opacity:0.5;">No bids placed yet.</p>';

    const bidModal = document.createElement('div');
    bidModal.className = 'admin-edit-modal active';
    bidModal.innerHTML = `
        <div class="modal-content" style="max-width:650px; padding:0; overflow:hidden;">
            <div style="padding:20px 25px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;"><i class="fa-solid fa-list-ol"></i> Bidders List - ${auction.title || 'Auction'}</h3>
                <span class="bid-count-badge" style="background:var(--accent); color:#000; font-weight:800;">${bids.length} BIDS</span>
            </div>
            
            <div class="bid-table-header" style="display:grid; grid-template-columns:2fr 1.5fr 1fr auto; gap:10px; padding:15px 25px; background:rgba(0,0,0,0.2); font-weight:600; font-size:0.85rem; text-transform:uppercase;">
                <div>User Name</div>
                <div>Contact</div>
                <div style="text-align:right;">Offer</div>
                <div style="text-align:center;">Action</div>
            </div>

            <div style="max-height:450px; overflow-y:auto; background:rgba(0,0,0,0.1);">
                ${listHtml}
            </div>

            <div style="padding:15px 25px; background:rgba(0,0,0,0.2); border-top:1px solid rgba(255,255,255,0.05);">
                <button class="save-btn" style="width:100%;" onclick="this.closest('.admin-edit-modal').remove()">Close Window</button>
            </div>
        </div>
    `;
    document.body.appendChild(bidModal);
};

// Remove bid function
window.removeBid = async function (auctionId, bidId) {
    if (!confirm('Are you sure you want to remove this bid?')) return;
    try {
        await remove(ref(db, `auctions/${auctionId}/bids/${bidId}`));

        // Recalculate highest bid
        const auctionRef = ref(db, `auctions/${auctionId}`);
        onValue(auctionRef, async (snap) => {
            const auction = snap.val();
            if (!auction) return;

            const bids = auction.bids ? Object.values(auction.bids) : [];
            const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price || 0)) : (parseInt(auction.price?.replace(/[^0-9]/g, '')) || 0);

            await update(auctionRef, { highestBid });
            showToast("Bid removed successfully", "success");

            // Refresh the bidders modal if open
            const modal = document.querySelector('.admin-edit-modal.active');
            if (modal && modal.querySelector('.bid-table-header')) {
                setTimeout(() => {
                    const auctionData = { id: auctionId, ...auction };
                    window.viewBidders(auctionData);
                    modal.remove();
                }, 500);
            }
        }, { onlyOnce: true });
    } catch (err) {
        showToast("Failed to remove bid", "error");
    }
};

// ── Create Giveaway Modal ────────────────────────────────
document.getElementById('openGiveawayBtn')?.addEventListener('click', () => {
    const giveawayModal = document.createElement('div');
    giveawayModal.className = 'admin-edit-modal active';
    giveawayModal.innerHTML = `
        <div class="modal-content">
            <h3>Create New Giveaway</h3>
            <form id="newGiveawayForm">
                <div class="form-group"><label>Title</label><input type="text" id="gwTitle" required></div>
                <div class="form-group"><label>Description</label><textarea id="gwDesc" required></textarea></div>
                <div class="form-group"><label>Player Details</label><textarea id="gwPlayers" required></textarea></div>
                <div class="form-group">
                    <label>ID Images (Select Multiple)</label>
                    <div class="upload-area" id="gwUploadArea"><i class="fa-solid fa-cloud-arrow-up"></i> Select Images</div>
                    <div id="gwPreview" class="edit-media-gallery" style="margin-top:10px;"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Create Giveaway</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(giveawayModal);

    let gwMediaBase64 = [];
    const uArea = document.getElementById('gwUploadArea');
    const uPrev = document.getElementById('gwPreview');

    const renderGwPreview = () => {
        uPrev.innerHTML = gwMediaBase64.map((url, idx) => `
            <div class="edit-media-item">
                <img src="${url}">
                <button type="button" class="del-media" onclick="window.removeGwMedia(${idx})">×</button>
            </div>
        `).join('');
    };

    window.removeGwMedia = (idx) => {
        gwMediaBase64.splice(idx, 1);
        renderGwPreview();
    };

    uArea.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.multiple = true;
        inp.onchange = async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                if (file.size > 7 * 1024 * 1024) {
                    alert(`File "${file.name}" is too large. Max 7MB.`);
                    continue;
                }
                const b64 = await toBase64(file);
                if (b64.length > 10485760) {
                    alert(`File "${file.name}" exceeds size limit after encoding.`);
                    continue;
                }
                gwMediaBase64.push(b64);
            }
            renderGwPreview();
        };
        inp.click();
    };

    document.getElementById('newGiveawayForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);

        const giveawayData = {
            title: document.getElementById('gwTitle').value,
            description: document.getElementById('gwDesc').value,
            playerInfo: document.getElementById('gwPlayers').value,
            mediaUrls: gwMediaBase64,
            timestamp: Date.now(),
            status: 'giveaway',
            participants: {},
            participantCount: 0
        };

        try {
            await push(ref(db, 'giveaways'), giveawayData);
            showToast("Giveaway Created!", "success");
            giveawayModal.remove();
        } catch (err) {
            showToast("Failed to create giveaway", "error");
        } finally {
            setLoading(btn, false);
        }
    };
});

// ── Create Auction Modal ────────────────────────────────
document.getElementById('openAuctionBtn')?.addEventListener('click', () => {
    const aucNewModal = document.createElement('div');
    aucNewModal.className = 'admin-edit-modal active';
    aucNewModal.innerHTML = `
        <div class="modal-content">
            <h3>Start New Auction/Giveaway</h3>
            <form id="newAuctionForm">
                <div class="form-group"><label>Title</label><input type="text" id="aucTitle" required></div>
                <div class="form-group"><label>Players Info</label><textarea id="aucPlayers" required></textarea></div>
                <div class="form-group"><label>Starting Price (₹)</label><input type="number" id="aucPrice" value="0" required></div>
                <div class="form-group"><label>Duration (Hours)</label><input type="number" id="aucHours" value="24" required></div>
                <div class="form-group">
                    <label>ID Media (Images/Videos - Select Multiple)</label>
                    <div class="upload-area" id="aucUploadArea"><i class="fa-solid fa-cloud-arrow-up"></i> Select Media Files</div>
                    <div id="aucPreview" class="edit-media-gallery" style="margin-top:10px;"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="cancel-btn" onclick="this.closest('.admin-edit-modal').remove()">Cancel</button>
                    <button type="submit" class="save-btn">Start Auction</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(aucNewModal);

    let aucMediaBase64 = [];
    const uArea = document.getElementById('aucUploadArea');
    const uPrev = document.getElementById('aucPreview');

    const renderAucPreview = () => {
        uPrev.innerHTML = aucMediaBase64.map((url, idx) => `
            <div class="edit-media-item">
                <img src="${url}">
                <button type="button" class="del-media" onclick="window.removeAucMedia(${idx})">×</button>
            </div>
        `).join('');
    };

    window.removeAucMedia = (idx) => {
        aucMediaBase64.splice(idx, 1);
        renderAucPreview();
    };

    uArea.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*,video/*';
        inp.multiple = true;
        inp.onchange = async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                const b64 = await toBase64(file);
                aucMediaBase64.push(b64);
            }
            renderAucPreview();
        };
        inp.click();
    };

    document.getElementById('newAuctionForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('.save-btn');
        setLoading(btn, true);

        const duration = parseInt(document.getElementById('aucHours').value);
        const auctionData = {
            title: document.getElementById('aucTitle').value,
            playerInfo: document.getElementById('aucPlayers').value,
            price: `₹${document.getElementById('aucPrice').value}`,
            mediaUrls: aucMediaBase64,
            timestamp: Date.now(),
            endTime: Date.now() + (duration * 60 * 60 * 1000),
            status: 'auction',
            highestBid: parseInt(document.getElementById('aucPrice').value),
            bids: {}
        };

        try {
            await push(ref(db, 'auctions'), auctionData);
            showToast("Auction Started!", "success");
            aucNewModal.remove();
        } catch (err) {
            showToast("Failed to start auction", "error");
        } finally {
            setLoading(btn, false);
        }
    };
});

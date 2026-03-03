import { db, ref, push, set } from './firebase-config.js';

const sellForm = document.getElementById('sellForm');
const idScreenshots = document.getElementById('idScreenshots');
const idVideo = document.getElementById('idVideo');
const konamiProof = document.getElementById('konamiProof');
const previewS = document.getElementById('previewScreenshots');
const previewV = document.getElementById('previewVideo');
const previewK = document.getElementById('previewKonami');
const postBtn = document.getElementById('postBtn');
const postLoader = document.getElementById('postLoader');
const formSuccess = document.getElementById('formSuccess');

const counterInput = document.getElementById('paidCountInput');
const btnDec = document.getElementById('decrement');
const btnInc = document.getElementById('increment');

// ── Numeric Counter Logic ────────────────────────────────
if (counterInput) {
    btnInc.addEventListener('click', () => {
        counterInput.value = parseInt(counterInput.value || 0) + 1;
        clearError('paidCountError');
    });
    btnDec.addEventListener('click', () => {
        const val = parseInt(counterInput.value || 0);
        if (val > 0) counterInput.value = val - 1;
    });
}

// ── Inline Error Helpers ─────────────────────────────────
function showError(errorId, wrapId) {
    const msg = document.getElementById(errorId);
    if (msg) msg.classList.add('visible');
    if (wrapId) {
        const wrap = document.getElementById(wrapId);
        if (wrap) wrap.classList.add('field-error');
    }
}

function clearError(errorId, wrapId) {
    const msg = document.getElementById(errorId);
    if (msg) msg.classList.remove('visible');
    if (wrapId) {
        const wrap = document.getElementById(wrapId);
        if (wrap) wrap.classList.remove('field-error');
    }
}

function clearAllErrors() {
    ['screenshotsError', 'videoError', 'konamiError',
        'userNameError', 'waNumberError', 'paidCardsError',
        'paidCountError', 'idPriceError'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('visible');
        });
    ['screenshotsBox', 'videoBox', 'konamiBox',
        'userNameWrap', 'waNumberWrap', 'paidCardsWrap', 'idPriceWrap'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('field-error');
        });
}

// Clear errors on input
document.getElementById('userName')?.addEventListener('input', () => clearError('userNameError', 'userNameWrap'));
document.getElementById('waNumber')?.addEventListener('input', () => clearError('waNumberError', 'waNumberWrap'));
document.getElementById('paidCards')?.addEventListener('input', () => clearError('paidCardsError', 'paidCardsWrap'));
document.getElementById('idPrice')?.addEventListener('input', () => clearError('idPriceError', 'idPriceWrap'));
idScreenshots?.addEventListener('change', () => clearError('screenshotsError', 'screenshotsBox'));
konamiProof?.addEventListener('change', () => clearError('konamiError', 'konamiBox'));

// ── Media Previews ─────────────────────────────────────
function handlePreviewWithValidation(input, container, isVideo = false, maxSizeMB = 7) {
    if (!input || !container) return;
    input.addEventListener('change', () => {
        container.innerHTML = '';
        const files = Array.from(input.files);

        files.forEach(file => {
            const sizeMB = file.size / 1024 / 1024;
            if (sizeMB > maxSizeMB) {
                if (isVideo) {
                    showError('videoError', 'videoBox');
                }
                input.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const previewWrapper = document.createElement('div');
                previewWrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:2px;';

                if (isVideo) {
                    const video = document.createElement('video');
                    video.src = e.target.result;
                    video.className = 'preview-thumb';
                    video.controls = true;
                    video.style.maxWidth = '100px';
                    video.style.maxHeight = '100px';
                    previewWrapper.appendChild(video);
                    clearError('videoError', 'videoBox');
                } else {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'preview-thumb';
                    previewWrapper.appendChild(img);
                }

                const sizeInfo = document.createElement('span');
                sizeInfo.style.cssText = 'font-size:0.6rem; color:var(--text-muted);';
                sizeInfo.textContent = `${sizeMB.toFixed(2)}MB`;
                previewWrapper.appendChild(sizeInfo);

                container.appendChild(previewWrapper);
            };
            reader.readAsDataURL(file);
        });
    });
}

handlePreviewWithValidation(idScreenshots, previewS, false, 7);
handlePreviewWithValidation(idVideo, previewV, true, 7);
handlePreviewWithValidation(konamiProof, previewK, false, 7);

// ── Form Validation ──────────────────────────────────────
function validateForm() {
    clearAllErrors();
    let isValid = true;
    let firstErrorEl = null;

    const userName = document.getElementById('userName').value.trim();
    const waNumber = document.getElementById('waNumber').value.trim();
    const paidCardsRaw = document.getElementById('paidCards').value.trim();
    const idPrice = document.getElementById('idPrice').value.trim();
    const paidCount = parseInt(counterInput.value || 0);

    // Screenshots required
    if (!idScreenshots.files || idScreenshots.files.length === 0) {
        showError('screenshotsError', 'screenshotsBox');
        firstErrorEl = firstErrorEl || document.getElementById('screenshotsBox');
        isValid = false;
    }

    // Konami proof required
    if (!konamiProof.files || konamiProof.files.length === 0) {
        showError('konamiError', 'konamiBox');
        firstErrorEl = firstErrorEl || document.getElementById('konamiBox');
        isValid = false;
    }

    // Name validation
    if (!userName || /^\d+$/.test(userName)) {
        showError('userNameError', 'userNameWrap');
        firstErrorEl = firstErrorEl || document.getElementById('userName');
        isValid = false;
    }

    // WhatsApp number validation
    if (!waNumber || !/^\d{10,15}$/.test(waNumber)) {
        showError('waNumberError', 'waNumberWrap');
        firstErrorEl = firstErrorEl || document.getElementById('waNumber');
        isValid = false;
    }

    // Paid players list
    if (!paidCardsRaw) {
        showError('paidCardsError', 'paidCardsWrap');
        firstErrorEl = firstErrorEl || document.getElementById('paidCards');
        isValid = false;
    }

    // Paid count
    if (isNaN(paidCount) || paidCount < 1) {
        showError('paidCountError');
        firstErrorEl = firstErrorEl || document.getElementById('paidCountCounter');
        isValid = false;
    }

    // Price
    if (!idPrice || isNaN(Number(idPrice)) || Number(idPrice) <= 0) {
        showError('idPriceError', 'idPriceWrap');
        firstErrorEl = firstErrorEl || document.getElementById('idPrice');
        isValid = false;
    }

    // Scroll to first error
    if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
}

// ── Form Submission ─────────────────────────────────────
sellForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const userName = document.getElementById('userName').value.trim();
    const waNumber = document.getElementById('waNumber').value.trim();
    const paidCardsRaw = document.getElementById('paidCards').value;
    const idPrice = document.getElementById('idPrice').value;
    const isKonami = document.getElementById('isKonamiOnly').checked;
    const paidCount = counterInput.value;

    // Formatting Paid Cards: "Messi, Neymar" -> "Messi x Neymar"
    const formattedPlayers = paidCardsRaw
        .split(',')
        .map(p => p.trim())
        .filter(p => p !== '')
        .join(' x ');

    // Show loading state
    postBtn.classList.add('loading');
    postBtn.disabled = true;
    const btnText = postBtn.querySelector('.btn-text');
    if (btnText) {
        btnText.textContent = 'Posting to Review List...';
    }

    try {
        // Validate file sizes before processing
        const allFiles = [
            ...Array.from(idScreenshots.files),
            ...Array.from(idVideo.files),
            konamiProof.files[0]
        ].filter(f => f);

        for (const file of allFiles) {
            if (file.size > MAX_FILE_SIZE) {
                throw new Error(
                    `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max allowed size is 7MB. Please compress or use a smaller file.`
                );
            }
        }

        // Prepare media URLs (base64)
        const mediaPromises = [];

        for (const file of Array.from(idScreenshots.files)) {
            mediaPromises.push(compressImage(file));
        }

        for (const file of Array.from(idVideo.files)) {
            if (file.size > 7 * 1024 * 1024) {
                console.warn(`Video "${file.name}" exceeds 7MB and will be skipped.`);
                continue;
            }
            mediaPromises.push(toBase64(file));
        }

        if (konamiProof.files[0]) {
            mediaPromises.push(compressImage(konamiProof.files[0]));
        }

        const mediaUrls = await Promise.all(mediaPromises);

        const idData = {
            title: formattedPlayers,
            playerInfo: `${paidCount} Paid Cards | ${isKonami ? 'Konami Linked' : 'Multi Linked'}`,
            price: `₹${idPrice}`,
            sellerName: userName,
            sellerWa: waNumber,
            mediaUrls: mediaUrls.filter(u => u !== ''),
            isKonamiOnly: isKonami,
            status: 'waiting',
            timestamp: Date.now()
        };

        const newRef = push(ref(db, 'waiting_list'));
        await set(newRef, idData);

        postBtn.classList.remove('loading');
        postBtn.disabled = false;
        if (btnText) {
            btnText.textContent = 'Post to Waiting List';
            btnText.style.opacity = '1';
        }

        // Show Success Message
        formSuccess.classList.add('active');
        const redirectSub = formSuccess.querySelector('.redirect-sub');
        if (redirectSub) {
            redirectSub.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Redirecting to WhatsApp for deal confirmation...';
        }

        // Redirect to WhatsApp
        setTimeout(() => {
            const adminNum = "919778205314";
            const msg = `👤 I am ${userName}\n` +
                ` and I need to sell the ${idData.title} ID \n` +
                ` with ${idData.playerInfo}.\n` +
                ` My expected price for this ID is ${idData.price}\n\n` +
                ` Can we make a deal?`;

            const waUrl = `https://api.whatsapp.com/send?phone=${adminNum}&text=${encodeURIComponent(msg)}`;
            window.location.href = waUrl;
        }, 2000);

    } catch (err) {
        console.error("Submission failed:", err);

        // Reset button
        postBtn.classList.remove('loading');
        postBtn.disabled = false;
        if (btnText) {
            btnText.textContent = 'Post to Waiting List';
            btnText.style.opacity = '1';
        }

        // Show user-friendly inline error
        let errorMsg = "Something went wrong. Please try again.";
        if (err.message) {
            if (err.message.includes('too large') || err.message.includes('exceeds')) {
                errorMsg = err.message;
            } else if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('firebase')) {
                errorMsg = "Upload failed due to a network issue. Check your connection and try again.";
            } else {
                errorMsg = err.message;
            }
        }

        // Show a toast-style inline error at top of form
        showSubmitError(errorMsg);
    }
});

// ── Submit Error Banner ──────────────────────────────────
function showSubmitError(message) {
    let banner = document.getElementById('submitErrorBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'submitErrorBanner';
        banner.style.cssText = `
            background: rgba(255,56,56,0.12);
            border: 1px solid rgba(255,56,56,0.4);
            color: #ff5f5f;
            border-radius: 10px;
            padding: 12px 16px;
            font-size: 0.83rem;
            font-weight: 600;
            display: flex;
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 16px;
            line-height: 1.4;
        `;
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="margin-top:2px;flex-shrink:0;"></i><span></span>`;
        sellForm.insertBefore(banner, sellForm.firstChild);
    }
    banner.querySelector('span').textContent = message;
    banner.style.display = 'flex';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { if (banner) banner.style.display = 'none'; }, 6000);
}

// ── Constants ─────────────────────────────────────────────
const MAX_FILE_SIZE = 7 * 1024 * 1024; // 7MB
const MAX_IMAGE_SIZE = 2000;

// ── Compress Image ────────────────────────────────────────
function compressImage(file, maxWidth = MAX_IMAGE_SIZE, maxHeight = MAX_IMAGE_SIZE, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }

        if (file.type.startsWith('video/')) {
            toBase64(file).then(resolve).catch(reject);
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 7MB.`));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
                } else {
                    if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL(file.type || 'image/jpeg', quality);
                if (compressedBase64.length > 20971520) {
                    const lowerQuality = canvas.toDataURL(file.type || 'image/jpeg', 0.6);
                    if (lowerQuality.length > 20971520) {
                        reject(new Error(`"${file.name}" is too large even after compression. Please use a smaller file.`));
                        return;
                    }
                    resolve(lowerQuality);
                } else {
                    resolve(compressedBase64);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// ── To Base64 ─────────────────────────────────────────────
function toBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }

        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 7MB.`));
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            if (result.length > 20971520) {
                reject(new Error(`"${file.name}" exceeds size limit after encoding. Please use a smaller file.`));
                return;
            }
            resolve(result);
        };
        reader.onerror = error => reject(error);
    });
}

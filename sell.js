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
    });
    btnDec.addEventListener('click', () => {
        const val = parseInt(counterInput.value || 0);
        if (val > 0) counterInput.value = val - 1;
    });
}

// ── Media Previews ─────────────────────────────────────
function handlePreview(input, container, isVideo = false) {
    if (!input || !container) return;
    input.addEventListener('change', () => {
        container.innerHTML = '';
        const files = Array.from(input.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (isVideo) {
                    const video = document.createElement('video');
                    video.src = e.target.result;
                    video.className = 'preview-thumb';
                    container.appendChild(video);
                } else {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'preview-thumb';
                    container.appendChild(img);
                }
            };
            reader.readAsDataURL(file);
        });
    });
}

// File size validation helper
function validateFileSize(file, maxSizeMB = 7) {
    if (file.size > maxSizeMB * 1024 * 1024) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        alert(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is ${maxSizeMB}MB. Please use a smaller file.`);
        return false;
    }
    return true;
}

// Enhanced preview with size validation
function handlePreviewWithValidation(input, container, isVideo = false, maxSizeMB = 7) {
    if (!input || !container) return;
    input.addEventListener('change', () => {
        container.innerHTML = '';
        const files = Array.from(input.files);
        
        // Validate file sizes and show warnings
        files.forEach(file => {
            const sizeMB = file.size / 1024 / 1024;
            if (sizeMB > maxSizeMB) {
                alert(`Warning: "${file.name}" is ${sizeMB.toFixed(2)}MB (max ${maxSizeMB}MB). It will be skipped during upload.`);
                return; // Skip preview for oversized files
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
                } else {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'preview-thumb';
                    previewWrapper.appendChild(img);
                }
                
                // Show file size info
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
handlePreviewWithValidation(idVideo, previewV, true, 5);
handlePreviewWithValidation(konamiProof, previewK, false, 7);

// ── Form Submission ─────────────────────────────────────
sellForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate required file inputs before proceeding
    if (!konamiProof.files || konamiProof.files.length === 0) {
        alert("Please upload Konami Link Proof image.");
        konamiProof.focus();
        return;
    }
    
    if (!idScreenshots.files || idScreenshots.files.length === 0) {
        alert("Please upload at least one Squad Screenshot.");
        idScreenshots.focus();
        return;
    }

    const paidCount = counterInput.value;
    if (paidCount === "" || parseInt(paidCount) < 0) {
        alert("Please enter a valid number of paid players.");
        return;
    }

    const userName = document.getElementById('userName').value;
    const waNumber = document.getElementById('waNumber').value;
    const paidCardsRaw = document.getElementById('paidCards').value;
    const idPrice = document.getElementById('idPrice').value;
    const isKonami = document.getElementById('isKonamiOnly').checked;

    // Formatting Paid Cards: "Messi, Neymar" -> "Messi x Neymar"
    const formattedPlayers = paidCardsRaw
        .split(',')
        .map(p => p.trim())
        .filter(p => p !== '')
        .join(' x ');

    // Show loading state - CSS will handle the loader visibility
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
        ].filter(f => f); // Remove null/undefined
        
        // Check each file size
        for (const file of allFiles) {
            if (file.size > MAX_FILE_SIZE) {
                throw new Error(
                    `File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). ` +
                    `Maximum file size is 7MB. Please compress or use a smaller file.`
                );
            }
        }
        
        // Prepare media URLs (base64) - compress images, handle videos separately
        const mediaPromises = [];
        
        // Process screenshots (compress images)
        for (const file of Array.from(idScreenshots.files)) {
            mediaPromises.push(compressImage(file));
        }
        
        // Process videos (skip if too large, or compress if possible)
        for (const file of Array.from(idVideo.files)) {
            if (file.size > 5 * 1024 * 1024) { // Skip videos larger than 5MB
                console.warn(`Video "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB) and will be skipped.`);
                continue; // Skip this video
            }
            mediaPromises.push(toBase64(file));
        }
        
        // Process Konami proof (compress image)
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

        // Hide button loading, show success
        postBtn.classList.remove('loading');
        postBtn.disabled = false; // Re-enable for potential retry
        if (btnText) {
            btnText.textContent = 'Post to Waiting List';
            btnText.style.opacity = '1'; // Show text again
        }
        
        // Show Success Message
        formSuccess.classList.add('active');
        const redirectSub = formSuccess.querySelector('.redirect-sub');
        if (redirectSub) {
            redirectSub.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Redirecting to WhatsApp for deal confirmation...';
        }

        // Redirect to WhatsApp after showing success message
        setTimeout(() => {
            const adminNum = "918078240018";
            const msg = `👤 I am ${userName}\n` +
                ` and I need to sell the ${idData.title} ID \n`+
                ` with ${idData.playerInfo}.\n` +
                ` My expected price for this ID is ${idData.price}\n\n` +
                ` Can we make a deal?`;

            const waUrl = `https://api.whatsapp.com/send?phone=${adminNum}&text=${encodeURIComponent(msg)}`;
            window.location.href = waUrl;
        }, 2000);

    } catch (err) {
        console.error("Submission failed:", err);
        
        // Show user-friendly error message
        let errorMsg = "Failed to post ID. ";
        if (err.message) {
            if (err.message.includes('too large')) {
                errorMsg = err.message;
            } else if (err.message.includes('Firebase')) {
                errorMsg = "File size exceeds limit. Please use smaller files (max 7MB each).";
            } else {
                errorMsg += err.message;
            }
        } else {
            errorMsg += "Please try again.";
        }
        
        alert(errorMsg);
        postBtn.classList.remove('loading');
        postBtn.disabled = false;
        const btnText = postBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.textContent = 'Post to Waiting List';
            btnText.style.opacity = '1';
        }
    }
});

// Firebase limit: 10MB per value (base64 increases size by ~33%, so max ~7.5MB original)
const MAX_FILE_SIZE = 7 * 1024 * 1024; // 7MB in bytes
const MAX_IMAGE_SIZE = 2000; // Max width/height for images

// Compress image before converting to base64
function compressImage(file, maxWidth = MAX_IMAGE_SIZE, maxHeight = MAX_IMAGE_SIZE, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }
        
        // If it's a video, skip compression (we'll handle separately)
        if (file.type.startsWith('video/')) {
            toBase64(file).then(resolve).catch(reject);
            return;
        }
        
        // Check file size first
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 7MB.`));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions
                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 with compression
                const compressedBase64 = canvas.toDataURL(file.type || 'image/jpeg', quality);
                
                // Check if compressed size is still too large
                if (compressedBase64.length > 10485760) {
                    // Try with lower quality
                    const lowerQuality = canvas.toDataURL(file.type || 'image/jpeg', 0.6);
                    if (lowerQuality.length > 10485760) {
                        reject(new Error(`File "${file.name}" is too large even after compression. Please use a smaller file.`));
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

// Helper for image/video to base64 (with size check)
function toBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }
        
        // Check file size before processing
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 7MB.`));
            return;
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result;
            // Check base64 size (Firebase limit is 10MB)
            if (result.length > 10485760) {
                reject(new Error(`File "${file.name}" exceeds Firebase size limit after encoding. Please use a smaller file.`));
                return;
            }
            resolve(result);
        };
        reader.onerror = error => reject(error);
    });
}

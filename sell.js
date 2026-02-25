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

handlePreview(idScreenshots, previewS);
handlePreview(idVideo, previewV, true);
handlePreview(konamiProof, previewK);

// ── Form Submission ─────────────────────────────────────
sellForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

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

    postBtn.classList.add('loading');
    postBtn.disabled = true;

    try {
        // Prepare media URLs (base64)
        const mediaUrls = await Promise.all([
            ...Array.from(idScreenshots.files).map(f => toBase64(f)),
            ...Array.from(idVideo.files).map(f => toBase64(f)),
            toBase64(konamiProof.files[0])
        ]);

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

        // Show Success
        formSuccess.classList.add('active');

        // Redirect to WhatsApp
        setTimeout(() => {
            const adminNum = "918078240018";
            const msg = `👤 I am ${userName}\n` +
                ` and I need to sell the ${idData.title} ID \n`+
                ` with ${idData.playerInfo}.\n` +
                ` My expected price for this ID is ${idData.price}\n\n` +
                ` Can we make a deal?`;

            const waUrl = `https://api.whatsapp.com/send?phone=${adminNum}&text=${encodeURIComponent(msg)}`;
            window.location.href = waUrl;
        }, 3000);

    } catch (err) {
        console.error("Submission failed:", err);
        alert("Failed to post ID. Please try again.");
        postBtn.classList.remove('loading');
        postBtn.disabled = false;
    }
});

// Helper for image to base64
function toBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(''); return; }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

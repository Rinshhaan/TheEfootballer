import { db, ref, onValue } from './firebase-config.js';

const productGrid = document.getElementById('product-grid');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('productModal');
const closeModalBtn = document.getElementById('closeModal');
const carouselSlidesContainer = document.getElementById('carouselSlides');

// SECURITY: Your Base64 Encoded Phone Number
const encodedPhone = "OTE4MDc4MjQwMDE4"; // Example for 919876543210

let allProducts = []; 

// --- 1. Fetch Data from Firebase ---
const productsRef = ref(db, 'products');
onValue(productsRef, (snapshot) => {
    productGrid.innerHTML = '';
    allProducts = [];
    const data = snapshot.val();

    if (data) {
        Object.keys(data).reverse().forEach(key => {
            allProducts.push({ id: key, ...data[key] });
        });
        renderProducts(allProducts);
    } else {
        productGrid.innerHTML = '<p style="text-align:center; color: var(--text-muted); margin-top: 50px;">No IDs currently listed.</p>';
    }
});

// --- 2. Render Products Grid ---
function renderProducts(productsToRender) {
    productGrid.innerHTML = '';
    if(productsToRender.length === 0) {
        productGrid.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No matching IDs found.</p>';
        return;
    }

    productsToRender.forEach(product => {
        const firstMedia = product.mediaUrls ? product.mediaUrls[0] : '';
        const isVideo = firstMedia.includes('.mp4') || firstMedia.includes('.mov') || firstMedia.includes('.webm');
        
        const mediaHtml = isVideo 
            ? `<video src="${firstMedia}" muted loop playsinline class="card-video"></video>` 
            : `<img src="${firstMedia || 'https://via.placeholder.com/300x200?text=No+Media'}" alt="${product.title}">`;

        const card = document.createElement('div');
        card.className = `product-card ${product.stockOut ? 'sold-out-card' : ''}`;
        card.innerHTML = `
            <div class="card-thumbnail">
                ${product.stockOut ? '<div class="sold-out-banner">SOLD OUT</div>' : ''}
                ${mediaHtml}
            </div>
            <div class="card-info">
                <h3 class="card-title">${product.title}</h3>
                <p class="card-short-desc"><strong>Players:</strong> ${product.playerInfo || 'N/A'}</p>
                <p class="card-price">${product.price}</p>
            </div>
        `;
        
        if(isVideo) {
            card.addEventListener('mouseenter', () => card.querySelector('video').play());
            card.addEventListener('mouseleave', () => {
                const v = card.querySelector('video');
                v.pause();
                v.currentTime = 0;
            });
        }

        card.addEventListener('click', () => openModal(product));
        productGrid.appendChild(card);
    });
}

// --- 3. Refined Search Functionality ---
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProducts = allProducts.filter(product => 
        product.title.toLowerCase().includes(searchTerm) || 
        (product.playerInfo && product.playerInfo.toLowerCase().includes(searchTerm))
    );
    renderProducts(filteredProducts);
});

// --- 4. Secure WhatsApp Function ---
function handleWhatsAppRedirect(product) {
    // Decodes number only at the moment of click
    const decodedNumber = atob(encodedPhone);
    const waMsg = `Hello! I want to buy the ID: ${product.title} for ${product.price}`;
    const waUrl = `https://wa.me/${decodedNumber}?text=${encodeURIComponent(waMsg)}`;
    
    window.open(waUrl, '_blank');
}

// --- 5. Modal & Carousel Logic ---
let currentSlideIndex = 0;
let currentSlides = [];

function openModal(product) {
    document.getElementById('modalTitle').innerText = product.title;
    document.getElementById('modalPrice').innerText = product.price;
    document.getElementById('modalPlayerInfo').innerText = product.playerInfo || 'No details provided.';
    
    // Replace traditional link with button click event
    const waBtn = document.getElementById('modalWaLink');
    // We remove the href to hide the number from hover previews
    waBtn.removeAttribute('href');
    waBtn.style.cursor = "pointer";
    waBtn.onclick = (e) => {
        e.preventDefault();
        handleWhatsAppRedirect(product);
    };

    // Setup Carousel
    carouselSlidesContainer.innerHTML = '';
    currentSlides = product.mediaUrls || [];
    currentSlideIndex = 0;

    if (currentSlides.length > 0) {
        currentSlides.forEach((url, index) => {
            const isVideo = url.includes('.mp4') || url.includes('.mov') || url.includes('.webm');
            const slide = document.createElement('div');
            slide.classList.add('carousel-slide');
            if (index === 0) slide.classList.add('active');
            
            slide.innerHTML = isVideo 
                ? `<video src="${url}" controls controlsList="nodownload" playsinline class="modal-video"></video>` 
                : `<img src="${url}" alt="Slide ${index}" class="modal-img">`;
            
            carouselSlidesContainer.appendChild(slide);
        });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; 
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    const videos = carouselSlidesContainer.querySelectorAll('video');
    videos.forEach(v => v.pause());
}

closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

document.getElementById('prevBtn').addEventListener('click', () => changeSlide(-1));
document.getElementById('nextBtn').addEventListener('click', () => changeSlide(1));

function changeSlide(direction) {
    const slides = document.querySelectorAll('.carousel-slide');
    if (slides.length <= 1) return;

    slides[currentSlideIndex].classList.remove('active');
    const prevVideo = slides[currentSlideIndex].querySelector('video');
    if(prevVideo) prevVideo.pause();

    currentSlideIndex = (currentSlideIndex + direction + slides.length) % slides.length;

    slides[currentSlideIndex].classList.add('active');
}

// --- 6. Footer WhatsApp Security ---
const mainFooterWaBtn = document.getElementById('mainFooterWaBtn');

if (mainFooterWaBtn) {
    mainFooterWaBtn.onclick = () => {
        // Decodes your number (same encoded string used in openModal)
        const decodedNumber = atob(encodedPhone); 
        
        // General message for the footer button
        const generalMsg = encodeURIComponent("Hello! I have a question about the eFootball IDs listed on your site.");
        
        const waUrl = `https://wa.me/${decodedNumber}?text=${generalMsg}`;
        
        window.open(waUrl, '_blank');
    };
}
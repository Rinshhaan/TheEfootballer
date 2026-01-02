// app.js
import { db, ref, onValue } from './firebase-config.js';

const productGrid = document.getElementById('product-grid');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('productModal');
const closeModalBtn = document.getElementById('closeModal');
const carouselSlidesContainer = document.getElementById('carouselSlides');

let allProducts = []; // Store fetched products locally for filtering

// --- Fetch Data from Firebase ---
const productsRef = ref(db, 'products');
onValue(productsRef, (snapshot) => {
    productGrid.innerHTML = '';
    allProducts = [];
    const data = snapshot.val();

    if (data) {
        Object.keys(data).forEach(key => {
            allProducts.push({ id: key, ...data[key] });
        });
        renderProducts(allProducts);
    } else {
        productGrid.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No IDs currently listed.</p>';
    }
});

// --- Render Products Grid ---
function renderProducts(productsToRender) {
    productGrid.innerHTML = '';
    if(productsToRender.length === 0) {
        productGrid.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No results found.</p>';
        return;
    }

    productsToRender.forEach(product => {
        const firstMedia = product.mediaUrls ? product.mediaUrls[0] : '';
        const isVideo = firstMedia.includes('.mp4') || firstMedia.includes('.webm');
        
        const mediaHtml = isVideo 
            ? `<video src="${firstMedia}" muted loop autoplay></video>` 
            : `<img src="${firstMedia || 'https://via.placeholder.com/300x200?text=No+Media'}" alt="${product.title}">`;

        const card = document.createElement('div');
        card.classList.add('product-card');
        card.innerHTML = `
            ${product.stockOut ? '<span class="stock-out-badge">Stock Out</span>' : ''}
            <div class="card-thumbnail">
                ${mediaHtml}
            </div>
            <div class="card-info">
                <h3 class="card-title">${product.title}</h3>
                <p class="card-short-desc">${product.shortDesc}</p>
                <p class="card-price">${product.price}</p>
            </div>
        `;
        
        card.addEventListener('click', () => openModal(product));
        productGrid.appendChild(card);
    });
}

// --- Search Functionality ---
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProducts = allProducts.filter(product => 
        product.title.toLowerCase().includes(searchTerm) || 
        product.shortDesc.toLowerCase().includes(searchTerm)
    );
    renderProducts(filteredProducts);
});

// --- Modal & Carousel Logic ---
let currentSlideIndex = 0;
let currentSlides = [];

function openModal(product) {
    document.getElementById('modalTitle').innerText = product.title;
    document.getElementById('modalPrice').innerText = product.price;
    document.getElementById('modalFullDesc').innerText = product.fullDesc;
    document.getElementById('modalPlayerInfo').innerText = product.playerInfo;
    // Update WA link with product info
    document.getElementById('modalWaLink').href = `https://wa.me/1234567890?text=I'm%20interested%20in%20ID:%20${product.title}%20(${product.id})`;

    // Setup Carousel
    carouselSlidesContainer.innerHTML = '';
    currentSlides = product.mediaUrls || [];
    currentSlideIndex = 0;

    if (currentSlides.length > 0) {
        currentSlides.forEach((url, index) => {
            const isVideo = url.includes('.mp4') || url.includes('.webm');
            const slide = document.createElement('div');
            slide.classList.add('carousel-slide');
            if (index === 0) slide.classList.add('active');
            
            slide.innerHTML = isVideo 
                ? `<video src="${url}" controls></video>` 
                : `<img src="${url}" alt="Slide ${index}">`;
            
            carouselSlidesContainer.appendChild(slide);
        });
    } else {
         carouselSlidesContainer.innerHTML = '<div class="carousel-slide active"><img src="https://via.placeholder.com/800x400?text=No+Media+Available"></div>';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Disable background scroll
}

// Close Modal interactions
closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    // Stop any playing videos in the modal
    const videos = carouselSlidesContainer.querySelectorAll('video');
    videos.forEach(v => v.pause());
}

// Carousel Controls
document.getElementById('prevBtn').addEventListener('click', () => changeSlide(-1));
document.getElementById('nextBtn').addEventListener('click', () => changeSlide(1));

function changeSlide(direction) {
    if (currentSlides.length <= 1) return;

    const slides = document.querySelectorAll('.carousel-slide');
    slides[currentSlideIndex].classList.remove('active');
    // Pause video on prev slide
    const prevVideo = slides[currentSlideIndex].querySelector('video');
    if(prevVideo) prevVideo.pause();

    currentSlideIndex = (currentSlideIndex + direction + currentSlides.length) % currentSlides.length;

    slides[currentSlideIndex].classList.add('active');
}
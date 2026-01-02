// admin.js
import { db, ref, push, set, onValue, remove, update } from './firebase-config.js';

const productForm = document.getElementById('productForm');
const adminProductTable = document.getElementById('adminProductTable');
const formTitle = document.getElementById('formTitle');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const editProductIdInput = document.getElementById('editProductId');
const mediaUrlsInput = document.getElementById('mediaUrls');
const mediaPreview = document.getElementById('mediaPreview');

let isEditing = false;

// --- Handle Form Submit (Create or Update) ---
productForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Process media URLs string into an array, trimming whitespace
    const mediaArray = mediaUrlsInput.value.split(',').map(url => url.trim()).filter(url => url.length > 0);

    const productData = {
        title: document.getElementById('title').value,
        price: document.getElementById('price').value,
        shortDesc: document.getElementById('shortDesc').value,
        fullDesc: document.getElementById('fullDesc').value,
        playerInfo: document.getElementById('playerInfo').value,
        mediaUrls: mediaArray,
        stockOut: document.getElementById('stockOut').checked
    };

    if (isEditing) {
        // Update existing
        const productId = editProductIdInput.value;
        update(ref(db, 'products/' + productId), productData)
            .then(() => {
                resetForm();
                alert('Product updated successfully!');
            })
            .catch(err => alert('Error updating: ' + err.message));
    } else {
        // Create new
        const newProductRef = push(ref(db, 'products'));
        set(newProductRef, productData)
            .then(() => {
                resetForm();
                alert('Product added successfully!');
            })
            .catch(err => alert('Error adding: ' + err.message));
    }
});

// --- Load Products for Table ---
onValue(ref(db, 'products'), (snapshot) => {
    adminProductTable.innerHTML = '';
    const data = snapshot.val();
    if (data) {
        Object.keys(data).forEach(key => {
            renderTableRow(key, data[key]);
        });
    }
});

function renderTableRow(id, product) {
    const tr = document.createElement('tr');
    const thumbUrl = product.mediaUrls && product.mediaUrls.length > 0 ? product.mediaUrls[0] : 'https://via.placeholder.com/50';
    // Simple check if thumbnail is video, just show icon if so
    const thumbDisplay = thumbUrl.includes('.mp4') ? '<i class="fa-solid fa-video"></i>' : `<img src="${thumbUrl}" width="50" height="50" style="object-fit:cover; border-radius:5px;">`;

    tr.innerHTML = `
        <td>${thumbDisplay}</td>
        <td>${product.title}</td>
        <td>${product.price}</td>
        <td>${product.stockOut ? '<span class="stock-status-out">Stock Out</span>' : 'Active'}</td>
        <td class="action-buttons">
            <button class="btn btn-primary edit-btn"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger delete-btn"><i class="fa-solid fa-trash"></i></button>
        </td>
    `;

    // Attach Event Listeners to buttons
    tr.querySelector('.edit-btn').addEventListener('click', () => startEdit(id, product));
    tr.querySelector('.delete-btn').addEventListener('click', () => deleteProduct(id));
    
    adminProductTable.appendChild(tr);
}

// --- Edit Mode ---
function startEdit(id, product) {
    isEditing = true;
    formTitle.innerText = "Edit ID";
    saveBtn.innerText = "Update Product";
    cancelBtn.style.display = "inline-block";
    editProductIdInput.value = id;

    document.getElementById('title').value = product.title;
    document.getElementById('price').value = product.price;
    document.getElementById('shortDesc').value = product.shortDesc;
    document.getElementById('fullDesc').value = product.fullDesc;
    document.getElementById('playerInfo').value = product.playerInfo || '';
    document.getElementById('mediaUrls').value = product.mediaUrls ? product.mediaUrls.join(', ') : '';
    document.getElementById('stockOut').checked = product.stockOut || false;

    updateMediaPreview(product.mediaUrls);
    window.scrollTo(0,0); // Scroll to form
}

// --- Delete Product ---
function deleteProduct(id) {
    if(confirm('Are you sure you want to delete this ID?')) {
        remove(ref(db, 'products/' + id))
        .catch(err => alert('Error deleting: ' + err.message));
    }
}

// --- Reset Form ---
cancelBtn.addEventListener('click', resetForm);

function resetForm() {
    isEditing = false;
    formTitle.innerText = "Add New ID";
    saveBtn.innerText = "Add Product";
    cancelBtn.style.display = "none";
    productForm.reset();
    editProductIdInput.value = '';
    mediaPreview.innerHTML = '';
}

// --- Helper: Media Preview in Admin Form ---
mediaUrlsInput.addEventListener('input', (e) => {
     const mediaArray = e.target.value.split(',').map(url => url.trim()).filter(url => url.length > 0);
     updateMediaPreview(mediaArray);
});

function updateMediaPreview(urls) {
    mediaPreview.innerHTML = '';
    if(!urls) return;
    urls.forEach(url => {
        const isVideo = url.includes('.mp4') || url.includes('.webm');
        const el = isVideo ? document.createElement('video') : document.createElement('img');
        el.src = url;
        el.classList.add('media-preview-item');
        mediaPreview.appendChild(el);
    });
}
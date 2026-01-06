import { db, ref, push, set, onValue, remove, update } from './firebase-config.js';

// --- 1. CONFIGURATION ---
const CLOUD_NAME = "dlhu3xq4u"; 
const UPLOAD_PRESET = "efootballer"; 
const ADMIN_PASS = "admin123"; // Your login password

// --- 2. DOM ELEMENTS ---
const productForm = document.getElementById('productForm');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const adminProductTable = document.getElementById('adminProductTable');
const saveBtn = document.getElementById('saveBtn');
const previewContainer = document.getElementById('mediaPreview');
const editProductIdInput = document.getElementById('editProductId');
const cancelBtn = document.getElementById('cancelBtn');
const formTitle = document.getElementById('formTitle');

let isEditing = false;
let currentEditingMedia = []; 

// --- 3. AUTHENTICATION GATE ---
function checkAuth() {
    const loginOverlay = document.getElementById('loginOverlay');
    const adminContent = document.getElementById('adminContent');
    
    if (localStorage.getItem("eFootballAdmin") === "active") {
        if(loginOverlay) loginOverlay.style.display = "none";
        if(adminContent) adminContent.style.display = "block";
    } else {
        // This is handled by the inline script in your HTML, 
        // but we keep this here for logic consistency.
    }
}
checkAuth();

window.logoutAdmin = () => {
    localStorage.removeItem("eFootballAdmin");
    location.reload();
};

// --- 4. UTILITY: DATE FORMATTER ---
function formatAdminDate(timestamp) {
    if (!timestamp) return "N/A";
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-GB', { 
        day: '2-digit', month: 'short', year: 'numeric' 
    }) + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- 5. MEDIA PREVIEW LOGIC ---
fileInput.addEventListener('change', () => {
    previewContainer.innerHTML = '';
    Array.from(fileInput.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const el = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
            el.src = e.target.result;
            el.className = "media-preview-item";
            if(file.type.startsWith('video/')) {
                el.muted = true;
                el.autoplay = false;
                el.controls = true;
            }
            previewContainer.appendChild(el);
        };
        reader.readAsDataURL(file);
    });
});

// --- 6. FORM SUBMISSION (ADD & EDIT) ---
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = fileInput.files;
    
    // Keep old media if editing and no new files selected
    let mediaUrls = isEditing ? [...currentEditingMedia] : [];

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
        // If user selected new files, upload them
        if (files.length > 0) {
            // Option: Clear old media if new ones are uploaded during edit
            if(isEditing) mediaUrls = []; 

            for (let i = 0; i < files.length; i++) {
                uploadStatus.innerText = `Uploading ${i + 1}/${files.length}...`;
                const formData = new FormData();
                formData.append('file', files[i]);
                formData.append('upload_preset', UPLOAD_PRESET);

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                if (!response.ok) throw new Error(data.error.message);
                mediaUrls.push(data.secure_url);
            }
        }

        const productData = {
            title: document.getElementById('title').value,
            price: document.getElementById('price').value,
            playerInfo: document.getElementById('playerInfo').value || "",
            userContact: document.getElementById('userContact').value || "No Details", // NEW
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : ["https://via.placeholder.com/300?text=No+Image"],
            stockOut: document.getElementById('stockOut').checked,
            updatedAt: Date.now() // Timestamps for sorting
        };

        if (isEditing) {
            const productId = editProductIdInput.value;
            await update(ref(db, 'products/' + productId), productData);
            alert("Updated Successfully!");
        } else {
            await set(push(ref(db, 'products')), productData);
            alert("Added Successfully!");
        }

        resetForm();
        location.reload(); 
    } catch (error) {
        alert("Operation Failed: " + error.message);
        console.error(error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Product';
    }
});

// --- 7. LOAD TABLE DATA ---
onValue(ref(db, 'products'), (snapshot) => {
    adminProductTable.innerHTML = '';
    const data = snapshot.val();
    
    if (data) {
        const sortedKeys = Object.keys(data).sort((a, b) => (data[b].updatedAt || 0) - (data[a].updatedAt || 0));

        sortedKeys.forEach(key => {
            const product = data[key];
            const tr = document.createElement('tr');
            
            const thumb = (product.mediaUrls && product.mediaUrls[0]) ? product.mediaUrls[0] : "";
            const isVideo = thumb.includes('.mp4') || thumb.includes('.mov') || thumb.includes('video/upload');

            // Added data-label to every <td> for mobile responsiveness
            tr.innerHTML = `
                <td data-label="Thumbnail">
                    ${isVideo ? 
                        '<div style="width:50px; height:50px; background:#000; display:flex; align-items:center; justify-content:center; border-radius:5px;"><i class="fa-solid fa-video" style="color:var(--accent-color)"></i></div>' : 
                        `<img src="${thumb}" class="admin-table-img">`
                    }
                </td>
                <td data-label="Title"><div style="font-weight:600;">${product.title}</div></td>
                <td data-label="Price"><span style="color:var(--accent-color); font-weight:bold;">${product.price}</span></td>
                <td data-label="Status">
                    <span class="status-badge ${product.stockOut ? 'status-out' : 'status-in'}">
                        ${product.stockOut ? 'SOLD' : 'LIVE'}
                    </span>
                </td>
                <td data-label="Time" style="font-size:0.8rem; color:#888;">${formatAdminDate(product.updatedAt)}</td>
                <td data-label="Contact" style="font-size:0.8rem; color:#ccc;">${product.userContact || 'N/A'}</td>
                <td data-label="Actions">
                    <button class="btn btn-primary edit-btn" style="padding:8px 15px;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger delete-btn" style="padding:8px 15px;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;

            tr.querySelector('.edit-btn').onclick = () => startEdit(key, product);
            tr.querySelector('.delete-btn').onclick = () => deleteProduct(key);
            adminProductTable.appendChild(tr);
        });
    }
});

// --- 8. EDIT & DELETE ACTIONS ---
function startEdit(id, product) {
    isEditing = true;
    editProductIdInput.value = id;
    currentEditingMedia = product.mediaUrls || [];
    
    document.getElementById('title').value = product.title;
    document.getElementById('price').value = product.price;
    document.getElementById('playerInfo').value = product.playerInfo || "";
    document.getElementById('userContact').value = product.userContact || ""; // Load existing contact
    document.getElementById('stockOut').checked = product.stockOut;
    
    formTitle.innerText = "Editing ID: " + product.title;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update Product';
    saveBtn.style.background = "#25d366";
    cancelBtn.style.display = "block";
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
    if(confirm("Delete this listing permanently? This cannot be undone.")) {
        try {
            await remove(ref(db, 'products/' + id));
        } catch (err) {
            alert("Delete failed: " + err.message);
        }
    }
}

function resetForm() {
    isEditing = false;
    productForm.reset();
    previewContainer.innerHTML = '';
    editProductIdInput.value = '';
    formTitle.innerText = "List a New Account";
    saveBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Product';
    saveBtn.style.background = "var(--accent-color)";
    cancelBtn.style.display = "none";
}

if(cancelBtn) cancelBtn.onclick = resetForm;
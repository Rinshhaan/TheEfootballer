import { db, ref, push, set, onValue, remove, update } from './firebase-config.js';

const CLOUD_NAME = "dlhu3xq4u"; 
const UPLOAD_PRESET = "efootballer"; 

const productForm = document.getElementById('productForm');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const adminProductTable = document.getElementById('adminProductTable');
const saveBtn = document.getElementById('saveBtn');
const previewContainer = document.getElementById('mediaPreview');

let isEditing = false;
let currentEditingMedia = []; 

// Preview Logic
fileInput.addEventListener('change', () => {
    previewContainer.innerHTML = '';
    Array.from(fileInput.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const el = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
            el.src = e.target.result;
            el.className = "media-preview-item";
            if(file.type.startsWith('video/')) el.muted = true;
            previewContainer.appendChild(el);
        };
        reader.readAsDataURL(file);
    });
});

productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = fileInput.files;
    let mediaUrls = isEditing ? [...currentEditingMedia] : [];

    saveBtn.disabled = true;
    saveBtn.innerHTML = "Processing...";

    try {
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                uploadStatus.innerText = `Uploading ${i + 1}/${files.length}...`;
                const formData = new FormData();
                formData.append('file', files[i]);
                formData.append('upload_preset', UPLOAD_PRESET);

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
                    method: 'POST',
                    body: formData
                });
                
                const errorData = await response.json(); // Capture the specific error
                if (!response.ok) {
                    console.error("Cloudinary Error:", errorData);
                    throw new Error(errorData.error.message); // Show the real error to the user
                }
                
                mediaUrls.push(errorData.secure_url);
            }
        }

        const productData = {
            title: document.getElementById('title').value,
            price: document.getElementById('price').value,
            playerInfo: document.getElementById('playerInfo').value || "",
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : ["https://via.placeholder.com/300?text=No+Image"],
            stockOut: document.getElementById('stockOut').checked,
            updatedAt: Date.now()
        };

        if (isEditing) {
            await update(ref(db, 'products/' + document.getElementById('editProductId').value), productData);
        } else {
            await set(push(ref(db, 'products')), productData);
        }

        alert("Success!");
        location.reload(); 
    } catch (error) {
        alert("Upload Failed: " + error.message);
        console.error(error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "Add Product";
    }
});


// 3. LOAD TABLE
onValue(ref(db, 'products'), (snapshot) => {
    adminProductTable.innerHTML = '';
    const data = snapshot.val();
    if (data) {
        Object.keys(data).reverse().forEach(key => {
            const product = data[key];
            const tr = document.createElement('tr');
            const thumb = product.mediaUrls[0];
            const isVideo = thumb.includes('.mp4') || thumb.includes('.mov');

            tr.innerHTML = `
                <td>${isVideo ? '<i class="fa-solid fa-video"></i>' : `<img src="${thumb}" width="50" style="object-fit:cover; border-radius:5px;">`}</td>
                <td>${product.title}</td>
                <td>${product.price}</td>
                <td><span class="status-badge ${product.stockOut ? 'status-out' : 'status-in'}">${product.stockOut ? 'SOLD OUT' : 'AVAILABLE'}</span></td>
                <td>
                    <button class="btn btn-primary edit-btn" style="padding:5px 10px;"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger delete-btn" style="padding:5px 10px;"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tr.querySelector('.edit-btn').onclick = () => startEdit(key, product);
            tr.querySelector('.delete-btn').onclick = () => deleteProduct(key);
            adminProductTable.appendChild(tr);
        });
    }
});

function startEdit(id, product) {
    isEditing = true;
    editProductIdInput.value = id;
    currentEditingMedia = product.mediaUrls;
    document.getElementById('title').value = product.title;
    document.getElementById('price').value = product.price;
    document.getElementById('playerInfo').value = product.playerInfo;
    document.getElementById('stockOut').checked = product.stockOut;
    document.getElementById('formTitle').innerText = "Editing ID";
    cancelBtn.style.display = "block";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
    if(confirm("Delete this listing?")) await remove(ref(db, 'products/' + id));
}

cancelBtn.onclick = resetForm;
function resetForm() {
    isEditing = false;
    productForm.reset();
    previewContainer.innerHTML = '';
    document.getElementById('formTitle').innerText = "List a New Account";
    cancelBtn.style.display = "none";
}
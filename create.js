let users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
users = users.filter(u => (u.email||'').toLowerCase() !== 'user@example.com'.toLowerCase());
localStorage.setItem('nemecUsers', JSON.stringify(users));
console.log('Deleted user and updated nemecUsers. Remaining:', users.length);// create.js - IndexedDB-backed media posts with export/import, drag-and-drop, progress, and image resizing
(function() {
  const DB_NAME = 'nemecMediaDB';
  const STORE_NAME = 'posts';
  const DB_VER = 1;

  const MAX_IMAGE = 5 * 1024 * 1024; // 5MB
  const MAX_VIDEO = 10 * 1024 * 1024; // 10MB
  const MAX_AUDIO = 10 * 1024 * 1024; // 10MB

  // Elements
  const form = document.getElementById('createForm');
  const titleEl = document.getElementById('title');
  const descEl = document.getElementById('description');
  const imageInput = document.getElementById('imageInput');
  const videoInput = document.getElementById('videoInput');
  const audioInput = document.getElementById('audioInput');
  const deptSelect = document.getElementById('deptSelect');
  const attachLocation = document.getElementById('attachLocation');
  const authorSelect = document.getElementById('authorSelect');
  const preview = document.getElementById('preview');
  const feed = document.getElementById('feed');
  const dropZone = document.getElementById('dropZone');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');

  if (!form) return;

  // Simple promisified IndexedDB helpers  let users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
  console.log('Registered users:', users.length);
  console.table(users);  let users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
  console.log('Registered users:', users.length);
  console.table(users);
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // modal for showing a single author profile (by email)
  function openAuthorModal(email) {
    const existing = document.querySelector('.image-modal'); if (existing) existing.remove();
    const users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
    const u = users.find(x => (x.email || '').toString().toLowerCase() === (email || '').toString().toLowerCase());
    const overlay = document.createElement('div'); overlay.className='image-modal';
    let content = '';
    if (u) {
      content = `
        <div style="display:flex;gap:12px;align-items:center;color:#fff">
          ${u.profilePic?`<img src="${u.profilePic}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">`:'<div style="width:72px;height:72px;border-radius:50%;background:#444"></div>'}
          <div>
            <div style="font-weight:700;font-size:18px">${escapeHtml(u.name || '')}</div>
            <div style="font-size:13px;opacity:0.9">${escapeHtml(u.service || '')}</div>
            <div style="margin-top:8px"><a href="mailto:${escapeHtml(u.email)}" style="color:#d4af37">Email</a> · <a href="tel:${escapeHtml(u.phoneNumber)}" style="color:#d4af37">Call</a></div>
            <div style="margin-top:8px;color:#ddd;font-size:13px">${escapeHtml(u.department || '')}</div>
          </div>
        </div>
      `;
    } else {
      content = `<p style="color:#fff">No registered profile found for ${escapeHtml(email || '')}.</p>`;
    }
    overlay.innerHTML = `
      <div class="image-modal-content" style="max-width:600px; width:100%; text-align:left;">
        ${content}
      </div>
    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function idbAdd(post) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const r = store.put(post);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  function idbGetAll() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbDelete(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  // helpers to convert blob <-> dataURL for export/import
  function blobToDataURL(blob, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Read error'));
      reader.onload = () => resolve(reader.result);
      if (onProgress) reader.onprogress = onProgress;
      reader.readAsDataURL(blob);
    });
  }

  function dataURLToBlob(dataurl) {
    const parts = dataurl.split(',');
    const meta = parts[0];
    const bstr = atob(parts[1]);
    const m = /:(.*?);/.exec(meta);
    const mime = m ? m[1] : '';
    const u8 = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  // client-side image resize (max width 1280) to lower size when needed
  function resizeImageFile(file, maxWidth = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      const img = new Image();
      img.onerror = () => resolve(file); // if cannot load, fallback to original
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxWidth) {
          URL.revokeObjectURL(url);
          return resolve(file);
        }
        const ratio = maxWidth / width;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob); else resolve(file);
        }, file.type, quality);
      };
      img.src = url;
    });
  }

  // read file as blob with progress callback
  function readFileWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Read error'));
      reader.onload = () => resolve(dataURLToBlob(reader.result));
      if (onProgress) reader.onprogress = onProgress;
      reader.readAsDataURL(file);
    });
  }

  // UI helpers
  function clearPreview() { preview.innerHTML = ''; }

  function renderPreviewFromFiles(imageFile, videoFile, audioFile) {
    clearPreview();
    if (imageFile) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(imageFile);
      preview.appendChild(img);
    }
    if (videoFile) {
      const v = document.createElement('video');
      v.controls = true; v.src = URL.createObjectURL(videoFile);
      preview.appendChild(v);
    }
    if (audioFile) {
      const a = document.createElement('audio');
      a.controls = true; a.src = URL.createObjectURL(audioFile);
      preview.appendChild(a);
    }
  }

  // maintain selected files in variables so drag/drop can set them
  let selectedImage = null, selectedVideo = null, selectedAudio = null;

  imageInput.addEventListener('change', () => { selectedImage = imageInput.files[0] || null; renderPreviewFromFiles(selectedImage, selectedVideo, selectedAudio); });
  videoInput.addEventListener('change', () => { selectedVideo = videoInput.files[0] || null; renderPreviewFromFiles(selectedImage, selectedVideo, selectedAudio); });
  audioInput.addEventListener('change', () => { selectedAudio = audioInput.files[0] || null; renderPreviewFromFiles(selectedImage, selectedVideo, selectedAudio); });

  // drag & drop handlers
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));

  dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    // assign by type priority: image->imageInput, video->videoInput, audio->audioInput
    files.forEach(f => {
      if (f.type.startsWith('image/') && !selectedImage) {
        selectedImage = f;
        const dt = new DataTransfer(); dt.items.add(f); imageInput.files = dt.files;
      } else if (f.type.startsWith('video/') && !selectedVideo) {
        selectedVideo = f;
        const dt = new DataTransfer(); dt.items.add(f); videoInput.files = dt.files;
      } else if (f.type.startsWith('audio/') && !selectedAudio) {
        selectedAudio = f;
        const dt = new DataTransfer(); dt.items.add(f); audioInput.files = dt.files;
      }
    });
    renderPreviewFromFiles(selectedImage, selectedVideo, selectedAudio);
  });

  // render feed from IndexedDB
  async function renderFeed() {
    // Render fullscreen scrolling feed (one post per viewport) with video autoplay/pause and overlays
    feed.innerHTML = '';
    const posts = await idbGetAll();
    if (!posts.length) { feed.innerHTML = '<p style="text-align:center;">No posts yet.</p>'; return; }
    posts.sort((a,b)=> b.createdAt - a.createdAt);

    // populate author select from registered users (if present)
    function populateAuthorSelect() {
      if (!authorSelect) return;
      const users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
      // preserve current value
      const cur = authorSelect.value || '';
      authorSelect.innerHTML = '<option value="">-- Select a registered profile --</option>';
      users.forEach(u => {
        const v = u.email || (u.name ? u.name + '@' + (u.department||'') : '');
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `${u.name || v} ${u.department? '('+u.department+')':''}`;
        authorSelect.appendChild(opt);
      });
      if (cur) authorSelect.value = cur;
    }

    populateAuthorSelect();

    // helper: likes storage
    function readLikes() { try { return JSON.parse(localStorage.getItem('nemecPostLikes')||'{}'); } catch(e){return{}} }
    function saveLikes(obj){ localStorage.setItem('nemecPostLikes', JSON.stringify(obj)); }

    // build post cards
    for (const post of posts) {
      const card = document.createElement('div');
      card.className = 'post-card card';
      card.dataset.postId = post.id;

      // choose media: prefer video
      let mediaElementHtml = '';
      if (post.videoBlob) {
        const url = URL.createObjectURL(post.videoBlob);
        mediaElementHtml = `<video class="post-viewport-video" playsinline muted preload="metadata" src="${url}"></video>`;
      } else if (post.imageBlob) {
        const url = URL.createObjectURL(post.imageBlob);
        mediaElementHtml = `<img class="post-viewport-image" src="${url}" alt="${escapeHtml(post.title)}">`;
      } else if (post.audioBlob) {
        // show a placeholder image with audio controls below
        mediaElementHtml = `<div style="color:#fff;padding:20px;text-align:center;">Audio Post</div><audio controls src="${URL.createObjectURL(post.audioBlob)}"></audio>`;
      } else {
        mediaElementHtml = `<div style="color:#fff;padding:20px;text-align:center;">No media</div>`;
      }

      // like count
      const likesObj = readLikes();
      const likeCount = Number(likesObj[post.id] || 0);
      const likedKey = 'nemecPostLiked_' + post.id;
      const likedByMe = localStorage.getItem(likedKey) === '1';

      card.innerHTML = `
        ${mediaElementHtml}
        <div class="post-overlay">
          <button class="profile-btn" title="View department profiles">👤</button>
          <button class="like-btn" title="Like">${likedByMe? '❤️':'🤍'}</button>
          <div class="like-count">${likeCount}</div>
        </div>
        <div class="post-caption">
          <h4 style="margin:0;color:#fff">${escapeHtml(post.title)}</h4>
          ${post.authorName ? `<div style="font-size:13px;color:#ddd;margin-top:6px">By ${escapeHtml(post.authorName)}</div>` : ''}
          <p style="margin:6px 0;color:#fff;opacity:0.9">${escapeHtml(post.description)}</p>
        </div>
      `;

      // delete action (move into a small corner button?) keep in card content for now hidden in feed
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.style.position='absolute'; delBtn.style.left='8px'; delBtn.style.top='8px'; delBtn.style.zIndex=40; delBtn.style.background='rgba(255,255,255,0.1)'; delBtn.style.color='#fff'; delBtn.style.border='none'; delBtn.style.padding='6px'; delBtn.style.borderRadius='6px'; delBtn.style.cursor='pointer';
      delBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if(!confirm('Delete this post from this device?')) return; await idbDelete(post.id); renderFeed(); });
      card.appendChild(delBtn);

      feed.appendChild(card);
    }

    // IntersectionObserver to autoplay the video in view and auto-advance on ended
    const videos = feed.querySelectorAll('video.post-viewport-video');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const v = entry.target;
        try {
          const card = v.closest('.post-card');
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            v.muted = true; // autoplay requires muted on many browsers
            v.play().catch(()=>{});
          } else {
            v.pause();
          }
          // ensure we attach ended listener once
          if (!v._endedAttached) {
            v._endedAttached = true;
            v.addEventListener('ended', () => {
              // find next post card and scroll into view
              const next = card && card.nextElementSibling;
              if (next && next.classList.contains('post-card')) {
                next.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            });
          }
        } catch(e) {}
      });
    }, { threshold: [0.25,0.5,0.75] });
    videos.forEach(v => observer.observe(v));

    // wire like/profile buttons and update UI
    feed.querySelectorAll('.post-card').forEach(card => {
      const id = card.dataset.postId;
      const likeBtn = card.querySelector('.like-btn');
      const profileBtn = card.querySelector('.profile-btn');
      const likeCountEl = card.querySelector('.like-count');

      likeBtn.addEventListener('click', () => {
        const likes = readLikes();
        const likedKeyLocal = 'nemecPostLiked_' + id;
        const already = localStorage.getItem(likedKeyLocal) === '1';
        if (already) {
          // unlike
          localStorage.removeItem(likedKeyLocal);
          likes[id] = Math.max(0, Number(likes[id] || 0) - 1);
          likeBtn.textContent = '🤍';
        } else {
          localStorage.setItem(likedKeyLocal, '1');
          likes[id] = Number(likes[id] || 0) + 1;
          likeBtn.textContent = '❤️';
        }
        saveLikes(likes);
        likeCountEl.textContent = String(likes[id] || 0);
      });

      profileBtn.addEventListener('click', () => {
        // show modal with author profile if authorEmail present, else department list
        const postsMap = posts.reduce((acc,p)=>{ acc[String(p.id)]=p; return acc; }, {});
        const p = postsMap[String(id)] || {};
        if (p.authorEmail) openAuthorModal(p.authorEmail);
        else openProfileModal(p.department || '');
      });
    });
  }

  // modal for media
  function openMediaModal(src, type) {
    const existing = document.querySelector('.image-modal'); if (existing) existing.remove();
    const overlay = document.createElement('div'); overlay.className='image-modal';
    if (type === 'video') overlay.innerHTML = `\n      <div class="image-modal-content">\n        <video controls autoplay src="${src}"></video>\n      </div>\n    `;
    else overlay.innerHTML = `\n      <div class="image-modal-content">\n        <img src="${src}">\n      </div>\n    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // modal for showing department profiles
  function openProfileModal(department) {
    const existing = document.querySelector('.image-modal'); if (existing) existing.remove();
    const users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
    const deptUsers = users.filter(u => (u.department || '').toString().toLowerCase() === (department || '').toString().toLowerCase());
    const overlay = document.createElement('div'); overlay.className='image-modal';
    let listHtml = '';
    if (deptUsers.length === 0) {
      listHtml = `<p style="color:#fff">No registered profiles for ${escapeHtml(department || 'this department')}.</p>`;
    } else {
      listHtml = '<div style="display:flex;flex-direction:column;gap:12px;">' + deptUsers.map(u => `\n        <div style="display:flex;gap:12px;align-items:center;color:#fff">\n          ${u.profilePic?`<img src="${u.profilePic}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`:'<div style="width:48px;height:48px;border-radius:50%;background:#444"></div>'}\n          <div>\n            <div style="font-weight:600">${escapeHtml(u.name)}</div>\n            <div style="font-size:13px">${escapeHtml(u.service || '')}</div>\n            <div style="font-size:12px;margin-top:6px"><a href="mailto:${escapeHtml(u.email)}" style="color:#d4af37">Email</a> · <a href="tel:${escapeHtml(u.phoneNumber)}" style="color:#d4af37">Call</a></div>\n          </div>\n        </div>`).join('') + '</div>';
    }
    overlay.innerHTML = `\n      <div class="image-modal-content" style="max-width:600px; width:100%; text-align:left;">\n        <h3 style="color:#fff">Department: ${escapeHtml(department || '')}</h3>\n        ${listHtml}\n      </div>\n    `;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // escape helper
  function escapeHtml(s) { return String(s).replace(/[&<>\"]+/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }

  // Export posts -> JSON with dataURLs (prompts download)
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      const posts = await idbGetAll();
      const out = { posts: [] };
      for (const p of posts) {
        const item = { id: p.id, title: p.title, description: p.description, createdAt: p.createdAt, department: p.department };
        if (p.latitude != null) item.latitude = p.latitude;
        if (p.longitude != null) item.longitude = p.longitude;
        if (p.authorEmail) item.authorEmail = p.authorEmail;
        if (p.authorName) item.authorName = p.authorName;
        if (p.authorProfilePic) item.authorProfilePic = p.authorProfilePic;
        if (p.imageBlob) item.image = await blobToDataURL(p.imageBlob);
        if (p.videoBlob) item.video = await blobToDataURL(p.videoBlob);
        if (p.audioBlob) item.audio = await blobToDataURL(p.audioBlob);
        out.posts.push(item);
      }
      const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'nemec_posts_export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { alert('Export failed: ' + err.message); }
    exportBtn.disabled = false;
  });

  // Import posts
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (e) => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (!data.posts || !Array.isArray(data.posts)) throw new Error('Invalid import format');
      for (const item of data.posts) {
        const post = { id: item.id || Date.now(), title: item.title || '', description: item.description || '', createdAt: item.createdAt ? Number(item.createdAt) : Date.now(), department: item.department || '' };
        if (item.latitude != null) post.latitude = item.latitude;
        if (item.longitude != null) post.longitude = item.longitude;
        if (item.authorEmail) post.authorEmail = item.authorEmail;
        if (item.authorName) post.authorName = item.authorName;
        if (item.authorProfilePic) post.authorProfilePic = item.authorProfilePic;
        if (item.image) post.imageBlob = dataURLToBlob(item.image);
        if (item.video) post.videoBlob = dataURLToBlob(item.video);
        if (item.audio) post.audioBlob = dataURLToBlob(item.audio);
        await idbAdd(post);
      }
      alert('Import complete');
      renderFeed();
    } catch (err) { alert('Import failed: ' + err.message); }
    importInput.value = '';
  });

  // form submit: resize image if needed, convert files to blobs and save to IndexedDB with progress
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleEl.value.trim();
    const description = descEl.value.trim();
    if (!title || !description) return alert('Please add title and description');

    let imageFile = selectedImage || imageInput.files[0] || null;
    let videoFile = selectedVideo || videoInput.files[0] || null;
    let audioFile = selectedAudio || audioInput.files[0] || null;

    if (imageFile && imageFile.size > MAX_IMAGE) {
      try { const resized = await resizeImageFile(imageFile, 1280, 0.8); imageFile = resized; } catch (err) { return alert('Image too large and resizing failed'); }
    }
    if (imageFile && imageFile.size > MAX_IMAGE) return alert('Image too large (max 5MB)');
    if (videoFile && videoFile.size > MAX_VIDEO) return alert('Video too large (max 10MB)');
    if (audioFile && audioFile.size > MAX_AUDIO) return alert('Audio too large (max 10MB)');

    // create progress UI
    const progressWrap = document.createElement('div'); progressWrap.className = 'upload-progress';
    const prog = document.createElement('progress'); prog.max = 100; prog.value = 0; progressWrap.appendChild(prog);
    preview.appendChild(progressWrap);

    const post = { id: Date.now(), title, description, department: (deptSelect && deptSelect.value) ? String(deptSelect.value).trim() : '', createdAt: Date.now() };

    // attach selected author metadata (if any)
    try {
      if (authorSelect && authorSelect.value) {
        const users = JSON.parse(localStorage.getItem('nemecUsers') || '[]');
        const match = users.find(u => (u.email || '').toString().toLowerCase() === authorSelect.value.toString().toLowerCase());
        if (match) {
          post.authorEmail = match.email || authorSelect.value;
          post.authorName = match.name || '';
          if (match.profilePic) post.authorProfilePic = match.profilePic;
        } else {
          // fallback: store the raw value as email
          post.authorEmail = authorSelect.value;
        }
      }
    } catch (err) { console.warn('Author attach failed', err); }

    // optionally attach geolocation
    if (attachLocation && attachLocation.checked && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 10000 }));
        post.latitude = pos.coords.latitude;
        post.longitude = pos.coords.longitude;
      } catch (err) {
        // ignore geolocation failure, save without coords
        console.warn('Geolocation failed or denied:', err && err.message);
      }
    }

    try {
      if (imageFile) { const blob = await readFileWithProgress(imageFile, (ev) => { if (ev.lengthComputable) prog.value = Math.round((ev.loaded/ev.total)*33); }); post.imageBlob = blob; }
      if (videoFile) { const blob = await readFileWithProgress(videoFile, (ev) => { if (ev.lengthComputable) prog.value = 33 + Math.round((ev.loaded/ev.total)*33); }); post.videoBlob = blob; }
      if (audioFile) { const blob = await readFileWithProgress(audioFile, (ev) => { if (ev.lengthComputable) prog.value = 66 + Math.round((ev.loaded/ev.total)*34); }); post.audioBlob = blob; }

      prog.value = 100;
      await idbAdd(post);
      // try to upload post to backend (non-blocking)
      (async function tryUploadPost(p){
        try {
          const payload = { title: p.title, description: p.description, department: p.department, authorEmail: p.authorEmail };
          if (p.imageBlob) payload.image = await blobToDataURL(p.imageBlob);
          if (p.videoBlob) payload.video = await blobToDataURL(p.videoBlob);
          if (p.audioBlob) payload.audio = await blobToDataURL(p.audioBlob);
          await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          console.log('Post uploaded to server');
        } catch (err) { console.warn('Post upload failed (server may be offline):', err && err.message); }
      })(post);
      form.reset(); selectedImage = selectedVideo = selectedAudio = null; clearPreview(); renderFeed(); alert('Post saved locally (IndexedDB)');
    } catch (err) { alert('Save failed: ' + err.message); }
    progressWrap.remove();
  });

  // initial render
  renderFeed();

})();

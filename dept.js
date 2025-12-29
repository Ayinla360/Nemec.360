// dept.js - shared script to render users for a given department
// small media modal helper (supports image and video)
function openMediaModal(src, title, type = 'image') {
  const existing = document.querySelector('.image-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'image-modal';

  if (type === 'video') {
    overlay.innerHTML = `
      <div class="image-modal-content">
        <video controls autoplay src="${src}"></video>
        ${title ? `<div class="caption">${title}</div>` : ''}
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="image-modal-content">
        <img src="${src}" alt="${title || ''}">
        ${title ? `<div class="caption">${title}</div>` : ''}
      </div>
    `;
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('deptResults');
  const dept = document.body.dataset.dept || '';
  if (!container) return;

  // Insert a post form and a posts container above the results
  const main = container.parentElement || document.querySelector('main');
  const postsContainer = document.createElement('div');
  postsContainer.id = 'deptPosts';
  postsContainer.className = 'posts-container';
  if (main) main.insertBefore(postsContainer, container);

  // Storage key for department posts (stored per device)
  const STORAGE_KEY = 'nemecDeptPosts';

  function loadPosts() {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return all[dept] || [];
  }

  function savePosts(posts) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    all[dept] = posts;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function renderPosts() {
    postsContainer.innerHTML = '';

    // Show form for posting (vendors, technicians, dealerships)
    const allowed = ['vendors','technicians','dealerships'];
    if (allowed.includes(dept.toLowerCase())) {
      const form = document.createElement('form');
      form.className = 'post-form';
      form.innerHTML = `
        <h3>Post to ${dept}</h3>
        <input type="text" name="title" placeholder="Title" required />
        <textarea name="content" placeholder="Write your post here..." rows="3" required></textarea>
        <label class="small">Optional image (max 5MB)</label>
        <input type="file" name="image" accept="image/*" />
        <label class="small">Optional video (max 10MB, mp4/webm)</label>
        <input type="file" name="video" accept="video/*" />
        <button type="submit">Post</button>
      `;

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const title = form.querySelector('[name="title"]').value.trim();
        const content = form.querySelector('[name="content"]').value.trim();
        const imageFile = form.querySelector('[name="image"]').files[0];
        const videoFile = form.querySelector('[name="video"]').files[0];

        if (!title || !content) return alert('Please provide a title and content');

        const newPost = { id: Date.now(), title, content, image: '', video: '', createdAt: new Date().toISOString() };

        // optional size limits
        const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
        const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10MB

        function finalizeSave() {
          const posts = loadPosts();
          posts.unshift(newPost);
          savePosts(posts);
          form.reset();
          renderPosts();
        }

        // handle image + video input (if both present, save both)
        if (imageFile) {
          if (imageFile.size > MAX_IMAGE_BYTES) return alert('Image too large (max 5MB).');
          const r = new FileReader();
          r.onload = function(ev) {
            newPost.image = ev.target.result;
            if (videoFile) {
              if (videoFile.size > MAX_VIDEO_BYTES) return alert('Video too large (max 10MB).');
              const rv = new FileReader();
              rv.onload = function(ev2) { newPost.video = ev2.target.result; finalizeSave(); };
              rv.readAsDataURL(videoFile);
            } else {
              finalizeSave();
            }
          };
          r.readAsDataURL(imageFile);
        } else if (videoFile) {
          if (videoFile.size > MAX_VIDEO_BYTES) return alert('Video too large (max 10MB).');
          const rv = new FileReader();
          rv.onload = function(ev2) { newPost.video = ev2.target.result; finalizeSave(); };
          rv.readAsDataURL(videoFile);
        } else {
          finalizeSave();
        }
      });

      postsContainer.appendChild(form);
    }

    const posts = loadPosts();
    if (posts.length === 0) {
      const p = document.createElement('p');
      p.style.textAlign = 'center';
      p.innerHTML = `No posts yet for <strong>${dept}</strong>.`;
      postsContainer.appendChild(p);
    } else {
      const list = document.createElement('div');
      list.className = 'posts-list';
      posts.forEach(post => {
        const pc = document.createElement('div');
        pc.className = 'post-card card';
        pc.innerHTML = `
          ${post.image ? `<img src="${post.image}" alt="${post.title}">` : ''}
          ${post.video ? `<video class="post-video" controls src="${post.video}"></video>` : ''}
          <div class="card-content">
            <h4>${post.title}</h4>
            <p>${post.content}</p>
            <div class="meta"><small>${new Date(post.createdAt).toLocaleString()}</small></div>
            <div class="post-actions"><button data-id="${post.id}" class="delete-post">Delete</button></div>
          </div>
        `;
        list.appendChild(pc);

        // image click -> modal
        const imgEl = pc.querySelector('img');
        if (imgEl) {
          imgEl.style.cursor = 'pointer';
          imgEl.addEventListener('click', () => openMediaModal(imgEl.src, post.title, 'image'));
        }

        // video click -> modal
        const vidEl = pc.querySelector('video');
        if (vidEl) {
          vidEl.style.cursor = 'pointer';
          vidEl.addEventListener('click', () => openMediaModal(vidEl.src, post.title, 'video'));
        }

        // delete handler
        const del = pc.querySelector('.delete-post');
        if (del) {
          del.addEventListener('click', () => {
            if (!confirm('Remove this post from this device?')) return;
            const remaining = loadPosts().filter(p => p.id !== post.id);
            savePosts(remaining);
            renderPosts();
          });
        }
      });
      postsContainer.appendChild(list);
    }
  }

  // Render posts first, then the existing user listings
  renderPosts();

  const users = JSON.parse(localStorage.getItem('nemecUsers')) || [];
  const results = users.filter(u => (u.department || '').toLowerCase() === dept.toLowerCase());

  if (results.length === 0) {
    container.innerHTML = `\n      <p style="text-align:center;">No listings found for "<strong>${dept}</strong>".</p>`;
    return;
  }

  results.forEach(user => {
    const card = document.createElement('div');
    card.classList.add('card');

    const productImg = user.productPic ? `<img src="${user.productPic}" alt="Product Image">` : '';
    const emailLink = user.email ? `<a href="mailto:${user.email}" class="contact">Contact by email</a>` : '';
    const phoneLink = user.phoneNumber ? `<a href="tel:${user.phoneNumber}" class="contact">Call</a>` : '';

    card.innerHTML = `
      ${productImg}
      <div class="card-content">
        <h3>${user.name || ''}</h3>
        <p><strong>Department:</strong> ${user.department || ''}</p>
        <p><strong>Service:</strong> ${user.service || ''}</p>
        ${emailLink}
        ${phoneLink}
      </div>
    `;

    container.appendChild(card);
    // make product images tappable/clickable to view larger
    const imgEl = card.querySelector('img');
    if (imgEl) {
      imgEl.style.cursor = 'pointer';
      imgEl.addEventListener('click', () => openMediaModal(imgEl.src, user.name || user.service, 'image'));
    }
  });
});

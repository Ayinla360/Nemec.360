// Enhanced results with Fuse.js fuzzy search, department filter, and IndexedDB media search
window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('resultsContainer');
  const deptFilter = document.getElementById('deptFilter');
  const resultsInfo = document.getElementById('resultsInfo');
  const nearMe = document.getElementById('nearMe');
  const nearRadius = document.getElementById('nearRadius');
  const geoStatus = document.getElementById('geoStatus');
  const queryRaw = localStorage.getItem('nemecSearchQuery') || '';
  const query = (localStorage.getItem('nemecSearchQueryLower') || queryRaw.toLowerCase()).trim();

  // load registered users
  const users = JSON.parse(localStorage.getItem('nemecUsers')) || [];

  // helper escape
  function escapeHtml(s) { return String(s || '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // IndexedDB helper to read media posts
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('nemecMediaDB');
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function loadMediaPosts() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('posts', 'readonly');
        const store = tx.objectStore('posts');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (err) { return []; }
  }

  const mediaPosts = await loadMediaPosts();

  // Build a unified search index (users + media posts) and a single Fuse instance
  const unified = [];
  users.forEach((u, i) => {
    unified.push({
      _type: 'user',
      id: u.id || `user_${i}`,
      name: u.name || '',
      service: u.service || '',
      department: (u.department || '').toString().toLowerCase(),
      email: u.email || '',
      phoneNumber: u.phoneNumber || '',
      _orig: u
    });
  });
  mediaPosts.forEach(p => {
    unified.push({
      _type: 'post',
      id: `post_${p.id}`,
      title: p.title || '',
      description: p.description || '',
      department: (p.department || '').toString().toLowerCase(),
      imageBlob: p.imageBlob,
      videoBlob: p.videoBlob,
      audioBlob: p.audioBlob,
      createdAt: p.createdAt || 0,
      _orig: p
    });
  });

  const fuse = new Fuse(unified, {
    includeMatches: true,
    includeScore: true,
    threshold: 0.4,
    keys: [
      { name: 'name', weight: 0.35 },
      { name: 'service', weight: 0.25 },
      { name: 'department', weight: 0.1 },
      { name: 'email', weight: 0.05 },
      { name: 'phoneNumber', weight: 0.05 },
      { name: 'title', weight: 0.6 },
      { name: 'description', weight: 0.4 }
    ]
  });

  async function performSearch() {
    const dept = deptFilter ? (deptFilter.value || '').toString().toLowerCase() : '';
    let results = [];

    if (!query) {
      // no query: show all, sorted by createdAt for posts and then users
      results = unified.slice().map(item => ({ item }));
      results.sort((a,b) => {
        // posts use createdAt, put newest first; users go after posts
        const aTime = a.item.createdAt || 0;
        const bTime = b.item.createdAt || 0;
        return bTime - aTime;
      });
    } else {
      results = fuse.search(query);
    }

    if (dept) {
      results = results.filter(r => ((r.item.department || '').toString().toLowerCase() === dept));
    }

    // If nearest requested, try to get geolocation and compute distances
    if (nearMe && nearMe.checked && navigator.geolocation) {
      geoStatus.textContent = 'Locating...';
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 10000 }));
        geoStatus.textContent = 'Location acquired';
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;

        // compute distance (km) for each result where coords exist
        results.forEach(r => {
          const src = r.item._orig || r.item;
          const lat = (src && (src.latitude || src.lat || src.latitud)) || null;
          const lon = (src && (src.longitude || src.lng || src.lon || src.long)) || null;
          if (lat != null && lon != null) {
            r.distance = haversine(userLat, userLon, Number(lat), Number(lon));
          } else {
            r.distance = Infinity;
          }
        });

        // apply radius filter if set
        const radius = Number(nearRadius ? nearRadius.value : 0) || 0;
        if (radius > 0) results = results.filter(r => (r.distance || Infinity) <= radius);

        // sort by distance ascending
        results.sort((a,b) => (a.distance || Infinity) - (b.distance || Infinity));
      } catch (err) {
        geoStatus.textContent = 'Location unavailable';
        console.warn('Geolocation failed:', err && err.message);
      }
    } else {
      if (geoStatus) geoStatus.textContent = '';
    }

    renderResults(results);
  }

  function applyHighlights(text, match) {
    const orig = String(text || '');
    if (!match || !match.indices || !match.indices.length) return escapeHtml(orig);
    // build highlighted HTML by slicing original string and wrapping matched ranges
    let out = '';
    let last = 0;
    for (const pair of match.indices) {
      const [start, end] = pair;
      out += escapeHtml(orig.slice(last, start));
      out += '<mark>' + escapeHtml(orig.slice(start, end + 1)) + '</mark>';
      last = end + 1;
    }
    out += escapeHtml(orig.slice(last));
    return out;
  }

  // haversine distance (km)
  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = v => v * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10; // one decimal km
  }

  function renderResults(results) {
    container.innerHTML = '';
    const total = (results || []).length;
    if (resultsInfo) resultsInfo.textContent = `${total} result${total===1? '':'s'}`;

    if (total === 0) {
      container.innerHTML = `<p style="text-align:center;">No results found for "<strong>${escapeHtml(queryRaw || query)}</strong>".</p>`;
      return;
    }

    for (const r of results) {
      const item = r.item;
      const matches = r.matches || [];
      const matchedKeys = matches.map(m => m.key);
      const badge = matchedKeys.length ? `<div class="match-badges">${matchedKeys.map(k=>`<span class="badge">${escapeHtml(k)}</span>`).join(' ')}</div>` : '';

      const distanceStr = (r.distance !== undefined && isFinite(r.distance)) ? `<div class="meta"><small>${r.distance} km away</small></div>` : '';

      if (item._type === 'user') {
        const user = item._orig || item;
        const nameMatch = matches.find(m => m.key === 'name');
        const serviceMatch = matches.find(m => m.key === 'service');
        const deptMatch = matches.find(m => m.key === 'department');

        const card = document.createElement('div'); card.className = 'card';
        const productImg = (user.productPic) ? `<img src="${user.productPic}" alt="Product Image">` : '';
        const emailLink = user.email ? `<a href="mailto:${user.email}" class="contact">Contact by email</a>` : '';
        const phoneLink = user.phoneNumber ? `<a href="tel:${user.phoneNumber}" class="contact">Call</a>` : '';

        card.innerHTML = `
          ${productImg}
          <div class="card-content">
            <h3>${nameMatch ? applyHighlights(user.name, nameMatch) : escapeHtml(user.name)}</h3>
            <p><strong>Department:</strong> ${deptMatch ? applyHighlights(user.department, deptMatch) : escapeHtml(user.department)}</p>
            <p><strong>Service:</strong> ${serviceMatch ? applyHighlights(user.service, serviceMatch) : escapeHtml(user.service)}</p>
            ${emailLink}
            ${phoneLink}
            ${badge}
            ${distanceStr}
          </div>
        `;
        container.appendChild(card);

        const imgEl = card.querySelector('img');
        if (imgEl) { imgEl.style.cursor='pointer'; imgEl.addEventListener('click', () => {
          const existing = document.querySelector('.image-modal'); if (existing) existing.remove();
          const overlay = document.createElement('div'); overlay.className='image-modal'; overlay.innerHTML = `\n            <div class="image-modal-content">\n              <img src="${imgEl.src}" alt="${escapeHtml(user.name)}">\n              <div class="caption">${escapeHtml(user.name)}</div>\n            </div>\n          `; overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); }); document.body.appendChild(overlay);
        }); }

      } else if (item._type === 'post') {
        const post = item._orig || item;
        const titleMatch = matches.find(m => m.key === 'title');
        const descMatch = matches.find(m => m.key === 'description');

        const card = document.createElement('div'); card.className = 'card';
        let mediaHTML = '';
        if (item.imageBlob) mediaHTML += `<img src="${URL.createObjectURL(item.imageBlob)}" alt="${escapeHtml(item.title)}">`;
        if (item.videoBlob) mediaHTML += `<video class="post-video" controls src="${URL.createObjectURL(item.videoBlob)}"></video>`;
        if (item.audioBlob) mediaHTML += `<audio controls src="${URL.createObjectURL(item.audioBlob)}"></audio>`;

        card.innerHTML = `
          ${mediaHTML}
          <div class="card-content">
            <h3>${titleMatch ? applyHighlights(post.title, titleMatch) : escapeHtml(post.title)}</h3>
            <p>${descMatch ? applyHighlights(post.description, descMatch) : escapeHtml(post.description)}</p>
            <p><strong>Department:</strong> ${escapeHtml(post.department || '')}</p>
            ${badge}
            ${distanceStr}
          </div>
        `;
        container.appendChild(card);

        const imgEl = card.querySelector('img'); if (imgEl) { imgEl.style.cursor='pointer'; imgEl.addEventListener('click', ()=> openMediaModal(imgEl.src,'image')); }
        const vidEl = card.querySelector('video'); if (vidEl) { vidEl.style.cursor='pointer'; vidEl.addEventListener('click', ()=> openMediaModal(vidEl.src,'video')); }
      }
    }
  }

  // read any preselected department coming from search source
  const preselectedDept = localStorage.getItem('nemecSearchDept') || '';
  // wire dept filter
  if (deptFilter) {
    // if there's a preselected dept and it's one of the options, set it
    try {
      if (preselectedDept) {
        const opt = Array.from(deptFilter.options).find(o => (o.value || '').toString().toLowerCase() === preselectedDept.toString().toLowerCase());
        if (opt) deptFilter.value = opt.value;
      } else {
        deptFilter.value = '';
      }
    } catch (e) { deptFilter.value = ''; }
    deptFilter.addEventListener('change', function() {
      // if user changes filter, clear the stored preselected dept so it doesn't persist unexpectedly
      localStorage.removeItem('nemecSearchDept');
      performSearch();
    });
  }
  if (nearMe) nearMe.addEventListener('change', performSearch);
  if (nearRadius) nearRadius.addEventListener('change', performSearch);

  // perform initial search
  performSearch();

  // helper: open media modal
  function openMediaModal(src,type){ const existing=document.querySelector('.image-modal'); if(existing) existing.remove(); const overlay=document.createElement('div'); overlay.className='image-modal'; overlay.innerHTML = type==='video'?`\n  <div class="image-modal-content">\n    <video controls autoplay src="${src}"></video>\n  </div>\n`:`\n  <div class="image-modal-content">\n    <img src="${src}">\n  </div>\n`; overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); }); document.body.appendChild(overlay); }

});
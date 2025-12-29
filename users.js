(function(){
  const usersList = document.getElementById('usersList');
  const userCount = document.getElementById('userCount');
  const userSearch = document.getElementById('userSearch');
  const refreshBtn = document.getElementById('refreshBtn');
  const loadServerBtn = document.getElementById('loadServerBtn');
  const adminTokenInput = document.getElementById('adminTokenInput');
  const setAdminTokenBtn = document.getElementById('setAdminTokenBtn');

  function escapeHtml(s){ return String(s||'').replace(/[&<>"]+/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function loadUsers(){ return JSON.parse(localStorage.getItem('nemecUsers')||'[]'); }
  function saveUsers(arr){ localStorage.setItem('nemecUsers', JSON.stringify(arr)); }
  function getCurrentEmail(){ return (localStorage.getItem('nemecCurrentUserEmail')||'').toString().toLowerCase(); }

  function render(){
    const all = loadUsers();
    const q = (userSearch && userSearch.value||'').toString().toLowerCase().trim();
    const filtered = all.filter(u=>{
      if(!q) return true;
      return (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q) || (u.department||'').toLowerCase().includes(q) || (u.service||'').toLowerCase().includes(q);
    });

    userCount.textContent = filtered.length;
    usersList.innerHTML = '';
    if(filtered.length === 0){ usersList.innerHTML = '<p style="width:100%;text-align:center;color:#666">No users found.</p>'; return; }

    filtered.forEach(u=>{
      const card = document.createElement('div'); card.className = 'card pop-in';
      card.style.padding = '10px';
      const isMe = getCurrentEmail() && ((u.email||'').toLowerCase() === getCurrentEmail());
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center">
          <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;background:#eee;flex:0 0 64px">${u.profilePic?`<img src="${u.profilePic}" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:700">${escapeHtml(u.name||'')}</div>
                <div style="font-size:13px;color:#666">${escapeHtml(u.department||'')} ${u.service? '· '+escapeHtml(u.service):''}</div>
              </div>
              <div style="text-align:right">
                ${isMe?'<div style="font-size:12px;color:#0b7;">(You)</div>':''}
                <div style="font-size:12px;color:#999">${escapeHtml(new Date(u.registeredAt||u.createdAt||Date.now()).toString().slice(0,24))}</div>
              </div>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
              <a href="mailto:${escapeHtml(u.email||'')}" class="contact">Email</a>
              ${u.phoneNumber?`<a href="tel:${escapeHtml(u.phoneNumber)}" class="contact">Call</a>`:''}
              <button class="btn-elevated view-btn">View</button>
              <button class="btn-elevated" style="background:#d9534f" title="Delete user">Delete</button>
            </div>
          </div>
        </div>
      `;
      usersList.appendChild(card);

      const viewBtn = card.querySelector('.view-btn');
      viewBtn.addEventListener('click', ()=> openUserModal(u));
      const delBtn = card.querySelector('button[title="Delete user"]');
      delBtn.addEventListener('click', ()=>{
        if(!confirm('Remove this user from local storage?')) return;
        const all = loadUsers();
        const remaining = all.filter(x=> (x.email||'') !== (u.email||''));
        saveUsers(remaining);
        render();
      });
    });
  }

  function openUserModal(u){
    const existing = document.querySelector('.image-modal'); if(existing) existing.remove();
    const overlay = document.createElement('div'); overlay.className='image-modal';
    overlay.innerHTML = `
      <div class="image-modal-content" style="max-width:520px; width:100%; text-align:left; background:#111;padding:18px;border-radius:8px">
        <div style="display:flex;gap:12px;align-items:center;color:#fff">
          ${u.profilePic?`<img src="${u.profilePic}" style="width:84px;height:84px;border-radius:8px;object-fit:cover">`:'<div style="width:84px;height:84px;border-radius:8px;background:#333"></div>'}
          <div>
            <div style="font-weight:700;font-size:18px">${escapeHtml(u.name||'')}</div>
            <div style="color:#d4af37;margin-top:6px">${escapeHtml(u.department||'')}</div>
            <div style="margin-top:8px">${escapeHtml(u.service||'')}</div>
            <div style="margin-top:8px"><a href="mailto:${escapeHtml(u.email||'')}" style="color:#d4af37">Email</a> ${u.phoneNumber? ' · <a href="tel:'+escapeHtml(u.phoneNumber)+'" style="color:#d4af37">Call</a>':''}</div>
          </div>
        </div>
        <div style="margin-top:12px;color:#ddd">${escapeHtml(u.description||'')}</div>
      </div>
    `;
    overlay.addEventListener('click', e=>{ if(e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  userSearch && userSearch.addEventListener('input', ()=> render());
  refreshBtn && refreshBtn.addEventListener('click', ()=> render());
  loadServerBtn && loadServerBtn.addEventListener('click', async ()=>{
    try {
      // prefer session-stored token, else read from the input field
      let token = sessionStorage.getItem('nemecAdminToken') || '';
      if (!token && adminTokenInput && adminTokenInput.value) token = adminTokenInput.value.trim();
      if (!token) {
        token = prompt('Enter admin token to fetch users from server (will be stored in this session)');
      }
      if (!token) return;
      sessionStorage.setItem('nemecAdminToken', token);
      if (adminTokenInput) adminTokenInput.value = '';
      const res = await fetch('/api/users', { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) throw new Error('Server responded ' + res.status);
      const remote = await res.json();
      if (!Array.isArray(remote)) throw new Error('Invalid data');
      // store remote users locally (merge without duplicates by email)
      const local = loadUsers();
      const map = {};
      local.concat(remote).forEach(u=>{ if(u && u.email) map[(u.email||'').toLowerCase()] = u; });
      const merged = Object.values(map);
      saveUsers(merged);
      alert('Imported ' + remote.length + ' users from server');
      render();
    } catch (err) {
      alert('Failed to load users from server: ' + (err && err.message));
    }
  });

  // allow setting token explicitly
  if (setAdminTokenBtn) {
    setAdminTokenBtn.addEventListener('click', ()=>{
      const v = (adminTokenInput && adminTokenInput.value || '').toString().trim();
      if (!v) return alert('Enter a token first');
      sessionStorage.setItem('nemecAdminToken', v);
      alert('Admin token saved to this browser session');
    });
  }

  // initial render
  render();
})();

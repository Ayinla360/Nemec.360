// nav.js - inject shared bottom navigation into every page
(function(){
  const NAV_HTML = `
  <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
    <a class="nav-btn" href="index.html" aria-label="Home">
      <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 3l9 8h-3v8h-12v-8h-3z"></path>
      </svg>
      <span class="nav-label">Home</span>
    </a>
    <a class="nav-btn" href="create.html" aria-label="Create">
      <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M19 13h-6v6h-2v-6h-6v-2h6v-6h2v6h6z"></path>
      </svg>
      <span class="nav-label">Create</span>
    </a>
    <a class="nav-btn" href="results.html" aria-label="Search">
      <svg class="nav-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 001.57-5.34C15.16 5.59 12.57 3 9.5 3S3.84 5.59 3.84 8.39 6.43 13.78 9.5 13.78c1.61 0 3.09-.59 4.21-1.56l.27.28v.79l4.25 4.25 1.49-1.49L15.5 14zM9.5 12c-2.01 0-3.66-1.65-3.66-3.66S7.49 4.69 9.5 4.69 13.16 6.34 13.16 8.35 11.51 12 9.5 12z"></path>
      </svg>
      <span class="nav-label">Search</span>
    </a>
  </nav>
  `;

  function markActive() {
    const links = document.querySelectorAll('.bottom-nav a.nav-btn');
    const path = location.pathname.split('/').pop();
    links.forEach(a => {
      const href = a.getAttribute('href');
      if (href === path || (href === 'index.html' && (path === '' || path === 'index.html'))) {
        a.classList.add('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { document.body.insertAdjacentHTML('beforeend', NAV_HTML); markActive(); });
  } else {
    document.body.insertAdjacentHTML('beforeend', NAV_HTML); markActive();
  }
})();

// Single, consistent search handler: store query and go to results page
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');

if (searchBtn) searchBtn.addEventListener('click', searchItems);
if (searchInput) searchInput.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') searchItems();
});

function searchItems() {
  const raw = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
  if (!raw) {
    alert('Please enter a search term.');
    return;
  }

  const query = raw;
  localStorage.setItem('nemecSearchQuery', query); // store raw for display
  localStorage.setItem('nemecSearchQueryLower', query.toLowerCase()); // store lowercase for matching
  // If on a department page, carry the department into the search so results can pre-filter
  try {
    const body = document.body;
    const dept = body && body.getAttribute && body.getAttribute('data-dept');
    if (dept) localStorage.setItem('nemecSearchDept', dept.toString().toLowerCase());
    else localStorage.removeItem('nemecSearchDept');
  } catch (e) { /* ignore */ }
  window.location.href = 'results.html';
}
// Apply the saved theme before first paint so there is no flash (kept outside index.html for the CSP).
try {
  var t = localStorage.getItem('folio-theme');
  if (t) document.documentElement.dataset.theme = t;
  var p = localStorage.getItem('folio-paper');
  if (p) document.documentElement.dataset.paper = p;
} catch (e) { /* storage unavailable */ }

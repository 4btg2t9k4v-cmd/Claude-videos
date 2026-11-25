// Google sends the student back here after sign-in, with the token in the URL fragment.
// Hand it to the app window (same origin only) and close.
(function () {
  var p = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  var msg = { state: p.get('state'), access_token: p.get('access_token'), expires_in: p.get('expires_in'), scope: p.get('scope'), error: p.get('error') };
  history.replaceState(null, '', location.pathname); // keep the token out of history
  try { var ch = new BroadcastChannel('folio-oauth'); ch.postMessage(msg); ch.close(); } catch (e) { /* very old browser */ }
  setTimeout(function () { window.close(); }, 150);
})();

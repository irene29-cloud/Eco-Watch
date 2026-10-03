/* EcoWatch - Environmental Complaint & Reporting Portal
 * Frontend only. Data lives in localStorage so the app works without a backend.
 */
(function () {
  'use strict';

  // ---------- Config ----------
  var CATEGORIES = [
    'Air pollution', 'Water pollution', 'Noise', 'Illegal dumping',
    'Waste burning', 'Deforestation', 'Industrial discharge', 'Other'
  ];
  var LOCALITIES = ['Downtown', 'Riverside', 'Industrial Estate', 'Old Town', 'Lakeview', 'Hillcrest'];
  var STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
  var STATUS_COLOR = { open: '#d9534f', in_progress: '#e8a317', resolved: '#1f8a4c' };
  var ADMIN_PIN = '1234'; // demo only; a real app must authenticate on a server
  var DEFAULT_CENTER = [12.9716, 77.5946];

  var KEYS = {
    complaints: 'ecowatch.complaints',
    votes: 'ecowatch.votes',
    session: 'ecowatch.session'
  };

  // ---------- Storage ----------
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  function seed() {
    var now = Date.now();
    var day = 86400000;
    return [
      { id: 's1', title: 'Garbage heap near the bus stand', category: 'Illegal dumping', locality: 'Downtown',
        severity: 'medium', description: 'Waste has piled up for over a week and stray animals are scattering it onto the road.',
        reporter: 'Anita', lat: 12.9763, lng: 77.5929, votes: 14, status: 'open', note: '', createdAt: now - 2 * day },
      { id: 's2', title: 'Dark smoke from factory chimney at night', category: 'Air pollution', locality: 'Industrial Estate',
        severity: 'high', description: 'Thick black smoke every night after 10 pm. Residents report coughing and eye irritation.',
        reporter: 'Ravi', lat: 12.9352, lng: 77.6245, votes: 31, status: 'in_progress', note: 'Inspection scheduled with the pollution board.', createdAt: now - 5 * day },
      { id: 's3', title: 'Foam and chemical smell in the river', category: 'Water pollution', locality: 'Riverside',
        severity: 'high', description: 'White foam floating downstream and a strong chemical odour near the bridge.',
        reporter: 'Anonymous', lat: 12.9501, lng: 77.5702, votes: 22, status: 'open', note: '', createdAt: now - 1 * day },
      { id: 's4', title: 'Loudspeakers past midnight', category: 'Noise', locality: 'Old Town',
        severity: 'low', description: 'Event hall plays amplified music until 2 am on weekdays.',
        reporter: 'Meera', lat: 12.9667, lng: 77.5833, votes: 6, status: 'resolved', note: 'Operator warned and fined.', createdAt: now - 9 * day }
    ];
  }

  // ---------- State ----------
  var complaints = read(KEYS.complaints, null);
  if (!complaints) { complaints = seed(); write(KEYS.complaints, complaints); }
  var votes = read(KEYS.votes, []);               // ids the user has upvoted
  var session = read(KEYS.session, { role: 'citizen', locality: null });
  var pickedLatLng = null;
  var pickMap, pickMarker, mainMap, markerLayer;

  // ---------- Helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function save() { write(KEYS.complaints, complaints); }
  function timeAgo(ts) {
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    var units = [['day', 86400], ['hour', 3600], ['minute', 60]];
    for (var i = 0; i < units.length; i++) {
      if (s >= units[i][1]) {
        var n = Math.floor(s / units[i][1]);
        return n + ' ' + units[i][0] + (n > 1 ? 's' : '') + ' ago';
      }
    }
    return 'just now';
  }
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }
  function fillSelect(sel, items, firstLabel) {
    sel.innerHTML = '';
    if (firstLabel) sel.add(new Option(firstLabel, 'all'));
    items.forEach(function (i) { sel.add(new Option(i, i)); });
  }
  function isAdmin() { return session.role === 'admin' && !!session.locality; }

  // ---------- Navigation ----------
  function showView(name) {
    $all('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    $all('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === name); });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'report' && pickMap) setTimeout(function () { pickMap.invalidateSize(); }, 50);
    if (name === 'map') { renderMap(); setTimeout(function () { mainMap.invalidateSize(); }, 50); }
    if (name === 'community') renderFeed();
    if (name === 'admin') renderAdmin();
  }

  // ---------- Maps ----------
  function initMaps() {
    var tiles = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    var attr = '&copy; OpenStreetMap contributors';

    pickMap = L.map('pickMap').setView(DEFAULT_CENTER, 12);
    L.tileLayer(tiles, { attribution: attr, maxZoom: 19 }).addTo(pickMap);
    pickMap.on('click', function (e) { setPicked(e.latlng.lat, e.latlng.lng); });

    mainMap = L.map('mainMap').setView(DEFAULT_CENTER, 12);
    L.tileLayer(tiles, { attribution: attr, maxZoom: 19 }).addTo(mainMap);
    markerLayer = L.layerGroup().addTo(mainMap);
  }

  function setPicked(lat, lng, zoom) {
    pickedLatLng = { lat: lat, lng: lng };
    if (!pickMarker) pickMarker = L.marker([lat, lng]).addTo(pickMap);
    else pickMarker.setLatLng([lat, lng]);
    if (zoom) pickMap.setView([lat, lng], zoom); else pickMap.panTo([lat, lng]);
    $('#coordsText').textContent = 'Selected: ' + lat.toFixed(5) + ', ' + lng.toFixed(5);
    setError('location', '');
  }

  function useMyLocation() {
    var btn = $('#geoBtn');
    if (!navigator.geolocation) { toast('Geolocation is not supported by this browser.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setPicked(pos.coords.latitude, pos.coords.longitude, 16);
        btn.disabled = false; btn.textContent = 'Use my location';
        toast('Location captured.', 'success');
      },
      function (err) {
        btn.disabled = false; btn.textContent = 'Use my location';
        var msg = err.code === 1 ? 'Location permission denied. Click the map instead.' : 'Could not get your location.';
        toast(msg, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function renderMap() {
    markerLayer.clearLayers();
    var bounds = [];
    complaints.forEach(function (c) {
      var m = L.circleMarker([c.lat, c.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: STATUS_COLOR[c.status], fillOpacity: 0.95
      });
      m.bindPopup(
        '<strong>' + esc(c.title) + '</strong><br>' +
        esc(c.category) + ' &middot; ' + esc(c.locality) + '<br>' +
        'Status: ' + esc(STATUS_LABEL[c.status]) + ' &middot; ' + c.votes + ' upvotes'
      );
      m.addTo(markerLayer);
      bounds.push([c.lat, c.lng]);
    });
    if (bounds.length) mainMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  // ---------- Report form ----------
  function setError(field, msg) {
    var el = $('[data-error-for="' + field + '"]');
    if (!el) return;
    el.textContent = msg;
    var wrap = el.closest('.field');
    if (wrap) wrap.classList.toggle('invalid', !!msg);
  }

  function validate(form) {
    var ok = true;
    var title = form.title.value.trim();
    var desc = form.description.value.trim();
    setError('title', ''); setError('description', ''); setError('location', '');
    setError('category', ''); setError('locality', '');
    if (title.length < 5) { setError('title', 'Please enter a title of at least 5 characters.'); ok = false; }
    if (!form.category.value) { setError('category', 'Choose a category.'); ok = false; }
    if (!form.locality.value) { setError('locality', 'Choose a locality.'); ok = false; }
    if (desc.length < 15) { setError('description', 'Describe the issue in at least 15 characters.'); ok = false; }
    if (!pickedLatLng) { setError('location', 'Pick the location on the map.'); ok = false; }
    return ok;
  }

  function onSubmitComplaint(e) {
    e.preventDefault();
    var form = e.target;
    if (!validate(form)) { toast('Please fix the highlighted fields.', 'error'); return; }
    complaints.unshift({
      id: uid(),
      title: form.title.value.trim(),
      category: form.category.value,
      locality: form.locality.value,
      severity: form.severity.value,
      description: form.description.value.trim(),
      reporter: form.reporter.value.trim() || 'Anonymous',
      lat: pickedLatLng.lat,
      lng: pickedLatLng.lng,
      votes: 0,
      status: 'open',
      note: '',
      createdAt: Date.now()
    });
    save();
    resetForm(form);
    toast('Complaint submitted. Thank you!', 'success');
    showView('community');
  }

  function resetForm(form) {
    form.reset();
    pickedLatLng = null;
    if (pickMarker) { pickMap.removeLayer(pickMarker); pickMarker = null; }
    $('#coordsText').textContent = 'Click the map or use your location to set the spot.';
    $all('.error', form).forEach(function (el) { el.textContent = ''; });
    $all('.invalid', form).forEach(function (el) { el.classList.remove('invalid'); });
  }

  // ---------- Feed ----------
  function complaintCard(c, opts) {
    opts = opts || {};
    var voted = votes.indexOf(c.id) !== -1;
    var html =
      '<article class="card complaint" data-id="' + esc(c.id) + '">' +
        '<button class="vote' + (voted ? ' voted' : '') + '" data-action="vote" aria-pressed="' + voted + '" aria-label="Upvote">' +
          '<span class="arrow">&#9650;</span><span class="count">' + c.votes + '</span>' +
        '</button>' +
        '<div>' +
          '<h3>' + esc(c.title) + '</h3>' +
          '<div class="meta">' +
            '<span class="badge status-' + c.status + '">' + esc(STATUS_LABEL[c.status]) + '</span>' +
            '<span class="badge sev-' + esc(c.severity) + '">' + esc(c.severity) + ' severity</span>' +
            '<span class="badge">' + esc(c.category) + '</span>' +
            '<span>' + esc(c.locality) + '</span><span>&middot;</span>' +
            '<span>' + esc(c.reporter) + ', ' + timeAgo(c.createdAt) + '</span>' +
          '</div>' +
          '<p class="desc">' + esc(c.description) + '</p>' +
          (c.note ? '<div class="admin-note"><strong>Admin update:</strong> ' + esc(c.note) + '</div>' : '') +
          (opts.admin ? adminControls(c) : '') +
        '</div>' +
      '</article>';
    return html;
  }

  function adminControls(c) {
    var options = Object.keys(STATUS_LABEL).map(function (k) {
      return '<option value="' + k + '"' + (k === c.status ? ' selected' : '') + '>' + STATUS_LABEL[k] + '</option>';
    }).join('');
    return '<div class="admin-controls">' +
      '<select data-field="status" aria-label="Status">' + options + '</select>' +
      '<input data-field="note" type="text" maxlength="200" placeholder="Add an update for the public" value="' + esc(c.note) + '" />' +
      '<button class="btn btn-primary btn-sm" data-action="save">Save</button>' +
    '</div>';
  }

  function renderFeed() {
    var cat = $('#fCategory').value, loc = $('#fLocality').value, st = $('#fStatus').value;
    var sort = $('#fSort').value, q = $('#fSearch').value.trim().toLowerCase();

    var list = complaints.filter(function (c) {
      return (cat === 'all' || c.category === cat) &&
             (loc === 'all' || c.locality === loc) &&
             (st === 'all' || c.status === st) &&
             (!q || (c.title + ' ' + c.description).toLowerCase().indexOf(q) !== -1);
    });
    list.sort(function (a, b) { return sort === 'new' ? b.createdAt - a.createdAt : b.votes - a.votes; });

    $('#feed').innerHTML = list.length
      ? list.map(function (c) { return complaintCard(c); }).join('')
      : '<div class="card empty">No reports match your filters.</div>';
  }

  function toggleVote(id) {
    var c = complaints.find(function (x) { return x.id === id; });
    if (!c) return;
    var idx = votes.indexOf(id);
    if (idx === -1) { votes.push(id); c.votes += 1; }
    else { votes.splice(idx, 1); c.votes = Math.max(0, c.votes - 1); }
    write(KEYS.votes, votes);
    save();
  }

  // ---------- Admin ----------
  function renderSession() {
    $('#sessionLabel').textContent = isAdmin() ? 'Admin: ' + session.locality : 'Citizen';
    $('#sessionBtn').textContent = isAdmin() ? 'Sign out' : 'Admin login';
  }

  function renderAdmin() {
    var locked = $('#adminLocked'), panel = $('#adminPanel');
    if (!isAdmin()) {
      locked.hidden = false; panel.hidden = true;
      $('#adminSub').textContent = 'Sign in to manage complaints in your locality.';
      return;
    }
    locked.hidden = true; panel.hidden = false;
    $('#adminSub').textContent = 'Showing complaints for ' + session.locality + ' only.';

    var mine = complaints.filter(function (c) { return c.locality === session.locality; });
    var count = function (s) { return mine.filter(function (c) { return c.status === s; }).length; };
    $('#stats').innerHTML = [
      ['Total', mine.length], ['Open', count('open')],
      ['In progress', count('in_progress')], ['Resolved', count('resolved')]
    ].map(function (s) {
      return '<div class="card stat"><strong>' + s[1] + '</strong><span>' + s[0] + '</span></div>';
    }).join('');

    mine.sort(function (a, b) { return b.votes - a.votes; });
    $('#adminList').innerHTML = mine.length
      ? mine.map(function (c) { return complaintCard(c, { admin: true }); }).join('')
      : '<div class="card empty">No complaints in this locality yet.</div>';
  }

  function adminSave(card) {
    var id = card.dataset.id;
    var c = complaints.find(function (x) { return x.id === id; });
    if (!c || !isAdmin() || c.locality !== session.locality) {
      toast('You can only update complaints in your own locality.', 'error');
      return;
    }
    c.status = $('[data-field="status"]', card).value;
    c.note = $('[data-field="note"]', card).value.trim();
    save();
    renderAdmin();
    toast('Complaint updated.', 'success');
  }

  function openLogin() {
    $('#loginError').textContent = '';
    $('#adminPin').value = '';
    $('#loginModal').hidden = false;
    $('#adminPin').focus();
  }
  function closeLogin() { $('#loginModal').hidden = true; }

  function onLogin(e) {
    e.preventDefault();
    if ($('#adminPin').value !== ADMIN_PIN) { $('#loginError').textContent = 'Incorrect PIN.'; return; }
    session = { role: 'admin', locality: $('#adminLocality').value };
    write(KEYS.session, session);
    closeLogin();
    renderSession();
    toast('Signed in as admin for ' + session.locality + '.', 'success');
    showView('admin');
  }

  function signOut() {
    session = { role: 'citizen', locality: null };
    write(KEYS.session, session);
    renderSession();
    renderAdmin();
    toast('Signed out.');
  }

  // ---------- Init ----------
  function init() {
    fillSelect($('#category'), CATEGORIES);
    fillSelect($('#locality'), LOCALITIES);
    fillSelect($('#adminLocality'), LOCALITIES);
    fillSelect($('#fCategory'), CATEGORIES, 'All categories');
    fillSelect($('#fLocality'), LOCALITIES, 'All localities');

    initMaps();
    renderSession();

    $('#nav').addEventListener('click', function (e) {
      var b = e.target.closest('.nav-btn');
      if (b) showView(b.dataset.view);
    });
    $('#complaintForm').addEventListener('submit', onSubmitComplaint);
    $('#complaintForm').addEventListener('reset', function () {
      setTimeout(function () { resetForm($('#complaintForm')); }, 0);
    });
    $('#geoBtn').addEventListener('click', useMyLocation);

    ['fCategory', 'fLocality', 'fStatus', 'fSort'].forEach(function (id) {
      $('#' + id).addEventListener('change', renderFeed);
    });
    $('#fSearch').addEventListener('input', renderFeed);

    $('#feed').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="vote"]');
      if (!btn) return;
      toggleVote(btn.closest('.complaint').dataset.id);
      renderFeed();
    });
    $('#adminList').addEventListener('click', function (e) {
      var card = e.target.closest('.complaint');
      if (!card) return;
      if (e.target.closest('[data-action="save"]')) adminSave(card);
      else if (e.target.closest('[data-action="vote"]')) { toggleVote(card.dataset.id); renderAdmin(); }
    });

    $('#sessionBtn').addEventListener('click', function () { isAdmin() ? signOut() : openLogin(); });
    $('#openLoginBtn').addEventListener('click', openLogin);
    $('#loginForm').addEventListener('submit', onLogin);
    $all('[data-close]').forEach(function (el) { el.addEventListener('click', closeLogin); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLogin(); });

    var start = location.hash.replace('#', '');
    showView(['report', 'community', 'map', 'admin'].indexOf(start) !== -1 ? start : 'report');
  }

  document.addEventListener('DOMContentLoaded', init);
})();

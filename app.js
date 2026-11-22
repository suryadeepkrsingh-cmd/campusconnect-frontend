/* CampusConnect frontend for the Flask API in ../app.py. */
(() => {
 const API_BASE = 'https://campusconnect-backend-znbo.onrender.com/api';
  const USER_KEY = 'campusconnect_user_id';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const palette = ['palette-0','palette-1','palette-2','palette-3','palette-4','palette-5'];
  let events = [];
  let activeFilter = 'all';
  let pendingEvent = null;
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeError = async (response) => { let body = {}; try { body = await response.json(); } catch (_) {} return body?.error?.message || `Request failed (${response.status}).`; };
  const showNotice = (message) => { const notice = $('#api-notice'); if (notice) { notice.textContent = message; notice.hidden = false; } };
  const clearNotice = () => { const notice = $('#api-notice'); if (notice) notice.hidden = true; };
  const toast = (message) => { const node = $('#toast'); if (!node) return; node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3000); };
  const userId = () => localStorage.getItem(USER_KEY) || '';
  function updateIdentity() {
    const id = userId(); const label = $('#identity-label'); const avatar = $('.avatar'); const count = $('#nav-count');
    if (label) label.textContent = id ? `ID · ${id.slice(0, 8)}` : 'Set your ID';
    if (avatar) avatar.textContent = id ? id[0].toUpperCase() : 'Y';
    if (count) count.textContent = $('#registration-total')?.textContent || '0';
  }
  function openIdentity() { const modal = $('#identity-modal'); if (!modal) return; $('#user-id').value = userId(); $('#identity-error').textContent = ''; modal.showModal(); }
  function bindIdentity() {
    $('#identity-open')?.addEventListener('click', openIdentity);
    $('#identity-form')?.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault(); const value = $('#user-id').value.trim();
      if (!UUID_RE.test(value)) { $('#identity-error').textContent = 'Enter a valid UUID to continue.'; return; }
      localStorage.setItem(USER_KEY, value); $('#identity-modal').close(); updateIdentity(); toast('Profile saved. You’re all set.');
      if (document.body.dataset.page === 'registrations') loadRegistrations();
    });
  }
  function getCapacity(event) { const n = Number(event.capacity); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function renderEvents() {
    const grid = $('#event-grid'); if (!grid) return;
    const query = ($('#event-search')?.value || '').trim().toLowerCase();
    const filtered = events.filter((event) => {
      const spots = getCapacity(event) - (event.registered_count ?? 0);
      const open = spots > 0 && String(event.status || '').toLowerCase() !== 'cancelled';
      return (activeFilter !== 'open' || open) && String(event.title || '').toLowerCase().includes(query);
    });
    if (!filtered.length) { grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✳</div><h3>${events.length ? 'Nothing matches just yet.' : 'Your campus story starts here.'}</h3><p>${events.length ? 'Try another search or filter.' : 'There are no events to show right now. Check back soon.'}</p>${events.length ? '<a href="#" id="clear-search">Clear search</a>' : ''}</div>`; $('#clear-search')?.addEventListener('click', (e) => { e.preventDefault(); $('#event-search').value = ''; activeFilter = 'all'; document.querySelectorAll('.filter-button').forEach((button) => button.classList.toggle('selected', button.dataset.filter === 'all')); renderEvents(); }); return; }
    grid.innerHTML = filtered.map((event) => {
      const index = Math.abs([...String(event.id || event.title || 'event')].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0)) % palette.length;
      const capacity = getCapacity(event); const spots = event.registered_count == null ? null : Math.max(0, capacity - event.registered_count); const full = spots === 0 || String(event.status || '').toLowerCase() === 'cancelled'; const status = String(event.status || (full ? 'Full' : 'Open')).replace(/[_-]/g, ' ');
      return `<article class="event-card"><div class="card-art ${palette[index]}"><span class="capacity-pill ${full ? 'full' : ''}">${full ? 'Currently full' : spots == null ? `Capacity · ${capacity}` : `${spots} ${spots === 1 ? 'spot' : 'spots'} left`}</span><span class="card-glyph" aria-hidden="true">${['✳','↗','◒','✦','⌁','◈'][index]}</span></div><div class="card-content"><div class="card-meta"><span class="status-label">${escapeHtml(status)}</span></div><h3>${escapeHtml(event.title || 'Campus event')}</h3><p class="card-description">A chance to meet, make something, and be part of campus life.</p><div class="card-bottom"><span class="capacity-text">${full ? 'Come back next time' : `Capacity · ${capacity}`}</span><button class="small-button" data-event-id="${escapeHtml(event.id)}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join event'} <span aria-hidden="true">→</span></button></div></div></article>`;
    }).join('');
    grid.querySelectorAll('[data-event-id]').forEach((button) => button.addEventListener('click', () => beginRegistration(button.dataset.eventId)));
  }
  async function loadEvents() {
    try {
      const response = await fetch(`${API_BASE}/events`); if (!response.ok) throw new Error(await safeError(response)); const body = await response.json();
      events = await Promise.all((Array.isArray(body.data) ? body.data : []).map(async (event) => {
        try { const countResponse = await fetch(`${API_BASE}/events/${encodeURIComponent(event.id)}/registrations`); if (!countResponse.ok) return {...event, registered_count:null}; const countBody = await countResponse.json(); return {...event, registered_count:Array.isArray(countBody.data) ? countBody.data.length : null}; }
        catch (_) { return {...event, registered_count:null}; }
      })); clearNotice(); renderEvents();
    }
    catch (error) { $('#event-grid').innerHTML = '<div class="empty-state"><div class="empty-icon">⌁</div><h3>We can’t reach the events right now.</h3><p>Check that the Flask API is running, then try again.</p><a href="#" id="retry-events">Try again</a></div>'; $('#retry-events')?.addEventListener('click', (e) => { e.preventDefault(); loadEvents(); }); showNotice(`${error.message} API: ${API_BASE}`); }
  }
  function beginRegistration(id) {
    pendingEvent = events.find((event) => String(event.id) === String(id)); if (!pendingEvent) return;
    if (!userId()) { openIdentity(); return; }
    $('#register-title').textContent = `Join ${pendingEvent.title || 'this event'}?`;
    $('#register-copy').textContent = 'We’ll save your spot and add it to your list.';
    $('#register-error').textContent = ''; $('#register-modal').showModal();
  }
  function bindRegistration() {
    $('#confirm-register')?.addEventListener('click', async (event) => {
      event.preventDefault(); if (!pendingEvent) return;
      const button = event.currentTarget; button.disabled = true; button.innerHTML = 'Saving your spot…';
      try {
        const response = await fetch(`${API_BASE}/registrations`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:userId(), event_id:pendingEvent.id})});
        if (!response.ok) throw new Error(await safeError(response));
        $('#register-modal').close(); toast('You’re in! See you there.'); await loadEvents();
      } catch (error) { $('#register-error').textContent = error.message; }
      finally { button.disabled = false; button.innerHTML = 'Count me in <span>→</span>'; }
    });
  }
  async function loadRegistrations() {
    const list = $('#registration-list'); if (!list) return;
    if (!userId()) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">✳</div><h3>Your next good thing is waiting.</h3><p>Set your user UUID to see the events you’ve joined.</p><a href="#" id="set-id-link">Set your ID →</a></div>`; $('#set-id-link')?.addEventListener('click', (e) => { e.preventDefault(); openIdentity(); }); $('#registration-total').textContent = '00'; updateIdentity(); return; }
    list.innerHTML = '<div class="loading-card"><span class="spinner"></span> Pulling up your plans…</div>';
    try {
      const [registrationResponse, eventResponse] = await Promise.all([fetch(`${API_BASE}/me/registrations?user_id=${encodeURIComponent(userId())}`), fetch(`${API_BASE}/events`)]);
      if (!registrationResponse.ok) throw new Error(await safeError(registrationResponse));
      if (!eventResponse.ok) throw new Error(await safeError(eventResponse));
      const registrationBody = await registrationResponse.json(); const eventBody = await eventResponse.json(); const registrations = Array.isArray(registrationBody.data) ? registrationBody.data : []; const allEvents = Array.isArray(eventBody.data) ? eventBody.data : [];
      $('#registration-total').textContent = String(registrations.length).padStart(2, '0'); updateIdentity(); clearNotice();
      if (!registrations.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">✳</div><h3>No plans on the list yet.</h3><p>There’s a first time for everything. Find an event that feels like you.</p><a href="index.html#events">Explore campus events →</a></div>'; return; }
      list.innerHTML = registrations.map((registration, i) => {
        const event = allEvents.find((item) => String(item.id) === String(registration.event_id)); const title = event?.title || 'Campus event'; const index = Math.abs([...String(registration.event_id || i)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0)) % palette.length;
        return `<article class="registration-row"><div class="row-art ${palette[index]}">${['✳','↗','◒','✦','⌁','◈'][index]}</div><div class="row-copy"><div class="eyebrow muted">${escapeHtml(event?.status || 'REGISTERED')}</div><h3>${escapeHtml(title)}</h3><p>Registration confirmed · ${registration.created_at ? new Date(registration.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : 'You’re on the list'}</p></div><span class="row-status">You’re in ✓</span></article>`;
      }).join('');
    } catch (error) { list.innerHTML = '<div class="empty-state"><div class="empty-icon">⌁</div><h3>We can’t find your plans right now.</h3><p>Check that the Flask API is running, then try again.</p><a href="#" id="retry-registrations">Try again</a></div>'; $('#retry-registrations')?.addEventListener('click', (e) => { e.preventDefault(); loadRegistrations(); }); showNotice(`${error.message} API: ${API_BASE}`); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    bindIdentity(); bindRegistration(); updateIdentity();
    $('#event-search')?.addEventListener('input', renderEvents);
    document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => { activeFilter = button.dataset.filter; document.querySelectorAll('.filter-button').forEach((item) => item.classList.toggle('selected', item === button)); renderEvents(); }));
    if (document.body.dataset.page === 'events') loadEvents(); else loadRegistrations();
  });
})();

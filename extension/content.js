// Injected overlay that lets the user pick a category for the selected snippet.
// Every choice (suggested chip, close-match chip, dropdown option, or typed +
// Enter) saves immediately — there is no explicit Save button. All network calls
// are delegated to the background worker (MV3 content scripts hit page CORS).

let host = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_OVERLAY') {
    showOverlay(msg);
  } else if (msg.type === 'SHOW_ERROR') {
    showOverlay({ snippet: msg.snippet || '', error: msg.message });
  }
});

function removeOverlay() {
  if (host) {
    host.remove();
    host = null;
  }
}

function showOverlay({ snippet, suggested, matches = [], allCategories = [], error }) {
  removeOverlay();

  host = document.createElement('div');
  host.id = 'note-manager-overlay-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .nm-backdrop {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(15, 23, 42, 0.45);
        display: flex; align-items: center; justify-content: center;
      }
      .nm-card {
        width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
        background: #fbf6e7; border: 1px solid #e8dcb5; border-radius: 14px;
        box-shadow: 0 12px 40px rgba(80, 60, 10, 0.18); padding: 22px;
        color: #5c4a1f;
      }
      .nm-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #6b5618; }
      .nm-label { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #9a8442; margin: 20px 0 8px; }
      .nm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .nm-chip {
        cursor: pointer; border: 1px solid #e3d6ab; background: #fdfaf0;
        border-radius: 999px; padding: 6px 14px; font-size: 13px; color: #5c4a1f;
        white-space: nowrap; transition: all 0.12s ease;
      }
      .nm-chip:hover { border-color: #cdb877; background: #f3ead0; }
      .nm-chip-lg { font-size: 15px; font-weight: 600; padding: 9px 20px; }
      .nm-field { position: relative; }
      .nm-input {
        width: 100%; border: 1px solid #e3d6ab; border-radius: 8px;
        padding: 8px 12px; font-size: 14px; background: #fffdf8; color: #5c4a1f;
      }
      .nm-input::placeholder { color: #b9a877; }
      .nm-input:focus { outline: none; border-color: #cda94a; }
      .nm-dropdown {
        position: absolute; left: 0; right: 0; top: calc(100% + 4px);
        background: #fffdf8; border: 1px solid #e3d6ab; border-radius: 8px;
        box-shadow: 0 10px 30px rgba(80, 60, 10, 0.14);
        max-height: 200px; overflow-y: auto; z-index: 10; display: none;
      }
      .nm-dropdown.open { display: block; }
      .nm-opt {
        padding: 8px 12px; font-size: 14px; cursor: pointer; color: #5c4a1f;
      }
      .nm-opt:hover { background: #f3ead0; }
      .nm-opt-empty { padding: 8px 12px; font-size: 13px; color: #a8965f; cursor: default; }
      .nm-opt-empty b { color: #7a6320; }
      .nm-saved { font-size: 14px; color: #5c4a1f; }
      .nm-saved b { color: #7a6320; }
      .nm-error { color: #b91c1c; font-size: 14px; padding: 8px 0; }
    </style>
    <div class="nm-backdrop">
      <div class="nm-card"></div>
    </div>
  `;

  const card = shadow.querySelector('.nm-card');
  const backdrop = shadow.querySelector('.nm-backdrop');
  document.body.appendChild(host);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) removeOverlay();
  });

  if (error) {
    card.innerHTML = `<div class="nm-title">choose a category</div><div class="nm-error">${escapeHtml(error)}</div>`;
    return;
  }

  renderChooser(card, { snippet, suggested, matches, allCategories });
}

function renderChooser(card, { snippet, suggested, matches, allCategories }) {
  const allUnique = [...new Set(allCategories)];

  // Close matches exclude the suggested category; hide the section if empty.
  const otherMatches = [...new Set(matches)].filter((m) => m && m !== suggested);

  const suggestedSection = suggested
    ? `<div class="nm-label">suggested</div>
       <div class="nm-chips">${chip(suggested, true)}</div>`
    : '';

  const matchesSection = otherMatches.length
    ? `<div class="nm-label">close matches</div>
       <div class="nm-chips">${otherMatches.map((m) => chip(m)).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="nm-title">choose a category</div>
    ${suggestedSection}
    ${matchesSection}
    <div class="nm-label">or type a category</div>
    <div class="nm-field">
      <input class="nm-input" type="text" placeholder="type a category" autocomplete="off" />
      <div class="nm-dropdown"></div>
    </div>
  `;

  const input = card.querySelector('.nm-input');
  const dropdown = card.querySelector('.nm-dropdown');

  function save(category) {
    const cat = String(category).trim();
    if (!cat) return;
    chrome.runtime.sendMessage({ type: 'SAVE', snippet, category: cat }, (resp) => {
      if (resp && resp.ok) {
        card.innerHTML = `<div class="nm-title">saved \u2713</div><div class="nm-saved">saved to <b>${escapeHtml(cat)}</b>.</div>`;
        setTimeout(removeOverlay, 1100);
      } else {
        card.innerHTML = `<div class="nm-title">choose a category</div><div class="nm-error">Failed to save. Is the Note Manager server running?</div>`;
      }
    });
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    const items = allUnique.filter((c) => c.toLowerCase().includes(q));
    if (items.length) {
      dropdown.innerHTML = items
        .map((c) => `<div class="nm-opt" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</div>`)
        .join('');
    } else if (q) {
      dropdown.innerHTML = `<div class="nm-opt-empty">Press Enter to create "<b>${escapeHtml(query.trim())}</b>"</div>`;
    } else {
      dropdown.innerHTML = `<div class="nm-opt-empty">No categories yet</div>`;
    }
    // mousedown (not click) fires before input blur, so the save still runs.
    dropdown.querySelectorAll('.nm-opt').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        save(el.dataset.cat);
      });
    });
  }

  function openDropdown() {
    renderDropdown(input.value);
    dropdown.classList.add('open');
  }
  function closeDropdown() {
    dropdown.classList.remove('open');
  }

  input.addEventListener('focus', openDropdown);
  input.addEventListener('input', () => {
    renderDropdown(input.value);
    dropdown.classList.add('open');
  });
  input.addEventListener('blur', () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save(input.value);
    } else if (e.key === 'Escape') {
      removeOverlay();
    }
  });

  // Clicking a suggested / close-match chip saves immediately.
  card.querySelectorAll('.nm-chip').forEach((el) => {
    el.addEventListener('click', () => save(el.dataset.cat));
  });
}

function chip(name, large = false) {
  return `<button class="nm-chip${large ? ' nm-chip-lg' : ''}" data-cat="${escapeAttr(name)}">${escapeHtml(name)}</button>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

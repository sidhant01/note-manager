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
        background: #fff; border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.35); padding: 20px;
        color: #0f172a;
      }
      .nm-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
      .nm-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; margin: 14px 0 6px; }
      .nm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .nm-chip {
        cursor: pointer; border: 1px solid #cbd5e1; background: #fff;
        border-radius: 999px; padding: 6px 14px; font-size: 13px; color: #0f172a;
        white-space: nowrap; transition: all 0.12s ease;
      }
      .nm-chip:hover { border-color: #6366f1; background: #eef2ff; }
      .nm-field { position: relative; }
      .nm-input {
        width: 100%; border: 1px solid #cbd5e1; border-radius: 8px;
        padding: 8px 12px; font-size: 14px;
      }
      .nm-input:focus { outline: none; border-color: #6366f1; }
      .nm-dropdown {
        position: absolute; left: 0; right: 0; top: calc(100% + 4px);
        background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        max-height: 200px; overflow-y: auto; z-index: 10; display: none;
      }
      .nm-dropdown.open { display: block; }
      .nm-opt {
        padding: 8px 12px; font-size: 14px; cursor: pointer; color: #0f172a;
      }
      .nm-opt:hover { background: #eef2ff; }
      .nm-opt-empty { padding: 8px 12px; font-size: 13px; color: #94a3b8; cursor: default; }
      .nm-opt-empty b { color: #4f46e5; }
      .nm-saved { font-size: 14px; color: #475569; }
      .nm-saved b { color: #4f46e5; }
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
    card.innerHTML = `<div class="nm-title">Choose a category</div><div class="nm-error">${escapeHtml(error)}</div>`;
    return;
  }

  renderChooser(card, { snippet, suggested, matches, allCategories });
}

function renderChooser(card, { snippet, suggested, matches, allCategories }) {
  const allUnique = [...new Set(allCategories)];

  // Close matches exclude the suggested category; hide the section if empty.
  const otherMatches = [...new Set(matches)].filter((m) => m && m !== suggested);

  const suggestedSection = suggested
    ? `<div class="nm-label">Suggested</div>
       <div class="nm-chips">${chip(suggested)}</div>`
    : '';

  const matchesSection = otherMatches.length
    ? `<div class="nm-label">Close matches</div>
       <div class="nm-chips">${otherMatches.map(chip).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="nm-title">Choose a category</div>
    ${suggestedSection}
    ${matchesSection}
    <div class="nm-label">Type a category</div>
    <div class="nm-field">
      <input class="nm-input" type="text" placeholder="Type a category" autocomplete="off" />
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
        card.innerHTML = `<div class="nm-title">Saved \u2713</div><div class="nm-saved">Saved to <b>${escapeHtml(cat)}</b>.</div>`;
        setTimeout(removeOverlay, 1100);
      } else {
        card.innerHTML = `<div class="nm-title">Choose a category</div><div class="nm-error">Failed to save. Is the Note Manager server running?</div>`;
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

function chip(name) {
  return `<button class="nm-chip" data-cat="${escapeAttr(name)}">${escapeHtml(name)}</button>`;
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

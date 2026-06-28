// Background service worker: owns the context menu and all network calls to the
// Note Manager backend. The overlay UI (content.js) never talks to the server
// directly — it asks the worker, which has host_permissions and bypasses CORS.

const API_BASE = 'http://localhost:3000';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saveSnippet',
    title: 'Save to Notes',
    contexts: ['selection']
  });
});

// Step 1: when the user clicks "Save to Notes", categorize (without saving) and
// hand the result to the overlay so the user can confirm/choose a category.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'saveSnippet' || !tab?.id) return;
  const snippet = info.selectionText;
  if (!snippet) return;

  try {
    const res = await fetch(`${API_BASE}/api/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet })
    });

    if (!res.ok) throw new Error(`categorize failed: ${res.status}`);
    const data = await res.json();

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_OVERLAY',
      snippet,
      suggested: data.suggested,
      matches: data.matches || [],
      allCategories: data.allCategories || []
    });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_ERROR',
      snippet,
      message: 'Could not reach the Note Manager server. Is it running on localhost:3000?'
    });
  }
});

// Step 2: save the snippet under the category the user confirmed in the overlay.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'SAVE') return;

  fetch(`${API_BASE}/api/snippet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: msg.snippet, category: msg.category })
  })
    .then((res) => sendResponse({ ok: res.ok }))
    .catch(() => sendResponse({ ok: false }));

  return true; // keep the message channel open for the async response
});

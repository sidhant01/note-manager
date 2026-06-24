chrome.contextMenus.create({
    id: "saveSnippet",
    title: "Save to Notes",
    contexts: ["selection"]
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "saveSnippet") {
        const selectedText = info.selectionText;

        fetch('http://localhost:3000/api/snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippet: selectedText })
        });
    }
});
import Database from 'better-sqlite3';

const db = new Database('notes_manager.db');

db.exec(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, category UNIQUE)`);
db.exec(`CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, category, snippet, position)`);
db.exec(`CREATE TABLE IF NOT EXISTS summaries(id INTEGER PRIMARY KEY, category UNIQUE, summary)`);

function getSummaryFromDB(category) {
    const summary = db.prepare(`SELECT summary FROM summaries WHERE category = ?`).get(category);
    return summary?.summary;
}

function getNotesFromDB(category) {
    const snippets = db.prepare(`SELECT snippet FROM notes WHERE category = ?`).all(category);
    return snippets.map(snippet => snippet.snippet);
}

function getCategoriesFromDB() {
    const categories = db.prepare(`SELECT category FROM categories`).all();
    return categories.map(category => category.category);
}

function addCategoryToDB(category) {
    db.prepare(`INSERT INTO categories (category) VALUES (?)`).run(category);
}

function addSnippetToDB(category, snippet) {
    db.prepare(`INSERT INTO notes (category, snippet) VALUES (?, ?)`).run(category, snippet);
}

function updateSummaryInDB(category, summary) {
    console.log("required new summary in db: ", summary);
    console.log("updated summary in db: ", 
        db.prepare(
            `INSERT OR REPLACE INTO summaries (category, summary) VALUES (?, ?)`
        ).run(category, summary));
    console.log(getSummaryFromDB(category));
}

function removeNoteFromDB(category, position) {
    db.prepare(`DELETE FROM notes WHERE category = ? AND position = ?`).run(category, position);
}

function removeNotesByCategoryFromDB(category) {
    db.prepare(`DELETE FROM notes WHERE category = ?`).run(category);
}

function removeCategoryFromDB(category) {
    db.prepare(`DELETE FROM categories WHERE category = ?`).run(category);
}

function removeSummaryFromDB(category) {
    db.prepare(`DELETE FROM summaries WHERE category = ?`).run(category);
}

export {
    getSummaryFromDB,
    getNotesFromDB,
    getCategoriesFromDB,
    addCategoryToDB,
    addSnippetToDB,
    updateSummaryInDB,
    removeNoteFromDB,
    removeNotesByCategoryFromDB,
    removeCategoryFromDB,
    removeSummaryFromDB
};
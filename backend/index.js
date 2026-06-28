import 'dotenv/config';
import express from 'express';
import { AzureOpenAI } from 'openai';
import {
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
} from './db.js';
import { syncCategoryToNotion } from './notion.js';

const app = express();
const port = 3000;

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: "2024-10-21",
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT
});
const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT;

app.use(express.json());

// const snippets = [];
// const notes = {};
// const summaries = {};
// const categories = new Set();

const CATEGORIZATION_PROMPT = `You are a categorization assistant for a notes manager app.
Users save text snippets (often selections from webpages) and you help categorize them.

Given a text snippet and a list of existing categories:
1. Determine the best category for this snippet.
2. Provide a ranked list of the closest EXISTING categories (most relevant first).
3. Return a JSON response in this exact format:

{"suggested": "best_category_name", "matches": ["closest_existing", "second_closest"]}

Rules:
- "suggested" is your single best category for the snippet. It may be an existing category or a brand-new one.
- "matches" is a ranked array of up to 3 of the closest EXISTING categories. If none exist or none are relevant, use an empty array [].
- Keep category names short, lowercase, and descriptive (e.g., "programming", "recipes", "travel", "health").`

const SYNTHESIZATION_PROMPT = `You are a synthesis assistant for a notes manager app.
Users save multiple text snippets (often from webpages) and you help combine them.

Given a list of snippets in a category, produce a single, coherent piece of writing that:
- integrates the ideas across snippets,
- rewrites them in a unified voice,
- removes redundancy,
- and presents the content smoothly and logically.

Do not shorten it unnecessarily; preserve important details.
Return only the synthesized text with no additional explanations or formatting.`;

function getCleanedText(result) {
  let text = result.trim();
  if (text.startsWith('```json')) {
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (text.startsWith('```')) {
    text = text.replace(/```\n?/g, '');
  }
  return text;
}

async function categorizeSnippet(snippet) {
  const existingCategories = getCategoriesFromDB();
  const userMessage = existingCategories.length > 0
    ? `Categories: ${existingCategories.join(', ')}\nSnippet: ${snippet}`
    : `No existing categories.\nSnippet: ${snippet}`;

  const response = await client.chat.completions.create({
    model: deploymentName,
    messages: [
      { role: "system", content: CATEGORIZATION_PROMPT },
      { role: "user", content: userMessage }
    ]
  });

  const result = response.choices[0].message.content;
  return JSON.parse(getCleanedText(result));
}

async function synthesizeNote(currentSummary, newSnippet) {
  const userMessage = `Current Summary: ${currentSummary || 'N/A'}\nNew Snippet: ${newSnippet}`;

  const response = await client.chat.completions.create({
    model: deploymentName,
    messages: [
      { role: "system", content: SYNTHESIZATION_PROMPT },
      { role: "user", content: userMessage }
    ]
  });

  const result = response.choices[0].message.content;
  return getCleanedText(result);
}

async function synthesizeAndStore(category, snippet) {
  const currentSummary = getSummaryFromDB(category);
  const newSummary = await synthesizeNote(currentSummary, snippet);
  updateSummaryInDB(category, newSummary);

  // Mirror the updated summary into Notion (no-op if Notion isn't configured).
  try {
    await syncCategoryToNotion(category, newSummary);
  } catch (err) {
    console.error('Notion sync failed for category', category, err.message);
  }
}

// Step 1: categorize a snippet WITHOUT saving. Returns the AI's suggestion,
// ranked close matches, and all existing categories so the UI can let the
// user confirm, pick a different category, or type a new one.
app.post('/api/categorize', async (req, res) => {
  const { snippet } = req.body;
  if (!snippet) {
    return res.status(400).json({ error: 'snippet is required' });
  }

  try {
    const ai = await categorizeSnippet(snippet);
    res.json({
      snippet,
      suggested: ai.suggested,
      matches: ai.matches || [],
      allCategories: getCategoriesFromDB()
    });
  } catch (err) {
    console.error('Categorization failed:', err);
    res.status(500).json({ error: 'Failed to categorize snippet' });
  }
});

// Step 2: save a snippet under the category the user confirmed. Responds as
// soon as the snippet is stored; the slow summary synthesis runs afterward in
// the background so the user isn't kept waiting.
app.post('/api/snippet', (req, res) => {
  const { snippet, category } = req.body;
  if (!snippet || !category) {
    return res.status(400).json({ error: 'snippet and category are required' });
  }

  addCategoryToDB(category);
  addSnippetToDB(category, snippet);

  res.status(201).send('Snippet added to ' + category);

  synthesizeAndStore(category, snippet).catch(err =>
    console.error('Background synthesis failed for category', category, err));
});

app.get('/', (req, res) => {
  res.send('Note Manager API is running!');
});

app.get('/api/snippets/:category', (req, res) => {
  const { category } = req.params;
  res.json(getNotesFromDB(category));
})

app.get('/api/notes', (req, res) => {
  // res.json(notes);
})

app.get('/api/categories', (req, res) => {
  res.json(getCategoriesFromDB());
})

app.get('/api/categories/:category', (req, res) => {
  const { category } = req.params;
  res.json({
    category: category,
    note: getNotesFromDB(category),
    summary: getSummaryFromDB(category)
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

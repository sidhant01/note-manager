import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
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

const app = express();
const port = 3000;
const ai = new GoogleGenAI({});

app.use(express.json());

// const snippets = [];
// const notes = {};
// const summaries = {};
// const categories = new Set();

const CATEGORIZATION_PROMPT = `You are a categorization assistant for a notes manager app.
Users save text snippets (often selections from webpages) and you help categorize them.

Given a text snippet and a list of existing categories:
1. Determine the best category for this snippet
2. Check if this category (or a very similar one) exists in the current categories
3. Return a JSON response in this format:

If exact match found:
{"match": true, "category": "existing_category_name"}

If a close match or no match found:
{"match": false, "suggested": "new_category_name", "closest": "closest_existing_category_name"}

If there are no existing categories, use:
{"match": false, "suggested": "new_category_name", "closest": null}

Keep category names short, lowercase, and descriptive (e.g., "programming", "recipes", "travel", "health").`

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

async function findCategory(snippet) {
  const existingCategories = getCategoriesFromDB();
  // console.log('DB result:', db.prepare('SELECT DISTINCT category FROM notes'));
  // console.log(db.prepare('SELECT DISTINCT category FROM notes').all());
  const userMessage = existingCategories.length > 0
    ? `Categories: ${existingCategories.join(', ')}\nSnippet: ${snippet}`
    : `No existing categories.\nSnippet: ${snippet}`;

  const prompt = CATEGORIZATION_PROMPT + '\n\n' + userMessage;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const result = response.candidates[0].content.parts[0].text;
  
  console.log("Json object: ", JSON.parse(getCleanedText(result)));
  return JSON.parse(getCleanedText(result));
}

function getCategoryFromUser(suggested, closest) {
  return suggested;
}

async function synthesizeNote(currentSummary, newSnippet) {
  const userMessage = `Current Summary: ${currentSummary || 'N/A'}\nNew Snippet: ${newSnippet}`;
  console.log("Synthesis user message: ", userMessage);
  const prompt = SYNTHESIZATION_PROMPT + '\n\n' + userMessage;
  console.log("Synthesis prompt: ", prompt);
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const result = response.candidates[0].content.parts[0].text;
  console.log("Synthesized note result: ", result);
  console.log("Synthesized note cleaned: ", getCleanedText(result));
  return getCleanedText(result);
}

app.post('/api/snippet', async (req, res) => {
  const { snippet } = req.body;
  console.log('Snippet added:', snippet);

  const response = await findCategory(snippet);

  let category;
  if (response.match) {
    category = response.category;
  }
  else {
    category = getCategoryFromUser(response.suggested, response.closest);
  }

  console.log("this category: ", category);

  addCategoryToDB(category);
  addSnippetToDB(category, snippet);

  // ! slow process, can create another thread for it, explore options
  const currentSummary = getSummaryFromDB(category);
  console.log("current summary: ", currentSummary);
  console.log("this snippet:", snippet);
  const newSummary = await synthesizeNote(currentSummary, snippet);
  console.log("new summary: ", newSummary);
  updateSummaryInDB(category, newSummary);

  res.status(201).send('Snippet ' + snippet + ' added successfully');
});

app.get('/', (req, res) => {
  res.send('Note Manager API is running!');
});

app.get('/api/snippets', (req, res) => {
  // res.json(snippets);
});

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

app.get('/api/models', async (req, res) => {
  const models = await ai.listModels();
  res.json(models);
});
import { Client } from '@notionhq/client';

// Notion sync is optional: if these env vars aren't set, every export here
// becomes a no-op so the rest of the app keeps working without Notion.
const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;
const dataSourceIdEnv = process.env.NOTION_DATA_SOURCE_ID;

const notion = token ? new Client({ auth: token }) : null;

// Cached after first resolution: { dataSourceId, titleProp }.
let configPromise = null;

function isConfigured() {
  return !!notion && (!!databaseId || !!dataSourceIdEnv);
}

// Notion's 2025-09-03 API splits a database into one or more "data sources".
// Pages live in a data source, so resolve its id and the title property name.
async function getConfig() {
  if (configPromise) return configPromise;

  configPromise = (async () => {
    let dataSourceId = dataSourceIdEnv;

    if (!dataSourceId) {
      const db = await notion.databases.retrieve({ database_id: databaseId });
      const sources = db.data_sources || [];
      if (!sources.length) {
        throw new Error('Notion database has no data sources');
      }
      dataSourceId = sources[0].id;
    }

    const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const titleEntry = Object.entries(ds.properties).find(([, p]) => p.type === 'title');
    if (!titleEntry) {
      throw new Error('Notion data source has no title property');
    }

    return { dataSourceId, titleProp: titleEntry[0] };
  })();

  // Don't permanently cache a failed lookup.
  configPromise.catch(() => { configPromise = null; });
  return configPromise;
}

async function findPageId(dataSourceId, titleProp, category) {
  const res = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter: { property: titleProp, title: { equals: category } },
    page_size: 1
  });
  return res.results[0]?.id || null;
}

// Upsert one Notion page per category, with the synthesized summary as its body.
export async function syncCategoryToNotion(category, summary) {
  if (!isConfigured()) return; // Notion not set up — skip silently.

  const { dataSourceId, titleProp } = await getConfig();

  let pageId = await findPageId(dataSourceId, titleProp, category);

  if (!pageId) {
    const page = await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: {
        [titleProp]: { title: [{ type: 'text', text: { content: category } }] }
      }
    });
    pageId = page.id;
  }

  // Replace the entire page body with the latest summary (markdown).
  await notion.pages.updateMarkdown({
    page_id: pageId,
    type: 'replace_content',
    replace_content: { new_str: summary || '', allow_deleting_content: true }
  });
}

export { isConfigured as isNotionConfigured };

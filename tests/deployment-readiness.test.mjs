import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('environment template contains no OpenAI credential', async () => {
  const template = await readProjectFile('.env.example');

  assert.equal(template.trim(), 'OPENAI_API_KEY=');
  assert.doesNotMatch(template, /sk-[A-Za-z0-9_-]{8,}/i);
});

test('local secret files are ignored while the template stays tracked', async () => {
  const ignoreRules = await readProjectFile('.gitignore');

  assert.match(ignoreRules, /^\.env\.\*$/m);
  assert.match(ignoreRules, /^!\.env\.example$/m);
  assert.match(ignoreRules, /^\.secrets\/$/m);
});

test('Vercel configuration serves API routes and the single-page app', async () => {
  const vercelConfig = JSON.parse(await readProjectFile('vercel.json'));

  assert.equal(vercelConfig.version, 3);
  assert.ok(vercelConfig.routes.some((route) => route.dest === '/api/$1'));
  assert.ok(vercelConfig.routes.some((route) => route.dest === '/index.html'));
});

test('server-side OpenAI calls use the deployment environment', async () => {
  const chatFunction = await readProjectFile('supabase/functions/chat/index.ts');
  const ragFunction = await readProjectFile('supabase/functions/rag-chat/index.ts');

  assert.match(chatFunction, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(ragFunction, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(chatFunction, /apiKey\s*\|\|\s*Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(ragFunction, /apiKey\s*\|\|\s*OPENAI_API_KEY/);
});

test('Vercel data-source function requires server-side Supabase configuration', async () => {
  const apiFunction = await readProjectFile('api/data-source.ts');

  for (const variable of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.match(apiFunction, new RegExp(`process\\.env\\.${variable}`));
  }
});

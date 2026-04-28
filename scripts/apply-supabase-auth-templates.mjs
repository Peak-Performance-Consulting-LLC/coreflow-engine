import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveProjectRef() {
  const explicitRef = normalizeString(process.env.SUPABASE_PROJECT_REF);
  if (explicitRef) {
    return explicitRef;
  }

  const supabaseUrl = normalizeString(process.env.VITE_SUPABASE_URL);
  if (!supabaseUrl) {
    return '';
  }

  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.split('.')[0] || '';
  } catch {
    return '';
  }
}

async function main() {
  const accessToken = normalizeString(process.env.SUPABASE_ACCESS_TOKEN);
  const projectRef = resolveProjectRef();

  if (!accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required.');
  }

  if (!projectRef) {
    throw new Error('SUPABASE_PROJECT_REF or VITE_SUPABASE_URL is required.');
  }

  const confirmationTemplatePath = path.join(repoRoot, 'supabase', 'auth-templates', 'confirmation.html');
  const confirmationTemplate = await readFile(confirmationTemplatePath, 'utf8');

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mailer_subjects_confirmation: 'Confirm your CoreFlow account',
      mailer_templates_confirmation_content: confirmationTemplate,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase auth template update failed (${response.status}): ${body}`);
  }

  console.log(`Updated Supabase confirmation template for project ${projectRef}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

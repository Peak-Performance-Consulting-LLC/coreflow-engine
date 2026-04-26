function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export default async function handler(_request, response) {
  try {
    const supabaseUrl = normalizeString(process.env.SUPABASE_URL);
    const cronSecret = normalizeString(process.env.VOICE_JOBS_CRON_SECRET);

    if (!supabaseUrl || !cronSecret) {
      response.status(500).json({
        error: 'SUPABASE_URL and VOICE_JOBS_CRON_SECRET are required.',
      });
      return;
    }

    const dispatchResponse = await fetch(`${supabaseUrl}/functions/v1/voice-jobs-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify({ source: 'vercel-cron' }),
    });

    const result = await dispatchResponse.json().catch(() => ({}));
    response.status(dispatchResponse.status).json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected voice cron dispatch error.',
    });
  }
}

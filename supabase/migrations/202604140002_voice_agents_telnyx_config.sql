alter table public.voice_agents
  add column if not exists telnyx_model text not null default 'Qwen/Qwen3-235B-A22B',
  add column if not exists telnyx_voice text not null default 'af',
  add column if not exists telnyx_transcription_model text not null default 'deepgram/nova-3',
  add column if not exists telnyx_language text not null default 'en';

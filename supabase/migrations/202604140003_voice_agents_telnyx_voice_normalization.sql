alter table public.voice_agents
  alter column telnyx_voice set default 'af';

update public.voice_agents
set telnyx_voice = regexp_replace(telnyx_voice, '^Telnyx\\.KokoroTTS\\.', '')
where telnyx_voice like 'Telnyx.KokoroTTS.%';

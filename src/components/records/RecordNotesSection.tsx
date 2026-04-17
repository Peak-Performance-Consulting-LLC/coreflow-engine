import { useState } from 'react';
import type { RecordNote } from '../../lib/crm-types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface RecordNotesSectionProps {
  notes: RecordNote[];
  onAddNote: (body: string) => Promise<void>;
}

export function RecordNotesSection({ notes, onAddNote }: RecordNotesSectionProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!body.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      await onAddNote(body);
      setBody('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-2xl text-slate-900">Notes</h3>
          <p className="mt-1 text-sm text-slate-600">Capture context and conversation updates.</p>
        </div>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <textarea
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a new note"
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={submitting}>
            Add note
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/[0.02] p-4 text-sm text-slate-500">
            No notes yet. Add the first context note for this record.
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-2xl border border-slate-300 bg-white p-4">
              <div className="text-sm leading-7 text-slate-700">{note.body}</div>
              <div className="mt-2 text-xs text-slate-500">{new Date(note.created_at).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

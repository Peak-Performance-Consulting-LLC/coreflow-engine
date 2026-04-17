import { useState } from 'react';
import type { RecordTask, WorkspaceAssignee } from '../../lib/crm-types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

interface RecordTasksSectionProps {
  tasks: RecordTask[];
  assignees: WorkspaceAssignee[];
  onCreateTask: (payload: {
    title: string;
    description: string | null;
    priority: string;
    due_at: string | null;
    assigned_to: string | null;
  }) => Promise<void>;
}

export function RecordTasksSection({ tasks, assignees, onCreateTask }: RecordTasksSectionProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      await onCreateTask({
        title,
        description: description.trim() || null,
        priority,
        due_at: dueAt || null,
        assigned_to: assignedTo || null,
      });

      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueAt('');
      setAssignedTo('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <div>
        <h3 className="font-display text-2xl text-slate-900">Linked tasks</h3>
        <p className="mt-1 text-sm text-slate-600">Create operational follow-ups tied to this record.</p>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <Input label="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <label className="flex flex-col gap-2 text-sm text-slate-700">
          <span className="font-medium">Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
          />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span className="font-medium">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span className="font-medium">Due date</span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            <span className="font-medium">Assign to</span>
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
            >
              <option value="">Unassigned</option>
              {assignees.map((assignee) => (
                <option key={assignee.userId} value={assignee.userId}>
                  {assignee.fullName ?? assignee.userId}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={submitting}>
            Create task
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/[0.02] p-4 text-sm text-slate-500">
            No linked tasks yet. Create a follow-up to anchor the next action.
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-slate-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{task.title}</div>
                  {task.description ? <div className="mt-1 text-sm text-slate-600">{task.description}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-slate-700">{task.status}</span>
                  <span className="rounded-full border border-slate-300 px-3 py-1 text-slate-700">{task.priority}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

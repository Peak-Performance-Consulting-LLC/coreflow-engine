import { Card } from './Card';

export function SectionSkeleton({
  title = 'Loading section',
  rows = 3,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <Card className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-28 rounded-full bg-slate-100" aria-label={title} />
        <div className="h-8 w-48 rounded-xl bg-slate-100" />
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={`${title}-${index}`} className="h-12 rounded-xl bg-slate-50" />
          ))}
        </div>
      </div>
    </Card>
  );
}

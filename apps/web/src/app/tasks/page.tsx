'use client';

import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '@/components/states';
import { GroupedTaskList } from '@/components/tasks/task-list';
import { QuickAddTask } from '@/components/tasks/quick-add';
import { TaskDialog } from '@/components/tasks/task-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTasks } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';

export default function TasksPage() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounced(search.trim());
  const { data, error, isPending, refetch } = useTasks(debounced ? { search: debounced } : {});

  const open = data?.filter((t) => t.status !== 'DONE').length ?? 0;
  const dueNow = data?.filter((t) => t.bucket === 'overdue' || t.bucket === 'today').length ?? 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        description={data ? `${open} open · ${dueNow} due today or overdue` : ' '}
        actions={
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus /> New task
          </Button>
        }
      />

      <Card className="mb-6 p-4">
        <QuickAddTask />
      </Card>

      <div className="relative mb-4 sm:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="pl-9"
        />
      </div>

      <Card className="p-4 sm:p-5">
        {isPending ? (
          <LoadingRows rows={5} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            title={debounced ? 'No matching tasks' : 'No tasks yet'}
            description={
              debounced
                ? undefined
                : 'Add one above, or ask Claude: "remind me to follow up with Acme on Friday".'
            }
          />
        ) : (
          <GroupedTaskList tasks={data} />
        )}
      </Card>

      <TaskDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

'use client';

import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorState, LoadingRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTasks } from '@/lib/queries';
import { TaskDialog } from './task-dialog';
import { TaskList } from './task-list';

/** Dashboard card: tasks that are overdue or due today. */
export function TodayTasksCard({ className }: { className?: string }) {
  const { data, error, isPending, refetch } = useTasks({ bucket: ['overdue', 'today'] });
  const [creating, setCreating] = useState(false);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Today&apos;s tasks</CardTitle>
        <div className="-mt-1 -mr-2 flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreating(true)}
            aria-label="New task"
          >
            <Plus />
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/tasks">
              All <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
        ) : data.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing due today.</p>
        ) : (
          <TaskList tasks={data.slice(0, 8)} />
        )}
      </CardContent>
      <TaskDialog open={creating} onOpenChange={setCreating} />
    </Card>
  );
}

/** Application detail card: the application's open tasks, plus add. */
export function ApplicationTasksCard({ applicationId }: { applicationId: string }) {
  const { data, error, isPending, refetch } = useTasks({
    applicationId,
    status: ['TODO', 'IN_PROGRESS'],
  });
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <Button variant="ghost" size="sm" className="-mt-1 -mr-2" onClick={() => setCreating(true)}>
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <LoadingRows rows={2} />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          <TaskList tasks={data} showApplication={false} />
        )}
      </CardContent>
      <TaskDialog open={creating} onOpenChange={setCreating} defaultApplicationId={applicationId} />
    </Card>
  );
}

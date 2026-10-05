import type { ApplicationEventDto } from '@lifeos/contracts';
import type { ApplicationEvent } from '@prisma/client';
import { toIso } from '../common/dates';

export function toEventDto(event: ApplicationEvent): ApplicationEventDto {
  const metadata =
    event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
      ? (event.metadata as Record<string, unknown>)
      : null;
  return {
    id: event.id,
    applicationId: event.applicationId,
    type: event.type,
    title: event.title,
    description: event.description,
    occurredAt: event.occurredAt.toISOString(),
    scheduledFor: toIso(event.scheduledFor),
    metadata,
    voidedAt: toIso(event.voidedAt),
    voidReason: event.voidReason,
    createdAt: event.createdAt.toISOString(),
  };
}

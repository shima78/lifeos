-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'APPLICATION_SUBMITTED', 'RECRUITER_CONTACT', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'ASSIGNMENT_RECEIVED', 'FOLLOW_UP', 'REJECTION', 'OFFER', 'WITHDRAWN', 'NOTE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "website" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "description" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SAVED',
    "appliedAt" TIMESTAMPTZ(3),
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMPTZ(3),
    "recruiterName" TEXT,
    "recruiterEmail" TEXT,
    "notes" TEXT,
    "lastActivityAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_nameKey_key" ON "Company"("nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Application_url_key" ON "Application"("url");

-- CreateIndex
CREATE INDEX "Application_companyId_idx" ON "Application"("companyId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_lastActivityAt_idx" ON "Application"("lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEvent_sequence_key" ON "ApplicationEvent"("sequence");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_occurredAt_idx" ON "ApplicationEvent"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "ApplicationEvent_type_scheduledFor_idx" ON "ApplicationEvent"("type", "scheduledFor");

-- CreateIndex
CREATE INDEX "ApplicationEvent_occurredAt_idx" ON "ApplicationEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only guard for ApplicationEvent.
-- Rows may never be deleted. The only allowed update is voiding a non-voided event
-- (setting "voidedAt" and "voidReason"); every other column is immutable.
CREATE FUNCTION application_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ApplicationEvent rows are append-only and cannot be deleted';
  END IF;
  IF OLD."voidedAt" IS NOT NULL
     OR NEW."voidedAt" IS NULL
     OR NEW."voidReason" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."applicationId" IS DISTINCT FROM OLD."applicationId"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."description" IS DISTINCT FROM OLD."description"
     OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
     OR NEW."scheduledFor" IS DISTINCT FROM OLD."scheduledFor"
     OR NEW."metadata"::text IS DISTINCT FROM OLD."metadata"::text
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'ApplicationEvent rows are append-only; only voiding is allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER application_event_append_only
  BEFORE UPDATE OR DELETE ON "ApplicationEvent"
  FOR EACH ROW EXECUTE FUNCTION application_event_append_only();

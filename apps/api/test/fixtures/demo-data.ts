/**
 * Fictional demo dataset used by the dashboard tests (dates relative to "now"). It covers every
 * status and every "needs attention" case. Not used by `pnpm db:seed`, which loads the real
 * job tracker data (prisma/data/job-tracker.json).
 */
import { berlinWallTimeToUtc, toBerlinDateString } from '@lifeos/contracts';
import type { PrismaClient } from '@prisma/client';
import {
  type SeedApplication,
  type SeedCompany,
  statusChange as status,
  writeDataset,
} from '../../prisma/seed-writer';

type At = (days: number, time?: string) => Date;

/** Returns `at(days, time)`: a Berlin wall-clock time `days` from now's date (negative = past). */
function relativeTo(now: Date): At {
  const [y, m, d] = toBerlinDateString(now).split('-').map(Number);
  return (days, time = '10:00') => {
    const target = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days));
    return berlinWallTimeToUtc(target.toISOString().slice(0, 10), time);
  };
}

const companies: SeedCompany[] = [
  { name: 'Siemens', website: 'https://www.siemens.com', location: 'Munich' },
  { name: 'BMW', website: 'https://www.bmwgroup.com', location: 'Munich' },
  { name: 'SAP', website: 'https://www.sap.com', location: 'Walldorf' },
  { name: 'Infineon', website: 'https://www.infineon.com', location: 'Neubiberg' },
  { name: 'Bosch', website: 'https://www.bosch.com', location: 'Stuttgart' },
];

const buildApplications = (at: At): SeedApplication[] => [
  {
    // Upcoming interview in 3 days.
    company: 'Siemens',
    title: 'Software Engineer, Industrial IoT',
    url: 'https://jobs.siemens.com/careers/job/563156120001',
    location: 'Munich',
    employmentType: 'Full-time',
    status: 'INTERVIEW',
    appliedAt: at(-40),
    recruiterName: 'Anna Keller',
    recruiterEmail: 'anna.keller@example.com',
    nextAction: 'Prepare system design examples',
    nextActionDate: at(2),
    events: [
      { type: 'CREATED', at: at(-40, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-40) },
      status('APPLIED', 'SCREENING', at(-30)),
      {
        type: 'RECRUITER_CONTACT',
        at: at(-30),
        description: 'Intro call with Anna, 30 min. Good fit for the Xcelerator team.',
      },
      status('SCREENING', 'INTERVIEW', at(-10)),
      {
        type: 'INTERVIEW_SCHEDULED',
        at: at(-10),
        title: 'Technical interview scheduled',
        scheduledFor: at(3, '14:00'),
        description: 'Two engineers, live coding in TypeScript.',
      },
    ],
  },
  {
    // No response for 25 days.
    company: 'Siemens',
    title: 'Backend Developer (Node.js)',
    url: 'https://jobs.siemens.com/careers/job/563156120002',
    location: 'Berlin',
    employmentType: 'Full-time',
    status: 'APPLIED',
    appliedAt: at(-25),
    events: [
      { type: 'CREATED', at: at(-25, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-25) },
    ],
  },
  {
    // Full process ending in rejection.
    company: 'BMW',
    title: 'Full-Stack Engineer, Connected Car',
    url: 'https://www.bmwgroup.jobs/de/en/jobfinder/job-description-copy.150001.html',
    location: 'Munich',
    employmentType: 'Full-time',
    status: 'REJECTED',
    appliedAt: at(-55),
    recruiterName: 'Jonas Weber',
    recruiterEmail: 'jonas.weber@example.com',
    events: [
      { type: 'CREATED', at: at(-55, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-55) },
      {
        type: 'RECRUITER_CONTACT',
        at: at(-45),
        description: 'Recruiter asked for salary expectations and notice period.',
      },
      status('APPLIED', 'INTERVIEW', at(-40)),
      { type: 'INTERVIEW_SCHEDULED', at: at(-40), scheduledFor: at(-35, '11:00') },
      {
        type: 'INTERVIEW_COMPLETED',
        at: at(-35, '12:00'),
        description: 'Panel interview: architecture + behavioural.',
      },
      status('INTERVIEW', 'REJECTED', at(-28)),
      {
        type: 'REJECTION',
        at: at(-28),
        description: 'They went with a candidate with more automotive experience.',
      },
    ],
  },
  {
    // Screening, no response for 18 days and an overdue next action.
    company: 'BMW',
    title: 'Frontend Engineer (React)',
    url: 'https://www.bmwgroup.jobs/de/en/jobfinder/job-description-copy.150002.html',
    location: 'Munich',
    employmentType: 'Full-time',
    status: 'SCREENING',
    appliedAt: at(-22),
    recruiterName: 'Lea Hoffmann',
    recruiterEmail: 'lea.hoffmann@example.com',
    nextAction: 'Follow up with Lea',
    nextActionDate: at(-1),
    events: [
      { type: 'CREATED', at: at(-22, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-22) },
      status('APPLIED', 'SCREENING', at(-18)),
      {
        type: 'RECRUITER_CONTACT',
        at: at(-18),
        description:
          'Phone screen went well; she will get back after talking to the hiring manager.',
      },
    ],
  },
  {
    // Offer (terminal) with a next action: excluded from "needs attention".
    company: 'SAP',
    title: 'Developer, SAP BTP',
    url: 'https://jobs.sap.com/job/Walldorf-Developer-BTP/1100001',
    location: 'Walldorf',
    employmentType: 'Full-time',
    status: 'OFFER',
    appliedAt: at(-50),
    recruiterName: 'Markus Braun',
    recruiterEmail: 'markus.braun@example.com',
    nextAction: 'Reply to offer',
    nextActionDate: at(2),
    notes: 'Hybrid, 3 days in office. Ask about relocation support.',
    events: [
      { type: 'CREATED', at: at(-50, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-50) },
      status('APPLIED', 'SCREENING', at(-42)),
      { type: 'RECRUITER_CONTACT', at: at(-42) },
      status('SCREENING', 'INTERVIEW', at(-38)),
      { type: 'INTERVIEW_SCHEDULED', at: at(-38), scheduledFor: at(-35, '15:00') },
      { type: 'INTERVIEW_COMPLETED', at: at(-35, '16:00') },
      {
        type: 'ASSIGNMENT_RECEIVED',
        at: at(-30),
        description: 'Take-home: build a small CAP service. Due in one week.',
      },
      {
        type: 'INTERVIEW_SCHEDULED',
        at: at(-23),
        title: 'Final interview scheduled',
        scheduledFor: at(-20, '10:00'),
      },
      { type: 'INTERVIEW_COMPLETED', at: at(-20, '11:30'), title: 'Final interview completed' },
      status('INTERVIEW', 'OFFER', at(-7)),
      {
        type: 'OFFER',
        at: at(-7),
        description: 'Written offer received. Decision needed within two weeks.',
      },
    ],
  },
  {
    // Saved, next action due in 2 days.
    company: 'SAP',
    title: 'Cloud Engineer',
    url: 'https://jobs.sap.com/job/Berlin-Cloud-Engineer/1100002',
    location: 'Berlin',
    employmentType: 'Full-time',
    status: 'SAVED',
    nextAction: 'Tailor CV and apply',
    nextActionDate: at(2),
    events: [{ type: 'CREATED', at: at(-3) }],
  },
  {
    // Recently applied: no attention needed.
    company: 'Infineon',
    title: 'Embedded Software Engineer',
    url: 'https://jobs.infineon.com/careers/job/563808900001',
    location: 'Neubiberg',
    employmentType: 'Full-time',
    status: 'APPLIED',
    appliedAt: at(-6),
    events: [
      { type: 'CREATED', at: at(-6, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-6) },
    ],
  },
  {
    company: 'Infineon',
    title: 'Data Engineer',
    location: 'Dresden',
    employmentType: 'Full-time',
    status: 'WITHDRAWN',
    appliedAt: at(-45),
    events: [
      { type: 'CREATED', at: at(-45, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-45) },
      {
        type: 'RECRUITER_CONTACT',
        at: at(-38),
        description: 'Role requires relocation to Dresden.',
      },
      status('APPLIED', 'WITHDRAWN', at(-30)),
      {
        type: 'WITHDRAWN',
        at: at(-30),
        description: 'Withdrew: relocation not an option right now.',
      },
    ],
  },
  {
    // Second interview in 6 days; includes a voided event.
    company: 'Bosch',
    title: 'Software Engineer, Automated Driving',
    url: 'https://jobs.bosch.com/en/job/REF240001',
    location: 'Stuttgart',
    employmentType: 'Full-time',
    status: 'INTERVIEW',
    appliedAt: at(-30),
    recruiterName: 'Sophie Schmidt',
    recruiterEmail: 'sophie.schmidt@example.com',
    events: [
      { type: 'CREATED', at: at(-30, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-30) },
      status('APPLIED', 'SCREENING', at(-22)),
      status('SCREENING', 'INTERVIEW', at(-12)),
      { type: 'INTERVIEW_SCHEDULED', at: at(-12), scheduledFor: at(-9, '13:00') },
      {
        type: 'INTERVIEW_COMPLETED',
        at: at(-9, '14:00'),
        description: 'C++ and ROS questions, met the team lead.',
      },
      {
        type: 'FOLLOW_UP',
        at: at(-5),
        description: 'Sent thank-you note and asked about next steps.',
      },
      {
        type: 'INTERVIEW_SCHEDULED',
        at: at(-2),
        title: 'Second interview scheduled',
        scheduledFor: at(4, '10:00'),
        voided: { at: at(-2, '12:00'), reason: 'Wrong date entered; rescheduled below.' },
      },
      {
        type: 'INTERVIEW_SCHEDULED',
        at: at(-2, '12:05'),
        title: 'Second interview scheduled',
        scheduledFor: at(6, '10:00'),
      },
    ],
  },
  {
    company: 'Bosch',
    title: 'DevOps Engineer',
    url: 'https://jobs.bosch.com/en/job/REF240002',
    location: 'Renningen',
    employmentType: 'Full-time',
    status: 'REJECTED',
    appliedAt: at(-35),
    events: [
      { type: 'CREATED', at: at(-35, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-35) },
      status('APPLIED', 'REJECTED', at(-20)),
      { type: 'REJECTION', at: at(-20), description: 'Automated rejection email.' },
    ],
  },
  {
    // No response for 16 days.
    company: 'SAP',
    title: 'Senior TypeScript Developer',
    url: 'https://jobs.sap.com/job/Munich-Senior-TypeScript-Developer/1100003',
    location: 'Munich',
    employmentType: 'Full-time',
    status: 'APPLIED',
    appliedAt: at(-16),
    events: [
      { type: 'CREATED', at: at(-16, '09:00') },
      { type: 'APPLICATION_SUBMITTED', at: at(-16) },
    ],
  },
  {
    company: 'BMW',
    title: 'Site Reliability Engineer',
    location: 'Munich',
    employmentType: 'Full-time',
    status: 'SAVED',
    events: [{ type: 'CREATED', at: at(-10) }],
  },
];

/** Clears the database and inserts the demo dataset, with dates relative to `now`. */
export function seedDemoData(prisma: PrismaClient, now: Date = new Date()) {
  return writeDataset(prisma, { companies, applications: buildApplications(relativeTo(now)) });
}

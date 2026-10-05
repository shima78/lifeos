import { Injectable } from '@nestjs/common';

/** Source of "now", injectable so time-based rules can be tested deterministically. */
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

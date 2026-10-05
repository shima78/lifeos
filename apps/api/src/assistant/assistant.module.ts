import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantPaths, AssistantService } from './assistant.service';
import { ClaudeCliRunner, ClaudeRunner } from './claude-runner';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    AssistantPaths,
    { provide: ClaudeRunner, useClass: ClaudeCliRunner },
  ],
  exports: [AssistantService],
})
export class AssistantModule {}

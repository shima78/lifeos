import {
  type AssistantChatData,
  type AssistantStatusDto,
  assistantChatSchema,
} from '@lifeos/contracts';
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AssistantService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status(): Promise<AssistantStatusDto> {
    return this.assistant.status();
  }

  /** Streams AssistantEvents as Server-Sent Events. Closing the request stops Claude. */
  @Post('chat')
  async chat(
    @Body(new ZodValidationPipe(assistantChatSchema)) body: AssistantChatData,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abort = new AbortController();
    res.on('close', () => abort.abort());

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    req.socket.setTimeout(0);

    for await (const event of this.assistant.chat(body, abort.signal)) {
      if (res.writableEnded) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  }
}

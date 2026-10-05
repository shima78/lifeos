import {
  type CreateTaskData,
  type TaskDto,
  type TaskListQuery,
  type UpdateTaskData,
  createTaskSchema,
  taskListQuerySchema,
  updateTaskSchema,
} from '@lifeos/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(taskListQuerySchema)) query: TaskListQuery,
  ): Promise<TaskDto[]> {
    return this.tasks.list(query);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTaskSchema)) body: CreateTaskData): Promise<TaskDto> {
    return this.tasks.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TaskDto> {
    return this.tasks.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskData,
  ): Promise<TaskDto> {
    return this.tasks.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') id: string): Promise<void> {
    return this.tasks.delete(id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CreateJobDto } from './dto/create-job.dto';
import { parseListJobsQuery } from './dto/list-jobs-query.dto';
import { JobsEventsService } from './jobs-events.service';
import { JobsService } from './jobs.service';

@Controller('api/jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobsEvents: JobsEventsService,
  ) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.jobsService.create(dto);
  }

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const query = parseListJobsQuery(page, limit);
    return this.jobsService.findAllPaginated(query.page, query.limit);
  }

  @Sse('events')
  async streamJobsList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Observable<MessageEvent>> {
    const query = parseListJobsQuery(page, limit);
    const initial = await this.jobsService.findAllPaginated(
      query.page,
      query.limit,
    );
    return this.jobsEvents.watchList(initial);
  }

  @Sse(':id/events')
  async streamJob(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    const initial = await this.jobsService.findOne(id);
    return this.jobsEvents.watchJob(id, initial);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.jobsService.cancel(id);
  }
}

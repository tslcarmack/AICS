import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TicketService } from './ticket.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('tickets')
@UseGuards(AuthGuard('jwt'))
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('intentId') intentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ticketService.list({
      page,
      pageSize,
      status,
      source,
      assignedUserId,
      intentId,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.ticketService.getById(id);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.ticketService.assign(id, body.userId);
  }

  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @Body() body: { content: string },
    @CurrentUser() user: { userId: string },
  ) {
    return this.ticketService.reply(id, body.content, user.userId);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ticketService.resolve(id, user.userId);
  }

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ticketService.close(id, user.userId);
  }
}

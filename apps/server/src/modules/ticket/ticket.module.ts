import { Module, forwardRef } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [forwardRef(() => IntegrationModule)],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}

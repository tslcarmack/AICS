import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TagService } from './tag.service';
import { TagController } from './tag.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}

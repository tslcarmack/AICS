import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TagService } from './tag.service';

@Controller('tags')
@UseGuards(AuthGuard('jwt'))
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Get()
  list() {
    return this.tagService.findAll();
  }

  @Post()
  create(@Body() body: { name: string; color?: string }) {
    return this.tagService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; color?: string },
  ) {
    return this.tagService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.tagService.delete(id);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VariableService } from './variable.service';

@Controller('variables')
@UseGuards(AuthGuard('jwt'))
export class VariableController {
  constructor(private readonly variableService: VariableService) {}

  @Get()
  list(@Query('isSystem') isSystem?: string) {
    const filter =
      isSystem !== undefined ? { isSystem: isSystem === 'true' } : undefined;
    return this.variableService.list(filter);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      type: string;
      smartExtractionEnabled?: boolean;
      extractionInstruction?: string;
      keywords?: string[];
      listItems?: Array<{
        value: string;
        keywords?: string[];
        description?: string;
      }>;
    },
  ) {
    return this.variableService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      type?: string;
      smartExtractionEnabled?: boolean;
      extractionInstruction?: string;
      keywords?: string[];
    },
  ) {
    return this.variableService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.variableService.delete(id);
  }

  @Put(':id/smart-extraction')
  toggleSmartExtraction(@Param('id') id: string) {
    return this.variableService.toggleSmartExtraction(id);
  }
}

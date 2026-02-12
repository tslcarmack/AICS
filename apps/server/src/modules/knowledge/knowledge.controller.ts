import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge-bases')
@UseGuards(AuthGuard('jwt'))
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  create(@Body() body: { name: string; description?: string }) {
    return this.knowledgeService.createBase(body.name, body.description);
  }

  @Get()
  list() {
    return this.knowledgeService.listBases();
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.knowledgeService.updateBase(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.knowledgeService.deleteBase(id);
  }

  // ========== Categories ==========

  @Get(':id/categories')
  listCategories(@Param('id') id: string) {
    return this.knowledgeService.listCategories(id);
  }

  @Post(':id/categories')
  createCategory(
    @Param('id') id: string,
    @Body() body: { name: string; parentId?: string },
  ) {
    return this.knowledgeService.createCategory(id, body.name, body.parentId);
  }

  @Put('categories/:catId')
  updateCategory(
    @Param('catId') catId: string,
    @Body() body: { name: string },
  ) {
    return this.knowledgeService.updateCategory(catId, body.name);
  }

  @Delete('categories/:catId')
  deleteCategory(@Param('catId') catId: string) {
    return this.knowledgeService.deleteCategory(catId);
  }

  // ========== Documents ==========

  @Get(':id/documents')
  listDocuments(@Param('id') id: string) {
    return this.knowledgeService.listDocuments(id);
  }

  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: {
        _handleFile(_req: any, file: any, cb: any) {
          const fs = require('fs');
          const path = require('path');
          const dir = join(process.cwd(), 'uploads', 'knowledge');
          fs.mkdirSync(dir, { recursive: true });
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          const fullPath = path.join(dir, filename);
          const outStream = fs.createWriteStream(fullPath);
          file.stream.pipe(outStream);
          outStream.on('error', cb);
          outStream.on('finish', () => {
            cb(null, {
              destination: dir,
              filename,
              path: fullPath,
              size: outStream.bytesWritten,
            });
          });
        },
        _removeFile(_req: any, file: any, cb: any) {
          const fs = require('fs');
          fs.unlink(file.path, cb);
        },
      },
    }),
  )
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() body: { categoryId?: string },
  ) {
    // Fix Chinese filename encoding: multer uses latin1 by default
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch {
      // Fallback to original name if decoding fails
    }
    const type = extname(originalName).slice(1).toLowerCase();
    return this.knowledgeService.uploadDocument(
      id,
      originalName,
      type,
      file.path,
      body.categoryId,
    );
  }

  @Get(':baseId/documents/:docId')
  getDocument(@Param('docId') docId: string) {
    return this.knowledgeService.getDocument(docId);
  }

  @Put(':baseId/documents/:docId')
  updateDocument(
    @Param('docId') docId: string,
    @Body() body: { name?: string; content?: string },
  ) {
    return this.knowledgeService.updateDocument(docId, body);
  }

  @Delete(':baseId/documents/:docId')
  deleteDocument(@Param('docId') docId: string) {
    return this.knowledgeService.deleteDocument(docId);
  }

  @Post(':id/entries')
  createEntry(
    @Param('id') id: string,
    @Body() body: { name: string; content: string; categoryId?: string },
  ) {
    return this.knowledgeService.createRichTextEntry(
      id,
      body.name,
      body.content,
      body.categoryId,
    );
  }
}

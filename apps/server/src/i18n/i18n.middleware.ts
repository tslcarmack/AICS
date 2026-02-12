import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { resolveLocale } from '@aics/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale?: string;
    }
  }
}

@Injectable()
export class I18nMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const acceptLanguage = req.headers['accept-language'];
    // Parse simple Accept-Language (take first locale before comma/semicolon)
    const rawLocale = acceptLanguage?.split(/[,;]/)[0]?.trim();
    req.locale = resolveLocale(rawLocale);
    next();
  }
}

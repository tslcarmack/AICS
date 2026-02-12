import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { I18nService } from '../../i18n/i18n.service';
import {
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from './dto/integration.dto';

// Provider presets
const PROVIDER_PRESETS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465 },
  '163': { imapHost: 'imap.163.com', imapPort: 993, smtpHost: 'smtp.163.com', smtpPort: 465 },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  qq: { imapHost: 'imap.qq.com', imapPort: 993, smtpHost: 'smtp.qq.com', smtpPort: 465 },
};

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async createEmailAccount(dto: CreateEmailAccountDto) {
    const preset = PROVIDER_PRESETS[dto.provider];
    return this.prisma.emailAccount.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        provider: dto.provider,
        imapHost: dto.imapHost || preset?.imapHost || '',
        imapPort: dto.imapPort || preset?.imapPort || 993,
        smtpHost: dto.smtpHost || preset?.smtpHost || '',
        smtpPort: dto.smtpPort || preset?.smtpPort || 465,
        credentials: dto.credentials as any,
      },
    });
  }

  async listEmailAccounts() {
    return this.prisma.emailAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        provider: true,
        imapHost: true,
        imapPort: true,
        smtpHost: true,
        smtpPort: true,
        enabled: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  }

  async updateEmailAccount(id: string, dto: UpdateEmailAccountDto) {
    await this.findOrThrow(id);
    return this.prisma.emailAccount.update({
      where: { id },
      data: {
        ...dto,
        credentials: dto.credentials as any,
      },
    });
  }

  async deleteEmailAccount(id: string) {
    await this.findOrThrow(id);
    return this.prisma.emailAccount.delete({ where: { id } });
  }

  async toggleEmailAccount(id: string) {
    const account = await this.findOrThrow(id);
    return this.prisma.emailAccount.update({
      where: { id },
      data: { enabled: !account.enabled },
    });
  }

  /**
   * Detect if a provider requires IMAP ID command (163, QQ, 126, yeah.net, etc.)
   */
  private needsImapId(host: string): boolean {
    const hosts = ['163.com', 'qq.com', '126.com', 'yeah.net', 'sina.com'];
    return hosts.some((h) => host.includes(h));
  }

  /**
   * Send IMAP ID command for providers that require it (RFC 2971)
   */
  private async sendImapId(connection: any): Promise<void> {
    return new Promise<void>((resolve) => {
      const imap = connection.imap || connection;
      if (typeof imap._enqueue === 'function') {
        imap._enqueue(
          'ID ("name" "AICS" "version" "1.0.0" "vendor" "aics-client" "support-email" "support@aics.local")',
          () => resolve(),
        );
      } else {
        resolve();
      }
    });
  }

  async testEmailAccount(id: string) {
    const account = await this.prisma.emailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(this.i18n.t('integration.accountNotFound'));

    const credentials = account.credentials as any;
    const password = credentials?.password || credentials;
    const errors: string[] = [];

    // Test IMAP connection
    try {
      this.logger.log(`Testing IMAP for ${account.email} -> ${account.imapHost}:${account.imapPort}`);
      const imapSimple = require('imap-simple');
      const imapConfig = {
        imap: {
          user: account.email,
          password: password,
          host: account.imapHost,
          port: account.imapPort,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          authTimeout: 10000,
          connTimeout: 10000,
        },
      };
      const connection = await imapSimple.connect(imapConfig);

      // Send IMAP ID for providers that require it (163, QQ, etc.)
      if (this.needsImapId(account.imapHost)) {
        await this.sendImapId(connection);
        // Verify by opening INBOX
        await connection.openBox('INBOX');
      }

      await connection.end();
      this.logger.log(`IMAP test passed for ${account.email}`);
    } catch (error) {
      const msg = this.i18n.t('integration.imapFailed', undefined, {
        error: (error as Error).message,
      });
      this.logger.error(msg);
      errors.push(msg);
    }

    // Test SMTP connection
    try {
      this.logger.log(`Testing SMTP for ${account.email} -> ${account.smtpHost}:${account.smtpPort}`);
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465,
        auth: {
          user: account.email,
          pass: password,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });
      await transporter.verify();
      transporter.close();
      this.logger.log(`SMTP test passed for ${account.email}`);
    } catch (error) {
      const msg = this.i18n.t('integration.smtpFailed', undefined, {
        error: (error as Error).message,
      });
      this.logger.error(msg);
      errors.push(msg);
    }

    if (errors.length > 0) {
      return { success: false, message: errors.join('; ') };
    }
    return {
      success: true,
      message: this.i18n.t('integration.connectionTestPassed'),
    };
  }

  async getEnabledAccounts() {
    return this.prisma.emailAccount.findMany({
      where: { enabled: true },
    });
  }

  private async findOrThrow(id: string) {
    const account = await this.prisma.emailAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(this.i18n.t('integration.accountNotFound'));
    return account;
  }
}

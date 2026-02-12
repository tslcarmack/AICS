import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendReply(
    emailAccountId: string,
    to: string,
    subject: string,
    htmlBody: string,
    inReplyTo?: string,
    references?: string,
  ): Promise<{ messageId: string }> {
    const account = await this.prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      throw new Error(`Email account ${emailAccountId} not found`);
    }

    const credentials = account.credentials as Record<string, string>;
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: {
        user: account.email,
        pass: credentials.password,
      },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${account.displayName}" <${account.email}>`,
      to,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      html: htmlBody,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
    }
    if (references) {
      mailOptions.references = references;
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      return { messageId: info.messageId };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${(error as Error).message}`);
      throw error;
    }
  }
}

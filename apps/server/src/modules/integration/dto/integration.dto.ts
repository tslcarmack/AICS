import {
  IsString,
  IsEmail,
  IsInt,
  IsOptional,
  IsBoolean,
  IsObject,
  Min,
  Max,
} from 'class-validator';

export class CreateEmailAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  displayName: string;

  @IsString()
  provider: string; // gmail, 163, outlook, custom

  @IsString()
  imapHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort: number;

  @IsString()
  smtpHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort: number;

  @IsObject()
  credentials: Record<string, string>; // { password } or { accessToken, refreshToken }
}

export class UpdateEmailAccountDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsInt()
  imapPort?: number;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  smtpPort?: number;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;
}

export class IngestMessageDto {
  @IsString()
  sender: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ManualMessageDto {
  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;
}

export class SimulateEmailDto {
  @IsEmail()
  senderEmail: string;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body: string;
}

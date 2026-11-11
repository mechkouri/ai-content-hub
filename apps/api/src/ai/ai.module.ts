import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AiController } from './ai.controller';
import { AiLimitsService } from './ai-limits.service';
import { AiService } from './ai.service';
import { IMAGE_PROVIDERS, TEXT_PROVIDERS } from './ai.types';
import { CloudflareImageProvider } from './cloudflare-image.provider';
import { OpenRouterProvider } from './openrouter.provider';

@Module({
  imports: [OrganizationsModule],
  controllers: [AiController],
  providers: [
    OpenRouterProvider,
    CloudflareImageProvider,
    {
      provide: TEXT_PROVIDERS,
      useFactory: (p: OpenRouterProvider) => [p],
      inject: [OpenRouterProvider],
    },
    {
      provide: IMAGE_PROVIDERS,
      useFactory: (p: CloudflareImageProvider) => [p],
      inject: [CloudflareImageProvider],
    },
    AiLimitsService,
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}

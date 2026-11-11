import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BrandController } from './brand.controller';
import { BrandKitService } from './brand-kit.service';
import { MediaService } from './media.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [BrandController],
  providers: [BrandKitService, MediaService],
})
export class BrandModule {}

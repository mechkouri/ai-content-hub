import { Module } from '@nestjs/common';
import { BrandModule } from '../brand/brand.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StockImagesController } from './stock-images.controller';
import { StockImagesService } from './stock-images.service';

@Module({
  imports: [OrganizationsModule, BrandModule],
  controllers: [StockImagesController],
  providers: [StockImagesService],
})
export class StockModule {}

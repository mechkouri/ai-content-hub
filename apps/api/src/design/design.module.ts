import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { DesignController } from './design.controller';
import { DesignService } from './design.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [DesignController],
  providers: [DesignService],
})
export class DesignModule {}

import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';
import { OrgAccessGuard } from './org-access.guard';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, MembersService, InvitationsService, OrgAccessGuard],
  exports: [OrgAccessGuard],
})
export class OrganizationsModule {}

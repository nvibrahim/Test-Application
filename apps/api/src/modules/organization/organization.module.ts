import { Global, Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';

@Global()
@Module({ providers: [OrganizationService], exports: [OrganizationService] })
export class OrganizationModule {}

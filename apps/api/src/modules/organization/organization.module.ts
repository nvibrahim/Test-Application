import { Global, Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { OrganizationService } from './organization.service';

@Global()
@Module({
  controllers: [LocationsController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}

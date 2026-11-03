import { Global, Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { LocationsController } from './locations.controller';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Global()
@Module({
  imports: [TwoFactorModule],
  controllers: [LocationsController, OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { InvitationsController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, TwoFactorModule],
  controllers: [UsersController, InvitationsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

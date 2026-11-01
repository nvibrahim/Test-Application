import { Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { UsersController } from './users.controller';

@Module({ imports: [TwoFactorModule], controllers: [UsersController] })
export class UsersModule {}

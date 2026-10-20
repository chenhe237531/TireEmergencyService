import { Module } from '@nestjs/common'
import { PrismaModule } from './common/prisma.service'
import { AppAuthController, AppController } from './controllers/app.controller'
import { AdminAuthController, AdminController } from './controllers/admin.controller'

@Module({
  imports: [PrismaModule],
  controllers: [AppAuthController, AppController, AdminAuthController, AdminController],
})
export class AppModule {}

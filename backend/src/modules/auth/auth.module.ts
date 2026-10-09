import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { UsersModule } from "../users/users.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [
    UsersModule,
    SettingsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "change_this_secret",
      signOptions: { expiresIn: "8h" },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

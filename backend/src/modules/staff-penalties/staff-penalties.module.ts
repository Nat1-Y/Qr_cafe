import { Module } from "@nestjs/common";
import { StaffPenaltiesController } from "./staff-penalties.controller";
import { StaffPenaltiesService } from "./staff-penalties.service";

@Module({
  controllers: [StaffPenaltiesController],
  providers: [StaffPenaltiesService],
  exports: [StaffPenaltiesService],
})
export class StaffPenaltiesModule {}

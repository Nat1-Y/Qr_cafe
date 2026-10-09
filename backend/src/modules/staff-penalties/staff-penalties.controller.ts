import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffPenaltiesService } from "./staff-penalties.service";
import { RequirePermission } from "../../common/permissions/require-permission.decorator";

@ApiTags("staff-penalties")
@RequirePermission("staff_penalty")
@Controller("staff-penalties")
export class StaffPenaltiesController {
  constructor(private readonly staffPenaltiesService: StaffPenaltiesService) {}

  @Get()
  async getAll(
    @Query("employee_id") employee_id?: string,
    @Query("severity") severity?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const penalties = await this.staffPenaltiesService.findAll({
      employee_id,
      severity,
      from,
      to,
    });
    return { status: "success", data: { penalties, count: penalties.length } };
  }

  @Get("summary")
  async getSummary(@Query("from") from?: string, @Query("to") to?: string) {
    const summary = await this.staffPenaltiesService.summary({ from, to });
    return { status: "success", data: summary };
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const penalty = await this.staffPenaltiesService.findById(id);
    return { status: "success", data: { penalty } };
  }

  @Post()
  async create(@Body() body: any) {
    const penalty = await this.staffPenaltiesService.create(body);
    return { status: "success", message: "Penalty recorded", data: { penalty } };
  }

  @Put(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const penalty = await this.staffPenaltiesService.update(id, body);
    return { status: "success", message: "Penalty updated", data: { penalty } };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const penalty = await this.staffPenaltiesService.remove(id);
    return { status: "success", message: "Penalty deleted", data: { penalty } };
  }
}

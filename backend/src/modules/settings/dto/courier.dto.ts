/**
 * Courier profile settings DTOs — preconfigured couriers an owner sets up so
 * a cashier can pick one from a dropdown instead of typing courier details
 * by hand on every delivery order.
 */
export class CourierRequestDto {
  name!: string;
  phone?: string;
  notes?: string;
  is_active?: boolean;
}

export class CourierResponseDto {
  id!: string;
  name!: string;
  phone?: string;
  notes?: string;
  is_active!: boolean;
  created_at!: string;
  updated_at!: string;
}

export class CouriersResponseDto {
  status!: string;
  data!: { couriers: CourierResponseDto[]; count: number };
}

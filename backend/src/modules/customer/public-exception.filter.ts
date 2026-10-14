import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/**
 * Guest-facing errors for /api/public/*: HttpExceptions pass through with their
 * (already plain-language) body plus a Retry-After header for 429s; anything
 * else becomes a generic message so SQL/stack details never reach a phone.
 */
@Catch()
export class PublicExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("PublicApi");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === "string" ? { statusCode: status, message: body } : body;
      const retry = (payload as { retry_after?: number }).retry_after;
      if (status === HttpStatus.TOO_MANY_REQUESTS && retry) {
        res.setHeader("Retry-After", String(retry));
      }
      res.status(status).json(payload);
      return;
    }
    this.logger.error("Unhandled public API error", exception as Error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: "Something went wrong on our side. Please try again.",
    });
  }
}

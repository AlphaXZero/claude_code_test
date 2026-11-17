import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Every error leaves the API as { code, message } with a message in French.
 * Known database errors get their real status instead of a bare 500.
 */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorsFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, code: string, message: string) => res.status(status).json({ statusCode: status, code, message });

    if (error instanceof HttpException) {
      const body = error.getResponse();
      const status = error.getStatus();
      if (typeof body === 'object' && body && 'code' in body) return res.status(status).json({ statusCode: status, ...body });
      const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      return send(status, defaultCode(status), frenchMessage(status, message));
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return send(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Élément introuvable.');
      if (error.code === 'P2002') return send(HttpStatus.CONFLICT, 'CONFLICT', 'Cet élément existe déjà.');
    }
    this.logger.error(error instanceof Error ? error.stack : String(error));
    return send(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', 'Erreur interne du serveur. Réessaie dans un instant.');
  }
}

function defaultCode(status: number): string {
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'TOO_MANY_REQUESTS';
  if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
  return 'ERROR';
}

/** Messages from Nest itself (route not found, malformed JSON, invalid uuid) are in English. */
function frenchMessage(status: number, message: unknown): string {
  if (status === HttpStatus.NOT_FOUND) return 'Page introuvable.';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'Trop de tentatives. Attends une minute avant de réessayer.';
  if (status === HttpStatus.BAD_REQUEST) return 'Requête invalide.';
  return typeof message === 'string' ? message : 'Une erreur est survenue.';
}

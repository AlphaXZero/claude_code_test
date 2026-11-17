import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request body with a zod schema; answers 400 with the first problem in French. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new BadRequestException({ code: 'BAD_REQUEST', message: `${issue.path.join('.')} : ${issue.message}` });
  }
  return r.data;
}

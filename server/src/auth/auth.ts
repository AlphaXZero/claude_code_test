import {
  CanActivate, ConflictException, createParamDecorator, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('adresse e-mail invalide').max(200),
  password: z.string().min(8, '8 caractères minimum').max(200),
});

export const PUBLIC = 'isPublic';
export const ROLES = 'roles';
/** Route open without login. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route reserved to the administrator. */
export const AdminOnly = () => SetMetadata(ROLES, [Role.ADMINISTRATOR]);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(email: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Un compte existe déjà avec cette adresse.' });
    const user = await this.prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 10) } });
    return this.session(user);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'BAD_CREDENTIALS', message: 'E-mail ou mot de passe incorrect.' });
    }
    return this.session(user);
  }

  async checkPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'BAD_CREDENTIALS', message: 'Mot de passe incorrect.' });
    }
  }

  /** Creates the administrator from ADMIN_EMAIL / ADMIN_PASSWORD if it does not exist. */
  async ensureAdmin(email?: string, password?: string) {
    if (!email || !password) return;
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      await this.prisma.user.create({
        data: { email: normalized, passwordHash: await bcrypt.hash(password, 10), role: Role.ADMINISTRATOR, plan: 'PREMIUM' },
      });
    } else if (user.role !== Role.ADMINISTRATOR) {
      await this.prisma.user.update({ where: { id: user.id }, data: { role: Role.ADMINISTRATOR } });
    }
  }

  private session(user: { id: string; email: string; role: Role }) {
    const payload: AuthUser = { id: user.id, email: user.email, role: user.role };
    return { token: this.jwt.sign(payload), user: payload };
  }
}

/** Global guard: every route needs a valid token, unless marked @Public(); @AdminOnly() adds the role check. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const unauthorized = new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Connecte-toi pour continuer.' });
    if (!token) throw unauthorized;
    let payload: AuthUser;
    try {
      payload = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw unauthorized;
    }
    // The account may have been deleted or its role changed since the token was issued.
    const user = await this.prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true, role: true } });
    if (!user) throw unauthorized;
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Réservé à l’administrateur.' });
    }
    return true;
  }
}

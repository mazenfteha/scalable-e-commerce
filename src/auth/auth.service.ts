/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from 'src/common/enums/user-role.enum';
import { User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prismaService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prismaService.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
        },
      });

      // Branch based on role
      if (dto.role === UserRole.CUSTOMER) {
        await tx.customer.create({ data: { userId: user.id } });
      } else if (dto.role === UserRole.SUPPLIER) {
        await tx.supplier.create({
          data: { userId: user.id, isApproved: false },
        });
      } else if (dto.role === UserRole.ADMIN) {
        await tx.admin.create({ data: { userId: user.id } });
      }

      return user;
    });

    return { message: 'Registration successful' };
  }

  async login(user: User) {
    const accessToken = this.generateAccessToken(user);
    const { refreshToken, tokenHash, family } = this.generateRefreshToken();

    await this.storeRefreshToken(user.id, tokenHash, family);

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prismaService.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!stored) throw new UnauthorizedException();

    if (stored.isRevoked) {
      // Reuse detected — kill entire family
      await this.revokeFamily(stored.family);
      throw new UnauthorizedException('Token reuse detected');
    }

    if (stored.expiresAt < new Date())
      throw new UnauthorizedException('Token expired');

    // Rotate: revoke old, issue new
    await this.prismaService.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const user = await this.usersService.findById(stored.userId);
    const accessToken = this.generateAccessToken(user);
    const { refreshToken, tokenHash: newHash } = this.generateRefreshToken();

    await this.storeRefreshToken(user.id, newHash, stored.family); // same family

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);

    const stored = await this.prismaService.refreshToken.findFirst({
      where: { tokenHash },
    });

    // Even if token not found — return 200
    // Never tell the client whether the token existed or not
    if (!stored) return { message: 'Logged out successfully' };

    await this.prismaService.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    return { message: 'Logged out successfully' };
  }

  private generateAccessToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken() {
    const raw = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(raw);
    const family = crypto.randomUUID();
    return { refreshToken: raw, tokenHash, family };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async storeRefreshToken(
    userId: string,
    tokenHash: string,
    family: string,
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prismaService.refreshToken.create({
      data: { userId, tokenHash, family, expiresAt },
    });
  }

  private async revokeFamily(family: string) {
    await this.prismaService.refreshToken.updateMany({
      where: { family },
      data: { isRevoked: true },
    });
  }
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return null;
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

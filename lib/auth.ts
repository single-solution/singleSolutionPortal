import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";
import type { UserRole } from "@/lib/models/User";
import { authConfig } from "@/lib/auth.config";
import { isLoginBlocked, recordLoginAttempt, clearLoginAttempts } from "@/lib/rateLimit";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    username: string;
    profileImage?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      role: UserRole;
      firstName: string;
      lastName: string;
      username: string;
      profileImage?: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const ip =
          (request as Request | undefined)?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ||
          (request as Request | undefined)?.headers?.get?.("x-real-ip") ||
          "unknown";

        if (isLoginBlocked(ip)) return null;

        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();

        const user = await User.findOne({
          email: (credentials.email as string).toLowerCase().trim(),
          isActive: true,
        }).select("+password");

        if (!user) {
          recordLoginAttempt(ip);
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password,
        );
        if (!isValid) {
          recordLoginAttempt(ip);
          return null;
        }

        clearLoginAttempts(ip);

        return {
          id: user._id.toString(),
          email: user.email,
          role: user.userRole,
          firstName: user.about.firstName,
          lastName: user.about.lastName ?? "",
          username: user.username,
          profileImage: user.about.profileImage || undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.username = user.username;
        token.profileImage = user.profileImage;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.firstName = token.firstName as string;
      session.user.lastName = token.lastName as string;
      session.user.username = token.username as string;
      session.user.profileImage = token.profileImage as string | undefined;
      return session;
    },
  },
});

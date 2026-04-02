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
    showCoordinates?: boolean;
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
      showCoordinates?: boolean;
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

        if (!user.isVerified) {
          user.isVerified = true;
          await user.save();
        }

        return {
          id: user._id.toString(),
          email: user.email,
          role: user.userRole,
          firstName: user.about.firstName,
          lastName: user.about.lastName ?? "",
          username: user.username,
          profileImage: user.about.profileImage || undefined,
          showCoordinates: user.preferences?.showCoordinates ?? false,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.username = user.username;
        token.profileImage = user.profileImage;
        token.showCoordinates = user.showCoordinates ?? false;
      }
      if (trigger === "update") {
        const { connectDB: cdb } = await import("@/lib/db");
        const UserModel = (await import("@/lib/models/User")).default;
        await cdb();
        const fresh = await UserModel.findById(token.id).select("preferences").lean();
        if (fresh) token.showCoordinates = fresh.preferences?.showCoordinates ?? false;
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
      session.user.showCoordinates = token.showCoordinates as boolean | undefined;
      return session;
    },
  },
});

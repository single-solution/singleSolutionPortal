import nodemailer from "nodemailer";

export function getBaseUrl(): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function wrap(headerBg: string, emoji: string, title: string, subtitle: string, body: string, footer: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 0;">
      <div style="background: ${headerBg}; padding: 32px 24px; border-radius: 20px 20px 0 0; text-align: center;">
        <p style="font-size: 48px; margin: 0; line-height: 1;">${emoji}</p>
        <h1 style="color: white; font-size: 24px; font-weight: 900; margin: 12px 0 4px; letter-spacing: -0.02em;">${title}</h1>
        <p style="color: rgba(255,255,255,0.85); font-size: 14px; margin: 0;">${subtitle}</p>
      </div>
      <div style="background: #f8fafc; padding: 28px 24px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
        ${body}
      </div>
      <div style="background: #f1f5f9; padding: 20px 24px; border-radius: 0 0 20px 20px; text-align: center; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">${footer}</p>
      </div>
    </div>
  `;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: linear-gradient(135deg, #0071e3, #0055cc); color: white; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px;">${label}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<p style="color: #475569; font-size: 14px; margin: 4px 0;"><strong style="color: #1e293b;">${label}:</strong> ${value}</p>`;
}

export async function sendMail(to: string | string[], subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV === "development") console.log(`[MAIL SKIPPED] No SMTP config. Subject: ${subject}, To: ${to}`);
    return false;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await transporter.sendMail({
      from: `"Single Solution Sync" <${from}>`,
      to: Array.isArray(to) ? to.join(",") : to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}

export async function sendResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const html = wrap(
    "linear-gradient(135deg, #ef4444, #dc2626)",
    "🔑",
    "Reset Your Password",
    "Single Solution Sync",
    `<p style="color: #475569; font-size: 15px; margin: 0 0 16px; font-weight: 500; text-align: center;">
        Click below to create a new password. This link expires in 1 hour.
      </p>
      <div style="text-align: center;">${ctaButton(resetUrl, "Reset Password →")}</div>`,
    "If you didn't request this, you can safely ignore this email.",
  );
  return sendMail(to, "Reset Your Password — Single Solution Sync", html);
}

export async function sendWelcomeEmail(to: string, name: string, role: string, tempPassword: string): Promise<boolean> {
  const loginUrl = `${getBaseUrl()}/login`;
  const html = wrap(
    "linear-gradient(135deg, #0071e3, #0055cc)",
    "🎉",
    "Welcome to the Team!",
    "Single Solution Sync",
    `<p style="color: #475569; font-size: 15px; margin: 0 0 12px; font-weight: 500; text-align: center;">
        Hi <strong style="color: #1e293b;">${name}</strong>, your account has been created.
      </p>
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 0 0 16px;">
        ${infoRow("Role", role)}
        ${infoRow("Temporary Password", `<code style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:14px;">${tempPassword}</code>`)}
      </div>
      <p style="color: #475569; font-size: 13px; margin: 0 0 16px; text-align: center;">
        Please change your password after first login.
      </p>
      <div style="text-align: center;">${ctaButton(loginUrl, "Sign In →")}</div>`,
    "This is an automated message from your team's presence system.",
  );
  return sendMail(to, "Welcome to Single Solution Sync", html);
}

export async function sendAttendanceAlert(to: string | string[], subject: string, body: string): Promise<boolean> {
  const html = wrap(
    "linear-gradient(135deg, #f59e0b, #d97706)",
    "⚠️",
    "Attendance Alert",
    "Single Solution Sync",
    `<div style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center;">${body}</div>`,
    "This is an automated notification from your presence system.",
  );
  return sendMail(to, subject, html);
}

export function buildInviteHtml(invitedBy: string, testMode = false): string {
  const baseUrl = getBaseUrl();
  return wrap(
    "linear-gradient(135deg, #0071e3, #0055cc)",
    "📋",
    `${testMode ? "🧪 TEST — " : ""}You're Invited!`,
    "Single Solution Sync",
    `<p style="color: #475569; font-size: 15px; margin: 0 0 4px; font-weight: 500; text-align: center;">
        <strong style="color: #1e293b;">${invitedBy}</strong> has invited you to join the team.
      </p>
      <p style="color: #475569; font-size: 15px; margin: 0 0 16px; font-weight: 500; text-align: center;">
        Sign in to start tracking your presence.
      </p>
      <div style="text-align: center;">${ctaButton(`${baseUrl}/login`, "Get Started →")}</div>`,
    "This invite was sent from Single Solution Sync.",
  );
}

export function buildResetHtml(testMode = false): string {
  const baseUrl = getBaseUrl();
  return wrap(
    "linear-gradient(135deg, #ef4444, #dc2626)",
    "🔑",
    `${testMode ? "🧪 TEST — " : ""}Reset Your Password`,
    "Single Solution Sync",
    `<p style="color: #475569; font-size: 15px; margin: 0 0 16px; font-weight: 500; text-align: center;">
        Click below to create a new password. This link expires in 1 hour.
      </p>
      <div style="text-align: center;">${ctaButton(`${baseUrl}/reset-password?token=test-preview`, "Reset Password →")}</div>`,
    "If you didn't request this, you can safely ignore this email.",
  );
}

export function buildAlertHtml(bodyText: string, testMode = false): string {
  return wrap(
    "linear-gradient(135deg, #f59e0b, #d97706)",
    "⚠️",
    `${testMode ? "🧪 TEST — " : ""}Attendance Alert`,
    "Single Solution Sync",
    `<div style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center;">${bodyText}</div>`,
    "This is an automated notification from your presence system.",
  );
}

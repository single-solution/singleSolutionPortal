"use client";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary, #007AFF)" />
          <stop offset="100%" stopColor="#30D158" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill="url(#logo-bg)" />
      <path
        d="M20.5 10.5a6.5 6.5 0 0 0-9 0"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M21 10.5l-0.5-3 3 0.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11.5 21.5a6.5 6.5 0 0 0 9 0"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11 21.5l0.5 3-3-0.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="16" r="2" fill="white" opacity="0.9" />
    </svg>
  );
}

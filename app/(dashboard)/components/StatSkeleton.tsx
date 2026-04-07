interface StatSkeletonProps {
  className?: string;
}

export function StatSkeleton({ className = "" }: StatSkeletonProps) {
  return (
    <div
      className={`shimmer h-20 w-full animate-pulse rounded-xl ${className}`}
      aria-hidden
    />
  );
}

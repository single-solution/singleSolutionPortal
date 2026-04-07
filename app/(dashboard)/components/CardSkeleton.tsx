interface CardSkeletonProps {
  className?: string;
}

export function CardSkeleton({ className = "" }: CardSkeletonProps) {
  return (
    <div
      className={`shimmer h-[280px] w-full animate-pulse rounded-2xl ${className}`}
      aria-hidden
    />
  );
}

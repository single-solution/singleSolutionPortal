export function emitSocket(
  event: string,
  data?: unknown,
  target?: { room?: string; userId?: string },
) {
  const io = (global as Record<string, unknown>).__io as
    | { to: (r: string) => { emit: (e: string, d?: unknown) => void }; emit: (e: string, d?: unknown) => void }
    | undefined;
  if (!io) return;
  if (target?.userId) io.to(`user:${target.userId}`).emit(event, data);
  else if (target?.room) io.to(target.room).emit(event, data);
  else io.emit(event, data);
}

import { prisma } from '@/lib/prisma';

export interface RecordAuditLogParams {
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: string | null;
  request?: Request | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Extracts client IP address and User-Agent from a standard Request object.
 */
export function extractClientMeta(request?: Request | null): { ipAddress: string | null; userAgent: string | null } {
  if (!request) return { ipAddress: null, userAgent: null };

  const forwardedFor = request.headers.get('x-forwarded-for');
  let ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : null;
  if (!ipAddress) {
    ipAddress = request.headers.get('x-real-ip');
  }

  const userAgent = request.headers.get('user-agent');

  return { ipAddress: ipAddress || null, userAgent: userAgent || null };
}

/**
 * Records an audit log entry in the database and broadcasts it via Socket.IO.
 * Never throws an exception to ensure business logic operations are never interrupted.
 */
export async function recordAuditLog(params: RecordAuditLogParams) {
  try {
    const meta = extractClientMeta(params.request);
    const ipAddress = params.ipAddress || meta.ipAddress;
    const userAgent = params.userAgent || meta.userAgent;

    const log = await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entity: params.entity || null,
        entityId: params.entityId || null,
        details: params.details || null,
        ipAddress,
        userAgent,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    // Real-time broadcast if socket.io is initialized on the server
    const io = (global as any).io;
    if (io) {
      io.emit('auditLog:created', log);
    }

    return log;
  } catch (err) {
    console.error('Failed to record audit log:', err);
    return null;
  }
}

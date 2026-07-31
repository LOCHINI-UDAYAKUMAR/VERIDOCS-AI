import { NextResponse } from 'next/server';
import { getUserFromRequest, requireRole } from '../../../lib/auth';
import { getAuditLogs } from '../../../lib/audit';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!requireRole(user, ['admin', 'auditor'])) {
    return NextResponse.json({ error: 'Only Admin or Auditor accounts may view the audit trail.' }, { status: 403 });
  }
  const logs = getAuditLogs({ limit: 300 });
  return NextResponse.json({ logs });
}

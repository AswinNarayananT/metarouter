import { isRejectedWithValue } from '@reduxjs/toolkit';
import type { Middleware } from '@reduxjs/toolkit';
import { notifyError } from '@/utils/notify';

// Thunks whose failure is NOT toasted: the page already shows it in place (with an empty state / Retry),
// it belongs to a form (login), or it runs in the background where a toast would only be noise
const QUIET_THUNKS = new Set([
  // Login forms show the error under the fields
  'workspace/login',
  'superAdmin/login',
  // Background: on every page load / tab focus / poll
  'workspace/fetchCurrentUser',
  'workspace/fetchOrganization',
  'chat/fetchConversationCounts',
  'chat/markConversationRead',
  'broadcast/fetchWhatsAppNumbers',
  'quickReplies/fetch',
  'tickets/fetchGroups',
  'notifications/fetch',
  // Page loads shown in place
  'workspace/fetchTeamMembers',
  'workspace/fetchInvitations',
  'workspace/fetchAISettings',
  'workspace/verifyInvitationToken',
  'chat/fetchConversations',
  'chat/fetchMessages',
  'tickets/fetch',
  'tickets/fetchDetail',
  'broadcast/fetchTemplates',
  'broadcast/preview',
  'broadcast/fetchList',
  'broadcast/fetchDetail',
  'knowledge/fetchDocuments',
  'organizations/fetchStats',
  'organizations/fetchAll',
  'organizations/fetchOne',
  'organizations/fetchInvites',
  'auditLogs/fetchAuditLogs',
]);

/** Every other failed thunk (save, send, assign, delete…) shows its server message as an error toast. */
export const errorToastMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action) && typeof action.payload === 'string') {
    const thunk = action.type.replace(/\/rejected$/, '');
    if (!QUIET_THUNKS.has(thunk)) notifyError(action.payload);
  }
  return next(action);
};

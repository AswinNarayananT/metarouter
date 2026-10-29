import { isFulfilled, isRejectedWithValue } from '@reduxjs/toolkit';
import type { Middleware, UnknownAction } from '@reduxjs/toolkit';
import { notifyError, notifySuccess } from '@/utils/notify';

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
  'workspace/fetchMembersPage',
  'workspace/fetchMemberOpenWork',
  'workspace/fetchMyOpenWork',
  // Shown in the leave dialog, under the password
  'workspace/leave',
  'workspace/fetchInvitations',
  'workspace/fetchAISettings',
  'workspace/verifyInvitationToken',
  // Forgot / reset password pages show errors in place
  'workspace/requestPasswordReset',
  'workspace/verifyPasswordResetToken',
  'workspace/resetPassword',
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

type FulfilledAction = UnknownAction & { payload: any; meta: { arg: any } }; // eslint-disable-line @typescript-eslint/no-explicit-any

// Saves, adds, updates and deletes that confirm with a success toast. Not listed: actions whose result is
// already on screen (a sent message, a takeover banner, invite links, the new organization's invite card)
const SUCCESS_MESSAGES: Record<string, string | ((action: FulfilledAction) => string)> = {
  'workspace/updateCurrentUser': 'Profile updated',
  'workspace/updateOrganization': 'Workspace details saved',
  'workspace/changePassword': 'Password updated. Your other devices were signed out.',
  'workspace/saveAISettings': 'AI assistant settings saved. New customer messages use them.',
  'workspace/leave': (a) => a.payload,
  'workspace/revokeInvitation': (a) => `Invitation to ${a.payload.email} revoked. Its link no longer works.`,
  'workspace/resendInvitation': (a) => `New invite emailed to ${a.payload.email}. The old link no longer works.`,
  'tickets/update': 'Ticket updated',
  'tickets/addNote': 'Note added',
  'tickets/close': (a) => (a.meta.arg.handBackToAi ? "Ticket closed. The AI answers the customer's next message." : 'Ticket closed'),
  'tickets/assign': (a) => (a.meta.arg.userId === null ? 'Ticket unassigned' : 'Ticket assigned'),
  'chat/assignConversation': (a) => (a.meta.arg.userId === null ? 'Chat unassigned' : 'Chat assigned'),
  'broadcast/create': 'Broadcast created. Messages are being sent.',
  'broadcast/resume': 'Broadcast resumed',
  'knowledge/uploadDocument': 'PDF uploaded. The assistant can use it once processing finishes.',
  'knowledge/retryDocument': 'Processing the PDF again',
  'knowledge/deleteDocument': 'Document removed from the knowledge base',
  'quickReplies/create': (a) => `Quick reply /${a.payload.shortcut} added`,
  'quickReplies/update': (a) => `Quick reply /${a.payload.shortcut} saved`,
  'quickReplies/delete': 'Quick reply deleted',
  'superAdmin/updateProfile': 'Profile updated',
  'superAdmin/changePassword': 'Password changed',
  'organizations/updateStatus': (a) => (a.meta.arg.status === 'active' ? 'Workspace activated' : 'Workspace deactivated. Its members can no longer sign in.'),
  'organizations/revokeInvite': 'Invitation revoked',
  'organizations/delete': 'Workspace deleted',
  'auditLogs/exportCsv': 'Audit log exported',
};

/**
 * One place for action feedback:
 * - a failed thunk shows its server message as an error toast (except QUIET_THUNKS);
 * - a successful save / add / update / delete in SUCCESS_MESSAGES shows a success toast.
 */
export const toastMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action) && typeof action.payload === 'string') {
    const thunk = action.type.replace(/\/rejected$/, '');
    if (!QUIET_THUNKS.has(thunk)) notifyError(action.payload);
  } else if (isFulfilled(action)) {
    const message = SUCCESS_MESSAGES[action.type.replace(/\/fulfilled$/, '')];
    if (message) notifySuccess(typeof message === 'function' ? message(action as FulfilledAction) : message);
  }
  return next(action);
};

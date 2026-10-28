import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import superAdminReducer from './superAdmin/superAdminSlice';
import organizationReducer from './superAdmin/organizationSlice';
import auditLogReducer from './superAdmin/auditLogSlice';
import workspaceReducer from './workspace/workspaceSlice';
import broadcastReducer from './broadcast/broadcastSlice';
import knowledgeReducer from './knowledge/knowledgeSlice';
import chatReducer from './chat/chatSlice';
import notificationReducer from './notifications/notificationSlice';
import ticketReducer from './tickets/ticketSlice';
import quickRepliesReducer from './quickReplies/quickRepliesSlice';
import { errorToastMiddleware } from './errorToastMiddleware';

export const store = configureStore({
  reducer: {
    superAdmin: superAdminReducer,
    organizations: organizationReducer,
    auditLogs: auditLogReducer,
    workspace: workspaceReducer,
    broadcast: broadcastReducer,
    knowledge: knowledgeReducer,
    chat: chatReducer,
    notifications: notificationReducer,
    tickets: ticketReducer,
    quickReplies: quickRepliesReducer,
  },
  // Failed actions show as error toasts (see errorToastMiddleware for the ones shown in place instead)
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(errorToastMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
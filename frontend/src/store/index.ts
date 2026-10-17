import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import superAdminReducer from './superAdmin/superAdminSlice';
import organizationReducer from './superAdmin/organizationSlice';
import workspaceReducer from './workspace/workspaceSlice';
import broadcastReducer from './broadcast/broadcastSlice';
import knowledgeReducer from './knowledge/knowledgeSlice';

export const store = configureStore({
  reducer: {
    superAdmin: superAdminReducer,
    organizations: organizationReducer,
    workspace: workspaceReducer,
    broadcast: broadcastReducer,
    knowledge: knowledgeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
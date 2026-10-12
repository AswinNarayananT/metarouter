import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchTeamMembers } from '@/store/workspace/workspaceThunks';

export function TeamMembers() {
  const dispatch = useAppDispatch();
  const { teamMembers, isLoadingTeamMembers, teamMembersError, user } = useAppSelector(
    (state) => state.workspace
  );

  useEffect(() => {
    dispatch(fetchTeamMembers());
  }, [dispatch]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Team Members</h1>
        <p className="text-sm text-on-surface-variant">View all team members in your organization.</p>
      </div>

      {/* Team Members List Table */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        {isLoadingTeamMembers && teamMembers.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">Loading team members...</p>
        ) : teamMembersError ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-error">{teamMembersError}</p>
            <button
              type="button"
              onClick={() => dispatch(fetchTeamMembers())}
              className="text-xs font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="p-6 text-sm text-on-surface-variant text-center">No team members found.</p>
        ) : (
          <div className="divide-y divide-outline-variant/30">
            {teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                    {member.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-on-surface">
                      {member.name}
                      {member.id === user?.id && (
                        <span className="ml-1.5 font-normal text-on-surface-variant">(You)</span>
                      )}
                    </h4>
                    <p className="text-xs text-on-surface-variant">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_active && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-error/10 text-error uppercase">
                      Inactive
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                    {member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

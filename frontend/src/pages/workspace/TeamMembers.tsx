import React from 'react';
import { UserPlus, Shield, Mail } from 'lucide-react';

export function TeamMembers() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Team Management</h1>
          <p className="text-sm text-on-surface-variant">Manage agents and administrators for your organization.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl font-medium text-xs shadow-md hover:bg-primary/90 transition-all">
          <UserPlus className="w-4 h-4" />
          <span>Invite Member</span>
        </button>
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        <div className="divide-y divide-outline-variant/30">
          {[
            { name: 'Organization Admin', email: 'admin@company.com', role: 'admin' },
            { name: 'Support Agent', email: 'agent@company.com', role: 'agent' },
          ].map((member, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                  {member.name[0]}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-on-surface">{member.name}</h4>
                  <p className="text-xs text-on-surface-variant">{member.email}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
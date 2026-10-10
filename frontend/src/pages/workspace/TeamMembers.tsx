export function TeamMembers() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Team Members</h1>
        <p className="text-sm text-on-surface-variant">View all team members in your organization.</p>
      </div>

      {/* Team Members List Table */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden">
        <div className="divide-y divide-outline-variant/30">
          {[
            { name: 'Organization Admin', email: 'admin@company.com', role: 'admin' },
            { name: 'Workspace Manager', email: 'manager@company.com', role: 'manager' },
            { name: 'Service Staff', email: 'service@company.com', role: 'service' },
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
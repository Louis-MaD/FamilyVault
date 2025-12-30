'use client';
import React, { useEffect, useState } from 'react';

type UserRole = 'ADMIN' | 'MEMBER';
type UserStatus = 'ACTIVE' | 'PENDING' | 'DISABLED';

interface Member {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export default function AdminFamilyClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/members');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch members');
      }
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleApprove = async (userId: string) => {
    const res = await fetch(`/api/admin/members/${userId}/approve`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to approve member');
      return;
    }
    fetchMembers();
  };

  const handleDisable = async (userId: string) => {
    const res = await fetch(`/api/admin/members/${userId}/disable`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to disable member');
      return;
    }
    fetchMembers();
  };

  const pendingMembers = members.filter(m => m.status === 'PENDING');
  const activeMembers = members.filter(m => m.status === 'ACTIVE');
  const disabledMembers = members.filter(m => m.status === 'DISABLED');

  const renderRow = (member: Member) => {
    const displayName = member.displayName || member.email.split('@')[0];
    return (
      <div key={member.id} className="flex items-center justify-between p-3 border rounded bg-white">
        <div>
          <p className="font-semibold text-gray-900">{displayName}</p>
          <p className="text-sm text-gray-600">{member.email}</p>
          <p className="text-xs text-gray-500">
            {member.role} • Joined {new Date(member.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {member.status === 'PENDING' && (
            <>
              <button
                onClick={() => handleApprove(member.id)}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleDisable(member.id)}
                className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Disable
              </button>
            </>
          )}
          {member.status === 'ACTIVE' && (
            <button
              onClick={() => handleDisable(member.id)}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              Disable
            </button>
          )}
          {member.status === 'DISABLED' && (
            <span className="text-xs text-gray-500">Disabled</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading members...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <section>
            <h2 className="text-xl font-semibold mb-3">
              Pending ({pendingMembers.length})
            </h2>
            {pendingMembers.length === 0 ? (
              <p className="text-sm text-gray-600">No pending members.</p>
            ) : (
              <div className="space-y-2">
                {pendingMembers.map(renderRow)}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              Active ({activeMembers.length})
            </h2>
            {activeMembers.length === 0 ? (
              <p className="text-sm text-gray-600">No active members.</p>
            ) : (
              <div className="space-y-2">
                {activeMembers.map(renderRow)}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              Disabled ({disabledMembers.length})
            </h2>
            {disabledMembers.length === 0 ? (
              <p className="text-sm text-gray-600">No disabled members.</p>
            ) : (
              <div className="space-y-2">
                {disabledMembers.map(renderRow)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}


'use client';
import React, { useEffect, useState } from 'react';
import { Inbox, Send, FileKey, StickyNote, Clock, CheckCircle, XCircle, Ban } from 'lucide-react';

type RequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED' | 'EXPIRED';

interface AccessRequest {
  id: string;
  itemId: string;
  reason: string | null;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  decisionNote: string | null;
  item: {
    id: string;
    title: string;
    type: string;
    url: string | null;
  };
  requester?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  owner?: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incomingRequests, setIncomingRequests] = useState<AccessRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const [incomingRes, outgoingRes] = await Promise.all([
        fetch('/api/requests/incoming'),
        fetch('/api/requests/outgoing'),
      ]);

      if (incomingRes.ok) {
        const incomingData = await incomingRes.json();
        setIncomingRequests(incomingData);
      }

      if (outgoingRes.ok) {
        const outgoingData = await outgoingRes.json();
        setOutgoingRequests(outgoingData);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/approve`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchRequests();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    }
  };

  const handleDeny = async (requestId: string) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        fetchRequests();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to deny request');
      }
    } catch (error) {
      console.error('Error denying request:', error);
      alert('Failed to deny request');
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/cancel`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchRequests();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('Error cancelling request:', error);
      alert('Failed to cancel request');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: RequestStatus) => {
    const badges = {
      PENDING: { icon: Clock, color: 'bg-yellow-100 text-yellow-800', text: 'Pending' },
      APPROVED: { icon: CheckCircle, color: 'bg-green-100 text-green-800', text: 'Approved' },
      DENIED: { icon: XCircle, color: 'bg-red-100 text-red-800', text: 'Denied' },
      CANCELLED: { icon: Ban, color: 'bg-gray-100 text-gray-800', text: 'Cancelled' },
      EXPIRED: { icon: Clock, color: 'bg-orange-100 text-orange-800', text: 'Expired' },
    };

    const badge = badges[status];
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.text}
      </span>
    );
  };

  const renderRequestCard = (request: AccessRequest, isIncoming: boolean) => {
    const displayName = isIncoming
      ? request.requester?.displayName || request.requester?.email.split('@')[0]
      : request.owner?.displayName || request.owner?.email.split('@')[0];

    return (
      <div key={request.id} className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-start gap-3">
          {request.item.type === 'PASSWORD' ? (
            <FileKey className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          ) : (
            <StickyNote className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-gray-900">{request.item.title}</h3>
                {request.item.url && (
                  <p className="text-sm text-blue-600 truncate">{request.item.url}</p>
                )}
                <p className="text-sm text-gray-600 mt-1">
                  {isIncoming ? 'Requested by' : 'Owner'}:{' '}
                  <span className="font-medium">{displayName}</span>
                </p>
              </div>
              {getStatusBadge(request.status)}
            </div>

            {request.reason && (
              <div className="bg-gray-50 p-2 rounded text-sm text-gray-700 mb-2">
                <strong>Reason:</strong> {request.reason}
              </div>
            )}

            <div className="text-xs text-gray-500 space-y-1">
              <p>Requested: {formatDate(request.createdAt)}</p>
              {request.decidedAt && (
                <p>Decided: {formatDate(request.decidedAt)}</p>
              )}
              {request.expiresAt && (
                <p className="text-orange-600 font-medium">
                  Expires: {formatDate(request.expiresAt)}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            {request.status === 'PENDING' && (
              <div className="flex gap-2 mt-3">
                {isIncoming ? (
                  <>
                    <button
                      onClick={() => handleApprove(request.id)}
                      className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(request.id)}
                      className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                    >
                      Deny
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleCancel(request.id)}
                    className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
                  >
                    Cancel Request
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const pendingIncoming = incomingRequests.filter(r => r.status === 'PENDING').length;
  const pendingOutgoing = outgoingRequests.filter(r => r.status === 'PENDING').length;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Access Requests</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
            activeTab === 'incoming'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Incoming
          {pendingIncoming > 0 && (
            <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
              {pendingIncoming}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
            activeTab === 'outgoing'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Send className="w-4 h-4" />
          Outgoing
          {pendingOutgoing > 0 && (
            <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
              {pendingOutgoing}
            </span>
          )}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading requests...</p>
        </div>
      )}

      {/* Incoming Tab */}
      {!loading && activeTab === 'incoming' && (
        <div className="space-y-3">
          {incomingRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Inbox className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No incoming requests
              </h3>
              <p className="text-gray-600">
                When family members request access to your items, they'll appear here
              </p>
            </div>
          ) : (
            incomingRequests.map(request => renderRequestCard(request, true))
          )}
        </div>
      )}

      {/* Outgoing Tab */}
      {!loading && activeTab === 'outgoing' && (
        <div className="space-y-3">
          {outgoingRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Send className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No outgoing requests
              </h3>
              <p className="text-gray-600">
                Request access to family members' items from the Family Vault page
              </p>
            </div>
          ) : (
            outgoingRequests.map(request => renderRequestCard(request, false))
          )}
        </div>
      )}
    </div>
  );
}

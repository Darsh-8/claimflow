/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '../context/AuthContext';

type NotificationType = 
  | 'CLAIM_STATUS_UPDATED' 
  | 'FRAUD_RISK_DETECTED' 
  | 'CLAIM_DECISION' 
  | 'CORRECTIONS_SUBMITTED' 
  | 'DOCUMENT_ADDED'
  | 'CLAIM_STATUS';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  claim_id?: number;
  decision?: string;
  read: boolean;
  timestamp: string;
}

interface NotificationContextProps {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const getCookie = (name: string) => {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        if (match) return match[2];
        return null;
      };

      let tokenStr = getCookie('access_token');
      if (tokenStr) {
        tokenStr = decodeURIComponent(tokenStr);
        if (tokenStr.startsWith('"') && tokenStr.endsWith('"')) {
          tokenStr = tokenStr.slice(1, -1);
        }
        if (tokenStr.startsWith('Bearer ')) {
          tokenStr = tokenStr.substring(7);
        }
      }

      if (!tokenStr) {
        console.warn('[WS] No access token found — skipping WebSocket connection');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const wsBaseUrl = apiUrl.replace(/^http/, 'ws');
      const wsUrl = `${wsBaseUrl}/notifications/ws?token=${tokenStr}`;

      console.log('[WS] Connecting to', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connection established');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          const newNotification: Notification = {
            id: Math.random().toString(36).substring(2, 9),
            type: data.type,
            message: data.message,
            claim_id: data.claim_id,
            decision: data.decision,
            read: false,
            timestamp: new Date().toISOString()
          };

          setNotifications((prev) => [newNotification, ...prev]);

          if (data.type === 'FRAUD_RISK_DETECTED') {
            toast.error(data.message, { description: 'Fraud Risk Flagged' });
          } else if (data.type === 'CLAIM_STATUS' && data.status === 'EXTRACTED') {
            toast.warning(data.message, { description: 'Claim Requires Policy Assignment' });
          } else if (data.type === 'CLAIM_DECISION') {
            toast.info(data.message, { description: 'Claim Evaluated' });
          } else {
            toast.success(data.message, { description: data.type?.replace(/_/g, ' ') });
          }
        } catch (error) {
          console.error('[WS] Failed to parse notification:', error);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] WebSocket error:', err);
      };

      ws.onclose = (event) => {
        console.log('[WS] Connection closed, code:', event.code);
        // Auto-reconnect after 3s (unless intentionally closed with code 1000/1008)
        if (event.code !== 1000 && event.code !== 1008) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close(1000);
      }
    };
  }, [isAuthenticated]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

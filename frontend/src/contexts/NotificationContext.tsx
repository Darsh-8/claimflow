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

    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      if (match) return match[2];
      return null;
    };
    
    let tokenStr = getCookie('access_token');
    if (tokenStr) {
      tokenStr = decodeURIComponent(tokenStr);
      // Remove surrounding quotes if present (FastAPI adds them for cookies with spaces)
      if (tokenStr.startsWith('"') && tokenStr.endsWith('"')) {
        tokenStr = tokenStr.slice(1, -1);
      }
      if (tokenStr.startsWith('Bearer ')) {
        tokenStr = tokenStr.substring(7);
      }
    }
    
    if (!tokenStr) return;

    // Use VITE_API_URL or fallback, then replace http with ws
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const wsBaseUrl = apiUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBaseUrl}/notifications/ws?token=${tokenStr}`;

    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connection established for notifications');
    };

    websocket.onmessage = (event) => {
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
        } else if (data.status === 'EXTRACTED') {
          toast.warning(data.message, { description: 'Claim Requires Policy Assignment' });
        } else if (data.type === 'CLAIM_DECISION') {
          toast.info(data.message, { description: 'Claim Evaluated' });
        } else {
          toast.success(data.message, { description: data.type });
        }
      } catch (error) {
        console.error('Failed to parse notification:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket connection closed');
      // Optional: implement reconnect logic here
    };

    return () => {
      websocket.close();
    };
  }, []);

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

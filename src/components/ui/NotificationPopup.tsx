"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Image, Video, MessageSquare, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type NotificationType = "message" | "banner" | "video" | "alert" | "info";

export interface Notification {
  id: number;
  title: string;
  content: string;
  type: NotificationType;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
  priority?: "low" | "medium" | "high";
  isDismissible?: boolean;
  actionUrl?: string;
  actionText?: string;
}

interface NotificationPopupProps {
  notification: Notification;
  onDismiss: (id: number) => void;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  autoDismiss?: number; // Auto-dismiss time in milliseconds
}

export function NotificationPopup({ 
  notification, 
  onDismiss, 
  position = "top-right",
  autoDismiss = 0
}: NotificationPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    if (notification.isDismissible === false) return;
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  }, [notification.id, notification.isDismissible, onDismiss]);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Auto-dismiss functionality
    if (autoDismiss > 0 && notification.isDismissible !== false) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, notification.isDismissible, handleDismiss]);

  const handleAction = () => {
    if (notification.actionUrl) {
      window.open(notification.actionUrl, '_blank');
    }
    handleDismiss();
  };

  const positionClasses = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "center": "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
  };

  const priorityColors = {
    low: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
    medium: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950",
    high: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
  };

  const typeIcons = {
    message: <MessageSquare className="h-5 w-5 text-blue-600" />,
    banner: <Image className="h-5 w-5 text-green-600" />,
    video: <Video className="h-5 w-5 text-purple-600" />,
    alert: <AlertTriangle className="h-5 w-5 text-orange-600" />,
    info: <Info className="h-5 w-5 text-cyan-600" />
  };

  const animationClasses = isExiting 
    ? "opacity-0 scale-95 translate-y-2" 
    : isVisible 
    ? "opacity-100 scale-100 translate-y-0" 
    : "opacity-0 scale-95 translate-y-2";

  return (
    <div 
      className={`fixed z-50 ${positionClasses[position]} w-96 max-w-full p-4 transition-all duration-300 ease-out ${animationClasses}`}
    >
      <Card className={`relative shadow-2xl border-2 ${priorityColors[notification.priority || "medium"]} hover:shadow-lg transition-shadow`}>
        {notification.isDismissible !== false && (
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 hover:bg-transparent opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {typeIcons[notification.type]}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {notification.title}
                </h3>
                {notification.priority && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    notification.priority === "high" 
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : notification.priority === "medium"
                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  }`}>
                    {notification.priority}
                  </span>
                )}
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {notification.content}
              </p>
              
              {notification.imageUrl && (
                <div className="mt-3">
                  <img 
                    src={notification.imageUrl} 
                    alt={notification.title}
                    className="w-full h-32 object-cover rounded-md border hover:scale-105 transition-transform cursor-pointer"
                    onClick={() => window.open(notification.imageUrl, '_blank')}
                  />
                </div>
              )}
              
              {notification.videoUrl && (
                <div className="mt-3">
                  <video 
                    src={notification.videoUrl} 
                    controls
                    className="w-full h-32 rounded-md border"
                  />
                </div>
              )}
              
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
                
                <div className="flex items-center gap-2">
                  {notification.actionUrl && notification.actionText && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAction}
                      className="text-xs"
                    >
                      {notification.actionText}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

interface NotificationContainerProps {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";
  autoDismiss?: number;
  maxNotifications?: number;
}

import { useSession } from "@/contexts/SessionContext";

export function NotificationContainer({ 
  position = "top-right", 
  autoDismiss = 10000, // 10 seconds default
  maxNotifications = 3 
}: NotificationContainerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isClient, setIsClient] = useState(false);
  const { user } = useSession();

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !user) return;

    // Load notifications from API
    loadNotifications();
    
    // Set up polling for new notifications
    const interval = setInterval(loadNotifications, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [isClient, user]);

  const loadNotifications = async () => {
    const run = async (attempt = 1): Promise<void> => {
      try {
        const response = await fetch("/api/user/notifications");
        if (!response.ok) return;
        const data = await response.json();
        const newNotifications = data.notifications || [];
        const uniqueNotifications = newNotifications.filter((newNotif: Notification) => 
          !notifications.some(existingNotif => existingNotif.id === newNotif.id)
        );
        setNotifications(prev => {
          const combined = [...prev, ...uniqueNotifications];
          return combined.slice(-maxNotifications);
        });
      } catch (error) {
        if (attempt < 3) {
          const delay = 500 * attempt;
          setTimeout(() => run(attempt + 1), delay);
        }
      }
    };
    return run();
  };

  const handleDismissNotification = async (id: number) => {
    try {
      await fetch(`/api/user/notifications/${id}/dismiss`, { method: "POST" });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (error) {
      console.error("Failed to dismiss notification:", error);
      // Still remove from UI even if API fails
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  };

  if (!isClient || notifications.length === 0) {
    return null;
  }

  return (
    <>
      {notifications.map((notification) => (
        <NotificationPopup
          key={notification.id}
          notification={notification}
          onDismiss={handleDismissNotification}
          position={position}
          autoDismiss={autoDismiss}
        />
      ))}
    </>
  );
}

// Hook for managing notifications
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismissNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const addNotification = (notification: Omit<Notification, 'id' | 'createdAt'>) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now(), // Simple ID generation
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [...prev, newNotification]);
  };

  return {
    notifications,
    dismissNotification,
    addNotification,
  };
}

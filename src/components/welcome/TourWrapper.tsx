'use client';

import { useState, useEffect } from 'react';
import { WelcomeTour } from './WelcomeTour';

interface TourWrapperProps {
  userId?: number;
  userEmail?: string;
  toolId?: string; // For tool-specific tours
}

export function TourWrapper({ userId, userEmail, toolId }: TourWrapperProps) {
  const [showTour, setShowTour] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{ id: number; email: string } | null>(null);

  useEffect(() => {
    async function fetchUserAndCheckTour() {
      try {
        // Fetch user info if not provided
        let finalUserId = userId;
        let finalUserEmail = userEmail;

        if (!finalUserId || !finalUserEmail) {
          const sessionResponse = await fetch('/api/session');
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (sessionData.user) {
              finalUserId = sessionData.user.id;
              finalUserEmail = sessionData.user.email;
              if (finalUserId && finalUserEmail) {
                setUserInfo({ id: finalUserId, email: finalUserEmail });
              }
            }
          }
        } else {
          if (finalUserId && finalUserEmail) {
            setUserInfo({ id: finalUserId, email: finalUserEmail });
          }
        }

        if (!finalUserId || !finalUserEmail) {
          setLoading(false);
          return;
        }

        // Check if user has disabled welcome tour
        const preferencesResponse = await fetch('/api/user/preferences');
        let disableTour = false;
        if (preferencesResponse.ok) {
          const preferencesData = await preferencesResponse.json();
          disableTour = preferencesData.preferences?.disableWelcomeTour || false;
        }

        if (disableTour) {
          setLoading(false);
          return;
        }

        // Check tour status
        const response = await fetch('/api/user/tour-complete');
        if (!response.ok) {
          setLoading(false);
          return;
        }

        const data = await response.json();
        const { completedTours } = data;

        // Only show tour if it hasn't been completed
        if (toolId) {
          // Tool-specific tour: show if this tool hasn't been seen
          const toolCompleted = completedTours.tools && Array.isArray(completedTours.tools) && completedTours.tools.includes(toolId);
          if (!toolCompleted) {
            setShowTour(true);
          } else {
            // Tour already completed, don't show
            setShowTour(false);
          }
        } else {
          // Main tour: show if main tour hasn't been completed
          if (!completedTours.main) {
            setShowTour(true);
          } else {
            // Tour already completed, don't show
            setShowTour(false);
          }
        }
      } catch (error) {
        console.error('Error checking tour status:', error);
        // On error, show tour to be safe (first-time users)
        if (!toolId && userInfo) {
          setShowTour(true);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchUserAndCheckTour();
  }, [toolId, userId, userEmail]);

  const handleComplete = async (toolIds?: string[]) => {
    setShowTour(false);
    // Tour completion is handled by the WelcomeTour component
  };

  if (loading || !userInfo) {
    return null;
  }

  if (!showTour) {
    return null;
  }

  if (!userInfo) {
    return null;
  }

  return (
    <WelcomeTour
      userId={userInfo.id}
      userEmail={userInfo.email}
      toolId={toolId}
      onComplete={handleComplete}
    />
  );
}


'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles, Zap, Rocket, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { projects, type Project } from '@/data/projects';

interface WelcomeTourProps {
  userId: number;
  userEmail: string;
  onComplete: (toolIds?: string[]) => void;
  toolId?: string; // For tool-specific tours
}

export function WelcomeTour({ userId, userEmail, onComplete, toolId }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Determine which tour to show
  const isMainTour = !toolId;
  const tool = toolId ? projects.find(p => p.id === toolId) : null;
  
  // Main tour steps
  const mainTourSteps = [
    {
      title: 'Welcome to Meddey Tech Space',
      subtitle: 'Your Futuristic Automation Hub',
      content: (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            Experience the future of productivity with our unified workspace. Access all your automation tools in one place.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <Zap className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Powerful Tools</h3>
              <p className="text-sm text-muted-foreground">Access {projects.length} curated automation tools</p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <Rocket className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Seamless Integration</h3>
              <p className="text-sm text-muted-foreground">Unified theme and experience</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Explore Your Tools',
      subtitle: 'Everything You Need in One Place',
      content: (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            Each tool is designed to streamline your workflow and boost productivity.
          </p>
          <div className="space-y-3 mt-6">
            {projects.slice(0, 3).map((project) => {
              const accentBgColors: Record<string, string> = {
                blue: 'bg-blue-500/20',
                green: 'bg-green-500/20',
                purple: 'bg-purple-500/20',
                orange: 'bg-orange-500/20',
                red: 'bg-red-500/20',
                teal: 'bg-teal-500/20',
              };
              const accentTextColors: Record<string, string> = {
                blue: 'text-blue-500',
                green: 'text-green-500',
                purple: 'text-purple-500',
                orange: 'text-orange-500',
                red: 'text-red-500',
                teal: 'text-teal-500',
              };
              const bgClass = accentBgColors[project.accent] || 'bg-primary/20';
              const textClass = accentTextColors[project.accent] || 'text-primary';
              
              return (
                <div key={project.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center`}>
                      <Sparkles className={`w-5 h-5 ${textClass}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{project.name}</h4>
                      <p className="text-sm text-muted-foreground">{project.summary}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      title: 'Get Started',
      subtitle: 'Ready to Begin?',
      content: (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            Click on any tool card to launch it. Each tool runs independently and integrates seamlessly with your workflow.
          </p>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mt-6">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              💡 <strong>Tip:</strong> You can access this tour again from the settings page, or see tool-specific tours when new tools are added.
            </p>
          </div>
        </div>
      ),
    },
  ];

  // Tool-specific tour steps
  const toolTourSteps = tool ? [
    {
      title: `Welcome to ${tool.name}`,
      subtitle: tool.headline,
      content: (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">{tool.summary}</p>
          <div className="mt-6">
            <h4 className="font-semibold mb-3">Key Features:</h4>
            <ul className="space-y-2">
              {tool.highlights.slice(0, 5).map((highlight, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'How to Use',
      subtitle: 'Getting Started',
      content: (
        <div className="space-y-4">
          <p className="text-lg text-muted-foreground">
            This tool is now available in your workspace. Click the launch button to get started.
          </p>
          {tool.resources.length > 0 && (
            <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
              <h4 className="font-semibold mb-2">Quick Access</h4>
              <p className="text-sm text-muted-foreground">
                {tool.resources[0].note || 'Launch the tool to begin using it.'}
              </p>
            </div>
          )}
        </div>
      ),
    },
  ] : [];

  const steps = isMainTour ? mainTourSteps : toolTourSteps;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsVisible(false);
    
    // Mark tour as completed
    try {
      const toolIds = toolId ? [toolId] : undefined;
      await fetch('/api/user/tour-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolIds }),
      });
    } catch (error) {
      console.error('Failed to mark tour as complete:', error);
    }
    
    onComplete(toolId ? [toolId] : undefined);
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!isVisible || steps.length === 0) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-2xl"
          >
            <Card className="border-2 border-primary/20 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-50" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.15),_transparent_50%)]" />
              
              <div className="relative p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 mb-2"
                    >
                      <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {isMainTour ? 'Welcome Tour' : 'New Tool'}
                      </span>
                    </motion.div>
                    <motion.h2
                      key={`title-${currentStep}`}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-3xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
                    >
                      {steps[currentStep].title}
                    </motion.h2>
                    <motion.p
                      key={`subtitle-${currentStep}`}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-muted-foreground"
                    >
                      {steps[currentStep].subtitle}
                    </motion.p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSkip}
                    className="rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                {/* Content */}
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="min-h-[300px] mb-6"
                >
                  {steps[currentStep].content}
                </motion.div>

                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  {steps.map((_, index) => (
                    <motion.div
                      key={index}
                      className={`h-2 rounded-full transition-all ${
                        index === currentStep
                          ? 'w-8 bg-primary'
                          : 'w-2 bg-muted'
                      }`}
                      initial={false}
                      animate={{
                        width: index === currentStep ? 32 : 8,
                        opacity: index === currentStep ? 1 : 0.5,
                      }}
                    />
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentStep === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  
                  <Button
                    onClick={handleNext}
                    className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  >
                    {isLastStep ? (
                      <>
                        Get Started
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


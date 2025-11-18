/**
 * React Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Usage: Wrap your app or specific components with <ErrorBoundary>
 */

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('Error Boundary caught an error:', {
      error: error.toString(),
      errorInfo: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    this.setState({
      error,
      errorInfo,
      errorCount: this.state.errorCount + 1
    });

    // Send to error tracking service (e.g., Sentry)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack
          }
        }
      });
    }

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.handleReset
        });
      }

      // Default error UI
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <svg style={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
            </div>

            <h1 style={styles.title}>Oops! Something went wrong</h1>
            
            <p style={styles.description}>
              We're sorry for the inconvenience. The application encountered an unexpected error.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Development Only)</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div style={styles.buttonContainer}>
              <button 
                onClick={this.handleReset} 
                style={{...styles.button, ...styles.primaryButton}}
              >
                Try Again
              </button>
              
              <button 
                onClick={this.handleReload} 
                style={{...styles.button, ...styles.secondaryButton}}
              >
                Reload Page
              </button>

              {this.props.onGoHome && (
                <button 
                  onClick={this.props.onGoHome} 
                  style={{...styles.button, ...styles.secondaryButton}}
                >
                  Go Home
                </button>
              )}
            </div>

            {this.state.errorCount > 2 && (
              <p style={styles.warning}>
                ⚠️ Multiple errors detected. Please try reloading the page or contact support.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Default styles
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    padding: '1rem'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    padding: '2rem',
    maxWidth: '32rem',
    width: '100%'
  },
  iconContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem'
  },
  icon: {
    width: '4rem',
    height: '4rem',
    color: '#ef4444'
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#1f2937',
    marginBottom: '0.5rem'
  },
  description: {
    fontSize: '1rem',
    textAlign: 'center',
    color: '#6b7280',
    marginBottom: '1.5rem'
  },
  details: {
    marginBottom: '1.5rem',
    padding: '1rem',
    backgroundColor: '#fee2e2',
    borderRadius: '0.25rem',
    border: '1px solid #fca5a5'
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: '0.5rem'
  },
  errorText: {
    fontSize: '0.75rem',
    color: '#7f1d1d',
    overflow: 'auto',
    maxHeight: '12rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  buttonContainer: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  button: {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    color: 'white'
  },
  secondaryButton: {
    backgroundColor: '#e5e7eb',
    color: '#374151'
  },
  warning: {
    marginTop: '1rem',
    padding: '0.75rem',
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: '0.25rem',
    fontSize: '0.875rem',
    color: '#92400e',
    textAlign: 'center'
  }
};

export default ErrorBoundary;
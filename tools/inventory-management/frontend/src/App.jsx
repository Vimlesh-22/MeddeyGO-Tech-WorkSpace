import { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useTheme as useAppTheme } from './contexts/ThemeContext';

// Pages
import Orders from './pages/Orders';
import Products from './pages/Products';
import InventoryCount from './pages/InventoryCount';
import VendorManagement from './pages/VendorManagement';
import Settings from './pages/Settings';
import InitialOrders from './pages/stages/InitialOrders';
import HoldOrders from './pages/stages/HoldOrders';
import ProcessedOrders from './pages/stages/ProcessedOrders';
import PendingOrders from './pages/stages/PendingOrders';
import CompletedOrders from './pages/stages/CompletedOrders';
import InStockOrders from './pages/stages/InStockOrders';
import FulfilledOrders from './pages/stages/FulfilledOrders';
import Layout from './components/Layout';
import { ThemeProvider } from './contexts/ThemeContext';

// Configure React Query for performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Disable refetching on window focus
      staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Cache persists for 10 minutes (formerly cacheTime)
      retry: 1, // Only retry failed requests once
    },
  },
});

// MUI Theme Component that adapts to app theme
function MuiTheme({ children }) {
  const { theme } = useAppTheme();
  const isDark = theme === 'dark';

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: {
        main: isDark ? '#38bdf8' : '#0f172a',
        contrastText: isDark ? '#0f172a' : '#ffffff',
      },
      secondary: {
        main: isDark ? '#64748b' : '#64748b',
        contrastText: isDark ? '#f8fafc' : '#0f172a',
      },
      background: {
        default: isDark ? '#020617' : '#ffffff',
        paper: isDark ? '#0f172a' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f1f5f9' : '#0f172a',
        secondary: isDark ? '#cbd5e1' : '#64748b',
      },
      divider: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            color: isDark ? '#f1f5f9' : '#0f172a',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
            color: isDark ? '#f1f5f9' : '#0f172a',
            borderRight: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)'}`,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.08)',
              color: isDark ? '#38bdf8' : '#0f172a',
            },
            '&:hover': {
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(15, 23, 42, 0.04)',
            },
          },
        },
      },
    },
  }), [isDark]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}

function App() {
  const proxyBase = typeof window !== 'undefined' && (window.__PROXY_BASE__ || window.__TOOL_PROXY__ || '/');
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MuiTheme>
          <Router basename={proxyBase}>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/stages/initial" replace />} />
                <Route path="/stages/initial" element={<InitialOrders />} />
                <Route path="/stages/hold" element={<HoldOrders />} />
                <Route path="/stages/processed" element={<ProcessedOrders />} />
                <Route path="/stages/pending" element={<PendingOrders />} />
                <Route path="/stages/completed" element={<CompletedOrders />} />
                <Route path="/stages/in-stock" element={<InStockOrders />} />
                <Route path="/stages/fulfilled" element={<FulfilledOrders />} />
                <Route path="/products" element={<Products />} />
                <Route path="/inventory-count" element={<InventoryCount />} />
                <Route path="/vendors" element={<VendorManagement />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/overview" element={<Orders />} />
              </Routes>
            </Layout>
          </Router>
        </MuiTheme>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

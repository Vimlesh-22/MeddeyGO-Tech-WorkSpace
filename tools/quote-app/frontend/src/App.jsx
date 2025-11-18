import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Components
import Header from './components/Header'
import PrivateRoute from './components/PrivateRoute'
import AdminRoute from './components/AdminRoute'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Quotations from './pages/Quotations'
import QuotationDetail from './pages/QuotationDetail'
import CreateQuotation from './pages/CreateQuotation'
import EditQuotation from './pages/EditQuotation'
import Products from './pages/Products'
import Users from './pages/Users'
import PricingRules from './pages/PricingRules'
import TemplateSettings from './pages/TemplateSettings'

function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    // Check if user is already logged in
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
  }, [])

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header user={user} setUser={setUser} />
        <ToastContainer position="top-right" autoClose={3000} />
        <main className="pb-12">
          <Routes>
            <Route path="/login" element={<Login setUser={setUser} />} />
            
            <Route path="/" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            
            <Route path="/dashboard" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            
            <Route path="/quotations" element={
              <PrivateRoute>
                <Quotations />
              </PrivateRoute>
            } />
            
            <Route path="/quotations/:id" element={
              <PrivateRoute>
                <QuotationDetail />
              </PrivateRoute>
            } />
            
            <Route path="/quotations/create" element={
              <PrivateRoute>
                <CreateQuotation />
              </PrivateRoute>
            } />

            <Route path="/quotations/:id/edit" element={
              <PrivateRoute>
                <EditQuotation />
              </PrivateRoute>
            } />

            <Route path="/products" element={
              <PrivateRoute>
                <Products />
              </PrivateRoute>
            } />
            
            <Route path="/users" element={
              <AdminRoute>
                <Users />
              </AdminRoute>
            } />
            
            <Route path="/pricing-rules" element={
              <PrivateRoute>
                <PricingRules />
              </PrivateRoute>
            } />
            
            <Route path="/template-settings" element={
              <PrivateRoute>
                <TemplateSettings />
              </PrivateRoute>
            } />
          </Routes>
        </main>
        
        {/* Footer */}
        <footer className="bg-white py-6 border-t border-gray-200">
          <div className="container mx-auto px-4">
            <div className="text-center text-gray-500 text-sm">
              <p>© {new Date().getFullYear()} Quotation Management App. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  )
}

export default App

import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'

function Header({ user, setUser }) {
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef(null)

  const handleLogout = () => {
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  // Close mobile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false)
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mobileMenuRef]);

  return (
    <header className="bg-gradient-to-r from-primary to-secondary shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <Link to={user ? '/dashboard' : '/login'} className="text-white text-2xl font-bold">
            Quote
          </Link>
          
          <div className="hidden md:flex items-center space-x-1">
            {user ? (
              <nav className="flex items-center space-x-1">
                <Link to="/dashboard" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Dashboard
                </Link>
                <Link to="/quotations" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Quotations
                </Link>
                <Link to="/quotations/create" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Create Quotation
                </Link>
                <Link to="/products" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Products
                </Link>
                <Link to="/pricing-rules" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Pricing Rules
                </Link>
                <Link to="/template-settings" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                  Templates
                </Link>
                
                {user.role === 'admin' && (
                  <Link to="/users" className="px-3 py-2 text-white hover:bg-white/10 rounded-md transition">
                    Manage Users
                  </Link>
                )}
                
                <button 
                  onClick={handleLogout} 
                  className="ml-4 px-4 py-2 bg-white text-primary font-semibold rounded-md hover:bg-gray-100 transition"
                >
                  Logout
                </button>
              </nav>
            ) : (
              <Link 
                to="/login" 
                className="px-4 py-2 bg-white text-primary font-semibold rounded-md hover:bg-gray-100 transition"
              >
                Login
              </Link>
            )}
          </div>
          
          {/* Mobile menu button */}
          <div className="md:hidden">
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
              className="mobile-menu-button p-2 rounded-md text-white hover:bg-white/10 focus:outline-none"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div 
        ref={mobileMenuRef}
        className={`md:hidden mobile-menu ${mobileMenuOpen ? 'block' : 'hidden'}`}
      >
        {user && (
          <div className="px-2 pt-2 pb-4 space-y-1 bg-primary/90">
            <Link 
              to="/dashboard" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Dashboard
            </Link>
            <Link 
              to="/quotations" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Quotations
            </Link>
            <Link 
              to="/quotations/create" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Create Quotation
            </Link>
            <Link 
              to="/products" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Products
            </Link>
            <Link 
              to="/pricing-rules" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Pricing Rules
            </Link>
            <Link 
              to="/template-settings" 
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
            >
              Templates
            </Link>
            {user.role === 'admin' && (
              <Link 
                to="/users" 
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 text-white hover:bg-white/10 rounded-md"
              >
                Manage Users
              </Link>
            )}
            <button 
              onClick={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }} 
              className="w-full mt-3 text-left px-3 py-2 bg-white text-primary font-semibold rounded-md"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Header 
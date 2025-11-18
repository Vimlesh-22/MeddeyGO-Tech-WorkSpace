import { Navigate } from 'react-router-dom'

function PrivateRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user'))

  // Redirect to login if not authenticated
  if (!user || !user.token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default PrivateRoute 
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllQuotations } from '../services/api';

function Dashboard() {
  const [quotations, setQuotations] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    initial: 0,
    negotiation: 0,
    onHold: 0,
    won: 0,
    lost: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await getAllQuotations();
        const fetchedQuotations = response.data.data;
        
        setQuotations(fetchedQuotations);
        
        // Calculate stats
        const total = fetchedQuotations.length;
        const initial = fetchedQuotations.filter(q => q.stage === 'Initial').length;
        const negotiation = fetchedQuotations.filter(q => q.stage === 'Negotiation').length;
        const onHold = fetchedQuotations.filter(q => q.stage === 'On Hold').length;
        const won = fetchedQuotations.filter(q => q.stage === 'Win').length;
        const lost = fetchedQuotations.filter(q => q.stage === 'Lost').length;
        
        setStats({
          total,
          initial,
          negotiation,
          onHold,
          won,
          lost
        });
      } catch (error) {
        console.error('Error fetching quotations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getRecentQuotations = () => {
    return [...quotations]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-gradient-to-br from-primary to-blue-700 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.total}</span>
          <span className="text-sm mt-1">Total Quotations</span>
        </div>
        
        <div className="bg-gradient-to-br from-info to-blue-500 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.initial}</span>
          <span className="text-sm mt-1">Initial</span>
        </div>
        
        <div className="bg-gradient-to-br from-warning to-amber-500 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.negotiation}</span>
          <span className="text-sm mt-1">Negotiation</span>
        </div>
        
        <div className="bg-gradient-to-br from-secondary to-indigo-600 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.onHold}</span>
          <span className="text-sm mt-1">On Hold</span>
        </div>
        
        <div className="bg-gradient-to-br from-success to-green-600 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.won}</span>
          <span className="text-sm mt-1">Won</span>
        </div>
        
        <div className="bg-gradient-to-br from-danger to-red-600 text-white rounded-xl shadow-lg p-6 flex flex-col items-center">
          <span className="text-3xl font-bold">{stats.lost}</span>
          <span className="text-sm mt-1">Lost</span>
        </div>
      </div>
      
      {/* Recent Quotations */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Recent Quotations</h2>
        
        {getRecentQuotations().length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {getRecentQuotations().map((quotation) => (
              <div 
                key={quotation._id} 
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-100"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg text-gray-800">{quotation.quotationNumber}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      quotation.stage === 'Win' ? 'bg-green-100 text-green-800' : 
                      quotation.stage === 'Lost' ? 'bg-red-100 text-red-800' : 
                      quotation.stage === 'On Hold' ? 'bg-purple-100 text-purple-800' : 
                      quotation.stage === 'Negotiation' ? 'bg-amber-100 text-amber-800' : 
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {quotation.stage}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-gray-600">{quotation.clientName}</p>
                    <p className="text-gray-500 text-sm">
                      Created: {new Date(quotation.createdAt).toLocaleDateString()}
                    </p>
                    <p className="font-semibold text-lg">₹{quotation.grandTotal.toFixed(2)}</p>
                  </div>
                  
                  <div className="mt-5">
                    <Link 
                      to={`/quotations/${quotation._id}`}
                      className="inline-flex items-center text-primary hover:text-primary/80 text-sm font-medium"
                    >
                      View Details
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md p-8 text-center border border-gray-100">
            <p className="text-gray-600 mb-4">
              No quotations found. Create your first quotation!
            </p>
            <Link 
              to="/quotations/create" 
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Quotation
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard; 
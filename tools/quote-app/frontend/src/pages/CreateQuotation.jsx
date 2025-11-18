import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { createQuotation, getAllProducts, applyPricingRules, getAllUsers, getAllManagers } from '../services/api';

function CreateQuotation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientAddress: '',
    notes: '',
    excludeTransport: false, // Add this new state property
  });
  const [currentUser, setCurrentUser] = useState(null);

  // Calculate totals
  const subTotal = selectedProducts.reduce((sum, product) => sum + (product.sellingPrice * product.quantity), 0);
  const gstTotal = selectedProducts.reduce((sum, product) => sum + (product.sellingPrice * product.quantity * product.gstPercentage / 100), 0);
  const discountTotal = selectedProducts.reduce((sum, product) => sum + product.discount, 0);
  const grandTotal = subTotal + gstTotal - discountTotal;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user from localStorage
        const userData = localStorage.getItem('user');
        if (userData) {
          setCurrentUser(JSON.parse(userData));
        }
        
        // Fetch all users
        const usersResponse = await getAllUsers();
        setUsers(usersResponse.data.data);
        
        // Also fetch managers separately to ensure we have them
        const managersResponse = await getAllManagers();
        setManagers(managersResponse.data.data);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Failed to fetch required data');
      }
    };

    fetchData();
  }, []);

  // Effect to search products when searchTerm changes
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearch();
      }
    }, 500);
    
    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };
  
  const handleUserChange = (e) => {
    setSelectedUser(e.target.value);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    if (!e.target.value.trim()) {
      setSearchResults([]);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      return;
    }

    try {
      setSearching(true);
      // Set a larger limit to ensure we get all products
      const response = await getAllProducts(searchTerm, 1, 100);
      setSearchResults(response.data.data);
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Failed to search products');
    } finally {
      setSearching(false);
    }
  };

  const handleProductSelect = async (product) => {
    setSelectedProduct({ 
      ...product,
      quantity: 1,
      discount: 0,
      finalPrice: product.sellingPrice
    });
    setQuantity(1);
    setOpenProductDialog(true);
  };

  const handleQuantityChange = (e) => {
    const newQuantity = parseInt(e.target.value) || 1;
    setQuantity(newQuantity);
    
    if (selectedProduct) {
      setSelectedProduct({
        ...selectedProduct,
        quantity: newQuantity,
        finalPrice: selectedProduct.sellingPrice * newQuantity
      });
    }
  };

  const handleAddProduct = async () => {
    if (!selectedProduct) return;

    try {
      // Apply pricing rules based on quantity
      const response = await applyPricingRules([{
        ...selectedProduct,
        quantity: quantity
      }]);

      const processedProduct = response.data.data[0];
      
      // Check if the product already exists in the selected products
      const existingIndex = selectedProducts.findIndex(p => p._id === selectedProduct._id);
      
      if (existingIndex !== -1) {
        // Update existing product quantity
        const updatedProducts = [...selectedProducts];
        const existingProduct = updatedProducts[existingIndex];
        
        updatedProducts[existingIndex] = {
          ...processedProduct,
          quantity: existingProduct.quantity + quantity,
          finalPrice: processedProduct.finalPrice * (existingProduct.quantity + quantity) / quantity
        };
        
        setSelectedProducts(updatedProducts);
      } else {
        // Add new product
        setSelectedProducts([...selectedProducts, processedProduct]);
      }
      
      setOpenProductDialog(false);
      setSelectedProduct(null);
    } catch (error) {
      console.error('Error applying pricing rules:', error);
      toast.error('Failed to apply pricing rules');
    }
  };

  const handleRemoveProduct = (index) => {
    const updatedProducts = [...selectedProducts];
    updatedProducts.splice(index, 1);
    setSelectedProducts(updatedProducts);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Only validate clientName
    if (!formData.clientName) {
      toast.error('Please enter client name');
      return;
    }

    if (selectedProducts.length === 0) {
      toast.error('Please add at least one product');
      return;
    }

    try {
      setLoading(true);
      
      // Get a valid relationship manager
      let defaultManager = null;
      
      // First try to get from managers list fetched separately
      if (managers && managers.length > 0) {
        defaultManager = managers[0]._id;
      } 
      // If no managers fetched separately, try to find one from users list
      else if (users && users.length > 0) {
        const managerUsers = users.filter(user => user.role === 'manager');
        if (managerUsers.length > 0) {
          defaultManager = managerUsers[0]._id;
        } else {
          // Last resort - use the first user regardless of role
          defaultManager = users[0]._id;
        }
      }
      
      // Final check - if we still don't have a manager, show error
      if (!defaultManager) {
        toast.error('No users available to assign as relationship manager');
        setLoading(false);
        return;
      }
      
      // Generate a temporary quotation number for frontend validation
      // Format: QT-YYMMDD-RAND where:
      // YY is the last 2 digits of the current year
      // MM is the current month (01-12)
      // DD is the current day (01-31)
      // RAND is a random 4-digit number
      const now = new Date();
      const year = now.getFullYear().toString().slice(-2);
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
      const tempQuotationNumber = `QT-${year}${month}${day}-${random}`;
      
      console.log('Creating quotation with relationship manager:', defaultManager);
      
      // Get the current user's ID for createdBy field
      const currentUserId = currentUser?._id;
      if (!currentUserId) {
        toast.error('User information not available. Please log in again.');
        setLoading(false);
        return;
      }
      
      const quotationData = {
        quotationNumber: tempQuotationNumber,
        createdBy: currentUserId,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone || undefined,
        clientAddress: formData.clientAddress || undefined,
        notes: formData.notes || undefined,
        relationshipManager: defaultManager,
        assignedUser: selectedUser || undefined,
        products: selectedProducts,
        subTotal,
        gstTotal,
        discountTotal,
        grandTotal,
        excludeTransport: formData.excludeTransport // Add this new field
      };

      console.log('Sending quotation data:', quotationData);

      const response = await createQuotation(quotationData);
      toast.success('Quotation created successfully');
      navigate(`/quotations/${response.data.data._id}`);
    } catch (error) {
      console.error('Error creating quotation:', error.response?.data || error);
      toast.error('Failed to create quotation: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Add these new functions
  const handleProductQuantityChange = async (index, newQuantity) => {
    const updatedProducts = [...selectedProducts];
    const product = updatedProducts[index];
    
    try {
      const response = await applyPricingRules([{
        ...product,
        quantity: newQuantity
      }]);

      const processedProduct = response.data.data[0];
      updatedProducts[index] = processedProduct;
      setSelectedProducts(updatedProducts);
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast.error('Failed to update quantity');
    }
  };

  const handleDiscountChange = (index, newDiscount) => {
    const updatedProducts = [...selectedProducts];
    const product = updatedProducts[index];
    
    const parsedDiscount = parseFloat(newDiscount) || 0;
    const newFinalPrice = (product.sellingPrice * product.quantity) + 
      (product.sellingPrice * product.quantity * product.gstPercentage / 100) - 
      parsedDiscount;

    updatedProducts[index] = {
      ...product,
      discount: parsedDiscount,
      finalPrice: newFinalPrice
    };
    
    setSelectedProducts(updatedProducts);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Create Quotation</h1>
      
      <form onSubmit={handleSubmit}>
        {/* Client Information */}
        <div className="bg-white rounded-xl shadow-md mb-6 p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Client Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                id="clientName"
                type="text"
                name="clientName"
                required
                value={formData.clientName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            
            <div>
              <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Client Email
              </label>
              <input
                id="clientEmail"
                type="email"
                name="clientEmail"
                value={formData.clientEmail}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            
            <div>
              <label htmlFor="clientPhone" className="block text-sm font-medium text-gray-700 mb-1">
                Client Phone
              </label>
              <input
                id="clientPhone"
                type="text"
                name="clientPhone"
                value={formData.clientPhone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            
            <div>
              <label htmlFor="assignUser" className="block text-sm font-medium text-gray-700 mb-1">
                Assign User
              </label>
              <select
                id="assignUser"
                name="assignUser"
                value={selectedUser}
                onChange={handleUserChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">None</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Select a user to assign this quotation to</p>
            </div>
            
            <div className="col-span-1 md:col-span-2">
              <label htmlFor="clientAddress" className="block text-sm font-medium text-gray-700 mb-1">
                Client Address
              </label>
              <textarea
                id="clientAddress"
                name="clientAddress"
                rows="2"
                value={formData.clientAddress}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              ></textarea>
            </div>
            
            <div className="col-span-1 md:col-span-2">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows="2"
                value={formData.notes}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              ></textarea>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl shadow-md mb-6 p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <h2 className="text-xl font-semibold text-gray-800">Products</h2>
            
            <div className="relative w-full md:w-auto">
              <input
                type="text"
                placeholder="Search products by name or SKU"
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full md:w-80 px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {searching && (
                <div className="absolute right-3 top-2.5">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"></div>
                </div>
              )}
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Search Results</h3>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price (₹)
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        GST %
                      </th>
                      <th scope="col" className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {searchResults.map((product) => (
                      <tr key={product._id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{product.sku}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{product.sellingPrice.toFixed(2)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 text-right">{product.gstPercentage}%</td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-center">
                          <button 
                            type="button"
                            onClick={() => handleProductSelect(product)}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-primary bg-primary/10 hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Selected Products */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Products</h3>
            
            {selectedProducts.length > 0 ? (
              <div className="border border-gray-200 rounded-md overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cost Price (₹)
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price (₹)
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        GST %
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Discount (₹)
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total (₹)
                      </th>
                      <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedProducts.map((product, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.sku}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                          <input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => handleProductQuantityChange(index, parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1 text-right border border-gray-300 rounded-md"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                          {product.costPrice?.toFixed(2) || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{product.sellingPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{product.gstPercentage}%</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.discount}
                            onChange={(e) => handleDiscountChange(index, e.target.value)}
                            className="w-24 px-2 py-1 text-right border border-gray-300 rounded-md"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{product.finalPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(index)}
                            className="text-danger hover:text-danger/80"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-gray-500">
                  No products added yet. Search and add products.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quotation Summary */}
        <div className="bg-white rounded-xl shadow-md mb-6 p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Quotation Summary</h2>
          
          <div className="flex justify-end">
            <div className="w-full md:w-64">
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Sub Total:</span>
                <span className="font-medium">₹{subTotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between py-2">
                <span className="text-gray-600">GST Total:</span>
                <span className="font-medium">₹{gstTotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Discount Total:</span>
                <span className="font-medium">₹{discountTotal.toFixed(2)}</span>
              </div>
              
              <div className="border-t border-gray-200 my-2"></div>
              
              <div className="flex justify-between py-2">
                <span className="text-gray-800 font-semibold">Grand Total:</span>
                <span className="text-gray-800 font-semibold">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Options - Exclude Transport Charges */}
        <div className="bg-white rounded-xl shadow-md mb-6 p-6 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Additional Options</h2>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="excludeTransport"
              name="excludeTransport"
              checked={formData.excludeTransport}
              onChange={(e) => setFormData({
                ...formData,
                excludeTransport: e.target.checked
              })}
              className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <label htmlFor="excludeTransport" className="ml-2 block text-sm text-gray-900">
              Exclude Transportation Charges
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end mt-6">
          <button
            type="submit"
            disabled={loading || selectedProducts.length === 0}
            className="px-6 py-2 bg-primary text-white rounded-md shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></span>
                Creating...
              </>
            ) : (
              'Create Quotation'
            )}
          </button>
        </div>
      </form>

      {/* Product Add Dialog */}
      {openProductDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add Product</h3>
              <button 
                type="button" 
                className="text-gray-400 hover:text-gray-500"
                onClick={() => setOpenProductDialog(false)}
              >
                <span className="sr-only">Close</span>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {selectedProduct && (
              <div className="mt-2">
                <p className="text-sm text-gray-500 mb-4">
                  {selectedProduct.name} ({selectedProduct.sku})
                </p>
                
                <div className="mb-4">
                  <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    min="1"
                    value={quantity}
                    onChange={handleQuantityChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit Price
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selectedProduct.sellingPrice}
                      onChange={(e) => setSelectedProduct({
                        ...selectedProduct,
                        sellingPrice: parseFloat(e.target.value) || 0,
                        finalPrice: (parseFloat(e.target.value) || 0) * quantity
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      GST
                    </label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                      {selectedProduct.gstPercentage}%
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-5 sm:mt-6 flex justify-end space-x-2">
              <button
                type="button"
                className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                onClick={() => setOpenProductDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                onClick={handleAddProduct}
              >
                Add to Quotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateQuotation;
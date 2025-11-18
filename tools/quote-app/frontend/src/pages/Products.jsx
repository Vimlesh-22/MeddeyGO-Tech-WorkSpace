import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { 
  Container,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Box,
  CircularProgress,
  TablePagination,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  DialogContentText,
  Grid,
  IconButton,
  FormControl,
  InputLabel,
  OutlinedInput,
  InputAdornment
} from '@mui/material';
import { 
  getAllProducts, 
  deleteProduct, 
  importProductsFromCSV,
  createProduct,
  updateProduct  // Add this import
} from '../services/api';

function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalProducts, setTotalProducts] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    imageUrl: '',
    costPrice: '',
    sellingPrice: '',
    gstPercentage: '18',
    productUrl: ''
  });
  const [editProduct, setEditProduct] = useState(null);

  const fetchProducts = async (page = 1, search = '') => {
    try {
      setLoading(true);
      const response = await getAllProducts(search, page, rowsPerPage);
      setProducts(response.data.data);
      setTotalProducts(response.data.total);
    } catch (error) {
      toast.error('Failed to fetch products');
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(page + 1, searchTerm);
  }, [page, rowsPerPage, searchTerm]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProduct(id);
        toast.success('Product deleted successfully');
        fetchProducts(page + 1, searchTerm);
      } catch (error) {
        toast.error('Failed to delete product');
        console.error('Error deleting product:', error);
      }
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(0);
  };

  const handleOpenImportDialog = () => {
    setOpenImportDialog(true);
  };

  const handleCloseImportDialog = () => {
    setOpenImportDialog(false);
    setSelectedFile(null);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Please select a CSV file');
      return;
    }

    if (selectedFile.type !== 'text/csv') {
      toast.error('Only CSV files are allowed');
      return;
    }

    try {
      setImporting(true);
      const response = await importProductsFromCSV(selectedFile);
      toast.success(response.data.message || 'Products imported successfully');
      fetchProducts(page + 1, searchTerm);
      handleCloseImportDialog();
    } catch (error) {
      toast.error('Failed to import products: ' + (error.response?.data?.message || error.message));
      console.error('Error importing products:', error);
    } finally {
      setImporting(false);
    }
  };

  const downloadSampleCSV = () => {
    const csvContent = 
      "SKU,Product Name,Image URL,Cost Price,Selling Price,GST%,Product URL\n" +
      "PROD001,Product 1,https://example.com/image1.jpg,100,150,18,https://example.com/product1\n" +
      "PROD002,Product 2,https://example.com/image2.jpg,200,250,12,https://example.com/product2\n" +
      "PROD003,Product 3,https://example.com/image3.jpg,300,350,5,https://example.com/product3";
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'sample_products.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenAddDialog = () => {
    setOpenAddDialog(true);
  };

  const handleCloseAddDialog = () => {
    setOpenAddDialog(false);
    setEditProduct(null);
    setNewProduct({
      sku: '',
      name: '',
      imageUrl: '',
      costPrice: '',
      sellingPrice: '',
      gstPercentage: '18',
      productUrl: ''
    });
  };

  const handleProductChange = (e) => {
    const { name, value } = e.target;
    setNewProduct(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddProduct = async () => {
    try {
      if (editProduct) {
        // Update existing product
        const response = await updateProduct(editProduct._id, newProduct);
        toast.success('Product updated successfully');
      } else {
        // Create new product
        const response = await createProduct(newProduct);
        toast.success('Product created successfully');
      }
      handleCloseAddDialog();
      fetchProducts(page + 1, searchTerm);
    } catch (error) {
      toast.error(editProduct ? 
        'Failed to update product: ' : 
        'Failed to create product: ' + 
        (error.response?.data?.message || error.message)
      );
    }
  };

  const handleOpenEditDialog = (product) => {
    setEditProduct(product);
    setNewProduct({
      sku: product.sku,
      name: product.name,
      imageUrl: product.imageUrl || '',
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      gstPercentage: product.gstPercentage.toString(),
      productUrl: product.productUrl || ''
    });
    setOpenAddDialog(true);
  };

  if (loading && products.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" gutterBottom>
          Products
        </Typography>
        <Box>
          <Button
            variant="contained"
            sx={{ mr: 2 }}
            onClick={handleOpenAddDialog}
          >
            Add Product
          </Button>
          <Button
            variant="outlined"
            onClick={handleOpenImportDialog}
          >
            Import Products
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Search Products"
            variant="outlined"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Enter SKU or product name"
            size="small"
          />
        </Grid>
      </Grid>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Cost Price (₹)</TableCell>
                <TableCell align="right">Selling Price (₹)</TableCell>
                <TableCell align="right">GST %</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.length > 0 ? (
                products.map((product) => (
                  <TableRow hover key={product._id}>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell align="right">{product.costPrice.toFixed(2)}</TableCell>
                    <TableCell align="right">{product.sellingPrice.toFixed(2)}</TableCell>
                    <TableCell align="right">{product.gstPercentage}%</TableCell>
                    <TableCell align="center">
                      <Button
                        color="primary"
                        size="small"
                        sx={{ mr: 1 }}
                        onClick={() => handleOpenEditDialog(product)}
                      >
                        Edit
                      </Button>
                      <Button
                        color="error"
                        size="small"
                        onClick={() => handleDelete(product._id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No products found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={totalProducts}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Import Dialog */}
      <Dialog open={openImportDialog} onClose={handleCloseImportDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Import Products from CSV</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" gutterBottom>
              Upload a CSV file with the following columns:
            </Typography>
            <Typography variant="body2" component="pre" sx={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              p: 1, 
              borderRadius: 1,
              fontFamily: 'monospace',
              overflowX: 'auto'
            }}>
              SKU, Product Name, Image URL, Cost Price, Selling Price, GST%, Product URL
            </Typography>
            <Box sx={{ mt: 2, mb: 2 }}>
              <Button 
                variant="outlined" 
                size="small"
                onClick={downloadSampleCSV}
              >
                Download Sample CSV
              </Button>
            </Box>
            <input
              accept=".csv"
              style={{ display: 'none' }}
              id="csv-file-input"
              type="file"
              onChange={handleFileChange}
            />
            <label htmlFor="csv-file-input">
              <Button 
                variant="contained" 
                component="span" 
                fullWidth
                sx={{ mt: 1, mb: 1 }}
              >
                Select CSV File
              </Button>
            </label>
            {selectedFile && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Selected file: {selectedFile.name}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseImportDialog}>Cancel</Button>
          <Button 
            onClick={handleImport} 
            variant="contained"
            disabled={importing || !selectedFile}
          >
            {importing ? <CircularProgress size={24} /> : 'Import Products'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={openAddDialog} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Fill in the product details below. Fields marked with * are required.
          </DialogContentText>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                name="sku"
                label="SKU"
                value={newProduct.sku}
                onChange={handleProductChange}
                margin="normal"
                size="small"
                disabled={editProduct} // Disable SKU editing for existing products
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="name"
                label="Product Name"
                value={newProduct.name}
                onChange={handleProductChange}
                margin="normal"
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal" size="small">
                <InputLabel>Cost Price (₹) *</InputLabel>
                <OutlinedInput
                  required
                  name="costPrice"
                  type="number"
                  value={newProduct.costPrice}
                  onChange={handleProductChange}
                  startAdornment={<InputAdornment position="start">₹</InputAdornment>}
                  label="Cost Price (₹)"
                />
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal" size="small">
                <InputLabel>Selling Price (₹) *</InputLabel>
                <OutlinedInput
                  required
                  name="sellingPrice"
                  type="number"
                  value={newProduct.sellingPrice}
                  onChange={handleProductChange}
                  startAdornment={<InputAdornment position="start">₹</InputAdornment>}
                  label="Selling Price (₹)"
                />
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                name="gstPercentage"
                label="GST %"
                type="number"
                value={newProduct.gstPercentage}
                onChange={handleProductChange}
                margin="normal"
                size="small"
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="imageUrl"
                label="Image URL"
                value={newProduct.imageUrl}
                onChange={handleProductChange}
                margin="normal"
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="productUrl"
                label="Product URL"
                value={newProduct.productUrl}
                onChange={handleProductChange}
                margin="normal"
                size="small"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>Cancel</Button>
          <Button 
            onClick={handleAddProduct}
            variant="contained"
            disabled={!newProduct.sku || !newProduct.name || !newProduct.costPrice || !newProduct.sellingPrice}
          >
            {editProduct ? 'Update Product' : 'Add Product'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Products;
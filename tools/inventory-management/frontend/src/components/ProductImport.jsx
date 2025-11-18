import { useState } from 'react';
import { notify } from '../utils/notify';
// CSV handling imports removed
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  MenuItem,
  Stack,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '../config';

function ProductImport({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  // Removed vendor selection state
  const queryClient = useQueryClient();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await axios.get(`${API_BASE_URL}/vendors`);
      return response.data;
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      // Convert preview data to CSV
      const csvContent = [
        ['SKU', 'Product Name', 'Vendor', 'Price', 'Notes'].join(','),
        ...preview.map(row => [
          row.SKU,
          row['Product Name'],
          row.Vendor,
          row.Price,
          row.Notes || ''
        ].map(field => `"${field?.toString().replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // Create a Blob and FormData
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const formData = new FormData();
      formData.append('file', blob, 'products.csv');

      const response = await axios.post(`${API_BASE_URL}/products/import`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        if (data.errors && data.errors.length > 0) {
          notify(`Import completed with some errors:\n${data.errors.map(e => `${e.sku}: ${e.error}`).join('\n')}`, 'warning', 6000);
        } else {
          notify(`Successfully imported ${data.success ? data.success.length : 0} products`, 'success');
          // Force refresh the products list
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }, 500);
        }
        onClose();
    },
    onError: (error) => {
        notify('Failed to import products: ' + error.message, 'error');
    }
  });

  // Bulk map vendor functionality removed as requested

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // Improved CSV parsing that handles quotes correctly
        const parseCSV = (text) => {
          const rows = [];
          let row = [];
          let currentCell = '';
          let inQuotes = false;
          
          for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            
            // Handle quotes
            if (char === '"') {
              if (!inQuotes) {
                inQuotes = true;
              } else if (nextChar === '"') {
                // Double quotes inside quotes
                currentCell += '"';
                i++; // Skip the next quote
              } else {
                inQuotes = false;
              }
              continue;
            }
            
            // Handle commas
            if (char === ',' && !inQuotes) {
              row.push(currentCell.trim());
              currentCell = '';
              continue;
            }
            
            // Handle newlines
            if (char === '\n' && !inQuotes) {
              row.push(currentCell.trim());
              rows.push([...row]);
              row = [];
              currentCell = '';
              continue;
            }
            
            // Add character to current cell
            currentCell += char;
            
            // If last character, add the final cell and row
            if (i === text.length - 1) {
              row.push(currentCell.trim());
              rows.push([...row]);
            }
          }
          
          return rows;
        };
        
        const parsedRows = parseCSV(text);
        const headers = parsedRows[0];
        
        const jsonData = parsedRows.slice(1)
          .filter(row => row.some(cell => cell.trim())) // Skip empty rows
          .map(row => {
            return headers.reduce((obj, header, index) => {
              obj[header] = row[index] || '';
              return obj;
            }, {});
          });
        
        setPreview(jsonData);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    await importMutation.mutateAsync();
  };

  // Bulk map handler removed as requested

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Import Products</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => window.open(`${API_BASE_URL}/products/template`, '_blank')}
              sx={{ height: 40, minWidth: 140 }}
            >
              Download Template
            </Button>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="product-import-file"
            />
            <label htmlFor="product-import-file">
              <Button 
                variant="contained" 
                component="span"
                sx={{ height: 40, minWidth: 100 }}
              >
                Choose File
              </Button>
            </label>
            {file && (
              <Typography variant="body2" color="textSecondary">
                {file.name}
              </Typography>
            )}
          </Stack>
          {preview.length > 0 && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Preview
              </Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Product Name</TableCell>
                      <TableCell>Vendor</TableCell>
                      <TableCell>Price</TableCell>
                      <TableCell>Notes</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.SKU}</TableCell>
                        <TableCell>{row['Product Name']}</TableCell>
                        <TableCell>{row.Vendor}</TableCell>
                        <TableCell>{row.Price}</TableCell>
                        <TableCell>{row.Notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Bulk map vendor form removed as requested */}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button 
          onClick={onClose}
          sx={{ height: 40, minWidth: 80 }}
        >
          Cancel
        </Button>
        {/* Bulk map button removed as requested */}
        {preview.length > 0 && (
          <Button 
            onClick={handleImport} 
            variant="contained" 
            color="primary"
            sx={{ height: 40, minWidth: 120 }}
          >
            Import Products
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ProductImport;

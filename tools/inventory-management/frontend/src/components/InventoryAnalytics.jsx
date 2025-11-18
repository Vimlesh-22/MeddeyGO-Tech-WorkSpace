import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import * as XLSX from 'xlsx';

export default function InventoryAnalytics() {
  const [location, setLocation] = useState('Okhla');
  const [transactionType, setTransactionType] = useState('Sales');
  const [limit, setLimit] = useState(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [topItems, setTopItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataQuality, setDataQuality] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    loadTopItems();
    loadDataQuality();
  }, [location, transactionType, limit, startDate, endDate]);

  const loadTopItems = async () => {
    setLoading(true);
    try {
      const params = {
        location,
        transactionType,
        limit
      };
      
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      
      const response = await axios.get(`${API_BASE_URL}/inventory/analytics/top-items`, { params });
      
      if (response.data.success) {
        setTopItems(response.data.items || []);
        
        // Prepare chart data
        const chartData = response.data.items.slice(0, 10).map((item, index) => ({
          name: item.sku,
          value: item.totalQuantity,
          rank: index + 1
        }));
        setChartData(chartData);
      }
    } catch (error) {
      console.error('Error loading top items:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDataQuality = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/inventory/analytics/data-quality`, {
        params: { location }
      });
      
      if (response.data.success) {
        setDataQuality(response.data);
      }
    } catch (error) {
      console.error('Error loading data quality:', error);
    }
  };

  const handleExport = () => {
    const exportData = topItems.map(item => ({
      'Rank': topItems.indexOf(item) + 1,
      'SKU': item.sku,
      'Product Name': item.productName,
      'Total Quantity': item.totalQuantity,
      'Transaction Count': item.transactionCount,
      'Locations': item.locations.join(', '),
      'Date Range': item.dates.join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Top Items Analysis');
    XLSX.writeFile(wb, `Top_${transactionType}_${location}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportDataQuality = () => {
    if (!dataQuality) return;
    
    const exportData = [];
    
    Object.entries(dataQuality.issues).forEach(([issueType, items]) => {
      items.forEach(item => {
        exportData.push({
          'Issue Type': issueType,
          'SKU': item.sku,
          'Product Name': item.productName || 'N/A',
          'Row': item.rowIndex
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Quality Report');
    XLSX.writeFile(wb, `Data_Quality_${location}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
      <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Inventory Analytics</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => {
              window.open(`${API_BASE_URL}/inventory/export/analytics?location=${location}`, '_blank');
            }}
            disabled={topItems.length === 0}
          >
            Export Analytics
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => {
              loadTopItems();
              loadDataQuality();
            }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
            <InputLabel>Location</InputLabel>
            <Select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              label="Location"
            >
              <MenuItem value="Okhla">Okhla</MenuItem>
              <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl fullWidth>
            <InputLabel>Transaction Type</InputLabel>
            <Select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              label="Transaction Type"
            >
              <MenuItem value="Sales">Sales</MenuItem>
              <MenuItem value="Purchase">Purchase</MenuItem>
              <MenuItem value="Return">Return</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField
            fullWidth
            type="number"
            label="Limit"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
          />
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField
            fullWidth
            type="date"
            label="Start Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField
            fullWidth
            type="date"
            label="End Date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
      </Grid>

      {/* Top Items Table */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Top {limit} {transactionType} Items - {location}</Typography>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={loading || topItems.length === 0}
          >
            Export
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Rank</TableCell>
                  <TableCell><strong>SKU</strong></TableCell>
                  <TableCell><strong>Product Name</strong></TableCell>
                  <TableCell align="right"><strong>Total Quantity</strong></TableCell>
                  <TableCell align="center"><strong>Transactions</strong></TableCell>
                  <TableCell align="center"><strong>Locations</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No data available
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  topItems.map((item, index) => (
                    <TableRow key={item.sku} hover>
                      <TableCell>
                        <Chip label={index + 1} color="primary" size="small" />
                      </TableCell>
                      <TableCell><strong>{item.sku}</strong></TableCell>
                      <TableCell>{item.productName || 'N/A'}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary" fontWeight="bold">
                          {item.totalQuantity}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">{item.transactionCount}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={item.locations.join(', ')} 
                          size="small" 
                          color="secondary"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Data Quality Report */}
      {dataQuality && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Data Quality Report - {location}</Typography>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportDataQuality}
            >
              Export Report
            </Button>
          </Box>

          <Box sx={{ p: 2 }}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="h4" color="error">
                      {dataQuality.summary.missingProductName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Missing Product Names
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="h4" color="warning.main">
                      {dataQuality.summary.missingSafetyStock}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Missing Safety Stock
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="h4" color="info.main">
                      {dataQuality.summary.missingAvailable}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Missing Available Qty
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Typography variant="h4" color="text.secondary">
                      {dataQuality.summary.zeroQuantity}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Zero Quantity Items
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {dataQuality.totalSkus > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Total SKUs in {location}: {dataQuality.totalSkus}
              </Alert>
            )}
          </Box>
        </Paper>
      )}
    </Box>
  );
}


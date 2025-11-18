import { useEffect, useState } from 'react';
import { Box, Table, TableHead, TableRow, TableCell, TableBody, Pagination, Stack, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export default function OrderHistoryView() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({ transactionType: '', location: '' });

  const load = async (p, f) => {
    const pageVal = p ?? page;
    const filterVal = f ?? filters;
    const res = await axios.get(`${API_BASE_URL}/inventory/order-history`, {
      params: { page: pageVal, limit: 20, ...filterVal }
    });
    setRows(res.data?.transactions || []);
    setPages(res.data?.pagination?.pages || 1);
  };

  useEffect(() => { load(1, filters); }, [filters]);

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small">
          <InputLabel>Type</InputLabel>
          <Select label="Type" value={filters.transactionType} onChange={(e) => setFilters(f => ({ ...f, transactionType: e.target.value }))} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="Purchase">Purchase</MenuItem>
            <MenuItem value="Sales">Sales</MenuItem>
            <MenuItem value="Return">Return</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Location</InputLabel>
          <Select label="Location" value={filters.location} onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))} sx={{ minWidth: 160 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="Okhla">Okhla</MenuItem>
            <MenuItem value="Bahadurgarh">Bahadurgarh</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Order</TableCell>
            <TableCell>SKU</TableCell>
            <TableCell>Product</TableCell>
            <TableCell>Qty</TableCell>
            <TableCell>Vendor</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.flatMap(row => (row.items || []).map((it, idx) => (
            <TableRow key={`${row._id}-${idx}`}>
              <TableCell>{new Date(row.transactionDate).toLocaleDateString()}</TableCell>
              <TableCell>{row.transactionType}</TableCell>
              <TableCell>{row.location}</TableCell>
              <TableCell>{it.orderId?.orderName || '-'}</TableCell>
              <TableCell>{it.sku}</TableCell>
              <TableCell>{it.productName}</TableCell>
              <TableCell>{it.quantity}</TableCell>
              <TableCell>{it.vendor?.name || '-'}</TableCell>
            </TableRow>
          )))}
        </TableBody>
      </Table>

      <Stack alignItems="center" sx={{ mt: 2 }}>
        <Pagination count={pages} page={page} onChange={(_, p) => { setPage(p); load(p); }} />
      </Stack>
    </Box>
  );
}



import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  IconButton,
  TablePagination,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material';
import { getAllQuotations, deleteQuotation, exportQuotations } from '../services/api';

function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const fetchQuotations = async (search = '') => {
    try {
      setLoading(true);
      const response = await getAllQuotations(search);
      setQuotations(response.data.data);
    } catch (error) {
      toast.error('Failed to fetch quotations');
      console.error('Error fetching quotations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (searchValue) => {
    setSearchTerm(searchValue);
    setSearchLoading(true);
    try {
      const response = await getAllQuotations(searchValue);
      setQuotations(response.data.data);
      setPage(0); // Reset to first page when searching
    } catch (error) {
      toast.error('Failed to search quotations');
      console.error('Error searching quotations:', error);
      // Keep the current quotations if search fails
    } finally {
      setSearchLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    fetchQuotations();
    setPage(0);
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExport = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user || !user.token) {
        toast.error('Please log in to export quotations');
        return;
      }
      exportQuotations();
      toast.success('Exporting quotations');
    } catch (error) {
      toast.error('Failed to export quotations: ' + (error.message || 'Unknown error'));
      console.error('Error exporting quotations:', error);
    }
  };

  // Debounced search function - only triggers when user stops typing
  const debouncedSearch = (() => {
    let timeoutId;
    return (searchValue) => {
      clearTimeout(timeoutId);
      setIsDebouncing(true);
      timeoutId = setTimeout(() => {
        setIsDebouncing(false);
        if (searchValue.trim() === '') {
          handleClearSearch();
        } else if (searchValue.trim().length >= 2) {
          // Only search if search term is at least 2 characters
          handleSearch(searchValue);
        }
             }, 1000); // 1000ms (1 second) delay - wait for user to stop typing
    };
  })();

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this quotation?')) {
      try {
        await deleteQuotation(id);
        toast.success('Quotation deleted successfully');
        fetchQuotations();
      } catch (error) {
        toast.error('Failed to delete quotation');
        console.error('Error deleting quotation:', error);
      }
    }
  };

  const getStageChipColor = (stage) => {
    switch (stage) {
      case 'Initial':
        return 'info';
      case 'Negotiation':
        return 'warning';
      case 'On Hold':
        return 'secondary';
      case 'Win':
        return 'success';
      case 'Lost':
        return 'error';
      default:
        return 'default';
    }
  };

  const filteredQuotations = quotations.filter(quotation => {
    if (filter === 'all') return true;
    return quotation.stage === filter;
  });

  // Show search results count
  const searchResultsCount = searchTerm ? quotations.length : null;

  if (loading) {
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
          Quotations
        </Typography>
        <Box>
          <Button
            variant="outlined"
            sx={{ mr: 2 }}
            onClick={handleExport}
          >
            Export All
          </Button>
          <Button
            variant="contained"
            component={Link}
            to="/quotations/create"
          >
            Create Quotation
          </Button>
        </Box>
      </Box>

      <Box mb={3} display="flex" gap={2} alignItems="center" flexWrap="wrap">
                 <TextField
           placeholder="Search by quotation number or customer name... (type to search)"
           value={searchTerm}
           onChange={(e) => {
             setSearchTerm(e.target.value);
             debouncedSearch(e.target.value);
           }}
           InputProps={{
             startAdornment: (
               <InputAdornment position="start">
                 {searchLoading ? <CircularProgress size={20} /> : <SearchIcon />}
               </InputAdornment>
             ),
             endAdornment: (
               <InputAdornment position="end">
                 {isDebouncing && searchTerm && searchTerm.length >= 2 && (
                   <CircularProgress size={16} sx={{ mr: 1 }} />
                 )}
                 {searchTerm && (
                   <IconButton
                     size="small"
                     onClick={handleClearSearch}
                     edge="end"
                     title="Clear search"
                   >
                     <ClearIcon />
                   </IconButton>
                 )}
               </InputAdornment>
             ),
           }}
           sx={{ minWidth: 350 }}
           size="small"
           helperText={
             searchTerm && searchTerm.length < 2 
               ? "Type at least 2 characters to search" 
               : isDebouncing && searchTerm && searchTerm.length >= 2
               ? "Searching..."
               : ""
           }
         />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel id="stage-filter-label">Filter by Stage</InputLabel>
          <Select
            labelId="stage-filter-label"
            id="stage-filter"
            value={filter}
            label="Filter by Stage"
            onChange={(e) => setFilter(e.target.value)}
            size="small"
          >
            <MenuItem value="all">All Stages</MenuItem>
            <MenuItem value="Initial">Initial</MenuItem>
            <MenuItem value="Negotiation">Negotiation</MenuItem>
            <MenuItem value="On Hold">On Hold</MenuItem>
            <MenuItem value="Win">Win</MenuItem>
            <MenuItem value="Lost">Lost</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {searchResultsCount !== null && (
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary">
            Found {searchResultsCount} quotation{searchResultsCount !== 1 ? 's' : ''} for "{searchTerm}"
          </Typography>
        </Box>
      )}
      
      {filteredQuotations.length > 0 ? (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Quotation #</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Stage</TableCell>
                  <TableCell>Assigned To</TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredQuotations
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((quotation) => (
                    <TableRow hover key={quotation._id}>
                      <TableCell>{quotation.quotationNumber}</TableCell>
                      <TableCell>{quotation.clientName}</TableCell>
                      <TableCell>
                        {new Date(quotation.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={quotation.stage} 
                          color={getStageChipColor(quotation.stage)}
                        />
                      </TableCell>
                      <TableCell>
                        {quotation.assignedUser ? (
                          <Chip 
                            label={quotation.assignedUser.name}
                            size="small"
                            color="primary"
                            variant="outlined"
                            title={`${quotation.assignedUser.name} (${quotation.assignedUser.email})`}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Unassigned
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>₹{quotation.grandTotal.toFixed(2)}</TableCell>
                      <TableCell align="center">
                        <Button 
                          component={Link} 
                          to={`/quotations/${quotation._id}`}
                          size="small"
                          sx={{ mr: 1 }}
                        >
                          View
                        </Button>
                        {/* Add Edit Button */}
                        <Button 
                          component={Link}
                          to={`/quotations/${quotation._id}/edit`}
                          size="small"
                          color="primary"
                          sx={{ mr: 1 }}
                        >
                          Edit
                        </Button>
                        <Button 
                          color="error" 
                          size="small"
                          onClick={() => handleDelete(quotation._id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={filteredQuotations.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" gutterBottom>
            {searchTerm 
              ? `No quotations found for "${searchTerm}". Try a different search term.`
              : 'No quotations found.'
            }
          </Typography>
          {!searchTerm && (
            <Button 
              variant="contained" 
              component={Link} 
              to="/quotations/create"
            >
              Create Your First Quotation
            </Button>
          )}
        </Paper>
      )}
    </Container>
  );
}

export default Quotations;
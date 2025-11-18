import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import FormControlLabel from '@mui/material/FormControlLabel';

export default function DateMappingDialog({ open, missingDates, existingDates, onConfirm, onCancel }) {
  const [mappingMode, setMappingMode] = useState('single'); // 'single' or 'individual'
  const [singleDateMapping, setSingleDateMapping] = useState('');
  const [individualMappings, setIndividualMappings] = useState({});

  // Initialize individual mappings
  React.useEffect(() => {
    if (mappingMode === 'individual' && missingDates && missingDates.length > 0) {
      const initialMappings = {};
      missingDates.forEach(date => {
        initialMappings[date] = existingDates[0] || '';
      });
      setIndividualMappings(initialMappings);
    }
  }, [mappingMode, missingDates, existingDates]);

  const handleConfirm = () => {
    if (mappingMode === 'single') {
      if (!singleDateMapping) {
        alert('Please select a date to map all missing dates to');
        return;
      }
      const mappings = {};
      missingDates.forEach(date => {
        mappings[date] = singleDateMapping;
      });
      onConfirm(mappings);
    } else {
      // Check all dates are mapped
      const allMapped = missingDates.every(date => individualMappings[date]);
      if (!allMapped) {
        alert('Please map all missing dates to existing dates');
        return;
      }
      onConfirm(individualMappings);
    }
  };

  const handleIndividualMappingChange = (missingDate, existingDate) => {
    setIndividualMappings({
      ...individualMappings,
      [missingDate]: existingDate
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="md" fullWidth>
      <DialogTitle>Map Missing Dates</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Some dates in your import are not found in the sheet. Please map them to existing dates:
          </Typography>

          <FormControl component="fieldset" sx={{ mt: 3 }}>
            <FormLabel component="legend">Mapping Mode</FormLabel>
            <RadioGroup
              value={mappingMode}
              onChange={(e) => setMappingMode(e.target.value)}
            >
              <FormControlLabel
                value="single"
                control={<Radio />}
                label="Map all missing dates to one date"
              />
              <FormControlLabel
                value="individual"
                control={<Radio />}
                label="Map each date individually"
              />
            </RadioGroup>
          </FormControl>

          {mappingMode === 'single' ? (
            <Box sx={{ mt: 3 }}>
              <FormControl fullWidth>
                <Select
                  value={singleDateMapping}
                  onChange={(e) => setSingleDateMapping(e.target.value)}
                  displayEmpty
                >
                  <MenuItem value="" disabled>Select a date</MenuItem>
                  {existingDates.map(date => (
                    <MenuItem key={date} value={date}>{date}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          ) : (
            <Box sx={{ mt: 3 }}>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Missing Date</strong></TableCell>
                      <TableCell><strong>Map To Existing Date</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {missingDates.map(date => (
                      <TableRow key={date}>
                        <TableCell>{date}</TableCell>
                        <TableCell>
                          <Select
                            value={individualMappings[date] || ''}
                            onChange={(e) => handleIndividualMappingChange(date, e.target.value)}
                            size="small"
                            fullWidth
                          >
                            <MenuItem value="" disabled>Select</MenuItem>
                            {existingDates.map(existingDate => (
                              <MenuItem key={existingDate} value={existingDate}>
                                {existingDate}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" color="warning.main">
              <strong>Note:</strong> All missing dates in your import will be mapped to the selected existing dates on the Google Sheet.
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary">
          Confirm Mapping
        </Button>
      </DialogActions>
    </Dialog>
  );
}


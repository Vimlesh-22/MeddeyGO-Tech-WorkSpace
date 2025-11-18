import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Button,
  Grid,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  GetApp as GetAppIcon,
} from '@mui/icons-material';

const stages = ['Initial', 'Hold', 'Processed', 'Pending', 'Completed', 'In-Stock'];

const getStatusColor = (status) => {
  const colors = {
    Paid: 'success',
    Pending: 'warning',
    Failed: 'error',
    Refunded: 'info',
    Fulfilled: 'success',
    'Partially Fulfilled': 'warning',
    Unfulfilled: 'error',
    Cancelled: 'default',
  };
  return colors[status] || 'default';
};

function StageBoard({ orders, onViewOrder, onMapVendors, onGeneratePdf }) {
  const getStageOrders = (stage) => {
    return orders.filter(order => order.stage === stage);
  };

  const OrderCard = ({ order }) => (
    <Card sx={{ mb: 1 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {order.orderName}
        </Typography>
        <Stack spacing={1}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Items: {order.items?.length || 0}
            </Typography>
            {order.items?.some((item) => !item.vendor) && (
              <Chip
                label="Unmapped Items"
                color="warning"
                size="small"
                sx={{ ml: 1 }}
              />
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`Payment: ${order.paymentStatus}`}
              size="small"
              color={getStatusColor(order.paymentStatus)}
            />
            <Chip
              label={`Fulfillment: ${order.fulfillmentStatus}`}
              size="small"
              color={getStatusColor(order.fulfillmentStatus)}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton size="small" onClick={() => onViewOrder(order)}>
              <VisibilityIcon />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              onClick={() => onMapVendors(order)}
            >
              Map Vendors
            </Button>
            {order.stage === 'Processed' && (
              <IconButton
                size="small"
                onClick={() => onGeneratePdf(order.items[0]?.vendor, [order._id])}
              >
                <GetAppIcon />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );

  return (
    <Grid container spacing={2}>
      {stages.map((stage) => (
        <Grid item xs={12} sm={6} md={4} lg={2} key={stage}>
          <Paper
            sx={{
              p: 2,
              height: '100%',
              backgroundColor: 'var(--card)',
              color: 'var(--card-foreground)',
              border: '1px solid var(--border)',
              minHeight: '70vh',
              transition: 'all var(--transition-speed) var(--transition-ease)',
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ color: 'var(--foreground)' }}>
              {stage}
              <Chip
                label={getStageOrders(stage).length}
                size="small"
                sx={{ ml: 1, backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              />
            </Typography>
            <Box sx={{ mt: 2 }}>
              {getStageOrders(stage).map((order) => (
                <OrderCard key={order._id} order={order} />
              ))}
            </Box>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

export default StageBoard;

# Quote Management Application

A full-stack web application for managing quotations, built with React, Express, and MongoDB.

## Features

- **User Authentication**: Login/logout functionality with role-based access (Admin, Manager, User)
- **Quotation Management**: Create, view, edit, and delete quotations
- **Product Management**: Import products from CSV and manage product catalog
- **Pricing Rules**: Define discount rules based on product quantity
- **PDF Generation**: Convert quotations to downloadable PDFs
- **Data Export**: Export quotation data to CSV format

## Tech Stack

- **Frontend**: React with Vite, Material-UI
- **Backend**: Express.js
- **Database**: MongoDB
- **Authentication**: JWT
- **PDF Generation**: PDFKit
- **CSV Parsing**: csv-parser

## Setup Instructions

### Prerequisites

- Node.js (v14+)
- MongoDB (local instance or MongoDB Atlas)

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the backend directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/quote_app
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRE=7d
   ```

4. Seed the database with initial admin and manager users:
   ```
   npm run seed
   ```

5. Start the backend server:
   ```
   npm run dev
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the frontend development server:
   ```
   npm run dev
   ```

## Usage

1. Access the application at `http://localhost:5173`

2. Login with the following credentials:
   - Admin: email: `admin@example.com`, password: `admin123`
   - Manager: email: `manager@example.com`, password: `manager123`

3. As an admin, you can:
   - Manage users
   - Create and manage quotations
   - Import and manage products
   - Define pricing rules

4. As a manager, you can:
   - Create and manage quotations
   - Import and manage products
   - Define pricing rules

## CSV Import Format

When importing products from CSV, use the following column headers:

```
SKU, Product Name, Image URL, Cost Price, Selling Price, GST%, Product URL
```

Example:
```
PROD001,Product 1,https://example.com/image1.jpg,100,150,18,https://example.com/product1
```

## Creating a Quotation

1. Navigate to "Create Quotation" page
2. Fill in client information
3. Search for products by SKU or name
4. Add products to the quotation
5. Submit the quotation

## Searching Quotations

The quotations page includes a powerful search feature that allows you to:

- **Search by Quotation Number**: Find quotations using their unique quotation number (e.g., "QT-2412-0001")
- **Search by Customer Name**: Find quotations by typing part of the customer's name
- **Real-time Search**: Results update automatically as you type (with a 500ms delay)
- **Clear Search**: Use the clear button (X) to reset the search and view all quotations
- **Search Results Count**: See how many quotations match your search criteria
- **Combined with Filters**: Search works together with the stage filter for precise results

### Search Tips:
- Search is case-insensitive
- Partial matches are supported (e.g., typing "john" will find "John Smith")
- Minimum 2 characters required for search to activate
- Search triggers automatically when you stop typing (1 second delay)
- Visual indicators show when search is being processed
- Search results are sorted by newest first

## Pricing Rules

Pricing rules allow you to define discounts based on product quantity. For example:

- If quantity >= 5, apply 10% discount
- If quantity >= 10, apply 15% discount

These discounts are automatically applied when creating quotations. 
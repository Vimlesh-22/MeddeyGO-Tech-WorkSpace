const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Function to create admin user
const createAdminUser = async () => {
  try {
    // Check if admin already exists
    const adminExists = await User.findOne({ email: 'marketing@meddey.com' });
    
    if (adminExists) {
      console.log('Admin user already exists');
      return;
    }
    
    // Create admin user
    const admin = await User.create({
      name: 'Admin User',
      email: 'marketing@meddey.com',
      password: 'Amit@#@$201424@#',
      role: 'admin',
    });
    
    console.log('Admin user created successfully');
    console.log('Email: marketing@meddey.com');
    console.log('Password: Amit@#@$201424@#');
    
    // Create a manager user
    const manager = await User.create({
      name: 'Manager User',
      email: 'manager@example.com',
      password: 'manager123',
      role: 'manager',
    });
    
    console.log('\nManager user created successfully');
    console.log('Email: manager@example.com');
    console.log('Password: manager123');
    
  } catch (error) {
    console.error('Error creating users:', error);
  } finally {
    // Disconnect from MongoDB
    mongoose.disconnect();
  }
};

// Run the function
createAdminUser(); 
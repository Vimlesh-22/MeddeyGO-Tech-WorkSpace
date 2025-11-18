const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Set strictQuery to false to prepare for Mongoose 7
    mongoose.set('strictQuery', false);

    // Add connection options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const mongoUri = process.env.QUOTE_MONGODB_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      const msg = 'MONGODB_URI or QUOTE_MONGODB_URI must be set';
      console.error(`[Quote App] ${msg}`);
      throw new Error(msg);
    }

    const conn = await mongoose.connect(mongoUri, options);
    console.log(`[Quote App] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Don't exit process, let the calling code handle the error
    throw error;
  }
};

module.exports = connectDB;
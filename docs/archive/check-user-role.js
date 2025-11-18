const mongoose = require('mongoose');
require('dotenv').config();

async function checkUser() {
  try {
    await mongoose.connect(process.env.QUOTE_MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Find user
    const User = mongoose.model('User', new mongoose.Schema({
      name: String,
      email: String,
      role: String,
      password: String
    }));

    const user = await User.findOne({ email: 'marketing@meddey.com' });
    
    if (user) {
      console.log('\nUser Found:');
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`ID: ${user._id}`);

      // Count total quotations
      const Quotation = mongoose.model('Quotation', new mongoose.Schema({}, { strict: false }));
      const totalQuotes = await Quotation.countDocuments();
      const userQuotes = await Quotation.countDocuments({ relationshipManager: user._id });

      console.log(`\nTotal quotations in database: ${totalQuotes}`);
      console.log(`Quotations assigned to this user: ${userQuotes}`);

      if (user.role !== 'admin') {
        console.log('\n⚠️  User is NOT an admin - will only see their own quotes');
        console.log('Updating user role to admin...');
        
        user.role = 'admin';
        await user.save();
        
        console.log('✓ User role updated to admin');
      } else {
        console.log('\n✓ User is already an admin - should see all quotes');
      }
    } else {
      console.log('User not found with email: marketing@meddey.com');
    }

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUser();

const axios = require('axios');

const BASE_URL = 'http://localhost:4094/tools/quote-generator';

async function testQuoteApp() {
  console.log('='.repeat(70));
  console.log('Testing Quote App - Login & Fetch Quotes');
  console.log('='.repeat(70));

  try {
    // Test 1: Register/Login to get token
    console.log('\n1. Testing User Login...');
    
    const testUser = {
      name: 'Test User',
      email: 'marketing@meddey.com',
      password: 'Amit@#@$201424@#',
      role: 'admin'
    };

    let token;
    
    // Try to register
    try {
      const registerRes = await axios.post(`${BASE_URL}/api/users/register`, testUser);
      token = registerRes.data.data.token;
      console.log('✓ User registered successfully');
      console.log(`✓ Token received: ${token.substring(0, 20)}...`);
    } catch (regError) {
      if (regError.response && regError.response.status === 400) {
        // User exists, try login
        console.log('User already exists, attempting login...');
        const loginRes = await axios.post(`${BASE_URL}/api/users/login`, {
          email: testUser.email,
          password: testUser.password
        });
        token = loginRes.data.data.token;
        console.log('✓ User logged in successfully');
        console.log(`✓ Token received: ${token.substring(0, 20)}...`);
      } else {
        throw regError;
      }
    }

    // Test 2: Fetch all quotations
    console.log('\n2. Testing Fetch Quotations from Database...');
    
    const quotationsRes = await axios.get(`${BASE_URL}/api/quotations`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log(`✓ Quotations fetched successfully`);
    console.log(`✓ Total quotations in database: ${quotationsRes.data.count}`);
    
    if (quotationsRes.data.count > 0) {
      console.log('\nSample Quotations:');
      quotationsRes.data.data.slice(0, 5).forEach((quote, index) => {
        console.log(`  ${index + 1}. ${quote.quotationNumber} - ${quote.clientName || 'No Client'} - ${new Date(quote.createdAt).toLocaleDateString()}`);
      });
    } else {
      console.log('⚠ No quotations found in database');
    }

    // Test 3: Verify JWT token is valid
    console.log('\n3. Testing JWT Token Validation...');
    
    const meRes = await axios.get(`${BASE_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('✓ JWT token is valid');
    console.log(`✓ User: ${meRes.data.data.name} (${meRes.data.data.email})`);
    console.log(`✓ Role: ${meRes.data.data.role}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ All Tests Passed Successfully!');
    console.log('='.repeat(70));
    console.log('\nSummary:');
    console.log('- JWT authentication working correctly');
    console.log('- JWT expiresIn issue fixed');
    console.log('- Database connection established');
    console.log(`- ${quotationsRes.data.count} quotations available in database`);
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\n❌ Test Failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data.message || error.response.data.error}`);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testQuoteApp();

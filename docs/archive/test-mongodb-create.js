const { MongoClient } = require('mongodb');

const uri = "mongodb://admin:StrongPassword123!@129.154.246.226:27017/admin";

async function createTestCollection() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");
    
    const db = client.db('admin');
    
    // Create a test collection with a sample document
    const collectionName = 'test_collection';
    const collection = db.collection(collectionName);
    
    // Insert a test document
    const testDocument = {
      name: 'Test Entry',
      createdAt: new Date(),
      description: 'This is a test document created by GitHub Copilot',
      metadata: {
        version: '1.0',
        environment: 'test'
      }
    };
    
    const result = await collection.insertOne(testDocument);
    console.log(`✓ Collection '${collectionName}' created successfully`);
    console.log(`✓ Test document inserted with ID: ${result.insertedId}`);
    
    // List all collections to verify
    const collections = await db.listCollections().toArray();
    console.log('\nAll collections in database:');
    collections.forEach(col => console.log(`  - ${col.name}`));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nConnection closed');
  }
}

createTestCollection();

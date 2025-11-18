const { MongoClient } = require('mongodb');

const sourceUri = "mongodb://admin:StrongPassword123!@129.154.246.226:27017/admin";
const targetUri = "mongodb://admin:StrongPassword123!@129.154.246.226:27017/admin";

async function migrateMongoDB() {
  const sourceClient = new MongoClient(sourceUri);
  const targetClient = new MongoClient(targetUri);
  
  try {
    // Connect to both databases
    await sourceClient.connect();
    console.log("✓ Connected to SOURCE (localhost)");
    
    await targetClient.connect();
    console.log("✓ Connected to TARGET (remote server)\n");
    
    // Get list of all databases from source
    const adminDb = sourceClient.db().admin();
    const databases = await adminDb.listDatabases();
    
    console.log(`Found ${databases.databases.length} databases on localhost:\n`);
    
    // Filter out system databases
    const databasesToMigrate = databases.databases.filter(db => 
      !['admin', 'local', 'config'].includes(db.name)
    );
    
    if (databasesToMigrate.length === 0) {
      console.log("No user databases found to migrate.");
      return;
    }
    
    // Migrate each database
    for (const dbInfo of databasesToMigrate) {
      const dbName = dbInfo.name;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Migrating database: ${dbName}`);
      console.log(`${'='.repeat(60)}`);
      
      const sourceDb = sourceClient.db(dbName);
      const targetDb = targetClient.db(dbName);
      
      // Get all collections
      const collections = await sourceDb.listCollections().toArray();
      console.log(`Found ${collections.length} collections in ${dbName}`);
      
      for (const collInfo of collections) {
        const collName = collInfo.name;
        console.log(`\n  → Copying collection: ${collName}`);
        
        const sourceCollection = sourceDb.collection(collName);
        const targetCollection = targetDb.collection(collName);
        
        // Get all documents from source
        const documents = await sourceCollection.find({}).toArray();
        console.log(`    Found ${documents.length} documents`);
        
        if (documents.length > 0) {
          // Insert all documents into target
          await targetCollection.insertMany(documents, { ordered: false });
          console.log(`    ✓ Copied ${documents.length} documents`);
        }
        
        // Copy indexes
        const indexes = await sourceCollection.indexes();
        console.log(`    Found ${indexes.length} indexes`);
        
        for (const index of indexes) {
          // Skip the default _id index
          if (index.name !== '_id_') {
            try {
              const indexSpec = { ...index.key };
              const options = { name: index.name };
              if (index.unique) options.unique = true;
              if (index.sparse) options.sparse = true;
              if (index.expireAfterSeconds) options.expireAfterSeconds = index.expireAfterSeconds;
              
              await targetCollection.createIndex(indexSpec, options);
              console.log(`    ✓ Created index: ${index.name}`);
            } catch (err) {
              console.log(`    ⚠ Could not create index ${index.name}: ${err.message}`);
            }
          }
        }
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log("MIGRATION SUMMARY");
    console.log(`${'='.repeat(60)}`);
    
    // Verify migration
    for (const dbInfo of databasesToMigrate) {
      const dbName = dbInfo.name;
      const sourceDb = sourceClient.db(dbName);
      const targetDb = targetClient.db(dbName);
      
      const sourceCollections = await sourceDb.listCollections().toArray();
      const targetCollections = await targetDb.listCollections().toArray();
      
      console.log(`\nDatabase: ${dbName}`);
      console.log(`  Source collections: ${sourceCollections.length}`);
      console.log(`  Target collections: ${targetCollections.length}`);
      
      for (const collInfo of sourceCollections) {
        const collName = collInfo.name;
        const sourceCount = await sourceDb.collection(collName).countDocuments();
        const targetCount = await targetDb.collection(collName).countDocuments();
        console.log(`  - ${collName}: ${sourceCount} → ${targetCount} documents`);
      }
    }
    
    console.log(`\n✓ Migration completed successfully!`);
    
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    await sourceClient.close();
    await targetClient.close();
    console.log('\n✓ Connections closed');
  }
}

migrateMongoDB();

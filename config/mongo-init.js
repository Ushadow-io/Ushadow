// MongoDB Replica Set Initialization Script
// This script initializes MongoDB as a single-node replica set
// Replica sets enable features like change streams, transactions, and easier scaling

// Wait for MongoDB to be ready
sleep(1000);

try {
  // Check if replica set is already initialized
  const status = rs.status();
  print('Replica set already initialized:', status.set);
} catch (err) {
  // Replica set not initialized - initialize it now
  print('Initializing replica set rs0...');

  rs.initiate({
    _id: 'rs0',
    members: [
      {
        _id: 0,
        host: 'mongo:27017',
        priority: 1
      }
    ]
  });

  print('Replica set rs0 initialized successfully');
  print('Waiting for primary election...');

  // Wait for primary election
  sleep(5000);

  print('Replica set status:');
  printjson(rs.status());
}

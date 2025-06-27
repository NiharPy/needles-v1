// config/qdrant.js 
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from './config.js';

export let qdrant = null;

export const connectQdrant = async () => {
  const QDRANT_URL = config.QDRANT_URL || 'http://localhost:6333';
  const QDRANT_API_KEY = config.QDRANT_API_KEY;

  try {
    qdrant = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY || undefined, // Use undefined if running locally without auth
    });

    // Test the connection
    const collections = await qdrant.getCollections();
    console.log(`✅ Qdrant connected (${collections.collections.length} collections found)`);

    // ✅ Check if collection exists
    const collectionName = 'dress_types';
    const exists = collections.collections.find(c => c.name === collectionName);

    if (!exists) {
      await qdrant.createCollection(collectionName, {
        vectors: {
          size: 512, // Your image embedding size
          distance: 'Cosine', // Or 'Dot' or 'Euclidean' if needed
        },
      });
      console.log(`📦 Qdrant collection '${collectionName}' created.`);
    } else {
      console.log(`ℹ️ Collection '${collectionName}' already exists.`);
    }

    return qdrant;
  } catch (err) {
    console.error("❌ Qdrant connection failed:", err.message);
    qdrant = null; // Reset to null on failure
    throw err; // Re-throw to handle in calling code
  }
};

// Helper function to ensure qdrant is connected
export const getQdrantClient = async () => {
  if (!qdrant) {
    console.log('🔄 Qdrant not connected, attempting to connect...');
    await connectQdrant();
  }
  return qdrant;
};
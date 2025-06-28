import { getQdrantClient } from '../config/qdrant.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Stores an image embedding in the Qdrant vector DB
 * @param {number[]} embedding - 512-dimension vector from CLIP
 * @param {object} metadata - Metadata like boutiqueId, dressType, imageUrl
 * @returns {string} - Qdrant vector ID
 */
export const storeImageEmbedding = async (embedding, metadata = {}) => {
  try {
    const qdrant = await getQdrantClient();
    if (!qdrant) {
      throw new Error('Qdrant client is not available');
    }

    const vectorId = uuidv4();

    const payload = {
      boutiqueId: metadata.boutiqueId,
      boutiqueName: metadata.boutiqueName || 'Unnamed Boutique',
      area: metadata.area || 'Unknown Area',
      dressType: metadata.dressType,
      imageUrl: metadata.imageUrl,
    };

    await qdrant.upsert('dress_types', {
      wait: true,
      points: [
        {
          id: vectorId,
          vector: embedding,
          payload,
        },
      ],
    });

    console.log(`✅ Stored embedding with ID: ${vectorId}`);
    return vectorId;
  } catch (err) {
    console.error('❌ Failed to store embedding in Qdrant:', err.message);
    throw err;
  }
};

/**
 * Search for similar images in Qdrant
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} limit - Number of results to return
 * @param {number} scoreThreshold - Minimum similarity score
 * @returns {Array} - Search results
 */
export const searchSimilarImages = async (queryEmbedding, limit = 10, scoreThreshold = 0.2) => {
  try {
    const qdrant = await getQdrantClient();
    
    if (!qdrant) {
      throw new Error('Qdrant client is not available');
    }

    const searchResult = await qdrant.search('dress_types', {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      score_threshold: scoreThreshold,
    });

    return searchResult || [];
  } catch (err) {
    console.error('❌ Failed to search in Qdrant:', err.message);
    throw err;
  }
};

/**
 * Delete an embedding from Qdrant
 * @param {string} vectorId - The vector ID to delete
 * @returns {boolean} - Success status
 */
export const deleteImageEmbedding = async (vectorId) => {
  try {
    const qdrant = await getQdrantClient();
    
    if (!qdrant) {
      throw new Error('Qdrant client is not available');
    }

    await qdrant.delete('dress_types', {
      wait: true,
      points: [vectorId],
    });

    console.log(`✅ Deleted embedding with ID: ${vectorId}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to delete embedding from Qdrant:', err.message);
    throw err;
  }
};


import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { createRedisConnection } from '../config/IOredis.js';
import { getQdrantClient } from '../config/qdrant.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserInteraction from '../models/UserActivity.js';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const connection = createRedisConnection();

(async () => {
  try {
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected inside worker');
  } catch (err) {
    console.error('❌ MongoDB connection error in worker:', err);
    process.exit(1);
  }
})();

function generateSimpleEmbedding(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const hash = crypto.createHash('sha256').update(imageBuffer).digest();
    const embedding = new Array(512);
    for (let i = 0; i < 512; i++) {
      embedding[i] = (hash[i % hash.length] - 128) / 128;
    }
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
    return embedding.map(x => x / norm);
  } catch (error) {
    throw new Error(`Failed to generate simple embedding: ${error.message}`);
  }
}

export const generateEmbedding = async (imagePathOrUrl) => {
  try {
    const transformers = await import('@xenova/transformers');
    const { pipeline, RawImage } = transformers;

    console.log('🧠 Using CLIP model for embedding...');
    const model = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    const image = await RawImage.read(imagePathOrUrl);
    const result = await model(image);

    let embeddings;
    if (result?.[0]?.data) embeddings = result[0].data;
    else if (result?.data) embeddings = result.data;
    else if (Array.isArray(result)) embeddings = result.flat();
    else embeddings = result;

    if (!embeddings || embeddings.length === 0) {
      throw new Error('No embedding data returned from model');
    }

    const flat = Array.isArray(embeddings) ? embeddings : Array.from(embeddings);
    const norm = Math.sqrt(flat.reduce((sum, val) => sum + val * val, 0)) || 1;
    return flat.map(x => x / norm);

  } catch (transformersError) {
    console.warn('⚠️ Transformers failed, using fallback method:', transformersError.message);

    if (imagePathOrUrl.startsWith('http')) {
      throw new Error('Fallback method only works with local files');
    }

    return generateSimpleEmbedding(imagePathOrUrl);
  }
};

export const dressSearchWorker = new Worker(
    'dressSearch',
    async (job) => {
      try {
        const { imagePath, userId } = job.data;
  
        if (!userId) {
          throw new Error('userId is required but missing in job data');
        }
  
        const embedding = await generateEmbedding(imagePath);
  
        try {
          await UserInteraction.create({
            userId,
            type: 'search',
            content: 'image_search',
            embedding,
          });
        } catch (interactionErr) {
          console.warn('⚠️ Could not save UserInteraction:', interactionErr.message);
        }
  
        const qdrant = await getQdrantClient();
        const results = await qdrant.search('dress_types', {
          vector: embedding,
          limit: 10,
          with_payload: true,
          score_threshold: 0.25,
        });
  
        const response = results.map(result => {
          const payload = result.payload || {};
          return {
            boutiqueId: String(payload.boutiqueId || ''),
            boutiqueName: payload.boutiqueName || 'Boutique Not Found',
            area: payload.area || 'Area Not Available',
            dressType: payload.dressType || 'Unknown Type',
            imageUrl: payload.imageUrl || '',
            similarity: parseFloat((result.score || 0).toFixed(4)),
            isAvailable: !!(payload.boutiqueName && payload.area)
          };
        });
  
        if (imagePath && fs.existsSync(imagePath)) {
          try {
            fs.unlinkSync(imagePath);
          } catch (err) {
            console.warn('⚠️ Could not clean up file:', err.message);
          }
        }
  
        return response;
  
      } catch (err) {
        console.error('❌ Worker error:', err);
        if (job.data.imagePath && fs.existsSync(job.data.imagePath)) {
          try {
            fs.unlinkSync(job.data.imagePath);
          } catch (cleanupErr) {
            console.warn('⚠️ Could not clean up file after error:', cleanupErr.message);
          }
        }
        throw new Error(`Embedding failed: ${err.message}`);
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );
  
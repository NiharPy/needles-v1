import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { createRedisConnection } from '../config/IOredis.js';
import { getQdrantClient } from '../config/qdrant.js';
import BoutiqueModel from '../models/BoutiqueMarketSchema.js';
import UserInteraction from '../models/UserActivity.js';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { storeImageEmbedding } from '../utils/qdrantClient.js';
import { v2 as cloudinary } from 'cloudinary';

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
  
  

// Initialize transformers imports
let pipeline, RawImage;
let transformersInitialized = false;

async function initializeTransformers() {
  if (transformersInitialized) return;
  
  try {
    console.log('🔧 Initializing transformers...');
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    RawImage = transformers.RawImage;
    transformersInitialized = true;
    console.log('✅ Transformers initialized successfully');
  } catch (error) {
    console.error('❌ Failed to import transformers:', error);
    throw new Error(`Transformers initialization failed: ${error.message}`);
  }
}

let embedder;

async function loadEmbedder() {
  await initializeTransformers();
  
  if (!embedder) {
    try {
      console.log('🧠 Loading CLIP model...');
      embedder = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
      console.log('✅ CLIP model loaded successfully');
    } catch (error) {
      console.log('⚠️ Primary model loading failed, trying fallback...', error.message);
      try {
        embedder = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
        console.log('✅ Fallback model loaded successfully');
      } catch (altError) {
        console.error('❌ Both model loading attempts failed:', altError);
        throw new Error(`Failed to load embedding model: ${altError.message}`);
      }
    }
  }
  return embedder;
}

// Helper function to determine if path is URL or local file
function isUrl(path) {
  return path.startsWith('http://') || path.startsWith('https://');
}

async function getImageEmbedding(imagePathOrUrl) {
  try {
    console.log(`🔍 Processing image: ${imagePathOrUrl}`);
    
    let imageExists = false;
    let fileSize = 'N/A';
    
    // Check if it's a URL or local file
    if (isUrl(imagePathOrUrl)) {
      console.log('🌐 Detected URL - will process directly');
      // For URLs, we can't check file existence locally, so we'll try to process it
      imageExists = true;
    } else {
      // For local files, check existence
      if (!fs.existsSync(imagePathOrUrl)) {
        throw new Error(`Local image file does not exist: ${imagePathOrUrl}`);
      }
      
      const stats = fs.statSync(imagePathOrUrl);
      fileSize = `${stats.size} bytes`;
      console.log(`📊 Local file size: ${fileSize}`);
      
      if (stats.size === 0) {
        throw new Error(`Local image file is empty: ${imagePathOrUrl}`);
      }
      imageExists = true;
    }

    if (!imageExists) {
      throw new Error(`Image not accessible: ${imagePathOrUrl}`);
    }

    const model = await loadEmbedder();
    console.log('📖 Reading image with RawImage...');
    
    // RawImage.read can handle both URLs and local files
    const image = await RawImage.read(imagePathOrUrl);
    console.log(`🖼️ Image loaded: ${image.width}x${image.height}`);
    
    console.log('🧠 Generating embedding...');
    const result = await model(image);
    console.log('✅ Embedding generated successfully');

    let embedding;
    if (result?.data) {
      embedding = Array.from(result.data);
    } else if (Array.isArray(result)) {
      embedding = result.flat();
    } else {
      console.warn('⚠️ Unexpected result format, using fallback');
      embedding = new Array(512).fill(0);
    }
    
    console.log(`📏 Embedding dimensions: ${embedding.length}`);
    return embedding;
    
  } catch (error) {
    console.error(`❌ Embedding error for ${imagePathOrUrl}:`, error);
    
    // More detailed error information
    if (error.message.includes('fetch') || error.message.includes('network')) {
      console.error('🌐 Network-related error - check internet connection or URL validity');
    } else if (error.message.includes('model')) {
      console.error('🤖 Model-related error - check model availability');
    } else if (error.message.includes('file') || error.message.includes('ENOENT')) {
      console.error('📁 File-related error - check file path and permissions');
    }
    
    throw error;
  }
}

// ========== WORKER ==========
export const addDressWorker = new Worker(
    'addDressType',
    async (job) => {
      try {
        const {
          boutiqueId,
          dressType,
          measurementRequirements,
          sizeChart,
          imagePaths,
        } = job.data;
    
        console.log('🧵 Received job for boutiqueId:', boutiqueId);
        console.log('📝 Job data:', { 
          dressType, 
          imageCount: imagePaths?.length,
          imagePaths: imagePaths 
        });
    
        // Validate inputs
        if (!boutiqueId) {
          throw new Error('boutiqueId is required');
        }
        
        if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
          throw new Error('At least one image path is required');
        }
    
        // ✅ Validate ID format
        if (!mongoose.Types.ObjectId.isValid(boutiqueId)) {
          console.error('❌ Invalid boutiqueId format:', boutiqueId);
          throw new Error('Invalid boutique ID');
        }
    
        // ✅ Pull boutique from MongoDB
        const boutique = await BoutiqueModel.findById(boutiqueId).lean();
        if (!boutique) {
          const all = await BoutiqueModel.find({}, { _id: 1, name: 1 }).lean();
          console.error('❌ Boutique not found in DB for ID:', boutiqueId);
          console.log('📋 Available Boutiques:', all.map(b => `${b.name} (${b._id})`));
          throw new Error('Boutique not found');
        }
        
        console.log('✅ Found boutique:', boutique.name);
    
        const parsedMeasurements = JSON.parse(measurementRequirements || '[]');
        const parsedSizeChart = JSON.parse(sizeChart || '{}');
    
        // ✅ Validate size chart structure (skip if empty for now)
        if (Object.keys(parsedSizeChart).length > 0) {
          const expectedSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
          const isValid = expectedSizes.every(size =>
            parsedSizeChart[size] &&
            parsedMeasurements.every(m => parsedSizeChart[size][m] !== undefined)
          );
    
          if (!isValid) {
            console.warn('⚠️ Size chart validation failed - continuing anyway');
            console.log('Expected sizes:', expectedSizes);
            console.log('Provided chart keys:', Object.keys(parsedSizeChart));
          }
        }
    
        const imageObjects = [];
        let successfulImages = 0;
        let failedImages = 0;
    
        // ✅ Process each image with detailed error tracking
        for (let i = 0; i < imagePaths.length; i++) {
          const imagePathOrUrl = imagePaths[i];
          console.log(`\n📸 Processing image ${i + 1}/${imagePaths.length}: ${imagePathOrUrl}`);
          
          try {
            // Step 1: Generate embedding (works with both URLs and local files)
            console.log('🧠 Generating embedding...');
            const embedding = await getImageEmbedding(imagePathOrUrl);
            console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
            
            // Step 2: Determine final image URL
            let finalImageUrl;
            
            if (isUrl(imagePathOrUrl)) {
              // If it's already a URL (like from Cloudinary), use it directly
              finalImageUrl = imagePathOrUrl;
              console.log(`🔗 Using existing URL: ${finalImageUrl}`);
            } else {
              // If it's a local file, upload to Cloudinary
              console.log('☁️ Uploading local file to Cloudinary...');
              const uploadResult = await cloudinary.uploader.upload(imagePathOrUrl, {
                folder: 'dress_types',
                resource_type: 'image',
                timeout: 60000, // 60 second timeout
              });
              finalImageUrl = uploadResult.secure_url;
              console.log(`✅ Cloudinary upload successful: ${finalImageUrl}`);
            }
    
            // Step 3: Store in Qdrant
            console.log('🔗 Storing in Qdrant...');
            const qdrantId = await storeImageEmbedding(embedding, {
              boutiqueId,
              boutiqueName: boutique.name,
              area: boutique.area,
              dressType,
              imageUrl: finalImageUrl,
            });
            console.log(`✅ Qdrant storage successful: ${qdrantId}`);
    
            imageObjects.push({
              url: finalImageUrl,
              qdrantId,
            });
            
            successfulImages++;
            console.log(`✅ Image ${i + 1} processed successfully`);
            
          } catch (err) {
            failedImages++;
            console.error(`❌ Error processing image ${i + 1} (${imagePathOrUrl}):`);
            console.error(`   Error: ${err.message}`);
            console.error(`   Stack: ${err.stack}`);
            
            // Add failed entry for debugging (optional)
            imageObjects.push({
              url: '',
              qdrantId: 'embedding-failed-' + uuidv4(),
              error: err.message,
              originalPath: imagePathOrUrl
            });
          } finally {
            // Clean up local files only (not URLs)
            if (!isUrl(imagePathOrUrl) && fs.existsSync(imagePathOrUrl)) {
              try {
                fs.unlinkSync(imagePathOrUrl);
                console.log(`🗑️ Cleaned up local file: ${imagePathOrUrl}`);
              } catch (cleanupErr) {
                console.warn(`⚠️ Failed to cleanup file ${imagePathOrUrl}:`, cleanupErr.message);
              }
            }
          }
        }
        
        console.log(`\n📊 Processing summary: ${successfulImages} successful, ${failedImages} failed`);
        
        // Only proceed if at least one image was processed successfully
        if (successfulImages === 0) {
          throw new Error(`All ${imagePaths.length} images failed to process`);
        }
    
        // Filter out failed images before saving (optional)
        const successfulImageObjects = imageObjects.filter(img => img.url !== '');
        
        // ✅ Push into boutique.dressTypes
        console.log('💾 Saving to database...');
        const updatedBoutique = await BoutiqueModel.findByIdAndUpdate(
          boutiqueId,
          {
            $push: {
              dressTypes: {
                type: dressType,
                images: successfulImageObjects, // Only save successful images
                measurementRequirements: parsedMeasurements,
                sizeChart: parsedSizeChart,
              },
            },
          },
          { new: true }
        );
        
        if (!updatedBoutique) {
          throw new Error('Failed to update boutique');
        }
    
        console.log('✅ Dress type successfully saved to boutique:', boutique.name);
        return {
          success: true,
          boutiqueId,
          boutiqueName: boutique.name,
          dressType,
          imagesProcessed: successfulImages,
          imagesFailed: failedImages,
          totalImages: imagePaths.length
        };
        
      } catch (error) {
        console.error('❌ Worker job failed:', error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
    }
);
import UserActivity from '../models/UserActivity.js';
import { getEmbedding } from '../utils/embedingFuser.js';

export const logUserActivity = async (userId, actionType, target, metadata = {}) => {
  const embedding = await getEmbedding(target); // Use target text or dressType
  await UserActivity.create({
    userId,
    actionType,
    target,
    metadata,
    embedding
  });
};


export const getUserProfileEmbedding = async (userId) => {
    const activities = await UserActivity.find({ userId })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('embedding');
  
    const vectors = activities.map(a => a.embedding).filter(e => e?.length);
  
    if (!vectors.length) return null;
  
    const avgEmbedding = vectors[0].map((_, i) =>
      vectors.reduce((sum, vec) => sum + vec[i], 0) / vectors.length
    );
  
    return avgEmbedding;
  };
  
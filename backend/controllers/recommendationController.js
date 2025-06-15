import UserInteraction from "../models/UserActivity.js";
import { getEmbedding } from "../utils/embedingFuser.js";



export const logUserActivity = async (userId, type, content, embedding = null) => {
  try {
    if (!userId || !type || !content) {
      console.warn("Skipping logUserActivity due to missing fields");
      return;
    }

    // ⚠️ Compute embedding only if not supplied
    const vector = embedding || await getEmbedding(content);

    const log = new UserInteraction({
      userId,
      type,
      content,
      embedding: vector,
    });

    await log.save();
  } catch (err) {
    console.error("❌ Error logging user activity:", err.message);
  }
};

  export const getRecentUserEmbeddings = async (userId, actionType = "view", limit = 50) => {
    const recentInteractions = await UserInteraction.find({
      userId,
      actionType,
      embedding: { $exists: true }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  
    return recentInteractions.map(entry => entry.embedding);
  };
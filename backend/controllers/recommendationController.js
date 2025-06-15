import UserInteraction from "../models/UserActivity.js";
import { getEmbedding } from "../utils/embedingFuser.js";



export const logUserActivity = async (userId, type, content) => {
    try {
      // ✅ Validate required fields
      if (!userId || !type || !content) {
        console.warn("Skipping logUserActivity due to missing fields");
        return;
      }
  
      // ✅ Get embedding of content
      const embedding = await getEmbedding(content); // content can be "Boutique:Name" or "Lehenga"
  
      // ✅ Save the interaction
      const log = new UserInteraction({
        userId,
        type,       // e.g. "view", "click"
        content,    // e.g. "Boutique:Tailor House"
        embedding,  // Required vector
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
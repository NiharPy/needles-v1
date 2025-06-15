import UserInteraction from "../models/UserActivity.js";


export const logUserActivity = async (userId, actionType, target, metadata = {}) => {
    try {
      const embedding = await getEmbedding(target); // target could be a dressType or boutique name
      await UserInteraction.create({
        userId,
        actionType,
        target,
        metadata,
        embedding,
      });
    } catch (err) {
      console.error("❌ Error logging user activity:", err.message);
    }
  };
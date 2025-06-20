// utils/fetchBoutiqueAnalytics.js
import axios from "axios";

export const fetchBoutiqueAnalytics = async (jwtToken) => {
  try {
    const response = await axios.get("https://analytics4needles.onrender.com/analytics/boutique", {
      headers: {
        Authorization: `Bearer ${jwtToken}` // ⬅️ Send JWT here
      }
    });

    return response.data; // contains orders, sales, graph
  } catch (error) {
    console.error("Failed to fetch analytics:", error.response?.data || error.message);
    throw new Error("Could not fetch boutique analytics.");
  }
};

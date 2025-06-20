// auth-admin.js
import jwt from 'jsonwebtoken';
import AdminModel from '../models/AdminSchema.js';
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken } from "../utils/token.js";

// Middleware for protected admin routes
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access token missing or invalid." });
  }

  const token = authHeader.split(" ")[1];

  // ❌ Check if token is blacklisted
  const blacklisted = await BlacklistedToken.findOne({ token });
  if (blacklisted) {
    return res.status(401).json({ message: "Token has been invalidated." });
  }

  // ✅ Decode and attach admin info
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        message: err.name === "TokenExpiredError" ? "Access token expired." : "Invalid token."
      });
    }

    req.user = decoded;
    req.adminId = decoded.userId; // 👈 Attach adminId from JWT
    next();
  });
};

// Optional public middleware to detect if admin is logged in
const publicAdminMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      req.user = decoded;
      req.adminId = decoded.userId;
    } catch {
      // Token is invalid or expired — just skip
    }
  }

  next();
};

// 🔄 Refresh access token for admin
const refreshAdminAccessToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required." });
  }

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired refresh token." });
    }

    const admin = await AdminModel.findById(decoded.userId);
    if (!admin) {
      return res.status(403).json({ message: "Admin not found." });
    }

    if (admin.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Refresh token does not match." });
    }

    const newAccessToken = generateAccessToken(admin);
    res.status(200).json({ accessToken: newAccessToken });
  });
};

export {
  authMiddleware,
  refreshAdminAccessToken,
  publicAdminMiddleware
};

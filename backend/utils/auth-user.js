import jwt from 'jsonwebtoken';
import UserModel from "../models/userschema.js";
import BlacklistedToken from '../models/BlacklistedToken.js';
import { generateAccessToken } from './token.js';

// 🛡️ Protected middleware
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

  // ✅ Decode and attach user info
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        message: err.name === "TokenExpiredError" ? "Access token expired." : "Invalid token."
      });
    }

    req.user = decoded;
    req.userId = decoded.userId; // 👈 Inject userId
    next();
  });
};

// 🌐 Optional middleware (for public routes)
const publicMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      req.user = decoded;
      req.userId = decoded.userId;
    } catch {
      // Invalid token — allow to continue silently
    }
  }

  next();
};

// 🔄 Refresh access token endpoint
const refreshAccessToken = async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required." });
  }

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired refresh token." });
    }

    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      return res.status(403).json({ message: "User not found." });
    }

    // Check stored refresh token matches
    if (user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Refresh token does not match." });
    }

    const newAccessToken = generateAccessToken(user);
    res.status(200).json({ accessToken: newAccessToken });
  });
};

export { publicMiddleware, refreshAccessToken };
export default authMiddleware;

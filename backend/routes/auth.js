const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const crypto = require("crypto");

const User = require("../models/User");
const Subscription = require("../models/Subscription");
const sendEmail = require("../utils/email/sendEmail");
const authRateLimit = require("../middleware/authRateLimit");

const router = express.Router();
const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://127.0.0.1:5500";

function getTutorialState(user) {
  return {
    onboardingCompleted: Boolean(user?.tutorials?.onboardingCompleted),
    dismissed: Boolean(user?.tutorials?.dismissed),
    lastTutorial: user?.tutorials?.lastTutorial || "getting-started",
    lastStep: user?.tutorials?.lastStep || "welcome",
    completedTutorials: Array.isArray(user?.tutorials?.completedTutorials)
      ? user.tutorials.completedTutorials
      : [],
    completedSteps: Array.isArray(user?.tutorials?.completedSteps)
      ? user.tutorials.completedSteps
      : []
  };
}

/* =============================
REGISTER USER
============================= */
router.post(
  "/register",
  authRateLimit({ scope: "register", windowMs: 15 * 60 * 1000, max: 5 }),
  async (req, res) => {
  try {

    const fullName = (req.body.fullName || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";
    const phone = (req.body.phone || "").trim();
    const businessName = (req.body.businessName || "").trim();

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: "Full name, email and password are required"
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long"
      });
    }

    const exists = await User.findOne({ email });

    if (exists) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email,
      passwordHash: hashed,
      phone,
      businessName
    });

    // Create free subscription
    const existingSub = await Subscription.findOne({ user: user._id });

    if (!existingSub) {
      await Subscription.create({
        user: user._id,
        plan: "free",
        maxUnits: 2,
        status: "active"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone || "",
        businessName: user.businessName || "",
        role: user.role,
        tutorials: getTutorialState(user)
      }
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
});

/* =============================
LOGIN USER
============================= */
router.post(
  "/login",
  authRateLimit({ scope: "login", windowMs: 15 * 60 * 1000, max: 10 }),
  async (req, res) => {
  try {

    const email = (req.body.email || "").trim().toLowerCase();
    const password = req.body.password || "";

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required"
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone || "",
        businessName: user.businessName || "",
        logoUrl: user.logoUrl || "",
        role: user.role,
        tutorials: getTutorialState(user)
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Login failed" });
  }
});

router.post(
  "/forgot-password",
  authRateLimit({
    scope: "forgot-password",
    windowMs: 30 * 60 * 1000,
    max: 3
  }),
  async (req, res) => {
    try {
      const email = (req.body.email || "").trim().toLowerCase();

      if (!validator.isEmail(email)) {
        return res.status(400).json({
          message: "Please enter a valid email address"
        });
      }

      const user = await User.findOne({ email });

      if (!user) {
        return res.json({
          success: true,
          message:
            "If that email exists, a password reset link has been sent."
        });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetUrl =
        `${FRONTEND_URL.replace(/\/$/, "")}` +
        `/reset-password.html?token=${rawToken}`;

      await sendEmail({
        to: user.email,
        subject: "Reset your Track My Rent password",
        text:
          `Reset your password using this link: ${resetUrl}\n\n` +
          "This link expires in 1 hour.",
        html: `
          <p>Hello ${user.fullName || ""},</p>
          <p>You requested a password reset for your Track My Rent account.</p>
          <p><a href="${resetUrl}">Reset your password</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `
      });

      return res.json({
        success: true,
        message:
          "If that email exists, a password reset link has been sent."
      });
    } catch (err) {
      console.error("FORGOT PASSWORD ERROR:", err);
      return res.status(500).json({
        message: "Failed to start password reset"
      });
    }
  }
);

router.post(
  "/reset-password",
  authRateLimit({
    scope: "reset-password",
    windowMs: 30 * 60 * 1000,
    max: 5
  }),
  async (req, res) => {
    try {
      const token = (req.body.token || "").trim();
      const password = req.body.password || "";

      if (!token) {
        return res.status(400).json({
          message: "Reset token is required"
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters long"
        });
      }

      const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          message: "Reset link is invalid or has expired"
        });
      }

      user.passwordHash = await bcrypt.hash(password, 10);
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();

      return res.json({
        success: true,
        message: "Password reset successfully"
      });
    } catch (err) {
      console.error("RESET PASSWORD ERROR:", err);
      return res.status(500).json({
        message: "Failed to reset password"
      });
    }
  }
);

module.exports = router;

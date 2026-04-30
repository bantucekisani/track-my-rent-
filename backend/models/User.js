const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true },
    passwordResetTokenHash: String,
    passwordResetExpiresAt: Date,
    phone: String,
    businessName: String,
    logoUrl: String,
    role: {
      type: String,
      enum: ["owner", "staff", "admin"],
      default: "owner"
    },
    tutorials: {
      onboardingCompleted: {
        type: Boolean,
        default: false
      },
      dismissed: {
        type: Boolean,
        default: false
      },
      lastTutorial: {
        type: String,
        default: "getting-started"
      },
      lastStep: {
        type: String,
        default: "welcome"
      },
      completedTutorials: {
        type: [String],
        default: []
      },
      completedSteps: {
        type: [String],
        default: []
      }
    }
  },
  { timestamps: true }
);

// Make sure you export the Mongoose model
module.exports = mongoose.model("User", userSchema);

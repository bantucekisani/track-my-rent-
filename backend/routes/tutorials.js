const express = require("express");

const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

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

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("tutorials").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      tutorials: getTutorialState(user)
    });
  } catch (err) {
    console.error("GET TUTORIALS ERROR:", err);
    return res.status(500).json({ message: "Failed to load tutorials" });
  }
});

router.patch("/me", auth, async (req, res) => {
  try {
    const updates = {};

    if (typeof req.body.onboardingCompleted === "boolean") {
      updates["tutorials.onboardingCompleted"] = req.body.onboardingCompleted;
    }

    if (typeof req.body.dismissed === "boolean") {
      updates["tutorials.dismissed"] = req.body.dismissed;
    }

    if (typeof req.body.lastTutorial === "string") {
      updates["tutorials.lastTutorial"] = req.body.lastTutorial.trim();
    }

    if (typeof req.body.lastStep === "string") {
      updates["tutorials.lastStep"] = req.body.lastStep.trim();
    }

    if (Array.isArray(req.body.completedTutorials)) {
      updates["tutorials.completedTutorials"] = [
        ...new Set(
          req.body.completedTutorials
            .filter(item => typeof item === "string")
            .map(item => item.trim())
            .filter(Boolean)
        )
      ];
    }

    if (Array.isArray(req.body.completedSteps)) {
      updates["tutorials.completedSteps"] = [
        ...new Set(
          req.body.completedSteps
            .filter(item => typeof item === "string")
            .map(item => item.trim())
            .filter(Boolean)
        )
      ];
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      {
        new: true,
        runValidators: true
      }
    ).select("tutorials").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      tutorials: getTutorialState(user)
    });
  } catch (err) {
    console.error("UPDATE TUTORIALS ERROR:", err);
    return res.status(500).json({ message: "Failed to update tutorial progress" });
  }
});

router.post("/complete", auth, async (req, res) => {
  try {
    const tutorialId = (req.body.tutorialId || "").trim();

    if (!tutorialId) {
      return res.status(400).json({ message: "tutorialId is required" });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.tutorials) {
      user.tutorials = {};
    }

    const completedTutorials = new Set(user.tutorials.completedTutorials || []);
    completedTutorials.add(tutorialId);

    user.tutorials.completedTutorials = [...completedTutorials];
    user.tutorials.lastTutorial = tutorialId;
    user.tutorials.dismissed = false;
    user.tutorials.onboardingCompleted =
      tutorialId === "getting-started"
        ? true
        : Boolean(user.tutorials.onboardingCompleted);

    await user.save();

    return res.json({
      success: true,
      tutorials: getTutorialState(user)
    });
  } catch (err) {
    console.error("COMPLETE TUTORIAL ERROR:", err);
    return res.status(500).json({ message: "Failed to complete tutorial" });
  }
});

router.post("/dismiss", auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "tutorials.dismissed": true
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select("tutorials").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      tutorials: getTutorialState(user)
    });
  } catch (err) {
    console.error("DISMISS TUTORIALS ERROR:", err);
    return res.status(500).json({ message: "Failed to dismiss tutorials" });
  }
});

router.post("/reset", auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "tutorials.onboardingCompleted": false,
          "tutorials.dismissed": false,
          "tutorials.lastTutorial": "getting-started",
          "tutorials.lastStep": "welcome",
          "tutorials.completedTutorials": [],
          "tutorials.completedSteps": []
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select("tutorials").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      tutorials: getTutorialState(user)
    });
  } catch (err) {
    console.error("RESET TUTORIALS ERROR:", err);
    return res.status(500).json({ message: "Failed to reset tutorials" });
  }
});

module.exports = router;

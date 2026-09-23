const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// حماية مسار الحالة
router.get("/status", verifyFirebaseToken, wheelController.getWheelStatus);

// حماية مسار تدوير العجلة (يعالج اللفة العادية ولفة الإعلان معاً)
router.post("/spin", verifyFirebaseToken, wheelController.spinWheel);

module.exports = router;

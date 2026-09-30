const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// حماية مسار الحالة
router.get("/status", verifyFirebaseToken, wheelController.getWheelStatus);

// 🛡️ مسار جديد: طلب تصريح لمشاهدة إعلان (محمي بـ Firebase Token)
router.post("/request-ad", verifyFirebaseToken, wheelController.requestAdSession);

// حماية مسار تدوير العجلة (يعالج اللفة العادية ولفة الإعلان معاً)
router.post("/spin", verifyFirebaseToken, wheelController.spinWheel);

// مسار عام غير محمي لتحديثات لوحة الفائزين
router.get("/contest/info", wheelController.getContestInfo);

module.exports = router;
const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");
// 1. استيراد الحارس هنا في الأعلى (هذا هو السطر الأول الذي سألته عنه)
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// حماية مسار الحالة
router.get("/status", verifyFirebaseToken, wheelController.getWheelStatus);

// حماية مسار تدوير العجلة
router.post("/spin", verifyFirebaseToken, wheelController.spinWheel);

// حماية مسار مشاهدة الإعلان
router.post("/watch-ad", verifyFirebaseToken, wheelController.watchAd);

module.exports = router;
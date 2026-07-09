const express = require("express");
const router = express.Router();
const dailyController = require("../controllers/dailyController");

// حالة الدخول اليومي
router.get("/status-vertical", dailyController.getStatus);

// المطالبة بالمكافأة
router.post("/claim-vertical", dailyController.claimDaily);

// سجل النقاط
router.get("/history", dailyController.getPointsHistory);

module.exports = router;
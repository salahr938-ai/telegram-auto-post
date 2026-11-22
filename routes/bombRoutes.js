const express = require("express");
const router = express.Router();
const bombController = require("../controllers/bombController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// فحص حالة الجولات المتبقية والرصيد (محمي بـ Firebase Token)
router.post("/status", verifyFirebaseToken, bombController.getStatus);

// احتساب الجولة ضمن الحد اليومي عند بدء اللعب (محمي بـ Firebase Token)
router.post("/start", verifyFirebaseToken, bombController.startRound);

// استلام نقاط الجولة عند الانسحاب أو إتمام المربعات الآمنة (محمي بـ Firebase Token)
router.post("/claim", verifyFirebaseToken, bombController.claimPoints);

module.exports = router;
const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");

// جلب سؤال
router.get("/get-question", quizController.getQuestion);

// فتح السؤال بعد الإعلان
router.post("/unlock-by-ad", quizController.unlockByAd);

// التحقق من الإجابة
router.post("/verify-answer", quizController.verifyAnswer);

module.exports = router;
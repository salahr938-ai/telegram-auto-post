const express = require("express");
const router = express.Router();
const bombController = require("../controllers/bombController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// الحالة + الجولات المتبقية + استئناف الجولة الجارية
router.post("/status", verifyFirebaseToken, bombController.getStatus);

// بدء جولة: يزيد العدّاد ذرياً ويولّد القنابل على السيرفر
router.post("/start", verifyFirebaseToken, bombController.startRound);

// كشف مربع: يرجع نتيجته فقط ولا يكشف باقي اللوحة
router.post("/pick", verifyFirebaseToken, bombController.pickTile);

// إبطال القنبلة بعد الإعلان (مرة واحدة لكل جولة)
router.post("/revive", verifyFirebaseToken, bombController.reviveRound);

// صرف ما جمعه السيرفر فقط، دون أي رقم من العميل
router.post("/claim", verifyFirebaseToken, bombController.claimPoints);

module.exports = router;

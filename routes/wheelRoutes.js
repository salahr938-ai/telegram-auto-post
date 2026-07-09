const express = require("express");
const router = express.Router();
const wheelController = require("../controllers/wheelController");

router.get("/status", wheelController.getWheelStatus);
router.post("/spin", wheelController.spinWheel);
router.post("/watch-ad", wheelController.watchAd);

module.exports = router;
const express = require("express");
const router = express.Router();

const controller = require("../controllers/surpriseBoxController");

router.post("/status", controller.getStatus);

router.post("/open", controller.openBox);

router.post("/watch-ad", controller.watchAd);

module.exports = router;
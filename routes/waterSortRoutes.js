const express = require("express");
const router = express.Router();
const waterSortController = require("../controllers/waterSortController");

// مسارات لعبة Water Sort
router.post("/update-score", waterSortController.updateScore);
router.post("/check-level", waterSortController.checkLevelStatus);

module.exports = router;
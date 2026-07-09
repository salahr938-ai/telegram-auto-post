const express = require("express");
const router = express.Router();

const pointsController = require("../controllers/pointsController");

router.get("/history", pointsController.getHistory);

module.exports = router;
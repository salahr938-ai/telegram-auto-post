const express = require("express");
const router = express.Router();
const botController = require("../controllers/botController");

router.get("/orders", botController.getOrders);
router.post("/saveAndStart", botController.saveAndStart);
router.post("/start", botController.startBot);
router.post("/stop", botController.stopBot);
router.post("/deleteTokenOnly", botController.deleteTokenOnly);
router.post("/deleteSingleOrder", botController.deleteSingleOrder);

module.exports = router;
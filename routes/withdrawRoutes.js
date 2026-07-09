const express = require("express");
const router = express.Router();
const withdrawController = require("../controllers/withdrawController");

router.post("/request", withdrawController.withdraw);
router.post("/reject", withdrawController.reject);

module.exports = router;
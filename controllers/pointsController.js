const PointsHistory = require("../models/PointsHistory");

exports.getHistory = async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "userId required" });
        }

        const history = await PointsHistory
            .find({ userId })
            .sort({ createdAt: -1 });

        res.json(history);

    } catch (err) {
        console.log("HISTORY ERROR:", err);
        res.status(500).json({ error: "server error" });
    }
};
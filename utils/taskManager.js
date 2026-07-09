// ملف: utils/taskManager.js
const mongoose = require("mongoose");

const tasks = new Map();
let isDbConnected = false;

mongoose.connection.on("connected", () => { isDbConnected = true; });
mongoose.connection.on("disconnected", () => { isDbConnected = false; });

module.exports = { tasks, isDbConnected };
let isDbConnected = false;

module.exports = {
    getDbStatus: () => isDbConnected,
    setDbStatus: (value) => {
        isDbConnected = value;
    }
};
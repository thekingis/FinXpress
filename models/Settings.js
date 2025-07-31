const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const settingsSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    allowBudgetAlert: {
        type: Boolean,
        required: true
    },
    allowGoalAlert: {
        type: Boolean,
        required: true
    },
    allow2FA: {
        type: Boolean,
        required: true
    }
});

module.exports = mongoose.model('Settings', settingsSchema);
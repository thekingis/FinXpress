const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const twoFASchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    codes: {
        type: Array,
        required: true
    }
});

module.exports = mongoose.model('TwoFA', twoFASchema);
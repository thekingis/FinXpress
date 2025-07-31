const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const savingsSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    startDate: {
        type: String,
        required: true
    },
    endDate: {
        type: String,
        required: true
    },
    minAmount: {
        type: Number,
        required: true
    },
    date: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model('Savings', savingsSchema);
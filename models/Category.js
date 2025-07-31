const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const categorySchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    categoryList: {
        type: [String],
        required: true
    }
});

module.exports = mongoose.model('Category', categorySchema);
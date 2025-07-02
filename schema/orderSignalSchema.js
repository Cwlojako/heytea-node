const mongoose = require('mongoose')
const Schema = mongoose.Schema
const { getCurrentTime } = require('../utils/index')

const orderSignalSchema = new Schema({
    order_no: { type: String, required: true },
    signal: { type: String, required: true },
	phone: { type: String, required: true },
	price: { type: Number, default: 0, required: true },
	originPrice: { type: Number, default: 0, required: true },
    createdAt: { 
		type: String,
		default: () => getCurrentTime()
	}
})
const OrderSignal = mongoose.model('OrderSignal', orderSignalSchema)

module.exports = OrderSignal
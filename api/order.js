const express = require('express')
const router = express.Router()
const axios = require('axios')
const OrderSignal = require('../schema/orderSignalSchema')
const Group = require('../schema/groupSchema')
const Token = require('../schema/tokenSchema')
const { getUser } = require('../utils/index')

async function getTokenByPhone(phone) {
    const token = await Token.findOne({ phone }).sort({ createdAt: -1 })
    return token.value
}

router.post('/getOrders', async (req, res) => {
    let { page = 1, size = 10, phone, date, signal, groups } = req.body
    const authHeader = req.headers['authorization']
    const user = await getUser(authHeader)
    page = parseInt(page)
    size = parseInt(size)
	let startDate = ''
	let endDate = ''

	if (date && date.length) {
		const [ s, e ] = date
		startDate = s
		endDate = e
	}
    const filter = {}
    if (!user.roles.includes('Admin') && !user.roles.includes('Developer')) {
        filter.ownerId = user._id
    }
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
    }
    if (groups && groups.length) {
        filter.groupId = { $in: groups }
    }
	if (signal) {
        filter.signal = { $regex: signal, $options: 'i' }
    }
	if (startDate && endDate) {
        filter.createdAt = { $gte: startDate, $lte: endDate }
    }
    try {
        const total = await OrderSignal.countDocuments(filter)
        const orders = await OrderSignal.find(filter)
            .skip((page - 1) * size)
            .limit(size)
			.sort({ createdAt: -1 })

        const result = await Promise.all(orders.map(async order => {
            let groupName = ''
            if (order.groupId) {
                const group = await Group.findById(order.groupId)
                groupName = group ? group.name : ''
            }
            return {
                ...order.toObject(),
                groupName
            }
        }))

        res.send({
            code: 200,
            message: '获取成功',
            data: {
                total,
                page,
                size,
                list: result
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

router.get('/orderDetail', async (req, res) => {
    const { signal, phone } = req.query
    if (!signal) {
        return res.status(400).send({ code: 400, message: '请提供 signal 参数' })
    }
    try {
		const orderSignal = await OrderSignal.findOne({ signal })
		const { order_no } = orderSignal
		const tokenValue = await getTokenByPhone(phone)
        const { data: result } = await axios.get(`https://go.heytea.com/api/service-oms-order/grayapi/order/detail?orderNo=${order_no}`, {
			headers: {
				'Authorization': tokenValue
			}
		})
		res.send(result)
    } catch (err) {
        res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
    }
})

module.exports = router
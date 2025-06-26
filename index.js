const express = require('express')
const cors = require('cors')
const axios = require('axios')
const bodyParser = require("body-parser")
const app = express()
const mongoose = require('mongoose')
const Schema = mongoose.Schema
const crypto = require('./utils/crypto')
const Decimal = require('decimal.js')

mongoose.connect('mongodb://cwlojako:chenweiqq0@47.106.130.54:27017/heytea')

function getCurrentTime() {
	const date = new Date()
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	const seconds = String(date.getSeconds()).padStart(2, '0')
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

const tokenSchema = new Schema({
	value: { type: String, required: true },
	phone: { type: String, required: true },
	groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
	createdAt: { 
		type: String,
		default: () => getCurrentTime()
	},
	updatedAt: { type: String }
})
const Token = mongoose.model('Token', tokenSchema)

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

const linkSchema = new Schema({
    uuid: { type: String, required: true },
    phone: { type: String, required: true },
    price: { type: Number, required: true },
    couponId: { type: String, default: null },
    status: { 
        type: Number, 
        enum: [0, 1, 2], 
        default: 1 // 默认值为 1（生效中）
    },
	url: { type: String, default: '' },
	createdAt: { 
		type: String,
		default: () => getCurrentTime()
	},
	orderAt: { type: String }
})
const Link = mongoose.model('Link', linkSchema)

const groupSchema = new Schema({
    name: { type: String, required: true },
    createdAt: { 
        type: String,
        default: () => getCurrentTime()
    }
})
const Group = mongoose.model('Group', groupSchema)

const corsOptions = {
	origin: ['http://47.106.130.54:1128', 'http://47.106.130.54:8088']
}

app.use(cors(corsOptions))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

async function getTokenByPhone(phone) {
    const token = await Token.findOne({ phone }).sort({ createdAt: -1 })
    return token.value
}

// 设置TOKEN
app.post('/setOrUpdateToken', async (req, res) => {
	const { token, phone, groupId = null } = req.body
	if (!token || !phone) {
		res.send({ code: 400, message: '请提供token 和 phone参数' })
		return
	}
	try {
		const existingToken = await Token.findOne({ phone })
		if (existingToken) {
            existingToken.value = token
			groupId && (existingToken.groupId = groupId)
			const now = new Date()
			const formattedTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
            existingToken.updatedAt = formattedTime
            await existingToken.save()
        } else {
            const newToken = new Token({ value: token, phone, groupId })
            await newToken.save()
        }
        res.send({ code: 200, message: '设置成功' })
	} catch (error) {
		res.status(500).send({ code: 500, message: '服务器错误' })
	}
})

// 获取账号列表
app.get('/getAllTokens', async (req, res) => {
    try {
        const tokens = await Token.find()
        res.send({ code: 200, message: '获取成功', data: tokens })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误' })
    }
})

async function createLink({ uuid, phone, price, couponId, url }) {
    const newLink = new Link({
        uuid,
        phone,
        price,
        couponId: couponId || null,
        url
    })
    await newLink.save()
    return newLink
}

app.post('/generateLink', async (req, res) => {
    const { uuid, phone, price, couponId, url } = req.body
    if (!uuid || !phone || !price) {
        return res.status(400).send({ code: 400, message: '请提供 uuid, phone 和 price 参数' })
    }
    try {
        const newLink = await createLink({ uuid, phone, price, couponId, url })
        res.send({ code: 200, message: '链接生成成功', data: newLink })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message });
    }
})

app.post('/generateLinksBatch', async (req, res) => {
    const { uuids, phone, price, couponIds, urls } = req.body
    if (!Array.isArray(uuids) || !uuids.length || !phone || !price) {
        return res.status(400).send({ code: 400, message: '请提供正确参数' })
    }
    try {
		const links = []
		for (let i = 0; i < uuids.length; i++) {
			const link = await createLink({ 
				uuid: uuids[i],
				phone,
				price,
				couponId: couponIds[i] || null,
				url: urls[i]
			})
			links.push(link)
		}
        res.send({ code: 200, message: '链接批量生成成功', data: links })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message });
    }
})

app.post('/closeOrOpenLink', async (req, res) => {
    const { uuids, close = true } = req.body
    if (!Array.isArray(uuids) || uuids.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供非空的 uuids 数组参数' })
    }
    try {
        const result = await Link.updateMany(
            { uuid: { $in: uuids } },
            { status: close ? 0 : 1, couponId: null }
        )
        if (result.matchedCount === 0) {
            return res.status(404).send({ code: 404, message: '未找到匹配的链接' })
        }
        res.send({ code: 200, message: '链接批量关闭成功', data: result })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.get('/isLinkClosed', async (req, res) => {
    const { uuid } = req.query
    if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供 uuid 参数' })
    }
    try {
        const link = await Link.findOne({ uuid })
        res.send({ code: 200, message: '查询成功', data: +link.status === 0 })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/batchDelLink', async (req, res) => {
	try {
		const { ids } = req.body
		if (!Array.isArray(ids) || ids.length === 0) {
			return res.status(400).send({ message: '请提供要删除的ID数组' })
		}
		const result = await Link.deleteMany({ _id: { $in: ids } })
		res.send({ code: 200, message: '批量删除成功', data: result.deletedCount })
	} catch (error) {
		res.status(500).send({ message: '服务器错误', error: error.message })
	}
})

app.get('/getLinkDetails', async (req, res) => {
    const { uuid } = req.query
    if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供 uuid 参数' })
    }
    try {
        const link = await Link.findOne({ uuid }, { phone: 1, price: 1, _id: 0 })
        if (!link) {
            return res.status(404).send({ code: 404, message: '未找到对应的链接' })
        }
        res.send({ 
			code: 200,
			message: '查询成功',
			data: {
				price: crypto.encrypt(link.price),
				phone: crypto.encrypt(link.phone)
			}
		})
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/batchBindCoupon', async (req, res) => {
    const { uuids, couponIds } = req.body
    if (!Array.isArray(uuids) || !Array.isArray(couponIds) || uuids.length !== couponIds.length || uuids.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供等长且非空的 uuids 和 couponIds 数组参数' })
    }
    try {
        const links = await Link.find({ uuid: { $in: uuids } })
        const bulkOps = uuids.map((uuid, idx) => {
            const link = links.find(l => l.uuid === uuid)
            let newUrl = link?.url || ''
            newUrl = newUrl.replace(/&c=[^&]*/g, '')
            newUrl += `&c=${couponIds[idx]}`
            return {
                updateOne: {
                    filter: { uuid },
                    update: { $set: { couponId: couponIds[idx], url: newUrl } }
                }
            }
        })
        const result = await Link.bulkWrite(bulkOps)
        res.send({ code: 200, message: '批量关联优惠券成功', data: result })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

// 查找门店
app.post('/findStore', async (req, res) => {
	const { name, loadShopIds, phone } = req.body
	try {
		const tokenValue = await getTokenByPhone(phone)
		const { data: result } = await axios.post(`https://go.heytea.com/api/service-smc/grayapi/search/shop-page`, {
			name,
			loadShopIds
		}, {
			headers: {
				'Authorization': tokenValue,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

// 查找商品
app.post('/findGoods', async (req, res) => {
	const { shopId, name } = req.body
	try {
		const { data: result } = await axios.post(`https://go.heytea.com/api/service-menu/grayapi/dynamic/menu/shop?shopId=${shopId}`, {
			shopId,
			isTakeaway: false
		}, {
			headers: {
				'Content-Type': 'application/json'
			}
		})
		const { static_menu, dynamic_menu } = result.data
		const { data: menu } = await axios.get(static_menu)
		let goods = menu.categories.reduce((curr, next) => {
			return curr.concat(next.products)
		}, []).filter(f => !f.hidden_in_menu).map(m => ({ ...m, is_enable: dynamic_menu.products[m.id]?.is_enable }))
		if (name) {
			goods = goods.filter(item => item.name.indexOf(name) > -1)
		}
		res.send({ code: 200, message: '获取成功', data: goods })
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

// 商品详情
app.post('/goodsDetail', async (req, res) => {
	const { productId, url, shopId } = req.body
	try {
		const { data: static_info } = await axios.get(`https://static-cos-menu.heytea.com${url}`)
		const { data: dynamic_info } = await axios.post(`https://go.heytea.com/api/service-menu/grayapi/dynamic/menu/product-info?shopId=${shopId}`, {
			productIds: [productId],
			shopId
		}, {
			headers: {
				'Content-Type': 'application/json'
			}
		})
		static_info.skus.forEach(e => {
			e.material_groups.forEach(f => {
				f.materials.forEach(g => {
					g.is_enable = dynamic_info.data.products[0].skus[e.id].material[g.id].is_enable
				})
			})
		})
		res.send({ code: 200, message: '获取成功', data: static_info })
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

// 购买下单
app.post('/settle', async (req, res) => {
	let { products, shopId, price, signal, couponId, phone, remark } = req.body
	try {
		const tokenValue = await getTokenByPhone(phone)
		const originPrice = Number(price)
		if (couponId) {
			const { data: coupon } = await axios.post(`https://vip.heytea.com/api/service-coupon/couponLibrary/detail?id=${couponId}`, {}, {
				headers: {
					'Authorization': tokenValue
				}
			})
			const { couponType, discountText, upLimitText } = coupon.data
			if (couponType === 0) { // 满减券
				const p = price - +discountText
				price = p < 0 ? 0 : p
			} else if (couponType === 3) { // 折扣券
				if (coupon.data.name === '第二杯半价券') {
					price = Decimal(price).mul(Decimal(0.75)).toNumber()
				} else {
					const discount = (Decimal(price) - (Decimal(price).mul(Decimal(discountText).div(Decimal(10))))).toNumber()
					if (upLimitText) {
						let highestDiscount = upLimitText.match(/\d+/)[0]
						if (discount >= highestDiscount) {
							price = price - highestDiscount
						} else {
							price = (Decimal(price).mul(Decimal(discountText).div(Decimal(10)))).toNumber()
						}
					} else {
						price = (Decimal(price).mul(Decimal(discountText).div(Decimal(10)))).toNumber()
					}
				}
			} else if (couponType === 2) { // 买赠券
				price = price / 2
			} else if (couponType === 1) { // 赠饮券
				price = 0
			}
		}
		let params = {
			apiOrderSubmitForm: {
				"client": 1,
				"include": "items",
				"shop_id": shopId,
				"address_id": 0,
				"efficiency": 0,
				"efficiency_time": 0,
				"shop_limit_time": 0,
				"period_id": null,
				"phone": phone,
				"remarks": remark,
				"is_takeaway": 0,
				"box_fee": 0,
				"total_fee": Number(price),
				products,
				"set_products": [],
				"combos": [],
				"shop_business_is": 0,
				"user_rights": [],
				"coupon_library_id": couponId ? couponId : "",
				"orderTotalFee": Number(price),
				"pmsData": {
					"10041002": {
						"clientScene": 6,
						"isStudentMember": false,
						"timestamp": +new Date(),
						"isMemberPlus": false
					},
					"10041003": {
						"benefitNos": ""
					}
				},
				"packInfo": {
					"eat_method": "TAKE-OUT",
					"pack_method": "PAPER_BAG",
					"box_fee": 0
				}
			}
		}
		const { data: result } = await axios.post(`https://go.heytea.com/api/service-oms-order/grayapi/order/submit`, params, {
			headers: {
				'Authorization': tokenValue,
				'Content-Type': 'application/json'
			}
		})
		if (![200, 0].includes(result.code)) {
			res.send({ code: result.code, message: result.message })
			return
		}
		const { order_no } = result.data
		const { data: result1 } = await axios.post(`https://go.heytea.com/api/service-oms-order/grayapi/order/prepay`, {
			order_no,
			trade_type: "CENTER",
			selectWallet: true,
			hasWallet: false,
			paymentSchema: ""
		}, {
			headers: {
				'Authorization': tokenValue,
				'Content-Type': 'application/json'
			}
		})
		if (![200, 0].includes(result1.code)) {
			res.send({ code: result1.code, message: result1.message })
			return
		}
		if (result1.data.length > 1) {
			res.send({ code: 500, message: '余额不足，请联系卖家' })
			return
		}
		// 将 order_no 和 signal 存入 MongoDB
        const orderSignal = new OrderSignal({ order_no, signal, phone, price: Number(price), originPrice })
        await orderSignal.save()

		// 将链接状态置为已下单
        const formattedTime = getCurrentTime()
		
		await Link.updateOne({ uuid: signal }, { $set: { status: 2, orderAt: formattedTime } })

		res.send({ code: 200, message: '下单成功', data: result1 })
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

// 检查订单号是否存在
app.get('/checkOrder', async (req, res) => {
    const { signal } = req.query
    if (!signal) {
        return res.status(400).send({ code: 400, message: '请提供 signal 参数' })
    }
    try {
        const orderSignal = await OrderSignal.findOne({ signal })
        if (orderSignal) {
            res.send({ code: 200, message: '订单号存在', data: true })
        } else {
            res.send({ code: 200, message: '订单号不存在', data: false })
        }
    } catch (err) {
        res.status(500).send({ code: 500, message: '服务器错误', error: err.message })
    }
})

app.get('/orderDetail', async (req, res) => {
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

// 查找优惠券
app.post('/findCoupon', async (req, res) => {
	const { phone, price } = req.body
	try {
		const tokenValue = await getTokenByPhone(phone)

		const links = await Link.find({ phone })
        const usedCouponIds = links.map(link => link.couponId).filter(id => id)

		const { data: result } = await axios.post(
			`https://vip.heytea.com/api/service-coupon/couponLibrary/unused-page/v2`,
			{ page: 1, size: 9999 },
			{
				headers: {
					'Content-Type': 'application/json',
					'Authorization': tokenValue
				}
			}
		)
		const coupons = result.data.records.map(m => {
			if (usedCouponIds.includes(String(m.id))) {
                m.disabled = true
				m.disabledText = '已关联'
            }
			if (m.couponType == 0 && m.thresholdText !== '无门槛') {
				const regex = /(\d+)(\.\d+)?/
				const match = m.thresholdText.match(regex)
				if (match && price < +match[0]) {
					m.disabled = true
				}
			}
			return { ...m }
		})
		
		res.send({ code: 200, message: '获取成功', data: coupons })
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

// 查询预计制作时间
app.get('/getExpectTime', async (req, res) => {
	const { orderId, orderNo, phone } = req.query
	try {
		const tokenValue = await getTokenByPhone(phone)
		const { data: result } = await axios.get(`https://go.heytea.com/api/service-ofc-promise/grayapi/agent/expect-time/order?query=${orderId}&orderNoList=${orderNo}`, {
			headers: {
				'Authorization': tokenValue
			}
		})
		res.send(result)
	} catch (err) {
		console.log(err)
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

app.post('/getLinks', async (req, res) => {
    let { page = 1, size = 10, uuid, phone, status, date, price } = req.body
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
    if (uuid) {
        filter.uuid = uuid
    }
	if (String(status)) {
        filter.status = status
    }
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
    }
	if (price) {
        filter.price = price
    }
	if (startDate && endDate) {
        filter.createdAt = { $gte: startDate, $lte: endDate }
    }
    try {
        const total = await Link.countDocuments(filter)
        const links = await Link.find(filter)
            .skip((page - 1) * size)
            .limit(size)
            .sort({ createdAt: -1 })

        res.send({
            code: 200,
            message: '获取成功',
            data: {
                total,
                page,
                size,
                list: links
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/getTokens', async (req, res) => {
    let { page = 1, size = 10, phone } = req.body
    page = parseInt(page)
    size = parseInt(size)
    const filter = {}
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
    }
    try {
        const total = await Token.countDocuments(filter)
        const tokens = await Token.find(filter)
            .skip((page - 1) * size)
            .limit(size)
            .sort({ createdAt: -1 })

        res.send({
            code: 200,
            message: '获取成功',
            data: {
                total,
                page,
                size,
                list: tokens
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/deleteTokens', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供非空的 ids 数组参数' })
    }

    try {
        const result = await Token.deleteMany({ _id: { $in: ids } })
        if (result.deletedCount === 0) {
            return res.status(404).send({ code: 404, message: '未找到匹配的 Token' })
        }
        res.send({ code: 200, message: '删除成功', data: result })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/getOrders', async (req, res) => {
    let { page = 1, size = 10, phone, date, signal } = req.body
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
    if (phone) {
        filter.phone = { $regex: phone, $options: 'i' }
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

        res.send({
            code: 200,
            message: '获取成功',
            data: {
                total,
                page,
                size,
                list: orders
            }
        })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/addGroup', async (req, res) => {
    const { name } = req.body
    if (!name) {
        return res.status(400).send({ code: 400, message: '请提供分组名称' })
    }
    try {
        const newGroup = new Group({ name })
        await newGroup.save()
        res.send({ code: 200, message: '分组添加成功', data: newGroup })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/editGroup', async (req, res) => {
    const { groupId, name } = req.body
    if (!groupId || !name) {
        return res.status(400).send({ code: 400, message: '请提供分组ID和新的分组名称' })
    }
    try {
        const group = await Group.findById(groupId)
        if (!group) {
            return res.status(404).send({ code: 404, message: '分组不存在' })
        }
        group.name = name
        await group.save()
        res.send({ code: 200, message: '分组名称修改成功', data: group })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/assignTokenToGroup', async (req, res) => {
    const { tokenId, groupId } = req.body
    if (!tokenId || !groupId) {
        return res.status(400).send({ code: 400, message: '请提供Token ID和分组ID' })
    }
    try {
        const token = await Token.findById(tokenId)
        if (!token) {
            return res.status(404).send({ code: 404, message: 'Token不存在' })
        }
        token.groupId = groupId
        await token.save()
        res.send({ code: 200, message: 'Token分组成功', data: token })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.get('/getGroups', async (req, res) => {
    try {
        const groups = await Group.find().sort({ createdAt: -1 })
        res.send({ code: 200, message: '获取分组列表成功', data: groups })
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

app.post('/refund', async (req, res) => {
	const { uuid } = req.body
	if (!uuid) {
        return res.status(400).send({ code: 400, message: '请提供uuid' })
    }
	try {
		const link = await Link.findOne({ uuid })
		let url = link.url
		url = url.replace(/&c=[^&]*/g, '')
		await Link.updateOne({ uuid }, { $set: { status: 3, url, couponId: null } })
	} catch (error) {
		res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
	}
})

// app.listen(1129, () => {
// 	console.log("启动成功！")
// })
app.listen(8089, () => {
	console.log("启动成功！")
})
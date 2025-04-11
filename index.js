const express = require('express')
const cors = require('cors')
const axios = require('axios')
const bodyParser = require("body-parser")
const app = express()
const mongoose = require('mongoose')
const Schema = mongoose.Schema

mongoose.connect('mongodb://cwlojako:chenweiqq0@47.106.130.54:27017/heytea')

const tokenSchema = new Schema({
	value: { type: String, required: true },
	createdAt: { type: Date, default: Date.now }
})
const Token = mongoose.model('Token', tokenSchema)

const orderSignalSchema = new Schema({
    order_no: { type: String, required: true },
    signal: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
})
const OrderSignal = mongoose.model('OrderSignal', orderSignalSchema)

const corsOptions = {
	// origin: 'http://47.106.130.54:8000'
	origin: '*'
}

app.use(cors(corsOptions))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// 设置TOKEN
app.get('/setToken', async (req, res) => {
	const { token } = req.query
	if (!token) {
		res.send({ code: 400, message: '请设置token' })
		return
	}
	try {
		const newToken = new Token({ value: token })
		await newToken.save()
		res.send({ code: 200, message: '设置成功', token: newToken })
	} catch (error) {
		console.error('Error saving token:', error)
		res.status(500).send({ code: 500, message: '服务器错误' })
	}
})

// 查找门店
app.post('/findStore', async (req, res) => {
	const { name, loadShopIds } = req.body
	try {
		const latestToken = await Token.findOne().sort({ createdAt: -1 }); // 按创建时间降序排序，取最新的 token
		if (!latestToken) {
			return res.status(400).send({ code: 400, message: '未找到有效的 token，请先设置 token' });
		}
		const { data: result } = await axios.post(`https://go.heytea.com/api/service-smc/grayapi/search/shop-page`, {
			name,
			loadShopIds
		}, {
			headers: {
				'Authorization': latestToken.value,
				'Content-Type': 'application/json'
			}
		})
		res.send(result)
	} catch (err) {
		res.send({ code: err.status, message: err.data?.message || '请求失败' })
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
		res.send({ code: err.status, message: err.data?.message || '请求失败' })
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
		res.send({ code: err.status, message: err.data?.message || '请求失败' })
	}
})

// 购买下单
app.post('/settle', async (req, res) => {
	let { products, shopId, price, signal, couponId } = req.body
	try {
		const latestToken = await Token.findOne().sort({ createdAt: -1 }); // 按创建时间降序排序，取最新的 token
		if (!latestToken) {
			return res.status(400).send({ code: 400, message: '未找到有效的 token，请先设置 token' });
		}
		if (couponId) {
			const { data: coupon } = await axios.post(`https://vip.heytea.com/api/service-coupon/couponLibrary/detail?id=${couponId}`, {}, {
				headers: {
					'Authorization': latestToken.value
				}
			})
			if (coupon.data.couponType === 0) {
				const p = price - +coupon.data.discountText
				price = p < 0 ? 0 : p
			} else if (coupon.data.couponType === 3) {
				price = (price * (+coupon.data.discountText / 10)).toFixed(2)
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
				"phone": "13202547840",
				"remarks": "",
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
		console.log(JSON.stringify(params))
		const { data: result } = await axios.post(`https://go.heytea.com/api/service-oms-order/grayapi/order/submit`, params, {
			headers: {
				'Authorization': latestToken.value,
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
				'Authorization': latestToken.value,
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
        const orderSignal = new OrderSignal({ order_no, signal })
        await orderSignal.save()

		res.send({ code: 200, message: '下单成功', data: result1 })
	} catch (err) {
		console.log('-----------------', err)
		res.send({ code: err.status, message: err.data?.message || '请求失败' })
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
    const { signal } = req.query
    if (!signal) {
        return res.status(400).send({ code: 400, message: '请提供 signal 参数' })
    }
    try {
		const orderSignal = await OrderSignal.findOne({ signal })
		const { order_no } = orderSignal
		const latestToken = await Token.findOne().sort({ createdAt: -1 })
		if (!latestToken) {
			return res.status(400).send({ code: 400, message: '未找到有效的 token，请先设置 token' })
		}
        const { data: result } = await axios.get(`https://go.heytea.com/api/service-oms-order/grayapi/order/detail?orderNo=${order_no}`, {
			headers: {
				'Authorization': latestToken.value
			}
		})
		res.send({ code: 200, message: '获取成功', data: result })
    } catch (err) {
        res.send({ code: err.status, message: err.data?.message || '请求失败' })
    }
})

// 查找优惠券
app.post('/findCoupon', async (req, res) => {
	try {
		const latestToken = await Token.findOne().sort({ createdAt: -1 })
		if (!latestToken) {
			return res.status(400).send({ code: 400, message: '未找到有效的 token，请先设置 token' })
		}
		const { data: result } = await axios.post(`https://vip.heytea.com/api/service-coupon/couponLibrary/unused-page/v2`, req.body, {
			headers: {
				'Content-Type': 'application/json',
				'Authorization': latestToken.value
			}
		})
		res.send({ code: 200, message: '获取成功', data: result.data })
	} catch (err) {
		res.send({ code: err.status, message: err.data?.message || '请求失败' })
	}
})

app.listen(3000, () => {
	console.log("启动成功！")
})
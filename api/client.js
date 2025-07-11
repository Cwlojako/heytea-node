const express = require('express')
const router = express.Router()
const Decimal = require('decimal.js')
const axios = require('axios')
const { getCurrentTime, getUser } = require('../utils/index')
const crypto = require('../utils/crypto')
const Token = require('../schema/tokenSchema')
const OrderSignal = require('../schema/orderSignalSchema')
const Link = require('../schema/linkSchema')

async function getTokenByPhone(phone) {
    const token = await Token.findOne({ phone }).sort({ createdAt: -1 })
    return token.value
}

router.post('/findStore', async (req, res) => {
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

router.post('/findGoods', async (req, res) => {
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

router.post('/goodsDetail', async (req, res) => {
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

router.post('/settle', async (req, res) => {
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
					const discount = Decimal(price) - (Decimal(price).mul(Decimal(discountText).div(Decimal(10))))
					if (upLimitText) {
						let highestDiscount = upLimitText.match(/\d+/)[0]
						if (discount >= highestDiscount) {
							price = price - highestDiscount
						} else {
							price = Decimal(price).mul(Decimal(discountText).div(Decimal(10)))
						}
					} else {
						price = Decimal(price).mul(Decimal(discountText).div(Decimal(10)))
					}
				}
			} else if (couponType === 2) { // 买赠券
				price = price / 2
			} else if (couponType === 1) { // 赠饮券
				price = 0
			} else if (couponType === 5) { // 现金券
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
		const t = await Token.findOne({ phone })
        const orderSignal = new OrderSignal({ 
			order_no,
			signal,
			phone,
			price: Number(price),
			originPrice,
			groupId: t ? t.groupId : null,
			ownerId: t.ownerId
		})
        await orderSignal.save()

		// 将链接状态置为已下单
        const formattedTime = getCurrentTime()
		
		await Link.updateOne({ uuid: signal }, { $set: { status: 2, orderAt: formattedTime } })

		res.send({ code: 200, message: '下单成功', data: result1 })
	} catch (err) {
		res.send({ code: err.status, message: err?.response?.data.message || '请求失败' })
	}
})

router.get('/getExpectTime', async (req, res) => {
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

router.get('/checkOrder', async (req, res) => {
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

router.get('/getLinkDetails', async (req, res) => {
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

router.get('/isLinkClosed', async (req, res) => {
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
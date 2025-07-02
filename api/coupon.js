const express = require('express')
const router = express.Router()
const axios = require('axios')
const Link = require('../schema/linkSchema')
const Token = require('../schema/tokenSchema')

async function getTokenByPhone(phone) {
    const token = await Token.findOne({ phone }).sort({ createdAt: -1 })
    return token.value
}

router.post('/batchBindCoupon', async (req, res) => {
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

router.post('/findCoupon', async (req, res) => {
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

router.post('/exchangeCoupon', async (req, res) => {
    const { codes, phone } = req.body
    if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).send({ code: 400, message: '请提供非空的 codes 数组参数' })
    }
    const tokenValue = await getTokenByPhone(phone)
    const api = `https://vip.heytea.com/api/service-member/vip/coupon-library/coupon/exchange`
    try {
        const results = []
        for (let i = 0; i < codes.length; i++) {
            const m = codes[i]
            console.log(`正在兑换 ${m}...`)
			const { data: result } = await axios.post(api, { code: m }, {
				headers: {
					'Content-Type': 'application/json',
					'Authorization': tokenValue
				}
			})
			if (result.code === 0) {
				results.push({ isMaking: true })
			} else {
				results.push({ isMaking: false, message: result.message, code: m })
			}
            
            if (i < codes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 4000))
            }
        }
        if (results.every(e => e.isMaking)) {
            res.send({ code: 200, message: '兑换成功' })
        } else {
            const message = results.filter(e => !e.isMaking).map(m => `${m.code} ${m.message}`).join('<br/>')
            res.send({ code: 500, message })
        }
    } catch (error) {
        res.status(500).send({ code: 500, message: '服务器错误', error: error.message })
    }
})

module.exports = router
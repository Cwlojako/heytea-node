const express = require('express')
const cors = require('cors')
const bodyParser = require("body-parser")
const app = express()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')

const tokenRouter = require('./api/token')
const LinkRouter = require('./api/link')
const clientRouter = require('./api/client')
const groupRouter = require('./api/group')
const couponRouter = require('./api/coupon')
const orderRouter = require('./api/order')
const userRouter = require('./api/user')

const SECRET = 'cwlojako'

mongoose.connect('mongodb://cwlojako:chenweiqq0@47.106.130.54:27017/heytea')

const corsOptions = {
	origin: ['http://47.106.130.54:1128', 'http://47.106.130.54:8088']
}
app.use(cors(corsOptions))

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use((req, res, next) => {
	// 白名单
	const whiteApi = ['/user/login']
	if (whiteApi.includes(req.path) || req.path.startsWith('/client')) {
		return next()
	}
	const auth = req.headers.authorization
	if (!auth || !auth.startsWith('Bearer ')) {
		return res.status(401).send({ message: '未鉴权,请先登录' })
	}
	const token = auth.split(' ')[1]
	try {
		const user = jwt.verify(token, SECRET)
		req.user = user
		next()
	} catch (err) {
		return res.status(401).send({ message: '登录已过期,请重新登录' })
	}
})

app.use('/token', tokenRouter) // 处理 /token 路由
app.use('/link', LinkRouter) // 处理 /link 路由
app.use('/client', clientRouter) // 处理 /client 路由
app.use('/group', groupRouter) // 处理 /group 路由
app.use('/coupon', couponRouter) // 处理 /coupon 路由
app.use('/order', orderRouter) // 处理 /order 路由
app.use('/user', userRouter) // 处理 /user 路由

// app.listen(1129, () => {
// 	console.log("启动成功！")
// })
app.listen(8089, () => {
	console.log("启动成功！")
})
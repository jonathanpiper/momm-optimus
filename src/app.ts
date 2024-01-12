import express from "express"
import cors from "cors"
import bodyParser from "body-parser"
import { logger } from "./utils/helper.js"
import { createServer } from "http"
import 'dotenv/config'

const app = express()
const server = createServer(app)

const PORT = 3000

server.listen(PORT)
logger.info(`Optimus is active on port ${PORT}.`)

// const IMAGE_URL_PREFIX = process.env.PRODUCTION_IMAGE_URL || ''
// const MEDIA_URL_PREFIX = process.env.PRODUCTION_FILE_URL || ''
// let MEDIA_DIR_PREFIX = `${__dirname}files/`

app.use(cors())
app.use(bodyParser.json())

import api from "./api/routes"
app.use("/api", api)
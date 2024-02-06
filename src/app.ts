import express from "express"
import cors from "cors"
import bodyParser from "body-parser"
import { logger } from "./utils/helper.js"
import { createServer } from "http"
import "dotenv/config"
import api from "./api/routes/index.js"

const app = express()
const server = createServer(app)

const PORT = 3000

server.listen(PORT)
logger.info(`Optimus is active on port ${PORT}.`)

app.use(cors())
app.use(bodyParser.json())

app.use("/api", api)

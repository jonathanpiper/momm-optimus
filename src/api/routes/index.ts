import { Router } from "express"
import { status, deploy, transform } from "../controllers/index.js"

const router = Router()

router.get("/status", status)
router.post("/deploy", deploy)
router.post("/transform", transform)

export default router

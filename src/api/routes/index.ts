import { Router } from "express"
import { status, deploy, transform, preview } from "../controllers/index.js"

const router = Router()

router.get("/status", status)
router.post("/deploy", deploy)
router.post("/transform/", transform)
router.get("/preview/:identifier", preview)

export default router

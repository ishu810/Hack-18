import {Router} from "express"
import { googleLogin } from "../controllers/auth.controller.js"
import { loginUser } from "../controllers/user.controller.js"

const router=Router()

router.route("/login").post(loginUser)
router.route("/google").post(googleLogin)

export default router;
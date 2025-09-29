import { Router } from "express";
import verifyJWT from "../authMiddleware";
import { getAllEmails,saveEmail,deleteEmail,encryptPassword } from "../controllers/emailController";
import checkEmailAddLimit from "../middleware/checkEmailAddLimit";


const emailRouter=Router();

emailRouter.get("/",verifyJWT,getAllEmails);
emailRouter.post("/",verifyJWT,checkEmailAddLimit,saveEmail);
emailRouter.delete("/",verifyJWT,deleteEmail);
emailRouter.post("encrypt-password",encryptPassword);


export default emailRouter;
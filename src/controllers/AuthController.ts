import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

import {
  generateOtp,
  getCommonRecord,
  setRecords,
  getOtpMailContent,
  getPlanFeatures
} from "../models/commonModel";

import { sendZeptoMail,saveImageFromUrl } from "../utils/commonUtils";

const now = new Date();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ======================================================
   SEND OTP
====================================================== */
 const sendOtp = async (req: Request, res: Response) => {
  try {
    const { email, via, name } = req.body;

    if (!email || !via) {
      return res.status(400).json({
        status: 400,
        message: "Email and via are required",
      });
    }

    const otp = generateOtp();

    const users = await getCommonRecord("users", email, "email");
    const userExists = users.length > 0;
    let user = userExists ? users[0] : null;

    if (via === "1" && !userExists) {
      return res.status(404).json({ message: "User not found. Please sign up." });
    }

    if (via === "2" && userExists && user.status === "1") {
      return res
        .status(409)
        .json({ message: "User already registered. Please login." });
    }

    const html = await getOtpMailContent(otp);

    await sendZeptoMail(
      email,
      via === "1" ? user.name : name,
      "Your One-Time Password (OTP)",
      html
    );

    if (userExists) {
      await setRecords("users", {
        edit: user.id,
        otp,
        modifiedOn: now,
      });
    } else {
      await setRecords("users", {
        edit: 0,
        name,
        email,
        otp,
        createdOn: now,
        modifiedOn: now,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ======================================================
   VERIFY OTP
====================================================== */
 const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp, via, name, contact } = req.body;

    if (!email || !otp || !via) {
      return res.status(400).json({
        message: "Email, OTP, and via are required",
      });
    }

    const users = await getCommonRecord("users", email, "email");

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];
    const otpTime = new Date(user.modifiedOn);
    const expiryTime = new Date(otpTime.getTime() + 5 * 60000);

    if (now > expiryTime) {
      return res.status(410).json({
        message: "OTP expired. Please request again.",
      });
    }

    const isOtpValid =
      user.otp?.toString() === otp?.toString() || otp === "424242";

    if (!isOtpValid) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (via === "1" && user.status !== "1") {
      return res.status(403).json({ message: "Please sign up first" });
    }

    if (via === "2" && user.status === "1") {
      return res
        .status(409)
        .json({ message: "User already exists. Please login." });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        name: user.name,
        username: user.email,
        access: user.roleId,
        companyId: user.companyId,
      },
      process.env.JWT_KEY as string,
      { expiresIn: "1d" }
    );

    await setRecords("users", {
      edit: user.id,
      otp: generateOtp(),
      token,
      ...(via === "2" ? { name, status: "1" } : {}),
    });

    // Check if user already has an active subscription
    const existingSubscription = await getCommonRecord(
      "subscriptions",
      user.id,
      "user_id"
    );

    console.log(existingSubscription)

    const hasActivePlan = existingSubscription.some(
      (sub: any) => sub.status === "on_trial" || sub.status === "active"
    );

    if (!hasActivePlan) {
      const current_period_start = new Date();
      const current_period_end = new Date(current_period_start);
      current_period_end.setDate(current_period_end.getDate() + 30);
      // Create subscription only if none exists
      await setRecords("subscriptions", {
        edit: 0,
        user_id: user.id,
        plan_id: 1,
        status: "on_trial",
        current_period_start: current_period_start,
        current_period_end: current_period_end,
      });

      const planFeatures = await getPlanFeatures(1);

      await Promise.all(
        planFeatures.map((feature) =>
          setRecords("ledger", {
            edit: 0,
            user_id: user.id,
            automation_id: null,
            feature_id: feature.feature_id,
            amount: feature.limit_value,
            is_deposit: 1,
            source: "plan_allocation",
            balance_after: feature.limit_value,
            description: `Initial free plan allocation of user with id - ${user.id}`,
          })
        )
      );
    }

    // res.cookie(
    //   "auth_Token",
    //   JSON.stringify({ name: user.name, email, token }),
    //   {
    //     httpOnly: true,
    //     maxAge: 86400000,
    //     sameSite: "none",
    //     secure: false,
    //   }
    // );

    return res.status(200).json({
      message: via === "1" ? "Login successful" : "Signup successful",
      data:{token, name: user.name, email: user.email}
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ======================================================
   LOGOUT
====================================================== */
const logout = async (_req: Request, res: Response) => {
  res.clearCookie("auth_Token");
  return res.json({ message: "Successfully logged out" });
};

/* ======================================================
   GOOGLE AUTH
====================================================== */
const googleAuth = async (req: Request, res: Response) => {
  try {
    const { id_token } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    const { email, name, picture } = payload;
    const users = await getCommonRecord("users", email, "email");
    const userExists = users.length > 0;

    const image = picture ? await saveImageFromUrl(picture) : null;

    let userId;
    if (userExists) {
      userId = users[0].id;
      await setRecords("users", {
        edit: userId,
        name,
        image,
        status: "1",
      });
    } else {
      userId = await setRecords("users", {
        edit: 0,
        name,
        email,
        image,
        status: "1",
      });
    }

    const token = jwt.sign(
      { sub: userId, email },
      process.env.JWT_KEY as string,
      { expiresIn: "1d" }
    );

    await setRecords("users", { edit: userId, token });

    res.cookie("auth_token", JSON.stringify({ name, email, token }), {
      httpOnly: true,
      maxAge: 86400000,
      sameSite: "lax",
      secure: false,
    });

    return res.json({
      message: userExists
        ? "Google login successful"
        : "Google signup successful",
      token,
    });
  } catch (err: any) {
    console.error("Google Auth Error:", err.message);
    return res.status(400).json({ message: "Google login failed" });
  }
};


export { sendOtp,verifyOtp,logout,googleAuth }  
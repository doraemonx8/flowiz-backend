import { type Request, type Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {setRecords,getCommonRecordsWhere } from "../models/commonModel";
import {
  createSubscription,
  cancelSubscriptionById,
  getCustomerPortalUrl,
} from "../models/lemonSqueezyModel";

const createSubscriptions = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { sub: userId, name, username } = (req as any).user;
    console.log(userId)
    const { planId } = req.body;
    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "Invalid Plan is required",
      });
    }

    const result = await createSubscription(userId, name, username, planId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Checkout creation failed",
      });
    }

    return res.status(200).json({
      success: true,
      checkoutUrl: result.checkout?.attributes?.url,
    });
  } catch (error: any) {
    console.error("Create subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message || error,
    });
  }
};

const cancelSubscription = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { id: subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: "Subscription ID is required",
      });
    }

    const result = await cancelSubscriptionById(subscriptionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Failed to cancel subscription",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
      data: result.data,
    });
  } catch (error: any) {
    console.error("Cancel subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: error.message || error,
    });
  }
};

const manageSubscription = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { customerId } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const result = await getCustomerPortalUrl(customerId as string);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error("Manage subscription error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred",
      error: error.message || error,
    });
  }
};



/**
 * LemonSqueezy Webhook Handler
 */
export const lemonWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const signature = req.headers["x-signature"] as string;
    const body = JSON.stringify(req.body);

    /* --------------------------------------------------
       LOG WEBHOOK
    -------------------------------------------------- */
    const logFilePath = path.join(process.cwd(), "webhook.txt");
    const logEntry = `[${new Date().toISOString()}] ${body}\n\n`;
    fs.appendFileSync(logFilePath, logEntry, "utf8");

    /* --------------------------------------------------
       VERIFY SIGNATURE
    -------------------------------------------------- */
    const expectedSignature = crypto
      .createHmac("sha256", process.env.LEMON_WEBHOOK_SECRET as string)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    const eventName = event?.meta?.event_name;

    /* --------------------------------------------------
       HANDLE EVENTS
    -------------------------------------------------- */
    switch (eventName) {
      case "subscription_created": {
        const subscriptionID = event.data?.id;
        const { user_id, plan_id, transaction_id } =
          event.meta?.custom_data || {};

        const prevSubscription = await getCommonRecordsWhere(
          "subscriptions",
          { userId: user_id, isCancelled: "0" },
          "createdOn DESC"
        );

        if (prevSubscription?.length) {
          await cancelSubscriptionById(
            prevSubscription[0].subscriptionID
          );
        }

        await setRecords("subscriptions", {
          edit: 0,
          userId: user_id,
          planId: plan_id,
          transactionId: transaction_id,
          subscriptionID,
        });
        break;
      }

      case "subscription_updated": {
        if (event.data?.attributes?.cancelled === true) break;

        const subscriptionID = event.data?.id;
        const { user_id, plan_id, transaction_id } =
          event.meta?.custom_data || {};

        const prevSubscription = await getCommonRecordsWhere(
          "subscriptions",
          { userId: user_id, isCancelled: "0" },
          "createdOn DESC"
        );

        if (
          prevSubscription?.length &&
          prevSubscription[0].subscriptionID !== subscriptionID
        ) {
          await setRecords("subscriptions", {
            edit: prevSubscription[0].id,
            isCancelled: "1",
          });

          await setRecords("subscriptions", {
            edit: 0,
            userId: user_id,
            planId: plan_id,
            transactionId: transaction_id,
            subscriptionID,
          });
        }
        break;
      }

      case "subscription_cancelled": {
        const subscriptionID = event.data?.id;
        const { user_id } = event.meta?.custom_data || {};

        const subscription = await getCommonRecordsWhere(
          "subscriptions",
          { userId: user_id, subscriptionID },
          "createdOn DESC"
        );

        if (subscription?.length) {
          await setRecords("subscriptions", {
            edit: subscription[0].id,
            isCancelled: "1",
          });
        }
        break;
      }

      case "order_created": {
        const orderId = event.data?.id;
        const invoiceURL = event.data?.attributes?.url?.receipt;
        const offerId = event.data?.attributes?.discount_total_usd;

        const { transaction_id } =
          event.meta?.custom_data || {};

        await setRecords("transactions", {
          edit: transaction_id,
          status: "1",
          orderId,
          invoiceURL,
          offerId,
        });
        break;
      }

      default:
        console.log("Unhandled webhook:", eventName);
        break;
    }

    return res.status(200).send("Webhook processed");
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return res.status(500).send("Webhook failed");
  }
};

export { createSubscriptions, cancelSubscription, manageSubscription };

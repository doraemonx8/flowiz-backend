import {
  type NewCustomer,
  lemonSqueezySetup,
  createCustomer,
  createCheckout,
  cancelSubscription,
  getCustomer,
} from "@lemonsqueezy/lemonsqueezy.js";

import { getRecordById, setRecords } from "../models/commonModel";
// import  User  from "../models/user";
// import  Plan  from "../models/plan";
// import  Transaction  from "../models/transaction";

/* ------------------------------------------------------------------ */
/* LemonSqueezy Setup */
/* ------------------------------------------------------------------ */

const LEMON_API_KEY = process.env.LEMON_API_KEY as string;
const LEMON_STORE_ID = Number(process.env.LEMON_STORE_ID);

if (!LEMON_API_KEY || !LEMON_STORE_ID) {
  console.error("❌ LemonSqueezy ENV not configured properly");
}

lemonSqueezySetup({
  apiKey: LEMON_API_KEY,
  onError: (error) => console.error("Lemon error:", error),
});

/* ------------------------------------------------------------------ */
/* CREATE CHECKOUT 
/* ------------------------------------------------------------------ */

const createCheckoutService = async (
  newCheckout: any,
  variantId: string
): Promise<any> => {
  try {
    const { error, data } = await createCheckout(
      LEMON_STORE_ID,
      variantId,
      newCheckout
    );

    if (error) {
      console.error("Checkout creation failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, checkout: data.data };
  } catch (err: any) {
    console.error("Unexpected error creating checkout:", err.message);
    return { success: false, error: err.message };
  }
};

/* ------------------------------------------------------------------ */
/* CREATE CUSTOMER */
/* ------------------------------------------------------------------ */

const createNewCustomer = async (
  name: string,
  email: string
): Promise<string | null> => {
  try {
    const newCustomer: NewCustomer = { name, email };

    const { error, data } = await createCustomer(LEMON_STORE_ID, newCustomer);

    if (error) {
      console.error("Customer creation failed:", error.message);
      return null;
    }

    return data.data.id;
  } catch (err: any) {
    console.error("Unexpected error creating customer:", err.message);
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* GET OR CREATE CUSTOMER ID */
/* ------------------------------------------------------------------ */

// const getCustomerId = async (
//   userId: number,
//   name: string,
//   email: string
// ): Promise<string | null> => {
//   const userData = await getRecordById(User,userId);

//   if (userData?.data?.customerId) {
//     return userData.data.customerId;
//   }

//   const customerId = await createNewCustomer(name, email);

//   if (customerId) {
//     await setRecords({ edit: userId, customerId }, User);
//   }

//   return customerId;
// };

const getCustomerId = async (
  userId: number,
  name: string,
  email: string
): Promise<string | null> => {
  // Pass "users" string instead of User model
  const userData = await getRecordById("users", userId);

  // Note: commonModel.ts returns the row directly, so it might just be userData?.customerId 
  if (userData?.customerId || userData?.data?.customerId) {
    return userData.customerId || userData.data.customerId;
  }

  const customerId = await createNewCustomer(name, email);

  if (customerId) {
    // Fix parameter order: table first, then data
    await setRecords("users", { edit: userId, customerId });
  }

  return customerId;
};

/* ------------------------------------------------------------------ */
/* CREATE SUBSCRIPTION 
/* ------------------------------------------------------------------ */

const createSubscription = async (
  userId: number,
  name: string,
  email: string,
  dto: any
): Promise<any> => {
  try {
    const planId = dto;
    // let planData = await getRecordById(Plan,planId);
    // planData = planData?.data;

    // if (!planData) {
    //   return { success: false, error: "Invalid plan" };
    // }

    // /* Create transaction */
    // const transactionId = await setRecords(
    //   {
    //     edit: 0,
    //     status: "2",
    //     userId,
    //     planId,
    //     total: planData.amount,
    //   },
    //   Transaction
    // );

    // --------------------------------------------------------
    console.log(planId)
    let planData = await getRecordById("plans", planId);
    planData = planData?.data || planData;
    console.log(planData)
    if (!planData) {
      return { success: false, error: "Invalid plan" };
    }

    /* Create transaction */
    // Fix parameter order: table string first, then payload object
    const transactionId = await setRecords(
      "transactions",
      {
        edit: 0,
        status: "2",
        userId,
        planId,
        total: planData.amount,
      }
    );

    // --------------------------------------------------------

    const variantId = planData.lemonId;

    await getCustomerId(userId, name, email);

    const newCheckout = {
      productOptions: {
        name: "Flowiz Checkout Test",
        description: "A new checkout test",
      },
      checkoutOptions: { embed: true },
      checkoutData: {
        email,
        name,
        billing_address: {
          country: "IN",
          zip: "121002",
        },
        custom: {
          userId: String(userId),
          planId: String(planId),
          transactionId: String(transactionId),
          planName: planData.name,
        },
      },
      preview: true,
    };

    return createCheckoutService(newCheckout, variantId);
  } catch (err: any) {
    console.error("Create subscription error:", err.message);
    return { success: false, error: err.message };
  }
};

/* ------------------------------------------------------------------ */
/* CANCEL SUBSCRIPTION */
/* ------------------------------------------------------------------ */

const cancelSubscriptionById = async (
  subscriptionId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const result = await cancelSubscription(subscriptionId);

    if (result.error) {
      console.error("Cancel failed:", result.error.message);
      return { success: false, error: result.error.message };
    }

    return { success: true, data: result.data?.data || result.data };
  } catch (err: any) {
    console.error("Unexpected cancel error:", err.message);
    return { success: false, error: err.message };
  }
};

/* ------------------------------------------------------------------ */
/* CUSTOMER PORTAL URL */
/* ------------------------------------------------------------------ */

const getCustomerPortalUrl = async (
  customerId: string
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const result = await getCustomer(customerId);

    if (result.error) {
      console.error("Customer not found:", result.error.message);
      return { success: false, error: result.error.message };
    }

    return {
      success: true,
      data: result.data.data.attributes.urls,
    };
  } catch (err: any) {
    console.error("Customer portal error:", err.message);
    return { success: false, error: err.message };
  }
};

export { createSubscription, cancelSubscriptionById, getCustomerPortalUrl };

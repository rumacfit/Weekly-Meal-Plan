// This file should be at: netlify/functions/create-subscription.js

// Load the Stripe library with our secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// This function runs when someone tries to subscribe
exports.handler = async (event, context) => {
  
  // Set up response headers (these tell the browser how to handle the response)
  const headers = {
    'Access-Control-Allow-Origin': '*', // Allow requests from any website
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle "preflight" requests (browser security check)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only accept POST requests (when form is submitted)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405, // Method not allowed
      headers,
      body: JSON.stringify({ error: 'Only POST requests allowed' }),
    };
  }

  try {
    // First, check if we have our Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('ERROR: Stripe secret key is missing from environment variables');
      return {
        statusCode: 500, // Server error
        headers,
        body: JSON.stringify({ 
          error: 'Payment system not configured properly' 
        }),
      };
    }

    // Check if we got any data from the form
    if (!event.body) {
      console.log('ERROR: No data received from subscription form');
      return {
        statusCode: 400, // Bad request
        headers,
        body: JSON.stringify({ error: 'No subscription data received' }),
      };
    }

    // Try to read the subscription information from the form
    let subscriptionData;
    try {
      subscriptionData = JSON.parse(event.body);
    } catch (error) {
      console.log('ERROR: Could not read subscription data:', error.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid subscription data format' }),
      };
    }

    // Get the information from the form
    const { 
      customer_email, 
      customer_name,
      payment_method_id
    } = subscriptionData;

    // Check that we have the required customer information
    if (!customer_email || !customer_name || !payment_method_id) {
      console.log('ERROR: Missing customer information or payment method');
      console.log('Email:', customer_email);
      console.log('Name:', customer_name);
      console.log('Payment Method ID:', payment_method_id);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Please provide email, name, and valid payment method' 
        }),
      };
    }

    console.log('Creating subscription for:', customer_email);

    // Step 1: Create or find customer
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: customer_email,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        console.log('Found existing customer:', customer.id);
      } else {
        customer = await stripe.customers.create({
          email: customer_email,
          name: customer_name,
          payment_method: payment_method_id,
          invoice_settings: {
            default_payment_method: payment_method_id,
          },
        });
        console.log('Created new customer:', customer.id);
      }
    } catch (error) {
      console.error('Error creating/finding customer:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to set up customer account',
          message: error.message 
        }),
      };
    }

    // Step 2: Create subscription with promotional pricing
    try {
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Weekly Meal Plan',
              description: 'Personalized weekly meal plans with nutrition coaching',
            },
            unit_amount: 2000, // Regular price: $20 AUD in cents
            recurring: {
              interval: 'week',
              interval_count: 1,
            },
          },
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        // Apply promotional discount for first 4 weeks
        discounts: [{
          coupon: await createPromotionalCoupon(), // We'll create this coupon
        }],
        metadata: {
          customer_email: customer_email,
          customer_name: customer_name,
          plan_type: 'weekly-meal-plan',
          promotional_period: 'first-4-weeks-50-percent-off'
        },
      });

      console.log('SUCCESS: Subscription created:', subscription.id);

      // Send back the subscription information to the website
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          subscription_id: subscription.id,
          client_secret: subscription.latest_invoice.payment_intent.client_secret,
          customer_id: customer.id,
        }),
      };

    } catch (error) {
      console.error('Error creating subscription:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to create subscription',
          message: error.message 
        }),
      };
    }

  } catch (error) {
    // If something goes wrong, log the error and send back an error message
    console.log('SUBSCRIPTION ERROR:', error.message);
    console.log('Error type:', error.type);
    
    // Handle different types of errors
    if (error.type && error.type.includes('Stripe')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Subscription processing error',
          message: error.message 
        }),
      };
    }
    
    // Generic error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Something went wrong with the subscription',
        message: error.message 
      }),
    };
  }
};

// Helper function to create promotional coupon
async function createPromotionalCoupon() {
  try {
    // Check if coupon already exists
    const existingCoupons = await stripe.coupons.list({ limit: 100 });
    const existingCoupon = existingCoupons.data.find(coupon => 
      coupon.id === 'FIRST_4_WEEKS_50_OFF'
    );
    
    if (existingCoupon) {
      return existingCoupon.id;
    }

    // Create new coupon if it doesn't exist
    const coupon = await stripe.coupons.create({
      id: 'FIRST_4_WEEKS_50_OFF',
      percent_off: 50,
      duration: 'repeating',
      duration_in_months: 1, // This will apply for about 4 weeks
      name: 'First 4 Weeks - 50% OFF',
      metadata: {
        description: 'Promotional discount for first 4 weeks of meal plan'
      }
    });
    
    console.log('Created promotional coupon:', coupon.id);
    return coupon.id;
  } catch (error) {
    console.error('Error with promotional coupon:', error);
    // Return null if coupon creation fails - subscription will proceed without discount
    return null;
  }
}
